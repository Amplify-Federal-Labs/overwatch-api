# CLAUDE.md — Overwatch API

## What is Overwatch API?

Backend API for **Overwatch**, Amplify Federal's intelligence and relationship management platform. Serves the overwatch-web frontend (pure static SPA) with structured data via OpenAPI 3.1 endpoints.

See `overwatch-web/CLAUDE.md` for full domain context (competency clusters, outreach plays, relationship stages, stakeholder dossier structure, outreach philosophy).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript |
| Framework | Hono |
| OpenAPI | Chanfana 2.x (auto-generates OpenAPI 3.1 spec from Zod schemas) |
| Validation | Zod |
| Database | Cloudflare D1 (SQLite) — used by tasks CRUD; other endpoints use mock data |
| Runtime | Cloudflare Workers |
| AI | OpenAI gpt-4o-mini (signal analysis agent) |
| Testing | Vitest + @cloudflare/vitest-pool-workers (integration), Vitest standalone (unit) |

## Project Structure

```
overwatch-api/
├── src/
│   ├── index.ts                          # Hono app: CORS, OpenAPI registry, router registration
│   ├── types.ts                          # Legacy types (tasks)
│   ├── schemas/                          # Zod schemas — single source of truth for all domain types
│   │   ├── kpi.ts
│   │   ├── signal.ts                     # Signal, SignalAnalysis, enums
│   │   ├── stakeholder.ts               # Stakeholder + nested types (ContactInfo, MilitaryBio, etc.)
│   │   ├── competitor.ts                 # CompetitorActivity, ThreatLevel
│   │   ├── interaction.ts
│   │   ├── draft.ts                      # EmailDraft, EmailDraftContext, EmailDraftStatus
│   │   ├── constants.ts                  # OutreachPlay, CompetencyCluster
│   │   └── index.ts                      # Barrel export (schemas + inferred types)
│   ├── data/                             # Mock data (realistic, based on Amplify's actual profile)
│   │   ├── mock-kpis.ts
│   │   ├── mock-signals.ts
│   │   ├── mock-stakeholders.ts
│   │   ├── mock-competitors.ts
│   │   └── mock-drafts.ts
│   ├── agents/
│   │   └── signal-agent.ts              # OpenAI-powered signal analysis (gpt-4o-mini)
│   └── endpoints/
│       ├── kpis/                         # GET /kpis
│       ├── signals/                      # GET /signals, POST /signals/analyze
│       ├── stakeholders/                 # GET /stakeholders
│       ├── competitors/                  # GET /competitors/activity
│       ├── interactions/                 # GET /interactions
│       ├── drafts/                       # GET /drafts, POST /drafts/:id/accept, POST /drafts/:id/reject
│       ├── tasks/                        # CRUD /tasks (pre-existing, uses D1)
│       └── dummyEndpoint.ts             # Example Chanfana endpoint
├── tests/
│   ├── integration/                      # Workers pool tests (SELF.fetch)
│   │   ├── kpis.test.ts
│   │   ├── signals.test.ts
│   │   ├── stakeholders.test.ts
│   │   ├── competitors.test.ts
│   │   ├── interactions.test.ts
│   │   └── drafts.test.ts
│   ├── unit/                             # Standard Vitest (no Workers pool)
│   │   ├── signal-agent.test.ts
│   │   └── signal-analyze-route.test.ts
│   ├── vitest.config.mts                # Integration test config (Workers pool)
│   └── vitest.unit.config.mts           # Unit test config (standard Vitest)
├── migrations/                           # D1 SQL migrations
├── wrangler.jsonc                        # Cloudflare Workers config
├── worker-configuration.d.ts            # Env type (DB, OPENAI_API_KEY)
└── package.json
```

## Key Commands

```bash
npm run dev         # Seed local D1 + start wrangler dev server (port 8787)
npm test            # Integration tests (Workers pool, requires dry-run deploy first)
npm run test:unit   # Unit tests (standard Vitest, no Workers pool)
npm run test:all    # Unit + integration tests
npm run deploy      # Apply remote D1 migrations + deploy to Cloudflare
npm run schema      # Generate OpenAPI spec via Chanfana CLI
npm run cf-typegen  # Regenerate worker-configuration.d.ts from wrangler.jsonc
```

## API Endpoints

All endpoints return Chanfana envelope: `{ success: boolean, result: T }`

| Method | Route | Description |
|--------|-------|-------------|
| GET | /kpis | Dashboard KPI metrics |
| GET | /signals | Intelligence signals (DoD, SAM.gov, competitor) |
| POST | /signals/analyze | AI-powered signal analysis (OpenAI) |
| GET | /stakeholders | Stakeholder dossiers with full nested data |
| GET | /competitors/activity | Competitor activity feed |
| GET | /interactions | Interaction history log |
| GET | /drafts | Email draft list |
| POST | /drafts/:id/accept | Accept an email draft |
| POST | /drafts/:id/reject | Reject an email draft |
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

### Mock Data Phase
Non-task endpoints serve static mock data from `src/data/`. Draft accept/reject mutate in-memory state (resets on Worker restart). When D1 integration happens, endpoints will switch from importing mock arrays to querying D1.

### Testing Strategy
- **Integration tests** (`tests/integration/`): Run in `@cloudflare/vitest-pool-workers` — tests use `SELF.fetch()` from `cloudflare:test` to call the actual Worker. Config: `tests/vitest.config.mts`.
- **Unit tests** (`tests/unit/`): Run in standard Vitest — used for code that mocks external dependencies (e.g., OpenAI). Config: `tests/vitest.unit.config.mts`.
- These configs are separate because the Workers pool does not support mocking Node.js modules like `openai`.

### CORS
Configured in `src/index.ts` via `hono/cors`. Currently allows `http://localhost:5173` (Vite dev server). Update the `origin` array when deploying to production.

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

## What's NOT Built Yet
- **D1 integration** for non-task endpoints (currently mock data)
- **Data ingestion** — scrapers, API connectors for DoD sources
- **AI processing** — NER, relevance scoring beyond signal analysis
- **Email sending** — Resend integration for accepted drafts
- **Production CORS origins** — needs real Pages domain added
- **Authentication** — no auth layer yet
