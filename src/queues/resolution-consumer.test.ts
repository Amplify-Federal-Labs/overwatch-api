import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleResolution } from "./resolution-consumer";

function makeDeps() {
	return {
		synthesisQueue: {
			send: vi.fn().mockResolvedValue(undefined),
		},
		enrichmentQueue: {
			send: vi.fn().mockResolvedValue(undefined),
		},
		repository: {
			findAllProfilesWithAliases: vi.fn().mockResolvedValue([]),
			createProfile: vi.fn(),
			resolveGroupBatch: vi.fn().mockResolvedValue(undefined),
		},
		resolver: {
			resolveGroup: vi.fn(),
		},
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		},
	};
}

const ENRICHABLE_TYPES = new Set(["person", "agency", "company"]);

describe("resolution-consumer", () => {
	let deps: ReturnType<typeof makeDeps>;

	beforeEach(() => {
		deps = makeDeps();
	});

	it("should resolve entities via exact alias match and produce synthesis message", async () => {
		deps.repository.findAllProfilesWithAliases.mockResolvedValue([
			{ id: "profile-1", canonicalName: "Booz Allen Hamilton", type: "company", aliases: ["Booz Allen Hamilton", "BAH"] },
		]);
		deps.resolver.resolveGroup.mockResolvedValue({
			profileId: "profile-1",
			isNew: false,
			matchMethod: "exact_alias",
		});

		const result = await handleResolution(
			{
				observationId: 101,
				entities: [
					{ rawName: "Booz Allen Hamilton", entityType: "company", role: "subject" },
				],
			},
			deps,
		);

		expect(deps.repository.resolveGroupBatch).toHaveBeenCalled();
		expect(result.resolvedCount).toBe(1);
		expect(deps.synthesisQueue.send).toHaveBeenCalledWith({
			type: "synthesis",
			profileId: "profile-1",
		});
		// Not new, so no enrichment message
		expect(deps.enrichmentQueue.send).not.toHaveBeenCalled();
	});

	it("should create new profile and produce both synthesis and enrichment messages for enrichable types", async () => {
		deps.repository.findAllProfilesWithAliases.mockResolvedValue([]);
		deps.resolver.resolveGroup.mockResolvedValue({
			profileId: null,
			isNew: true,
			matchMethod: "new",
		});
		deps.repository.createProfile.mockResolvedValue("new-profile-1");

		const result = await handleResolution(
			{
				observationId: 102,
				entities: [
					{ rawName: "John Smith", entityType: "person", role: "mentioned" },
				],
			},
			deps,
		);

		expect(deps.repository.createProfile).toHaveBeenCalledWith("person", "John Smith");
		expect(result.newProfilesCreated).toBe(1);

		// Synthesis message for all resolved profiles
		expect(deps.synthesisQueue.send).toHaveBeenCalledWith({
			type: "synthesis",
			profileId: "new-profile-1",
		});

		// Enrichment message for new enrichable profile
		expect(deps.enrichmentQueue.send).toHaveBeenCalledWith({
			type: "enrichment",
			profileId: "new-profile-1",
			entityType: "person",
			canonicalName: "John Smith",
		});
	});

	it("should NOT produce enrichment messages for non-enrichable entity types", async () => {
		deps.repository.findAllProfilesWithAliases.mockResolvedValue([]);
		deps.resolver.resolveGroup.mockResolvedValue({
			profileId: null,
			isNew: true,
			matchMethod: "new",
		});
		deps.repository.createProfile.mockResolvedValue("new-profile-2");

		await handleResolution(
			{
				observationId: 103,
				entities: [
					{ rawName: "Platform One", entityType: "program", role: "object" },
				],
			},
			deps,
		);

		// Synthesis yes, enrichment no (program is not enrichable)
		expect(deps.synthesisQueue.send).toHaveBeenCalledOnce();
		expect(deps.enrichmentQueue.send).not.toHaveBeenCalled();
	});

	it("should resolve multiple entities from the same observation", async () => {
		deps.repository.findAllProfilesWithAliases.mockResolvedValue([
			{ id: "profile-army", canonicalName: "U.S. Army", type: "agency", aliases: ["U.S. Army"] },
		]);
		// First entity: existing match. Second entity: new.
		deps.resolver.resolveGroup
			.mockResolvedValueOnce({ profileId: "profile-army", isNew: false, matchMethod: "exact_alias" })
			.mockResolvedValueOnce({ profileId: null, isNew: true, matchMethod: "new" });
		deps.repository.createProfile.mockResolvedValue("new-profile-saic");

		const result = await handleResolution(
			{
				observationId: 104,
				entities: [
					{ rawName: "U.S. Army", entityType: "agency", role: "object" },
					{ rawName: "SAIC", entityType: "company", role: "subject" },
				],
			},
			deps,
		);

		expect(result.resolvedCount).toBe(2);
		expect(result.newProfilesCreated).toBe(1);

		// Synthesis messages for both profiles (deduped)
		expect(deps.synthesisQueue.send).toHaveBeenCalledTimes(2);
		expect(deps.synthesisQueue.send).toHaveBeenCalledWith({
			type: "synthesis",
			profileId: "profile-army",
		});
		expect(deps.synthesisQueue.send).toHaveBeenCalledWith({
			type: "synthesis",
			profileId: "new-profile-saic",
		});

		// Enrichment only for SAIC (new, company = enrichable)
		expect(deps.enrichmentQueue.send).toHaveBeenCalledOnce();
		expect(deps.enrichmentQueue.send).toHaveBeenCalledWith({
			type: "enrichment",
			profileId: "new-profile-saic",
			entityType: "company",
			canonicalName: "SAIC",
		});
	});

	it("should handle empty entities list gracefully", async () => {
		const result = await handleResolution(
			{
				observationId: 105,
				entities: [],
			},
			deps,
		);

		expect(result.resolvedCount).toBe(0);
		expect(deps.synthesisQueue.send).not.toHaveBeenCalled();
		expect(deps.enrichmentQueue.send).not.toHaveBeenCalled();
	});

	it("should continue resolving other entities when one fails", async () => {
		deps.repository.findAllProfilesWithAliases.mockResolvedValue([]);
		deps.resolver.resolveGroup
			.mockRejectedValueOnce(new Error("AI timeout"))
			.mockResolvedValueOnce({ profileId: null, isNew: true, matchMethod: "new" });
		deps.repository.createProfile.mockResolvedValue("new-profile-ok");

		const result = await handleResolution(
			{
				observationId: 106,
				entities: [
					{ rawName: "FailEntity", entityType: "company", role: "subject" },
					{ rawName: "OkEntity", entityType: "agency", role: "object" },
				],
			},
			deps,
		);

		expect(result.resolvedCount).toBe(1);
		expect(result.failedGroups).toContain("failentity");
	});

	it("should add alias when matched via AI fuzzy matching", async () => {
		deps.repository.findAllProfilesWithAliases.mockResolvedValue([
			{ id: "profile-bah", canonicalName: "Booz Allen Hamilton", type: "company", aliases: ["Booz Allen Hamilton"] },
		]);
		deps.resolver.resolveGroup.mockResolvedValue({
			profileId: "profile-bah",
			isNew: false,
			matchMethod: "ai_fuzzy",
		});

		await handleResolution(
			{
				observationId: 107,
				entities: [
					{ rawName: "BAH", entityType: "company", role: "subject" },
				],
			},
			deps,
		);

		// resolveGroupBatch should be called with addAlias=true for AI fuzzy matches
		expect(deps.repository.resolveGroupBatch).toHaveBeenCalledWith(
			expect.any(Array),
			"profile-bah",
			true,
			"BAH",
		);
	});
});
