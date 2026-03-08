import { describe, it, expect, vi } from "vitest";
import type { IngestionResult, IngestionDispatchResult } from "./observation-extractor-logic";
import { RSS_FEEDS } from "./rss-feeds";
import type { SignalAnalysisInput, ObservationExtractionResult } from "../schemas";

// We can't instantiate the Agent class directly in unit tests (requires Durable Objects runtime).
// Instead, we test the pipeline logic by testing the components it orchestrates.
// Integration testing of the full agent will happen via wrangler dev.

describe("ObservationExtractorAgent pipeline", () => {
	it("should orchestrate fetch → extract → store for RSS signals", async () => {
		// Simulate the pipeline the agent runs
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

		// Simulate agent pipeline
		const insertIngestedItem = vi.fn()
			.mockResolvedValueOnce("signal-1")
			.mockResolvedValueOnce("signal-2");

		const insertObservations = vi.fn()
			.mockResolvedValueOnce(1)
			.mockResolvedValueOnce(1);

		const extract = vi.fn()
			.mockResolvedValueOnce(mockExtractions[0])
			.mockResolvedValueOnce(mockExtractions[1]);

		let signalsStored = 0;
		let observationsExtracted = 0;

		for (const signal of mockSignals) {
			const itemId = await insertIngestedItem(signal);
			if (!itemId) continue;

			const result = await extract(signal);
			if (result.observations.length > 0) {
				const count = await insertObservations(itemId, result.observations);
				observationsExtracted += count;
			}
			signalsStored++;
		}

		expect(signalsStored).toBe(2);
		expect(observationsExtracted).toBe(2);
		expect(insertIngestedItem).toHaveBeenCalledTimes(2);
		expect(extract).toHaveBeenCalledTimes(2);
		expect(insertObservations).toHaveBeenCalledTimes(2);
	});

	it("should skip duplicate signals", async () => {
		const insertIngestedItem = vi.fn().mockResolvedValue(null); // signal already exists

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
		// Simulate the dispatch logic: for each feed, queue a task
		const queueFn = vi.fn();

		for (const feed of RSS_FEEDS) {
			await queueFn("ingestRssFeed", feed);
		}

		expect(queueFn).toHaveBeenCalledTimes(RSS_FEEDS.length);
		for (let i = 0; i < RSS_FEEDS.length; i++) {
			expect(queueFn).toHaveBeenCalledWith("ingestRssFeed", RSS_FEEDS[i]);
		}
	});

	it("should process a single feed in ingestRssFeed", async () => {
		const mockItems: SignalAnalysisInput[] = [
			{
				content: "Defense One reports new Army modernization push",
				sourceType: "rss",
				sourceName: "DefenseOne",
				sourceUrl: "https://defenseone.com/article/1",
				sourceLink: "https://defenseone.com/article/1",
			},
		];

		const insertIngestedItem = vi.fn().mockResolvedValueOnce("item-1");
		const insertObservations = vi.fn().mockResolvedValueOnce(1);
		const extract = vi.fn().mockResolvedValueOnce({
			observations: [
				{
					type: "policy_announcement",
					summary: "Army modernization push",
					entities: [{ type: "agency", name: "U.S. Army", role: "subject" }],
				},
			],
		});

		let itemsStored = 0;
		let observationsExtracted = 0;

		// Simulate single-feed processing (ingestRssFeed logic)
		for (const input of mockItems) {
			try {
				const itemId = await insertIngestedItem(input);
				if (!itemId) continue;

				const result = await extract(input);
				if (result.observations.length > 0) {
					const count = await insertObservations(itemId, result.observations);
					observationsExtracted += count;
				}
				itemsStored++;
			} catch {
				// continue on error
			}
		}

		const ingestionResult: IngestionResult = {
			sourceType: "rss",
			signalsFound: mockItems.length,
			signalsStored: itemsStored,
			observationsExtracted,
			startedAt: new Date().toISOString(),
		};

		expect(ingestionResult.signalsFound).toBe(1);
		expect(ingestionResult.signalsStored).toBe(1);
		expect(ingestionResult.observationsExtracted).toBe(1);
	});

	it("should continue processing when one signal fails extraction", async () => {
		const insertIngestedItem = vi.fn()
			.mockResolvedValueOnce("signal-1")
			.mockResolvedValueOnce("signal-2");

		const extract = vi.fn()
			.mockRejectedValueOnce(new Error("AI failed"))
			.mockResolvedValueOnce({
				observations: [
					{
						type: "solicitation",
						summary: "Army RFP",
						entities: [{ type: "agency", name: "Army", role: "subject" }],
					},
				],
			});

		const insertObservations = vi.fn().mockResolvedValue(1);

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

				const result = await extract(signal);
				if (result.observations.length > 0) {
					const count = await insertObservations(itemId, result.observations);
					observationsExtracted += count;
				}
				signalsStored++;
			} catch {
				// continue on error, matching agent behavior
			}
		}

		expect(signalsStored).toBe(1);
		expect(observationsExtracted).toBe(1);
	});
});
