import { describe, it, expect } from "vitest";
import { parseDossierResponse } from "./dossier-extractor";

describe("parseDossierResponse", () => {
	it("parses a valid person dossier", () => {
		const raw = JSON.stringify({
			kind: "person",
			title: "Chief Technology Officer",
			org: "DISA",
			branch: "DoD",
			programs: ["DEVSECOPS", "Platform One"],
			rank: "N/A",
			education: ["MIT BS Computer Science"],
			careerHistory: [
				{ role: "CTO", org: "DISA", years: "2023-present" },
			],
			focusAreas: ["DevSecOps", "Cloud"],
			decorations: [],
		});

		const result = parseDossierResponse(raw, "person");

		expect(result).not.toBeNull();
		expect(result!.kind).toBe("person");
		if (result!.kind === "person") {
			expect(result!.title).toBe("Chief Technology Officer");
			expect(result!.org).toBe("DISA");
			expect(result!.programs).toEqual(["DEVSECOPS", "Platform One"]);
		}
	});

	it("parses a valid agency dossier", () => {
		const raw = JSON.stringify({
			kind: "agency",
			mission: "Provides IT and communications support to DoD",
			branch: "DoD",
			programs: ["MilCloud", "JRSS"],
			parentOrg: "Department of Defense",
			leadership: ["John Smith"],
			focusAreas: ["Cybersecurity", "Cloud"],
		});

		const result = parseDossierResponse(raw, "agency");

		expect(result).not.toBeNull();
		expect(result!.kind).toBe("agency");
		if (result!.kind === "agency") {
			expect(result!.mission).toBe("Provides IT and communications support to DoD");
			expect(result!.parentOrg).toBe("Department of Defense");
		}
	});

	it("returns null for empty response", () => {
		expect(parseDossierResponse("", "person")).toBeNull();
	});

	it("returns null for invalid JSON", () => {
		expect(parseDossierResponse("not json", "person")).toBeNull();
	});

	it("handles JSON wrapped in markdown fences", () => {
		const raw = '```json\n{"kind":"person","title":"CTO","org":"DISA","branch":"DoD","programs":[],"education":[],"careerHistory":[],"focusAreas":[],"decorations":[]}\n```';
		const result = parseDossierResponse(raw, "person");
		expect(result).not.toBeNull();
		expect(result!.kind).toBe("person");
	});

	it("returns null when kind does not match entity type", () => {
		const raw = JSON.stringify({
			kind: "agency",
			mission: "test",
			branch: "DoD",
			programs: [],
			parentOrg: "",
			leadership: [],
			focusAreas: [],
		});

		const result = parseDossierResponse(raw, "person");
		expect(result).toBeNull();
	});

	it("fills missing optional fields with defaults for person", () => {
		const raw = JSON.stringify({
			kind: "person",
			title: "Director",
			org: "NSA",
			branch: "IC",
		});

		const result = parseDossierResponse(raw, "person");
		expect(result).not.toBeNull();
		if (result?.kind === "person") {
			expect(result.programs).toEqual([]);
			expect(result.education).toEqual([]);
			expect(result.careerHistory).toEqual([]);
			expect(result.focusAreas).toEqual([]);
			expect(result.decorations).toEqual([]);
		}
	});

	it("fills missing optional fields with defaults for agency", () => {
		const raw = JSON.stringify({
			kind: "agency",
			mission: "Defend cyberspace",
			branch: "DoD",
		});

		const result = parseDossierResponse(raw, "agency");
		expect(result).not.toBeNull();
		if (result?.kind === "agency") {
			expect(result.programs).toEqual([]);
			expect(result.parentOrg).toBe("");
			expect(result.leadership).toEqual([]);
			expect(result.focusAreas).toEqual([]);
		}
	});
});
