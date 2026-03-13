# Overwatch API

Backend API for **Overwatch**, Amplify Federal's intelligence and relationship management platform. Built on Cloudflare Workers with automated signal ingestion from government data sources, AI-powered analysis, and entity enrichment.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono + Chanfana (OpenAPI 3.1 auto-generation)
- **Database**: Cloudflare D1 (SQLite) via Drizzle ORM
- **Async Processing**: Cloudflare Queues (6 queues, event-driven pipeline)
- **AI**: Cloudflare Workers AI (observation extraction, relevance scoring, synthesis, dossier extraction)
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

3. Create the [Cloudflare Queues](https://developers.cloudflare.com/queues/get-started/):
   ```bash
   npx wrangler queues create overwatch-ingestion
   npx wrangler queues create overwatch-extraction
   npx wrangler queues create overwatch-resolution
   npx wrangler queues create overwatch-synthesis
   npx wrangler queues create overwatch-enrichment
   npx wrangler queues create overwatch-materialization
   npx wrangler queues create overwatch-dlq
   ```

4. Run migrations:
   ```bash
   npx wrangler d1 migrations apply DB --local
   ```

5. Start the dev server:
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
| GET | /counts | Pipeline stage counts |
| GET | /metrics | Pipeline health metrics |

## Architecture

### Intelligence Pipeline (Cloudflare Queues)

Raw content from government sources flows through an event-driven queue pipeline:

```
Cron (hourly): 0:rss → 1:sam_gov → 2:contract_awards → 3+:recovery
  → INGESTION_QUEUE        (fetch sources → dedup → store)
    → EXTRACTION_QUEUE     (AI extract observations → AI score relevance → gate)
      → RESOLUTION_QUEUE   (resolve entities → fan-out)
        → SYNTHESIS_QUEUE      → MATERIALIZATION_QUEUE → signals table
        → ENRICHMENT_QUEUE     (parallel, Brave Search + AI dossier)
```

- **6 queues** with dead-letter queue (`overwatch-dlq`), max 3 retries per message
- **1 message = 1 unit of work** — typed as a discriminated union on the `type` field
- **Early relevance gate** at extraction — items scoring below threshold (default: 60) are excluded from downstream processing
- **Fan-out** at resolution — synthesis and enrichment run in parallel
- **Dependency injection** — all consumers accept interfaces, wired with concrete implementations in `build-handlers.ts`

### Cron Schedule

Hourly cron (`0 * * * *`): UTC hours 0-2 run source-specific ingestion (RSS, SAM.gov Opportunities, SAM.gov Contract Awards). Hours 3+ run pipeline recovery (detects stuck stages and re-dispatches via queues). All downstream processing is triggered automatically via queue chaining.

**On-demand**: `POST /cron/:jobName` supports `rss`, `sam_gov`, `contract_awards` (ingestion), `synthesis`, `enrichment`, `signal_materialization` (scans DB for pending work), and `recovery`.

For the complete processing lifecycle with table schemas, AI calls, and data flow, see [docs/pipeline-processing-report.md](docs/pipeline-processing-report.md).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CF_AIG_TOKEN` | Cloudflare Workers AI token |
| `CF_AIG_BASEURL` | Workers AI base URL |
| `CF_AIG_MODEL` | AI model identifier |
| `BRAVE_SEARCH_API_KEY` | Brave Search API key |
| `SAM_GOV_API_KEY` | SAM.gov API key |
| `LOG_LEVEL` | Logging level (DEBUG, INFO, WARN, ERROR) |
| `RELEVANCE_THRESHOLD` | Minimum relevance score 0-100 for downstream processing (default: 60) |

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
- [docs/adr-003-task-chained-pipeline.md](docs/adr-003-task-chained-pipeline.md) — Task-chained pipeline (historical — now migrated to Cloudflare Queues)
