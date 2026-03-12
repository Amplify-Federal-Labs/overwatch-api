import { describe, it, expect } from "vitest";
import { Observation } from "./observation";
import type { ObservationType, SignalType } from "./types";

const SIGNAL_TYPE_CASES: Array<{ obsType: ObservationType; expected: SignalType }> = [
	{ obsType: "contract_award", expected: "opportunity" },
	{ obsType: "solicitation", expected: "opportunity" },
	{ obsType: "partnership", expected: "competitor" },
	{ obsType: "budget_signal", expected: "strategy" },
	{ obsType: "technology_adoption", expected: "strategy" },
	{ obsType: "personnel_move", expected: "strategy" },
	{ obsType: "policy_change", expected: "strategy" },
	{ obsType: "program_milestone", expected: "strategy" },
];

describe("Observation", () => {
	describe("signalType", () => {
		for (const { obsType, expected } of SIGNAL_TYPE_CASES) {
			it(`maps ${obsType} to ${expected}`, () => {
				const obs = new Observation({
					id: 1,
					ingestedItemId: "item-1",
					type: obsType,
					summary: "Test observation",
					attributes: null,
					sourceDate: "2026-03-01",
					createdAt: "2026-03-01T00:00:00Z",
					entityMentions: [],
				});
				expect(obs.signalType).toBe(expected);
			});
		}
	});

	describe("entityMentions", () => {
		it("provides access to entity mentions", () => {
			const obs = new Observation({
				id: 1,
				ingestedItemId: "item-1",
				type: "contract_award",
				summary: "Test",
				attributes: null,
				sourceDate: null,
				createdAt: "2026-03-01T00:00:00Z",
				entityMentions: [
					{ id: 10, observationId: 1, role: "subject", entityType: "company", rawName: "BAH", entityProfileId: null, resolvedAt: null },
				],
			});
			expect(obs.entityMentions).toHaveLength(1);
			expect(obs.entityMentions[0].isVendor()).toBe(true);
		});
	});
});
