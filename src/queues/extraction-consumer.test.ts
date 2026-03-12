import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleExtraction } from "./extraction-consumer";

function makeDeps() {
	return {
		resolutionQueue: {
			send: vi.fn().mockResolvedValue(undefined),
		},
		repository: {
			findIngestedItemById: vi.fn(),
			insertObservations: vi.fn(),
			updateRelevanceScore: vi.fn().mockResolvedValue(undefined),
		},
		extractor: {
			extract: vi.fn(),
		},
		scorer: {
			score: vi.fn(),
		},
		pageFetcher: {
			fetchPage: vi.fn(),
		},
		threshold: 60,
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
	};
}

describe("extraction-consumer", () => {
	let deps: ReturnType<typeof makeDeps>;

	beforeEach(() => {
		deps = makeDeps();
	});

	it("should extract observations, score relevance, and produce resolution messages when above threshold", async () => {
		deps.repository.findIngestedItemById.mockResolvedValue({
			id: "item-1",
			content: "Booz Allen wins $5M NIWC contract",
			sourceType: "rss",
			sourceName: "GovConWire",
			sourceUrl: "https://gcw.com/1",
			sourceLink: "https://gcw.com/1",
			sourceMetadata: null,
		});
		deps.extractor.extract.mockResolvedValue({
			observations: [
				{
					type: "contract_award",
					summary: "Booz Allen won $5M contract from NIWC",
					entities: [
						{ type: "company", name: "Booz Allen", role: "subject" },
						{ type: "agency", name: "NIWC Pacific", role: "object" },
					],
					attributes: { amount: "$5M" },
				},
			],
		});
		deps.repository.insertObservations.mockResolvedValue([
			{
				observationId: 1,
				entities: [
					{ rawName: "Booz Allen", entityType: "company", role: "subject" },
					{ rawName: "NIWC Pacific", entityType: "agency", role: "object" },
				],
			},
		]);
		deps.pageFetcher.fetchPage.mockResolvedValue("Full article text");
		deps.scorer.score.mockResolvedValue({
			relevanceScore: 85,
			rationale: "Direct DevSecOps opportunity",
			competencyCodes: ["A"],
		});

		const result = await handleExtraction("item-1", deps);

		expect(deps.extractor.extract).toHaveBeenCalledOnce();
		expect(deps.repository.insertObservations).toHaveBeenCalledWith("item-1", expect.arrayContaining([
			expect.objectContaining({ type: "contract_award" }),
		]));
		expect(deps.scorer.score).toHaveBeenCalledOnce();
		expect(deps.repository.updateRelevanceScore).toHaveBeenCalledWith(
			"item-1", 85, "Direct DevSecOps opportunity", ["A"],
		);
		expect(result.aboveThreshold).toBe(true);
		expect(result.observationsExtracted).toBe(1);
		expect(deps.resolutionQueue.send).toHaveBeenCalledOnce();
	});

	it("should not produce resolution messages when below threshold", async () => {
		deps.repository.findIngestedItemById.mockResolvedValue({
			id: "item-1",
			content: "Unrelated civilian contract",
			sourceType: "rss",
			sourceName: "GovConWire",
			sourceUrl: null,
			sourceLink: null,
			sourceMetadata: null,
		});
		deps.extractor.extract.mockResolvedValue({
			observations: [
				{
					type: "contract_award",
					summary: "Civilian contract awarded",
					entities: [{ type: "company", name: "SomeCorpLLC", role: "subject" }],
				},
			],
		});
		deps.repository.insertObservations.mockResolvedValue([
			{ observationId: 1, entities: [{ rawName: "SomeCorpLLC", entityType: "company", role: "subject" }] },
		]);
		deps.scorer.score.mockResolvedValue({
			relevanceScore: 25,
			rationale: "Low relevance",
			competencyCodes: [],
		});

		const result = await handleExtraction("item-1", deps);

		expect(result.aboveThreshold).toBe(false);
		expect(deps.resolutionQueue.send).not.toHaveBeenCalled();
		expect(deps.repository.updateRelevanceScore).toHaveBeenCalledWith(
			"item-1", 25, "Low relevance", [],
		);
	});

	it("should return early if ingested item not found in DB", async () => {
		deps.repository.findIngestedItemById.mockResolvedValue(null);

		const result = await handleExtraction("nonexistent", deps);

		expect(result.observationsExtracted).toBe(0);
		expect(result.aboveThreshold).toBe(false);
		expect(deps.extractor.extract).not.toHaveBeenCalled();
	});

	it("should produce one resolution message per observation with its entities", async () => {
		deps.repository.findIngestedItemById.mockResolvedValue({
			id: "item-1",
			content: "Multi-event article",
			sourceType: "rss",
			sourceName: "GovConWire",
			sourceUrl: null,
			sourceLink: null,
			sourceMetadata: null,
		});
		deps.extractor.extract.mockResolvedValue({
			observations: [
				{
					type: "contract_award",
					summary: "Award 1",
					entities: [{ type: "company", name: "SAIC", role: "subject" }],
				},
				{
					type: "personnel_move",
					summary: "Person moved",
					entities: [{ type: "person", name: "John Smith", role: "subject" }],
				},
			],
		});
		// insertObservations returns count and we need observation IDs for resolution messages
		// The repository returns inserted observation IDs
		deps.repository.insertObservations.mockResolvedValue([
			{ observationId: 101, entities: [{ rawName: "SAIC", entityType: "company", role: "subject" }] },
			{ observationId: 102, entities: [{ rawName: "John Smith", entityType: "person", role: "subject" }] },
		]);
		deps.scorer.score.mockResolvedValue({
			relevanceScore: 80,
			rationale: "Relevant",
			competencyCodes: ["A"],
		});

		await handleExtraction("item-1", deps);

		expect(deps.resolutionQueue.send).toHaveBeenCalledTimes(2);
		expect(deps.resolutionQueue.send).toHaveBeenCalledWith({
			type: "resolution",
			observationId: 101,
			entities: [{ rawName: "SAIC", entityType: "company", role: "subject" }],
		});
		expect(deps.resolutionQueue.send).toHaveBeenCalledWith({
			type: "resolution",
			observationId: 102,
			entities: [{ rawName: "John Smith", entityType: "person", role: "subject" }],
		});
	});

	it("should skip page fetch when sourceLink is null", async () => {
		deps.repository.findIngestedItemById.mockResolvedValue({
			id: "item-1",
			content: "No link item",
			sourceType: "sam_gov",
			sourceName: "SAM.gov",
			sourceUrl: null,
			sourceLink: null,
			sourceMetadata: null,
		});
		deps.extractor.extract.mockResolvedValue({ observations: [] });
		deps.scorer.score.mockResolvedValue({
			relevanceScore: 40,
			rationale: "Moderate",
			competencyCodes: [],
		});

		await handleExtraction("item-1", deps);

		expect(deps.pageFetcher.fetchPage).not.toHaveBeenCalled();
	});

	it("should default relevance to 0 when scorer fails", async () => {
		deps.repository.findIngestedItemById.mockResolvedValue({
			id: "item-1",
			content: "Some content",
			sourceType: "rss",
			sourceName: "GovConWire",
			sourceUrl: null,
			sourceLink: null,
			sourceMetadata: null,
		});
		deps.extractor.extract.mockResolvedValue({ observations: [] });
		deps.scorer.score.mockRejectedValue(new Error("AI timeout"));

		const result = await handleExtraction("item-1", deps);

		expect(deps.repository.updateRelevanceScore).toHaveBeenCalledWith(
			"item-1", 0, "", [],
		);
		expect(result.aboveThreshold).toBe(false);
	});
});
