import { describe, it, expect } from "vitest";
import { expectedDossierKind, isDossierKindValid } from "./dossier";

describe("dossier type correspondence", () => {
	describe("expectedDossierKind", () => {
		it("maps person to person dossier kind", () => {
			expect(expectedDossierKind("person")).toBe("person");
		});

		it("maps agency to agency dossier kind", () => {
			expect(expectedDossierKind("agency")).toBe("agency");
		});

		it("maps company to company dossier kind", () => {
			expect(expectedDossierKind("company")).toBe("company");
		});

		it("returns null for non-enrichable types", () => {
			expect(expectedDossierKind("program")).toBeNull();
			expect(expectedDossierKind("technology")).toBeNull();
			expect(expectedDossierKind("contract_vehicle")).toBeNull();
		});
	});

	describe("isDossierKindValid", () => {
		it("returns true when kind matches entity type", () => {
			expect(isDossierKindValid("person", "person")).toBe(true);
			expect(isDossierKindValid("agency", "agency")).toBe(true);
			expect(isDossierKindValid("company", "company")).toBe(true);
		});

		it("returns false when kind does not match entity type", () => {
			expect(isDossierKindValid("person", "agency")).toBe(false);
			expect(isDossierKindValid("company", "person")).toBe(false);
		});

		it("returns false for non-enrichable entity types", () => {
			expect(isDossierKindValid("program", "person")).toBe(false);
		});
	});
});
