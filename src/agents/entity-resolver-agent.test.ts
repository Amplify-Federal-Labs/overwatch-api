import { describe, it, expect, vi } from "vitest";
import { EntityResolver } from "./entity-resolver";
import type { UnresolvedGroup, UnresolvedEntity } from "../db/entity-profile-repository";
import { groupUnresolvedByName } from "../db/entity-profile-repository";

// Test the full resolution pipeline that the agent orchestrates:
// 1. Get unresolved entities → group by name
// 2. For each group, resolve against existing profiles
// 3. Create new profiles or link to existing ones

describe("EntityResolverAgent pipeline", () => {
	it("resolves unresolved entities against existing profiles", async () => {
		const resolver = new EntityResolver(async () => ({ match: null }));

		const existingProfiles = [
			{ id: "profile-1", canonicalName: "Booz Allen Hamilton", type: "company", aliases: ["Booz Allen Hamilton", "BAH"] },
			{ id: "profile-2", canonicalName: "NIWC Pacific", type: "agency", aliases: ["NIWC Pacific"] },
		];

		const unresolved: UnresolvedEntity[] = [
			{ id: 1, observationId: 10, role: "subject", entityType: "company", rawName: "Booz Allen Hamilton" },
			{ id: 2, observationId: 11, role: "object", entityType: "agency", rawName: "NIWC Pacific" },
		];

		const groups = groupUnresolvedByName(unresolved);
		const results = [];

		for (const group of groups) {
			const result = await resolver.resolveGroup(group, existingProfiles);
			results.push({ group, result });
		}

		expect(results).toHaveLength(2);

		const boozResult = results.find((r) => r.group.normalizedName === "booz allen hamilton");
		expect(boozResult!.result.profileId).toBe("profile-1");
		expect(boozResult!.result.isNew).toBe(false);

		const niwcResult = results.find((r) => r.group.normalizedName === "niwc pacific");
		expect(niwcResult!.result.profileId).toBe("profile-2");
		expect(niwcResult!.result.isNew).toBe(false);
	});

	it("creates new profiles for unknown entities", async () => {
		const resolver = new EntityResolver(async () => ({ match: null }));

		const existingProfiles: { id: string; canonicalName: string; type: string; aliases: string[] }[] = [];

		const unresolved: UnresolvedEntity[] = [
			{ id: 1, observationId: 10, role: "subject", entityType: "company", rawName: "New Corp" },
		];

		const groups = groupUnresolvedByName(unresolved);
		const result = await resolver.resolveGroup(groups[0], existingProfiles);

		expect(result.isNew).toBe(true);
		expect(result.profileId).toBeNull();
	});

	it("uses AI fuzzy matching when exact alias fails", async () => {
		const aiMatch = vi.fn().mockResolvedValue({ match: "profile-1", confidence: 0.85 });
		const resolver = new EntityResolver(aiMatch);

		const existingProfiles = [
			{ id: "profile-1", canonicalName: "Booz Allen Hamilton", type: "company", aliases: ["Booz Allen Hamilton"] },
		];

		const unresolved: UnresolvedEntity[] = [
			{ id: 1, observationId: 10, role: "subject", entityType: "company", rawName: "BAH" },
		];

		const groups = groupUnresolvedByName(unresolved);
		const result = await resolver.resolveGroup(groups[0], existingProfiles);

		expect(result.profileId).toBe("profile-1");
		expect(result.matchMethod).toBe("ai_fuzzy");
		expect(aiMatch).toHaveBeenCalled();
	});
});
