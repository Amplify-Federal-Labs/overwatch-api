import { describe, it, expect, beforeEach } from "vitest";
import { StakeholderMatcher } from "./stakeholder-matcher";
import type { StakeholderRepository, StakeholderRecord } from "../db/stakeholder-repository";
import type { ExtractedEntity } from "../schemas";

function makeRecord(overrides: Partial<StakeholderRecord> & { id: string }): StakeholderRecord {
	return {
		name: "",
		org: "",
		branch: "",
		programs: [],
		awardPrimes: [],
		focusAreas: [],
		...overrides,
	};
}

class FakeStakeholderRepository implements StakeholderRepository {
	constructor(private records: StakeholderRecord[]) {}
	async findAll(): Promise<StakeholderRecord[]> {
		return this.records;
	}
}

describe("StakeholderMatcher", () => {
	let repo: FakeStakeholderRepository;
	let matcher: StakeholderMatcher;

	const WALSH: StakeholderRecord = makeRecord({
		id: "st2",
		name: "CAPT Jennifer Walsh",
		org: "NIWC PAC",
		branch: "Navy",
		programs: ["Next-Gen Cloud Platform Migration", "Navy Tactical Cloud"],
		awardPrimes: ["Leidos", "Booz Allen"],
		focusAreas: ["Cloud Migration", "Zero Trust Architecture", "FedRAMP High Authorization", "IL5 Hosting"],
	});

	const TORRES: StakeholderRecord = makeRecord({
		id: "st4",
		name: "Dr. Michael Torres",
		org: "NIWC PAC",
		branch: "Navy",
		programs: ["Next-Gen Cloud Platform Migration", "Kubernetes Adoption Program"],
		awardPrimes: ["ECS"],
		focusAreas: ["Kubernetes in classified environments", "STIG automation", "Platform engineering culture"],
	});

	const PARK: StakeholderRecord = makeRecord({
		id: "st1",
		name: "Col. David Park",
		org: "645th AESG",
		branch: "Air Force",
		programs: ["DevSecOps Pipeline Modernization", "Platform One Migration"],
		awardPrimes: ["SAIC", "ECS"],
		focusAreas: ["DevSecOps", "Platform Engineering", "Software Factory Operations", "CI/CD Pipeline Modernization"],
	});

	beforeEach(() => {
		repo = new FakeStakeholderRepository([WALSH, TORRES, PARK]);
		matcher = new StakeholderMatcher(repo);
	});

	describe("matching", () => {
		it("matches agency entity to stakeholders by org (case-insensitive substring)", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "agency", value: "NIWC Pacific", confidence: 0.95 },
			];

			const result = await matcher.match(entities, 92);

			expect(result.matchedIds).toContain("st2");
			expect(result.matchedIds).toContain("st4");
			expect(result.matchedIds).not.toContain("st1");
		});

		it("matches person entity to stakeholder by name (case-insensitive substring)", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "person", value: "Col. Park", confidence: 0.9 },
			];

			const result = await matcher.match(entities, 80);

			expect(result.matchedIds).toEqual(["st1"]);
		});

		it("matches program entity to stakeholders by programs list", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "program", value: "Cloud Platform Migration", confidence: 0.85 },
			];

			const result = await matcher.match(entities, 80);

			expect(result.matchedIds).toContain("st2");
			expect(result.matchedIds).toContain("st4");
		});

		it("matches company entity to stakeholders by award primes (case-insensitive exact)", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "company", value: "leidos", confidence: 0.9 },
			];

			const result = await matcher.match(entities, 80);

			expect(result.matchedIds).toEqual(["st2"]);
		});

		it("matches technology entity to stakeholders by focus areas", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "technology", value: "DevSecOps", confidence: 0.8 },
			];

			const result = await matcher.match(entities, 80);

			expect(result.matchedIds).toEqual(["st1"]);
		});

		it("skips contract_vehicle entities", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "contract_vehicle", value: "SEWP V", confidence: 0.9 },
			];

			const result = await matcher.match(entities, 80);

			expect(result.matchedIds).toEqual([]);
		});

		it("deduplicates matched stakeholder IDs across multiple entities", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "agency", value: "NIWC Pacific", confidence: 0.95 },
				{ type: "program", value: "Cloud Platform Migration", confidence: 0.85 },
			];

			const result = await matcher.match(entities, 80);

			const unique = [...new Set(result.matchedIds)];
			expect(result.matchedIds).toEqual(unique);
			expect(result.matchedIds).toContain("st2");
			expect(result.matchedIds).toContain("st4");
		});

		it("returns empty matchedIds when no entities match", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "agency", value: "NASA", confidence: 0.9 },
			];

			const result = await matcher.match(entities, 80);

			expect(result.matchedIds).toEqual([]);
		});

		it("returns empty matchedIds for empty entities array", async () => {
			const result = await matcher.match([], 80);

			expect(result.matchedIds).toEqual([]);
		});
	});

	describe("discovery", () => {
		it("surfaces unmatched person entities from high-relevance signals", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "person", value: "Gen. Sarah Kim", confidence: 0.9 },
			];

			const result = await matcher.match(entities, 85);

			expect(result.discoveredEntities).toHaveLength(1);
			expect(result.discoveredEntities[0]).toEqual({
				type: "person",
				value: "Gen. Sarah Kim",
				confidence: 0.9,
				signalRelevance: 85,
			});
		});

		it("surfaces unmatched agency entities from high-relevance signals", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "agency", value: "Space Force Delta 6", confidence: 0.85 },
			];

			const result = await matcher.match(entities, 90);

			expect(result.discoveredEntities).toHaveLength(1);
			expect(result.discoveredEntities[0].type).toBe("agency");
			expect(result.discoveredEntities[0].value).toBe("Space Force Delta 6");
		});

		it("does not discover entities when signal relevance is below 75", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "person", value: "Gen. Unknown", confidence: 0.9 },
			];

			const result = await matcher.match(entities, 50);

			expect(result.discoveredEntities).toEqual([]);
		});

		it("does not discover entities with confidence below 0.7", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "person", value: "Some Person", confidence: 0.5 },
			];

			const result = await matcher.match(entities, 90);

			expect(result.discoveredEntities).toEqual([]);
		});

		it("does not discover non-person/non-agency entity types", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "technology", value: "Quantum Computing", confidence: 0.95 },
				{ type: "program", value: "Project Nova", confidence: 0.9 },
				{ type: "company", value: "NewCorp", confidence: 0.85 },
			];

			const result = await matcher.match(entities, 90);

			expect(result.discoveredEntities).toEqual([]);
		});

		it("does not discover entities that matched an existing stakeholder", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "agency", value: "NIWC Pacific", confidence: 0.95 },
			];

			const result = await matcher.match(entities, 90);

			// NIWC Pacific matched st2 and st4, so it should NOT appear in discovered
			expect(result.matchedIds).toContain("st2");
			expect(result.discoveredEntities).toEqual([]);
		});

		it("handles mix of matched and discovered entities", async () => {
			const entities: ExtractedEntity[] = [
				{ type: "agency", value: "NIWC Pacific", confidence: 0.95 },
				{ type: "person", value: "Gen. Sarah Kim", confidence: 0.9 },
			];

			const result = await matcher.match(entities, 85);

			expect(result.matchedIds).toContain("st2");
			expect(result.matchedIds).toContain("st4");
			expect(result.discoveredEntities).toHaveLength(1);
			expect(result.discoveredEntities[0].value).toBe("Gen. Sarah Kim");
		});
	});
});
