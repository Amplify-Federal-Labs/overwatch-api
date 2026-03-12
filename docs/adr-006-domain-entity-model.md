# ADR-006: Domain Entity Model

## Status
Proposed

## Date
2026-03-10

## Context

Domain entities in the Overwatch API exist today as Zod validation schemas (`src/schemas/`), Drizzle table definitions (`src/db/schema.ts`), and ad-hoc TypeScript interfaces scattered across agent logic files, repositories, and materializers. There is no cohesive domain layer — business rules are embedded in pipeline orchestration code, repository helpers, and materializer functions.

For example:
- **"Is this entity enrichable?"** is a `Set` constant inside `entity-enricher.ts`
- **"What signal type does this observation produce?"** is a `Record` map inside `signal-materializer.ts`
- **"How do you match an alias?"** is a private method on `EntityResolver`
- **"How do you classify an entity mention as vendor vs competitor?"** is inline filtering logic in `materializeSignal()`
- **Entity profile creation defaults** (enrichmentStatus = "pending", observationCount = 0) are spread across `entity-profile-repository.ts` and `entity-resolver-logic.ts`

These behaviors belong to the domain entities themselves, not to the infrastructure that moves data through the pipeline. The current structure makes it hard to:
- **Reason about what an entity can do** without reading agent and pipeline code
- **Test domain rules in isolation** without importing agent or repository modules
- **Reuse domain logic** across different contexts (e.g., API endpoints, CLI tools, future UIs)

### Current entity definitions and their locations

| Entity | Zod schema | DB table | Ad-hoc interfaces | Behaviors scattered in |
|--------|-----------|----------|-------------------|----------------------|
| IngestedItem | `SignalAnalysisInputSchema` | `ingestedItems` | `IngestedItemWithObservations` | observation-extractor-logic, signal-materializer |
| Observation | `ObservationExtractionSchema` | `observations` | `ObservationWithEntities` | synthesis-repository, signal-materializer |
| EntityMention | `EntityRefSchema` | `observationEntities` | `UnresolvedEntity`, `UnresolvedGroup` | entity-profile-repository, entity-resolver-logic |
| EntityProfile | `EntityProfileSchema` | `entityProfiles` | `ProfileWithAliases`, `ProfileForEnrichment`, `ProfileForSynthesis` | entity-resolver, entity-resolver-logic, entity-enricher |
| EntityAlias | `EntityAliasSchema` | `entityAliases` | — | entity-resolver |
| EntityRelationship | `EntityRelationshipSchema` | `entityRelationships` | — | entity-profile-repository |
| Dossier | `DossierSchema` | JSON in `entityProfiles.dossier` | — | dossier-extractor, entity-enricher |
| Insight | `InsightSchema` | `insights` | `SynthesisInsight` | profile-synthesizer |
| Signal | `SignalSchema` | `signals` | `MaterializedSignal` | signal-materializer |

## Decision

Establish a **domain layer** (`src/domain/`) that defines entities, their properties, behaviors, and relationships — independent of data store, AI services, or pipeline orchestration.

### Domain entities and their behaviors

#### IngestedItem
Raw content from an external source. Immutable after creation.

```typescript
// Properties
id: string
sourceType: SignalSourceType
sourceName: string
sourceUrl: string | null
sourceLink: string | null
content: string
sourceMetadata: Record<string, string> | null
relevanceScore: number | null
relevanceRationale: string | null
competencyCodes: CompetencyCode[] | null
createdAt: string

// Relationships
observations: Observation[]

// Behaviors
isAboveRelevanceThreshold(threshold: number): boolean  // null scores pass (legacy)
```

#### Observation
A typed fact extracted from an ingested item. The fundamental unit of evidence.

```typescript
// Properties
id: string
type: ObservationType  // contract_award, solicitation, personnel_move, etc.
summary: string
attributes: Record<string, string> | null
sourceDate: string | null

// Relationships
ingestedItemId: string
entityMentions: EntityMention[]

// Derived
signalType: SignalType  // contract_award|solicitation → "opportunity", partnership → "competitor", rest → "strategy"
```

**Domain rule — observation-to-signal type mapping:**

| ObservationType | SignalType |
|----------------|-----------|
| contract_award | opportunity |
| solicitation | opportunity |
| partnership | competitor |
| budget_signal, technology_adoption, personnel_move, policy_change, program_milestone | strategy |

#### EntityMention
A raw entity reference within an observation. May or may not be resolved to a profile.

```typescript
// Properties
id: number
role: EntityRole           // "subject" | "object" | "mentioned"
entityType: EntityType     // person, agency, company, program, technology, contract_vehicle
rawName: string

// Resolution state
entityProfileId: string | null
resolvedAt: string | null

// Relationships
observationId: string

// Behaviors
isResolved(): boolean
confidence: number         // 1.0 if resolved, 0.5 if unresolved

// Classification (used during signal materialization)
isVendor(): boolean        // company + role === "subject"
isCompetitor(): boolean    // company + role !== "subject"
isStakeholder(): boolean   // person + resolved
isTechnology(): boolean    // entityType === "technology"
isAgency(): boolean        // entityType === "agency"
```

#### EntityProfile
A canonical, long-lived entity that accumulates evidence over time. Central aggregate of the domain.

```typescript
// Properties
id: string
type: EntityType
canonicalName: string
observationCount: number
summary: string | null
trajectory: string | null
relevanceScore: number | null
enrichmentStatus: EnrichmentStatus  // pending, enriched, failed, skipped
firstSeenAt: string
lastSeenAt: string
lastSynthesizedAt: string | null
lastEnrichedAt: string | null

// Relationships
aliases: EntityAlias[]
relationships: EntityRelationship[]
dossier: Dossier | null
insights: Insight[]

// Behaviors
isEnrichable(): boolean                    // only person, agency, company
matchesAlias(name: string): boolean        // case-insensitive exact match against all aliases
addAlias(alias: string, source: AliasSource): EntityAlias

// Factory
static create(type: EntityType, canonicalName: string): EntityProfile
  // Sets defaults: enrichmentStatus = "pending", observationCount = 0, etc.
```

**Domain rule — enrichable types:** Only `person`, `agency`, and `company` entities can be enriched. Types `program`, `contract_vehicle`, and `technology` are automatically skipped.

#### EntityAlias
A name variant for an entity profile.

```typescript
// Properties
id: number
alias: string
source: AliasSource  // "auto" | "manual"
createdAt: string

// Relationships
entityProfileId: string

// Behaviors
matches(name: string): boolean  // case-insensitive, trimmed comparison
```

#### EntityRelationship
A co-occurrence edge between two entity profiles.

```typescript
// Properties
id: number
type: RelationshipType  // works_at, manages, awarded_to, competes_with, partners_with, funds, oversees
observationCount: number
firstSeenAt: string
lastSeenAt: string

// Relationships
sourceEntityId: string
targetEntityId: string
```

#### Dossier (value object)
Structured profile data, discriminated by entity type.

```typescript
PersonDossier  { kind: "person",  title, org, branch, programs, rank, education, careerHistory, focusAreas, decorations }
AgencyDossier  { kind: "agency",  mission, branch, programs, parentOrg, leadership, focusAreas }
CompanyDossier { kind: "company", description, coreCapabilities, keyContracts, keyCustomers, leadership, headquarters }
```

**Domain rule — dossier kind must match entity type:**
- `person` → `PersonDossier`
- `agency` → `AgencyDossier`
- `company` → `CompanyDossier`

#### Insight (value object)
A synthesized intelligence nugget attached to an entity profile.

```typescript
// Properties
id: number
type: InsightType  // competitor_assessment, stakeholder_briefing, agency_landscape, opportunity_alert
content: string
observationWindow: string
observationCount: number
createdAt: string

// Relationships
entityProfileId: string
```

#### Signal (materialized, derived entity)
The UI-facing intelligence item. Fully derived from IngestedItem + Observations + EntityProfiles — not independently authored.

```typescript
// Properties
id: string
ingestedItemId: string
title: string
summary: string
date: string
branch: string          // first agency entity from observations
source: string
type: SignalType         // derived from primary observation type
relevance: number       // from override, or max of entity profile scores, or 0
relevanceRationale: string
tags: string[]           // technology entity names
competencies: CompetencyCode[]
play: string
sourceUrl: string
sourceMetadata: Record<string, string> | null

// Derived collections (from entity mentions)
vendors: string[]                        // company entities with role "subject"
competitors: string[]                    // company entities with role != "subject"
stakeholders: { id: string; name: string }[]  // resolved person entities, deduplicated
entities: { type: string; value: string; confidence: number }[]

// Factory
static materialize(item: IngestedItem, entityRelevanceScores: Record<string, number>, relevanceOverride?: RelevanceOverride): Signal
```

#### UnresolvedGroup (transient value object)
A batch of unresolved entity mentions grouped by normalized name. Used during entity resolution.

```typescript
// Properties
normalizedName: string
entityType: EntityType
mostCommonRawName: string
entities: { id: number; rawName: string }[]

// Factory
static fromMentions(mentions: EntityMention[]): UnresolvedGroup[]
  // Normalize by lowercase+trim, group, pick most frequent raw variant
```

### Domain rules summary

| Rule | Entity | Current location | Description |
|------|--------|-----------------|-------------|
| Enrichability | EntityProfile | `entity-enricher.ts:26` | Only person/agency/company |
| Observation → SignalType | Observation | `signal-materializer.ts:54-63` | Award/solicitation → opportunity, partnership → competitor, rest → strategy |
| Vendor classification | EntityMention | `signal-materializer.ts:90-94` | Company + subject role |
| Competitor classification | EntityMention | `signal-materializer.ts:96-100` | Company + non-subject role |
| Stakeholder identification | EntityMention | `signal-materializer.ts:102-106` | Person + resolved |
| Confidence assignment | EntityMention | `signal-materializer.ts:127` | Resolved → 1.0, unresolved → 0.5 |
| Alias matching | EntityProfile | `entity-resolver.ts:57-67` | Case-insensitive trimmed comparison |
| Name normalization | UnresolvedGroup | `entity-profile-repository.ts:70-108` | Lowercase + trim, group, pick most frequent variant |
| Dossier-type correspondence | Dossier | `dossier-extractor.ts:120-151` | Entity type determines expected dossier kind |
| Relevance threshold | IngestedItem | `observation-extractor-logic.ts` | Null scores pass (legacy), scored items compared to threshold |
| Search query building | EntityProfile | `brave-searcher.ts:15-45` | Context-aware query construction by entity type |
| Self-scheduling guard | Batch processing | `signal-materializer.ts:186`, `entity-enricher.ts:33` | Continue only if remaining > 0 AND progress > 0 |
| Blocked domains | URL filtering | `page-fetcher.ts:5-35` | .mil/.gov and social media domains rejected |

### File organization

```
src/domain/
├── ingested-item.ts         # IngestedItem entity
├── observation.ts           # Observation entity + ObservationType → SignalType mapping
├── entity-mention.ts        # EntityMention entity + classification behaviors
├── entity-profile.ts        # EntityProfile aggregate + alias matching + enrichability
├── entity-alias.ts          # EntityAlias value object
├── entity-relationship.ts   # EntityRelationship value object
├── dossier.ts               # Dossier discriminated union + type correspondence rule
├── insight.ts               # Insight value object
├── signal.ts                # Signal materialized entity + factory
├── unresolved-group.ts      # UnresolvedGroup transient value object + name normalization
├── types.ts                 # Shared enums (EntityType, ObservationType, SignalType, etc.)
└── index.ts                 # Barrel export
```

### What stays outside the domain layer

- **Repositories** (`src/db/`) — data access, row mapping, SQL queries
- **AI services** (`src/services/`, per ADR-005) — prompt construction, LLM calls, response parsing
- **Agents** (`src/agents/`) — Cloudflare DO lifecycle, task queuing, pipeline orchestration
- **Fetchers** (`src/signals/fpds/`, `rss/`, `sam-gov/`) — HTTP fetching, XML/JSON parsing from external sources
- **Enrichment infrastructure** (`src/enrichment/`) — Brave API client, page fetcher
- **API endpoints** (`src/endpoints/`) — HTTP routing, request/response mapping

### Migration approach

Incremental. Extract one entity at a time, starting with the entities that have the most scattered behavior:

1. **EntityMention** — classification behaviors (vendor/competitor/stakeholder/technology) currently inline in `materializeSignal()`
2. **Observation** — signal type mapping currently a `Record` constant in `signal-materializer.ts`
3. **EntityProfile** — enrichability check, alias matching, factory with defaults
4. **UnresolvedGroup** — name normalization currently in `entity-profile-repository.ts`
5. **Signal** — `materialize()` factory, currently the standalone `materializeSignal()` function
6. **IngestedItem** — relevance threshold check
7. **Remaining value objects** — EntityAlias, EntityRelationship, Dossier, Insight

Each step: move the behavior, update imports, run tests.

## Consequences

### Positive
- **Domain logic is discoverable** — "what can an EntityProfile do?" is answered by reading one file, not five
- **Testable without infrastructure** — domain entity tests need no DB, no AI client, no HTTP mocks
- **Reusable** — API endpoints, CLI tools, and future UIs import domain entities, not pipeline internals
- **Consistent defaults** — `EntityProfile.create()` is the single place for creation defaults, not scattered across repositories and resolvers
- **Clear vocabulary** — the domain layer establishes a ubiquitous language shared across the codebase

### Negative
- **More files** — 12 new files in `src/domain/`
- **Dual representation** — domain entities coexist with Zod schemas (API validation) and Drizzle tables (persistence). Mapping logic needed at boundaries.
- **Migration effort** — existing code in agents, repositories, and materializers must be updated to import from `src/domain/`

### Neutral
- Zod schemas in `src/schemas/` remain as the **API contract** — they define what crosses the HTTP boundary. Domain entities define what the system understands internally. These may converge over time but serve different purposes today.
- Drizzle schema in `src/db/schema.ts` remains as the **persistence contract**. Repositories map between domain entities and DB rows.
- The domain layer has no dependencies on infrastructure — it imports nothing from `src/db/`, `src/services/`, `src/agents/`, or `src/enrichment/`.
