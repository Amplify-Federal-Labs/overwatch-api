# ADR-005: AI Service Facades

## Status
Accepted (implemented 2026-03-10)

## Date
2026-03-10

## Context

AI-dependent behaviors are currently embedded directly in agent logic and processing modules. For example, `SignalRelevanceScorer` constructs prompts, calls the OpenAI-compatible client, and parses raw LLM responses — all within the same class that domain orchestration code depends on. This couples domain logic to:

1. **LLM prompt engineering** — prompt templates, JSON extraction, response parsing
2. **AI client infrastructure** — OpenAI-compatible HTTP client, CF Workers AI binding
3. **Error recovery** — malformed LLM output, retry semantics, fallback defaults

This makes it difficult to:
- **Test domain logic deterministically** — tests must mock the AI client or stub entire classes
- **Swap AI providers** — changing from CF Workers AI to another provider touches domain-adjacent code
- **Reason about domain behavior** — business rules (e.g., "only enrich person/agency/company") are interleaved with AI plumbing

### Current state

Five AI-dependent behaviors exist, each with a well-defined input/output contract already implicit in the code:

| Behavior | Current location | Coupling |
|----------|-----------------|----------|
| Observation extraction | `ObservationExtractorAgent` (inline) | Prompt + parse + domain orchestration in one place |
| Fuzzy entity matching | `EntityResolver.resolveGroup()` | AI match call mixed with exact-match domain logic |
| Relevance scoring | `SignalRelevanceScorer` | Standalone class, but consumers depend on concrete implementation |
| Profile synthesis | `ProfileSynthesizer` | Standalone class, same issue |
| Dossier extraction | `DossierExtractor` | Standalone class, same issue |

## Decision

Extract each AI-dependent behavior behind a **service interface** (TypeScript interface). The interface defines a typed contract — domain code depends only on the interface, never on the LLM implementation.

### Service interfaces

```typescript
interface ObservationExtractionService {
  extract(content: string, sourceType: string): Promise<ObservationExtraction[]>;
}

interface FuzzyEntityMatchingService {
  match(
    candidateName: string,
    entityType: string,
    existingProfiles: Array<{ id: string; canonicalName: string; aliases: string[] }>
  ): Promise<{ match: string | null; confidence: number }>;
}

interface RelevanceScoringService {
  score(input: RelevanceInput): Promise<RelevanceResult>;
}

interface ProfileSynthesisService {
  synthesize(
    entityName: string,
    entityType: string,
    observationContext: string
  ): Promise<SynthesisOutput>;
}

interface DossierExtractionService {
  extract(
    entityName: string,
    entityType: string,
    pageTexts: string[]
  ): Promise<Dossier | null>;
}
```

### What lives inside each service implementation

- Prompt construction
- LLM client call (OpenAI-compatible, CF Workers AI, etc.)
- Raw response parsing (`parseRelevanceResponse`, `parseSynthesisResponse`, etc.)
- Response validation and fallback defaults
- Any LLM-specific error handling

### What stays outside (domain layer)

- Orchestration logic (e.g., "extract observations, then score relevance, then gate")
- Pure domain rules (e.g., exact alias matching, enrichability check, signal type derivation)
- Entity lifecycle management (create profile, add alias, resolve group)
- Batch processing and self-scheduling logic

### File organization

```
src/
├── services/                          # Service interfaces (pure contracts, no dependencies)
│   ├── index.ts                       # Barrel export
│   ├── observation-extraction.ts      # ObservationExtractionService + ObservationExtractionInput
│   ├── fuzzy-entity-matching.ts       # FuzzyEntityMatchingService + FuzzyMatchCandidate/Result
│   ├── relevance-scoring.ts           # RelevanceScoringService + RelevanceInput/Result
│   ├── profile-synthesis.ts           # ProfileSynthesisService + SynthesisOutput/Insight
│   └── dossier-extraction.ts          # DossierExtractionService
├── agents/                            # AI-backed implementations (in-place, implements interfaces)
│   ├── observation-extractor.ts       # ObservationExtractor implements ObservationExtractionService
│   ├── entity-match-ai.ts             # AiFuzzyEntityMatcher implements FuzzyEntityMatchingService
│   ├── signal-relevance-scorer.ts     # SignalRelevanceScorer implements RelevanceScoringService
│   └── profile-synthesizer.ts         # ProfileSynthesizer implements ProfileSynthesisService
├── enrichment/
│   └── dossier-extractor.ts           # DossierExtractor implements DossierExtractionService
```

> **Implementation note**: Rather than moving implementations to `services/ai/`, we kept them in their original locations and added `implements` clauses. This avoided disruptive file moves while achieving the same decoupling. The agent DOs remain the wiring layer that constructs concrete implementations.

### Dependency injection

Agent logic and orchestrators receive service interfaces via constructor or function parameters — the same dependency injection pattern already used for repositories.

```typescript
// Before: agent depends on concrete AI class
const scorer = new SignalRelevanceScorer(aiClient);
const result = await scorer.score(input);

// After: agent depends on interface, injected at construction
class ObservationExtractorLogic {
  constructor(
    private relevanceScoring: RelevanceScoringService,
    private observationExtraction: ObservationExtractionService,
  ) {}
}
```

Cloudflare Agent DOs (the infrastructure layer) wire up the concrete `Ai*` implementations when constructing logic classes.

## Consequences

### Positive
- **Deterministic domain tests** — mock the service interface with canned responses; no AI client stubbing
- **Clear domain boundary** — domain logic never sees prompts, raw LLM text, or AI client details
- **Provider swappability** — change AI provider by writing a new implementation of the same interface
- **Explicit contracts** — each service's input/output types serve as documentation of what the AI is responsible for
- **Incremental migration** — each service can be extracted independently; no big-bang refactor required

### Negative
- **More files** — 5 interface files + 5 implementation files added
- **Indirection** — one more hop to trace from domain code to AI call

### Neutral
- No runtime behavior change — this is a structural refactor only
- Existing tests for parsers (`parseRelevanceResponse`, etc.) move into the `services/ai/` implementations
- The AI client (`OpenAI`-compatible) remains an implementation detail of the `ai/` layer
