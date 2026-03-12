import { describe, it, expect } from "vitest";
import { EntityAlias } from "./entity-alias";

describe("EntityAlias", () => {
	describe("matches", () => {
		it("matches case-insensitively", () => {
			const alias = new EntityAlias({ alias: "Booz Allen Hamilton", source: "auto", createdAt: "2026-03-01T00:00:00Z" });
			expect(alias.matches("booz allen hamilton")).toBe(true);
			expect(alias.matches("BOOZ ALLEN HAMILTON")).toBe(true);
		});

		it("trims whitespace", () => {
			const alias = new EntityAlias({ alias: "NIWC Pacific", source: "auto", createdAt: "2026-03-01T00:00:00Z" });
			expect(alias.matches("  NIWC Pacific  ")).toBe(true);
		});

		it("returns false for non-matching name", () => {
			const alias = new EntityAlias({ alias: "DISA", source: "auto", createdAt: "2026-03-01T00:00:00Z" });
			expect(alias.matches("NIWC")).toBe(false);
		});
	});

	describe("source", () => {
		it("supports auto source", () => {
			const alias = new EntityAlias({ alias: "BAH", source: "auto", createdAt: "2026-03-01T00:00:00Z" });
			expect(alias.source).toBe("auto");
		});

		it("supports manual source", () => {
			const alias = new EntityAlias({ alias: "BAH", source: "manual", createdAt: "2026-03-01T00:00:00Z" });
			expect(alias.source).toBe("manual");
		});
	});
});
