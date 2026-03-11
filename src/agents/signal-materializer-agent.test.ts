import { describe, it, expect, vi } from "vitest";
import { materializeSignal, shouldSelfSchedule, SELF_SCHEDULE_DELAY_SECONDS, type IngestedItemWithObservations } from "./signal-materializer";
import type { MaterializationResult } from "./signal-materializer-agent";

const ITEM_WITH_OBSERVATIONS: IngestedItemWithObservations = {
	id: "item-1",
	sourceType: "rss",
	sourceName: "GovConWire",
	sourceUrl: "https://govconwire.com/article/1",
	sourceLink: "https://govconwire.com/article/1",
	content: "Booz Allen Hamilton wins $5M DevSecOps contract from NIWC Pacific",
	sourceMetadata: null,
	relevanceScore: null,
	relevanceRationale: null,
	competencyCodes: null,
	createdAt: "2026-03-01T12:00:00Z",
	observations: [
		{
			id: 1,
			signalId: "item-1",
			type: "contract_award",
			summary: "Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific",
			attributes: { amount: "$5M" },
			sourceDate: "2026-03-01",
			createdAt: "2026-03-01T12:00:00Z",
			entities: [
				{ id: 10, observationId: 1, role: "subject", entityType: "company", rawName: "Booz Allen Hamilton", entityProfileId: "profile-bah", resolvedAt: "2026-03-02T00:00:00Z" },
				{ id: 11, observationId: 1, role: "object", entityType: "agency", rawName: "NIWC Pacific", entityProfileId: "profile-niwc", resolvedAt: "2026-03-02T00:00:00Z" },
			],
		},
	],
};

describe("SignalMaterializerAgent pipeline", () => {
	it("should materialize new ingested items that have observations", async () => {
		const entityRelevanceScores: Record<string, number> = {
			"profile-bah": 80,
			"profile-niwc": 60,
		};

		// Simulate agent pipeline: find unmaterialized items → materialize → upsert
		const items = [ITEM_WITH_OBSERVATIONS];
		const upsert = vi.fn().mockResolvedValue(undefined);

		let materialized = 0;
		for (const item of items) {
			const signal = materializeSignal(item, entityRelevanceScores);
			await upsert(signal);
			materialized++;
		}

		expect(materialized).toBe(1);
		expect(upsert).toHaveBeenCalledTimes(1);
		expect(upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "item-1",
				title: "Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific",
				type: "opportunity",
				relevance: 80,
				branch: "NIWC Pacific",
			}),
		);
	});

	it("should skip items with no observations", async () => {
		const itemNoObs: IngestedItemWithObservations = {
			...ITEM_WITH_OBSERVATIONS,
			id: "item-2",
			observations: [],
		};

		const upsert = vi.fn();

		// Agent should skip items with no observations
		const items = [itemNoObs];
		let materialized = 0;
		for (const item of items) {
			if (item.observations.length === 0) continue;
			const signal = materializeSignal(item, {});
			await upsert(signal);
			materialized++;
		}

		expect(materialized).toBe(0);
		expect(upsert).not.toHaveBeenCalled();
	});

	it("should rematerialize when entity profile relevance changes", async () => {
		const oldScores: Record<string, number> = { "profile-bah": 40 };
		const newScores: Record<string, number> = { "profile-bah": 80 };

		const oldSignal = materializeSignal(ITEM_WITH_OBSERVATIONS, oldScores);
		const newSignal = materializeSignal(ITEM_WITH_OBSERVATIONS, newScores);

		expect(oldSignal.relevance).toBe(40);
		expect(newSignal.relevance).toBe(80);
	});
});

describe("shouldSelfSchedule", () => {
	it("returns true when remaining items exist", () => {
		const result: MaterializationResult = { materialized: 10, skipped: 0, remaining: 5, startedAt: "2026-03-01T00:00:00Z" };
		expect(shouldSelfSchedule(result)).toBe(true);
	});

	it("returns false when no remaining items", () => {
		const result: MaterializationResult = { materialized: 10, skipped: 0, remaining: 0, startedAt: "2026-03-01T00:00:00Z" };
		expect(shouldSelfSchedule(result)).toBe(false);
	});

	it("returns false when nothing was materialized (all skipped)", () => {
		const result: MaterializationResult = { materialized: 0, skipped: 10, remaining: 5, startedAt: "2026-03-01T00:00:00Z" };
		expect(shouldSelfSchedule(result)).toBe(false);
	});

	it("exports a delay constant in seconds", () => {
		expect(SELF_SCHEDULE_DELAY_SECONDS).toBe(1);
	});
});
