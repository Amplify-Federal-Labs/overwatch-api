import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { SignalViewSchema } from "../../schemas";
import { ObservationRepository } from "../../db/observation-repository";
import { EntityProfileRepository } from "../../db/entity-profile-repository";
import { transformSignalForUi } from "./signal-transformer";
import type { AppContext } from "../../types";

export class SignalList extends OpenAPIRoute {
	schema = {
		tags: ["Signals"],
		summary: "List all intelligence signals with observations",
		operationId: "signal-list",
		responses: {
			"200": {
				description: "Array of signals in UI-ready format",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(SignalViewSchema),
				})),
			},
		},
	};

	async handle(c: AppContext) {
		const observationRepo = new ObservationRepository(c.env.DB);
		const entityRepo = new EntityProfileRepository(c.env.DB);

		const [signals, relevanceScores] = await Promise.all([
			observationRepo.findSignalsWithObservations(),
			entityRepo.findRelevanceScores(),
		]);

		const result = signals.map((signal) => transformSignalForUi(signal, relevanceScores));
		return { success: true, result };
	}
}
