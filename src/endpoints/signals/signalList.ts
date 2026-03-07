import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { SignalViewSchema } from "../../schemas";
import { ObservationRepository } from "../../db/observation-repository";
import { EntityProfileRepository } from "../../db/entity-profile-repository";
import { transformSignalForUi } from "./signal-transformer";
import type { AppContext } from "../../types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export class SignalList extends OpenAPIRoute {
	schema = {
		tags: ["Signals"],
		summary: "List intelligence signals with observations (paginated)",
		operationId: "signal-list",
		request: {
			query: z.object({
				limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
					.describe("Number of signals to return (max 100)"),
				offset: z.coerce.number().int().min(0).default(0)
					.describe("Number of signals to skip"),
			}),
		},
		responses: {
			"200": {
				description: "Paginated array of signals in UI-ready format",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(SignalViewSchema),
					total: z.number(),
				})),
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { limit, offset } = data.query;

		const observationRepo = new ObservationRepository(c.env.DB);
		const entityRepo = new EntityProfileRepository(c.env.DB);

		const [signals, total, relevanceScores] = await Promise.all([
			observationRepo.findSignalsWithObservationsPaginated(limit, offset),
			observationRepo.countSignals(),
			entityRepo.findRelevanceScores(),
		]);

		const result = signals.map((signal) => transformSignalForUi(signal, relevanceScores));
		return { success: true, result, total };
	}
}
