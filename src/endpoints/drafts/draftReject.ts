import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";

export class DraftReject extends OpenAPIRoute {
	schema = {
		tags: ["Drafts"],
		summary: "Reject an email draft",
		operationId: "draft-reject",
		request: {
			params: z.object({
				id: z.string(),
			}),
		},
		responses: {
			"404": {
				description: "Draft not found",
				...contentJson(z.object({
					success: z.boolean(),
					errors: z.array(z.object({
						code: z.number(),
						message: z.string(),
					})),
				})),
			},
		},
	};

	async handle(c: AppContext) {
		return c.json(
			{ success: false, errors: [{ code: 4004, message: "Draft not found" }] },
			404,
		);
	}
}
