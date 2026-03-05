import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { SignalAnalysisInputSchema, SignalAnalysisResultSchema } from "../../schemas";
import { SignalAnalyzer } from "../../signals/signal-analyzer";
import type { AppContext } from "../../types";

export class SignalAnalyze extends OpenAPIRoute {
	schema = {
		tags: ["Signals"],
		summary: "Analyze raw content using AI to extract a structured signal",
		operationId: "signal-analyze",
		request: {
			body: contentJson(SignalAnalysisInputSchema),
		},
		responses: {
			"200": {
				description: "Signal analysis result",
				...contentJson(z.object({
					success: z.boolean(),
					result: SignalAnalysisResultSchema,
				})),
			},
			"500": {
				description: "Analysis failed",
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
		const agent = new SignalAnalyzer(c.env);

		try {
			const result = await agent.analyze(data.body);
			return { success: true, result };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Analysis failed";
			return c.json(
				{ success: false, errors: [{ code: 5000, message }] },
				500,
			);
		}
	}
}
