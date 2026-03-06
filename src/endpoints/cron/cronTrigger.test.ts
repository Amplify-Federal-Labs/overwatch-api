import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { fromHono } from "chanfana";
import { CronTrigger } from "./cronTrigger";

const mockRunCronJob = vi.fn();

vi.mock("../../cron/scheduler", () => ({
	CRON_JOBS: [
		{ name: "fpds", kind: "ingestion", sourceType: "fpds" },
		{ name: "rss", kind: "ingestion", sourceType: "rss" },
		{ name: "entity_resolution", kind: "resolution" },
		{ name: "synthesis", kind: "synthesis" },
	],
	runCronJob: (...args: unknown[]) => mockRunCronJob(...args),
}));

function buildApp() {
	const app = fromHono(new Hono());
	app.post("/:jobName", CronTrigger);
	return app;
}

describe("CronTrigger", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("runs a valid job and returns its result", async () => {
		mockRunCronJob.mockResolvedValue({ signalsFound: 5 });

		const app = buildApp();
		const res = await app.request("/fpds", { method: "POST" });
		const body = await res.json<{ success: boolean; result: { jobName: string; output: unknown } }>();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.result.jobName).toBe("fpds");
		expect(body.result.output).toEqual({ signalsFound: 5 });
	});

	it("returns 404 for an unknown job name", async () => {
		const app = buildApp();
		const res = await app.request("/nonexistent", { method: "POST" });
		const body = await res.json<{ success: boolean }>();

		expect(res.status).toBe(404);
		expect(body.success).toBe(false);
	});

	it("returns 500 when job throws", async () => {
		mockRunCronJob.mockRejectedValue(new Error("fetch failed"));

		const app = buildApp();
		const res = await app.request("/fpds", { method: "POST" });
		const body = await res.json<{ success: boolean; errors: { message: string }[] }>();

		expect(res.status).toBe(500);
		expect(body.success).toBe(false);
		expect(body.errors[0].message).toBe("fetch failed");
	});
});
