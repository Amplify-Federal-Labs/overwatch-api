import { describe, it, expect } from "vitest";
import { parseAiMatchResponse } from "./entity-match-ai";

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
