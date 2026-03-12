import { describe, it, expect, vi } from "vitest";
import { parseAiMatchResponse, AiFuzzyEntityMatcher } from "./entity-match-ai";
import type { FuzzyEntityMatchingService } from "../services/fuzzy-entity-matching";

describe("parseAiMatchResponse", () => {
	it("parses a valid match response", () => {
		const raw = JSON.stringify({ matchedId: "profile-1", confidence: 0.85 });
		const result = parseAiMatchResponse(raw, ["profile-1:Booz Allen"]);

		expect(result.match).toBe("profile-1");
		expect(result.confidence).toBe(0.85);
	});

	it("returns null match when confidence is below threshold", () => {
		const raw = JSON.stringify({ matchedId: "profile-1", confidence: 0.4 });
		const result = parseAiMatchResponse(raw, ["profile-1:Booz Allen"]);

		expect(result.match).toBeNull();
	});

	it("returns null match when matchedId is none", () => {
		const raw = JSON.stringify({ matchedId: "none", confidence: 0 });
		const result = parseAiMatchResponse(raw, ["profile-1:Booz Allen"]);

		expect(result.match).toBeNull();
	});

	it("returns null match when matchedId is not in candidates", () => {
		const raw = JSON.stringify({ matchedId: "profile-99", confidence: 0.9 });
		const result = parseAiMatchResponse(raw, ["profile-1:Booz Allen"]);

		expect(result.match).toBeNull();
	});

	it("returns null match for invalid JSON", () => {
		const result = parseAiMatchResponse("not json", ["profile-1:Booz Allen"]);
		expect(result.match).toBeNull();
	});

	it("returns null match for empty response", () => {
		const result = parseAiMatchResponse("", ["profile-1:Booz Allen"]);
		expect(result.match).toBeNull();
	});

	it("returns null match when matchedId is missing", () => {
		const raw = JSON.stringify({ confidence: 0.9 });
		const result = parseAiMatchResponse(raw, ["profile-1:Booz Allen"]);

		expect(result.match).toBeNull();
	});
});

describe("AiFuzzyEntityMatcher", () => {
	function createMatcher() {
		const matcher = new AiFuzzyEntityMatcher({
			CF_AIG_TOKEN: "test-token",
			CF_AIG_BASEURL: "https://test.api",
			CF_AIG_MODEL: "test-model",
		} as Env);
		const mockClient = {
			chat: {
				completions: {
					create: vi.fn(),
				},
			},
		};
		(matcher as unknown as Record<string, unknown>)["client"] = mockClient;
		return { matcher, mockClient };
	}

	it("satisfies FuzzyEntityMatchingService interface", () => {
		const { matcher } = createMatcher();
		const service: FuzzyEntityMatchingService = matcher;
		expect(service.match).toBeDefined();
	});

	it("returns matched ID and confidence on successful match", async () => {
		const { matcher, mockClient } = createMatcher();
		mockClient.chat.completions.create.mockResolvedValue({
			choices: [{ message: { content: JSON.stringify({ matchedId: "p1", confidence: 0.9 }) } }],
		});

		const result = await matcher.match("Booz Allen", "company", [
			{ id: "p1", canonicalName: "Booz Allen Hamilton" },
		]);

		expect(result.matchedId).toBe("p1");
		expect(result.confidence).toBe(0.9);
	});

	it("returns null matchedId when no match found", async () => {
		const { matcher, mockClient } = createMatcher();
		mockClient.chat.completions.create.mockResolvedValue({
			choices: [{ message: { content: JSON.stringify({ matchedId: "none", confidence: 0 }) } }],
		});

		const result = await matcher.match("Unknown Corp", "company", [
			{ id: "p1", canonicalName: "Booz Allen Hamilton" },
		]);

		expect(result.matchedId).toBeNull();
		expect(result.confidence).toBe(0);
	});

	it("formats candidates as id:name for the AI prompt", async () => {
		const { matcher, mockClient } = createMatcher();
		mockClient.chat.completions.create.mockResolvedValue({
			choices: [{ message: { content: JSON.stringify({ matchedId: "none", confidence: 0 }) } }],
		});

		await matcher.match("SAIC", "company", [
			{ id: "p1", canonicalName: "Booz Allen Hamilton" },
			{ id: "p2", canonicalName: "SAIC Inc" },
		]);

		const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
		const userMessage = callArgs.messages[1].content as string;
		expect(userMessage).toContain("p1:Booz Allen Hamilton");
		expect(userMessage).toContain("p2:SAIC Inc");
	});
});
