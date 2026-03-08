import { describe, it, expect } from "vitest";
import { buildSignalRow } from "./signal-repository";
import type { MaterializedSignal } from "../agents/signal-materializer";

const MATERIALIZED_SIGNAL: MaterializedSignal = {
	id: "item-1",
	ingestedItemId: "item-1",
	title: "Booz Allen won $5M DevSecOps contract from NIWC Pacific",
	summary: "Booz Allen Hamilton has been awarded a $5 million contract by NIWC Pacific.",
	date: "2026-03-01",
	branch: "NIWC Pacific",
	source: "GovConWire",
	type: "opportunity",
	relevance: 80,
	relevanceRationale: "Direct DevSecOps contract award at Navy target agency",
	tags: ["DevSecOps"],
	competencies: [],
	play: "",
	competitors: [],
	vendors: ["Booz Allen Hamilton"],
	stakeholders: [],
	entities: [
		{ type: "company", value: "Booz Allen Hamilton", confidence: 1.0 },
		{ type: "agency", value: "NIWC Pacific", confidence: 1.0 },
	],
	sourceUrl: "https://govconwire.com/article/1",
	sourceMetadata: null,
	createdAt: "2026-03-01T12:00:00Z",
	updatedAt: "2026-03-06T00:00:00Z",
};

describe("buildSignalRow", () => {
	it("should build a signal row from MaterializedSignal", () => {
		const row = buildSignalRow(MATERIALIZED_SIGNAL);

		expect(row.id).toBe("item-1");
		expect(row.ingestedItemId).toBe("item-1");
		expect(row.title).toBe("Booz Allen won $5M DevSecOps contract from NIWC Pacific");
		expect(row.branch).toBe("NIWC Pacific");
		expect(row.type).toBe("opportunity");
		expect(row.relevance).toBe(80);
		expect(row.date).toBe("2026-03-01");
		expect(row.source).toBe("GovConWire");
	});

	it("should serialize JSON fields", () => {
		const row = buildSignalRow(MATERIALIZED_SIGNAL);

		expect(row.tags).toEqual(["DevSecOps"]);
		expect(row.vendors).toEqual(["Booz Allen Hamilton"]);
		expect(row.entities).toHaveLength(2);
	});

	it("should preserve sourceUrl and sourceMetadata", () => {
		const row = buildSignalRow(MATERIALIZED_SIGNAL);

		expect(row.sourceUrl).toBe("https://govconwire.com/article/1");
		expect(row.sourceMetadata).toBeNull();
	});
});
