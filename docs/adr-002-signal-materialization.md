# ADR-002: Signal Materialization — Rename ingested items, materialize signals

## Status
PROPOSED — 2026-03-06

## Context

### The Naming Problem
The `signals` table doesn't contain signals. It contains **raw ingested items** — unprocessed chunks of content from FPDS, SAM.gov, and RSS feeds. They have no branch, no type, no relevance score.

What the UI displays as a "signal" is actually a **derived view** assembled at query time by `signal-transformer.ts`, which joins:
- Raw ingested content (the `signals` table)
- Observations extracted by ObservationExtractorAgent
- Entity references and their resolved profiles
- Relevance scores from entity profiles (set by SynthesisAgent)

This causes two problems:

1. **Misleading names** — developers reading the schema think signals have intelligence value; they don't.
2. **No DB-level filtering** — branch, type, and relevance are computed properties. Filtering and sorting require fetching all rows, transforming in JS, then slicing. Pagination breaks.

### The Feature Need
The signal feed needs to be filterable by:
- **Branch**: Army, Navy, Air Force, Marines, DISA, CDAO, DIU
- **Type**: opportunity, strategy, competitor
- **Relevance**: threshold (return signals with relevance > N)

And sorted by relevance (high to low).

These fields don't exist on any DB row today — they're computed at query time.

## Decision

### 1. Rename `signals` → `ingested_items`

The raw content table becomes `ingested_items`. This accurately describes what it stores: unprocessed content from external sources.

### 2. Create a new `signals` table (materialized)

A new `signals` table stores the fully-formed, UI-ready signal with all computed fields persisted:

```typescript
signals = sqliteTable("signals", {
  id: text("id").primaryKey(),
  ingestedItemId: text("ingested_item_id").references(() => ingestedItems.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  date: text("date").notNull(),
  branch: text("branch").notNull(),         // filterable
  source: text("source").notNull(),
  type: text("type").notNull(),             // filterable: opportunity | strategy | competitor
  relevance: integer("relevance").notNull(), // filterable, sortable
  tags: text("tags", { mode: "json" }),     // string[]
  competencies: text("competencies", { mode: "json" }), // string[]
  play: text("play"),
  competitors: text("competitors", { mode: "json" }),   // string[]
  vendors: text("vendors", { mode: "json" }),           // string[]
  stakeholderIds: text("stakeholder_ids", { mode: "json" }), // string[]
  entities: text("entities", { mode: "json" }),         // { type, value, confidence }[]
  sourceUrl: text("source_url"),
  sourceMetadata: text("source_metadata", { mode: "json" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

### 3. New SignalMaterializerAgent (Cloudflare Durable Object)

A new agent that materializes signals from ingested items + observations + entity profiles.

**Triggers:**
- After ObservationExtractorAgent completes (new ingested items → new signals)
- After SynthesisAgent completes (relevance scores updated → re-score affected signals)

**Process:**
1. Find ingested items that have observations but no materialized signal (or signals needing re-materialization)
2. For each: join observations + entities + entity profile relevance scores
3. Compute branch, type, relevance, tags, competitors, vendors, stakeholderIds (same logic as current `transformSignalForUi`)
4. Upsert into the `signals` table

**Pure logic layer:** `SignalMaterializer` class (testable without DO runtime)
- `materialize(ingestedItem, observations, entityRelevanceScores) → Signal`
- Same computation as current `transformSignalForUi`, but output is a DB row, not a view

**Re-materialization:** When SynthesisAgent updates entity profile relevance scores, affected signals need their relevance re-computed. The agent tracks which entity profiles changed and finds linked signals via observation_entities.

### 4. SignalList endpoint becomes a simple DB query

With materialized signals, the endpoint becomes:
```sql
SELECT * FROM signals
WHERE (branch LIKE ? OR ? IS NULL)
  AND (type = ? OR ? IS NULL)
  AND (relevance >= ? OR ? IS NULL)
ORDER BY relevance DESC
LIMIT ? OFFSET ?
```

No more fetch-all-then-transform. Proper pagination. DB-indexed filtering.

### 5. Remove signal-transformer.ts

The transformer logic moves into `SignalMaterializer`. The query-time transform layer is deleted.

## Pipeline Flow (Updated)

```
Fetchers → ingested_items table
  → ObservationExtractorAgent → observations + observation_entities
    → EntityResolverAgent → entity_profiles (batch resolution)
      → SynthesisAgent → entity profile updates (relevance, summary)
        → SignalMaterializerAgent → signals table (materialized)
          → GET /signals (simple DB query with filters)
```

## Trigger Strategy: Event-Driven Chaining

No cron slot. SignalMaterializerAgent is triggered via RPC by upstream agents:

1. **ObservationExtractorAgent** → after ingestion completes, calls `SignalMaterializerAgent.materializeNew()` to materialize signals for newly ingested items
2. **SynthesisAgent** → after synthesis completes, calls `SignalMaterializerAgent.rematerialize(entityProfileIds)` to re-score signals linked to updated entity profiles

This gives immediate freshness — signals appear in the feed as soon as observations are extracted, and relevance scores update as soon as synthesis runs.

## What Changes

### Rework
- `signals` table → renamed to `ingested_items`
- `ObservationRepository` → references `ingestedItems` table instead of `signals`
- `signal-transformer.ts` → logic absorbed into `SignalMaterializer`
- `SignalList` endpoint → simple DB query with WHERE/ORDER BY
- Cron scheduler → add materialization job

### New
- `signals` table (materialized, with branch/type/relevance columns)
- `SignalMaterializerAgent` (Cloudflare DO)
- `SignalMaterializer` (pure logic, testable)
- `SignalRepository` (CRUD for materialized signals)
- D1 migration: rename table, create new table

### Remove
- `signal-transformer.ts` (logic moves to SignalMaterializer)
- `SignalUiView` interface (replaced by DB-backed Signal type)

## Migration Strategy

1. New migration: `ALTER TABLE signals RENAME TO ingested_items`
2. New migration: `CREATE TABLE signals (...)` with materialized columns
3. Update all code references from `signals` → `ingestedItems`
4. Backfill: run materialization on all existing ingested items with observations
