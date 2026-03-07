import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { StakeholderSchema } from "../../schemas";
import { EntityProfileRepository } from "../../db/entity-profile-repository";
import { transformEntityToStakeholder } from "./stakeholder-transformer";
import type { AppContext } from "../../types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const STAKEHOLDER_TYPES = ["person", "agency"];

export class StakeholderList extends OpenAPIRoute {
	schema = {
		tags: ["Stakeholders"],
		summary: "List stakeholder dossiers (paginated)",
		operationId: "stakeholder-list",
		request: {
			query: z.object({
				limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
					.describe("Number of stakeholders to return (max 100)"),
				offset: z.coerce.number().int().min(0).default(0)
					.describe("Number of stakeholders to skip"),
			}),
		},
		responses: {
			"200": {
				description: "Paginated array of stakeholder dossiers derived from entity profiles",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(StakeholderSchema),
					total: z.number(),
				})),
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { limit, offset } = data.query;

		const repo = new EntityProfileRepository(c.env.DB);

		const [profiles, total] = await Promise.all([
			repo.findProfilesWithSignalIdsPaginated(STAKEHOLDER_TYPES, limit, offset),
			repo.countProfilesByTypes(STAKEHOLDER_TYPES),
		]);

		const stakeholders = profiles.map(transformEntityToStakeholder);
		return { success: true, result: stakeholders, total };
	}
}
