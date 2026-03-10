import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { StakeholderSchema } from "../../schemas";
import { EntityProfileRepository } from "../../db/entity-profile-repository";
import { transformEntityToStakeholder } from "./stakeholder-transformer";
import type { AppContext } from "../../types";

export class StakeholderDetail extends OpenAPIRoute {
	schema = {
		tags: ["Stakeholders"],
		summary: "Get a single stakeholder dossier by ID",
		operationId: "stakeholder-detail",
		request: {
			params: z.object({
				id: z.string().describe("Stakeholder (entity profile) ID"),
			}),
		},
		responses: {
			"200": {
				description: "Stakeholder dossier derived from entity profile",
				...contentJson(z.object({
					success: z.boolean(),
					result: StakeholderSchema,
				})),
			},
			"404": {
				description: "Stakeholder not found",
				...contentJson(z.object({
					success: z.boolean(),
					error: z.string(),
				})),
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { id } = data.params;

		const repo = new EntityProfileRepository(c.env.DB);
		const profile = await repo.findProfileWithSignalIdsById(id);

		if (!profile) {
			return c.json({ success: false, error: "Stakeholder not found" }, 404);
		}

		const stakeholder = transformEntityToStakeholder(profile);
		return { success: true, result: stakeholder };
	}
}
