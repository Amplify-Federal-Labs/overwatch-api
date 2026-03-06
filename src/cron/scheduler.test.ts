import { describe, it, expect, vi } from "vitest";

vi.mock("agents", () => ({
	getAgentByName: vi.fn(),
}));

import { getScheduledJob, CRON_JOBS } from "./scheduler";

describe("CRON_JOBS", () => {
	it("has six jobs in order: rss, sam_gov, sam_gov_apbi, fpds, entity_resolution, synthesis", () => {
		expect(CRON_JOBS).toHaveLength(6);
		expect(CRON_JOBS[0].name).toBe("rss");
		expect(CRON_JOBS[1].name).toBe("sam_gov");
		expect(CRON_JOBS[2].name).toBe("sam_gov_apbi");
		expect(CRON_JOBS[3].name).toBe("fpds");
		expect(CRON_JOBS[4].name).toBe("entity_resolution");
		expect(CRON_JOBS[5].name).toBe("synthesis");
	});

	it("ingestion jobs have sourceType matching name", () => {
		for (const job of CRON_JOBS) {
			if (job.kind === "ingestion") {
				expect(job.sourceType).toBe(job.name);
			}
		}
	});

	it("entity_resolution job has kind resolution", () => {
		const job = CRON_JOBS.find((j) => j.name === "entity_resolution");
		expect(job).toBeDefined();
		expect(job!.kind).toBe("resolution");
	});

	it("synthesis job has kind synthesis", () => {
		const job = CRON_JOBS.find((j) => j.name === "synthesis");
		expect(job).toBeDefined();
		expect(job!.kind).toBe("synthesis");
	});
});

describe("getScheduledJob", () => {
	it("returns rss at hour 0", () => {
		expect(getScheduledJob(0).name).toBe("rss");
	});

	it("returns sam_gov at hour 1", () => {
		expect(getScheduledJob(1).name).toBe("sam_gov");
	});

	it("returns sam_gov_apbi at hour 2", () => {
		expect(getScheduledJob(2).name).toBe("sam_gov_apbi");
	});

	it("returns fpds at hour 3", () => {
		expect(getScheduledJob(3).name).toBe("fpds");
	});

	it("returns entity_resolution at hour 4", () => {
		expect(getScheduledJob(4).name).toBe("entity_resolution");
	});

	it("returns synthesis at hour 5", () => {
		expect(getScheduledJob(5).name).toBe("synthesis");
	});

	it("cycles back to rss at hour 6", () => {
		expect(getScheduledJob(6).name).toBe("rss");
	});

	it("cycles through all 24 hours correctly", () => {
		const expected = ["rss", "sam_gov", "sam_gov_apbi", "fpds", "entity_resolution", "synthesis"];
		for (let hour = 0; hour < 24; hour++) {
			expect(getScheduledJob(hour).name).toBe(expected[hour % 6]);
		}
	});
});
