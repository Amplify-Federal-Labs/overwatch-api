import { materializeSignal, type IngestedItemWithObservations, type MaterializedSignal, type RelevanceOverride } from "../agents/signal-materializer";

export interface MaterializationConsumerResult {
	readonly ingestedItemId: string;
	readonly materialized: boolean;
}

interface MaterializationRepository {
	findIngestedItemWithObservations(ingestedItemId: string): Promise<IngestedItemWithObservations | null>;
	findRelevanceScores(): Promise<Record<string, number>>;
	upsertSignal(signal: MaterializedSignal): Promise<void>;
}

interface MaterializationLogger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
	debug(message: string, data?: Record<string, unknown>): void;
}

export interface MaterializationDeps {
	readonly repository: MaterializationRepository;
	readonly logger: MaterializationLogger;
}

function getRelevanceOverride(item: IngestedItemWithObservations): RelevanceOverride | undefined {
	if (item.relevanceScore !== null) {
		return {
			score: item.relevanceScore,
			rationale: item.relevanceRationale ?? "",
			competencyCodes: item.competencyCodes ?? [],
		};
	}
	return undefined;
}

export async function handleMaterialization(
	ingestedItemId: string,
	deps: MaterializationDeps,
): Promise<MaterializationConsumerResult> {
	const { repository, logger } = deps;

	const item = await repository.findIngestedItemWithObservations(ingestedItemId);
	if (!item) {
		logger.warn("Ingested item not found for materialization", { ingestedItemId });
		return { ingestedItemId, materialized: false };
	}

	if (item.observations.length === 0) {
		logger.info("No observations for item, skipping materialization", { ingestedItemId });
		return { ingestedItemId, materialized: false };
	}

	const relevanceScores = await repository.findRelevanceScores();
	const override = getRelevanceOverride(item);

	try {
		const signal = materializeSignal(item, relevanceScores, override);
		await repository.upsertSignal(signal);

		logger.info("Materialized signal", {
			ingestedItemId,
			signalId: signal.id,
			relevance: signal.relevance,
		});

		return { ingestedItemId, materialized: true };
	} catch (err) {
		logger.error("Failed to materialize signal", {
			ingestedItemId,
			error: err instanceof Error ? err.message : String(err),
		});
		return { ingestedItemId, materialized: false };
	}
}
