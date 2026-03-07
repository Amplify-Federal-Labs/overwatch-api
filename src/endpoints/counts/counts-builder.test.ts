import { describe, it, expect } from "vitest";
import { buildCounts, type TabCounts } from "./counts-builder";

describe("buildCounts", () => {
	it("returns all tab counts", () => {
		const input: TabCounts = {
			signals: 42,
			stakeholders: 15,
			competitors: 8,
		};

		const result = buildCounts(input);

		expect(result).toEqual({
			signals: 42,
			stakeholders: 15,
			competitors: 8,
			interactions: 0,
			drafts: 0,
		});
	});

	it("handles zero counts", () => {
		const input: TabCounts = {
			signals: 0,
			stakeholders: 0,
			competitors: 0,
		};

		const result = buildCounts(input);

		expect(result).toEqual({
			signals: 0,
			stakeholders: 0,
			competitors: 0,
			interactions: 0,
			drafts: 0,
		});
	});
});
