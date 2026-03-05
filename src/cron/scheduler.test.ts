import { describe, it, expect } from "vitest";
import { getScheduledJob, CRON_JOBS } from "./scheduler";

describe("CRON_JOBS", () => {
	it("has four jobs in order: fpds, rss, enrichment, enrichFailed", () => {
		expect(CRON_JOBS).toHaveLength(4);
		expect(CRON_JOBS[0].name).toBe("fpds");
		expect(CRON_JOBS[1].name).toBe("rss");
		expect(CRON_JOBS[2].name).toBe("enrichment");
		expect(CRON_JOBS[3].name).toBe("enrichFailed");
	});
});

describe("getScheduledJob", () => {
	it("returns fpds at hour 0", () => {
		expect(getScheduledJob(0).name).toBe("fpds");
	});

	it("returns rss at hour 1", () => {
		expect(getScheduledJob(1).name).toBe("rss");
	});

	it("returns enrichment at hour 2", () => {
		expect(getScheduledJob(2).name).toBe("enrichment");
	});

	it("returns enrichFailed at hour 3", () => {
		expect(getScheduledJob(3).name).toBe("enrichFailed");
	});

	it("cycles back to fpds at hour 4", () => {
		expect(getScheduledJob(4).name).toBe("fpds");
	});

	it("cycles through all 24 hours correctly", () => {
		const expected = ["fpds", "rss", "enrichment", "enrichFailed"];
		for (let hour = 0; hour < 24; hour++) {
			expect(getScheduledJob(hour).name).toBe(expected[hour % 4]);
		}
	});
});
