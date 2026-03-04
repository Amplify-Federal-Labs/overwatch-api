import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { SignalSchema } from "../../schemas";
import { SignalRepository } from "../../db/signal-repository";
import type { AppContext } from "../../types";

export class SignalList extends OpenAPIRoute {
	schema = {
		tags: ["Signals"],
		summary: "List all intelligence signals",
		operationId: "signal-list",
		responses: {
			"200": {
				description: "Array of intelligence signals",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(SignalSchema),
				})),
			},
		},
	};

	async handle(c: AppContext) {
		const repository = new SignalRepository(c.env.DB);
		const signals = await repository.findAll();
		return { success: true, result: signals };
	}
}
