import { Agent } from "agents";
import { EntityEnricher, shouldSelfScheduleEnrichment, type EnrichmentResult } from "../enrichment/entity-enricher";
import { BraveSearcher } from "../enrichment/brave-searcher";
import { PageFetcher } from "../enrichment/page-fetcher";
import { DossierExtractor } from "../enrichment/dossier-extractor";
import { EnrichmentRepository } from "../db/enrichment-repository";
import { Logger } from "../logger";

export type { EnrichmentResult } from "../enrichment/entity-enricher";

interface AgentState {
	lastRun?: string;
	lastResult?: EnrichmentResult;
}

export class EnrichmentAgent extends Agent<Env, AgentState> {
	initialState: AgentState = {};

	async onRequest(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		const body = await request.json() as { profileIds?: string[] };
		const result = await this.enrichProfiles(body.profileIds ?? []);
		return new Response(JSON.stringify(result), {
			headers: { "Content-Type": "application/json" },
		});
	}

	async enrichProfiles(profileIds: string[]): Promise<EnrichmentResult> {
		const logger = new Logger(this.env.LOG_LEVEL);
		const repo = new EnrichmentRepository(this.env.DB);

		logger.info("EnrichmentAgent received profile IDs", { count: profileIds.length });

		// When called with empty array, query DB for pending profiles
		const effectiveIds = profileIds.length > 0
			? profileIds
			: await repo.findPendingProfileIds();

		if (effectiveIds.length === 0) {
			logger.info("No profiles need enrichment");
			return {
				profilesProcessed: 0,
				profilesEnriched: 0,
				profilesFailed: 0,
				profilesSkipped: 0,
				remainingProfileIds: [],
				startedAt: new Date().toISOString(),
			};
		}

		logger.info("Profiles to enrich", { count: effectiveIds.length });

		// Fetch full profile data and observation context for the given IDs
		const profiles = await repo.findProfilesByIds(effectiveIds);
		const contextMap = await repo.findContextForProfiles(effectiveIds);
		const profilesWithContext = profiles.map((p) => ({
			...p,
			context: contextMap.get(p.id),
		}));

		const boundFetch = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init);
		const searcher = new BraveSearcher(this.env.BRAVE_SEARCH_API_KEY, boundFetch, logger);
		const pageFetcher = new PageFetcher(boundFetch);
		const dossierExtractor = new DossierExtractor(this.env);

		const enricher = new EntityEnricher({
			search: (name, type, ctx) => searcher.search(name, type, undefined, ctx),
			fetchPages: (urls) => pageFetcher.fetchPages(urls),
			extractDossier: (name, type, pages) => dossierExtractor.extract(name, type, pages),
			saveDossier: (id, dossier) => repo.updateDossier(id, dossier),
			markFailed: (id) => repo.markFailed(id),
			markSkipped: (id) => repo.markSkipped(id),
			logger,
		});

		const result = await enricher.run(profilesWithContext);

		this.setState({ lastRun: new Date().toISOString(), lastResult: result });

		if (shouldSelfScheduleEnrichment(result)) {
			logger.info("Queuing next enrichment batch", { remainingCount: result.remainingProfileIds.length });
			await this.queue("enrichProfiles", result.remainingProfileIds);
		}

		return result;
	}
}
