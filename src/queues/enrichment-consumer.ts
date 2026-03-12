import type { SearchResult } from "../enrichment/brave-searcher";
import type { EnrichmentContext } from "../db/enrichment-repository";
import type { Dossier } from "../schemas";

export interface EnrichmentConsumerResult {
	readonly profileId: string;
	readonly enriched: boolean;
	readonly outcome: "enriched" | "skipped" | "failed";
}

export interface EnrichmentInput {
	readonly profileId: string;
	readonly entityType: string;
	readonly canonicalName: string;
}

interface EnrichmentRepository {
	saveDossier(profileId: string, dossier: Dossier): Promise<void>;
	markFailed(profileId: string): Promise<void>;
	markSkipped(profileId: string): Promise<void>;
	findContextForProfile(profileId: string): Promise<EnrichmentContext | undefined>;
}

interface EnrichmentLogger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
	debug(message: string, data?: Record<string, unknown>): void;
}

export interface EnrichmentConsumerDeps {
	readonly search: (name: string, type: string, context?: EnrichmentContext) => Promise<SearchResult[]>;
	readonly fetchPages: (urls: string[]) => Promise<string[]>;
	readonly extractDossier: (name: string, type: string, pages: string[]) => Promise<Dossier | null>;
	readonly repository: EnrichmentRepository;
	readonly logger: EnrichmentLogger;
}

export async function handleEnrichment(
	input: EnrichmentInput,
	deps: EnrichmentConsumerDeps,
): Promise<EnrichmentConsumerResult> {
	const { search, fetchPages, extractDossier, repository, logger } = deps;
	const { profileId, entityType, canonicalName } = input;

	try {
		logger.info("Enriching profile", { profileId, canonicalName, entityType });

		// Load enrichment context (co-occurring entities for better search)
		const context = await repository.findContextForProfile(profileId);

		const searchResults = await search(canonicalName, entityType, context);
		if (searchResults.length === 0) {
			logger.info("No search results, skipping", { profileId, canonicalName });
			await repository.markSkipped(profileId);
			return { profileId, enriched: false, outcome: "skipped" };
		}

		const urls = searchResults.map((r) => r.url);
		const pages = await fetchPages(urls);
		if (pages.length === 0) {
			logger.info("No pages fetched, skipping", { profileId, canonicalName });
			await repository.markSkipped(profileId);
			return { profileId, enriched: false, outcome: "skipped" };
		}

		const dossier = await extractDossier(canonicalName, entityType, pages);
		if (!dossier) {
			logger.warn("AI extraction returned null, marking failed", { profileId, canonicalName });
			await repository.markFailed(profileId);
			return { profileId, enriched: false, outcome: "failed" };
		}

		await repository.saveDossier(profileId, dossier);
		logger.info("Profile enriched successfully", { profileId, canonicalName, kind: dossier.kind });

		return { profileId, enriched: true, outcome: "enriched" };
	} catch (err) {
		logger.error("Enrichment failed for profile", {
			profileId,
			canonicalName,
			error: err instanceof Error ? err.message : String(err),
		});
		await repository.markFailed(profileId);
		return { profileId, enriched: false, outcome: "failed" };
	}
}
