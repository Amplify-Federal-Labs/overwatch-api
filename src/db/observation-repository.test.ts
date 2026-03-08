import { describe, it, expect } from "vitest";
import { buildIngestedItemRow, buildObservationRow, buildEntityRefRows } from "./observation-repository";
import type { SignalAnalysisInput, ObservationExtraction } from "../schemas";

const SIGNAL_INPUT: SignalAnalysisInput = {
	content: "Booz Allen wins $5M NIWC Pacific DevSecOps contract",
	sourceType: "rss",
	sourceName: "GovConWire",
	sourceUrl: "https://govconwire.com/article/1",
	sourceLink: "https://govconwire.com/article/1",
};

const OBSERVATION: ObservationExtraction = {
	type: "contract_award",
	summary: "Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific",
	entities: [
		{ type: "company", name: "Booz Allen Hamilton", role: "subject" },
		{ type: "agency", name: "NIWC Pacific", role: "object" },
		{ type: "technology", name: "DevSecOps", role: "mentioned" },
	],
	attributes: { amount: "$5M", domain: "DevSecOps" },
	sourceDate: "2026-03-01",
};

describe("buildIngestedItemRow", () => {
	it("should build a signal row from analysis input", () => {
		const row = buildIngestedItemRow(SIGNAL_INPUT);

		expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(row.sourceType).toBe("rss");
		expect(row.sourceName).toBe("GovConWire");
		expect(row.sourceUrl).toBe("https://govconwire.com/article/1");
		expect(row.sourceLink).toBe("https://govconwire.com/article/1");
		expect(row.content).toBe("Booz Allen wins $5M NIWC Pacific DevSecOps contract");
		expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("should handle missing optional fields", () => {
		const input: SignalAnalysisInput = {
			content: "Test",
			sourceType: "rss",
			sourceName: "Test",
		};
		const row = buildIngestedItemRow(input);

		expect(row.sourceUrl).toBeNull();
		expect(row.sourceLink).toBeNull();
		expect(row.sourceMetadata).toBeNull();
	});

	it("should include source metadata when present", () => {
		const input: SignalAnalysisInput = {
			content: "Test",
			sourceType: "fpds",
			sourceName: "FPDS",
			sourceMetadata: {
				sourceType: "fpds",
				piid: "W123",
				modNumber: "0",
				agencyId: "1234",
				agencyName: "NIWC Pacific",
				vendorName: "Booz Allen",
				obligatedAmount: "5000000",
				totalObligatedAmount: "5000000",
			},
		};
		const row = buildIngestedItemRow(input);

		expect(row.sourceMetadata).toBeDefined();
	});
});

describe("buildObservationRow", () => {
	it("should build an observation row from extraction", () => {
		const row = buildObservationRow("signal-123", OBSERVATION);

		expect(row.signalId).toBe("signal-123");
		expect(row.type).toBe("contract_award");
		expect(row.summary).toBe("Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific");
		expect(row.attributes).toEqual({ amount: "$5M", domain: "DevSecOps" });
		expect(row.sourceDate).toBe("2026-03-01");
		expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("should handle missing optional fields", () => {
		const obs: ObservationExtraction = {
			type: "solicitation",
			summary: "Army issued RFP",
			entities: [],
		};
		const row = buildObservationRow("signal-456", obs);

		expect(row.attributes).toBeNull();
		expect(row.sourceDate).toBeNull();
	});
});

describe("buildEntityRefRows", () => {
	it("should build entity ref rows for an observation", () => {
		const rows = buildEntityRefRows(42, OBSERVATION.entities);

		expect(rows).toHaveLength(3);
		expect(rows[0]).toEqual({
			observationId: 42,
			role: "subject",
			entityType: "company",
			rawName: "Booz Allen Hamilton",
		});
		expect(rows[1]).toEqual({
			observationId: 42,
			role: "object",
			entityType: "agency",
			rawName: "NIWC Pacific",
		});
		expect(rows[2]).toEqual({
			observationId: 42,
			role: "mentioned",
			entityType: "technology",
			rawName: "DevSecOps",
		});
	});

	it("should return empty array for no entities", () => {
		const rows = buildEntityRefRows(1, []);
		expect(rows).toHaveLength(0);
	});
});
