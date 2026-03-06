import { describe, it, expect } from "vitest";
import { transformObservationToActivity, type ObservationForCompetitor } from "./competitor-transformer";

const AWARD_OBSERVATION: ObservationForCompetitor = {
	type: "contract_award",
	summary: "Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific",
	sourceDate: "2026-03-01",
	createdAt: "2026-03-01T12:00:00Z",
	companyName: "Booz Allen Hamilton",
	agencyName: "NIWC Pacific",
};

const PARTNERSHIP_OBSERVATION: ObservationForCompetitor = {
	type: "partnership",
	summary: "SAIC and Leidos formed a joint venture for Navy cloud migration",
	sourceDate: "2026-02-15",
	createdAt: "2026-02-15T12:00:00Z",
	companyName: "SAIC",
	agencyName: null,
};

describe("transformObservationToActivity", () => {
	it("maps contract_award to high threat", () => {
		const result = transformObservationToActivity(AWARD_OBSERVATION);
		expect(result.threat).toBe("high");
	});

	it("maps partnership to medium threat", () => {
		const result = transformObservationToActivity(PARTNERSHIP_OBSERVATION);
		expect(result.threat).toBe("medium");
	});

	it("uses company name as competitor", () => {
		const result = transformObservationToActivity(AWARD_OBSERVATION);
		expect(result.competitor).toBe("Booz Allen Hamilton");
	});

	it("uses summary as activity", () => {
		const result = transformObservationToActivity(AWARD_OBSERVATION);
		expect(result.activity).toBe("Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific");
	});

	it("uses sourceDate for date", () => {
		const result = transformObservationToActivity(AWARD_OBSERVATION);
		expect(result.date).toBe("2026-03-01");
	});

	it("falls back to createdAt when no sourceDate", () => {
		const obs: ObservationForCompetitor = { ...AWARD_OBSERVATION, sourceDate: null };
		const result = transformObservationToActivity(obs);
		expect(result.date).toBe("2026-03-01");
	});

	it("uses agency name as area when available", () => {
		const result = transformObservationToActivity(AWARD_OBSERVATION);
		expect(result.area).toBe("NIWC Pacific");
	});

	it("uses observation type as area when no agency", () => {
		const result = transformObservationToActivity(PARTNERSHIP_OBSERVATION);
		expect(result.area).toBe("partnership");
	});
});
