import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { KpiSchema } from "../../schemas";
import { ObservationRepository } from "../../db/observation-repository";
import { EntityProfileRepository } from "../../db/entity-profile-repository";
import { SynthesisRepository } from "../../db/synthesis-repository";
import { SignalRepository } from "../../db/signal-repository";
import { buildKpis } from "./kpi-builder";
import type { AppContext } from "../../types";

const RECENT_DAYS = 7;

export class KpiList extends OpenAPIRoute {
	schema = {
		tags: ["KPIs"],
		summary: "List all KPI metrics",
		operationId: "kpi-list",
		responses: {
			"200": {
				description: "Array of KPI metrics computed from live data",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(KpiSchema),
				})),
			},
		},
	};

	async handle(c: AppContext) {
		const signalRepo = new SignalRepository(c.env.DB);
		const obsRepo = new ObservationRepository(c.env.DB);
		const entityRepo = new EntityProfileRepository(c.env.DB);
		const synthRepo = new SynthesisRepository(c.env.DB);

		const [totalSignals, totalObservations, recentSignals, recentObservations, totalEntityProfiles, totalInsights] = await Promise.all([
			signalRepo.count(),
			obsRepo.countObservations(),
			signalRepo.countRecent(RECENT_DAYS),
			obsRepo.countRecentObservations(RECENT_DAYS),
			entityRepo.countProfiles(),
			synthRepo.countInsights(),
		]);

		const kpis = buildKpis({
			totalSignals,
			totalObservations,
			totalEntityProfiles,
			totalInsights,
			recentSignals,
			recentObservations,
		});

		return { success: true, result: kpis };
	}
}
