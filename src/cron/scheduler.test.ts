import { describe, it, expect, vi } from "vitest";

vi.mock("agents", () => ({
	getAgentByName: vi.fn(),
}));

import { getScheduledJob, CRON_SCHEDULE } from "./scheduler";

describe("CRON_SCHEDULE", () => {
	it("has three ingestion jobs at hours 0, 1, 2", () => {
		expect(CRON_SCHEDULE.size).toBe(3);
		expect(CRON_SCHEDULE.get(0)).toEqual({ name: "rss", kind: "ingestion", sourceType: "rss" });
		expect(CRON_SCHEDULE.get(1)).toEqual({ name: "sam_gov", kind: "ingestion", sourceType: "sam_gov" });
		expect(CRON_SCHEDULE.get(2)).toEqual({ name: "fpds", kind: "ingestion", sourceType: "fpds" });
	});

	it("all jobs are ingestion kind", () => {
		for (const job of CRON_SCHEDULE.values()) {
			expect(job.kind).toBe("ingestion");
		}
	});

	it("does not include resolution, synthesis, enrichment, or materialization", () => {
		const names = [...CRON_SCHEDULE.values()].map((j) => j.name);
		expect(names).not.toContain("entity_resolution");
		expect(names).not.toContain("synthesis");
		expect(names).not.toContain("enrichment");
		expect(names).not.toContain("signal_materialization");
	});
});

describe("getScheduledJob", () => {
	it("returns rss at hour 0 (midnight UTC)", () => {
		const job = getScheduledJob(0);
		expect(job).not.toBeNull();
		expect(job!.name).toBe("rss");
	});

	it("returns sam_gov at hour 1", () => {
		const job = getScheduledJob(1);
		expect(job).not.toBeNull();
		expect(job!.name).toBe("sam_gov");
	});

	it("returns fpds at hour 2", () => {
		const job = getScheduledJob(2);
		expect(job).not.toBeNull();
		expect(job!.name).toBe("fpds");
	});

	it("returns null for hours outside the schedule", () => {
		expect(getScheduledJob(3)).toBeNull();
		expect(getScheduledJob(12)).toBeNull();
		expect(getScheduledJob(23)).toBeNull();
	});
});
