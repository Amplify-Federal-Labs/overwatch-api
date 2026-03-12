import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMaterialization } from "./materialization-consumer";
import type { IngestedItemWithObservations } from "../agents/signal-materializer";

describe("materialization-consumer", () => {
	const ITEM: IngestedItemWithObservations = {
		id: "item-1",
		sourceType: "rss",
		sourceName: "GovConWire",
		sourceUrl: "https://govconwire.com/article/1",
		sourceLink: "https://govconwire.com/article/1",
		content: "Booz Allen Hamilton wins $5M DevSecOps contract from NIWC Pacific",
		sourceMetadata: null,
		relevanceScore: 75,
		relevanceRationale: "Highly relevant to DevSecOps",
		competencyCodes: ["devsecops", "cloud"],
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

	const baseDeps = {
		repository: {
			findIngestedItemWithObservations: vi.fn(),
			findRelevanceScores: vi.fn(),
			upsertSignal: vi.fn().mockResolvedValue(undefined),
		},
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should materialize a signal from an ingested item", async () => {
		baseDeps.repository.findIngestedItemWithObservations.mockResolvedValue(ITEM);
		baseDeps.repository.findRelevanceScores.mockResolvedValue({
			"profile-bah": 80,
			"profile-niwc": 60,
		});

		const result = await handleMaterialization("item-1", baseDeps);

		expect(result.materialized).toBe(true);
		expect(baseDeps.repository.upsertSignal).toHaveBeenCalledTimes(1);
		expect(baseDeps.repository.upsertSignal).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "item-1",
				ingestedItemId: "item-1",
				relevance: 75, // Uses stored relevanceScore override
			}),
		);
	});

	it("should skip when ingested item is not found", async () => {
		baseDeps.repository.findIngestedItemWithObservations.mockResolvedValue(null);

		const result = await handleMaterialization("missing-item", baseDeps);

		expect(result.materialized).toBe(false);
		expect(baseDeps.repository.upsertSignal).not.toHaveBeenCalled();
	});

	it("should skip when item has no observations", async () => {
		const noObs: IngestedItemWithObservations = { ...ITEM, observations: [] };
		baseDeps.repository.findIngestedItemWithObservations.mockResolvedValue(noObs);

		const result = await handleMaterialization("item-1", baseDeps);

		expect(result.materialized).toBe(false);
		expect(baseDeps.repository.upsertSignal).not.toHaveBeenCalled();
	});

	it("should use entity relevance scores when no stored relevance score", async () => {
		const legacyItem: IngestedItemWithObservations = {
			...ITEM,
			relevanceScore: null,
			relevanceRationale: null,
			competencyCodes: null,
		};
		baseDeps.repository.findIngestedItemWithObservations.mockResolvedValue(legacyItem);
		baseDeps.repository.findRelevanceScores.mockResolvedValue({
			"profile-bah": 80,
			"profile-niwc": 60,
		});

		const result = await handleMaterialization("item-1", baseDeps);

		expect(result.materialized).toBe(true);
		// Without stored score, uses entity relevance (max = 80)
		expect(baseDeps.repository.upsertSignal).toHaveBeenCalledWith(
			expect.objectContaining({
				relevance: 80,
			}),
		);
	});

	it("should handle upsert failure gracefully", async () => {
		baseDeps.repository.findIngestedItemWithObservations.mockResolvedValue(ITEM);
		baseDeps.repository.findRelevanceScores.mockResolvedValue({});
		baseDeps.repository.upsertSignal.mockRejectedValue(new Error("D1 error"));

		const result = await handleMaterialization("item-1", baseDeps);

		expect(result.materialized).toBe(false);
		expect(baseDeps.logger.error).toHaveBeenCalled();
	});
});
