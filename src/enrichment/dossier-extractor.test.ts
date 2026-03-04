import { describe, it, expect, vi, beforeEach } from "vitest";
import { DossierExtractor } from "./dossier-extractor";
import type { DossierExtractionInput, DossierExtractionResult } from "./dossier-extractor";

const mockCreate = vi.fn();

vi.mock("openai", () => {
	return {
		default: class MockOpenAI {
			chat = { completions: { create: mockCreate } };
		},
	};
});

const VALID_RESULT: DossierExtractionResult = {
	name: "Col. Sarah Kim",
	title: "Director of Cloud Operations",
	org: "Air Force Life Cycle Management Center",
	branch: "Air Force",
	programs: ["Cloud One", "Platform One"],
	focusAreas: ["cloud migration", "DevSecOps"],
	rank: "Colonel",
	education: ["MIT BS Computer Science", "Air War College"],
	careerHistory: [
		{ role: "Director of Cloud Operations", org: "AFLCMC", years: "2022-present" },
		{ role: "Deputy CTO", org: "Kessel Run", years: "2019-2022" },
	],
	confidence: "high",
};

const SAMPLE_INPUT: DossierExtractionInput = {
	entityName: "Col. Sarah Kim",
	entityType: "person",
	pageContents: [
		{ url: "https://af.mil/bio/kim", text: "Col. Sarah Kim serves as Director of Cloud Operations at AFLCMC..." },
		{ url: "https://afcea.org/event", text: "Col. Kim spoke about Cloud One migration at AFCEA West..." },
	],
	signalContext: "AFLCMC releases RFI for IL5 cloud platform modernization",
};

describe("DossierExtractor", () => {
	const mockEnv = {
		CF_AIG_TOKEN: "test-token",
		CF_AIG_BASEURL: "https://test.example.com",
		CF_AIG_MODEL: "test-model",
	} as Env;

	beforeEach(() => {
		mockCreate.mockReset();
	});

	it("creates an instance with env", () => {
		const extractor = new DossierExtractor(mockEnv);
		expect(extractor).toBeInstanceOf(DossierExtractor);
	});

	it("returns structured dossier from LLM response", async () => {
		const extractor = new DossierExtractor(mockEnv);
		mockCreate.mockResolvedValueOnce({
			choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }],
		});

		const result = await extractor.extract(SAMPLE_INPUT);

		expect(result.name).toBe("Col. Sarah Kim");
		expect(result.title).toBe("Director of Cloud Operations");
		expect(result.org).toBe("Air Force Life Cycle Management Center");
		expect(result.branch).toBe("Air Force");
		expect(result.programs).toEqual(["Cloud One", "Platform One"]);
		expect(result.focusAreas).toEqual(["cloud migration", "DevSecOps"]);
		expect(result.rank).toBe("Colonel");
		expect(result.confidence).toBe("high");
		expect(result.careerHistory).toHaveLength(2);
	});

	it("calls OpenAI with JSON mode and correct model", async () => {
		const extractor = new DossierExtractor(mockEnv);
		mockCreate.mockResolvedValueOnce({
			choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }],
		});

		await extractor.extract(SAMPLE_INPUT);

		expect(mockCreate).toHaveBeenCalledOnce();
		const callArgs = mockCreate.mock.calls[0][0];
		expect(callArgs.model).toBe("workers-ai/test-model");
		expect(callArgs.response_format).toEqual({ type: "json_object" });
		expect(callArgs.messages).toHaveLength(2);
		expect(callArgs.messages[0].role).toBe("system");
		expect(callArgs.messages[1].role).toBe("user");
	});

	it("includes entity name and page contents in user message", async () => {
		const extractor = new DossierExtractor(mockEnv);
		mockCreate.mockResolvedValueOnce({
			choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }],
		});

		await extractor.extract(SAMPLE_INPUT);

		const userMessage: string = mockCreate.mock.calls[0][0].messages[1].content;
		expect(userMessage).toContain("Col. Sarah Kim");
		expect(userMessage).toContain("person");
		expect(userMessage).toContain("https://af.mil/bio/kim");
		expect(userMessage).toContain("Director of Cloud Operations at AFLCMC");
		expect(userMessage).toContain("AFLCMC releases RFI");
	});

	it("throws on empty response", async () => {
		const extractor = new DossierExtractor(mockEnv);
		mockCreate.mockResolvedValueOnce({
			choices: [{ message: { content: null } }],
		});

		await expect(extractor.extract(SAMPLE_INPUT)).rejects.toThrow("Empty response");
	});

	it("handles missing fields with defaults", async () => {
		const extractor = new DossierExtractor(mockEnv);
		mockCreate.mockResolvedValueOnce({
			choices: [{ message: { content: JSON.stringify({ name: "Test Person" }) } }],
		});

		const result = await extractor.extract(SAMPLE_INPUT);

		expect(result.name).toBe("Test Person");
		expect(result.title).toBe("");
		expect(result.org).toBe("");
		expect(result.branch).toBe("");
		expect(result.programs).toEqual([]);
		expect(result.focusAreas).toEqual([]);
		expect(result.rank).toBeNull();
		expect(result.education).toEqual([]);
		expect(result.careerHistory).toEqual([]);
		expect(result.confidence).toBe("low");
	});

	it("validates confidence values", async () => {
		const extractor = new DossierExtractor(mockEnv);
		mockCreate.mockResolvedValueOnce({
			choices: [{ message: { content: JSON.stringify({ ...VALID_RESULT, confidence: "invalid" }) } }],
		});

		const result = await extractor.extract(SAMPLE_INPUT);

		expect(result.confidence).toBe("low");
	});

	it("strips markdown fences from response", async () => {
		const extractor = new DossierExtractor(mockEnv);
		const fenced = "```json\n" + JSON.stringify(VALID_RESULT) + "\n```";
		mockCreate.mockResolvedValueOnce({
			choices: [{ message: { content: fenced } }],
		});

		const result = await extractor.extract(SAMPLE_INPUT);
		expect(result.name).toBe("Col. Sarah Kim");
	});
});
