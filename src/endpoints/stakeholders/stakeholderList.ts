import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { StakeholderSchema } from "../../schemas";
import { EntityProfileRepository } from "../../db/entity-profile-repository";
import { transformEntityToStakeholder } from "./stakeholder-transformer";
import type { AppContext } from "../../types";

export class StakeholderList extends OpenAPIRoute {
	schema = {
		tags: ["Stakeholders"],
		summary: "List all stakeholder dossiers",
		operationId: "stakeholder-list",
		responses: {
			"200": {
				description: "Array of stakeholder dossiers derived from entity profiles",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(StakeholderSchema),
				})),
			},
		},
	};

	async handle(c: AppContext) {
		const repo = new EntityProfileRepository(c.env.DB);
		const profiles = await repo.findProfilesWithSignalIds();
		// Only return person and agency profiles as stakeholders
		const stakeholders = profiles
			.filter((p) => p.type === "person" || p.type === "agency")
			.map(transformEntityToStakeholder);
		return { success: true, result: stakeholders };
	}
}
