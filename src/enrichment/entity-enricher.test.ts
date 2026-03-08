import { describe, it, expect, vi } from "vitest";
import { EntityEnricher, shouldSelfScheduleEnrichment, type EnrichmentDeps, type EnrichmentResult } from "./entity-enricher";
import type { ProfileForEnrichment } from "../db/enrichment-repository";
import type { PersonDossier } from "../schemas";

function makeDeps(overrides: Partial<EnrichmentDeps> = {}): EnrichmentDeps {
	return {
		search: vi.fn().mockResolvedValue([]),
		fetchPages: vi.fn().mockResolvedValue([]),
		extractDossier: vi.fn().mockResolvedValue(null),
		saveDossier: vi.fn().mockResolvedValue(undefined),
		markFailed: vi.fn().mockResolvedValue(undefined),
		markSkipped: vi.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

const PROFILE: ProfileForEnrichment = {
	id: "p-1",
	type: "person",
	canonicalName: "John Smith",
};

const DOSSIER: PersonDossier = {
	kind: "person",
	title: "CTO",
	org: "DISA",
	branch: "DoD",
	programs: [],
	education: [],
	careerHistory: [],
	focusAreas: [],
	decorations: [],
};

describe("EntityEnricher", () => {
	it("enriches a profile end-to-end", async () => {
		const deps = makeDeps({
			search: vi.fn().mockResolvedValue([
				{ title: "John Smith", url: "https://govconwire.com/1", description: "bio" },
			]),
			fetchPages: vi.fn().mockResolvedValue(["John Smith is the CTO of DISA"]),
			extractDossier: vi.fn().mockResolvedValue(DOSSIER),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run([PROFILE]);

		expect(result.profilesProcessed).toBe(1);
		expect(result.profilesEnriched).toBe(1);
		expect(result.profilesFailed).toBe(0);
		expect(result.remainingProfileIds).toEqual([]);
		expect(deps.saveDossier).toHaveBeenCalledWith("p-1", DOSSIER);
	});

	it("marks profile as skipped when no search results", async () => {
		const deps = makeDeps({
			search: vi.fn().mockResolvedValue([]),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run([PROFILE]);

		expect(result.profilesProcessed).toBe(1);
		expect(result.profilesEnriched).toBe(0);
		expect(result.profilesSkipped).toBe(1);
		expect(deps.markSkipped).toHaveBeenCalledWith("p-1");
	});

	it("marks profile as skipped when no pages fetched", async () => {
		const deps = makeDeps({
			search: vi.fn().mockResolvedValue([
				{ title: "Result", url: "https://example.com", description: "desc" },
			]),
			fetchPages: vi.fn().mockResolvedValue([]),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run([PROFILE]);

		expect(result.profilesSkipped).toBe(1);
		expect(deps.markSkipped).toHaveBeenCalledWith("p-1");
	});

	it("marks profile as failed when AI extraction returns null", async () => {
		const deps = makeDeps({
			search: vi.fn().mockResolvedValue([
				{ title: "Result", url: "https://example.com", description: "desc" },
			]),
			fetchPages: vi.fn().mockResolvedValue(["Some text"]),
			extractDossier: vi.fn().mockResolvedValue(null),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run([PROFILE]);

		expect(result.profilesFailed).toBe(1);
		expect(deps.markFailed).toHaveBeenCalledWith("p-1");
	});

	it("marks profile as failed when extraction throws", async () => {
		const deps = makeDeps({
			search: vi.fn().mockResolvedValue([
				{ title: "Result", url: "https://example.com", description: "desc" },
			]),
			fetchPages: vi.fn().mockResolvedValue(["Some text"]),
			extractDossier: vi.fn().mockRejectedValue(new Error("AI error")),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run([PROFILE]);

		expect(result.profilesFailed).toBe(1);
		expect(deps.markFailed).toHaveBeenCalledWith("p-1");
	});

	it("returns early when no profiles provided", async () => {
		const deps = makeDeps();
		const enricher = new EntityEnricher(deps);
		const result = await enricher.run([]);

		expect(result.profilesProcessed).toBe(0);
		expect(result.remainingProfileIds).toEqual([]);
		expect(deps.search).not.toHaveBeenCalled();
	});

	it("processes multiple profiles", async () => {
		const profile2: ProfileForEnrichment = {
			id: "p-2",
			type: "agency",
			canonicalName: "NIWC Pacific",
		};

		const deps = makeDeps({
			search: vi.fn().mockResolvedValue([
				{ title: "Result", url: "https://example.com", description: "desc" },
			]),
			fetchPages: vi.fn().mockResolvedValue(["Some text"]),
			extractDossier: vi.fn()
				.mockResolvedValueOnce(DOSSIER)
				.mockResolvedValueOnce(null),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run([PROFILE, profile2]);

		expect(result.profilesProcessed).toBe(2);
		expect(result.profilesEnriched).toBe(1);
		expect(result.profilesFailed).toBe(1);
	});

	it("only processes BATCH_SIZE profiles and returns remaining IDs", async () => {
		// Create 12 profiles — should process 10, return 2 remaining
		const profiles: ProfileForEnrichment[] = Array.from({ length: 12 }, (_, i) => ({
			id: `p-${i}`,
			type: "person",
			canonicalName: `Person ${i}`,
		}));

		const deps = makeDeps({
			search: vi.fn().mockResolvedValue([
				{ title: "Result", url: "https://example.com", description: "desc" },
			]),
			fetchPages: vi.fn().mockResolvedValue(["Some text"]),
			extractDossier: vi.fn().mockResolvedValue(DOSSIER),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run(profiles);

		expect(result.profilesProcessed).toBe(10);
		expect(result.profilesEnriched).toBe(10);
		expect(result.remainingProfileIds).toEqual(["p-10", "p-11"]);
	});

	it("returns empty remainingProfileIds when all profiles fit in batch", async () => {
		const profiles: ProfileForEnrichment[] = Array.from({ length: 5 }, (_, i) => ({
			id: `p-${i}`,
			type: "person",
			canonicalName: `Person ${i}`,
		}));

		const deps = makeDeps({
			search: vi.fn().mockResolvedValue([
				{ title: "Result", url: "https://example.com", description: "desc" },
			]),
			fetchPages: vi.fn().mockResolvedValue(["Some text"]),
			extractDossier: vi.fn().mockResolvedValue(DOSSIER),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run(profiles);

		expect(result.profilesProcessed).toBe(5);
		expect(result.remainingProfileIds).toEqual([]);
	});
});

describe("shouldSelfScheduleEnrichment", () => {
	it("returns true when remaining profiles exist and some enriched", () => {
		const result: EnrichmentResult = { profilesProcessed: 10, profilesEnriched: 5, profilesFailed: 0, profilesSkipped: 5, remainingProfileIds: ["p-1", "p-2"], startedAt: "2026-03-01T00:00:00Z" };
		expect(shouldSelfScheduleEnrichment(result)).toBe(true);
	});

	it("returns false when no remaining profiles", () => {
		const result: EnrichmentResult = { profilesProcessed: 10, profilesEnriched: 10, profilesFailed: 0, profilesSkipped: 0, remainingProfileIds: [], startedAt: "2026-03-01T00:00:00Z" };
		expect(shouldSelfScheduleEnrichment(result)).toBe(false);
	});

	it("returns false when no profiles were enriched (all failed/skipped)", () => {
		const result: EnrichmentResult = { profilesProcessed: 10, profilesEnriched: 0, profilesFailed: 5, profilesSkipped: 5, remainingProfileIds: ["p-1", "p-2"], startedAt: "2026-03-01T00:00:00Z" };
		expect(shouldSelfScheduleEnrichment(result)).toBe(false);
	});
});
