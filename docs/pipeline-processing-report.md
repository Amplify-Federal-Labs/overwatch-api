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
                  +-------------------------------+
                                  |
                          queue()
                                  |
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

## Stage 1: Ingestion (Cron-Triggered)

**Trigger**: Cloudflare Workers cron fires once daily per source (`0 0-2 * * *`). The scheduler (`src/cron/scheduler.ts`) maps fixed UTC hours to ingestion jobs:

| UTC Hour | Job     | Source           |
|----------|---------|------------------|
| 0 (midnight) | `rss`     | GovConWire, FedScoop RSS feeds |
| 1           | `sam_gov` | SAM.gov opportunities + APBI events |
| 2           | `fpds`    | FPDS.gov ATOM feed (DoD contract awards) |

**Agent**: `ObservationExtractorAgent` (`src/agents/observation-extractor-agent.ts`)

**What happens**:

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
├── id              (UUID, primary key)
├── source_type     ("rss" | "sam_gov" | "fpds")
├── source_name     ("GovConWire", "SAM.gov", etc.)
├── source_url      (original URL)
├── source_link     (unique, used for deduplication)
├── content         (full text content)
├── source_metadata (JSON, source-specific fields)
└── created_at      (ISO 8601 timestamp)
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

### 1e. Chain to next stage

If any new items were stored (`itemsStored > 0`), the agent calls `resolver.queue("runResolution", {})` on the EntityResolverAgent stub -- the task is enqueued (FIFO, persisted) and the agent returns immediately.

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

1. **Exact alias match** -- Check if any existing profile has this name as an alias
2. **AI fuzzy match** -- If no exact match, call `entity-match-ai` (`src/agents/entity-match-ai.ts`) via Workers AI to determine if the name is a variant of an existing profile (e.g., "BAH" -> "Booz Allen Hamilton")
3. **Create new profile** -- If no match found, create a new `entity_profiles` row with the raw name as `canonical_name`

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
- **All resolved profiles**: `synthesis.queue("synthesizeProfiles", resolvedProfileIds)` -- passes all profile IDs that had entities resolved (both new and existing)
- **New profiles only**: `enrichment.queue("enrichProfiles", newProfileIds)` -- passes only newly created profile IDs for enrichment

Both are enqueued as fire-and-forget tasks and run independently (parallel).

---

## Stage 3a: Profile Synthesis (Task-Chained, parallel with Enrichment)

**Agent**: `SynthesisAgent` (`src/agents/synthesis-agent.ts`)

**Pure logic**: `ProfileSynthesizer` (`src/agents/profile-synthesizer.ts`)

**Repository**: `SynthesisRepository` (`src/db/synthesis-repository.ts`)

**What happens**:

### 3a.1. Receive profile IDs from EntityResolverAgent

The SynthesisAgent receives an explicit list of resolved profile IDs via `queue("synthesizeProfiles", profileIds)`. This includes both newly created profiles and existing profiles that had new entities resolved to them. It fetches profile data from D1 by ID, then processes up to 25 profiles per batch.

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

If more than 25 profile IDs were received, the agent processes the first 25, then calls `this.queue("synthesizeProfiles", remainingIds)` with the remaining IDs. Self-scheduling only continues if the current batch made progress (processed > 0).

If profiles were processed: `materializer.queue("materializeNew", {})`.

---

## Stage 3b: Entity Enrichment (Task-Chained, parallel with Synthesis)

**Agent**: `EnrichmentAgent` (`src/agents/enrichment-agent.ts`)

**Pure logic**: `EntityEnricher` (`src/enrichment/entity-enricher.ts`)

**What happens**:

### 3b.1. Receive profile IDs from EntityResolverAgent

The EnrichmentAgent receives an explicit list of new profile IDs via `queue("enrichProfiles", profileIds)`. It fetches full profile data (`id`, `type`, `canonicalName`) from D1 by ID, then processes up to 10 profiles per batch.

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

If more than 10 profile IDs were received, the agent processes the first 10, then calls `this.queue("enrichProfiles", remainingIds)` with the remaining IDs (FIFO, avoids timeout on large batches). Self-scheduling only continues if the current batch made progress (enriched > 0) to avoid infinite loops. Enrichment does NOT chain to any downstream agent.

---

## Stage 4: Signal Materialization (Task-Chained, terminal)

**Agent**: `SignalMaterializerAgent` (`src/agents/signal-materializer-agent.ts`)

**Pure logic**: `materializeSignal()` (`src/agents/signal-materializer.ts`)

**Repository**: `SignalRepository` (`src/db/signal-repository.ts`)

**What happens**:

### 4a. Find unmaterialized items

`ObservationRepository.findUnmaterializedItems()` queries for `ingested_items` that:
- Have at least one row in `observations` (AI extraction succeeded)
- Do NOT have a corresponding row in `signals` (not yet materialized)

Batch size: 10 items per run.

### 4b. AI relevance scoring

For each item, `SignalRelevanceScorer` (`src/agents/signal-relevance-scorer.ts`) calls Workers AI to score relevance to Amplify Federal:

**Input context includes**:
- Raw content of the ingested item
- Observation summaries with entity mentions
- Known entity profile context (name, type, summary) for resolved entities

**Output**:
- **relevanceScore**: 0-100 (Critical/High/Moderate/Low/Irrelevant)
- **rationale**: 1-2 sentence explanation
- **competencyCodes**: Array of `A`-`F` mapping to Amplify's competency clusters

### 4c. Materialize signal

The pure function `materializeSignal()` transforms an `IngestedItemWithObservations` into a `MaterializedSignal` by:

1. **title**: First observation's summary (or truncated content)
2. **type**: Derived from primary observation type (`contract_award` -> `opportunity`, `budget_signal` -> `strategy`, `partnership` -> `competitor`)
3. **branch**: First agency entity's name
4. **relevance**: AI-scored relevance (falls back to max entity profile score if AI fails)
5. **tags**: Unique technology entity names
6. **vendors**: Companies with `subject` role
7. **competitors**: Companies with non-`subject` role
8. **stakeholderIds**: Person entity profile IDs
9. **entities**: All entity mentions with confidence (1.0 if resolved, 0.5 if not)
10. **competencies**: Competency codes from AI scoring

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

If there are remaining unmaterialized items, the agent calls `this.queue("materializeNew", {})` to enqueue the next batch. This is the terminal stage -- no further chaining.

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
    v [AI: EntityResolver + entity-match-ai]
entity_profiles table (canonical entities with aliases)
entity_aliases table (name variants)
observation_entities.entity_profile_id (linked)
    |
    +---> [AI: ProfileSynthesizer]
    |     entity_profiles (summary, trajectory, relevance_score updated)
    |     insights table (competitor_assessment, opportunity_alert, etc.)
    |         |
    |         v [AI: SignalRelevanceScorer + materializeSignal()]
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
| **Brave Search** | `count` param | 20 | `src/enrichment/brave-searcher.ts` | Raw results fetched per query (filtered by blocked domains) |
| **Brave Search** | `DEFAULT_MAX_RESULTS` | 5 | `src/enrichment/brave-searcher.ts` | Max results returned after filtering |
| **Page Fetcher** | `DEFAULT_MAX_LENGTH` | 5,000 chars | `src/enrichment/page-fetcher.ts` | Max extracted text per page |
| **Enrichment batch** | `BATCH_SIZE` | 10 | `src/enrichment/entity-enricher.ts` | Profiles per enrichment run (remaining IDs self-scheduled) |
| **Synthesis batch** | `BATCH_SIZE` | 25 | `src/agents/synthesis-agent.ts` | Profiles per synthesis run (remaining IDs self-scheduled) |
| **Materialization batch** | `BATCH_SIZE` | 10 | `src/agents/signal-materializer-agent.ts` | Items per materialization run |

Agents that process batches (SynthesisAgent, EnrichmentAgent, SignalMaterializerAgent) self-schedule via `this.queue()` when remaining items exist, processing the next batch in a subsequent run.

## AI Calls Per Ingested Item

Each ingested item triggers up to 4 AI calls across the pipeline:

| Stage | AI Call | Model | Purpose |
|-------|---------|-------|---------|
| 1c | `ObservationExtractor.extract()` | Workers AI | Extract typed observations + entities from raw content |
| 2c | `entity-match-ai` (per unresolved group) | Workers AI | Fuzzy match entity names to existing profiles |
| 3a.3 | `ProfileSynthesizer.synthesize()` (per profile) | Workers AI | Generate summary, trajectory, relevance, insights |
| 4b | `SignalRelevanceScorer.score()` | Workers AI | Score signal relevance to Amplify + map competency clusters |

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

- **FIFO ordering** -- tasks execute in order
- **Persisted to SQLite** -- tasks survive agent restarts
- **Fire-and-forget** -- the calling agent returns immediately after enqueuing
- **Automatic cleanup** -- successful tasks are removed from the queue
- **Self-batching** -- agents can call `this.queue("methodName", payload)` on themselves to process remaining work in subsequent runs (used by SynthesisAgent, EnrichmentAgent, and SignalMaterializerAgent)
- **Typed payloads** -- `queue()` accepts a payload argument passed to the target method. EntityResolverAgent passes `resolvedProfileIds` to SynthesisAgent and `newProfileIds` to EnrichmentAgent; both self-schedule with remaining IDs
