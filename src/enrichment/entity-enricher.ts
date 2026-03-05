import type { PendingEntity } from "../db/discovered-entity-repository";
import { DiscoveredEntityRepository } from "../db/discovered-entity-repository";
import { D1StakeholderRepository } from "../db/stakeholder-repository";
import { braveSearch, buildSearchQuery } from "./brave-searcher";
import { fetchPageText } from "./page-fetcher";
import { DossierExtractor } from "./dossier-extractor";
import { Logger } from "../logger";


const MAX_PAGES_TO_FETCH = 3;

export interface EnrichmentResult {
	entitiesProcessed: number;
	entitiesEnriched: number;
	entitiesFailed: number;
}

export class EntityEnricher {
	private env: Env;
	private logger: Logger;

	constructor(env: Env) {
		this.env = env;
		this.logger = new Logger(env.LOG_LEVEL);
	}

	async enrichPending(): Promise<EnrichmentResult> {
		const entityRepo = new DiscoveredEntityRepository(this.env.DB);
		const entities = await entityRepo.findPending();
		return this.enrichEntities(entities, entityRepo);
	}

	async enrichFailed(): Promise<EnrichmentResult> {
		const entityRepo = new DiscoveredEntityRepository(this.env.DB);
		const entities = await entityRepo.findFailed();
		return this.enrichEntities(entities, entityRepo);
	}

	private async enrichEntities(
		entities: PendingEntity[],
		entityRepo: DiscoveredEntityRepository,
	): Promise<EnrichmentResult> {
		const stakeholderRepo = new D1StakeholderRepository(this.env.DB);
		const extractor = new DossierExtractor(this.env);

		let entitiesEnriched = 0;
		let entitiesFailed = 0;

		const STAKEHOLDER_TYPES = ["person", "agency"] as const;

		for (const entity of entities) {
			try {
				if (!STAKEHOLDER_TYPES.includes(entity.type as "person" | "agency")) {
					await entityRepo.updateStatus(entity.id, "skipped");
					continue;
				}
				const stakeholderType = entity.type as "person" | "agency";
				const query = buildSearchQuery(entity.value, stakeholderType);
				const searchResults = await braveSearch(
					fetch,
					this.env.BRAVE_SEARCH_API_KEY,
					query,
					5,
					this.logger,
				);

				if (searchResults.length === 0) {
					this.logger.error("No search results for entity", { entity: entity.value, query });
					await entityRepo.updateStatus(entity.id, "failed");
					entitiesFailed++;
					continue;
				}

				const pagesToFetch = searchResults.slice(0, MAX_PAGES_TO_FETCH);
				const pageContents: { url: string; text: string }[] = [];

				for (const result of pagesToFetch) {
					const text = await fetchPageText(fetch, result.url, this.logger);
					if (text !== null) {
						pageContents.push({ url: result.url, text });
					} else if (result.description) {
						this.logger.warn("Using search snippet as fallback", { url: result.url, entity: entity.value });
						pageContents.push({ url: result.url, text: result.description });
					}
				}

				if (pageContents.length === 0) {
					this.logger.error("All page fetches returned empty", { entity: entity.value, urls: pagesToFetch.map((r) => r.url) });
					await entityRepo.updateStatus(entity.id, "failed");
					entitiesFailed++;
					continue;
				}

				const dossier = await extractor.extract({
					entityName: entity.value,
					entityType: stakeholderType,
					pageContents,
					signalContext: "",
				});

				await stakeholderRepo.insertEnriched({
					dossier,
					discoveredEntityId: entity.id,
					signalId: entity.signalId,
					bioSourceUrl: pageContents[0]?.url ?? null,
					entityType: stakeholderType,
				});

				await entityRepo.updateStatus(entity.id, "enriched");
				entitiesEnriched++;
			} catch (err) {
				this.logger.error("Failed to enrich entity", { entity: entity.value, error: err instanceof Error ? err : new Error(String(err)) });
				await entityRepo.updateStatus(entity.id, "failed");
				entitiesFailed++;
			}
		}

		return {
			entitiesProcessed: entities.length,
			entitiesEnriched,
			entitiesFailed,
		};
	}
}
