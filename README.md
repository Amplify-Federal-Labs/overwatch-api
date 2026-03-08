# Overwatch API

Backend API for **Overwatch**, Amplify Federal's intelligence and relationship management platform. Built on Cloudflare Workers with automated signal ingestion from government data sources, AI-powered analysis, and entity enrichment.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono + Chanfana (OpenAPI 3.1 auto-generation)
- **Database**: Cloudflare D1 (SQLite) via Drizzle ORM
- **AI**: Cloudflare Workers AI (signal analysis, dossier extraction)
- **Validation**: Zod
- **Testing**: Vitest

## Getting Started

1. Install dependencies from the monorepo root:
   ```bash
   npm install
   ```

2. Create a [D1 database](https://developers.cloudflare.com/d1/get-started/):
   ```bash
   npx wrangler d1 create overwatch-db
   ```
   Update the `database_id` in `wrangler.jsonc`.

3. Run migrations:
   ```bash
   npx wrangler d1 migrations apply DB --local
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```

   OpenAPI docs available at `http://localhost:8787/`.

## Commands

```bash
npm run dev         # Seed local D1 + start wrangler dev server (port 8787)
npm test            # Run unit tests
npm run lint        # TypeScript type checking
npm run deploy      # Apply remote D1 migrations + deploy to Cloudflare
npm run schema      # Generate OpenAPI spec
npm run cf-typegen  # Regenerate worker-configuration.d.ts
```

## API Endpoints

All endpoints return `{ success: boolean, result: T }`.

| Method | Route | Description |
|--------|-------|-------------|
| GET | /kpis | Dashboard KPI metrics |
| GET | /signals | Intelligence signals |
| POST | /signals/analyze | AI-powered signal analysis |
| GET | /stakeholders | Stakeholder dossiers |
| GET | /competitors/activity | Competitor activity feed |
| GET | /interactions | Interaction history |
| GET | /drafts | Email drafts |
| POST | /drafts/:id/accept | Accept a draft |
| POST | /drafts/:id/reject | Reject a draft |
| POST | /cron/:jobName | Trigger a cron job on-demand |
| CRUD | /tasks/* | Task management |

## Architecture

### Intelligence Pipeline (ADR-003)

Raw content from government sources flows through a task-chained agent pipeline built on Cloudflare Durable Objects:

```
Cron (daily, fixed hours 0-2 UTC): 0:rss -> 1:sam_gov -> 2:fpds
  -> ObservationExtractorAgent     (AI extracts typed observations + entity mentions)
    -> EntityResolverAgent         (links raw names to canonical entity profiles)
      -> SynthesisAgent(profileIds)   -> SignalMaterializerAgent (AI scores, writes signals)
      -> EnrichmentAgent(profileIds)  (parallel, Brave Search + AI dossier extraction)
```

- **Cron** handles ingestion only (pulling from FPDS.gov, SAM.gov, RSS feeds)
- **Task chaining** handles all downstream processing via the Cloudflare Agents `queue()` API (FIFO, persisted, fire-and-forget)
- **Explicit ID payloads** — agents pass profile IDs in queue payloads, not DB queries for pending work
- **Synthesis** and **Enrichment** run in parallel after entity resolution; both self-schedule remaining IDs in batches

For the complete processing lifecycle with table schemas, AI calls, and data flow, see [docs/pipeline-processing-report.md](docs/pipeline-processing-report.md).

### Cron Jobs

Daily cron runs once per source (`0 0-2 * * *`): midnight UTC = `rss`, 1 AM = `sam_gov`, 2 AM = `fpds`. All downstream processing is triggered automatically via agent chaining. Jobs can also be triggered on-demand via `POST /cron/:jobName`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CF_AIG_TOKEN` | Cloudflare Workers AI token |
| `CF_AIG_BASEURL` | Workers AI base URL |
| `CF_AIG_MODEL` | AI model identifier |
| `BRAVE_SEARCH_API_KEY` | Brave Search API key |
| `SAM_GOV_API_KEY` | SAM.gov API key |
| `LOG_LEVEL` | Logging level (DEBUG, INFO, WARN, ERROR) |

## Testing

Unit tests are colocated with source files. Run with:

```bash
npm test
```

## Workspace

Part of the Overwatch monorepo:

```
overwatch/
├── overwatch-api/    # This project
└── overwatch-web/    # Frontend SPA
```

The frontend imports types from this package via `import type { ... } from "overwatch-api/schemas"`.

## Documentation

- [CLAUDE.md](CLAUDE.md) — Full project reference (architecture, endpoints, schemas, conventions)
- [docs/pipeline-processing-report.md](docs/pipeline-processing-report.md) — Detailed ingested item processing lifecycle
- [docs/adr-001-evidence-based-intelligence.md](docs/adr-001-evidence-based-intelligence.md) — Architecture pivot to evidence-based approach
- [docs/adr-002-signal-materialization.md](docs/adr-002-signal-materialization.md) — Signal materialization design
- [docs/adr-003-task-chained-pipeline.md](docs/adr-003-task-chained-pipeline.md) — Task-chained agent pipeline
