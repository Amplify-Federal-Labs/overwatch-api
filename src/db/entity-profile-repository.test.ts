import { describe, it, expect } from "vitest";
import {
	buildEntityProfileRow,
	buildEntityAliasRow,
	buildEntityRelationshipRow,
	groupUnresolvedByName,
	type UnresolvedEntity,
} from "./entity-profile-repository";

describe("buildEntityProfileRow", () => {
	it("builds an entity profile row with defaults", () => {
		const row = buildEntityProfileRow("person", "John Smith");

		expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(row.type).toBe("person");
		expect(row.canonicalName).toBe("John Smith");
		expect(row.observationCount).toBe(0);
		expect(row.summary).toBeNull();
		expect(row.trajectory).toBeNull();
		expect(row.relevanceScore).toBeNull();
		expect(row.lastSynthesizedAt).toBeNull();
		expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(row.firstSeenAt).toBe(row.createdAt);
		expect(row.lastSeenAt).toBe(row.createdAt);
	});
});

describe("buildEntityAliasRow", () => {
	it("builds an alias row with auto source", () => {
		const row = buildEntityAliasRow("profile-123", "J. Smith");

		expect(row.entityProfileId).toBe("profile-123");
		expect(row.alias).toBe("J. Smith");
		expect(row.source).toBe("auto");
		expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("accepts a manual source", () => {
		const row = buildEntityAliasRow("profile-123", "John Smith", "manual");
		expect(row.source).toBe("manual");
	});
});

describe("buildEntityRelationshipRow", () => {
	it("builds a relationship row", () => {
		const row = buildEntityRelationshipRow("entity-a", "entity-b", "works_at");

		expect(row.sourceEntityId).toBe("entity-a");
		expect(row.targetEntityId).toBe("entity-b");
		expect(row.type).toBe("works_at");
		expect(row.observationCount).toBe(1);
		expect(row.firstSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(row.lastSeenAt).toBe(row.firstSeenAt);
	});
});

describe("groupUnresolvedByName", () => {
	it("groups entities by normalized name", () => {
		const entities: UnresolvedEntity[] = [
			{ id: 1, observationId: 10, role: "subject", entityType: "person", rawName: "John Smith" },
			{ id: 2, observationId: 11, role: "object", entityType: "person", rawName: "john smith" },
			{ id: 3, observationId: 12, role: "subject", entityType: "agency", rawName: "NIWC Pacific" },
		];

		const groups = groupUnresolvedByName(entities);

		expect(groups).toHaveLength(2);

		const johnGroup = groups.find((g) => g.normalizedName === "john smith");
		expect(johnGroup).toBeDefined();
		expect(johnGroup!.entities).toHaveLength(2);
		expect(johnGroup!.entityType).toBe("person");
		expect(johnGroup!.mostCommonRawName).toBe("John Smith");

		const niwcGroup = groups.find((g) => g.normalizedName === "niwc pacific");
		expect(niwcGroup).toBeDefined();
		expect(niwcGroup!.entities).toHaveLength(1);
	});

	it("picks the most common raw name variant", () => {
		const entities: UnresolvedEntity[] = [
			{ id: 1, observationId: 10, role: "subject", entityType: "company", rawName: "Booz Allen Hamilton" },
			{ id: 2, observationId: 11, role: "subject", entityType: "company", rawName: "Booz Allen Hamilton" },
			{ id: 3, observationId: 12, role: "subject", entityType: "company", rawName: "booz allen hamilton" },
		];

		const groups = groupUnresolvedByName(entities);
		expect(groups).toHaveLength(1);
		expect(groups[0].mostCommonRawName).toBe("Booz Allen Hamilton");
	});

	it("returns empty array for empty input", () => {
		expect(groupUnresolvedByName([])).toHaveLength(0);
	});
});
