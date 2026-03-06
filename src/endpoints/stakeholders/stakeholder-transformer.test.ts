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
});
