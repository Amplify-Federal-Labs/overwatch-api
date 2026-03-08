import { describe, it, expect, vi } from "vitest";
import { parseRelevanceResponse, buildRelevanceContext, type RelevanceInput } from "./signal-relevance-scorer";

const CONTRACT_AWARD_INPUT: RelevanceInput = {
	content: "Booz Allen Hamilton has been awarded a $5 million contract by NIWC Pacific for DevSecOps platform modernization.",
	observations: [
		{
			type: "contract_award",
			summary: "Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific",
			entities: [
				{ type: "company", name: "Booz Allen Hamilton", role: "subject" },
				{ type: "agency", name: "NIWC Pacific", role: "object" },
				{ type: "technology", name: "DevSecOps", role: "mentioned" },
			],
		},
	],
	entityContext: [
		{ name: "Booz Allen Hamilton", type: "company", summary: "Major defense contractor and competitor in DevSecOps space" },
		{ name: "NIWC Pacific", type: "agency", summary: "Naval Information Warfare Center, active in C4ISR and DevSecOps" },
	],
};

const IRRELEVANT_INPUT: RelevanceInput = {
	content: "New York City announced funding for public school cafeteria upgrades across 500 schools.",
	observations: [
		{
			type: "budget_signal",
			summary: "NYC funds cafeteria upgrades",
			entities: [
				{ type: "agency", name: "NYC Department of Education", role: "subject" },
			],
		},
	],
	entityContext: [],
};

describe("parseRelevanceResponse", () => {
	it("parses valid JSON with score and rationale", () => {
		const raw = JSON.stringify({
			relevanceScore: 85,
			rationale: "Direct competitor winning in Amplify's core DevSecOps space at a target Navy agency.",
		});
		const result = parseRelevanceResponse(raw);
		expect(result.relevanceScore).toBe(85);
		expect(result.rationale).toContain("DevSecOps");
	});

	it("clamps score to 0-100", () => {
		const raw = JSON.stringify({ relevanceScore: 150, rationale: "test" });
		const result = parseRelevanceResponse(raw);
		expect(result.relevanceScore).toBe(100);
	});

	it("clamps negative score to 0", () => {
		const raw = JSON.stringify({ relevanceScore: -10, rationale: "test" });
		const result = parseRelevanceResponse(raw);
		expect(result.relevanceScore).toBe(0);
	});

	it("defaults to 0 on empty response", () => {
		const result = parseRelevanceResponse("");
		expect(result.relevanceScore).toBe(0);
		expect(result.rationale).toBe("");
	});

	it("defaults to 0 on malformed JSON", () => {
		const result = parseRelevanceResponse("not json");
		expect(result.relevanceScore).toBe(0);
	});

	it("rounds fractional scores", () => {
		const raw = JSON.stringify({ relevanceScore: 72.8, rationale: "test" });
		const result = parseRelevanceResponse(raw);
		expect(result.relevanceScore).toBe(73);
	});

	it("handles missing rationale", () => {
		const raw = JSON.stringify({ relevanceScore: 50 });
		const result = parseRelevanceResponse(raw);
		expect(result.relevanceScore).toBe(50);
		expect(result.rationale).toBe("");
	});

	it("parses competencyCodes from response", () => {
		const raw = JSON.stringify({
			relevanceScore: 85,
			rationale: "DevSecOps contract at Navy target agency",
			competencyCodes: ["A", "B"],
		});
		const result = parseRelevanceResponse(raw);
		expect(result.competencyCodes).toEqual(["A", "B"]);
	});

	it("filters invalid competency codes", () => {
		const raw = JSON.stringify({
			relevanceScore: 60,
			rationale: "test",
			competencyCodes: ["A", "Z", "E", "invalid"],
		});
		const result = parseRelevanceResponse(raw);
		expect(result.competencyCodes).toEqual(["A", "E"]);
	});

	it("defaults competencyCodes to empty array when missing", () => {
		const raw = JSON.stringify({ relevanceScore: 50, rationale: "test" });
		const result = parseRelevanceResponse(raw);
		expect(result.competencyCodes).toEqual([]);
	});

	it("defaults competencyCodes to empty on malformed response", () => {
		const result = parseRelevanceResponse("not json");
		expect(result.competencyCodes).toEqual([]);
	});
});

describe("buildRelevanceContext", () => {
	it("includes signal content", () => {
		const context = buildRelevanceContext(CONTRACT_AWARD_INPUT);
		expect(context).toContain("Booz Allen Hamilton has been awarded");
	});

	it("includes observation summaries", () => {
		const context = buildRelevanceContext(CONTRACT_AWARD_INPUT);
		expect(context).toContain("contract_award");
		expect(context).toContain("Booz Allen Hamilton won $5M");
	});

	it("includes entity context when available", () => {
		const context = buildRelevanceContext(CONTRACT_AWARD_INPUT);
		expect(context).toContain("Booz Allen Hamilton (company)");
		expect(context).toContain("Major defense contractor");
	});

	it("handles empty entity context", () => {
		const context = buildRelevanceContext(IRRELEVANT_INPUT);
		expect(context).toContain("NYC");
		expect(context).not.toContain("Known entities");
	});

	it("includes entity names and roles from observations", () => {
		const context = buildRelevanceContext(CONTRACT_AWARD_INPUT);
		expect(context).toContain("NIWC Pacific");
		expect(context).toContain("DevSecOps");
	});
});
