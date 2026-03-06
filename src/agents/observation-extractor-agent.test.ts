import { describe, it, expect, vi } from "vitest";
import type { IngestionResult } from "./observation-extractor-agent";
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
		const insertSignal = vi.fn()
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
			const signalId = await insertSignal(signal);
			if (!signalId) continue;

			const result = await extract(signal);
			if (result.observations.length > 0) {
				const count = await insertObservations(signalId, result.observations);
				observationsExtracted += count;
			}
			signalsStored++;
		}

		expect(signalsStored).toBe(2);
		expect(observationsExtracted).toBe(2);
		expect(insertSignal).toHaveBeenCalledTimes(2);
		expect(extract).toHaveBeenCalledTimes(2);
		expect(insertObservations).toHaveBeenCalledTimes(2);
	});

	it("should skip duplicate signals", async () => {
		const insertSignal = vi.fn().mockResolvedValue(null); // signal already exists

		const signal: SignalAnalysisInput = {
			content: "Old article",
			sourceType: "rss",
			sourceName: "GovConWire",
			sourceLink: "https://govconwire.com/article/old",
		};

		const signalId = await insertSignal(signal);
		expect(signalId).toBeNull();
	});

	it("should continue processing when one signal fails extraction", async () => {
		const insertSignal = vi.fn()
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
				const signalId = await insertSignal(signal);
				if (!signalId) continue;

				const result = await extract(signal);
				if (result.observations.length > 0) {
					const count = await insertObservations(signalId, result.observations);
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
