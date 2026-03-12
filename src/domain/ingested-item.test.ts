import { describe, it, expect } from "vitest";
import { IngestedItem } from "./ingested-item";

describe("IngestedItem", () => {
	function makeItem(overrides: Partial<ConstructorParameters<typeof IngestedItem>[0]> = {}) {
		return new IngestedItem({
			id: "item-1",
			sourceType: "rss",
			sourceName: "GovConWire",
			sourceUrl: "https://govconwire.com/1",
			sourceLink: "https://govconwire.com/1",
			content: "Some content",
			sourceMetadata: null,
			relevanceScore: null,
			relevanceRationale: null,
			competencyCodes: null,
			createdAt: "2026-03-01T00:00:00Z",
			...overrides,
		});
	}

	describe("isAboveRelevanceThreshold", () => {
		it("returns true when score is above threshold", () => {
			const item = makeItem({ relevanceScore: 80 });
			expect(item.isAboveRelevanceThreshold(60)).toBe(true);
		});

		it("returns true when score equals threshold", () => {
			const item = makeItem({ relevanceScore: 60 });
			expect(item.isAboveRelevanceThreshold(60)).toBe(true);
		});

		it("returns false when score is below threshold", () => {
			const item = makeItem({ relevanceScore: 30 });
			expect(item.isAboveRelevanceThreshold(60)).toBe(false);
		});

		it("returns true when score is null (legacy items pass)", () => {
			const item = makeItem({ relevanceScore: null });
			expect(item.isAboveRelevanceThreshold(60)).toBe(true);
		});
	});

	describe("dateFromCreatedAt", () => {
		it("extracts date portion from createdAt ISO string", () => {
			const item = makeItem({ createdAt: "2026-03-01T12:30:00Z" });
			expect(item.dateFromCreatedAt).toBe("2026-03-01");
		});
	});
});
