import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SignalAnalysisInput, SignalAnalysisResult } from "../../schemas";

const mockCreate = vi.fn();

vi.mock("openai", () => {
	return {
		default: class MockOpenAI {
			chat = { completions: { create: mockCreate } };
		},
	};
});

// Import app after mocking openai
const { app } = await import("../../index");

const VALID_RESULT: SignalAnalysisResult = {
	title: "Navy Cloud Migration RFI",
	summary: "NIWC PAC seeks industry input for IL5 cloud platform migration.",
	type: "opportunity",
	branch: "Navy",
	tags: ["IL5", "cloud migration", "NIWC"],
	competencies: ["B", "C"],
	play: "classifiedai",
	relevance: 92,
	entities: [
		{ type: "agency", value: "NIWC Pacific", confidence: 0.95 },
		{ type: "program", value: "Next-Gen Cloud Platform", confidence: 0.88 },
	],
};

const SAMPLE_INPUT: SignalAnalysisInput = {
	content: "NIWC Pacific has released an RFI for Next-Gen Cloud Platform Migration to IL5...",
	sourceType: "sam_gov",
	sourceName: "SAM.gov",
	sourceUrl: "https://sam.gov/opp/abc123",
};

describe("POST /signals/analyze route", () => {
	beforeEach(() => {
		mockCreate.mockReset();
	});

	it("returns 200 with a SignalAnalysisResult", async () => {
		mockCreate.mockResolvedValueOnce({
			choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }],
		});

		const res = await app.request("/signals/analyze", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(SAMPLE_INPUT),
		}, { OPENAI_API_KEY: "test-key", DB: {} });

		expect(res.status).toBe(200);
		const data = await res.json<{ success: boolean; result: SignalAnalysisResult }>();
		expect(data.success).toBe(true);
		expect(data.result.title).toBe("Navy Cloud Migration RFI");
		expect(data.result.type).toBe("opportunity");
		expect(data.result.relevance).toBe(92);
	});

	it("returns 400 when content is missing", async () => {
		const res = await app.request("/signals/analyze", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sourceType: "rss", sourceName: "Test" }),
		}, { OPENAI_API_KEY: "test-key", DB: {} });

		expect(res.status).toBe(400);
	});

	it("returns 500 when OpenAI fails", async () => {
		mockCreate.mockRejectedValueOnce(new Error("OpenAI API error"));

		const res = await app.request("/signals/analyze", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(SAMPLE_INPUT),
		}, { OPENAI_API_KEY: "test-key", DB: {} });

		expect(res.status).toBe(500);
	});
});
