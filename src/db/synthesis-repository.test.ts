import { describe, it, expect, vi } from "vitest";
import {
	buildInsightRow,
	type ObservationWithEntities,
	buildSynthesisContext,
	buildUnsynthesizedProfilesQuery,
} from "./synthesis-repository";

const OBSERVATIONS: ObservationWithEntities[] = [
	{
		id: 1,
		signalId: "sig-1",
		type: "contract_award",
		summary: "Booz Allen won $5M DevSecOps contract from NIWC Pacific",
		attributes: { amount: "$5M" },
		sourceDate: "2026-02-15",
		createdAt: "2026-02-15T00:00:00Z",
		entities: [
			{ id: 10, observationId: 1, role: "subject", entityType: "company", rawName: "Booz Allen Hamilton", entityProfileId: "profile-1", resolvedAt: "2026-02-16T00:00:00Z" },
			{ id: 11, observationId: 1, role: "object", entityType: "agency", rawName: "NIWC Pacific", entityProfileId: "profile-2", resolvedAt: "2026-02-16T00:00:00Z" },
		],
	},
	{
		id: 2,
		signalId: "sig-2",
		type: "partnership",
		summary: "Booz Allen partnered with SAIC on cloud migration",
		attributes: null,
		sourceDate: "2026-03-01",
		createdAt: "2026-03-01T00:00:00Z",
		entities: [
			{ id: 12, observationId: 2, role: "subject", entityType: "company", rawName: "Booz Allen Hamilton", entityProfileId: "profile-1", resolvedAt: "2026-03-02T00:00:00Z" },
			{ id: 13, observationId: 2, role: "object", entityType: "company", rawName: "SAIC", entityProfileId: "profile-3", resolvedAt: "2026-03-02T00:00:00Z" },
		],
	},
];

describe("buildInsightRow", () => {
	it("builds an insight row", () => {
		const row = buildInsightRow(
			"profile-1",
			"competitor_assessment",
			"Booz Allen is active in DevSecOps space",
			"2026-02-15/2026-03-06",
			2,
		);

		expect(row.entityProfileId).toBe("profile-1");
		expect(row.type).toBe("competitor_assessment");
		expect(row.content).toBe("Booz Allen is active in DevSecOps space");
		expect(row.observationWindow).toBe("2026-02-15/2026-03-06");
		expect(row.observationCount).toBe(2);
		expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});

describe("buildSynthesisContext", () => {
	it("formats observations into an AI-readable context string", () => {
		const context = buildSynthesisContext("Booz Allen Hamilton", "company", OBSERVATIONS);

		expect(context).toContain("Entity: Booz Allen Hamilton (company)");
		expect(context).toContain("contract_award");
		expect(context).toContain("partnership");
		expect(context).toContain("$5M");
		expect(context).toContain("NIWC Pacific");
		expect(context).toContain("SAIC");
	});

	it("includes observation count", () => {
		const context = buildSynthesisContext("Booz Allen Hamilton", "company", OBSERVATIONS);
		expect(context).toContain("2 observations");
	});

	it("handles empty observations", () => {
		const context = buildSynthesisContext("Unknown Corp", "company", []);
		expect(context).toContain("0 observations");
	});
});

describe("buildUnsynthesizedProfilesQuery", () => {
	it("returns query conditions for profiles with observations but no synthesis", () => {
		const query = buildUnsynthesizedProfilesQuery();
		expect(query).toEqual({
			lastSynthesizedAt: null,
			minObservationCount: 1,
		});
	});
});
