import { describe, it, expect } from "vitest";
import { Signal, type SignalInput } from "./signal";

function makeInput(overrides: Partial<SignalInput> = {}): SignalInput {
	return {
		id: "item-1",
		sourceName: "GovConWire",
		sourceUrl: "https://govconwire.com/1",
		content: "Booz Allen Hamilton awarded $5M DevSecOps contract by NIWC Pacific.",
		sourceMetadata: null,
		createdAt: "2026-03-01T12:00:00Z",
		observations: [
			{
				type: "contract_award",
				summary: "Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific",
				sourceDate: "2026-03-01",
				entityMentions: [
					{ entityType: "company", rawName: "Booz Allen Hamilton", role: "subject", entityProfileId: "profile-bah", resolvedAt: "2026-03-02T00:00:00Z" },
					{ entityType: "agency", rawName: "NIWC Pacific", role: "object", entityProfileId: "profile-niwc", resolvedAt: "2026-03-02T00:00:00Z" },
					{ entityType: "technology", rawName: "DevSecOps", role: "mentioned", entityProfileId: null, resolvedAt: null },
				],
			},
		],
		...overrides,
	};
}

const ENTITY_RELEVANCE: Record<string, number> = {
	"profile-bah": 80,
	"profile-niwc": 60,
};

describe("Signal.materialize", () => {
	it("maps contract_award to opportunity type", () => {
		const signal = Signal.materialize(makeInput(), ENTITY_RELEVANCE);
		expect(signal.type).toBe("opportunity");
	});

	it("maps solicitation to opportunity type", () => {
		const signal = Signal.materialize(makeInput({
			observations: [{
				type: "solicitation",
				summary: "RFP issued",
				sourceDate: "2026-03-02",
				entityMentions: [],
			}],
		}), {});
		expect(signal.type).toBe("opportunity");
	});

	it("maps partnership to competitor type", () => {
		const signal = Signal.materialize(makeInput({
			observations: [{
				type: "partnership",
				summary: "Partnership formed",
				sourceDate: "2026-03-02",
				entityMentions: [],
			}],
		}), {});
		expect(signal.type).toBe("competitor");
	});

	it("defaults to strategy for unknown observation types", () => {
		const signal = Signal.materialize(makeInput({ observations: [] }), {});
		expect(signal.type).toBe("strategy");
	});

	it("uses first observation summary as title", () => {
		const signal = Signal.materialize(makeInput(), ENTITY_RELEVANCE);
		expect(signal.title).toBe("Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific");
	});

	it("truncates content as title when no observations", () => {
		const longContent = "A".repeat(200);
		const signal = Signal.materialize(makeInput({ observations: [], content: longContent }), {});
		expect(signal.title.length).toBeLessThanOrEqual(120);
		expect(signal.title.endsWith("…")).toBe(true);
	});

	it("extracts branch from first agency entity", () => {
		const signal = Signal.materialize(makeInput(), ENTITY_RELEVANCE);
		expect(signal.branch).toBe("NIWC Pacific");
	});

	it("extracts vendors from subject company entities", () => {
		const signal = Signal.materialize(makeInput(), ENTITY_RELEVANCE);
		expect(signal.vendors).toContain("Booz Allen Hamilton");
	});

	it("extracts technology entities as tags", () => {
		const signal = Signal.materialize(makeInput(), ENTITY_RELEVANCE);
		expect(signal.tags).toContain("DevSecOps");
	});

	it("extracts competitors from non-subject company entities", () => {
		const signal = Signal.materialize(makeInput({
			observations: [{
				type: "contract_award",
				summary: "Award",
				sourceDate: "2026-03-01",
				entityMentions: [
					{ entityType: "company", rawName: "SAIC", role: "mentioned", entityProfileId: "p-saic", resolvedAt: "2026-03-02T00:00:00Z" },
				],
			}],
		}), {});
		expect(signal.competitors).toContain("SAIC");
	});

	it("extracts resolved person entities as stakeholders", () => {
		const signal = Signal.materialize(makeInput({
			observations: [{
				type: "contract_award",
				summary: "Award",
				sourceDate: "2026-03-01",
				entityMentions: [
					{ entityType: "person", rawName: "John Smith", role: "mentioned", entityProfileId: "profile-smith", resolvedAt: "2026-03-02T00:00:00Z" },
				],
			}],
		}), {});
		expect(signal.stakeholders).toEqual([{ id: "profile-smith", name: "John Smith" }]);
	});

	it("does not include unresolved persons as stakeholders", () => {
		const signal = Signal.materialize(makeInput({
			observations: [{
				type: "contract_award",
				summary: "Award",
				sourceDate: "2026-03-01",
				entityMentions: [
					{ entityType: "person", rawName: "Jane Doe", role: "mentioned", entityProfileId: null, resolvedAt: null },
				],
			}],
		}), {});
		expect(signal.stakeholders).toEqual([]);
	});

	it("computes relevance as max of entity profile scores", () => {
		const signal = Signal.materialize(makeInput(), ENTITY_RELEVANCE);
		expect(signal.relevance).toBe(80);
	});

	it("defaults relevance to 0 when no profile scores", () => {
		const signal = Signal.materialize(makeInput(), {});
		expect(signal.relevance).toBe(0);
	});

	it("uses relevanceOverride when provided", () => {
		const override = { score: 95, rationale: "Critical opportunity", competencyCodes: ["A", "B"] as const };
		const signal = Signal.materialize(makeInput(), ENTITY_RELEVANCE, override);
		expect(signal.relevance).toBe(95);
		expect(signal.relevanceRationale).toBe("Critical opportunity");
		expect(signal.competencies).toEqual(["A", "B"]);
	});

	it("sets confidence 1.0 for resolved, 0.5 for unresolved entities", () => {
		const signal = Signal.materialize(makeInput(), ENTITY_RELEVANCE);
		const resolved = signal.entities.find((e) => e.value === "Booz Allen Hamilton");
		const unresolved = signal.entities.find((e) => e.value === "DevSecOps");
		expect(resolved!.confidence).toBe(1.0);
		expect(unresolved!.confidence).toBe(0.5);
	});

	it("uses sourceDate for date, falls back to createdAt", () => {
		const signal = Signal.materialize(makeInput(), ENTITY_RELEVANCE);
		expect(signal.date).toBe("2026-03-01");

		const noDate = Signal.materialize(makeInput({ observations: [] }), {});
		expect(noDate.date).toBe("2026-03-01");
	});
});
