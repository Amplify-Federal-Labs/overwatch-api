import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleEnrichment } from "./enrichment-consumer";
import type { PersonDossier, AgencyDossier } from "../schemas";

describe("enrichment-consumer", () => {
	const PERSON_DOSSIER: PersonDossier = {
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

	const baseDeps = {
		search: vi.fn(),
		fetchPages: vi.fn(),
		extractDossier: vi.fn(),
		repository: {
			saveDossier: vi.fn().mockResolvedValue(undefined),
			markFailed: vi.fn().mockResolvedValue(undefined),
			markSkipped: vi.fn().mockResolvedValue(undefined),
			findContextForProfile: vi.fn().mockResolvedValue(undefined),
		},
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should enrich a profile end-to-end", async () => {
		baseDeps.search.mockResolvedValue([
			{ title: "John Smith bio", url: "https://example.com/bio", description: "bio" },
		]);
		baseDeps.fetchPages.mockResolvedValue(["John Smith is the CTO of DISA"]);
		baseDeps.extractDossier.mockResolvedValue(PERSON_DOSSIER);

		const result = await handleEnrichment(
			{ profileId: "p-1", entityType: "person", canonicalName: "John Smith" },
			baseDeps,
		);

		expect(result.enriched).toBe(true);
		expect(baseDeps.repository.saveDossier).toHaveBeenCalledWith("p-1", PERSON_DOSSIER);
		expect(baseDeps.search).toHaveBeenCalledWith("John Smith", "person", undefined);
	});

	it("should pass enrichment context to search when available", async () => {
		const context = {
			coOccurringEntities: [{ canonicalName: "Department of the Army", type: "agency" }],
			observationTypes: ["solicitation"],
		};
		baseDeps.repository.findContextForProfile.mockResolvedValue(context);
		baseDeps.search.mockResolvedValue([
			{ title: "Result", url: "https://example.com", description: "desc" },
		]);
		baseDeps.fetchPages.mockResolvedValue(["Some text"]);
		baseDeps.extractDossier.mockResolvedValue(PERSON_DOSSIER);

		await handleEnrichment(
			{ profileId: "p-1", entityType: "person", canonicalName: "Michael T. Geegan" },
			baseDeps,
		);

		expect(baseDeps.search).toHaveBeenCalledWith("Michael T. Geegan", "person", context);
	});

	it("should mark skipped when no search results", async () => {
		baseDeps.search.mockResolvedValue([]);

		const result = await handleEnrichment(
			{ profileId: "p-1", entityType: "person", canonicalName: "John Smith" },
			baseDeps,
		);

		expect(result.enriched).toBe(false);
		expect(result.outcome).toBe("skipped");
		expect(baseDeps.repository.markSkipped).toHaveBeenCalledWith("p-1");
	});

	it("should mark skipped when no pages fetched", async () => {
		baseDeps.search.mockResolvedValue([
			{ title: "Result", url: "https://example.com", description: "desc" },
		]);
		baseDeps.fetchPages.mockResolvedValue([]);

		const result = await handleEnrichment(
			{ profileId: "p-1", entityType: "person", canonicalName: "John Smith" },
			baseDeps,
		);

		expect(result.enriched).toBe(false);
		expect(result.outcome).toBe("skipped");
		expect(baseDeps.repository.markSkipped).toHaveBeenCalledWith("p-1");
	});

	it("should mark failed when AI extraction returns null", async () => {
		baseDeps.search.mockResolvedValue([
			{ title: "Result", url: "https://example.com", description: "desc" },
		]);
		baseDeps.fetchPages.mockResolvedValue(["Some text"]);
		baseDeps.extractDossier.mockResolvedValue(null);

		const result = await handleEnrichment(
			{ profileId: "p-1", entityType: "person", canonicalName: "John Smith" },
			baseDeps,
		);

		expect(result.enriched).toBe(false);
		expect(result.outcome).toBe("failed");
		expect(baseDeps.repository.markFailed).toHaveBeenCalledWith("p-1");
	});

	it("should mark failed when search throws", async () => {
		baseDeps.search.mockRejectedValue(new Error("Brave API error"));

		const result = await handleEnrichment(
			{ profileId: "p-1", entityType: "person", canonicalName: "John Smith" },
			baseDeps,
		);

		expect(result.enriched).toBe(false);
		expect(result.outcome).toBe("failed");
		expect(baseDeps.repository.markFailed).toHaveBeenCalledWith("p-1");
		expect(baseDeps.logger.error).toHaveBeenCalled();
	});
});
