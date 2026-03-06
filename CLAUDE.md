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
| AI | Cloudflare Workers AI (signal analysis, dossier extraction) |
| Search | Brave Search API (entity enrichment) |
| XML Parsing | fast-xml-parser (FPDS ATOM feeds, RSS) |
| Testing | Vitest (unit tests, colocated with source) |

## Project Structure

```
overwatch-api/
├── src/
│   ├── index.ts                              # Hono app: CORS, ETag, OpenAPI registry, router registration, cron handler
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
│   ├── data/                                 # Mock data (realistic, based on Amplify's actual profile)
│   │   ├── mock-kpis.ts
│   │   ├── mock-signals.ts
│   │   ├── mock-stakeholders.ts
│   │   ├── mock-competitors.ts
│   │   └── mock-drafts.ts
│   ├── db/                                   # Database layer (Drizzle ORM + D1)
│   │   ├── schema.ts                         # Drizzle schema (signals, signal_entities, discovered_entities, stakeholders)
│   │   ├── signal-repository.ts              # Signal & entity CRUD
│   │   ├── discovered-entity-repository.ts   # Discovered entities with status tracking
│   │   └── stakeholder-repository.ts         # Stakeholder CRUD (D1 + mock variants)
│   ├── signals/                              # Signal ingestion & analysis pipeline
│   │   ├── signal-ingestor.ts                # Master orchestrator: fetch → analyze → match → store
│   │   ├── signal-analyzer.ts                # AI analysis via Cloudflare Workers AI (CF_AIG)
│   │   ├── stakeholder-matcher.ts            # Match entities → stakeholders, discover new entities
│   │   ├── types.ts                          # SignalSourceType, RssFeedConfig
│   │   ├── fpds/
│   │   │   ├── fpds-contracts-fetcher.ts     # FPDS.gov ATOM feed (3-day lookback, paginated)
│   │   │   └── fpds-contracts-parser.ts      # XML → SignalAnalysisInput
│   │   ├── rss/
│   │   │   ├── rss-fetcher.ts                # GovConWire + FedScoop RSS feeds
│   │   │   └── rss-parser.ts                 # XML → SignalAnalysisInput
│   │   └── sam-gov/
│   │       ├── sam-gov-fetcher.ts            # SAM.gov opportunities + APBI events
│   │       └── sam-gov-parser.ts             # JSON → SignalAnalysisInput
│   ├── enrichment/                           # Discovered entity enrichment pipeline
│   │   ├── entity-enricher.ts                # Orchestrator: search → fetch pages → extract dossier
│   │   ├── brave-searcher.ts                 # Brave Search API (mil.gov, defense.gov, LinkedIn filters)
│   │   ├── page-fetcher.ts                   # Fetch & extract page text from search results
│   │   └── dossier-extractor.ts              # AI extraction of person/agency dossiers
│   ├── cron/
│   │   └── scheduler.ts                      # Hourly cron: cycles through fpds, rss, sam_gov, sam_gov_apbi, enrichment, enrichFailed
│   └── endpoints/
│       ├── kpis/                             # GET /kpis
│       ├── signals/                          # GET /signals (D1), POST /signals/analyze
│       ├── stakeholders/                     # GET /stakeholders
│       ├── competitors/                      # GET /competitors/activity
│       ├── interactions/                     # GET /interactions
│       ├── drafts/                           # GET /drafts, POST /drafts/:id/accept, POST /drafts/:id/reject
│       ├── cron/                             # POST /cron/:jobName (on-demand trigger)
│       └── tasks/                            # CRUD /tasks (D1-backed, pre-existing)
├── tests/
│   └── vitest.unit.config.mts               # Unit test config
├── migrations/                               # D1 SQL migrations (0001–0008)
├── wrangler.jsonc                            # Cloudflare Workers config (D1, cron triggers, AI binding)
├── worker-configuration.d.ts                 # Env type (DB, CF_AIG, BRAVE_SEARCH_API_KEY, SAM_GOV_API_KEY)
└── package.json
```

Unit tests are colocated with source files (e.g., `src/signals/signal-analyzer.test.ts`).

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
| CRUD | /tasks/* | Task management (D1-backed, pre-existing) |

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

### Signal Ingestion Pipeline
The `SignalIngestor` orchestrates a multi-step pipeline:
1. **Fetch** — Source-specific fetchers (FPDS, SAM.gov, RSS) pull raw data from government APIs and news feeds
2. **Analyze** — `SignalAnalyzer` sends raw content to Cloudflare Workers AI, which returns structured analysis (type, branch, tags, competencies, relevance score, outreach play, extracted entities)
3. **Match** — `StakeholderMatcher` matches extracted entities against existing stakeholders; discovers new entities (people/agencies with high confidence + high relevance)
4. **Store** — `SignalRepository` persists signals, entities, and matches to D1

### Entity Enrichment Pipeline
Discovered entities are enriched asynchronously via cron:
1. **Search** — `BraveSearcher` queries Brave Search with site filters (mil.gov, defense.gov, LinkedIn)
2. **Fetch** — `PageFetcher` retrieves full page text from search results
3. **Extract** — `DossierExtractor` uses AI to extract structured dossier data (name, title, org, branch, programs, education, career history)
4. **Store** — Enriched data is saved to the stakeholders table; entity status updated to `enriched`

**USAspending.gov enrichment (planned):** Once a stakeholder is identified, query USAspending.gov API (no auth) to enrich their dossier with: award history for their agency/program, spending trends, which primes and subs operate in their space, and funding trajectory. USAspending is an enrichment source only — NOT a signal source (it consumes FPDS data with a lag). FPDS ATOM feed is the authoritative signal source for contract awards.

### Cron Scheduling
Cloudflare Workers cron trigger fires hourly (`0 * * * *`). The `scheduler` cycles through 6 jobs round-robin: `fpds`, `rss`, `sam_gov`, `sam_gov_apbi`, `enrichment`, `enrichFailed`. Jobs can also be triggered on-demand via `POST /cron/:jobName`.

### Database (Drizzle + D1)
Drizzle ORM provides type-safe access to D1. Key tables: `signals`, `signal_entities`, `discovered_entities`, `stakeholders`. Schema defined in `src/db/schema.ts`. Migrations in `migrations/` (0001–0008).

### ETag Caching
Middleware in `src/middleware/etag.ts` computes SHA-256 of GET response bodies and returns `304 Not Modified` when the client sends a matching `If-None-Match` header.

### Structured Logging
`src/logger.ts` provides structured JSON logging with levels controlled by `LOG_LEVEL` env var.

### Testing Strategy
- Unit tests are colocated with source files (e.g., `src/signals/signal-analyzer.test.ts`)
- Run with `npm test` (standard Vitest, config: `tests/vitest.unit.config.mts`)
- Tests mock external dependencies (AI, fetch, D1) — no Workers pool required

### CORS
Configured in `src/index.ts` via `hono/cors`. Currently allows `http://localhost:5173` (Vite dev server). Update the `origin` array when deploying to production.

## Environment Bindings

Defined in `worker-configuration.d.ts`:
- `DB` — Cloudflare D1 database
- `CF_AIG_TOKEN`, `CF_AIG_BASEURL`, `CF_AIG_MODEL` — Cloudflare Workers AI
- `BRAVE_SEARCH_API_KEY` — Brave Search API
- `SAM_GOV_API_KEY` — SAM.gov API
- `LOG_LEVEL` — Logging verbosity (DEBUG, INFO, WARN, ERROR)

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
1. **Structured APIs** — FPDS ATOM feed for contract awards (already built, primary signal source), SAM.gov (free key) for opportunities. USAspending.gov (no auth) is used for stakeholder dossier enrichment only, NOT as a signal source.
2. **RSS feeds** — defense.gov contracts, trade press (Defense One, Breaking Defense, Fed News Network, GovConWire, FedScoop — already built)
3. **Google News RSS as .mil proxy** — `news.google.com/rss/search?q=site:army.mil+keyword` returns headlines from .mil content Google has already crawled. This is the primary workaround for branch-specific news.
4. **Google Alerts RSS** — keyword monitoring (software factory, Platform One, IL5, IL6, STIG, DevSecOps, APFIT, Advana, Game Warden) scoped to .mil/.gov
5. **Competitor/vendor press pages** — commercial sites (ECS, Booz Allen, SAIC, etc.) usually don't block bots
6. **Direct PDF downloads** — budget docs, STIG guides, strategy papers often work as direct URL fetches

When adding new ingestion sources, always verify access method works before building. Never write fetchers that hit .mil/.gov HTML pages directly.

## What's NOT Built Yet
- **Google News RSS proxy** — .mil/.gov content via Google News site-scoped queries (highest priority next source)
- **Email sending** — Resend integration for accepted drafts
- **Production CORS origins** — needs real Pages domain added
- **Authentication** — no auth layer yet
