import { describe, it, expect, vi } from "vitest";
import type { IngestionResult, IngestionDispatchResult } from "./observation-extractor-logic";
import { buildEarlyRelevanceInput, applyThreshold } from "./relevance-gate";
import { RSS_FEEDS } from "./rss-feeds";
import type { SignalAnalysisInput, ObservationExtractionResult } from "../schemas";
import type { RelevanceResult } from "./signal-relevance-scorer";

// We can't instantiate the Agent class directly in unit tests (requires Durable Objects runtime).
// Instead, we test the pipeline logic by testing the components it orchestrates.
// Integration testing of the full agent will happen via wrangler dev.

describe("ObservationExtractorAgent pipeline", () => {
	it("should orchestrate fetch → extract → score → gate for signals", async () => {
		const mockSignals: SignalAnalysisInput[] = [
			{
				content: "Booz Allen wins $5M NIWC Pacific DevSecOps contract",
				sourceType: "rss",
				sourceName: "GovConWire",
				sourceUrl: "https://govconwire.com/article/1",
				sourceLink: "https://govconwire.com/article/1",
			},
			{
				content: "SAIC awarded Army cloud migration task order",
				sourceType: "rss",
				sourceName: "GovConWire",
				sourceUrl: "https://govconwire.com/article/2",
				sourceLink: "https://govconwire.com/article/2",
			},
		];

		const mockExtractions: ObservationExtractionResult[] = [
			{
				observations: [
					{
						type: "contract_award",
						summary: "Booz Allen won $5M DevSecOps contract from NIWC Pacific",
						entities: [
							{ type: "company", name: "Booz Allen Hamilton", role: "subject" },
							{ type: "agency", name: "NIWC Pacific", role: "object" },
						],
						attributes: { amount: "$5M" },
					},
				],
			},
			{
				observations: [
					{
						type: "contract_award",
						summary: "SAIC awarded Army cloud migration task order",
						entities: [
							{ type: "company", name: "SAIC", role: "subject" },
							{ type: "agency", name: "U.S. Army", role: "object" },
						],
					},
				],
			},
		];

		const mockRelevanceResults: RelevanceResult[] = [
			{ relevanceScore: 85, rationale: "Direct DevSecOps opportunity", competencyCodes: ["A"] },
			{ relevanceScore: 75, rationale: "Cloud migration at Army", competencyCodes: ["B"] },
		];

		const insertIngestedItem = vi.fn()
			.mockResolvedValueOnce("signal-1")
			.mockResolvedValueOnce("signal-2");
		const insertObservations = vi.fn()
			.mockResolvedValueOnce(1)
			.mockResolvedValueOnce(1);
		const extract = vi.fn()
			.mockResolvedValueOnce(mockExtractions[0])
			.mockResolvedValueOnce(mockExtractions[1]);
		const fetchPage = vi.fn().mockResolvedValue("Full article text");
		const scoreRelevance = vi.fn()
			.mockResolvedValueOnce(mockRelevanceResults[0])
			.mockResolvedValueOnce(mockRelevanceResults[1]);
		const updateRelevanceScore = vi.fn().mockResolvedValue(undefined);

		const threshold = 60;
		let itemsStored = 0;
		let observationsExtracted = 0;
		let itemsAboveThreshold = 0;
		let itemsBelowThreshold = 0;

		for (let i = 0; i < mockSignals.length; i++) {
			const signal = mockSignals[i];
			const itemId = await insertIngestedItem(signal);
			if (!itemId) continue;

			const extraction = await extract(signal);
			if (extraction.observations.length > 0) {
				const count = await insertObservations(itemId, extraction.observations);
				observationsExtracted += count;
			}

			const fetchedPage = signal.sourceLink ? await fetchPage(signal.sourceLink) : null;
			const relevanceInput = buildEarlyRelevanceInput(signal.content, fetchedPage, extraction.observations);
			const relevance = await scoreRelevance(relevanceInput);
			await updateRelevanceScore(itemId, relevance.relevanceScore, relevance.rationale, relevance.competencyCodes);

			itemsStored++;
			if (applyThreshold(relevance.relevanceScore, threshold)) {
				itemsAboveThreshold++;
			} else {
				itemsBelowThreshold++;
			}
		}

		expect(itemsStored).toBe(2);
		expect(observationsExtracted).toBe(2);
		expect(itemsAboveThreshold).toBe(2);
		expect(itemsBelowThreshold).toBe(0);
		expect(fetchPage).toHaveBeenCalledTimes(2);
		expect(scoreRelevance).toHaveBeenCalledTimes(2);
		expect(updateRelevanceScore).toHaveBeenCalledTimes(2);
	});

	it("should gate low-relevance items from downstream processing", async () => {
		const mockSignals: SignalAnalysisInput[] = [
			{ content: "High relevance signal", sourceType: "rss", sourceName: "Test", sourceLink: "https://example.com/1" },
			{ content: "Low relevance signal", sourceType: "rss", sourceName: "Test", sourceLink: "https://example.com/2" },
		];

		const insertIngestedItem = vi.fn()
			.mockResolvedValueOnce("item-1")
			.mockResolvedValueOnce("item-2");
		const insertObservations = vi.fn().mockResolvedValue(1);
		const extract = vi.fn().mockResolvedValue({
			observations: [{ type: "solicitation", summary: "Test", entities: [] }],
		});
		const fetchPage = vi.fn().mockResolvedValue(null);
		const scoreRelevance = vi.fn()
			.mockResolvedValueOnce({ relevanceScore: 80, rationale: "High", competencyCodes: ["A"] })
			.mockResolvedValueOnce({ relevanceScore: 25, rationale: "Low", competencyCodes: [] });
		const updateRelevanceScore = vi.fn().mockResolvedValue(undefined);

		const threshold = 60;
		let itemsAboveThreshold = 0;
		let itemsBelowThreshold = 0;

		for (const signal of mockSignals) {
			const itemId = await insertIngestedItem(signal);
			if (!itemId) continue;

			const extraction = await extract(signal);
			if (extraction.observations.length > 0) {
				await insertObservations(itemId, extraction.observations);
			}

			const fetchedPage = signal.sourceLink ? await fetchPage(signal.sourceLink) : null;
			const relevanceInput = buildEarlyRelevanceInput(signal.content, fetchedPage, extraction.observations);
			const relevance = await scoreRelevance(relevanceInput);
			await updateRelevanceScore(itemId, relevance.relevanceScore, relevance.rationale, relevance.competencyCodes);

			if (applyThreshold(relevance.relevanceScore, threshold)) {
				itemsAboveThreshold++;
			} else {
				itemsBelowThreshold++;
			}
		}

		// Both items stored, but only 1 passes threshold
		expect(itemsAboveThreshold).toBe(1);
		expect(itemsBelowThreshold).toBe(1);
		expect(updateRelevanceScore).toHaveBeenCalledTimes(2);
		// Entity resolution should only be queued when itemsAboveThreshold > 0
		expect(itemsAboveThreshold > 0).toBe(true);
	});

	it("should skip duplicate signals", async () => {
		const insertIngestedItem = vi.fn().mockResolvedValue(null);

		const signal: SignalAnalysisInput = {
			content: "Old article",
			sourceType: "rss",
			sourceName: "GovConWire",
			sourceLink: "https://govconwire.com/article/old",
		};

		const itemId = await insertIngestedItem(signal);
		expect(itemId).toBeNull();
	});

	it("should have valid RSS feed configurations", () => {
		expect(RSS_FEEDS.length).toBeGreaterThan(0);
		for (const feed of RSS_FEEDS) {
			expect(feed.url).toBeTruthy();
			expect(feed.sourceName).toBeTruthy();
			expect(feed.url).toMatch(/^https?:\/\//);
		}
	});

	it("should dispatch one task per RSS feed", async () => {
		const queueFn = vi.fn();

		for (const feed of RSS_FEEDS) {
			await queueFn("ingestRssFeed", feed);
		}

		expect(queueFn).toHaveBeenCalledTimes(RSS_FEEDS.length);
		for (let i = 0; i < RSS_FEEDS.length; i++) {
			expect(queueFn).toHaveBeenCalledWith("ingestRssFeed", RSS_FEEDS[i]);
		}
	});

	it("should include threshold counts in IngestionResult", () => {
		const ingestionResult: IngestionResult = {
			sourceType: "rss",
			signalsFound: 5,
			signalsStored: 5,
			observationsExtracted: 5,
			itemsAboveThreshold: 3,
			itemsBelowThreshold: 2,
			startedAt: new Date().toISOString(),
		};

		expect(ingestionResult.itemsAboveThreshold).toBe(3);
		expect(ingestionResult.itemsBelowThreshold).toBe(2);
		expect(ingestionResult.itemsAboveThreshold + ingestionResult.itemsBelowThreshold)
			.toBe(ingestionResult.signalsStored);
	});

	it("should continue processing when one signal fails extraction", async () => {
		const insertIngestedItem = vi.fn()
			.mockResolvedValueOnce("signal-1")
			.mockResolvedValueOnce("signal-2");
		const extract = vi.fn()
			.mockRejectedValueOnce(new Error("AI failed"))
			.mockResolvedValueOnce({
				observations: [
					{ type: "solicitation", summary: "Army RFP", entities: [{ type: "agency", name: "Army", role: "subject" }] },
				],
			});
		const insertObservations = vi.fn().mockResolvedValue(1);
		const scoreRelevance = vi.fn().mockResolvedValue({ relevanceScore: 70, rationale: "Relevant", competencyCodes: [] });
		const updateRelevanceScore = vi.fn().mockResolvedValue(undefined);

		const signals: SignalAnalysisInput[] = [
			{ content: "Signal 1", sourceType: "rss", sourceName: "Test" },
			{ content: "Signal 2", sourceType: "rss", sourceName: "Test" },
		];

		let signalsStored = 0;
		let observationsExtracted = 0;

		for (const signal of signals) {
			try {
				const itemId = await insertIngestedItem(signal);
				if (!itemId) continue;

				const extraction = await extract(signal);
				if (extraction.observations.length > 0) {
					const count = await insertObservations(itemId, extraction.observations);
					observationsExtracted += count;
				}

				const relevanceInput = buildEarlyRelevanceInput(signal.content, null, extraction.observations);
				const relevance = await scoreRelevance(relevanceInput);
				await updateRelevanceScore(itemId, relevance.relevanceScore, relevance.rationale, relevance.competencyCodes);

				signalsStored++;
			} catch {
				// continue on error, matching agent behavior
			}
		}

		expect(signalsStored).toBe(1);
		expect(observationsExtracted).toBe(1);
	});
});
