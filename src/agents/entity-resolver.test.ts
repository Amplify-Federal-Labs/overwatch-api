import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntityResolver, type EntityMatchResult } from "./entity-resolver";
import type { UnresolvedGroup } from "../db/entity-profile-repository";

function makeResolver(aiMatchFn?: (name: string, candidates: string[]) => Promise<EntityMatchResult>) {
	const matchFn = aiMatchFn ?? (async () => ({ match: null }));
	return new EntityResolver(matchFn);
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

interface ProfileWithAliases {
	id: string;
	canonicalName: string;
	type: string;
	aliases: string[];
}

describe("EntityResolver.resolveGroup", () => {
	it("returns exact alias match when found", async () => {
		const resolver = makeResolver();
		const group = makeGroup();
		const existingProfiles: ProfileWithAliases[] = [
			{ id: "profile-1", canonicalName: "Booz Allen Hamilton", type: "company", aliases: ["Booz Allen Hamilton", "BAH"] },
		];

		const result = await resolver.resolveGroup(group, existingProfiles);

		expect(result.profileId).toBe("profile-1");
		expect(result.isNew).toBe(false);
		expect(result.matchMethod).toBe("exact_alias");
	});

	it("returns exact alias match case-insensitively", async () => {
		const resolver = makeResolver();
		const group = makeGroup({ mostCommonRawName: "booz allen hamilton" });
		const existingProfiles: ProfileWithAliases[] = [
			{ id: "profile-1", canonicalName: "Booz Allen Hamilton", type: "company", aliases: ["Booz Allen Hamilton"] },
		];

		const result = await resolver.resolveGroup(group, existingProfiles);

		expect(result.profileId).toBe("profile-1");
		expect(result.matchMethod).toBe("exact_alias");
	});

	it("falls back to AI match when no exact alias match", async () => {
		const aiMatch = vi.fn().mockResolvedValue({ match: "profile-2", confidence: 0.9 });
		const resolver = makeResolver(aiMatch);
		const group = makeGroup({ mostCommonRawName: "Booz Allen" });
		const existingProfiles: ProfileWithAliases[] = [
			{ id: "profile-2", canonicalName: "Booz Allen Hamilton", type: "company", aliases: ["Booz Allen Hamilton"] },
		];

		const result = await resolver.resolveGroup(group, existingProfiles);

		expect(result.profileId).toBe("profile-2");
		expect(result.isNew).toBe(false);
		expect(result.matchMethod).toBe("ai_fuzzy");
		expect(aiMatch).toHaveBeenCalledWith("Booz Allen", ["profile-2:Booz Allen Hamilton"]);
	});

	it("creates new profile when AI returns no match", async () => {
		const aiMatch = vi.fn().mockResolvedValue({ match: null });
		const resolver = makeResolver(aiMatch);
		const group = makeGroup({ mostCommonRawName: "New Company LLC" });
		const existingProfiles: ProfileWithAliases[] = [
			{ id: "profile-1", canonicalName: "Other Corp", type: "company", aliases: ["Other Corp"] },
		];

		const result = await resolver.resolveGroup(group, existingProfiles);

		expect(result.profileId).toBeNull();
		expect(result.isNew).toBe(true);
		expect(result.matchMethod).toBe("new");
	});

	it("creates new profile when no existing profiles of same type", async () => {
		const aiMatch = vi.fn();
		const resolver = makeResolver(aiMatch);
		const group = makeGroup({ entityType: "person" });
		const existingProfiles: ProfileWithAliases[] = [
			{ id: "profile-1", canonicalName: "NIWC Pacific", type: "agency", aliases: ["NIWC Pacific"] },
		];

		const result = await resolver.resolveGroup(group, existingProfiles);

		expect(result.isNew).toBe(true);
		expect(result.matchMethod).toBe("new");
		// AI should NOT be called since there are no same-type candidates
		expect(aiMatch).not.toHaveBeenCalled();
	});

	it("only considers profiles of the same entity type", async () => {
		const aiMatch = vi.fn().mockResolvedValue({ match: null });
		const resolver = makeResolver(aiMatch);
		const group = makeGroup({ entityType: "company" });
		const existingProfiles: ProfileWithAliases[] = [
			{ id: "profile-1", canonicalName: "Booz Allen Hamilton", type: "person", aliases: ["Booz Allen Hamilton"] },
			{ id: "profile-2", canonicalName: "SAIC", type: "company", aliases: ["SAIC"] },
		];

		const result = await resolver.resolveGroup(group, existingProfiles);

		// AI should only see company candidates
		expect(aiMatch).toHaveBeenCalledWith("Booz Allen Hamilton", ["profile-2:SAIC"]);
	});
});
