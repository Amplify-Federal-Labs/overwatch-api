import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { CompetitorActivitySchema } from "../../schemas";
import { ObservationRepository } from "../../db/observation-repository";
import { transformObservationToActivity } from "./competitor-transformer";
import type { AppContext } from "../../types";

export class CompetitorActivityList extends OpenAPIRoute {
	schema = {
		tags: ["Competitors"],
		summary: "List competitor activity feed",
		operationId: "competitor-activity-list",
		responses: {
			"200": {
				description: "Array of competitor activities derived from observations",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(CompetitorActivitySchema),
				})),
			},
		},
	};

	async handle(c: AppContext) {
		const repo = new ObservationRepository(c.env.DB);
		const companyObservations = await repo.findObservationsWithCompanyEntities();
		const result = companyObservations.map(transformObservationToActivity);
		return { success: true, result };
	}
}
