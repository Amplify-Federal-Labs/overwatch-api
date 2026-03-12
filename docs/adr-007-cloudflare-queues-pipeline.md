# ADR-007: Migrate Pipeline from Durable Object Task Chaining to Cloudflare Queues

## Status
Proposed

## Date
2026-03-12

## Context

### Problem: Brittle Pipeline Under Load

ADR-003 introduced task-chained Cloudflare Agent Durable Objects (DOs) to replace the round-robin cron scheduler. While this improved latency vs cron cycling, production data reveals the architecture cannot keep up with real workloads:

**Enrichment backlog**: 284 of 422 entity profiles remain in `pending` enrichment status. Only 58 have been enriched. The batch-10 self-scheduling pattern processes 10 profiles, then re-queues remaining IDs. Each self-schedule adds latency (DO wake-up, task queue overhead) and the queue is FIFO — new work from subsequent ingestion runs stacks behind the backlog.

**Non-enrichable types stuck as "pending"**: 131 profiles of types `contract_vehicle`, `program`, and `technology` show `pending` instead of `skipped`. The enrichment agent's self-scheduling batches of 10 never reach these profiles because enrichable profiles (person/agency/company) are processed first and new ones keep arriving.

**No failure visibility**: When a DO task fails (AI timeout, network error, D1 contention), the task is logged and skipped. There is no dead-letter mechanism, no retry with backoff, and no dashboard showing what failed. The recovery job scans DB for stuck work, but it runs on cron and can only detect symptoms (e.g., "unresolved entities exist"), not causes.

**Burst absorption**: A single SAM.gov ingestion run on 2026-03-10 produced 242 items. The downstream pipeline completed extraction and materialization (282 of 286 items reached signals), but enrichment for the resulting entity profiles could not keep pace. The batch self-scheduling pattern serializes processing within each DO instance.

**Tight coupling**: Each DO must know the next DO's binding name and method signature. Adding or reordering stages requires changes in multiple agents. The `getAgentByName` + RPC pattern creates compile-time dependencies between agents.

### Alternatives Considered

**Cloudflare Workflows**: Durable execution engine with per-step retry, automatic state persistence, and step-level observability. Strong fit for linear pipelines. However, our pipeline has a fan-out after entity resolution (synthesis + enrichment in parallel). Workflows handle this awkwardly — either spawn child workflows and coordinate via `waitForEvent`, or use undocumented `Promise.all` with steps. Workflows also lack dead-letter queues and have lower throughput (100 instances/sec vs 5,000 messages/sec for Queues).

**Hybrid (Queues + Workflows)**: Use Queues for pipeline routing and Workflows for multi-step stages (e.g., enrichment's search → fetch → extract sequence). Adds complexity for marginal benefit — enrichment steps are simple enough that retrying the whole consumer is acceptable, and we already persist all intermediate state in D1.

## Decision

Replace Durable Object task chaining with Cloudflare Queues. Each pipeline stage becomes a stateless Queue consumer. DOs are removed entirely. All state remains in D1 (no change to database schema or migrations).

### Queue Topology

Six queues, each with a dead-letter queue:

| Queue | Producer | Consumer | Message Payload | Batch Size |
|-------|----------|----------|-----------------|------------|
| `overwatch-ingestion` | Cron handler | Ingestion consumer | `{ source: "rss" \| "sam_gov" \| "fpds" }` | 1 |
| `overwatch-extraction` | Ingestion consumer | Extraction consumer | `{ ingestedItemId: string }` | 5 |
| `overwatch-resolution` | Extraction consumer | Resolution consumer | `{ observationId: number }` | 10 |
| `overwatch-synthesis` | Resolution consumer | Synthesis consumer | `{ profileId: string }` | 5 |
| `overwatch-enrichment` | Resolution consumer | Enrichment consumer | `{ profileId: string, entityType: string, canonicalName: string }` | 1 |
| `overwatch-materialization` | Synthesis consumer | Materialization consumer | `{ ingestedItemId: string }` | 10 |

All queues use `max_retries: 3` with the shared dead-letter queue `overwatch-dlq`.

### Message Granularity: 1 Message = 1 Unit of Work

The fundamental change from DO task chaining. Instead of passing arrays of IDs and self-scheduling batches:
- Ingestion consumer produces **one extraction message per ingested item**
- Extraction consumer produces **one resolution message per observation** (with its entity mentions)
- Resolution consumer produces **one synthesis message per resolved profile** and **one enrichment message per new enrichable profile**
- Synthesis consumer produces **one materialization message per linked ingested item**

Cloudflare Queues handles batching (via `max_batch_size`), retries, and concurrency. No self-scheduling loops.

### Pipeline Flow

```
CRON (0 0-2 * * *)
  │
  ▼
INGESTION_QUEUE ← { source: "sam_gov" }
  │
  │ Fetch all items from source
  │ Per item: dedup check, insert ingested_items row
  │ Produce 1 message per new item
  ▼
EXTRACTION_QUEUE ← { ingestedItemId }  ×N items
  │
  │ AI extract observations → store observations + observation_entities
  │ Fetch source page (best-effort)
  │ AI score relevance → store on ingested_items
  │ If score >= threshold: produce 1 message per observation
  ▼
RESOLUTION_QUEUE ← { observationId, entities[] }
  │
  │ For each entity mention:
  │   exact alias match → resolve
  │   AI fuzzy match (confidence >= 0.7) → resolve + add alias
  │   no match → create new profile
  │ Fan-out to TWO queues:
  ├──▶ SYNTHESIS_QUEUE ← { profileId }  (all resolved profiles, deduped)
  │
  └──▶ ENRICHMENT_QUEUE ← { profileId, entityType, canonicalName }
       (new profiles only, person/agency/company only)

SYNTHESIS_QUEUE
  │
  │ Fetch observations for profile
  │ AI synthesize → update entity_profiles + insert insights
  │ Produce materialization message per linked ingested item
  ▼
MATERIALIZATION_QUEUE ← { ingestedItemId }
  │
  │ Read stored relevance score (no AI call)
  │ materializeSignal() pure function
  │ Upsert to signals table
  ▼
signals table → GET /signals

ENRICHMENT_QUEUE (parallel, independent path)
  │
  │ Brave Search → page fetch → AI dossier extract
  │ Update entity_profiles.dossier + enrichment_status
  ▼
entity_profiles.dossier (enriched)
```

### Fan-Out at Resolution

The resolution consumer is the pipeline's branch point. After resolving entities for an observation, it produces messages to two queues in the same handler:

1. **Synthesis queue**: One message per resolved profile ID (deduped within the batch). All resolved profiles — both newly created and matched to existing.
2. **Enrichment queue**: One message per **newly created** profile that is an enrichable type (`person`, `agency`, `company`). Non-enrichable types (`program`, `contract_vehicle`, `technology`) are never enqueued — eliminating the "stuck as pending" problem.

Both queues process independently at their own pace. Enrichment's slower throughput (HTTP + AI per profile) does not block synthesis or materialization.

### Consumer Batch Sizes

| Queue | `max_batch_size` | Rationale |
|-------|-----------------|-----------|
| `ingestion` | 1 | One source per message; fetcher returns many items |
| `extraction` | 5 | 2 AI calls per item (extract + score) |
| `resolution` | 10 | Mostly DB lookups; AI only for fuzzy matching |
| `synthesis` | 5 | 1 AI call per profile |
| `enrichment` | 1 | Slowest stage: HTTP search + fetch + AI |
| `materialization` | 10 | No AI calls; DB reads + upserts |

### Dead-Letter Queue

All six queues share a single DLQ (`overwatch-dlq`). Messages that fail after `max_retries` (3) land here with the original payload and error metadata. The DLQ consumer logs failures for observability. Failed messages can be re-driven by producing them back to their original queue via `POST /cron/redrive`.

### On-Demand Triggers

`POST /cron/:jobName` continues to work. Instead of RPC to a DO, on-demand triggers produce messages directly to the appropriate queue:
- `rss`, `sam_gov`, `fpds` → produce to `INGESTION_QUEUE`
- `entity_resolution` → query DB for unresolved observation_entities, produce to `RESOLUTION_QUEUE`
- `synthesis` → query DB for unsynthesized profiles, produce to `SYNTHESIS_QUEUE`
- `enrichment` → query DB for pending enrichable profiles, produce to `ENRICHMENT_QUEUE`
- `signal_materialization` → query DB for unmaterialized items, produce to `MATERIALIZATION_QUEUE`

### Idempotency

Queue consumers must be idempotent since messages may be delivered more than once (at-least-once delivery). Current D1 operations are already idempotent:
- `insertIngestedItem()` deduplicates on `source_link` (returns null for duplicates)
- `resolveEntity()` is a no-op if already resolved (checks `entity_profile_id IS NOT NULL`)
- `signals` upsert uses `INSERT OR REPLACE`
- Enrichment checks `enrichment_status` before processing

### Wrangler Configuration

```jsonc
{
  "queues": {
    "producers": [
      { "queue": "overwatch-ingestion", "binding": "INGESTION_QUEUE" },
      { "queue": "overwatch-extraction", "binding": "EXTRACTION_QUEUE" },
      { "queue": "overwatch-resolution", "binding": "RESOLUTION_QUEUE" },
      { "queue": "overwatch-synthesis", "binding": "SYNTHESIS_QUEUE" },
      { "queue": "overwatch-enrichment", "binding": "ENRICHMENT_QUEUE" },
      { "queue": "overwatch-materialization", "binding": "MATERIALIZATION_QUEUE" }
    ],
    "consumers": [
      { "queue": "overwatch-ingestion", "max_batch_size": 1, "max_retries": 3, "dead_letter_queue": "overwatch-dlq" },
      { "queue": "overwatch-extraction", "max_batch_size": 5, "max_retries": 3, "dead_letter_queue": "overwatch-dlq" },
      { "queue": "overwatch-resolution", "max_batch_size": 10, "max_retries": 3, "dead_letter_queue": "overwatch-dlq" },
      { "queue": "overwatch-synthesis", "max_batch_size": 5, "max_retries": 3, "dead_letter_queue": "overwatch-dlq" },
      { "queue": "overwatch-enrichment", "max_batch_size": 1, "max_retries": 3, "dead_letter_queue": "overwatch-dlq" },
      { "queue": "overwatch-materialization", "max_batch_size": 10, "max_retries": 3, "dead_letter_queue": "overwatch-dlq" }
    ]
  }
}
```

## What Changes

| Aspect | Before (DO task chaining) | After (Queues) |
|--------|--------------------------|----------------|
| Infrastructure | 5 Durable Objects with Agent base class | 6 Queue consumers in a single Worker |
| Message granularity | Array of IDs in task payload | 1 message = 1 item/profile |
| Batch processing | Self-scheduling loops (10/25 at a time) | Cloudflare auto-batches to consumer |
| Retry | None (failed tasks logged and skipped) | Automatic (max_retries: 3, exponential backoff) |
| Failure visibility | Recovery job scans DB for symptoms | DLQ with original message + error |
| Backpressure | None (fire-and-forget to DO queue) | Queue depth visible, auto-throttled |
| Fan-out | Manual `getAgentByName` + RPC to 2 DOs | Produce to 2 queue bindings |
| Coupling | Each DO knows next DO's binding + method | Consumers only know queue bindings |
| Non-enrichable types | Stuck as "pending" forever | Never enqueued |
| State | DO-internal SQLite (per-agent) | D1 only (shared, queryable) |

## What Stays the Same

- **D1 schema** — all tables, columns, indexes, migrations unchanged
- **All AI prompts** — observation extraction, relevance scoring, entity matching, synthesis, dossier extraction
- **All business rules** — relevance threshold (60), entity type filtering, competency clusters, person matching rules (last names must match), confidence threshold (0.7)
- **All fetchers/parsers** — FPDS, SAM.gov, RSS, Brave Search, PageFetcher
- **Pure logic functions** — `materializeSignal()`, `applyThreshold()`, `groupUnresolvedByName()`, `buildSynthesisContext()`, `buildSearchQuery()`
- **Zod schemas** — all domain types in `src/schemas/`
- **API endpoints** — GET /signals, POST /cron/:jobName, etc.
- **Cron schedule** — `0 0-2 * * *` (produces to ingestion queue instead of DO RPC)
- **Repositories** — all D1 repository classes reused as-is

## Implementation Plan

### Phase 1: Scaffold + Ingestion → Extraction
- Add queue bindings to `wrangler.jsonc` and `worker-configuration.d.ts`
- Implement `queue()` handler in `src/index.ts` that routes to stage-specific consumers
- Port `ingestion-consumer.ts`: cron produces to `INGESTION_QUEUE`, consumer calls existing fetchers/parsers, produces per-item to `EXTRACTION_QUEUE`
- Port `extraction-consumer.ts`: calls existing `ObservationExtractor` + `SignalRelevanceScorer`, stores results via existing repositories, produces to `RESOLUTION_QUEUE` if above threshold
- Test: cron trigger → items ingested → observations extracted → relevance scored

### Phase 2: Entity Resolution with Fan-Out
- Port `resolution-consumer.ts`: calls existing `EntityResolver` + `entity-match-ai` logic
- Fan-out: produce to `SYNTHESIS_QUEUE` and `ENRICHMENT_QUEUE`
- Test: extraction → resolution → profiles created/matched → messages on both downstream queues

### Phase 3: Synthesis + Materialization
- Port `synthesis-consumer.ts`: calls existing `ProfileSynthesizer`, produces to `MATERIALIZATION_QUEUE`
- Port `materialization-consumer.ts`: calls existing `materializeSignal()`, upserts to signals table
- Test: end-to-end from ingestion to materialized signals

### Phase 4: Enrichment
- Port `enrichment-consumer.ts`: calls existing `BraveSearcher` + `PageFetcher` + `DossierExtractor`
- Test: new profiles enriched independently of synthesis/materialization path

### Phase 5: DLQ + On-Demand + Cleanup
- Implement DLQ consumer (logging, optional re-drive endpoint)
- Update `POST /cron/:jobName` to produce to queues instead of DO RPC
- Remove all DO agent files (`src/agents/*-agent.ts`) and DO bindings from `wrangler.jsonc`
- Update `worker-configuration.d.ts` to remove DO namespace bindings, add queue bindings

## Consequences

### Positive
- **Enrichment backlog clears** — per-profile messages with automatic retry replace batch self-scheduling. 284 pending profiles can process in parallel.
- **Non-enrichable types resolved** — never enqueued for enrichment, no more "stuck as pending"
- **Burst absorption** — 242 SAM.gov items become 242 extraction messages; queue absorbs the burst, consumers process at their own pace
- **Failure recovery** — DLQ captures failed messages with full payload. Re-drive without re-ingesting.
- **Decoupled stages** — consumers only know their input message schema and output queue binding. Adding a new stage means adding a queue, not modifying upstream agents.
- **Simpler debugging** — queue depth metrics show where bottlenecks are. DLQ shows what failed and why.

### Negative
- **No durable per-step state** — unlike Workflows, Queues don't persist intermediate state between steps. We rely on D1 for all state, which is already the case.
- **At-least-once delivery** — consumers must be idempotent. Current operations already are (dedup on source_link, idempotent upserts, status checks before processing).
- **Queue management overhead** — 6 queues + 1 DLQ to create and monitor, vs 5 DO bindings. Marginal increase in configuration surface.
- **Message size limit** — 128 KB per message. Current payloads are well under this (IDs and small metadata), but large content payloads would need to reference D1 rows instead of inlining.

### Neutral
- **Cost** — Cloudflare Queues pricing ($0.40/million operations, 3 ops per message). At ~300 items/day × 5 stages = ~1,500 messages/day = ~45,000/month = ~$0.05/month. Negligible.
- **Testing strategy** — unit tests remain the same (mock D1, mock AI). Integration tests would mock queue bindings. No Workers pool required.

## Supersedes

This ADR supersedes **ADR-003 (Task-Chained Agent Pipeline)**. The pipeline stages, business logic, and data flow remain identical — only the inter-stage communication mechanism changes from DO task chaining to Cloudflare Queues.
