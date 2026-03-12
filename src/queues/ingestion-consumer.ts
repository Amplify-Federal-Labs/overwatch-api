import type { SignalAnalysisInput, SignalSourceType } from "../schemas";
import type { ExtractionMessage } from "./types";

export interface IngestionResult {
	readonly source: SignalSourceType;
	readonly itemsFetched: number;
	readonly itemsStored: number;
	readonly itemsSkipped: number;
	readonly itemsFailed: number;
}

interface QueueSender<T> {
	send(message: T): Promise<void>;
}

interface IngestionRepository {
	insertIngestedItem(input: SignalAnalysisInput): Promise<string | null>;
}

interface IngestionLogger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
}

export interface IngestionDeps {
	readonly extractionQueue: QueueSender<ExtractionMessage>;
	readonly repository: IngestionRepository;
	readonly fetchers: Record<string, () => Promise<SignalAnalysisInput[]>>;
	readonly logger: IngestionLogger;
}

export async function handleIngestion(
	source: SignalSourceType,
	deps: IngestionDeps,
): Promise<IngestionResult> {
	const { extractionQueue, repository, fetchers, logger } = deps;

	const fetchFn = fetchers[source];
	if (!fetchFn) {
		logger.warn("No fetcher registered for source", { source });
		return { source, itemsFetched: 0, itemsStored: 0, itemsSkipped: 0, itemsFailed: 0 };
	}

	const items = await fetchFn();
	logger.info("Fetched items from source", { source, count: items.length });

	let itemsStored = 0;
	let itemsSkipped = 0;
	let itemsFailed = 0;

	for (const item of items) {
		try {
			const itemId = await repository.insertIngestedItem(item);
			if (!itemId) {
				itemsSkipped++;
				continue;
			}

			itemsStored++;
			await extractionQueue.send({
				type: "extraction",
				ingestedItemId: itemId,
			});
		} catch (err) {
			itemsFailed++;
			logger.error("Failed to process item", {
				sourceLink: item.sourceLink ?? "unknown",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	logger.info("Ingestion complete", { source, itemsFetched: items.length, itemsStored, itemsSkipped, itemsFailed });

	return {
		source,
		itemsFetched: items.length,
		itemsStored,
		itemsSkipped,
		itemsFailed,
	};
}
