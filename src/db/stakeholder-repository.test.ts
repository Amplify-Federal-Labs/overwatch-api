import { describe, it, expect } from "vitest";
import { buildStakeholderRow } from "./stakeholder-repository";
import type { DossierExtractionResult } from "../enrichment/dossier-extractor";

const DOSSIER: DossierExtractionResult = {
	name: "Col. Sarah Kim",
	title: "Director of Cloud Operations",
	org: "AFLCMC",
	branch: "Air Force",
	programs: ["Cloud One", "Platform One"],
	focusAreas: ["cloud migration", "DevSecOps"],
	rank: "Colonel",
	education: ["MIT BS Computer Science"],
	careerHistory: [
		{ role: "Director of Cloud Operations", org: "AFLCMC", years: "2022-present" },
	],
	confidence: "high",
};

describe("buildStakeholderRow", () => {
	it("maps dossier to stakeholder row", () => {
		const row = buildStakeholderRow({
			dossier: DOSSIER,
			discoveredEntityId: 42,
			signalId: "signal-123",
			bioSourceUrl: "https://af.mil/bio/kim",
			entityType: "person",
		});

		expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(row.type).toBe("person");
		expect(row.name).toBe("Col. Sarah Kim");
		expect(row.title).toBe("Director of Cloud Operations");
		expect(row.org).toBe("AFLCMC");
		expect(row.branch).toBe("Air Force");
		expect(row.stage).toBe("aware");
		expect(row.confidence).toBe("high");
		expect(row.programs).toEqual(["Cloud One", "Platform One"]);
		expect(row.focusAreas).toEqual(["cloud migration", "DevSecOps"]);
		expect(row.rank).toBe("Colonel");
		expect(row.education).toEqual(["MIT BS Computer Science"]);
		expect(row.careerHistory).toHaveLength(1);
		expect(row.bioSourceUrl).toBe("https://af.mil/bio/kim");
		expect(row.discoveredEntityId).toBe(42);
		expect(row.signalIds).toEqual(["signal-123"]);
		expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("handles null bioSourceUrl", () => {
		const row = buildStakeholderRow({
			dossier: DOSSIER,
			discoveredEntityId: 1,
			signalId: "signal-456",
			bioSourceUrl: null,
			entityType: "agency",
		});

		expect(row.type).toBe("agency");
		expect(row.bioSourceUrl).toBeNull();
	});
});
