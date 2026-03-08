import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { SignalSchema } from "../../schemas";
import { SignalRepository } from "../../db/signal-repository";
import type { AppContext } from "../../types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const BranchEnum = z.enum(["army", "navy", "air force", "marines", "DISA", "CDAO", "DIU"]);
const TypeEnum = z.enum(["opportunity", "strategy", "competitor"]);
const RelevanceEnum = z.coerce.number().int().refine(
	(v) => [20, 40, 60, 80].includes(v),
	{ message: "Must be one of: 20, 40, 60, 80" },
);

export class SignalList extends OpenAPIRoute {
	schema = {
		tags: ["Signals"],
		summary: "List intelligence signals (paginated, filterable, sorted by relevance)",
		operationId: "signal-list",
		request: {
			query: z.object({
				limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
					.describe("Number of signals to return (max 100)"),
				offset: z.coerce.number().int().min(0).default(0)
					.describe("Number of signals to skip"),
				branch: BranchEnum.optional()
					.describe("Filter by branch (case-insensitive match)"),
				type: TypeEnum.optional()
					.describe("Filter by signal type"),
				relevance: RelevanceEnum.optional()
					.describe("Minimum relevance threshold (returns signals with relevance > value)"),
			}),
		},
		responses: {
			"200": {
				description: "Paginated array of signals sorted by relevance (high to low)",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(SignalSchema),
					total: z.number(),
				})),
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { limit, offset, branch, type, relevance } = data.query;

		const signalRepo = new SignalRepository(c.env.DB);

		const filters = {
			branch,
			type,
			minRelevance: relevance,
		};

		const [rows, total] = await Promise.all([
			signalRepo.findPaginated(limit, offset, filters),
			signalRepo.count(filters),
		]);

		const result = rows.map((row) => ({
			id: row.id,
			date: row.date,
			branch: row.branch,
			source: row.source,
			title: row.title,
			summary: row.summary,
			tags: row.tags ?? [],
			relevance: row.relevance,
			relevanceRationale: row.relevanceRationale,
			type: row.type as "opportunity" | "strategy" | "competitor",
			competencies: row.competencies ?? [],
			play: row.play ?? "",
			starred: false,
			stakeholders: row.stakeholders ?? [],
			competitors: row.competitors ?? [],
			vendors: row.vendors ?? [],
			entities: row.entities ?? [],
			sourceUrl: row.sourceUrl ?? "",
			sourceMetadata: row.sourceMetadata ?? null,
		}));

		return { success: true, result, total };
	}
}
