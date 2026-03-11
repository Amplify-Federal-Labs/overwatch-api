# ADR-004: Early Relevance Gate + Agent Self-Query

## Status
Proposed

## Date
2026-03-10

## Context

### Problem 1: Wasted compute on low-relevance content

The pipeline processes ALL ingested items through the entire chain — observation extraction → entity resolution → synthesis → enrichment → materialization — regardless of relevance. Relevance scoring currently happens at the **last** step (signal materialization via `SignalRelevanceScorer`), meaning items that score 20% consume the same AI calls, Brave Search API quota, and D1 writes as items scoring 90%.

In production, the materialized signals table contains items across the full 0–100 relevance spectrum. Items below 60% ("Moderate" and "Low" bands) are unlikely to drive user action but still trigger:
- AI entity resolution matching per entity mention
- AI synthesis (summary, trajectory, relevance) per entity profile
- Brave Search + page fetch + AI dossier extraction per new entity
- AI relevance scoring + signal materialization per item

Additionally, relevance scoring at materialization time operates on raw RSS summaries and SAM.gov snippets — often too brief for accurate scoring. Fetching the full source page (`sourceLink`) before scoring would give the AI richer context.

### Problem 2: Unbounded ID payloads

Recovery (`POST /cron/recovery`) and on-demand cron jobs gather ALL pending IDs from the database and pass them as payloads to agent methods (e.g., `agent.enrichProfiles(153_ids)`). This causes D1 bind parameter limit errors when the `IN (...)` clause exceeds ~100 parameters.

The root cause: callers are responsible for querying work items, when agents should own their own work discovery. Agents already have self-scheduling with batch sizes — they just need to be "kicked" to start.

## Decision

### 1. Early relevance gate at ingestion time

Move relevance scoring into `ObservationExtractorAgent`, right after observation extraction. The per-item flow becomes:

```
Insert ingested item
  → AI extract observations → Store observations
  → Fetch source page (best-effort via PageFetcher)
  → AI score relevance (content + page text + observations, no entity context)
  → Store relevance_score on ingested_items row
  → Only chain to entity resolution if score ≥ RELEVANCE_THRESHOLD
```

**Threshold**: Configurable via `RELEVANCE_THRESHOLD` env var (default: `60`). Items below threshold are stored with their score for auditability but excluded from downstream processing.

**Source page fetch**: Reuses existing `PageFetcher` from `src/enrichment/page-fetcher.ts`. If `sourceLink` is null, blocked (`.mil`/`.gov`), or fetch fails, scoring proceeds with just the ingested content + observations. The fetched page text enriches scoring when available but is not required.

**Materializer trusts stored score**: `SignalMaterializerAgent` uses the `relevance_score` stored on `ingested_items` instead of re-calling `SignalRelevanceScorer`. Legacy items (null score) fall back to AI scoring.

**Relevance scorer reuse**: The existing `SignalRelevanceScorer` is called with `entityContext: []` — the content + observations alone are sufficient for gating. The scoring prompt and criteria remain unchanged.

### 2. Agent self-query for pending work

When agents receive an empty ID payload, they query the database for their own pending work:

- `SynthesisAgent.synthesizeProfiles([])` → queries for unsynthesized profiles
- `EnrichmentAgent.enrichProfiles([])` → queries for pending enrichment profiles
- `EntityResolverAgent` and `SignalMaterializerAgent` — already query DB, unchanged

Normal pipeline chaining (EntityResolver → Synthesis/Enrichment) continues to pass explicit IDs from a single ingestion run — these are naturally small arrays. Only recovery and on-demand callers change to empty-payload kicks.

`PipelineStatus` simplifies from ID arrays to counts. `StuckStage` drops the `profileIds` field. `RecoveryRepository` uses count queries instead of ID fetchers.

### 3. Database changes

New migration adds three columns to `ingested_items`:
- `relevance_score INTEGER` — 0–100 score from AI
- `relevance_rationale TEXT` — AI explanation
- `competency_codes TEXT` (JSON) — matched competency clusters

The `findUnmaterializedItems()` query gains a threshold filter: `AND (relevance_score IS NULL OR relevance_score >= ?)` to prevent low-relevance items from being materialized.

## Consequences

### Positive
- **Compute savings** — Low-relevance items (~40% of current signals) skip 4+ downstream AI calls each (entity resolution match, synthesis, enrichment search/dossier, materialization scoring)
- **Richer scoring input** — Full source page text gives the AI better context than RSS summaries alone
- **Focused signals table** — Users see only actionable intelligence (≥60% relevance)
- **No more D1 bind errors** — Agents query their own work in bounded batches
- **Auditability preserved** — All items stored with scores; threshold adjustable without data loss

### Negative
- **Extra AI call at ingestion** — One `SignalRelevanceScorer` call per ingested item, before we know if it's relevant. Net positive: saves 4+ calls per gated-out item.
- **Extra fetch at ingestion** — One `PageFetcher.fetchPage()` per item with a `sourceLink`. Best-effort with short timeout; blocked URLs return null immediately.
- **Threshold tuning** — A too-aggressive threshold could filter useful moderate-relevance items. Mitigated by making it configurable and storing all items with scores.

### Neutral
- Normal pipeline chaining (EntityResolver → Synthesis/Enrichment with explicit IDs) unchanged — these payloads are naturally small from single ingestion runs
- `POST /cron/:jobName` on-demand trigger still works, now with empty payloads
- Existing `SignalRelevanceScorer` and `PageFetcher` reused without modification
