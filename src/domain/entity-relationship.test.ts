import { describe, it, expect } from "vitest";
import { EntityRelationship } from "./entity-relationship";

describe("EntityRelationship", () => {
	it("stores relationship properties", () => {
		const rel = new EntityRelationship({
			sourceEntityId: "entity-a",
			targetEntityId: "entity-b",
			type: "works_at",
			observationCount: 3,
			firstSeenAt: "2026-01-01T00:00:00Z",
			lastSeenAt: "2026-03-01T00:00:00Z",
		});

		expect(rel.sourceEntityId).toBe("entity-a");
		expect(rel.targetEntityId).toBe("entity-b");
		expect(rel.type).toBe("works_at");
		expect(rel.observationCount).toBe(3);
	});
});
