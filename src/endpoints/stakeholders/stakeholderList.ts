import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { StakeholderSchema } from "../../schemas";
import { mockStakeholders } from "../../data/mock-stakeholders";
import type { AppContext } from "../../types";

export class StakeholderList extends OpenAPIRoute {
	schema = {
		tags: ["Stakeholders"],
		summary: "List all stakeholder dossiers",
		operationId: "stakeholder-list",
		responses: {
			"200": {
				description: "Array of stakeholder dossiers",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(StakeholderSchema),
				})),
			},
		},
	};

	async handle(_c: AppContext) {
		return { success: true, result: mockStakeholders };
	}
}
