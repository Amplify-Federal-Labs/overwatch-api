import { describe, it, expect, vi } from "vitest";

vi.mock("agents", () => ({
	getAgentByName: vi.fn(),
}));

import { getScheduledJob, findJobByName, CRON_SCHEDULE, ON_DEMAND_JOBS } from "./scheduler";

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

describe("ON_DEMAND_JOBS", () => {
	it("has four agent jobs", () => {
		expect(ON_DEMAND_JOBS.size).toBe(4);
		expect(ON_DEMAND_JOBS.get("entity_resolution")).toEqual({ name: "entity_resolution", kind: "agent", agentName: "entity_resolution" });
		expect(ON_DEMAND_JOBS.get("synthesis")).toEqual({ name: "synthesis", kind: "agent", agentName: "synthesis" });
		expect(ON_DEMAND_JOBS.get("signal_materialization")).toEqual({ name: "signal_materialization", kind: "agent", agentName: "signal_materialization" });
		expect(ON_DEMAND_JOBS.get("enrichment")).toEqual({ name: "enrichment", kind: "agent", agentName: "enrichment" });
	});
});

describe("findJobByName", () => {
	it("finds cron schedule jobs by name", () => {
		expect(findJobByName("rss")).toEqual({ name: "rss", kind: "ingestion", sourceType: "rss" });
		expect(findJobByName("sam_gov")).toEqual({ name: "sam_gov", kind: "ingestion", sourceType: "sam_gov" });
		expect(findJobByName("fpds")).toEqual({ name: "fpds", kind: "ingestion", sourceType: "fpds" });
	});

	it("finds on-demand agent jobs by name", () => {
		expect(findJobByName("entity_resolution")?.kind).toBe("agent");
		expect(findJobByName("synthesis")?.kind).toBe("agent");
		expect(findJobByName("signal_materialization")?.kind).toBe("agent");
		expect(findJobByName("enrichment")?.kind).toBe("agent");
	});

	it("returns null for unknown job names", () => {
		expect(findJobByName("unknown")).toBeNull();
	});
});
