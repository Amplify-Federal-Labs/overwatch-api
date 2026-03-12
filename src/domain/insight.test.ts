import { describe, it, expect } from "vitest";
import { Insight } from "./insight";

describe("Insight", () => {
	it("stores insight properties", () => {
		const insight = new Insight({
			entityProfileId: "profile-1",
			type: "stakeholder_briefing",
			content: "Key stakeholder at Army NIWC Pacific overseeing DevSecOps programs",
			observationWindow: "2026-01-01/2026-03-01",
			observationCount: 5,
		});

		expect(insight.entityProfileId).toBe("profile-1");
		expect(insight.type).toBe("stakeholder_briefing");
		expect(insight.content).toContain("NIWC Pacific");
		expect(insight.observationCount).toBe(5);
	});
});
