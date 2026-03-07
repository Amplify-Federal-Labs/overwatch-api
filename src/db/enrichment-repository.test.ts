import { describe, it, expect } from "vitest";
import { buildDossierUpdate } from "./enrichment-repository";
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
