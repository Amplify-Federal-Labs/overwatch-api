import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { CompetitorActivitySchema } from "../../schemas";
import { mockCompetitorActivity } from "../../data/mock-competitors";
import type { AppContext } from "../../types";

export class CompetitorActivityList extends OpenAPIRoute {
	schema = {
		tags: ["Competitors"],
		summary: "List competitor activity feed",
		operationId: "competitor-activity-list",
		responses: {
			"200": {
				description: "Array of competitor activities",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(CompetitorActivitySchema),
				})),
			},
		},
	};

	async handle(_c: AppContext) {
		return { success: true, result: mockCompetitorActivity };
	}
}
