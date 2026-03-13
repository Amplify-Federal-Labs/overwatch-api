# CLAUDE.md — Overwatch API

## What is Overwatch API?

Backend API for **Overwatch**, Amplify Federal's intelligence and relationship management platform. Serves the overwatch-web frontend (pure static SPA) with structured data via OpenAPI 3.1 endpoints. Includes automated signal ingestion from government data sources, AI-powered analysis, and entity enrichment pipelines.

See `overwatch-web/CLAUDE.md` for full domain context (competency clusters, outreach plays, relationship stages, stakeholder dossier structure, outreach philosophy).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript |
| Framework | Hono |
| OpenAPI | Chanfana 2.x (auto-generates OpenAPI 3.1 spec from Zod schemas) |
| Validation | Zod |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM |
| Runtime | Cloudflare Workers |
| Async Processing | Cloudflare Queues (6 queues, event-driven pipeline) |
| AI | Cloudflare Workers AI (observation extraction, relevance scoring, synthesis, dossier extraction) |
| Search | Brave Search API (entity enrichment) |
| XML Parsing | fast-xml-parser (RSS feeds) |
| Testing | Vitest (unit tests, colocated with source) |

## Project Structure

```
overwatch-api/
├── src/
│   ├── index.ts                              # Hono app: CORS, ETag, OpenAPI registry, router registration, cron + queue handlers
│   ├── types.ts                              # AppContext type alias
│   ├── logger.ts                             # Structured JSON logger with levels (DEBUG, INFO, WARN, ERROR)
│   ├── middleware/
│   │   └── etag.ts                           # HTTP 304 Not Modified caching via SHA-256 ETags
│   ├── schemas/                              # Zod schemas — single source of truth for all domain types
│   │   ├── kpi.ts
│   │   ├── signal.ts                         # Signal, SignalAnalysis, SignalAnalysisInput/Result, source metadata
│   │   ├── stakeholder.ts                    # Stakeholder + nested types (ContactInfo, MilitaryBio, etc.)
│   │   ├── competitor.ts                     # CompetitorActivity, ThreatLevel
│   │   ├── interaction.ts
│   │   ├── draft.ts                          # EmailDraft, EmailDraftContext, EmailDraftStatus
│   │   ├── constants.ts                      # OutreachPlay, CompetencyCluster
│   │   └── index.ts                          # Barrel export (schemas + inferred types)
│   ├── domain/                               # Domain model types and pure logic
│   │   ├── entity-profile.ts, entity-alias.ts, entity-relationship.ts
│   │   ├── entity-mention.ts, unresolved-group.ts
│   │   ├── observation.ts, ingested-item.ts
│   │   ├── signal.ts, insight.ts, dossier.ts
│   │   └── *.test.ts                         # Colocated unit tests
│   ├── db/                                   # Database layer (Drizzle ORM + D1)
│   │   ├── schema.ts                         # Drizzle schema (ingested_items, signals, observations, entity_profiles, etc.)
│   │   ├── observation-repository.ts          # Ingested items & observations CRUD
│   │   ├── signal-repository.ts              # Materialized signals CRUD (with filtering)
│   │   ├── entity-profile-repository.ts      # Entity profiles, aliases, resolution
│   │   ├── synthesis-repository.ts           # Synthesis queries, insights
│   │   └── enrichment-repository.ts          # Entity enrichment status tracking
│   ├── agents/                               # Pure AI logic (no DO runtime dependency)
│   │   ├── observation-extractor.ts           # AI extraction of typed observations from raw content
│   │   ├── entity-resolver.ts                 # Entity resolution: alias match + AI fuzzy matching
│   │   ├── entity-match-ai.ts                 # AI-powered fuzzy entity name matching
│   │   ├── profile-synthesizer.ts             # AI synthesis: summary, trajectory, relevance, insights
│   │   ├── signal-materializer.ts             # Pure function: materializeSignal() transforms items → signals
│   │   ├── signal-relevance-scorer.ts         # AI relevance scoring (0-100) for Amplify Federal
│   │   └── relevance-gate.ts                  # Threshold-based filtering + input building
│   ├── queues/                               # Cloudflare Queue consumers (event-driven pipeline)
│   │   ├── types.ts                           # QueueMessage discriminated union (6 message types)
│   │   ├── queue-router.ts                    # Routes messages to handler functions by type
│   │   ├── build-handlers.ts                  # Wires consumers with concrete dependencies from Env
│   │   ├── ingestion-consumer.ts              # Fetch sources → dedup → store → produce ExtractionMessages
│   │   ├── extraction-consumer.ts             # AI extract observations → score relevance → gate → produce ResolutionMessages
│   │   ├── resolution-consumer.ts             # Resolve entities → fan-out SynthesisMessages + EnrichmentMessages
│   │   ├── synthesis-consumer.ts              # AI synthesize profiles → store insights → produce MaterializationMessages
│   │   ├── enrichment-consumer.ts             # Brave Search → fetch pages → AI dossier extraction
│   │   └── materialization-consumer.ts        # materializeSignal() → upsert to signals table
│   ├── signals/                              # Source-specific fetchers and parsers
│   │   ├── types.ts                          # SignalSourceType, RssFeedConfig
│   │   ├── contract-awards/
│   │   │   ├── contract-awards-fetcher.ts    # SAM.gov Contract Awards API (3-day lookback, paginated)
│   │   │   └── contract-awards-parser.ts     # JSON → SignalAnalysisInput
│   │   ├── rss/
│   │   │   ├── rss-fetcher.ts                # GovConWire + FedScoop RSS feeds
│   │   │   └── rss-parser.ts                 # XML → SignalAnalysisInput
│   │   └── sam-gov/
│   │       ├── sam-gov-fetcher.ts            # SAM.gov opportunities + APBI events
│   │       └── sam-gov-parser.ts             # JSON → SignalAnalysisInput
│   ├── enrichment/                           # Entity enrichment components
│   │   ├── brave-searcher.ts                 # Brave Search API (context-aware queries, site filters)
│   │   ├── page-fetcher.ts                   # Fetch & extract page text from search results
│   │   └── dossier-extractor.ts              # AI extraction of person/agency/company dossiers
│   ├── cron/
│   │   ├── scheduler.ts                      # Cron scheduling, on-demand dispatch, dispatchOnDemandJob()
│   │   ├── recovery.ts                       # diagnoseStuckStages() pure logic
│   │   ├── run-recovery.ts                   # Recovery orchestrator (queue-based dispatch)
│   │   └── recovery-repository.ts            # Pipeline health queries (counts of stuck items)
│   └── endpoints/
│       ├── kpis/                             # GET /kpis
│       ├── signals/                          # GET /signals (D1), POST /signals/analyze
│       ├── stakeholders/                     # GET /stakeholders
│       ├── competitors/                      # GET /competitors/activity
│       ├── interactions/                     # GET /interactions
│       ├── drafts/                           # GET /drafts, POST /drafts/:id/accept, POST /drafts/:id/reject
│       ├── cron/                             # POST /cron/:jobName (on-demand trigger)
│       ├── counts/                           # GET /counts
│       └── metrics/                          # GET /metrics
├── docs/
│   └── pipeline-processing-report.md         # Full lifecycle of an ingested item through the pipeline
├── tests/
│   └── vitest.unit.config.mts               # Unit test config
├── migrations/                               # D1 SQL migrations (0001–0013)
├── wrangler.jsonc                            # Cloudflare Workers config (D1, queues, cron triggers)
├── worker-configuration.d.ts                 # Env type (DB, queues, AI, API keys)
└── package.json
```

Unit tests are colocated with source files (e.g., `src/queues/extraction-consumer.test.ts`).

## Key Commands

```bash
npm run dev         # Seed local D1 + start wrangler dev server (port 8787)
npm test            # Unit tests (standard Vitest)
npm run lint        # TypeScript type checking (tsc --noEmit)
npm run deploy      # Apply remote D1 migrations + deploy to Cloudflare
npm run schema      # Generate OpenAPI spec via Chanfana CLI
npm run cf-typegen  # Regenerate worker-configuration.d.ts from wrangler.jsonc
```

## API Endpoints

All endpoints return Chanfana envelope: `{ success: boolean, result: T }`

| Method | Route | Description |
|--------|-------|-------------|
| GET | /kpis | Dashboard KPI metrics |
| GET | /signals | Intelligence signals from D1 |
| POST | /signals/analyze | AI-powered signal analysis |
| GET | /stakeholders | Stakeholder dossiers with full nested data |
| GET | /competitors/activity | Competitor activity feed |
| GET | /interactions | Interaction history log |
| GET | /drafts | Email draft list |
| POST | /drafts/:id/accept | Accept an email draft |
| POST | /drafts/:id/reject | Reject an email draft |
| POST | /cron/:jobName | On-demand cron job trigger |
| GET | /counts | Pipeline stage counts |
| GET | /metrics | Pipeline health metrics |

OpenAPI docs available at `/` when running locally.

## Architecture Decisions

### Zod as Single Source of Truth
All domain types are defined as Zod schemas in `src/schemas/`. TypeScript types are inferred via `z.infer<>`. The overwatch-web frontend imports these types through the npm workspace link:
```typescript
import type { Stakeholder, Signal } from "overwatch-api/schemas";
```
This is enabled by the `exports` field in package.json: `"./schemas": "./src/schemas/index.ts"`.

### Chanfana/OpenAPI Pattern
Every endpoint extends `OpenAPIRoute` with Zod schema definitions for request/response. Chanfana auto-generates the OpenAPI 3.1 spec and validates request/response payloads. Follow the existing pattern in any endpoint file (e.g., `endpoints/kpis/kpiList.ts`).

### Router Pattern
Each endpoint group has a `router.ts` that creates a Hono sub-app, registers endpoints via Chanfana's `fromHono()`, and exports the router. The main `index.ts` mounts routers with `openapi.route("/path", router)`.

### Evidence-Based Intelligence Pipeline (Cloudflare Queues)
The system uses an event-driven, queue-based pipeline with 6 Cloudflare Queues:

```
CRON (hourly) → INGESTION_QUEUE → EXTRACTION_QUEUE → RESOLUTION_QUEUE
                                                          ↓
                                           ┌──────────────┴──────────────┐
                                    SYNTHESIS_QUEUE              ENRICHMENT_QUEUE
                                           ↓                      (terminal)
                                  MATERIALIZATION_QUEUE
                                           ↓
                                      signals table
```

1. **Ingestion** (`INGESTION_QUEUE`, batch 1) — Cron-triggered. Fetches raw content (SAM.gov Contract Awards, SAM.gov Opportunities, RSS) → dedup by source_link → stores as `ingested_items` → produces ExtractionMessages
2. **Extraction** (`EXTRACTION_QUEUE`, batch 5) — AI extracts typed observations with entity mentions → fetches source page (best-effort) → AI scores relevance (0-100) → items scoring ≥ threshold produce ResolutionMessages; below-threshold items stop here (stored for audit)
3. **Resolution** (`RESOLUTION_QUEUE`, batch 10) — Resolves raw entity names to canonical `entity_profiles` via exact alias match + AI fuzzy matching → fans out SynthesisMessages (all resolved profiles) + EnrichmentMessages (new enrichable profiles) in parallel
4. **Synthesis** (`SYNTHESIS_QUEUE`, batch 5) — AI synthesizes observations into summaries, trajectories, relevance scores, and insights → produces MaterializationMessages for each linked ingested item
5. **Enrichment** (`ENRICHMENT_QUEUE`, batch 1) — Enriches new entity profiles via Brave Search → page fetch → AI dossier extraction. Terminal — no downstream chaining
6. **Materialization** (`MATERIALIZATION_QUEUE`, batch 10) — Pure function `materializeSignal()` transforms ingested items + observations into materialized `signals` table rows. Terminal stage

**Message granularity**: 1 message = 1 unit of work. Messages are a discriminated union on `type` field (see `src/queues/types.ts`).

**Error handling**: All queues have `max_retries: 3` with dead-letter queue (`overwatch-dlq`). Failed messages are retried, then moved to DLQ.

**Queue handler** (`src/index.ts`): Builds handlers once per batch via `buildQueueHandlers()`, routes each message through `routeQueueMessage()`.

**Dependency injection**: All consumers accept a `deps` object with interfaces for repositories, AI clients, queues, and loggers. Concrete implementations wired in `buildQueueHandlers()` (`src/queues/build-handlers.ts`).

**Important**: When passing `fetch` to consumers in Workers, wrap it as `(input, init) => fetch(input, init)` to avoid "Illegal invocation" errors from lost `this` binding.

For the full processing lifecycle of an ingested item, see [docs/pipeline-processing-report.md](docs/pipeline-processing-report.md).

### Signal Materialization (ADR-002)
Raw ingested content is separate from what the UI sees as "signals":
- `ingested_items` table: raw content from SAM.gov Contract Awards, SAM.gov Opportunities, RSS (with relevance score after extraction)
- `signals` table: materialized with `branch`, `type`, `relevance`, `tags`, `competitors`, `vendors`, `stakeholderIds`, `entities`
- `GET /signals` queries the materialized table directly with DB-level filtering (branch, type, relevance) and sorting (relevance DESC)
- Pure logic in `materializeSignal()` function, tested independently

### Early Relevance Gate (ADR-004)
After observation extraction, each ingested item is scored for relevance to Amplify Federal (0-100). Items scoring below `RELEVANCE_THRESHOLD` (default: 60, configurable via env var) are excluded from all downstream processing (entity resolution, synthesis, enrichment, materialization). All items are stored with their scores for audit and threshold tuning.

### Entity Enrichment Pipeline
Entity profiles are enriched via the `ENRICHMENT_QUEUE`. The resolution consumer sends `EnrichmentMessage` for each newly created profile of enrichable type (`person`, `agency`, `company`). Can also be triggered on-demand via `POST /cron/enrichment` (queries DB for all `pending` profiles). Non-enrichable types (`program`, `contract_vehicle`, `technology`) are never enqueued.

Per profile:
1. **Search** — `BraveSearcher` queries Brave Search with context-aware queries (uses co-occurring entities from observations to build better search terms, e.g. `"Michael T. Geegan" "Department of the Army"` instead of generic `Michael T. Geegan defense government official`)
2. **Fetch** — `PageFetcher` retrieves full page text from search results
3. **Extract** — `DossierExtractor` uses AI to extract structured dossier data (person, agency, or company dossier based on entity type)
4. **Store** — Enriched dossier saved to entity profile

**Dossier types** (discriminated union on `kind`):
- `PersonDossier` — title, org, branch, programs, rank, education, careerHistory, focusAreas, decorations
- `AgencyDossier` — mission, branch, programs, parentOrg, leadership, focusAreas
- `CompanyDossier` — description, coreCapabilities, keyContracts, keyCustomers, leadership, headquarters

### Cron Scheduling
Cloudflare Workers cron fires hourly (`0 * * * *`). The scheduler maps fixed UTC hours to jobs:

| UTC Hour | Job |
|----------|-----|
| 0 (midnight) | RSS ingestion |
| 1 | SAM.gov ingestion |
| 2 | Contract awards ingestion (SAM.gov) |
| 3+ | Pipeline recovery (detect & re-dispatch stuck stages) |

All downstream processing (extraction, entity resolution, synthesis, enrichment, materialization) is triggered automatically via queue chaining after ingestion.

**On-demand jobs** via `POST /cron/:jobName`:
- Ingestion: `rss`, `sam_gov`, `contract_awards` → sends IngestionMessage to queue
- Processing: `synthesis`, `enrichment`, `signal_materialization` → scans DB for pending work, produces individual queue messages
- `entity_resolution` → cannot be triggered on-demand (requires observation-level data); use `recovery` instead
- `recovery` → diagnoses stuck pipeline stages and dispatches queue messages for all stuck stages

### Database (Drizzle + D1)
Drizzle ORM provides type-safe access to D1. Key tables: `ingested_items`, `signals` (materialized), `observations`, `observation_entities`, `entity_profiles`, `entity_aliases`, `entity_relationships`, `insights`. Schema defined in `src/db/schema.ts`. Migrations in `migrations/` (0001–0013).

### ETag Caching
Middleware in `src/middleware/etag.ts` computes SHA-256 of GET response bodies and returns `304 Not Modified` when the client sends a matching `If-None-Match` header.

### Structured Logging
`src/logger.ts` provides structured JSON logging with levels controlled by `LOG_LEVEL` env var.

### Testing Strategy
- Unit tests are colocated with source files (e.g., `src/queues/extraction-consumer.test.ts`)
- Run with `npm test` (standard Vitest, config: `tests/vitest.unit.config.mts`)
- Tests mock external dependencies (AI, fetch, D1) — no Workers pool required
- All consumers use dependency injection, making them fully testable without queue or Workers runtime

### CORS
Configured in `src/index.ts` via `hono/cors`. Allows `http://localhost:5173` (Vite dev), `https://overwatch-d0f.pages.dev`, and `https://*.overwatch-d0f.pages.dev`.

## Environment Bindings

Defined in `worker-configuration.d.ts`:
- `DB` — Cloudflare D1 database
- `INGESTION_QUEUE`, `EXTRACTION_QUEUE`, `RESOLUTION_QUEUE`, `SYNTHESIS_QUEUE`, `ENRICHMENT_QUEUE`, `MATERIALIZATION_QUEUE` — Cloudflare Queues
- `CF_AIG_TOKEN`, `CF_AIG_BASEURL`, `CF_AIG_MODEL` — Cloudflare Workers AI
- `BRAVE_SEARCH_API_KEY` — Brave Search API
- `SAM_GOV_API_KEY` — SAM.gov API
- `LOG_LEVEL` — Logging verbosity (DEBUG, INFO, WARN, ERROR)
- `RELEVANCE_THRESHOLD` — Minimum relevance score (0-100) for downstream processing (default: 60)

## Workspace Setup

This project is part of an npm workspace monorepo:
```
overwatch/
├── package.json          # workspaces: ["overwatch-api", "overwatch-web"]
├── overwatch-api/        # This project
└── overwatch-web/        # Frontend SPA (imports types from overwatch-api)
```
Run `npm install` from the monorepo root to link workspaces.

## TypeScript
- Strict mode. No `any` types.
- Domain types: always define as Zod schema first, then export inferred type.
- Env bindings typed in `worker-configuration.d.ts`.

## Critical Constraint: .mil/.gov Bot Detection

Most .mil and .gov sites (army.mil, navy.mil, af.mil, disa.mil, marines.mil, etc.) block non-browser HTTP requests with 403 Forbidden. **Direct HTML scraping of these sites is not viable and must never be attempted.**

Viable ingestion methods (in priority order):
1. **Structured APIs** — SAM.gov Contract Awards API for contract awards (already built, primary signal source), SAM.gov Opportunities API (free key) for solicitations/pre-solicitations. USAspending.gov (no auth) is used for stakeholder dossier enrichment only, NOT as a signal source.
2. **RSS feeds** — defense.gov contracts, trade press (Defense One, Breaking Defense, Fed News Network, GovConWire, FedScoop — already built)
3. **Google News RSS as .mil proxy** — `news.google.com/rss/search?q=site:army.mil+keyword` returns headlines from .mil content Google has already crawled. This is the primary workaround for branch-specific news.
4. **Google Alerts RSS** — keyword monitoring (software factory, Platform One, IL5, IL6, STIG, DevSecOps, APFIT, Advana, Game Warden) scoped to .mil/.gov
5. **Competitor/vendor press pages** — commercial sites (ECS, Booz Allen, SAIC, etc.) usually don't block bots
6. **Direct PDF downloads** — budget docs, STIG guides, strategy papers often work as direct URL fetches

When adding new ingestion sources, always verify access method works before building. Never write fetchers that hit .mil/.gov HTML pages directly.

## What's NOT Built Yet
- **Google News RSS proxy** — .mil/.gov content via Google News site-scoped queries (highest priority next source)
- **DLQ consumer** — Dead-letter queue monitoring and alerting
- **Email sending** — Resend integration for accepted drafts
- **Authentication** — no auth layer yet
