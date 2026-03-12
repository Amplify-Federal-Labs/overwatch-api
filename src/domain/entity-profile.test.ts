import { describe, it, expect } from "vitest";
import { EntityProfile } from "./entity-profile";

describe("EntityProfile", () => {
	describe("create", () => {
		it("creates a profile with correct defaults", () => {
			const profile = EntityProfile.create("person", "John Smith");

			expect(profile.type).toBe("person");
			expect(profile.canonicalName).toBe("John Smith");
			expect(profile.observationCount).toBe(0);
			expect(profile.summary).toBeNull();
			expect(profile.trajectory).toBeNull();
			expect(profile.relevanceScore).toBeNull();
			expect(profile.enrichmentStatus).toBe("pending");
			expect(profile.lastSynthesizedAt).toBeNull();
			expect(profile.lastEnrichedAt).toBeNull();
			expect(profile.dossier).toBeNull();
		});

		it("generates a UUID id", () => {
			const profile = EntityProfile.create("agency", "NIWC Pacific");
			expect(profile.id).toMatch(/^[0-9a-f-]{36}$/);
		});

		it("sets firstSeenAt and lastSeenAt to creation time", () => {
			const profile = EntityProfile.create("company", "Booz Allen");
			expect(profile.firstSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(profile.lastSeenAt).toBe(profile.firstSeenAt);
			expect(profile.createdAt).toBe(profile.firstSeenAt);
		});

		it("includes canonical name as initial alias", () => {
			const profile = EntityProfile.create("person", "John Smith");
			expect(profile.aliases).toHaveLength(1);
			expect(profile.aliases[0].alias).toBe("John Smith");
			expect(profile.aliases[0].source).toBe("auto");
		});
	});

	describe("isEnrichable", () => {
		it("returns true for person", () => {
			const p = EntityProfile.create("person", "John Smith");
			expect(p.isEnrichable()).toBe(true);
		});

		it("returns true for agency", () => {
			const p = EntityProfile.create("agency", "NIWC Pacific");
			expect(p.isEnrichable()).toBe(true);
		});

		it("returns true for company", () => {
			const p = EntityProfile.create("company", "Booz Allen");
			expect(p.isEnrichable()).toBe(true);
		});

		it("returns false for program", () => {
			const p = EntityProfile.create("program", "Platform One");
			expect(p.isEnrichable()).toBe(false);
		});

		it("returns false for technology", () => {
			const p = EntityProfile.create("technology", "DevSecOps");
			expect(p.isEnrichable()).toBe(false);
		});

		it("returns false for contract_vehicle", () => {
			const p = EntityProfile.create("contract_vehicle", "STARS III");
			expect(p.isEnrichable()).toBe(false);
		});
	});

	describe("matchesAlias", () => {
		it("matches exact alias (case-insensitive)", () => {
			const p = EntityProfile.create("person", "John Smith");
			expect(p.matchesAlias("john smith")).toBe(true);
			expect(p.matchesAlias("JOHN SMITH")).toBe(true);
			expect(p.matchesAlias("John Smith")).toBe(true);
		});

		it("trims whitespace before matching", () => {
			const p = EntityProfile.create("person", "John Smith");
			expect(p.matchesAlias("  John Smith  ")).toBe(true);
		});

		it("returns false when no alias matches", () => {
			const p = EntityProfile.create("person", "John Smith");
			expect(p.matchesAlias("Jane Doe")).toBe(false);
		});

		it("matches against added aliases", () => {
			const p = EntityProfile.create("person", "John Smith");
			p.addAlias("J. Smith", "auto");
			expect(p.matchesAlias("j. smith")).toBe(true);
		});
	});

	describe("addAlias", () => {
		it("adds a new alias", () => {
			const p = EntityProfile.create("person", "John Smith");
			const alias = p.addAlias("J. Smith", "auto");

			expect(alias.alias).toBe("J. Smith");
			expect(alias.source).toBe("auto");
			expect(p.aliases).toHaveLength(2);
		});

		it("supports manual source", () => {
			const p = EntityProfile.create("person", "John Smith");
			const alias = p.addAlias("Johnny Smith", "manual");
			expect(alias.source).toBe("manual");
		});
	});
});
