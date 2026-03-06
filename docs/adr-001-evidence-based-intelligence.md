# ADR-001: Pivot from Signal-Centric to Evidence-Based Intelligence

## Status
ACCEPTED — 2026-03-06

## Context

### The Problem
The current pipeline treats each signal as an independent, significant event. The `SignalAnalyzer` attempts to extract a complete picture from every signal — full entity profiles, relevance scores, outreach plays, competency mappings. The `EntityEnricher` then tries to build a complete stakeholder dossier from a single discovered entity mention.

This is fundamentally wrong. A single FPDS contract award doesn't tell you a competitor's strategy. A single RSS mention of a person doesn't make them a stakeholder worth pursuing. A single SAM.gov opportunity doesn't reveal an agency's trajectory.

### The Insight
Each signal is a **small piece of a large puzzle**. Value emerges from accumulation and synthesis:

- **Competitors**: Hundreds of contract awards over time reveal strategy — which agencies they're penetrating, which domains they invest in, win/loss trends, teaming patterns, growth trajectory.
- **Stakeholders**: Repeated appearances across signals — budget hearings, contract awards, conference talks, personnel moves — build a picture of what they care about, their decision authority, and where they're heading.
- **Agencies**: Patterns across signals reveal priorities, budget shifts, technology adoption curves, and upcoming needs.

The **big picture** is what enables prediction and strategic positioning. No single signal provides this.

### What's Wrong with the Current Pipeline

1. **SignalAnalyzer** over-extracts per signal — asks AI to assign relevance, outreach play, competency mapping from one data point. These assessments are unreliable without context.
2. **StakeholderMatcher** binary matches entities against known stakeholders. No concept of "this person keeps appearing" or "this entity is gaining importance."
3. **EntityEnricher** builds a dossier from web search the moment an entity is discovered. This is expensive, premature, and disconnected from what the entity actually means to Amplify.
4. **CompetitorMatcher** creates activity records per signal. No aggregation, no trend detection, no strategic assessment.
5. **No memory** — the system doesn't accumulate knowledge over time. Each signal is processed in isolation.

## Decision

Pivot from a signal-centric pipeline to an **evidence-based intelligence system** where signals produce typed observations that accumulate on long-lived entity profiles, and periodic synthesis generates strategic insights.

## Proposed Architecture

### Core Concept: Observations, not Analyses

Instead of asking AI to "analyze this signal" and produce a complete assessment, each signal produces **observations** — small, typed, factual assertions extracted from the source material.

```
Signal → [Observation, Observation, ...] → Entity Profiles → Synthesis → Insights
```

### Layer 1: Signal Ingestion (keep, simplify)

Fetchers remain the same (FPDS, SAM.gov, RSS, etc.). But the analyzer's job shrinks dramatically:

**Current**: "Analyze this signal, score relevance, pick outreach play, classify type, extract entities with confidence"
**Proposed**: "Extract factual observations from this content"

An observation is a typed fact:
```typescript
type ObservationType =
  | "contract_award"      // company X won contract Y from agency Z
  | "personnel_move"      // person X appointed to role Y at org Z
  | "budget_signal"       // agency X allocated $Y for program Z
  | "technology_adoption" // org X adopted/mandated technology Y
  | "solicitation"        // agency X issued RFP/RFI for Y
  | "policy_change"       // authority X issued policy Y affecting Z
  | "partnership"         // company X teamed with company Y on Z
  | "program_milestone"   // program X reached milestone Y

interface Observation {
  id: string;
  signalId: string;
  type: ObservationType;
  subject: EntityRef;       // who/what is this about
  predicate: string;        // what happened (verb phrase)
  object?: EntityRef;       // target entity if applicable
  attributes: Record<string, string>; // structured details (amount, date, contract number, etc.)
  sourceDate: string;
  extractedAt: string;
}

interface EntityRef {
  type: "person" | "agency" | "program" | "company" | "technology" | "contract_vehicle";
  name: string;
  normalizedName?: string;  // for dedup (e.g., "NIWC Pacific" = "Naval Information Warfare Center Pacific")
}
```

The AI prompt becomes much simpler and more reliable: "What factual events/assertions does this content describe? Extract each as a typed observation."

**Observation granularity**: Coarse — one observation per distinct event in the signal. An FPDS contract award = one observation ("Booz Allen won $5M DevSecOps contract from NIWC Pacific"), not three separate observations for the award, the agency, and the domain. We can increase granularity later if entity profiles feel too thin.

### Layer 2: Entity Accumulation (new)

Entities are long-lived objects that grow richer with each observation. Instead of building a complete dossier from a single web search, entity profiles accumulate naturally.

```typescript
interface EntityProfile {
  id: string;
  type: EntityType;
  canonicalName: string;
  aliases: string[];           // for name resolution
  firstSeenAt: string;
  lastSeenAt: string;
  observationCount: number;

  // Accumulated from observations
  attributes: Record<string, string[]>;  // key → values seen across observations
  relationships: EntityRelationship[];   // edges to other entities
  timeline: ObservationRef[];            // chronological observation history

  // Computed periodically via synthesis
  summary?: string;            // AI-generated narrative summary
  trajectory?: string;         // where this entity appears to be heading
  relevanceScore?: number;     // computed from observation patterns, not per-signal
  lastSynthesizedAt?: string;
}

interface EntityRelationship {
  targetEntityId: string;
  type: "works_at" | "manages" | "awarded_to" | "competes_with" | "partners_with" | "funds" | "oversees";
  observationIds: string[];    // evidence for this relationship
  firstSeen: string;
  lastSeen: string;
  strength: number;            // based on observation count and recency
}
```

Key behaviors:
- **Name resolution (batch)**: Observations are stored with raw entity names. A periodic **EntityResolver** cron job scans unresolved entity refs, uses AI-assisted fuzzy matching against the canonical entity table (including aliases), and links them. New entities are created when no match is found. Human merge/split via UI corrects mistakes and feeds the alias table.
- **Relationship inference**: If signal A says "Col. Smith at NIWC" and signal B says "NIWC awarded contract to Booz Allen", we now have an indirect relationship between Col. Smith and Booz Allen.
- **Recency weighting**: Recent observations matter more. An entity mentioned 50 times 2 years ago but silent for 6 months is less relevant than one mentioned 5 times this month.

### Layer 3: Periodic Synthesis (new)

Instead of analyzing each signal in isolation, periodically synthesize accumulated observations into insights. This runs on a separate cron schedule (daily or on-demand).

```typescript
interface SynthesisTask {
  type: "competitor_assessment" | "stakeholder_briefing" | "agency_landscape" | "opportunity_alert";
  entityIds: string[];           // entities to synthesize
  observationWindow: string;     // e.g., "30d", "90d"
}
```

Examples:
- **Competitor Assessment**: "Booz Allen has won 12 contracts in the DevSecOps space in the last 90 days, primarily with Air Force and DISA. Their average award size is increasing. They appear to be building a Platform One competing practice." ← This insight is impossible from any single signal.
- **Stakeholder Briefing**: "Col. Smith has appeared in 8 signals over 6 months — 3 contract awards for cloud migration, 2 conference talks on zero trust, 1 budget hearing testimony. She is likely a key decision maker for NIWC's cloud modernization initiative."
- **Opportunity Alert**: "Agency X has issued 3 RFIs in the same space over 4 months, budget signals show $50M allocated, and they just hired a new program manager from industry. An RFP is likely imminent."

### Layer 4: Strategic Relevance (replaces current scoring)

Relevance is no longer a per-signal score. It's a computed property of an entity profile based on:
- **Observation density**: How often does this entity appear?
- **Recency**: Are appearances increasing or decreasing?
- **Domain overlap**: Does this entity operate in Amplify's competency areas?
- **Relationship proximity**: Is this entity connected to entities Amplify already engages with?
- **Action potential**: Are there signals suggesting upcoming decisions (budget, RFP, personnel moves)?

## Agent Framework: Cloudflare Agents

The pipeline stages are implemented as **Cloudflare Agents** — stateful AI agents running on Durable Objects with built-in SQLite, tool use, scheduling, and multi-turn reasoning.

### Why Cloudflare Agents

- **Already on Cloudflare** — no new infrastructure, same deployment model
- **Stateful by default** — each agent instance has persistent SQL storage and key-value state that survives restarts and deployments
- **Built-in agent loop** — `AIChatAgent` provides multi-turn tool calling with automatic message persistence, resumable streams, and `prepareStep` for dynamic model/tool switching between reasoning steps
- **Scheduling** — agents can schedule their own future work (cron, delayed tasks, task queues) without external orchestration
- **Tool use** — server-side tools with Zod schema validation, human-in-the-loop approval, and sub-agent delegation via `ToolLoopAgent`
- **Scales to millions of instances** — each entity could theoretically be its own agent instance

### Agent Design

Three agent types, each a Durable Object class:

**1. ObservationExtractorAgent**
- Triggered by cron or on-demand
- Uses tools: FPDS fetcher, SAM.gov fetcher, RSS fetcher (existing code, wrapped as agent tools)
- For each signal: calls AI to extract typed observations, stores them with raw entity names
- Uses `this.sql` for direct SQLite persistence (no Drizzle needed inside agents)
- Can use `prepareStep` to switch models if needed (cheap model for simple RSS, expensive for complex FPDS)

**2. EntityResolverAgent**
- Triggered by daily cron (batch resolution)
- Reads unresolved entity refs from observations
- Uses AI tool calling to fuzzy-match against canonical entity table + aliases
- Creates new entity profiles or links to existing ones
- Builds/updates entity relationships based on co-occurrence in observations
- Human merge/split corrections feed back into alias table

**3. SynthesisAgent**
- Triggered by daily cron (after entity resolution)
- For each entity with new observations since last synthesis:
  - Gathers observation timeline + relationships
  - Uses tools to query additional context (USAspending, Brave Search) when needed
  - Generates narrative summary, trajectory assessment, relevance score
  - Stores synthesis results on entity profile

### Shared State via D1

Agents use their own Durable Object SQLite for working state, but the **canonical data** (signals, observations, entities, relationships, insights) lives in D1 — the same database the Hono API reads from to serve the frontend. This keeps the existing API pattern intact: Hono endpoints query D1 via Drizzle, agents write to D1 as their output.

### Hono API Remains

The Hono app continues to serve the REST/OpenAPI endpoints. It does NOT become an agent. Agents are background processors; Hono is the read API. The cron handler dispatches to agents instead of calling ingestors directly.

## What Stays, What Changes, What's New

### Keep (fetchers are fine)
- FPDS fetcher/parser
- SAM.gov fetcher/parser
- RSS fetcher/parser
- Brave searcher (for targeted enrichment during synthesis)
- Page fetcher
- Hono API + Chanfana endpoints
- D1 as the canonical data store
- ETag middleware, structured logging

### Rework
- **SignalAnalyzer** → **ObservationExtractorAgent** — agentic, uses tools, extracts observations not analyses
- **StakeholderMatcher** → **EntityResolverAgent** — batch resolution with AI-assisted fuzzy matching
- **DossierExtractor** → absorbed into **SynthesisAgent** as a tool
- **Signal schema** — signals become simpler (raw content + source metadata)
- **Database schema** — new tables for observations, entity_profiles, entity_relationships, insights
- **Cron scheduler** — dispatches to agents instead of calling ingestors
- **wrangler.jsonc** — add Durable Object bindings for agent classes

### Remove
- Per-signal relevance scoring, outreach play assignment, competency mapping
- Immediate dossier building from web search on entity discovery
- CompetitorMatcher, StakeholderMatcher, BaseSignalIngestor
- `discovered_entities` table (replaced by entity resolution)
- `signal_entities` table (replaced by observations)

### New
- **Cloudflare Agents** — 3 agent classes (ObservationExtractor, EntityResolver, Synthesis)
- **Observation** data model and storage
- **EntityProfile** with aliases, relationships, accumulated attributes
- **Insights** — stored synthesis outputs per entity
- Agent tools wrapping existing fetchers/searchers

## Migration Strategy

**Clean break.** The system is pre-production. We will:
- Drop existing tables and data
- Create new schema from scratch
- Delete or archive old pipeline code as new code replaces it
- No backward compatibility shims

## Decisions on Open Questions

1. **Entity resolution**: Batch resolution via periodic cron — not inline during extraction. Observations are stored with raw entity names as extracted. A separate resolution job runs periodically to match/merge entities using AI-assisted fuzzy matching against the canonical entity table. The UI will also support manual merge/split for human intervention. Over time, confirmed resolutions feed back into the alias table, improving automated matching.

2. **Synthesis triggers**: Daily cron. Synthesis is a recurring process that runs on a schedule, generating updated insights from accumulated observations. On-demand synthesis can be added later but daily is the baseline.

3. **Storage**: Stay with D1/SQLite on Cloudflare. Relationship queries may require denormalization or materialized views, but we'll cross that bridge when performance demands it. Migration to hosted Postgres is an option if/when D1 becomes a bottleneck.

4. **Frontend**: The signal feed remains as a UI concept — it's the daily update stream showing what came in. The primary views shift to entity-centric, but the **existing REST API routes stay intact**. `/stakeholders` returns entity profiles (persons/agencies), `/competitors/activity` returns company entity activity, `/signals` returns the daily feed. `/kpis` and `/interactions` continue to return mock data until we backfill them with real data from the new pipeline. The frontend should not need route changes.

5. **AI cost**: Not a concern for now. Optimize later if needed.

6. **Existing data**: Clean break. Delete existing data, start fresh with the new schema.

## Implementation Plan

### Phase 1: Foundation — Schema + ObservationExtractorAgent
**Goal**: Signals flow in, observations come out, stored in D1.

1. **New D1 schema** — Design and migrate new tables: `signals` (simplified), `observations`, `observation_entities` (raw refs), `entity_profiles`, `entity_aliases`, `entity_relationships`, `insights`
2. **Zod schemas** — New schemas for Observation, EntityRef, EntityProfile, Insight (single source of truth)
3. **ObservationExtractorAgent** — Cloudflare Agent class with:
   - Tools: `fetchFpds`, `fetchSamGov`, `fetchRss` (wrap existing fetchers)
   - AI extraction: prompt to produce typed observations from signal content
   - D1 writes: store signals + observations
4. **Cron wiring** — Update scheduler to dispatch to ObservationExtractorAgent
5. **API endpoint** — `GET /signals` returns simplified signals with linked observations
6. **Verify** — Run cron, confirm signals → observations flow end-to-end

### Phase 2: Entity Resolution — EntityResolverAgent
**Goal**: Raw entity names in observations get resolved to canonical entity profiles.

1. **EntityResolverAgent** — Cloudflare Agent class with:
   - Tool: `queryEntityTable` — search existing entities by name/alias
   - Tool: `createEntity` — create new canonical entity profile
   - Tool: `linkObservation` — link observation entity ref to canonical entity
   - Tool: `addAlias` — add alias to entity profile
   - AI-assisted fuzzy matching in the agent loop
2. **Cron wiring** — Daily cron triggers EntityResolverAgent after ingestion
3. **Relationship building** — When two entities co-occur in the same observation, create/strengthen relationship edge
4. **API endpoints** — `GET /entities`, `GET /entities/:id` (profile + observations + relationships)
5. **Verify** — Run ingestion + resolution, confirm entities accumulate observations across signals

### Phase 3: Synthesis — SynthesisAgent
**Goal**: Entity profiles get periodic AI-generated insights.

1. **SynthesisAgent** — Cloudflare Agent class with:
   - Tool: `getEntityObservations` — fetch observation timeline for an entity
   - Tool: `getRelatedEntities` — traverse relationship graph
   - Tool: `searchBrave` — web search for additional context (wrap existing)
   - Tool: `fetchPage` — fetch page content (wrap existing)
   - Tool: `queryUsaSpending` — USAspending enrichment (wrap existing)
   - AI synthesis: generate narrative summary, trajectory, relevance score
2. **Cron wiring** — Daily cron triggers SynthesisAgent after entity resolution
3. **Insight storage** — Store synthesis results on entity profiles + separate insights table for history
4. **API endpoints** — `GET /entities/:id/insights`, entity profile now includes synthesis fields
5. **Verify** — Run full pipeline (ingest → resolve → synthesize), confirm insights appear

### Phase 4: Cleanup + Frontend Alignment
**Goal**: Remove old pipeline, align API with new frontend needs.

1. **Delete old code** — SignalAnalyzer, StakeholderMatcher, CompetitorMatcher, EntityEnricher, DossierExtractor, BaseSignalIngestor, old repositories
2. **Drop old tables** — signal_entities, discovered_entities, competitors, competitor_activities (via migration)
3. **API surface** — Existing routes stay, backed by new data:
   - `GET /signals` — daily feed (simplified signals + observation summaries)
   - `GET /stakeholders` — returns person/agency entity profiles (same route, new data source)
   - `GET /competitors/activity` — returns company entity activity (same route, new data source)
   - `GET /kpis` — continues returning mock data (backfill later)
   - `GET /interactions` — continues returning mock data (backfill later)
   - `GET /drafts` — continues returning mock data (backfill later)
   - New routes added only where needed (e.g., `POST /entities/:id/merge` for human dedup)
4. **Update CLAUDE.md** — Reflect new architecture
5. **Update overwatch-web types** — New schema exports, existing route contracts preserved

### Build Order Rationale

Each phase is independently valuable and testable:
- After Phase 1: we have a working ingestion pipeline producing richer structured data
- After Phase 2: we have entity accumulation — the core of the "big picture" thesis
- After Phase 3: we have strategic insights — the payoff
- Phase 4 is cleanup — can happen incrementally alongside Phase 3

Phases 1-3 are sequential — each depends on the previous. Within each phase, we follow TDD: failing test → minimal implementation → refactor.

## References

- Current pipeline: `src/signals/base-signal-ingestor.ts`, `signal-analyzer.ts`, `stakeholder-matcher.ts`
- Current enrichment: `src/enrichment/entity-enricher.ts`, `dossier-extractor.ts`
- Current schema: `src/db/schema.ts`
