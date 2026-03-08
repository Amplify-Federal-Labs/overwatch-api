import type { ProfileForEnrichment, EnrichmentContext } from "../db/enrichment-repository";
import type { SearchResult } from "./brave-searcher";
import type { Dossier } from "../schemas";
import type { Logger } from "../logger";

export interface EnrichmentDeps {
	search: (name: string, type: string, context?: EnrichmentContext) => Promise<SearchResult[]>;
	fetchPages: (urls: string[]) => Promise<string[]>;
	extractDossier: (name: string, type: string, pages: string[]) => Promise<Dossier | null>;
	saveDossier: (profileId: string, dossier: Dossier) => Promise<void>;
	markFailed: (profileId: string) => Promise<void>;
	markSkipped: (profileId: string) => Promise<void>;
	logger?: Logger;
}

export interface EnrichmentResult {
	profilesProcessed: number;
	profilesEnriched: number;
	profilesFailed: number;
	profilesSkipped: number;
	remainingProfileIds: string[];
	startedAt: string;
}

const BATCH_SIZE = 10;

/**
 * Determines whether the enrichment agent should self-schedule another batch.
 * Returns true only when there are remaining profiles AND the current batch
 * made progress (enriched > 0) to avoid infinite loops on persistent errors.
 */
export function shouldSelfScheduleEnrichment(result: EnrichmentResult): boolean {
	return result.remainingProfileIds.length > 0 && result.profilesEnriched > 0;
}

export class EntityEnricher {
	private deps: EnrichmentDeps;

	constructor(deps: EnrichmentDeps) {
		this.deps = deps;
	}

	async run(profiles: ProfileForEnrichment[]): Promise<EnrichmentResult> {
		const startedAt = new Date().toISOString();
		const log = this.deps.logger;

		log?.info("Starting enrichment run", { profileCount: profiles.length });

		if (profiles.length === 0) {
			log?.info("No profiles to enrich");
			return { profilesProcessed: 0, profilesEnriched: 0, profilesFailed: 0, profilesSkipped: 0, remainingProfileIds: [], startedAt };
		}

		const batch = profiles.slice(0, BATCH_SIZE);
		const remainingProfileIds = profiles.slice(BATCH_SIZE).map((p) => p.id);

		let profilesEnriched = 0;
		let profilesFailed = 0;
		let profilesSkipped = 0;

		for (const profile of batch) {
			try {
				const result = await this.enrichProfile(profile);
				switch (result) {
					case "enriched":
						profilesEnriched++;
						break;
					case "skipped":
						profilesSkipped++;
						break;
					case "failed":
						profilesFailed++;
						break;
				}
			} catch (err) {
				log?.error("Enrichment threw for profile", {
					profileId: profile.id,
					name: profile.canonicalName,
					error: err instanceof Error ? err : new Error(String(err)),
				});
				await this.deps.markFailed(profile.id);
				profilesFailed++;
			}
		}

		const result: EnrichmentResult = { profilesProcessed: batch.length, profilesEnriched, profilesFailed, profilesSkipped, remainingProfileIds, startedAt };
		log?.info("Enrichment run complete", { ...result });
		return result;
	}

	private async enrichProfile(
		profile: ProfileForEnrichment,
	): Promise<"enriched" | "skipped" | "failed"> {
		const log = this.deps.logger;

		log?.info("Enriching profile", { profileId: profile.id, name: profile.canonicalName, type: profile.type });

		const searchResults = await this.deps.search(profile.canonicalName, profile.type, profile.context);
		log?.info("Search results", {
			profileId: profile.id,
			name: profile.canonicalName,
			resultCount: searchResults.length,
			urls: searchResults.map((r) => r.url),
		});

		if (searchResults.length === 0) {
			log?.info("No search results, skipping", { profileId: profile.id, name: profile.canonicalName });
			await this.deps.markSkipped(profile.id);
			return "skipped";
		}

		const urls = searchResults.map((r) => r.url);
		const pages = await this.deps.fetchPages(urls);
		log?.info("Pages fetched", {
			profileId: profile.id,
			name: profile.canonicalName,
			urlCount: urls.length,
			pagesFetched: pages.length,
			pageLengths: pages.map((p) => p.length),
		});

		if (pages.length === 0) {
			log?.info("No pages fetched, skipping", { profileId: profile.id, name: profile.canonicalName });
			await this.deps.markSkipped(profile.id);
			return "skipped";
		}

		const dossier = await this.deps.extractDossier(
			profile.canonicalName,
			profile.type,
			pages,
		);

		if (!dossier) {
			log?.warn("AI extraction returned null, marking failed", { profileId: profile.id, name: profile.canonicalName });
			await this.deps.markFailed(profile.id);
			return "failed";
		}

		log?.info("Dossier extracted", {
			profileId: profile.id,
			name: profile.canonicalName,
			kind: dossier.kind,
			branch: dossier.branch,
			programs: dossier.programs,
		});

		await this.deps.saveDossier(profile.id, dossier);
		log?.info("Profile enriched successfully", { profileId: profile.id, name: profile.canonicalName });
		return "enriched";
	}
}
