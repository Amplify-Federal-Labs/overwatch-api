import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { CRON_SCHEDULE, runCronJob } from "../../cron/scheduler";
import type { AppContext } from "../../types";

export class CronTrigger extends OpenAPIRoute {
	schema = {
		tags: ["Cron"],
		summary: "Trigger a cron job on demand",
		operationId: "cron-trigger",
		request: {
			params: z.object({
				jobName: z.string().describe("Name of the cron job to trigger"),
			}),
		},
		responses: {
			"200": {
				description: "Job completed successfully",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.object({
						jobName: z.string(),
						output: z.unknown(),
					}),
				})),
			},
			"404": {
				description: "Job not found",
				...contentJson(z.object({
					success: z.boolean(),
					errors: z.array(z.object({
						code: z.number(),
						message: z.string(),
					})),
				})),
			},
			"500": {
				description: "Job execution failed",
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
		const { jobName } = data.params;

		const job = [...CRON_SCHEDULE.values()].find((j) => j.name === jobName);
		if (!job) {
			return c.json(
				{ success: false, errors: [{ code: 4040, message: `Unknown job: ${jobName}` }] },
				404,
			);
		}

		try {
			const output = await runCronJob(job, c.env);
			return { success: true, result: { jobName, output } };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Job execution failed";
			return c.json(
				{ success: false, errors: [{ code: 5000, message }] },
				500,
			);
		}
	}
}
