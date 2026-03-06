import { describe, it, expect } from "vitest";
import { parseSynthesisResponse, type SynthesisOutput } from "./profile-synthesizer";

describe("parseSynthesisResponse", () => {
	it("parses a valid synthesis response", () => {
		const raw = JSON.stringify({
			summary: "Booz Allen is a major defense contractor focused on DevSecOps.",
			trajectory: "Growing presence in Navy IT modernization.",
			relevanceScore: 85,
			insights: [
				{ type: "competitor_assessment", content: "BAH is actively competing in the DevSecOps space with SAIC." },
			],
		});

		const result = parseSynthesisResponse(raw);

		expect(result.summary).toBe("Booz Allen is a major defense contractor focused on DevSecOps.");
		expect(result.trajectory).toBe("Growing presence in Navy IT modernization.");
		expect(result.relevanceScore).toBe(85);
		expect(result.insights).toHaveLength(1);
		expect(result.insights[0].type).toBe("competitor_assessment");
	});

	it("clamps relevance score to 0-100", () => {
		const raw = JSON.stringify({
			summary: "Test entity",
			trajectory: null,
			relevanceScore: 150,
			insights: [],
		});

		const result = parseSynthesisResponse(raw);
		expect(result.relevanceScore).toBe(100);
	});

	it("clamps negative relevance score to 0", () => {
		const raw = JSON.stringify({
			summary: "Test",
			relevanceScore: -10,
			insights: [],
		});

		const result = parseSynthesisResponse(raw);
		expect(result.relevanceScore).toBe(0);
	});

	it("filters out insights with invalid types", () => {
		const raw = JSON.stringify({
			summary: "Test",
			relevanceScore: 50,
			insights: [
				{ type: "competitor_assessment", content: "Valid insight" },
				{ type: "invalid_type", content: "Should be dropped" },
				{ type: "opportunity_alert", content: "Another valid one" },
			],
		});

		const result = parseSynthesisResponse(raw);
		expect(result.insights).toHaveLength(2);
		expect(result.insights[0].type).toBe("competitor_assessment");
		expect(result.insights[1].type).toBe("opportunity_alert");
	});

	it("returns defaults for invalid JSON", () => {
		const result = parseSynthesisResponse("not json");

		expect(result.summary).toBe("");
		expect(result.trajectory).toBeNull();
		expect(result.relevanceScore).toBe(0);
		expect(result.insights).toHaveLength(0);
	});

	it("returns defaults for empty response", () => {
		const result = parseSynthesisResponse("");

		expect(result.summary).toBe("");
		expect(result.insights).toHaveLength(0);
	});

	it("handles missing optional fields gracefully", () => {
		const raw = JSON.stringify({
			summary: "Just a summary",
			insights: [],
		});

		const result = parseSynthesisResponse(raw);
		expect(result.summary).toBe("Just a summary");
		expect(result.trajectory).toBeNull();
		expect(result.relevanceScore).toBe(0);
	});
});
