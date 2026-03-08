import { describe, it, expect } from "vitest";
import { buildDossierUpdate, buildContextMap, type CoOccurrenceRow } from "./enrichment-repository";
import type { PersonDossier, AgencyDossier } from "../schemas";

describe("buildDossierUpdate", () => {
	it("builds update fields for a person dossier", () => {
		const dossier: PersonDossier = {
			kind: "person",
			title: "CTO",
			org: "DISA",
			branch: "DoD",
			programs: ["Platform One"],
			education: ["MIT"],
			careerHistory: [],
			focusAreas: ["DevSecOps"],
			decorations: [],
		};

		const update = buildDossierUpdate(dossier);

		expect(update.dossier).toEqual(dossier);
		expect(update.enrichmentStatus).toBe("enriched");
		expect(update.lastEnrichedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("builds update fields for an agency dossier", () => {
		const dossier: AgencyDossier = {
			kind: "agency",
			mission: "IT support",
			branch: "DoD",
			programs: [],
			parentOrg: "Department of Defense",
			leadership: [],
			focusAreas: [],
		};

		const update = buildDossierUpdate(dossier);

		expect(update.dossier).toEqual(dossier);
		expect(update.enrichmentStatus).toBe("enriched");
	});
});

describe("buildContextMap", () => {
	it("groups co-occurring entities and observation types by profile ID", () => {
		const rows: CoOccurrenceRow[] = [
			{ profileId: "p-1", coCanonicalName: "Department of the Army", coType: "agency", observationType: "solicitation" },
			{ profileId: "p-1", coCanonicalName: "USSOCOM", coType: "agency", observationType: "solicitation" },
			{ profileId: "p-2", coCanonicalName: "Lockheed Martin", coType: "company", observationType: "contract_award" },
		];

		const result = buildContextMap(rows);

		expect(result.size).toBe(2);

		const p1 = result.get("p-1");
		expect(p1).toBeDefined();
		expect(p1!.coOccurringEntities).toHaveLength(2);
		expect(p1!.coOccurringEntities[0]).toEqual({ canonicalName: "Department of the Army", type: "agency" });
		expect(p1!.observationTypes).toEqual(["solicitation"]);

		const p2 = result.get("p-2");
		expect(p2).toBeDefined();
		expect(p2!.coOccurringEntities).toEqual([{ canonicalName: "Lockheed Martin", type: "company" }]);
		expect(p2!.observationTypes).toEqual(["contract_award"]);
	});

	it("sorts co-occurring entities by frequency and limits to top 3", () => {
		const rows: CoOccurrenceRow[] = [
			{ profileId: "p-1", coCanonicalName: "Rare Entity", coType: "agency", observationType: "solicitation" },
			{ profileId: "p-1", coCanonicalName: "Common Entity", coType: "agency", observationType: "solicitation" },
			{ profileId: "p-1", coCanonicalName: "Common Entity", coType: "agency", observationType: "contract_award" },
			{ profileId: "p-1", coCanonicalName: "Common Entity", coType: "agency", observationType: "solicitation" },
			{ profileId: "p-1", coCanonicalName: "Second Entity", coType: "company", observationType: "solicitation" },
			{ profileId: "p-1", coCanonicalName: "Second Entity", coType: "company", observationType: "solicitation" },
			{ profileId: "p-1", coCanonicalName: "Third Entity", coType: "program", observationType: "solicitation" },
			{ profileId: "p-1", coCanonicalName: "Fourth Entity", coType: "program", observationType: "solicitation" },
		];

		const result = buildContextMap(rows);
		const ctx = result.get("p-1")!;

		expect(ctx.coOccurringEntities).toHaveLength(3);
		expect(ctx.coOccurringEntities[0].canonicalName).toBe("Common Entity");
		expect(ctx.coOccurringEntities[1].canonicalName).toBe("Second Entity");
	});

	it("collects distinct observation types", () => {
		const rows: CoOccurrenceRow[] = [
			{ profileId: "p-1", coCanonicalName: "Army", coType: "agency", observationType: "solicitation" },
			{ profileId: "p-1", coCanonicalName: "Army", coType: "agency", observationType: "contract_award" },
			{ profileId: "p-1", coCanonicalName: "Army", coType: "agency", observationType: "solicitation" },
		];

		const result = buildContextMap(rows);
		const ctx = result.get("p-1")!;

		expect(ctx.observationTypes).toEqual(["solicitation", "contract_award"]);
	});

	it("returns empty map for empty input", () => {
		const result = buildContextMap([]);
		expect(result.size).toBe(0);
	});
});
