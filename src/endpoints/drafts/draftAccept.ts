import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { EmailDraftSchema } from "../../schemas";
import { mockEmailDrafts } from "../../data/mock-drafts";
import type { AppContext } from "../../types";

export class DraftAccept extends OpenAPIRoute {
	schema = {
		tags: ["Drafts"],
		summary: "Accept an email draft",
		operationId: "draft-accept",
		request: {
			params: z.object({
				id: z.string(),
			}),
		},
		responses: {
			"200": {
				description: "The accepted draft",
				...contentJson(z.object({
					success: z.boolean(),
					result: EmailDraftSchema,
				})),
			},
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
		const data = await this.getValidatedData<typeof this.schema>();
		const draft = mockEmailDrafts.find((d) => d.id === data.params.id);

		if (!draft) {
			return c.json(
				{ success: false, errors: [{ code: 4004, message: "Draft not found" }] },
				404,
			);
		}

		draft.status = "accepted";
		draft.updatedAt = new Date().toISOString();

		return { success: true, result: draft };
	}
}
