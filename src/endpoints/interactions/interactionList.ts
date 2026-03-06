import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { InteractionSchema } from "../../schemas";

export class InteractionList extends OpenAPIRoute {
	schema = {
		tags: ["Interactions"],
		summary: "List all interactions keyed by stakeholder ID",
		operationId: "interaction-list",
		responses: {
			"200": {
				description: "Record of interactions keyed by stakeholder ID",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.record(z.string(), z.array(InteractionSchema)),
				})),
			},
		},
	};

	async handle() {
		return { success: true, result: {} };
	}
}
