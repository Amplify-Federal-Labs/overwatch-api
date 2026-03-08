import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { ObservationRepository } from "../../db/observation-repository";
import { EntityProfileRepository } from "../../db/entity-profile-repository";
import { SignalRepository } from "../../db/signal-repository";
import { buildCounts } from "./counts-builder";
import type { AppContext } from "../../types";

const STAKEHOLDER_TYPES = ["person", "agency"];

const CountsResultSchema = z.object({
	signals: z.number(),
	stakeholders: z.number(),
	competitors: z.number(),
	interactions: z.number(),
	drafts: z.number(),
});

export class CountsList extends OpenAPIRoute {
	schema = {
		tags: ["Counts"],
		summary: "Get counts for each data tab",
		operationId: "counts-list",
		responses: {
			"200": {
				description: "Counts of signals, stakeholders, competitors, interactions, and drafts",
				...contentJson(z.object({
					success: z.boolean(),
					result: CountsResultSchema,
				})),
			},
		},
	};

	async handle(c: AppContext) {
		const signalRepo = new SignalRepository(c.env.DB);
		const entityRepo = new EntityProfileRepository(c.env.DB);
		const obsRepo = new ObservationRepository(c.env.DB);

		const [signals, stakeholders, competitors] = await Promise.all([
			signalRepo.count(),
			entityRepo.countProfilesByTypes(STAKEHOLDER_TYPES),
			obsRepo.countCompanyObservations(),
		]);

		const result = buildCounts({ signals, stakeholders, competitors });
		return { success: true, result };
	}
}
