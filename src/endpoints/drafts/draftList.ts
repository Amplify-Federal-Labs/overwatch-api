import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { EmailDraftSchema } from "../../schemas";

export class DraftList extends OpenAPIRoute {
	schema = {
		tags: ["Drafts"],
		summary: "List all email drafts",
		operationId: "draft-list",
		responses: {
			"200": {
				description: "Array of email drafts",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(EmailDraftSchema),
				})),
			},
		},
	};

	async handle() {
		return { success: true, result: [] };
	}
}
