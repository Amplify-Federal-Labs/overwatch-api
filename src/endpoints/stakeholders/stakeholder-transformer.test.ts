import { describe, it, expect } from "vitest";
import { transformEntityToStakeholder, type EntityProfileWithDetails } from "./stakeholder-transformer";

const PERSON_PROFILE: EntityProfileWithDetails = {
	id: "profile-smith",
	type: "person",
	canonicalName: "John Smith",
	observationCount: 5,
	summary: "Senior program manager at NIWC Pacific focused on DevSecOps modernization.",
	trajectory: "Expanding cloud security portfolio.",
	relevanceScore: 75,
	signalIds: ["sig-1", "sig-2"],
};

const AGENCY_PROFILE: EntityProfileWithDetails = {
	id: "profile-niwc",
	type: "agency",
	canonicalName: "NIWC Pacific",
	observationCount: 10,
	summary: "Naval information warfare center focused on C4ISR and cybersecurity.",
	trajectory: "Increasing DevSecOps adoption.",
	relevanceScore: 90,
	signalIds: ["sig-1", "sig-3"],
};

describe("transformEntityToStakeholder", () => {
	it("maps person entity to stakeholder shape", () => {
		const result = transformEntityToStakeholder(PERSON_PROFILE);

		expect(result.id).toBe("profile-smith");
		expect(result.type).toBe("person");
		expect(result.name).toBe("John Smith");
		expect(result.stage).toBe("unknown");
		expect(result.signals).toEqual(["sig-1", "sig-2"]);
		expect(result.notes).toBe("Senior program manager at NIWC Pacific focused on DevSecOps modernization.");
	});

	it("maps agency entity to stakeholder shape", () => {
		const result = transformEntityToStakeholder(AGENCY_PROFILE);

		expect(result.id).toBe("profile-niwc");
		expect(result.type).toBe("agency");
		expect(result.name).toBe("NIWC Pacific");
		expect(result.notes).toContain("Naval information warfare center");
	});

	it("provides empty defaults for unpopulated fields", () => {
		const result = transformEntityToStakeholder(PERSON_PROFILE);

		expect(result.title).toBe("");
		expect(result.org).toBe("");
		expect(result.branch).toBe("");
		expect(result.confidence).toBe("medium");
		expect(result.contact).toEqual({ email: "", phone: "", address: "" });
		expect(result.programs).toEqual([]);
		expect(result.awards).toEqual([]);
		expect(result.events).toEqual([]);
		expect(result.pastEvents).toEqual([]);
		expect(result.social).toEqual({ linkedin: null, twitter: null });
		expect(result.proximity).toEqual({
			mutualContacts: [],
			sharedEvents: 0,
			amplifyHistory: "none",
			warmIntro: "none",
		});
	});

	it("sets confidence based on observation count", () => {
		const low = transformEntityToStakeholder({ ...PERSON_PROFILE, observationCount: 1 });
		expect(low.confidence).toBe("low");

		const medium = transformEntityToStakeholder({ ...PERSON_PROFILE, observationCount: 5 });
		expect(medium.confidence).toBe("medium");

		const high = transformEntityToStakeholder({ ...PERSON_PROFILE, observationCount: 10 });
		expect(high.confidence).toBe("high");
	});

	it("uses summary as notes, empty string if null", () => {
		const noSummary = transformEntityToStakeholder({ ...PERSON_PROFILE, summary: null });
		expect(noSummary.notes).toBe("");
	});

	it("populates fields from person dossier", () => {
		const profile: EntityProfileWithDetails = {
			...PERSON_PROFILE,
			dossier: {
				kind: "person",
				title: "Chief Technology Officer",
				org: "DISA",
				branch: "DoD",
				programs: ["Platform One", "Iron Bank"],
				rank: "Colonel",
				education: ["MIT BS Computer Science"],
				careerHistory: [{ role: "CTO", org: "DISA", years: "2023-present" }],
				focusAreas: ["DevSecOps", "Cloud"],
				decorations: ["Legion of Merit"],
				bioSourceUrl: "https://example.com/bio",
			},
		};

		const result = transformEntityToStakeholder(profile);

		expect(result.title).toBe("Chief Technology Officer");
		expect(result.org).toBe("DISA");
		expect(result.branch).toBe("DoD");
		expect(result.programs).toEqual(["Platform One", "Iron Bank"]);
		expect(result.militaryBio).toBeDefined();
		expect(result.militaryBio!.rank).toBe("Colonel");
		expect(result.militaryBio!.education).toEqual(["MIT BS Computer Science"]);
		expect(result.militaryBio!.focusAreas).toEqual(["DevSecOps", "Cloud"]);
	});

	it("populates branch and programs from agency dossier", () => {
		const profile: EntityProfileWithDetails = {
			...AGENCY_PROFILE,
			dossier: {
				kind: "agency",
				mission: "Provides IT and communications support to DoD",
				branch: "Navy",
				programs: ["MilCloud", "JRSS"],
				parentOrg: "Department of Defense",
				leadership: ["RADM John Smith"],
				focusAreas: ["Cybersecurity"],
			},
		};

		const result = transformEntityToStakeholder(profile);

		expect(result.title).toBe("");
		expect(result.org).toBe("");
		expect(result.branch).toBe("Navy");
		expect(result.programs).toEqual(["MilCloud", "JRSS"]);
		expect(result.militaryBio).toBeUndefined();
	});

	it("does not include militaryBio when person has no rank", () => {
		const profile: EntityProfileWithDetails = {
			...PERSON_PROFILE,
			dossier: {
				kind: "person",
				title: "Director",
				org: "NSA",
				branch: "IC",
				programs: [],
				education: [],
				careerHistory: [],
				focusAreas: [],
				decorations: [],
			},
		};

		const result = transformEntityToStakeholder(profile);

		expect(result.title).toBe("Director");
		expect(result.militaryBio).toBeUndefined();
	});
});
