# ADR-003: Task-Chained Agent Pipeline

## Status
Proposed

## Date
2026-03-06

## Context

The current architecture uses a cron-based round-robin scheduler that cycles through 7 jobs (rss, sam_gov, fpds, entity_resolution, synthesis, enrichment, signal_materialization). This has several problems:

1. **Timeout risk** — Each cron invocation runs a single job. Processing stages that depend on upstream output (e.g., synthesis depends on entity resolution) must wait for the next cron cycle, adding multi-hour latency.
2. **Wasted cycles** — Resolution, synthesis, and materialization run on schedule even when there's no new data to process.
3. **Brittle ordering** — The round-robin assumes a fixed execution order. If ingestion produces data mid-cycle, downstream agents don't process it until the next full rotation.

## Decision

Replace the round-robin scheduler with an event-driven task chain using Cloudflare Agents `queue()` API.

### Cron (ingestion only)
Cron remains responsible for **pulling** raw content from external sources (FPDS, SAM.gov, RSS). These are pull-based sources with no webhooks, so periodic polling is required.

The 3 ingestion jobs run once daily at fixed UTC hours: midnight=`rss`, 1AM=`sam_gov`, 2AM=`fpds`.

### Task Chain (processing pipeline)
After ingestion stores new `ingested_items`, the downstream pipeline is triggered via agent-to-agent task chaining with explicit ID payloads:

```
ObservationExtractorAgent (cron-triggered)
  → EntityResolverAgent.queue("runResolution", {})
    → SynthesisAgent.queue("synthesizeProfiles", resolvedProfileIds)  ─→ SignalMaterializerAgent.queue("materializeNew", {})
    → EnrichmentAgent.queue("enrichProfiles", newProfileIds)          (parallel, independent)
```

### Chaining Mechanism: Cloudflare Agents Queue Tasks API

Upstream agents call `targetAgent.queue("methodName", payload)` on the downstream agent's RPC stub. This uses the Cloudflare Agents [queue tasks API](https://developers.cloudflare.com/agents/api-reference/queue-tasks/):

1. `queue()` is a public method on the `Agent` base class, RPC-callable across Durable Objects
2. Tasks are FIFO, persisted to SQLite, and survive agent restarts
3. The upstream agent returns immediately after enqueuing (fire-and-forget)
4. Failed callbacks are logged but skipped; the queue continues processing
5. Payloads carry explicit IDs — agents don't query DB for "what needs processing"

This pattern means:
- The calling agent is never blocked waiting for downstream work
- Each agent runs queued tasks in its own execution context (no timeout sharing)
- Self-batching for large workloads uses `this.queue()` internally (SynthesisAgent, EnrichmentAgent, SignalMaterializerAgent)

### Enrichment and Synthesis: Parallel After Resolution

Synthesis and enrichment are independent — synthesis operates on observations only, not enrichment/dossier data. Both are triggered in parallel after entity resolution completes.

## Consequences

### Positive
- **Lower latency** — New data flows through the entire pipeline within minutes instead of waiting for cron cycles
- **No wasted compute** — Downstream agents only run when there's actual work
- **Simpler scheduler** — Cron only manages 3 ingestion jobs instead of 7

### Negative
- **Debugging** — Event-driven chains are harder to trace than sequential cron jobs. Structured logging with correlation IDs would help (future improvement).
- **Error propagation** — If EntityResolver fails, Synthesis and Materialization won't trigger. The queue API handles individual task failures (logged and skipped), but upstream chain breaks require manual re-trigger via `POST /cron/:jobName`.

### Neutral
- `POST /cron/:jobName` on-demand trigger still works for any individual agent
- SignalMaterializerAgent remains event-driven (unchanged)
- Self-scheduling for batch overflow (SynthesisAgent, EnrichmentAgent, SignalMaterializerAgent) processes remaining IDs in subsequent runs
