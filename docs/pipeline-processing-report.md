# Pipeline Processing Report: Ingested Item Lifecycle

This document traces the complete lifecycle of an ingested item through the Overwatch intelligence pipeline, from raw content ingestion to a materialized signal visible in the UI.

## Pipeline Overview

```
                          CRON (daily, fixed hours 0-2 UTC)
                          0:rss -> 1:sam_gov -> 2:fpds
                                  |
                                  v
                  +-------------------------------+
                  | ObservationExtractorAgent      |
                  | (Cloudflare Durable Object)    |
                  |                                |
                  | Per item:                      |
                  |  1. Store ingested item        |
                  |  2. AI extract observations    |
                  |  3. Fetch source page          |
                  |  4. AI score relevance         |
                  |  5. Store relevance score      |
                  +-------------------------------+
                                  |
                          score >= threshold?
                         /                \
                       No                  Yes
                       |                    |
                    (stored               queue()
                   for audit)               |
                                            v
                  +-------------------------------+
                  | EntityResolverAgent            |
                  | (Cloudflare Durable Object)    |
                  +-------------------------------+
                           /              \
                  queue()              queue()
                  (resolvedProfileIds)     (newProfileIds)
                         /                  \
                        v                    v
         +-------------------------+  +-------------------------+
         | SynthesisAgent          |  | EnrichmentAgent         |
         | (Cloudflare Durable Obj)|  | (Cloudflare Durable Obj)|
         +-------------------------+  +-------------------------+
                        |
                queue()
                        |
                        v
         +-------------------------------+
         | SignalMaterializerAgent        |
         | (Cloudflare Durable Object)   |
         +-------------------------------+
                        |
                        v
                  signals table
                  (GET /signals)
```

## Stage 1: Ingestion + Early Relevance Gate (Cron-Triggered)

**Trigger**: Cloudflare Workers cron fires once daily per source (`0 0-2 * * *`). The scheduler (`src/cron/scheduler.ts`) maps fixed UTC hours to ingestion jobs:

| UTC Hour | Job     | Source           |
|----------|---------|------------------|
| 0 (midnight) | `rss`     | GovConWire, FedScoop RSS feeds |
| 1           | `sam_gov` | SAM.gov opportunities + APBI events |
| 2           | `fpds`    | FPDS.gov ATOM feed (DoD contract awards) |

**Agent**: `ObservationExtractorAgent` (`src/agents/observation-extractor-agent.ts`)

**What happens per item** (implemented in `processItem()`):

### 1a. Fetch raw content

The agent dispatches to source-specific fetchers based on `sourceType`:

| Source | Fetcher | Parser | Output |
|--------|---------|--------|--------|
| `rss` | `fetchRssFeed()` (`src/signals/rss/rss-fetcher.ts`) | `rssItemsToSignals()` (`src/signals/rss/rss-parser.ts`) | `SignalAnalysisInput[]` |
| `sam_gov` | `fetchSamGovOpportunities()` + `fetchApbiEvents()` (`src/signals/sam-gov/sam-gov-fetcher.ts`) | `opportunitiesToSignals()` (`src/signals/sam-gov/sam-gov-parser.ts`) | `SignalAnalysisInput[]` |
| `fpds` | `fetchFpdsContracts()` (`src/signals/fpds/fpds-contracts-fetcher.ts`) | `entriesToSignals()` (`src/signals/fpds/fpds-contracts-parser.ts`) | `SignalAnalysisInput[]` |

Each fetcher returns a `SignalAnalysisInput` with fields: `content`, `sourceType`, `sourceName`, `sourceUrl`, `sourceLink`, and optional `sourceMetadata`.

### 1b. Store as ingested item

For each `SignalAnalysisInput`, the `ObservationRepository` (`src/db/observation-repository.ts`) inserts a row into the `ingested_items` table:

```
ingested_items
├── id                  (UUID, primary key)
├── source_type         ("rss" | "sam_gov" | "fpds")
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

### 1c. AI observation extraction

For each newly stored item, the `ObservationExtractor` (`src/agents/observation-extractor.ts`) calls Cloudflare Workers AI to extract typed observations.

**AI model**: Configured via `CF_AIG_MODEL` env var, accessed through OpenAI-compatible client at `CF_AIG_BASEURL`.

**Prompt**: The AI is given the raw content and asked to extract structured observations, each with:
- **type**: `contract_award`, `personnel_move`, `budget_signal`, `technology_adoption`, `solicitation`, `policy_change`, `partnership`, or `program_milestone`
- **summary**: One-sentence factual description
- **entities**: Array of `{ type, name, role }` where type is `person|agency|program|company|technology|contract_vehicle` and role is `subject|object|mentioned`
- **attributes**: Key-value pairs (dollar amounts, contract numbers, NAICS codes, etc.)
- **sourceDate**: `YYYY-MM-DD` if known

### 1d. Store observations + entity mentions

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

### 1e. Fetch full source page (best-effort)

If the item has a `sourceLink`, the `PageFetcher` (`src/enrichment/page-fetcher.ts`) fetches the full page content. This enriches the relevance scorer with more context than just the RSS summary or SAM.gov snippet.

- If `sourceLink` is null, or the fetch fails (e.g., `.mil`/`.gov` bot blocking), scoring proceeds with just the ingested content + observations.
- The fetched page text is concatenated: `content + "\n\n--- Full source page ---\n" + pageText`

### 1f. AI relevance scoring (Early Gate — ADR-004)

The `SignalRelevanceScorer` (`src/agents/signal-relevance-scorer.ts`) scores each item's relevance to Amplify Federal. This is the **early relevance gate** — items scoring below the threshold are excluded from all downstream processing.

**Input** (built by `buildEarlyRelevanceInput()` in `src/agents/relevance-gate.ts`):
- Enriched content (ingested content + fetched page text when available)
- Observation summaries with entity mentions
- `entityContext: []` (entity profiles not yet resolved at this stage)

**Output**:
- **relevanceScore**: 0–100 (Critical/High/Moderate/Low/Irrelevant)
- **rationale**: 1-2 sentence explanation
- **competencyCodes**: Array of `A`–`F` mapping to Amplify's competency clusters

### 1g. Persist relevance score

The score, rationale, and competency codes are stored on the `ingested_items` row via `ObservationRepository.updateRelevanceScore()`.

### 1h. Relevance gate decision

`applyThreshold(score, threshold)` determines if the item passes. The threshold is configurable via `RELEVANCE_THRESHOLD` env var (default: `60`).

**Decision logic**:
- `score >= threshold` → Item passes gate, downstream processing proceeds
- `score < threshold` → Item stops here. Stored with score for audit, but excluded from entity resolution, synthesis, enrichment, and materialization.

### 1i. Chain to next stage (conditional)

**Only if `itemsAboveThreshold > 0`** in the batch, the agent calls `resolver.queue("runResolution", {})` on the EntityResolverAgent. If all items in the batch scored below threshold, no downstream work is triggered.

```
Low-relevance items (< 60%):     Stored in ingested_items + observations tables. Queryable for audit.
                                   No entity resolution, synthesis, enrichment, or materialization.

High-relevance items (≥ 60%):     Full pipeline: entity resolution → synthesis → enrichment → materialization.
```

---

## Stage 2: Entity Resolution (Task-Chained)

**Agent**: `EntityResolverAgent` (`src/agents/entity-resolver-agent.ts`)

**Pure logic**: `EntityResolver` (`src/agents/entity-resolver.ts`)

**Repository**: `EntityProfileRepository` (`src/db/entity-profile-repository.ts`)

**What happens**:

### 2a. Find unresolved entities

Queries `observation_entities` where `entity_profile_id IS NULL` and `resolved_at IS NULL`.

### 2b. Group by normalized name

`groupUnresolvedByName()` clusters unresolved entities by lowercased name. Each group has a `mostCommonRawName`, `entityType`, and list of entity IDs.

### 2c. Resolve each group

For each name group, the resolver attempts to match against existing `entity_profiles` + `entity_aliases`:

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

### 2d. Chain to next stages

If entities were resolved or new profiles created:
- **All resolved profiles**: `synthesis.queue("synthesizeProfiles", resolvedProfileIds)` — passes all profile IDs that had entities resolved (both new and existing)
- **New profiles only**: `enrichment.queue("enrichProfiles", newProfileIds)` — passes only newly created profile IDs for enrichment

Both are enqueued as fire-and-forget tasks and run independently (parallel).

---

## Stage 3a: Profile Synthesis (Task-Chained, parallel with Enrichment)

**Agent**: `SynthesisAgent` (`src/agents/synthesis-agent.ts`)

**Pure logic**: `ProfileSynthesizer` (`src/agents/profile-synthesizer.ts`)

**Repository**: `SynthesisRepository` (`src/db/synthesis-repository.ts`)

**What happens**:

### 3a.1. Receive profile IDs (or self-query)

The SynthesisAgent receives profile IDs via `queue("synthesizeProfiles", profileIds)`.

**Self-query pattern (ADR-004)**: When called with an empty array (recovery or on-demand), the agent queries `SynthesisRepository.findUnsynthesizedProfileIds()` to find profiles where `last_synthesized_at IS NULL AND observation_count > 0`. This avoids callers needing to pass unbounded ID arrays.

Processing is batched to 25 profiles per run.

### 3a.2. Gather observations per profile

For each profile, queries all observations where this profile's ID appears in `observation_entities.entity_profile_id`.

### 3a.3. Build context and synthesize

`buildSynthesisContext()` constructs a text prompt listing the entity name, type, and all observations with their types, summaries, attributes, entities, and dates.

The `ProfileSynthesizer` sends this to Workers AI, which returns:
- **summary**: 2-3 sentence overview of the entity
- **trajectory**: 1-2 sentence assessment of recent direction
- **relevanceScore**: 0-100 integer (how relevant to Amplify Federal)
- **insights**: Array of `{ type, content }` where type is `competitor_assessment`, `stakeholder_briefing`, `agency_landscape`, or `opportunity_alert`

### 3a.4. Update profile and store insights

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

### 3a.5. Self-scheduling and chaining

If more than 25 profile IDs were queued, the agent processes the first 25, then calls `this.queue("synthesizeProfiles", remainingIds)` with the remaining IDs. Self-scheduling only continues if the current batch made progress (processed > 0).

If profiles were processed: `materializer.queue("materializeNew", {})`.

---

## Stage 3b: Entity Enrichment (Task-Chained, parallel with Synthesis)

**Agent**: `EnrichmentAgent` (`src/agents/enrichment-agent.ts`)

**Pure logic**: `EntityEnricher` (`src/enrichment/entity-enricher.ts`)

**What happens**:

### 3b.1. Receive profile IDs (or self-query)

The EnrichmentAgent receives profile IDs via `queue("enrichProfiles", profileIds)`.

**Self-query pattern (ADR-004)**: When called with an empty array (recovery or on-demand), the agent queries `EnrichmentRepository.findPendingProfileIds()` to find profiles where `enrichment_status = 'pending' AND type IN ('person', 'agency', 'company')`. This avoids callers needing to pass unbounded ID arrays.

Processing is batched to 10 profiles per run.

### 3b.2. Search for information

`BraveSearcher` (`src/enrichment/brave-searcher.ts`) queries the Brave Search API with site filters:
- **Persons**: `site:linkedin.com`, `site:mil.gov`, `site:defense.gov`
- **Agencies**: `site:mil.gov`, `site:defense.gov`, `site:gov`

### 3b.3. Fetch and extract pages

`PageFetcher` (`src/enrichment/page-fetcher.ts`) retrieves full page text from top search results.

### 3b.4. AI dossier extraction

`DossierExtractor` (`src/enrichment/dossier-extractor.ts`) sends page content to Workers AI to extract a structured `Dossier` object (biographical info, role, organization, etc.).

### 3b.5. Store enrichment results

Updates `entity_profiles.dossier` (JSON), sets `enrichment_status = 'enriched'`, updates `last_enriched_at`.

### 3b.6. Self-scheduling for batches

If more than 10 profile IDs were queued, the agent processes the first 10, then calls `this.queue("enrichProfiles", remainingIds)` with the remaining IDs (FIFO, avoids timeout on large batches). Self-scheduling only continues if the current batch made progress (enriched > 0) to avoid infinite loops. Enrichment does NOT chain to any downstream agent.

---

## Stage 4: Signal Materialization (Task-Chained, terminal)

**Agent**: `SignalMaterializerAgent` (`src/agents/signal-materializer-agent.ts`)

**Pure logic**: `materializeSignal()` (`src/agents/signal-materializer.ts`)

**Repository**: `SignalRepository` (`src/db/signal-repository.ts`)

**What happens**:

### 4a. Find unmaterialized items (with threshold filter)

`ObservationRepository.findUnmaterializedItems(batchSize, threshold)` queries for `ingested_items` that:
- Have at least one row in `observations` (AI extraction succeeded)
- Do NOT have a corresponding row in `signals` (not yet materialized)
- Have `relevance_score IS NULL` (legacy items) OR `relevance_score >= threshold`

Items that scored below threshold at ingestion time are excluded from materialization. Legacy items (pre-ADR-004, `relevance_score IS NULL`) are still included and scored at this stage.

Batch size: 10 items per run.

### 4b. Relevance scoring (stored score or legacy fallback)

The materializer uses a two-tier relevance strategy via `getRelevanceOverride()`:

**Tier 1 — Stored ingestion-time score (normal path)**: Items ingested after ADR-004 have `relevance_score`, `relevance_rationale`, and `competency_codes` stored on the `ingested_items` row. The materializer reads these directly — **no AI call required**.

**Tier 2 — Legacy AI scoring (fallback)**: Items with `relevance_score IS NULL` (ingested before ADR-004) fall back to the original `scoreLegacyItem()` path, which:
1. Builds `ObservationSummary[]` from the item's observations
2. Gathers entity context from resolved `entity_profiles`
3. Calls `SignalRelevanceScorer.score()` with full context (content + observations + entity profiles)
4. Returns `{ score, rationale, competencyCodes }`

### 4c. Materialize signal

The pure function `materializeSignal()` transforms an `IngestedItemWithObservations` into a `MaterializedSignal` by:

1. **title**: First observation's summary (or truncated content)
2. **type**: Derived from primary observation type (`contract_award` → `opportunity`, `budget_signal` → `strategy`, `partnership` → `competitor`)
3. **branch**: First agency entity's name
4. **relevance**: From relevance override (stored score or AI-scored)
5. **relevanceRationale**: From relevance override
6. **tags**: Unique technology entity names
7. **vendors**: Companies with `subject` role
8. **competitors**: Companies with non-`subject` role
9. **stakeholders**: Person entity profile IDs and names (deduplicated)
10. **entities**: All entity mentions with confidence (1.0 if resolved, 0.5 if not)
11. **competencies**: Competency codes from relevance override

### 4d. Upsert to signals table

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

### 4e. Self-scheduling for batches

If there are remaining unmaterialized items, the agent calls `this.queue("materializeNew", {})` to enqueue the next batch. Self-scheduling only continues if the current batch made progress (materialized > 0). This is the terminal stage — no further chaining.

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

3. For each stuck stage, kicks the responsible agent:
   - `entity_resolution` → `agent.runResolution()` (queries DB for unresolved entities)
   - `synthesis` → `agent.synthesizeProfiles([])` (empty array → agent self-queries DB)
   - `enrichment` → `agent.enrichProfiles([])` (empty array → agent self-queries DB)
   - `signal_materialization` → `agent.materializeNew()` (queries DB for unmaterialized items)

**Agent self-query pattern (ADR-004)**: Recovery and on-demand callers pass empty arrays to agents. Agents detect the empty payload and query the database for their own pending work. This eliminates unbounded ID arrays that previously caused D1 bind parameter limit errors (>100 IDs in `IN` clause).

**On-demand jobs** (`POST /cron/:jobName`): `entity_resolution`, `synthesis`, `enrichment`, `signal_materialization` — all use the same empty-payload kick pattern. Ingestion jobs (`rss`, `sam_gov`, `fpds`) dispatch to the ObservationExtractorAgent normally.

---

## Data Flow Summary

```
External Source (RSS/SAM.gov/FPDS)
    |
    v
SignalAnalysisInput (in-memory)
    |
    v
ingested_items table (raw content, deduplicated by source_link)
    |
    v [AI: ObservationExtractor]
observations table (typed facts: contract_award, solicitation, etc.)
observation_entities table (raw entity mentions: person, agency, company)
    |
    v [Fetch: PageFetcher — best-effort source page]
    v [AI: SignalRelevanceScorer — early gate]
ingested_items.relevance_score (0-100, stored for audit)
    |
    score >= RELEVANCE_THRESHOLD (default: 60)?
    |                               |
   No                              Yes
    |                               |
  (stop)                            v [AI: EntityResolver + entity-match-ai]
                                    entity_profiles table (canonical entities with aliases)
                                    entity_aliases table (name variants)
                                    observation_entities.entity_profile_id (linked)
                                        |
                                        +---> [AI: ProfileSynthesizer]
                                        |     entity_profiles (summary, trajectory, relevance_score updated)
                                        |     insights table (competitor_assessment, opportunity_alert, etc.)
                                        |         |
                                        |         v [materializeSignal() — uses stored relevance score]
                                        |         signals table (materialized, UI-ready)
                                        |
                                        +---> [AI: BraveSearcher + DossierExtractor]
                                              entity_profiles.dossier (enriched biographical/organizational data)
```

## Batch Sizes & Limits

Each stage has configurable limits that control throughput and avoid timeouts:

| Component | Constant | Value | Location | Notes |
|-----------|----------|-------|----------|-------|
| **SAM.gov fetcher** | `PAGE_LIMIT` | 100 | `src/signals/sam-gov/sam-gov-fetcher.ts` | Items per API page |
| **SAM.gov fetcher** | `MAX_PAGES` | 2 | `src/signals/sam-gov/sam-gov-fetcher.ts` | Max pages per fetch (200 items max) |
| **FPDS fetcher** | `maxPages` | 5 | `src/signals/fpds/fpds-contracts-fetcher.ts` | Max ATOM feed pages (follows `next` links) |
| **RSS fetcher** | — | unbounded | `src/signals/rss/rss-fetcher.ts` | Fetches all items from each feed (currently 2 feeds) |
| **Source page fetch** | `DEFAULT_MAX_LENGTH` | 5,000 chars | `src/enrichment/page-fetcher.ts` | Max extracted text per source page (used for early relevance scoring) |
| **Relevance threshold** | `RELEVANCE_THRESHOLD` | 60 | `wrangler.jsonc` (env var) | Items below this score are excluded from downstream processing |
| **Brave Search** | `count` param | 20 | `src/enrichment/brave-searcher.ts` | Raw results fetched per query (filtered by blocked domains) |
| **Brave Search** | `DEFAULT_MAX_RESULTS` | 5 | `src/enrichment/brave-searcher.ts` | Max results returned after filtering |
| **Page Fetcher** | `DEFAULT_MAX_LENGTH` | 5,000 chars | `src/enrichment/page-fetcher.ts` | Max extracted text per page (enrichment) |
| **Enrichment batch** | `BATCH_SIZE` | 10 | `src/enrichment/entity-enricher.ts` | Profiles per enrichment run (remaining IDs self-scheduled) |
| **Synthesis batch** | `BATCH_SIZE` | 25 | `src/agents/synthesis-agent.ts` | Profiles per synthesis run (remaining IDs self-scheduled) |
| **Materialization batch** | `BATCH_SIZE` | 10 | `src/agents/signal-materializer-agent.ts` | Items per materialization run |

Agents that process batches (SynthesisAgent, EnrichmentAgent, SignalMaterializerAgent) self-schedule via `this.queue()` when remaining items exist, processing the next batch in a subsequent run.

## AI Calls Per Ingested Item

Each ingested item triggers a variable number of AI calls depending on whether it passes the relevance gate:

### Items below relevance threshold (< 60%): 2 AI calls, then stop

| Stage | AI Call | Model | Purpose |
|-------|---------|-------|---------|
| 1c | `ObservationExtractor.extract()` | Workers AI | Extract typed observations + entities from raw content |
| 1f | `SignalRelevanceScorer.score()` | Workers AI | Score relevance to Amplify (early gate) |

Plus 1 optional HTTP fetch (source page via PageFetcher).

### Items above relevance threshold (≥ 60%): 2 + N AI calls

| Stage | AI Call | Model | Purpose |
|-------|---------|-------|---------|
| 1c | `ObservationExtractor.extract()` | Workers AI | Extract typed observations + entities from raw content |
| 1f | `SignalRelevanceScorer.score()` | Workers AI | Score relevance to Amplify (early gate) |
| 2c | `entity-match-ai` (per unresolved group) | Workers AI | Fuzzy match entity names to existing profiles |
| 3a.3 | `ProfileSynthesizer.synthesize()` (per profile) | Workers AI | Generate summary, trajectory, relevance, insights |
| 4b | — (stored score used) | — | **No AI call** — materializer trusts ingestion-time score |

**Legacy items** (ingested before ADR-004, `relevance_score IS NULL`): Stage 4b falls back to `SignalRelevanceScorer.score()` with full entity context.

Entity enrichment (Stage 3b) adds additional AI calls per new profile but is independent of the main pipeline.

## Chaining Mechanism

All agent-to-agent communication uses the Cloudflare Agents [queue tasks API](https://developers.cloudflare.com/agents/api-reference/queue-tasks/):

```typescript
// Upstream agent (e.g., ObservationExtractorAgent)
const resolver = await getAgentByName<Env, EntityResolverAgent>(
    this.env.ENTITY_RESOLVER,
    "singleton",
);
await resolver.queue("runResolution", {}); // enqueues task, returns immediately
```

`queue()` is a public method on the `Agent` base class. When called via RPC on a remote DO stub, it enqueues a task on the target agent. Key properties:

- **FIFO ordering** — tasks execute in order
- **Persisted to SQLite** — tasks survive agent restarts
- **Fire-and-forget** — the calling agent returns immediately after enqueuing
- **Automatic cleanup** — successful tasks are removed from the queue
- **Self-batching** — agents can call `this.queue("methodName", payload)` on themselves to process remaining work in subsequent runs (used by SynthesisAgent, EnrichmentAgent, and SignalMaterializerAgent)
- **Typed payloads** — `queue()` accepts a payload argument passed to the target method. EntityResolverAgent passes `resolvedProfileIds` to SynthesisAgent and `newProfileIds` to EnrichmentAgent; both self-schedule with remaining IDs
- **Empty-payload kicks** — Recovery and on-demand callers pass `[]` to Synthesis/Enrichment agents. Agents detect empty payloads and query the database for their own pending work (ADR-004 self-query pattern)

## Relevance Gate Decision Logic

The early relevance gate (ADR-004) is the key decision point in the pipeline. Here is the complete decision flow:

```
Item ingested
    |
    v
Observations extracted (AI)
    |
    v
Source page fetched (best-effort, may be null)
    |
    v
Relevance scored (AI, using content + page + observations)
    |
    v
Score stored on ingested_items row
    |
    v
score >= RELEVANCE_THRESHOLD?
    |
    +--- Yes ---> Chain to EntityResolverAgent
    |             (full pipeline: resolve → synthesize → enrich → materialize)
    |
    +--- No  ---> Stop. Item stored for audit.
                  No entity resolution, synthesis, enrichment, or materialization.
                  Not visible in GET /signals.
                  Queryable via DB for threshold tuning.
```

**Threshold tuning**: The threshold is configurable via `RELEVANCE_THRESHOLD` env var. All items are stored with their scores regardless of threshold, so lowering the threshold later can surface previously-excluded items by re-running materialization.

**Materializer threshold filter**: `findUnmaterializedItems()` also applies the threshold filter (`relevance_score IS NULL OR relevance_score >= threshold`), providing a second safety net. Items that somehow bypassed the gate (or were ingested before ADR-004) are still filtered at materialization.
