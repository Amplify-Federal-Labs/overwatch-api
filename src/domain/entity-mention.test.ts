import { describe, it, expect } from "vitest";
import { EntityMention } from "./entity-mention";

describe("EntityMention", () => {
	const resolved = new EntityMention({
		id: 1,
		observationId: "obs-1",
		role: "subject",
		entityType: "company",
		rawName: "Booz Allen Hamilton",
		entityProfileId: "profile-bah",
		resolvedAt: "2026-03-02T00:00:00Z",
	});

	const unresolvedTech = new EntityMention({
		id: 2,
		observationId: "obs-1",
		role: "mentioned",
		entityType: "technology",
		rawName: "DevSecOps",
		entityProfileId: null,
		resolvedAt: null,
	});

	const agency = new EntityMention({
		id: 3,
		observationId: "obs-1",
		role: "object",
		entityType: "agency",
		rawName: "NIWC Pacific",
		entityProfileId: "profile-niwc",
		resolvedAt: "2026-03-02T00:00:00Z",
	});

	const resolvedPerson = new EntityMention({
		id: 4,
		observationId: "obs-1",
		role: "mentioned",
		entityType: "person",
		rawName: "John Smith",
		entityProfileId: "profile-smith",
		resolvedAt: "2026-03-02T00:00:00Z",
	});

	const unresolvedPerson = new EntityMention({
		id: 5,
		observationId: "obs-1",
		role: "mentioned",
		entityType: "person",
		rawName: "Jane Doe",
		entityProfileId: null,
		resolvedAt: null,
	});

	const competitorCompany = new EntityMention({
		id: 6,
		observationId: "obs-1",
		role: "mentioned",
		entityType: "company",
		rawName: "SAIC",
		entityProfileId: "profile-saic",
		resolvedAt: "2026-03-02T00:00:00Z",
	});

	describe("isResolved", () => {
		it("returns true when entityProfileId is set", () => {
			expect(resolved.isResolved()).toBe(true);
		});

		it("returns false when entityProfileId is null", () => {
			expect(unresolvedTech.isResolved()).toBe(false);
		});
	});

	describe("confidence", () => {
		it("returns 1.0 for resolved entities", () => {
			expect(resolved.confidence).toBe(1.0);
		});

		it("returns 0.5 for unresolved entities", () => {
			expect(unresolvedTech.confidence).toBe(0.5);
		});
	});

	describe("isVendor", () => {
		it("returns true for company with subject role", () => {
			expect(resolved.isVendor()).toBe(true);
		});

		it("returns false for company with non-subject role", () => {
			expect(competitorCompany.isVendor()).toBe(false);
		});

		it("returns false for non-company with subject role", () => {
			const subjectAgency = new EntityMention({
				id: 7,
				observationId: "obs-1",
				role: "subject",
				entityType: "agency",
				rawName: "DISA",
				entityProfileId: null,
				resolvedAt: null,
			});
			expect(subjectAgency.isVendor()).toBe(false);
		});
	});

	describe("isCompetitor", () => {
		it("returns true for company with non-subject role", () => {
			expect(competitorCompany.isCompetitor()).toBe(true);
		});

		it("returns false for company with subject role", () => {
			expect(resolved.isCompetitor()).toBe(false);
		});

		it("returns false for non-company entities", () => {
			expect(agency.isCompetitor()).toBe(false);
		});
	});

	describe("isStakeholder", () => {
		it("returns true for resolved person", () => {
			expect(resolvedPerson.isStakeholder()).toBe(true);
		});

		it("returns false for unresolved person", () => {
			expect(unresolvedPerson.isStakeholder()).toBe(false);
		});

		it("returns false for non-person entities", () => {
			expect(resolved.isStakeholder()).toBe(false);
		});
	});

	describe("isTechnology", () => {
		it("returns true for technology entity", () => {
			expect(unresolvedTech.isTechnology()).toBe(true);
		});

		it("returns false for non-technology entity", () => {
			expect(resolved.isTechnology()).toBe(false);
		});
	});

	describe("isAgency", () => {
		it("returns true for agency entity", () => {
			expect(agency.isAgency()).toBe(true);
		});

		it("returns false for non-agency entity", () => {
			expect(resolved.isAgency()).toBe(false);
		});
	});
});
