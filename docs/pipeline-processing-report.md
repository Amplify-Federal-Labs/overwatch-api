# Pipeline Processing Report: Ingested Item Lifecycle

This document traces the complete lifecycle of an ingested item through the Overwatch intelligence pipeline, from raw content ingestion to a materialized signal visible in the UI.

## Pipeline Overview

```
                          CRON (hourly, 0 * * * *)
                          0:rss -> 1:sam_gov -> 2:contract_awards -> 3+:recovery
                                  |
                                  v
                     INGESTION_QUEUE (max_batch: 1)
                  +-------------------------------+
                  | ingestion-consumer             |
                  |                                |
                  | Per source type:               |
                  |  1. Fetch raw content           |
                  |  2. Dedup by source_link        |
                  |  3. Store ingested items        |
                  |  4. Produce ExtractionMessages  |
                  +-------------------------------+
                                  |
                                  v
                     EXTRACTION_QUEUE (max_batch: 5)
                  +-------------------------------+
                  | extraction-consumer            |
                  |                                |
                  | Per item:                      |
                  |  1. AI extract observations     |
                  |  2. Fetch source page           |
                  |  3. AI score relevance          |
                  |  4. Store relevance score       |
                  +-------------------------------+
                                  |
                          score >= threshold?
                         /                \
                       No                  Yes
                       |                    |
                    (stored          produce ResolutionMessages
                   for audit)        (1 per observation)
                                            |
                                            v
                     RESOLUTION_QUEUE (max_batch: 10)
                  +-------------------------------+
                  | resolution-consumer            |
                  +-------------------------------+
                           /              \
           produce                  produce
           SynthesisMessages        EnrichmentMessages
           (resolvedProfileIds)     (newProfileIds, enrichable only)
                         /                  \
                        v                    v
       SYNTHESIS_QUEUE          ENRICHMENT_QUEUE
       (max_batch: 5)           (max_batch: 1)
  +-------------------------+  +-------------------------+
  | synthesis-consumer      |  | enrichment-consumer     |
  +-------------------------+  +-------------------------+
                        |
         produce MaterializationMessages
         (per ingested item linked to profile)
                        |
                        v
       MATERIALIZATION_QUEUE (max_batch: 10)
         +-------------------------------+
         | materialization-consumer       |
         +-------------------------------+
                        |
                        v
                  signals table
                  (GET /signals)
```

## Architecture: Cloudflare Queues

The pipeline uses **Cloudflare Queues** for all inter-stage communication. Each stage is a queue consumer function with dependency-injected collaborators, wired in `src/queues/build-handlers.ts`.

**6 queues** (configured in `wrangler.jsonc`):

| Queue | Binding | max_batch_size | DLQ |
|-------|---------|---------------|-----|
| `overwatch-ingestion` | `INGESTION_QUEUE` | 1 | `overwatch-dlq` |
| `overwatch-extraction` | `EXTRACTION_QUEUE` | 5 | `overwatch-dlq` |
| `overwatch-resolution` | `RESOLUTION_QUEUE` | 10 | `overwatch-dlq` |
| `overwatch-synthesis` | `SYNTHESIS_QUEUE` | 5 | `overwatch-dlq` |
| `overwatch-enrichment` | `ENRICHMENT_QUEUE` | 1 | `overwatch-dlq` |
| `overwatch-materialization` | `MATERIALIZATION_QUEUE` | 10 | `overwatch-dlq` |

All queues have `max_retries: 3` with a dead-letter queue (`overwatch-dlq`).

**Message granularity**: 1 message = 1 unit of work. Messages are typed as a discriminated union on the `type` field (`src/queues/types.ts`):

```typescript
type QueueMessage =
  | IngestionMessage      // { type: "ingestion", source: SignalSourceType }
  | ExtractionMessage     // { type: "extraction", ingestedItemId: string }
  | ResolutionMessage     // { type: "resolution", observationId: number, entities: [...] }
  | SynthesisMessage      // { type: "synthesis", profileId: string }
  | EnrichmentMessage     // { type: "enrichment", profileId, entityType, canonicalName }
  | MaterializationMessage // { type: "materialization", ingestedItemId: string }
```

**Queue handler** (`src/index.ts`): The Worker's `queue()` export builds handlers once per batch via `buildQueueHandlers(env, logger)`, then routes each message through `routeQueueMessage()`. Successful messages are ack'd; failures are retried (up to 3 times, then DLQ).

**Queue router** (`src/queues/queue-router.ts`): Switches on `message.type` and dispatches to the appropriate handler function.

---

## Stage 1: Ingestion (Cron-Triggered → INGESTION_QUEUE)

**Trigger**: Cloudflare Workers cron fires hourly (`0 * * * *`). The scheduler (`src/cron/scheduler.ts`) maps fixed UTC hours to ingestion jobs:

| UTC Hour | Job     | Source           |
|----------|---------|------------------|
| 0 (midnight) | `rss`     | GovConWire, FedScoop RSS feeds |
| 1           | `sam_gov` | SAM.gov opportunities + APBI events |
| 2           | `contract_awards` | SAM.gov Contract Awards API (DoD contract awards) |
| 3+          | `recovery` | Pipeline recovery (see Recovery section) |

**Cron handler**: `runCronJob()` sends an `IngestionMessage` to `INGESTION_QUEUE`.

**Consumer**: `handleIngestion()` (`src/queues/ingestion-consumer.ts`)

**What happens**:

### 1a. Fetch raw content

The consumer dispatches to source-specific fetchers based on `source`:

| Source | Fetcher | Parser | Output |
|--------|---------|--------|--------|
| `rss` | `fetchRssFeed()` (`src/signals/rss/rss-fetcher.ts`) | `rssItemsToSignals()` (`src/signals/rss/rss-parser.ts`) | `SignalAnalysisInput[]` |
| `sam_gov` | `fetchSamGovOpportunities()` + `fetchApbiEvents()` (`src/signals/sam-gov/sam-gov-fetcher.ts`) | `opportunitiesToSignals()` (`src/signals/sam-gov/sam-gov-parser.ts`) | `SignalAnalysisInput[]` |
| `contract_awards` | `fetchContractAwards()` (`src/signals/contract-awards/contract-awards-fetcher.ts`) | `entriesToSignals()` (`src/signals/contract-awards/contract-awards-parser.ts`) | `SignalAnalysisInput[]` |

Each fetcher returns a `SignalAnalysisInput` with fields: `content`, `sourceType`, `sourceName`, `sourceUrl`, `sourceLink`, and optional `sourceMetadata`.

### 1b. Store as ingested item

For each `SignalAnalysisInput`, the `ObservationRepository` (`src/db/observation-repository.ts`) inserts a row into the `ingested_items` table:

```
ingested_items
├── id                  (UUID, primary key)
├── source_type         ("rss" | "sam_gov" | "contract_awards")
├── source_name         ("GovConWire", "SAM.gov", etc.)
├── source_url          (original URL)
├── source_link         (unique, used for deduplication)
├── content             (full text content)
├── source_metadata     (JSON, source-specific fields)
├── relevance_score     (INTEGER 0-100, set after AI scoring)
├── relevance_rationale (TEXT, AI explanation)
├── competency_codes    (JSON array of "A"-"F")
└── created_at          (ISO 8601 timestamp)
```

**Deduplication**: If `source_link` already exists in the table, the item is skipped (returns `null`).

### 1c. Produce ExtractionMessages

For each newly stored item, the consumer sends an `ExtractionMessage` to `EXTRACTION_QUEUE` with the `ingestedItemId`.

---

## Stage 2: Extraction (EXTRACTION_QUEUE)

**Consumer**: `handleExtraction()` (`src/queues/extraction-consumer.ts`)

**What happens per item**:

### 2a. AI observation extraction

The `ObservationExtractor` (`src/agents/observation-extractor.ts`) calls Cloudflare Workers AI to extract typed observations.

**AI model**: Configured via `CF_AIG_MODEL` env var, accessed through OpenAI-compatible client at `CF_AIG_BASEURL`.

**Prompt**: The AI is given the raw content and asked to extract structured observations, each with:
- **type**: `contract_award`, `personnel_move`, `budget_signal`, `technology_adoption`, `solicitation`, `policy_change`, `partnership`, or `program_milestone`
- **summary**: One-sentence factual description
- **entities**: Array of `{ type, name, role }` where type is `person|agency|program|company|technology|contract_vehicle` and role is `subject|object|mentioned`
- **attributes**: Key-value pairs (dollar amounts, contract numbers, NAICS codes, etc.)
- **sourceDate**: `YYYY-MM-DD` if known

### 2b. Store observations + entity mentions

The repository inserts into two tables:

```
observations
├── id              (auto-increment)
├── signal_id       (FK -> ingested_items.id)
├── type            (observation type)
├── summary         (one-sentence description)
├── attributes      (JSON, structured details)
├── source_date     (date from source, if known)
└── created_at

observation_entities
├── id              (auto-increment)
├── observation_id  (FK -> observations.id)
├── role            ("subject" | "object" | "mentioned")
├── entity_type     ("person" | "agency" | "company" | etc.)
├── raw_name        (name as mentioned in source)
├── entity_profile_id (FK -> entity_profiles.id, NULL until resolved)
└── resolved_at     (NULL until resolved)
```

### 2c. Fetch full source page (best-effort)

If the item has a `sourceLink`, the `PageFetcher` (`src/enrichment/page-fetcher.ts`) fetches the full page content. This enriches the relevance scorer with more context than just the RSS summary or SAM.gov snippet.

- If `sourceLink` is null, or the fetch fails (e.g., `.mil`/`.gov` bot blocking), scoring proceeds with just the ingested content + observations.
- The fetched page text is concatenated: `content + "\n\n--- Full source page ---\n" + pageText`

### 2d. AI relevance scoring (Early Gate — ADR-004)

The `SignalRelevanceScorer` (`src/agents/signal-relevance-scorer.ts`) scores each item's relevance to Amplify Federal. This is the **early relevance gate** — items scoring below the threshold are excluded from all downstream processing.

**Input** (built by `buildEarlyRelevanceInput()` in `src/agents/relevance-gate.ts`):
- Enriched content (ingested content + fetched page text when available)
- Observation summaries with entity mentions
- `entityContext: []` (entity profiles not yet resolved at this stage)

**Output**:
- **relevanceScore**: 0–100 (Critical/High/Moderate/Low/Irrelevant)
- **rationale**: 1-2 sentence explanation
- **competencyCodes**: Array of `A`–`F` mapping to Amplify's competency clusters

### 2e. Persist relevance score

The score, rationale, and competency codes are stored on the `ingested_items` row via `ObservationRepository.updateRelevanceScore()`.

### 2f. Relevance gate decision + produce ResolutionMessages

`applyThreshold(score, threshold)` determines if the item passes. The threshold is configurable via `RELEVANCE_THRESHOLD` env var (default: `60`).

**Decision logic**:
- `score >= threshold` → Item passes gate. For each observation with entities, the consumer sends a `ResolutionMessage` to `RESOLUTION_QUEUE` containing the `observationId` and its entity mentions.
- `score < threshold` → Item stops here. Stored with score for audit, but excluded from entity resolution, synthesis, enrichment, and materialization.

```
Low-relevance items (< 60%):     Stored in ingested_items + observations tables. Queryable for audit.
                                   No entity resolution, synthesis, enrichment, or materialization.

High-relevance items (≥ 60%):     Full pipeline: entity resolution → synthesis → enrichment → materialization.
```

---

## Stage 3: Entity Resolution (RESOLUTION_QUEUE)

**Consumer**: `handleResolution()` (`src/queues/resolution-consumer.ts`)

**Pure logic**: `EntityResolver` (`src/agents/entity-resolver.ts`)

**Repository**: `EntityProfileRepository` (`src/db/entity-profile-repository.ts`)

**Input**: A single `ResolutionMessage` containing one `observationId` and its entity mentions.

**What happens**:

### 3a. Resolve each entity group

For each entity in the message, the resolver attempts to match against existing `entity_profiles` + `entity_aliases`:

1. **Exact alias match** — Check if any existing profile has this name as an alias
2. **AI fuzzy match** — If no exact match, call `entity-match-ai` (`src/agents/entity-match-ai.ts`) via Workers AI to determine if the name is a variant of an existing profile (e.g., "BAH" → "Booz Allen Hamilton")
3. **Create new profile** — If no match found, create a new `entity_profiles` row with the raw name as `canonical_name`

```
entity_profiles
├── id                  (UUID)
├── type                ("person" | "agency" | "company" | etc.)
├── canonical_name      (resolved canonical name)
├── first_seen_at
├── last_seen_at
├── observation_count   (updated on resolution)
├── summary             (NULL until synthesis)
├── trajectory          (NULL until synthesis)
├── relevance_score     (NULL until synthesis)
├── last_synthesized_at (NULL until synthesis)
├── dossier             (JSON, NULL until enrichment)
├── enrichment_status   ("pending" | "enriched" | "failed" | "skipped")
├── last_enriched_at
└── created_at

entity_aliases
├── id
├── entity_profile_id   (FK -> entity_profiles.id)
├── alias               (alternate name)
├── source              ("auto" | "ai_fuzzy" | "manual")
└── created_at
```

After resolution, `observation_entities.entity_profile_id` and `resolved_at` are set.

### 3b. Fan-out to downstream queues

The consumer produces messages for two parallel downstream stages:

- **All resolved profiles** → `SynthesisMessage` to `SYNTHESIS_QUEUE` (one message per resolved profile ID)
- **New profiles only (enrichable types)** → `EnrichmentMessage` to `ENRICHMENT_QUEUE` (one message per new profile, only for `person`, `agency`, `company` types)

Both are sent as individual queue messages and processed independently (parallel).

---

## Stage 4a: Profile Synthesis (SYNTHESIS_QUEUE, parallel with Enrichment)

**Consumer**: `handleSynthesis()` (`src/queues/synthesis-consumer.ts`)

**Pure logic**: `ProfileSynthesizer` (`src/agents/profile-synthesizer.ts`)

**Repository**: `SynthesisRepository` (`src/db/synthesis-repository.ts`)

**Input**: A single `SynthesisMessage` containing one `profileId`.

**What happens**:

### 4a.1. Gather observations for profile

Queries all observations where this profile's ID appears in `observation_entities.entity_profile_id`.

### 4a.2. Build context and synthesize

`buildSynthesisContext()` constructs a text prompt listing the entity name, type, and all observations with their types, summaries, attributes, entities, and dates.

The `ProfileSynthesizer` sends this to Workers AI, which returns:
- **summary**: 2-3 sentence overview of the entity
- **trajectory**: 1-2 sentence assessment of recent direction
- **relevanceScore**: 0-100 integer (how relevant to Amplify Federal)
- **insights**: Array of `{ type, content }` where type is `competitor_assessment`, `stakeholder_briefing`, `agency_landscape`, or `opportunity_alert`

### 4a.3. Update profile and store insights

Updates `entity_profiles` with `summary`, `trajectory`, `relevance_score`, `last_synthesized_at`.

Inserts insights into the `insights` table:

```
insights
├── id
├── entity_profile_id   (FK -> entity_profiles.id)
├── type                ("competitor_assessment" | "stakeholder_briefing" | etc.)
├── content             (actionable insight paragraph)
├── observation_window  ("2026-01-15/2026-03-01")
├── observation_count
└── created_at
```

### 4a.4. Produce MaterializationMessages

After synthesis, the consumer finds all `ingested_item_id`s linked to the synthesized profile and sends a `MaterializationMessage` to `MATERIALIZATION_QUEUE` for each one.

---

## Stage 4b: Entity Enrichment (ENRICHMENT_QUEUE, parallel with Synthesis)

**Consumer**: `handleEnrichment()` (`src/queues/enrichment-consumer.ts`)

**Input**: A single `EnrichmentMessage` containing `profileId`, `entityType`, and `canonicalName`.

**What happens**:

### 4b.1. Load enrichment context

`EnrichmentRepository.findContextForProfile()` queries co-occurring entities from shared observations, providing context for more targeted searches (e.g., `"Michael T. Geegan" "Department of the Army"` instead of generic `Michael T. Geegan defense government official`).

### 4b.2. Search for information

`BraveSearcher` (`src/enrichment/brave-searcher.ts`) queries the Brave Search API with context-aware queries and site filters:
- **Persons**: `site:linkedin.com`, `site:mil.gov`, `site:defense.gov`
- **Agencies**: `site:mil.gov`, `site:defense.gov`, `site:gov`

### 4b.3. Fetch and extract pages

`PageFetcher` (`src/enrichment/page-fetcher.ts`) retrieves full page text from top search results.

### 4b.4. AI dossier extraction

`DossierExtractor` (`src/enrichment/dossier-extractor.ts`) sends page content to Workers AI to extract a structured `Dossier` object.

**Dossier types** (discriminated union on `kind`):
- `PersonDossier` — title, org, branch, programs, rank, education, careerHistory, focusAreas, decorations
- `AgencyDossier` — mission, branch, programs, parentOrg, leadership, focusAreas
- `CompanyDossier` — description, coreCapabilities, keyContracts, keyCustomers, leadership, headquarters

### 4b.5. Store enrichment results

Updates `entity_profiles.dossier` (JSON), sets `enrichment_status = 'enriched'`, updates `last_enriched_at`.

**Outcome tracking**: The consumer returns one of three outcomes:
- `"enriched"` — dossier extracted and saved
- `"skipped"` — no search results or no pages fetched
- `"failed"` — AI extraction returned null or an error occurred

Enrichment does NOT chain to any downstream stage.

---

## Stage 5: Signal Materialization (MATERIALIZATION_QUEUE, terminal)

**Consumer**: `handleMaterialization()` (`src/queues/materialization-consumer.ts`)

**Pure logic**: `materializeSignal()` (`src/agents/signal-materializer.ts`)

**Repository**: `SignalRepository` (`src/db/signal-repository.ts`)

**Input**: A single `MaterializationMessage` containing one `ingestedItemId`.

**What happens**:

### 5a. Load item with observations

Loads the ingested item and its observations from the database. If not found, returns early.

### 5b. Relevance scoring (stored score or legacy fallback)

The materializer uses a two-tier relevance strategy via `getRelevanceOverride()`:

**Tier 1 — Stored ingestion-time score (normal path)**: Items ingested after ADR-004 have `relevance_score`, `relevance_rationale`, and `competency_codes` stored on the `ingested_items` row. The materializer reads these directly — **no AI call required**.

**Tier 2 — Legacy fallback**: Items with `relevance_score IS NULL` (ingested before ADR-004) use entity relevance scores from `entity_profiles` as a fallback via `findRelevanceScores()`.

### 5c. Materialize signal

The pure function `materializeSignal()` transforms an `IngestedItemWithObservations` into a `MaterializedSignal` by:

1. **title**: First observation's summary (or truncated content)
2. **type**: Derived from primary observation type (`contract_award` → `opportunity`, `budget_signal` → `strategy`, `partnership` → `competitor`)
3. **branch**: First agency entity's name
4. **relevance**: From relevance override (stored score or entity scores)
5. **relevanceRationale**: From relevance override
6. **tags**: Unique technology entity names
7. **vendors**: Companies with `subject` role
8. **competitors**: Companies with non-`subject` role
9. **stakeholders**: Person entity profile IDs and names (deduplicated)
10. **entities**: All entity mentions with confidence (1.0 if resolved, 0.5 if not)
11. **competencies**: Competency codes from relevance override

### 5d. Upsert to signals table

```
signals
├── id                  (same as ingested_items.id)
├── ingested_item_id    (FK -> ingested_items.id)
├── title
├── summary             (full content)
├── date                (from observation or ingestion)
├── branch              (agency name)
├── source              (source name)
├── type                ("opportunity" | "strategy" | "competitor")
├── relevance           (0-100)
├── relevance_rationale
├── tags                (JSON array)
├── competencies        (JSON array of "A"-"F")
├── play
├── competitors         (JSON array)
├── vendors             (JSON array)
├── stakeholder_ids     (JSON array of profile UUIDs)
├── entities            (JSON array of {type, value, confidence})
├── source_url
├── source_metadata     (JSON)
├── created_at
└── updated_at
```

This is the terminal stage — no further chaining.

---

## Recovery & On-Demand (Cron hour 3+, POST /cron/:jobName)

**Trigger**: Cron hours outside the ingestion window (3-23 UTC) run the recovery job. Any job can also be triggered on-demand via `POST /cron/:jobName`.

**Recovery flow** (`src/cron/run-recovery.ts`):

1. `RecoveryRepository.getPipelineStatus()` counts pending work at each stage:
   - Unresolved entity count (observation_entities with null profile)
   - Unsynthesized profile count (profiles with observations but no synthesis)
   - Pending enrichment count (enrichable profiles with pending status)
   - Unmaterialized item count (items with observations but no signal)

2. `diagnoseStuckStages(status)` identifies stages with pending work

3. For each stuck stage, dispatches recovery via queue messages:
   - `entity_resolution` → Queries unresolved `observation_entities`, groups by `observation_id`, sends `ResolutionMessage` per observation to `RESOLUTION_QUEUE`
   - `synthesis` → `dispatchOnDemandJob("synthesis")` — queries `findUnsynthesizedProfileIds()`, sends `SynthesisMessage` per profile to `SYNTHESIS_QUEUE`
   - `enrichment` → `dispatchOnDemandJob("enrichment")` — queries `findPendingEnrichmentProfiles()`, sends `EnrichmentMessage` per profile to `ENRICHMENT_QUEUE`
   - `signal_materialization` → `dispatchOnDemandJob("signal_materialization")` — queries `findUnmaterializedItemIds()`, sends `MaterializationMessage` per item to `MATERIALIZATION_QUEUE`

**On-demand jobs** (`POST /cron/:jobName`):
- Ingestion jobs (`rss`, `sam_gov`, `contract_awards`) → send `IngestionMessage` to `INGESTION_QUEUE`
- `synthesis`, `enrichment`, `signal_materialization` → `dispatchOnDemandJob()` scans DB for pending work and produces individual queue messages
- `entity_resolution` → Cannot be triggered on-demand (throws error — requires observation-level data that can't be reconstructed from a DB scan; use recovery instead)

---

## Data Flow Summary

```
External Source (RSS/SAM.gov Opportunities/SAM.gov Contract Awards)
    |
    v
INGESTION_QUEUE
    |
    v
ingestion-consumer: fetch → dedup → store → produce ExtractionMessages
    |
    v
EXTRACTION_QUEUE
    |
    v
extraction-consumer: AI extract observations → fetch page → AI score relevance → store score
    |
    v
score >= RELEVANCE_THRESHOLD (default: 60)?
    |                               |
   No                              Yes
    |                               |
  (stop)                            v
                          produce ResolutionMessages (1 per observation)
                                    |
                                    v
                          RESOLUTION_QUEUE
                                    |
                                    v
                          resolution-consumer: resolve entities → fan-out
                                    |
                                    +---> SYNTHESIS_QUEUE (1 msg per resolved profile)
                                    |         |
                                    |         v
                                    |     synthesis-consumer: AI synthesize → store insights
                                    |         |
                                    |         v
                                    |     produce MaterializationMessages (per linked ingested item)
                                    |         |
                                    |         v
                                    |     MATERIALIZATION_QUEUE
                                    |         |
                                    |         v
                                    |     materialization-consumer: materializeSignal() → upsert
                                    |         |
                                    |         v
                                    |     signals table (GET /signals)
                                    |
                                    +---> ENRICHMENT_QUEUE (1 msg per new enrichable profile)
                                              |
                                              v
                                          enrichment-consumer: search → fetch → AI dossier → store
                                              |
                                              v
                                          entity_profiles.dossier (enriched data)
```

## Queue Configuration & Batch Sizes

| Queue | max_batch_size | max_retries | DLQ | Rationale |
|-------|---------------|-------------|-----|-----------|
| Ingestion | 1 | 3 | `overwatch-dlq` | Each source fetch is heavy (multiple API pages) |
| Extraction | 5 | 3 | `overwatch-dlq` | AI calls are moderate; batching reduces cold starts |
| Resolution | 10 | 3 | `overwatch-dlq` | Resolution is fast (DB lookups + occasional AI fuzzy match) |
| Synthesis | 5 | 3 | `overwatch-dlq` | AI synthesis is moderate weight |
| Enrichment | 1 | 3 | `overwatch-dlq` | External HTTP (Brave Search + page fetches) is slow/flaky |
| Materialization | 10 | 3 | `overwatch-dlq` | Pure function + DB upsert, very fast |

## Other Limits

| Component | Constant | Value | Location | Notes |
|-----------|----------|-------|----------|-------|
| **SAM.gov fetcher** | `PAGE_LIMIT` | 100 | `src/signals/sam-gov/sam-gov-fetcher.ts` | Items per API page |
| **SAM.gov fetcher** | `MAX_PAGES` | 2 | `src/signals/sam-gov/sam-gov-fetcher.ts` | Max pages per fetch (200 items max) |
| **Contract Awards fetcher** | `MAX_PAGES` | 5 | `src/signals/contract-awards/contract-awards-fetcher.ts` | Max API pages (offset-based pagination) |
| **RSS fetcher** | — | unbounded | `src/signals/rss/rss-fetcher.ts` | Fetches all items from each feed (currently 2 feeds) |
| **Source page fetch** | `DEFAULT_MAX_LENGTH` | 5,000 chars | `src/enrichment/page-fetcher.ts` | Max extracted text per source page |
| **Relevance threshold** | `RELEVANCE_THRESHOLD` | 60 | `wrangler.jsonc` (env var) | Items below this score are excluded from downstream processing |
| **Brave Search** | `count` param | 20 | `src/enrichment/brave-searcher.ts` | Raw results fetched per query (filtered by blocked domains) |
| **Brave Search** | `DEFAULT_MAX_RESULTS` | 5 | `src/enrichment/brave-searcher.ts` | Max results returned after filtering |
| **Page Fetcher** | `DEFAULT_MAX_LENGTH` | 5,000 chars | `src/enrichment/page-fetcher.ts` | Max extracted text per page (enrichment) |

## AI Calls Per Ingested Item

Each ingested item triggers a variable number of AI calls depending on whether it passes the relevance gate:

### Items below relevance threshold (< 60%): 2 AI calls, then stop

| Stage | AI Call | Model | Purpose |
|-------|---------|-------|---------|
| 2a | `ObservationExtractor.extract()` | Workers AI | Extract typed observations + entities from raw content |
| 2d | `SignalRelevanceScorer.score()` | Workers AI | Score relevance to Amplify (early gate) |

Plus 1 optional HTTP fetch (source page via PageFetcher).

### Items above relevance threshold (≥ 60%): 2 + N AI calls

| Stage | AI Call | Model | Purpose |
|-------|---------|-------|---------|
| 2a | `ObservationExtractor.extract()` | Workers AI | Extract typed observations + entities from raw content |
| 2d | `SignalRelevanceScorer.score()` | Workers AI | Score relevance to Amplify (early gate) |
| 3a | `entity-match-ai` (per unresolved group) | Workers AI | Fuzzy match entity names to existing profiles |
| 4a.2 | `ProfileSynthesizer.synthesize()` (per profile) | Workers AI | Generate summary, trajectory, relevance, insights |
| 5b | — (stored score used) | — | **No AI call** — materializer trusts ingestion-time score |

**Legacy items** (ingested before ADR-004, `relevance_score IS NULL`): Stage 5b falls back to entity relevance scores from `entity_profiles`.

Entity enrichment (Stage 4b) adds additional AI calls per new profile but is independent of the main pipeline.

## Message Flow Mechanism

All inter-stage communication uses Cloudflare Queues. Each consumer function:

1. Receives a typed message (discriminated union on `type` field)
2. Processes the work (AI calls, DB operations)
3. Produces downstream messages by calling `env.<QUEUE_NAME>.send(msg)`
4. Returns a result (ack'd by the queue handler in `index.ts`)

**Error handling**: If a consumer throws, the queue handler catches the error, logs it, and calls `msg.retry()`. After `max_retries` (3), the message is moved to the dead-letter queue (`overwatch-dlq`).

**Dependency injection**: All consumers accept a `deps` object with interfaces for repositories, AI clients, queues, and loggers. Concrete implementations are wired in `buildQueueHandlers()` (`src/queues/build-handlers.ts`). This enables unit testing with mocks — no Workers runtime required.

## Relevance Gate Decision Logic

The early relevance gate (ADR-004) is the key decision point in the pipeline. Here is the complete decision flow:

```
Item ingested (Stage 1)
    |
    v
Observations extracted (AI, Stage 2a)
    |
    v
Source page fetched (best-effort, may be null, Stage 2c)
    |
    v
Relevance scored (AI, using content + page + observations, Stage 2d)
    |
    v
Score stored on ingested_items row (Stage 2e)
    |
    v
score >= RELEVANCE_THRESHOLD?
    |
    +--- Yes ---> Produce ResolutionMessages to RESOLUTION_QUEUE
    |             (full pipeline: resolve → synthesize → enrich → materialize)
    |
    +--- No  ---> Stop. Item stored for audit.
                  No entity resolution, synthesis, enrichment, or materialization.
                  Not visible in GET /signals.
                  Queryable via DB for threshold tuning.
```

**Threshold tuning**: The threshold is configurable via `RELEVANCE_THRESHOLD` env var. All items are stored with their scores regardless of threshold, so lowering the threshold later can surface previously-excluded items by re-running materialization.

**Materializer threshold filter**: `findUnmaterializedItems()` also applies the threshold filter (`relevance_score IS NULL OR relevance_score >= threshold`), providing a second safety net. Items that somehow bypassed the gate (or were ingested before ADR-004) are still filtered at materialization.
