import { describe, it, expect, vi } from "vitest";
import { EntityResolver } from "./entity-resolver";
import type { UnresolvedGroup, UnresolvedEntity } from "../db/entity-profile-repository";
import { groupUnresolvedByName } from "../db/entity-profile-repository";
import { resolveGroups, type ResolveGroupsDeps } from "./entity-resolver-logic";

// Test the full resolution pipeline that the agent orchestrates:
// 1. Get unresolved entities → group by name
// 2. For each group, resolve against existing profiles
// 3. Create new profiles or link to existing ones

describe("resolveGroups", () => {
	function makeDeps(overrides: Partial<ResolveGroupsDeps> = {}): ResolveGroupsDeps {
		return {
			resolver: new EntityResolver(async () => ({ match: null })),
			repository: {
				createProfile: vi.fn().mockResolvedValue("new-profile-id"),
				resolveGroupBatch: vi.fn().mockResolvedValue(undefined),
			},
			existingProfiles: [],
			logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
			...overrides,
		};
	}

	it("tracks failed group names when resolution throws", async () => {
		const deps = makeDeps({
			repository: {
				createProfile: vi.fn().mockResolvedValue("new-profile-id"),
				resolveGroupBatch: vi.fn().mockRejectedValue(new Error("D1 transient error")),
			},
		});

		const groups: UnresolvedGroup[] = [
			{ normalizedName: "larry hale", entityType: "person", mostCommonRawName: "Larry Hale", entities: [{ id: 1, observationId: 10, role: "subject", entityType: "person", rawName: "Larry Hale" }] },
			{ normalizedName: "booz allen", entityType: "company", mostCommonRawName: "Booz Allen", entities: [{ id: 2, observationId: 11, role: "subject", entityType: "company", rawName: "Booz Allen" }] },
		];

		const result = await resolveGroups(groups, deps);

		expect(result.failedGroups).toEqual(["larry hale", "booz allen"]);
		expect(result.resolvedCount).toBe(0);
	});

	it("resolves groups successfully and returns no failed groups", async () => {
		const deps = makeDeps();

		const groups: UnresolvedGroup[] = [
			{ normalizedName: "booz allen", entityType: "company", mostCommonRawName: "Booz Allen", entities: [{ id: 1, observationId: 10, role: "subject", entityType: "company", rawName: "Booz Allen" }] },
		];

		const result = await resolveGroups(groups, deps);

		expect(result.failedGroups).toEqual([]);
		expect(result.resolvedCount).toBe(1);
		expect(result.newProfilesCreated).toBe(1);
	});

	it("continues processing after a failed group", async () => {
		const resolveGroupBatch = vi.fn()
			.mockRejectedValueOnce(new Error("D1 error"))
			.mockResolvedValueOnce(undefined);

		const deps = makeDeps({
			repository: {
				createProfile: vi.fn().mockResolvedValue("new-profile-id"),
				resolveGroupBatch: resolveGroupBatch,
			},
		});

		const groups: UnresolvedGroup[] = [
			{ normalizedName: "failing group", entityType: "person", mostCommonRawName: "Failing Group", entities: [{ id: 1, observationId: 10, role: "subject", entityType: "person", rawName: "Failing Group" }] },
			{ normalizedName: "good group", entityType: "company", mostCommonRawName: "Good Group", entities: [{ id: 2, observationId: 11, role: "subject", entityType: "company", rawName: "Good Group" }] },
		];

		const result = await resolveGroups(groups, deps);

		expect(result.failedGroups).toEqual(["failing group"]);
		// Both groups create profiles (createProfile succeeds), but only the second resolves entities
		expect(result.resolvedCount).toBe(1);
		// The failing group still created a profile before the batch failed
		expect(result.newProfilesCreated).toBe(2);
	});
});

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
