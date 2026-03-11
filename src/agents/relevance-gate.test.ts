import { describe, it, expect } from "vitest";
import { buildEarlyRelevanceInput, applyThreshold } from "./relevance-gate";
import type { ObservationExtraction } from "../schemas";

const OBSERVATIONS: ObservationExtraction[] = [
	{
		type: "contract_award",
		summary: "Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific",
		entities: [
			{ type: "company", name: "Booz Allen Hamilton", role: "subject" },
			{ type: "agency", name: "NIWC Pacific", role: "object" },
		],
		attributes: { amount: "$5M" },
		sourceDate: "2026-03-01",
	},
	{
		type: "technology_adoption",
		summary: "NIWC Pacific adopts Platform One",
		entities: [
			{ type: "agency", name: "NIWC Pacific", role: "subject" },
			{ type: "technology", name: "Platform One", role: "object" },
		],
	},
];

describe("buildEarlyRelevanceInput", () => {
	it("builds input with content and observations only (no page text)", () => {
		const input = buildEarlyRelevanceInput("Raw article text", null, OBSERVATIONS);

		expect(input.content).toBe("Raw article text");
		expect(input.entityContext).toEqual([]);
		expect(input.observations).toHaveLength(2);
	});

	it("enriches content with fetched page text when available", () => {
		const input = buildEarlyRelevanceInput(
			"RSS summary",
			"Full page text with more details about the contract",
			OBSERVATIONS,
		);

		expect(input.content).toContain("RSS summary");
		expect(input.content).toContain("Full page text with more details about the contract");
	});

	it("maps ObservationExtraction to ObservationSummary format", () => {
		const input = buildEarlyRelevanceInput("content", null, OBSERVATIONS);

		expect(input.observations[0]).toEqual({
			type: "contract_award",
			summary: "Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific",
			entities: [
				{ type: "company", name: "Booz Allen Hamilton", role: "subject" },
				{ type: "agency", name: "NIWC Pacific", role: "object" },
			],
		});
	});

	it("handles observations with no entities", () => {
		const obs: ObservationExtraction[] = [
			{ type: "policy_change", summary: "New policy issued", entities: [] },
		];

		const input = buildEarlyRelevanceInput("content", null, obs);

		expect(input.observations[0].entities).toEqual([]);
	});

	it("handles empty observations array", () => {
		const input = buildEarlyRelevanceInput("content", null, []);

		expect(input.observations).toEqual([]);
	});
});

describe("applyThreshold", () => {
	it("returns true when score equals threshold", () => {
		expect(applyThreshold(60, 60)).toBe(true);
	});

	it("returns true when score exceeds threshold", () => {
		expect(applyThreshold(85, 60)).toBe(true);
	});

	it("returns false when score is below threshold", () => {
		expect(applyThreshold(59, 60)).toBe(false);
	});

	it("returns false for score of 0", () => {
		expect(applyThreshold(0, 60)).toBe(false);
	});

	it("returns true for score of 100", () => {
		expect(applyThreshold(100, 60)).toBe(true);
	});
});
