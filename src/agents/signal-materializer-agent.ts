import { Agent } from "agents";
import { ObservationRepository } from "../db/observation-repository";
import { EntityProfileRepository } from "../db/entity-profile-repository";
import { SignalRepository } from "../db/signal-repository";
import { materializeSignal, shouldSelfSchedule, type IngestedItemWithObservations, type MaterializationResult } from "./signal-materializer";
import { SignalRelevanceScorer, type RelevanceInput, type ObservationSummary, type EntityContextItem } from "./signal-relevance-scorer";
import { Logger } from "../logger";

const BATCH_SIZE = 10;

export type { MaterializationResult } from "./signal-materializer";

interface AgentState {
	lastRun?: string;
	lastResult?: MaterializationResult;
}

export class SignalMaterializerAgent extends Agent<Env, AgentState> {
	initialState: AgentState = {};

	async onRequest(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		const body = await request.json() as { action?: string; entityProfileIds?: string[] };
		const action = body.action ?? "materializeNew";

		let result: MaterializationResult;
		if (action === "rematerialize" && body.entityProfileIds) {
			result = await this.rematerialize(body.entityProfileIds);
		} else {
			result = await this.materializeNew();
		}

		return new Response(JSON.stringify(result), {
			headers: { "Content-Type": "application/json" },
		});
	}

	async materializeNew(): Promise<MaterializationResult> {
		const logger = new Logger(this.env.LOG_LEVEL);
		const obsRepo = new ObservationRepository(this.env.DB);
		const entityRepo = new EntityProfileRepository(this.env.DB);
		const signalRepo = new SignalRepository(this.env.DB);
		const scorer = new SignalRelevanceScorer(this.env);
		const startedAt = new Date().toISOString();

		logger.info("Starting signal materialization (new items)", { batchSize: BATCH_SIZE });

		// Only fetch items that have observations but no materialized signal yet
		const items = await obsRepo.findUnmaterializedItems(BATCH_SIZE);
		const relevanceScores = await entityRepo.findRelevanceScores();

		if (items.length === 0) {
			logger.info("No unmaterialized items found");
			return { materialized: 0, skipped: 0, remaining: 0, startedAt };
		}

		let materialized = 0;
		let skipped = 0;

		for (const item of items) {
			try {
				const override = await this.scoreRelevance(item, entityRepo, scorer, logger);
				const signal = materializeSignal(item, relevanceScores, override);
				await signalRepo.upsert(signal);
				materialized++;
			} catch (err) {
				logger.error("Failed to materialize signal", {
					itemId: item.id,
					error: err instanceof Error ? err : new Error(String(err)),
				});
				skipped++;
			}
		}

		// Check if there are more items to process in subsequent runs
		const nextBatch = await obsRepo.findUnmaterializedItems(1);
		const remaining = nextBatch.length > 0 ? nextBatch.length : 0;

		const result: MaterializationResult = { materialized, skipped, remaining, startedAt };
		this.setState({ lastRun: new Date().toISOString(), lastResult: result });
		logger.info("Signal materialization complete", { ...result });

		if (shouldSelfSchedule(result)) {
			logger.info("Queuing next materialization batch");
			await this.queue("materializeNew", {});
		}

		return result;
	}

	async rematerialize(entityProfileIds: string[]): Promise<MaterializationResult> {
		const logger = new Logger(this.env.LOG_LEVEL);
		const obsRepo = new ObservationRepository(this.env.DB);
		const entityRepo = new EntityProfileRepository(this.env.DB);
		const signalRepo = new SignalRepository(this.env.DB);
		const scorer = new SignalRelevanceScorer(this.env);
		const startedAt = new Date().toISOString();

		logger.info("Starting signal rematerialization", { entityProfileIds });

		const relevanceScores = await entityRepo.findRelevanceScores();

		// Find ingested items linked to the updated entity profiles
		const ingestedItemIds = await entityRepo.findIngestedItemIdsByProfileIds(entityProfileIds);

		let materialized = 0;
		let skipped = 0;

		for (const itemId of ingestedItemIds) {
			try {
				const obs = await obsRepo.findObservationsByIngestedItemId(itemId);
				if (obs.length === 0) {
					skipped++;
					continue;
				}

				// Reconstruct the ingested item — we need the raw content for summary
				const items = await obsRepo.findIngestedItemsWithObservationsPaginated(1, 0);
				const item = items.find((i) => i.id === itemId);
				if (!item) {
					skipped++;
					continue;
				}

				const override = await this.scoreRelevance(item, entityRepo, scorer, logger);
				const signal = materializeSignal(item, relevanceScores, override);
				await signalRepo.upsert(signal);
				materialized++;
			} catch (err) {
				logger.error("Failed to rematerialize signal", {
					itemId,
					error: err instanceof Error ? err : new Error(String(err)),
				});
				skipped++;
			}
		}

		const result: MaterializationResult = { materialized, skipped, remaining: 0, startedAt };
		this.setState({ lastRun: new Date().toISOString(), lastResult: result });
		logger.info("Signal rematerialization complete", { ...result });
		return result;
	}

	private async scoreRelevance(
		item: IngestedItemWithObservations,
		entityRepo: EntityProfileRepository,
		scorer: SignalRelevanceScorer,
		logger: Logger,
	): Promise<{ score: number; rationale: string; competencyCodes: string[] }> {
		try {
			const observationSummaries: ObservationSummary[] = item.observations.map((o) => ({
				type: o.type,
				summary: o.summary,
				entities: o.entities.map((e) => ({
					type: e.entityType,
					name: e.rawName,
					role: e.role,
				})),
			}));

			// Collect unique entity profile IDs for context
			const profileIds = [
				...new Set(
					item.observations
						.flatMap((o) => o.entities)
						.map((e) => e.entityProfileId)
						.filter((id): id is string => id !== null),
				),
			];

			let entityContext: EntityContextItem[] = [];
			if (profileIds.length > 0) {
				const profiles = await entityRepo.findProfilesByIds(profileIds);
				entityContext = profiles.map((p) => ({
					name: p.canonicalName,
					type: p.type,
					summary: p.summary,
				}));
			}

			const input: RelevanceInput = {
				content: item.content,
				observations: observationSummaries,
				entityContext,
			};

			const result = await scorer.score(input);
			return { score: result.relevanceScore, rationale: result.rationale, competencyCodes: result.competencyCodes };
		} catch (err) {
			logger.error("AI relevance scoring failed, falling back to 0", {
				itemId: item.id,
				error: err instanceof Error ? err : new Error(String(err)),
			});
			return { score: 0, rationale: "", competencyCodes: [] };
		}
	}
}
