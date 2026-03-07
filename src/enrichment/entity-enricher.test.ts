import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntityEnricher, type EnrichmentDeps, type EnrichmentResult } from "./entity-enricher";
import type { ProfileForEnrichment } from "../db/enrichment-repository";
import type { PersonDossier } from "../schemas";

function makeDeps(overrides: Partial<EnrichmentDeps> = {}): EnrichmentDeps {
	return {
		findProfiles: vi.fn().mockResolvedValue([]),
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
			findProfiles: vi.fn().mockResolvedValue([PROFILE]),
			search: vi.fn().mockResolvedValue([
				{ title: "John Smith", url: "https://govconwire.com/1", description: "bio" },
			]),
			fetchPages: vi.fn().mockResolvedValue(["John Smith is the CTO of DISA"]),
			extractDossier: vi.fn().mockResolvedValue(DOSSIER),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run();

		expect(result.profilesProcessed).toBe(1);
		expect(result.profilesEnriched).toBe(1);
		expect(result.profilesFailed).toBe(0);
		expect(deps.saveDossier).toHaveBeenCalledWith("p-1", DOSSIER);
	});

	it("marks profile as skipped when no search results", async () => {
		const deps = makeDeps({
			findProfiles: vi.fn().mockResolvedValue([PROFILE]),
			search: vi.fn().mockResolvedValue([]),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run();

		expect(result.profilesProcessed).toBe(1);
		expect(result.profilesEnriched).toBe(0);
		expect(result.profilesSkipped).toBe(1);
		expect(deps.markSkipped).toHaveBeenCalledWith("p-1");
	});

	it("marks profile as skipped when no pages fetched", async () => {
		const deps = makeDeps({
			findProfiles: vi.fn().mockResolvedValue([PROFILE]),
			search: vi.fn().mockResolvedValue([
				{ title: "Result", url: "https://example.com", description: "desc" },
			]),
			fetchPages: vi.fn().mockResolvedValue([]),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run();

		expect(result.profilesSkipped).toBe(1);
		expect(deps.markSkipped).toHaveBeenCalledWith("p-1");
	});

	it("marks profile as failed when AI extraction returns null", async () => {
		const deps = makeDeps({
			findProfiles: vi.fn().mockResolvedValue([PROFILE]),
			search: vi.fn().mockResolvedValue([
				{ title: "Result", url: "https://example.com", description: "desc" },
			]),
			fetchPages: vi.fn().mockResolvedValue(["Some text"]),
			extractDossier: vi.fn().mockResolvedValue(null),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run();

		expect(result.profilesFailed).toBe(1);
		expect(deps.markFailed).toHaveBeenCalledWith("p-1");
	});

	it("marks profile as failed when extraction throws", async () => {
		const deps = makeDeps({
			findProfiles: vi.fn().mockResolvedValue([PROFILE]),
			search: vi.fn().mockResolvedValue([
				{ title: "Result", url: "https://example.com", description: "desc" },
			]),
			fetchPages: vi.fn().mockResolvedValue(["Some text"]),
			extractDossier: vi.fn().mockRejectedValue(new Error("AI error")),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run();

		expect(result.profilesFailed).toBe(1);
		expect(deps.markFailed).toHaveBeenCalledWith("p-1");
	});

	it("returns early when no profiles need enrichment", async () => {
		const deps = makeDeps();
		const enricher = new EntityEnricher(deps);
		const result = await enricher.run();

		expect(result.profilesProcessed).toBe(0);
		expect(deps.search).not.toHaveBeenCalled();
	});

	it("processes multiple profiles", async () => {
		const profile2: ProfileForEnrichment = {
			id: "p-2",
			type: "agency",
			canonicalName: "NIWC Pacific",
		};

		const deps = makeDeps({
			findProfiles: vi.fn().mockResolvedValue([PROFILE, profile2]),
			search: vi.fn().mockResolvedValue([
				{ title: "Result", url: "https://example.com", description: "desc" },
			]),
			fetchPages: vi.fn().mockResolvedValue(["Some text"]),
			extractDossier: vi.fn()
				.mockResolvedValueOnce(DOSSIER)
				.mockResolvedValueOnce(null),
		});

		const enricher = new EntityEnricher(deps);
		const result = await enricher.run();

		expect(result.profilesProcessed).toBe(2);
		expect(result.profilesEnriched).toBe(1);
		expect(result.profilesFailed).toBe(1);
	});
});
