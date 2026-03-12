import { describe, it, expect } from "vitest";
import { UnresolvedGroup, type UnresolvedMention } from "./unresolved-group";

describe("UnresolvedGroup", () => {
	describe("fromMentions", () => {
		it("groups mentions by normalized name", () => {
			const mentions: UnresolvedMention[] = [
				{ id: 1, observationId: 10, role: "subject", entityType: "person", rawName: "John Smith" },
				{ id: 2, observationId: 11, role: "object", entityType: "person", rawName: "john smith" },
				{ id: 3, observationId: 12, role: "subject", entityType: "agency", rawName: "NIWC Pacific" },
			];

			const groups = UnresolvedGroup.fromMentions(mentions);

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
			const mentions: UnresolvedMention[] = [
				{ id: 1, observationId: 10, role: "subject", entityType: "company", rawName: "Booz Allen Hamilton" },
				{ id: 2, observationId: 11, role: "subject", entityType: "company", rawName: "Booz Allen Hamilton" },
				{ id: 3, observationId: 12, role: "subject", entityType: "company", rawName: "booz allen hamilton" },
			];

			const groups = UnresolvedGroup.fromMentions(mentions);
			expect(groups).toHaveLength(1);
			expect(groups[0].mostCommonRawName).toBe("Booz Allen Hamilton");
		});

		it("returns empty array for empty input", () => {
			expect(UnresolvedGroup.fromMentions([])).toHaveLength(0);
		});

		it("trims whitespace during normalization", () => {
			const mentions: UnresolvedMention[] = [
				{ id: 1, observationId: 10, role: "subject", entityType: "person", rawName: "  John Smith  " },
				{ id: 2, observationId: 11, role: "object", entityType: "person", rawName: "John Smith" },
			];

			const groups = UnresolvedGroup.fromMentions(mentions);
			expect(groups).toHaveLength(1);
			expect(groups[0].entities).toHaveLength(2);
		});
	});
});
