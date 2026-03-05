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

### Signal Ingestion Pipeline

Automated hourly via Cloudflare cron triggers:

1. **Fetch** — Pull from FPDS.gov (DoD contracts), SAM.gov (opportunities + APBI events), RSS feeds (GovConWire, FedScoop)
2. **Analyze** — Cloudflare Workers AI extracts structured intelligence (type, branch, tags, competencies, relevance score, outreach play, entities)
3. **Match** — Extracted entities matched against existing stakeholders; new entities flagged for enrichment
4. **Store** — Persisted to D1

### Entity Enrichment Pipeline

Discovered entities are enriched via subsequent cron runs:

1. **Search** — Brave Search API with government/defense site filters
2. **Fetch** — Retrieve full page content from search results
3. **Extract** — AI extracts structured dossiers (name, title, org, programs, career history)
4. **Store** — Enriched stakeholder data saved to D1

### Cron Jobs

Hourly cron cycles through: `fpds`, `rss`, `sam_gov`, `sam_gov_apbi`, `enrichment`, `enrichFailed`. Jobs can also be triggered on-demand via `POST /cron/:jobName`.

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
