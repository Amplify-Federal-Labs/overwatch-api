import { describe, it, expect, vi } from "vitest";
import { EntityResolver, type MatchableProfile } from "./entity-resolver";
import type { UnresolvedGroup } from "../db/entity-profile-repository";
import type { FuzzyEntityMatchingService, FuzzyMatchCandidate, FuzzyMatchResult } from "../services/fuzzy-entity-matching";

function makeMockMatcher(
	matchImpl?: (name: string, entityType: string, candidates: FuzzyMatchCandidate[]) => Promise<FuzzyMatchResult>,
): FuzzyEntityMatchingService & { match: ReturnType<typeof vi.fn> } {
	const defaultImpl = async () => ({ matchedId: null, confidence: 0 });
	const matchFn = vi.fn(matchImpl ?? defaultImpl);
	return { match: matchFn };
}

function makeResolver(matcher?: ReturnType<typeof makeMockMatcher>) {
	return new EntityResolver(matcher ?? makeMockMatcher());
}

function makeGroup(overrides: Partial<UnresolvedGroup> = {}): UnresolvedGroup {
	return {
		normalizedName: "booz allen hamilton",
		entityType: "company",
		mostCommonRawName: "Booz Allen Hamilton",
		entities: [
			{ id: 1, observationId: 10, role: "subject", entityType: "company", rawName: "Booz Allen Hamilton" },
		],
		...overrides,
	};
}

function makeProfile(id: string, canonicalName: string, type: string, aliases: string[]): MatchableProfile {
	return {
		id,
		canonicalName,
		type,
		matchesAlias(name: string): boolean {
			const normalized = name.toLowerCase().trim();
			return aliases.some((a) => a.toLowerCase().trim() === normalized);
		},
	};
}

describe("EntityResolver.resolveGroup", () => {
	it("returns exact alias match when found", async () => {
		const resolver = makeResolver();
		const group = makeGroup();
		const existingProfiles = [
			makeProfile("profile-1", "Booz Allen Hamilton", "company", ["Booz Allen Hamilton", "BAH"]),
		];

		const result = await resolver.resolveGroup(group, existingProfiles);

		expect(result.profileId).toBe("profile-1");
		expect(result.isNew).toBe(false);
		expect(result.matchMethod).toBe("exact_alias");
	});

	it("returns exact alias match case-insensitively", async () => {
		const resolver = makeResolver();
		const group = makeGroup({ mostCommonRawName: "booz allen hamilton" });
		const existingProfiles = [
			makeProfile("profile-1", "Booz Allen Hamilton", "company", ["Booz Allen Hamilton"]),
		];

		const result = await resolver.resolveGroup(group, existingProfiles);

		expect(result.profileId).toBe("profile-1");
		expect(result.matchMethod).toBe("exact_alias");
	});

	it("falls back to AI match when no exact alias match", async () => {
		const matcher = makeMockMatcher(async () => ({ matchedId: "profile-2", confidence: 0.9 }));
		const resolver = makeResolver(matcher);
		const group = makeGroup({ mostCommonRawName: "Booz Allen" });
		const existingProfiles = [
			makeProfile("profile-2", "Booz Allen Hamilton", "company", ["Booz Allen Hamilton"]),
		];

		const result = await resolver.resolveGroup(group, existingProfiles);

		expect(result.profileId).toBe("profile-2");
		expect(result.isNew).toBe(false);
		expect(result.matchMethod).toBe("ai_fuzzy");
		expect(matcher.match).toHaveBeenCalledWith(
			"Booz Allen",
			"company",
			[{ id: "profile-2", canonicalName: "Booz Allen Hamilton" }],
		);
	});

	it("creates new profile when AI returns no match", async () => {
		const matcher = makeMockMatcher(async () => ({ matchedId: null, confidence: 0 }));
		const resolver = makeResolver(matcher);
		const group = makeGroup({ mostCommonRawName: "New Company LLC" });
		const existingProfiles = [
			makeProfile("profile-1", "Other Corp", "company", ["Other Corp"]),
		];

		const result = await resolver.resolveGroup(group, existingProfiles);

		expect(result.profileId).toBeNull();
		expect(result.isNew).toBe(true);
		expect(result.matchMethod).toBe("new");
	});

	it("creates new profile when no existing profiles of same type", async () => {
		const matcher = makeMockMatcher();
		const resolver = makeResolver(matcher);
		const group = makeGroup({ entityType: "person" });
		const existingProfiles = [
			makeProfile("profile-1", "NIWC Pacific", "agency", ["NIWC Pacific"]),
		];

		const result = await resolver.resolveGroup(group, existingProfiles);

		expect(result.isNew).toBe(true);
		expect(result.matchMethod).toBe("new");
		// AI should NOT be called since there are no same-type candidates
		expect(matcher.match).not.toHaveBeenCalled();
	});

	it("only considers profiles of the same entity type", async () => {
		const matcher = makeMockMatcher(async () => ({ matchedId: null, confidence: 0 }));
		const resolver = makeResolver(matcher);
		const group = makeGroup({ entityType: "company" });
		const existingProfiles = [
			makeProfile("profile-1", "Booz Allen Hamilton", "person", ["Booz Allen Hamilton"]),
			makeProfile("profile-2", "SAIC", "company", ["SAIC"]),
		];

		const result = await resolver.resolveGroup(group, existingProfiles);

		// AI should only see company candidates
		expect(matcher.match).toHaveBeenCalledWith(
			"Booz Allen Hamilton",
			"company",
			[{ id: "profile-2", canonicalName: "SAIC" }],
		);
	});
});
