import type { ObservationExtractionResult, ObservationExtraction } from "../schemas";
import type { ResolutionMessage } from "./types";
import { buildEarlyRelevanceInput, applyThreshold } from "../agents/relevance-gate";

export interface ExtractionResult {
	readonly ingestedItemId: string;
	readonly observationsExtracted: number;
	readonly relevanceScore: number;
	readonly aboveThreshold: boolean;
}

interface IngestedItemRow {
	readonly id: string;
	readonly content: string;
	readonly sourceType: string;
	readonly sourceName: string;
	readonly sourceUrl: string | null;
	readonly sourceLink: string | null;
	readonly sourceMetadata: Record<string, string> | null;
}

export interface InsertedObservation {
	readonly observationId: number;
	readonly entities: ReadonlyArray<{
		readonly rawName: string;
		readonly entityType: string;
		readonly role: string;
	}>;
}

interface QueueSender<T> {
	send(message: T): Promise<void>;
}

interface ExtractionRepository {
	findIngestedItemById(id: string): Promise<IngestedItemRow | null>;
	insertObservations(
		ingestedItemId: string,
		observations: ObservationExtraction[],
	): Promise<InsertedObservation[] | number>;
	updateRelevanceScore(
		itemId: string,
		score: number,
		rationale: string,
		competencyCodes: string[],
	): Promise<void>;
}

interface ObservationExtractorService {
	extract(input: {
		content: string;
		sourceType: string;
		sourceName: string;
		sourceUrl?: string;
		sourceMetadata?: Record<string, string>;
	}): Promise<ObservationExtractionResult>;
}

interface RelevanceScorerService {
	score(input: {
		content: string;
		observations: Array<{
			type: string;
			summary: string;
			entities: Array<{ type: string; name: string; role: string }>;
		}>;
		entityContext: Array<{ name: string; type: string; summary: string | null }>;
	}): Promise<{ relevanceScore: number; rationale: string; competencyCodes: string[] }>;
}

interface PageFetcherService {
	fetchPage(url: string): Promise<string | null>;
}

interface ExtractionLogger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
}

export interface ExtractionDeps {
	readonly resolutionQueue: QueueSender<ResolutionMessage>;
	readonly repository: ExtractionRepository;
	readonly extractor: ObservationExtractorService;
	readonly scorer: RelevanceScorerService;
	readonly pageFetcher: PageFetcherService;
	readonly threshold: number;
	readonly logger: ExtractionLogger;
}

export async function handleExtraction(
	ingestedItemId: string,
	deps: ExtractionDeps,
): Promise<ExtractionResult> {
	const { resolutionQueue, repository, extractor, scorer, pageFetcher, threshold, logger } = deps;

	// Step 1: Load ingested item from D1
	const item = await repository.findIngestedItemById(ingestedItemId);
	if (!item) {
		logger.warn("Ingested item not found, skipping extraction", { ingestedItemId });
		return { ingestedItemId, observationsExtracted: 0, relevanceScore: 0, aboveThreshold: false };
	}

	// Step 2: AI extract observations
	const extraction = await extractor.extract({
		content: item.content,
		sourceType: item.sourceType,
		sourceName: item.sourceName,
		sourceUrl: item.sourceUrl ?? undefined,
		sourceMetadata: item.sourceMetadata ?? undefined,
	});

	// Step 3: Store observations + entity mentions
	let insertedObservations: InsertedObservation[] = [];
	if (extraction.observations.length > 0) {
		const result = await repository.insertObservations(ingestedItemId, extraction.observations);
		if (Array.isArray(result)) {
			insertedObservations = result;
		}
	}

	// Step 4: Fetch source page (best-effort)
	let fetchedPageText: string | null = null;
	if (item.sourceLink) {
		try {
			fetchedPageText = await pageFetcher.fetchPage(item.sourceLink);
		} catch (err) {
			logger.warn("Failed to fetch source page", {
				sourceLink: item.sourceLink,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	// Step 5: AI score relevance
	let relevanceScore = 0;
	let rationale = "";
	let competencyCodes: string[] = [];

	try {
		const relevanceInput = buildEarlyRelevanceInput(
			item.content,
			fetchedPageText,
			extraction.observations,
		);
		const result = await scorer.score(relevanceInput);
		relevanceScore = result.relevanceScore;
		rationale = result.rationale;
		competencyCodes = result.competencyCodes;
	} catch (err) {
		logger.error("AI relevance scoring failed, defaulting to 0", {
			ingestedItemId,
			error: err instanceof Error ? err.message : String(err),
		});
	}

	// Step 6: Persist relevance score
	await repository.updateRelevanceScore(ingestedItemId, relevanceScore, rationale, competencyCodes);

	// Step 7: Gate — only produce resolution messages if above threshold
	const above = applyThreshold(relevanceScore, threshold);

	if (above && insertedObservations.length > 0) {
		for (const obs of insertedObservations) {
			if (obs.entities.length > 0) {
				await resolutionQueue.send({
					type: "resolution",
					observationId: obs.observationId,
					entities: obs.entities.map((e) => ({
						rawName: e.rawName,
						entityType: e.entityType,
						role: e.role,
					})),
				});
			}
		}
	}

	logger.info("Extraction complete", {
		ingestedItemId,
		observationsExtracted: extraction.observations.length,
		relevanceScore,
		aboveThreshold: above,
	});

	return {
		ingestedItemId,
		observationsExtracted: extraction.observations.length,
		relevanceScore,
		aboveThreshold: above,
	};
}
