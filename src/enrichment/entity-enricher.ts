import { DiscoveredEntityRepository } from "../db/discovered-entity-repository";
import { D1StakeholderRepository } from "../db/stakeholder-repository";
import { braveSearch, buildSearchQuery } from "./brave-searcher";
import { fetchPageText } from "./page-fetcher";
import { DossierExtractor } from "./dossier-extractor";


const MAX_PAGES_TO_FETCH = 3;

export interface EnrichmentResult {
	entitiesProcessed: number;
	entitiesEnriched: number;
	entitiesFailed: number;
}

export class EntityEnricher {
	private env: Env;

	constructor(env: Env) {
		this.env = env;
	}

	async enrichPending(): Promise<EnrichmentResult> {
		const entityRepo = new DiscoveredEntityRepository(this.env.DB);
		const stakeholderRepo = new D1StakeholderRepository(this.env.DB);
		const extractor = new DossierExtractor(this.env);

		const pending = await entityRepo.findPending();
		let entitiesEnriched = 0;
		let entitiesFailed = 0;

		const STAKEHOLDER_TYPES = ["person", "agency"] as const;

		for (const entity of pending) {
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
				);

				if (searchResults.length === 0) {
					console.warn(`no search result for ${query}`);
					await entityRepo.updateStatus(entity.id, "failed");
					entitiesFailed++;
					continue;
				}

				const pagesToFetch = searchResults.slice(0, MAX_PAGES_TO_FETCH);
				const pageContents: { url: string; text: string }[] = [];

				for (const result of pagesToFetch) {
					const text = await fetchPageText(fetch, result.url);
					if (text !== null) {
						pageContents.push({ url: result.url, text });
					}
				}

				if (pageContents.length === 0) {
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
				console.error(`Failed to enrich entity ${entity.value}:`, err);
				await entityRepo.updateStatus(entity.id, "failed");
				entitiesFailed++;
			}
		}

		return {
			entitiesProcessed: pending.length,
			entitiesEnriched,
			entitiesFailed,
		};
	}
}
