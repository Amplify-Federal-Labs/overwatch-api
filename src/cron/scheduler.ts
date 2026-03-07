import { getAgentByName } from "agents";
import type { ObservationExtractorAgent } from "../agents/observation-extractor-agent";
import type { EntityResolverAgent } from "../agents/entity-resolver-agent";
import type { SynthesisAgent } from "../agents/synthesis-agent";
import { EntityEnricher } from "../enrichment/entity-enricher";
import { BraveSearcher } from "../enrichment/brave-searcher";
import { PageFetcher } from "../enrichment/page-fetcher";
import { DossierExtractor } from "../enrichment/dossier-extractor";
import { EnrichmentRepository } from "../db/enrichment-repository";
import { Logger } from "../logger";
import type { SignalSourceType } from "../schemas";

export interface IngestionJob {
	name: string;
	kind: "ingestion";
	sourceType: SignalSourceType;
}

export interface ResolutionJob {
	name: string;
	kind: "resolution";
}

export interface SynthesisJob {
	name: string;
	kind: "synthesis";
}

export interface EnrichmentJob {
	name: string;
	kind: "enrichment";
}

export type CronJob = IngestionJob | ResolutionJob | SynthesisJob | EnrichmentJob;

export const CRON_JOBS: readonly CronJob[] = [
	{ name: "rss", kind: "ingestion", sourceType: "rss" },
	{ name: "sam_gov", kind: "ingestion", sourceType: "sam_gov" },
	{ name: "fpds", kind: "ingestion", sourceType: "fpds" },
	{ name: "entity_resolution", kind: "resolution" },
	{ name: "synthesis", kind: "synthesis" },
	{ name: "enrichment", kind: "enrichment" },
] as const;

export function getScheduledJob(utcHour: number): CronJob {
	return CRON_JOBS[utcHour % CRON_JOBS.length];
}

export async function runCronJob(job: CronJob, env: Env): Promise<unknown> {
	switch (job.kind) {
		case "ingestion": {
			const namespace = env.OBSERVATION_EXTRACTOR as unknown as DurableObjectNamespace<ObservationExtractorAgent>;
			const agent = await getAgentByName<Env, ObservationExtractorAgent>(
				namespace,
				"singleton",
			);
			return agent.runIngestion(job.sourceType);
		}
		case "resolution": {
			const namespace = env.ENTITY_RESOLVER as unknown as DurableObjectNamespace<EntityResolverAgent>;
			const agent = await getAgentByName<Env, EntityResolverAgent>(
				namespace,
				"singleton",
			);
			return agent.runResolution();
		}
		case "synthesis": {
			const namespace = env.SYNTHESIS as unknown as DurableObjectNamespace<SynthesisAgent>;
			const agent = await getAgentByName<Env, SynthesisAgent>(
				namespace,
				"singleton",
			);
			return agent.runSynthesis();
		}
		case "enrichment": {
			const logger = new Logger(env.LOG_LEVEL);
			const repo = new EnrichmentRepository(env.DB);
			const boundFetch = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init);
			const searcher = new BraveSearcher(env.BRAVE_SEARCH_API_KEY, boundFetch, logger);
			const pageFetcher = new PageFetcher(boundFetch);
			const dossierExtractor = new DossierExtractor(env);
			const enricher = new EntityEnricher({
				findProfiles: () => repo.findProfilesNeedingEnrichment(["person", "agency"]),
				search: (name, type) => searcher.search(name, type),
				fetchPages: (urls) => pageFetcher.fetchPages(urls),
				extractDossier: (name, type, pages) => dossierExtractor.extract(name, type, pages),
				saveDossier: (id, dossier) => repo.updateDossier(id, dossier),
				markFailed: (id) => repo.markFailed(id),
				markSkipped: (id) => repo.markSkipped(id),
				logger,
			});
			return enricher.run();
		}
	}
}
