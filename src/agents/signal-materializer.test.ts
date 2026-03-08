import { describe, it, expect } from "vitest";
import { materializeSignal, type IngestedItemWithObservations, type MaterializedSignal } from "./signal-materializer";

const ITEM_WITH_CONTRACT_AWARD: IngestedItemWithObservations = {
	id: "item-1",
	sourceType: "rss",
	sourceName: "GovConWire",
	sourceUrl: "https://govconwire.com/article/1",
	sourceLink: "https://govconwire.com/article/1",
	content: "Booz Allen Hamilton has been awarded a $5 million contract by NIWC Pacific for DevSecOps platform modernization.",
	sourceMetadata: null,
	createdAt: "2026-03-01T12:00:00Z",
	observations: [
		{
			id: 1,
			signalId: "item-1",
			type: "contract_award",
			summary: "Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific",
			attributes: { amount: "$5M", domain: "DevSecOps" },
			sourceDate: "2026-03-01",
			createdAt: "2026-03-01T12:00:00Z",
			entities: [
				{ id: 10, observationId: 1, role: "subject", entityType: "company", rawName: "Booz Allen Hamilton", entityProfileId: "profile-bah", resolvedAt: "2026-03-02T00:00:00Z" },
				{ id: 11, observationId: 1, role: "object", entityType: "agency", rawName: "NIWC Pacific", entityProfileId: "profile-niwc", resolvedAt: "2026-03-02T00:00:00Z" },
				{ id: 12, observationId: 1, role: "mentioned", entityType: "technology", rawName: "DevSecOps", entityProfileId: null, resolvedAt: null },
			],
		},
	],
};

const ITEM_WITH_SOLICITATION: IngestedItemWithObservations = {
	id: "item-2",
	sourceType: "sam_gov",
	sourceName: "SAM.gov",
	sourceUrl: "https://sam.gov/opp/123",
	sourceLink: "https://sam.gov/opp/123",
	content: "The U.S. Army issued an RFP for cloud migration services under the Army Cloud Computing Enterprise Transition.",
	sourceMetadata: null,
	createdAt: "2026-03-02T12:00:00Z",
	observations: [
		{
			id: 2,
			signalId: "item-2",
			type: "solicitation",
			summary: "U.S. Army issued RFP for cloud migration services",
			attributes: null,
			sourceDate: "2026-03-02",
			createdAt: "2026-03-02T12:00:00Z",
			entities: [
				{ id: 20, observationId: 2, role: "subject", entityType: "agency", rawName: "U.S. Army", entityProfileId: "profile-army", resolvedAt: "2026-03-03T00:00:00Z" },
				{ id: 21, observationId: 2, role: "mentioned", entityType: "technology", rawName: "cloud migration", entityProfileId: null, resolvedAt: null },
			],
		},
	],
};

const ITEM_NO_OBSERVATIONS: IngestedItemWithObservations = {
	id: "item-3",
	sourceType: "rss",
	sourceName: "FedScoop",
	sourceUrl: "https://fedscoop.com/article/3",
	sourceLink: "https://fedscoop.com/article/3",
	content: "General update about federal IT spending trends in FY2026.",
	sourceMetadata: null,
	createdAt: "2026-03-03T12:00:00Z",
	observations: [],
};

const ENTITY_RELEVANCE: Record<string, number> = {
	"profile-bah": 80,
	"profile-niwc": 60,
	"profile-army": 90,
};

describe("materializeSignal", () => {
	it("maps contract_award to opportunity type", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.type).toBe("opportunity");
	});

	it("maps solicitation to opportunity type", () => {
		const result = materializeSignal(ITEM_WITH_SOLICITATION, ENTITY_RELEVANCE);
		expect(result.type).toBe("opportunity");
	});

	it("uses first observation summary as title", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.title).toBe("Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific");
	});

	it("uses signal content as summary", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.summary).toContain("Booz Allen Hamilton has been awarded");
	});

	it("computes relevance as max of linked entity profiles", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.relevance).toBe(80);
		expect(result.relevanceRationale).toBe("");
	});

	it("defaults relevance to 0 when no entity profiles have scores", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, {});
		expect(result.relevance).toBe(0);
		expect(result.relevanceRationale).toBe("");
	});

	it("uses relevanceOverride when provided", () => {
		const override = { score: 95, rationale: "Direct DevSecOps opportunity at target agency", competencyCodes: ["A", "B"] as const };
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE, override);
		expect(result.relevance).toBe(95);
		expect(result.relevanceRationale).toBe("Direct DevSecOps opportunity at target agency");
		expect(result.competencies).toEqual(["A", "B"]);
	});

	it("defaults competencies to empty array without override", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.competencies).toEqual([]);
	});

	it("extracts agency entities as branch", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.branch).toBe("NIWC Pacific");
	});

	it("extracts company entities with subject role as vendors", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.vendors).toContain("Booz Allen Hamilton");
	});

	it("extracts technology entities as tags", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.tags).toContain("DevSecOps");
	});

	it("extracts resolved person entities as stakeholders with id and name", () => {
		const itemWithPerson: IngestedItemWithObservations = {
			...ITEM_WITH_CONTRACT_AWARD,
			observations: [
				{
					...ITEM_WITH_CONTRACT_AWARD.observations[0],
					entities: [
						...ITEM_WITH_CONTRACT_AWARD.observations[0].entities,
						{ id: 13, observationId: 1, role: "mentioned", entityType: "person", rawName: "John Smith", entityProfileId: "profile-smith", resolvedAt: "2026-03-02T00:00:00Z" },
					],
				},
			],
		};
		const result = materializeSignal(itemWithPerson, ENTITY_RELEVANCE);
		expect(result.stakeholders).toEqual([{ id: "profile-smith", name: "John Smith" }]);
	});

	it("uses sourceDate for date field", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.date).toBe("2026-03-01");
	});

	it("falls back to createdAt when no sourceDate", () => {
		const result = materializeSignal(ITEM_NO_OBSERVATIONS, ENTITY_RELEVANCE);
		expect(result.date).toBe("2026-03-03");
	});

	it("handles items with no observations", () => {
		const result = materializeSignal(ITEM_NO_OBSERVATIONS, ENTITY_RELEVANCE);
		expect(result.title).toBe("General update about federal IT spending trends in FY2026.");
		expect(result.type).toBe("strategy");
		expect(result.relevance).toBe(0);
		expect(result.tags).toEqual([]);
		expect(result.branch).toBe("");
	});

	it("generates a deterministic id from ingestedItemId", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.id).toBe("item-1");
	});

	it("links back to the ingested item", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.ingestedItemId).toBe("item-1");
	});

	it("preserves sourceUrl and sourceMetadata", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.sourceUrl).toBe("https://govconwire.com/article/1");
		expect(result.sourceMetadata).toBeNull();
	});

	it("includes source field matching sourceName", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.source).toBe("GovConWire");
	});

	it("builds entities array from observation entities", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.entities).toHaveLength(3);
		expect(result.entities[0]).toEqual({
			type: "company",
			value: "Booz Allen Hamilton",
			confidence: 1.0,
		});
	});

	it("sets confidence 1.0 for resolved entities and 0.5 for unresolved", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		const devsecops = result.entities.find((e) => e.value === "DevSecOps");
		expect(devsecops!.confidence).toBe(0.5);
	});

	it("includes sourceMetadata when present", () => {
		const itemWithMeta: IngestedItemWithObservations = {
			...ITEM_WITH_CONTRACT_AWARD,
			sourceMetadata: { sourceType: "fpds", piid: "W123", vendorName: "Booz Allen" },
		};
		const result = materializeSignal(itemWithMeta, ENTITY_RELEVANCE);
		expect(result.sourceMetadata).toEqual({ sourceType: "fpds", piid: "W123", vendorName: "Booz Allen" });
	});

	it("sets competitors from non-subject company entities", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.competitors).toEqual([]);
		// No non-subject companies in this fixture
	});

	it("sets updatedAt timestamp", () => {
		const result = materializeSignal(ITEM_WITH_CONTRACT_AWARD, ENTITY_RELEVANCE);
		expect(result.updatedAt).toBeDefined();
		expect(typeof result.updatedAt).toBe("string");
	});
});
