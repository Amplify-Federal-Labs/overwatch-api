import { describe, it, expect } from "vitest";
import { buildSignalRow, buildEntityRows } from "./signal-repository";
import type { SignalAnalysisInput, SignalAnalysisResult } from "../schemas";

const ANALYSIS_INPUT: SignalAnalysisInput = {
	content: "Lockheed Martin was awarded a $50M contract...",
	sourceType: "mil_announcement",
	sourceName: "defense.gov/News/Contracts",
	sourceUrl: "https://www.war.gov/News/Contracts/Contract/Article/4420261/",
};

const ANALYSIS_RESULT: SignalAnalysisResult = {
	title: "Navy Cloud Migration RFI",
	summary: "NIWC PAC seeks industry input for IL5 cloud platform migration.",
	type: "opportunity",
	branch: "Navy",
	tags: ["IL5", "cloud migration"],
	competencies: ["B", "C"],
	play: "classifiedai",
	relevance: 92,
	entities: [
		{ type: "agency", value: "NIWC Pacific", confidence: 0.95 },
		{ type: "program", value: "Next-Gen Cloud Platform", confidence: 0.88 },
	],
};

describe("buildSignalRow", () => {
	it("should merge analysis input and result into a signal row", () => {
		const row = buildSignalRow(ANALYSIS_INPUT, ANALYSIS_RESULT);

		expect(row.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
		expect(row.title).toBe("Navy Cloud Migration RFI");
		expect(row.summary).toBe("NIWC PAC seeks industry input for IL5 cloud platform migration.");
		expect(row.type).toBe("opportunity");
		expect(row.branch).toBe("Navy");
		expect(row.source).toBe("defense.gov/News/Contracts");
		expect(row.sourceType).toBe("mil_announcement");
		expect(row.sourceUrl).toBe("https://www.war.gov/News/Contracts/Contract/Article/4420261/");
		expect(row.tags).toEqual(["IL5", "cloud migration"]);
		expect(row.competencies).toEqual(["B", "C"]);
		expect(row.play).toBe("classifiedai");
		expect(row.relevance).toBe(92);
		expect(row.starred).toBe(false);
		expect(row.stakeholderIds).toEqual([]);
		expect(row.competitors).toEqual([]);
		expect(row.vendors).toEqual([]);
		expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
		expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("should handle null play", () => {
		const result = { ...ANALYSIS_RESULT, play: null };
		const row = buildSignalRow(ANALYSIS_INPUT, result);
		expect(row.play).toBeNull();
	});

	it("should handle missing sourceUrl", () => {
		const input = { ...ANALYSIS_INPUT, sourceUrl: undefined };
		const row = buildSignalRow(input, ANALYSIS_RESULT);
		expect(row.sourceUrl).toBeNull();
	});

	it("should handle missing sourceLink", () => {
		const input = { ...ANALYSIS_INPUT, sourceLink: undefined };
		const row = buildSignalRow(input, ANALYSIS_RESULT);
		expect(row.sourceLink).toBeNull();
	});

	it("should persist sourceLink when provided", () => {
		const input = { ...ANALYSIS_INPUT, sourceLink: "fpds://NONE_9700_0001_0" };
		const row = buildSignalRow(input, ANALYSIS_RESULT);
		expect(row.sourceLink).toBe("fpds://NONE_9700_0001_0");
	});

	it("should generate unique ids on each call", () => {
		const row1 = buildSignalRow(ANALYSIS_INPUT, ANALYSIS_RESULT);
		const row2 = buildSignalRow(ANALYSIS_INPUT, ANALYSIS_RESULT);
		expect(row1.id).not.toBe(row2.id);
	});
});

describe("buildEntityRows", () => {
	it("should map analysis entities to entity rows with signal id", () => {
		const signalId = "test-signal-id";
		const rows = buildEntityRows(signalId, ANALYSIS_RESULT.entities);

		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			signalId: "test-signal-id",
			type: "agency",
			value: "NIWC Pacific",
			confidence: 0.95,
		});
		expect(rows[1]).toEqual({
			signalId: "test-signal-id",
			type: "program",
			value: "Next-Gen Cloud Platform",
			confidence: 0.88,
		});
	});

	it("should return empty array when no entities", () => {
		const rows = buildEntityRows("test-id", []);
		expect(rows).toEqual([]);
	});
});
