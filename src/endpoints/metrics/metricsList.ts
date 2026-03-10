import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { ObservationRepository } from "../../db/observation-repository";
import { EntityProfileRepository } from "../../db/entity-profile-repository";
import { SignalRepository } from "../../db/signal-repository";
import { SynthesisRepository } from "../../db/synthesis-repository";
import { buildMetrics } from "./metrics-builder";
import type { AppContext } from "../../types";

const MetricsResultSchema = z.object({
	tables: z.object({
		ingestedItems: z.number(),
		observations: z.number(),
		observationEntities: z.number(),
		entityProfiles: z.number(),
		entityAliases: z.number(),
		insights: z.number(),
		signals: z.number(),
	}),
	ingestionBySource: z.record(z.string(), z.number()),
	profilesByType: z.record(z.string(), z.number()),
	enrichmentStatus: z.record(z.string(), z.number()),
	pipeline: z.object({
		synthesized: z.number(),
		synthesizedTotal: z.number(),
		enrichedWithDossier: z.number(),
		enrichedTotal: z.number(),
		materialized: z.number(),
		materializedTotal: z.number(),
	}),
	summary: z.array(z.string()),
});

export class MetricsList extends OpenAPIRoute {
	schema = {
		tags: ["Metrics"],
		summary: "Pipeline health metrics and status",
		operationId: "metrics-list",
		responses: {
			"200": {
				description: "Pipeline metrics with table counts, breakdowns, and summary observations",
				...contentJson(z.object({
					success: z.boolean(),
					result: MetricsResultSchema,
				})),
			},
		},
	};

	async handle(c: AppContext) {
		const obsRepo = new ObservationRepository(c.env.DB);
		const entityRepo = new EntityProfileRepository(c.env.DB);
		const signalRepo = new SignalRepository(c.env.DB);
		const synthRepo = new SynthesisRepository(c.env.DB);

		const [
			ingestedItems,
			observations,
			observationEntities,
			entityProfiles,
			entityAliases,
			insights,
			signals,
			ingestionBySource,
			profilesByType,
			enrichmentStatus,
			synthesizedProfiles,
			enrichedWithDossier,
		] = await Promise.all([
			obsRepo.countIngestedItems(),
			obsRepo.countObservations(),
			obsRepo.countObservationEntities(),
			entityRepo.countProfiles(),
			entityRepo.countAliases(),
			synthRepo.countInsights(),
			signalRepo.count(),
			obsRepo.countIngestedItemsBySource(),
			entityRepo.countProfilesByTypeBreakdown(),
			entityRepo.countByEnrichmentStatus(),
			entityRepo.countSynthesized(),
			entityRepo.countWithDossier(),
		]);

		const result = buildMetrics({
			ingestedItems,
			observations,
			observationEntities,
			entityProfiles,
			entityAliases,
			insights,
			signals,
			ingestionBySource,
			profilesByType,
			enrichmentStatus,
			synthesizedProfiles,
			enrichedWithDossier,
		});

		return { success: true, result };
	}
}
