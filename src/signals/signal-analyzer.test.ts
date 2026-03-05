import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignalAnalyzer } from "./signal-analyzer";
import type { SignalAnalysisInput, SignalAnalysisResult } from "../schemas";

const mockCreate = vi.fn();

vi.mock("openai", () => {
	return {
		default: class MockOpenAI {
			chat = { completions: { create: mockCreate } };
		},
	};
});

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

describe("SignalAnalyzer", () => {
	const mockEnv = {
		CF_AIG_TOKEN: "test-api-key",
		CF_AIG_BASEURL: "https://test.example.com",
		CF_AIG_MODEL: "test-model",
	} as Env;

	beforeEach(() => {
		mockCreate.mockReset();
	});

	describe("construction", () => {
		it("creates an instance with env", () => {
			const agent = new SignalAnalyzer(mockEnv);
			expect(agent).toBeInstanceOf(SignalAnalyzer);
		});
	});

	describe("analyze", () => {
		it("returns a structured SignalAnalysisResult from raw content", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);

			expect(result.title).toBe("Navy Cloud Migration RFI");
			expect(result.type).toBe("opportunity");
			expect(result.branch).toBe("Navy");
			expect(result.relevance).toBe(92);
			expect(result.competencies).toEqual(["B", "C"]);
			expect(result.play).toBe("classifiedai");
			expect(result.entities).toHaveLength(2);
			expect(result.entities[0].type).toBe("agency");
			expect(result.tags).toContain("IL5");
		});

		it("calls OpenAI chat completions with correct model and JSON mode", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }],
			});

			await agent.analyze(SAMPLE_INPUT);

			expect(mockCreate).toHaveBeenCalledOnce();
			const callArgs = mockCreate.mock.calls[0][0];
			expect(callArgs.model).toBe("workers-ai/test-model");
			expect(callArgs.response_format).toEqual({ type: "json_object" });
			expect(callArgs.messages).toHaveLength(2);
			expect(callArgs.messages[0].role).toBe("system");
			expect(callArgs.messages[1].role).toBe("user");
		});

		it("includes all competency clusters in the system prompt", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }],
			});

			await agent.analyze(SAMPLE_INPUT);

			const systemPrompt: string = mockCreate.mock.calls[0][0].messages[0].content;
			expect(systemPrompt).toContain("A: Software Factory");
			expect(systemPrompt).toContain("B: Classified Platform Engineering");
			expect(systemPrompt).toContain("C: Mission-Critical Modernization");
			expect(systemPrompt).toContain("D: Enterprise IT Operations");
			expect(systemPrompt).toContain("E: Enterprise Data Engineering & AI");
			expect(systemPrompt).toContain("F: ISR/GEOINT/Distributed Systems");
		});

		it("includes entity confidence scoring rubric in the system prompt", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }],
			});

			await agent.analyze(SAMPLE_INPUT);

			const systemPrompt: string = mockCreate.mock.calls[0][0].messages[0].content;
			expect(systemPrompt).toContain("0.9-1.0");
			expect(systemPrompt).toContain("0.7-0.89");
			expect(systemPrompt).toContain("0.5-0.69");
			expect(systemPrompt).toContain("below 0.5");
		});

		it("includes actionable relevance scoring rubric in the system prompt", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }],
			});

			await agent.analyze(SAMPLE_INPUT);

			const systemPrompt: string = mockCreate.mock.calls[0][0].messages[0].content;
			// 90-100 tier requires direct contract opportunities
			expect(systemPrompt).toContain("90-100");
			expect(systemPrompt).toMatch(/90-100.*contract opportunit/is);
			// 75-89 tier requires named DoD programs or competitor contract wins
			expect(systemPrompt).toContain("75-89");
			expect(systemPrompt).toMatch(/75-89.*DoD program/is);
			// 50-74 tier for industry trends without actionable opportunities
			expect(systemPrompt).toContain("50-74");
			// Below 50 for tangential news
			expect(systemPrompt).toMatch(/below 50/i);
		});

		it("includes all outreach plays in the system prompt", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }],
			});

			await agent.analyze(SAMPLE_INPUT);

			const systemPrompt: string = mockCreate.mock.calls[0][0].messages[0].content;
			expect(systemPrompt).toContain('"modernization"');
			expect(systemPrompt).toContain('"navigator"');
			expect(systemPrompt).toContain('"softwarefactory"');
			expect(systemPrompt).toContain('"jumpfence"');
			expect(systemPrompt).toContain('"classifiedai"');
		});

		it("includes source info and content in the user message", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }],
			});

			await agent.analyze(SAMPLE_INPUT);

			const userMessage: string = mockCreate.mock.calls[0][0].messages[1].content;
			expect(userMessage).toContain("SAM.gov");
			expect(userMessage).toContain("sam_gov");
			expect(userMessage).toContain("https://sam.gov/opp/abc123");
			expect(userMessage).toContain("NIWC Pacific has released an RFI");
		});
	});

	describe("error handling", () => {
		it("throws on empty response from OpenAI", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: null } }],
			});

			await expect(agent.analyze(SAMPLE_INPUT)).rejects.toThrow("Empty response from Worker AI");
		});

		it("strips markdown fences from JSON response", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			const fenced = "```json\n" + JSON.stringify(VALID_RESULT) + "\n```";
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: fenced } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);
			expect(result.title).toBe("Navy Cloud Migration RFI");
		});

		it("recovers from truncated JSON by closing open strings and braces", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			const truncated = '{"title":"Navy Cloud RFI","summary":"NIWC PAC seeks input","type":"opportunity","branch":"Navy","tags":["IL5"],"competencies":["B"],"play":"classifiedai","relevance":92,"entities":[{"type":"agency","value":"NIWC Pac';
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: truncated } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);
			expect(result.title).toBe("Navy Cloud RFI");
			expect(result.type).toBe("opportunity");
			expect(result.relevance).toBe(92);
		});

		it("recovers from JSON truncated mid-array", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			const truncated = '{"title":"Test","summary":"Summary","type":"opportunity","branch":"Navy","tags":["IL5","cloud';
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: truncated } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);
			expect(result.title).toBe("Test");
			expect(result.type).toBe("opportunity");
		});

		it("recovers from JSON with missing colon after property name", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			// Simulates the production error: "Expected ':' after property name in JSON"
			const malformed = '{"title": "FedScoop Signal", "summary" "This is a test summary", "type": "strategy", "branch": "Other", "tags": [], "competencies": [], "play": null, "relevance": 50, "entities": []}';
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: malformed } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);
			expect(result.title).toBe("FedScoop Signal");
			expect(result.summary).toBe("This is a test summary");
		});

		it("throws on completely invalid JSON", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: "this is not json at all" } }],
			});

			await expect(agent.analyze(SAMPLE_INPUT)).rejects.toThrow();
		});

		it("throws on empty choices array", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({ choices: [] });

			await expect(agent.analyze(SAMPLE_INPUT)).rejects.toThrow("Empty response from Worker AI");
		});
	});

	describe("schema validation", () => {
		it("clamps relevance to 0-100 range", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify({ ...VALID_RESULT, relevance: 150 }) } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);
			expect(result.relevance).toBe(100);
		});

		it("clamps negative relevance to 0", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify({ ...VALID_RESULT, relevance: -10 }) } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);
			expect(result.relevance).toBe(0);
		});

		it("defaults invalid type to strategy", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify({ ...VALID_RESULT, type: "invalid" }) } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);
			expect(result.type).toBe("strategy");
		});

		it("filters out invalid competency codes", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify({ ...VALID_RESULT, competencies: ["A", "Z", "B", "X"] }) } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);
			expect(result.competencies).toEqual(["A", "B"]);
		});

		it("defaults invalid play to null", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify({ ...VALID_RESULT, play: "nonexistent" }) } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);
			expect(result.play).toBeNull();
		});

		it("handles missing fields with defaults", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify({}) } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);
			expect(result.title).toBe("Untitled Signal");
			expect(result.summary).toBe("");
			expect(result.type).toBe("strategy");
			expect(result.branch).toBe("Other");
			expect(result.tags).toEqual([]);
			expect(result.competencies).toEqual([]);
			expect(result.play).toBeNull();
			expect(result.relevance).toBe(50);
			expect(result.entities).toEqual([]);
		});

		it("clamps entity confidence to 0-1 range", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify({
					...VALID_RESULT,
					entities: [
						{ type: "agency", value: "NIWC", confidence: 1.5 },
						{ type: "person", value: "Col. Smith", confidence: -0.3 },
					],
				}) } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);
			expect(result.entities[0].confidence).toBe(1);
			expect(result.entities[1].confidence).toBe(0);
		});

		it("filters out entities with invalid types", async () => {
			const agent = new SignalAnalyzer(mockEnv);
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify({
					...VALID_RESULT,
					entities: [
						{ type: "agency", value: "NIWC", confidence: 0.9 },
						{ type: "invalid_type", value: "something", confidence: 0.5 },
					],
				}) } }],
			});

			const result = await agent.analyze(SAMPLE_INPUT);
			expect(result.entities).toHaveLength(1);
			expect(result.entities[0].type).toBe("agency");
		});
	});
});
