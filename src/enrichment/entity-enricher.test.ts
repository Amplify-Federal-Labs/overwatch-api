import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntityEnricher } from "./entity-enricher";
import type { PendingEntity } from "../db/discovered-entity-repository";
import type { DossierExtractionResult } from "./dossier-extractor";

const mockFindPending = vi.fn();
const mockUpdateStatus = vi.fn();
const mockInsertEnriched = vi.fn();
const mockBraveSearch = vi.fn();
const mockFetchPageText = vi.fn();
const mockExtract = vi.fn();

const mockFindFailed = vi.fn();

vi.mock("../db/discovered-entity-repository", () => ({
	DiscoveredEntityRepository: class {
		findPending = mockFindPending;
		findFailed = mockFindFailed;
		updateStatus = mockUpdateStatus;
	},
}));

vi.mock("../db/stakeholder-repository", () => ({
	D1StakeholderRepository: class {
		insertEnriched = mockInsertEnriched;
	},
	// Keep the rest
	MockStakeholderRepository: class {},
	StakeholderRecord: {},
}));

vi.mock("./brave-searcher", () => ({
	braveSearch: (...args: unknown[]) => mockBraveSearch(...args),
	buildSearchQuery: (name: string, type: string) => `"${name}" site:${type}`,
}));

vi.mock("./page-fetcher", () => ({
	fetchPageText: (...args: unknown[]) => mockFetchPageText(...args),
}));

vi.mock("./dossier-extractor", () => ({
	DossierExtractor: class {
		extract = mockExtract;
	},
}));

const PENDING_PERSON: PendingEntity = {
	id: 1,
	signalId: "signal-123",
	type: "person",
	value: "Col. Sarah Kim",
	confidence: 0.9,
	signalRelevance: 85,
};

const PENDING_AGENCY: PendingEntity = {
	id: 2,
	signalId: "signal-456",
	type: "agency",
	value: "Space Force Delta 6",
	confidence: 0.85,
	signalRelevance: 90,
};

const DOSSIER_RESULT: DossierExtractionResult = {
	name: "Col. Sarah Kim",
	title: "Director of Cloud Ops",
	org: "AFLCMC",
	branch: "Air Force",
	programs: ["Cloud One"],
	focusAreas: ["cloud migration"],
	rank: "Colonel",
	education: ["MIT"],
	careerHistory: [{ role: "Director", org: "AFLCMC", years: "2022-present" }],
	confidence: "high",
};

describe("EntityEnricher", () => {
	const mockEnv = {
		DB: {} as D1Database,
		BRAVE_SEARCH_API_KEY: "test-brave-key",
		CF_AIG_TOKEN: "test-token",
		CF_AIG_BASEURL: "https://test.example.com",
		CF_AIG_MODEL: "test-model",
	} as Env;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("creates an instance with env", () => {
		const enricher = new EntityEnricher(mockEnv);
		expect(enricher).toBeInstanceOf(EntityEnricher);
	});

	it("returns zero counts when no pending entities", async () => {
		mockFindPending.mockResolvedValue([]);

		const enricher = new EntityEnricher(mockEnv);
		const result = await enricher.enrichPending();

		expect(result.entitiesProcessed).toBe(0);
		expect(result.entitiesEnriched).toBe(0);
		expect(result.entitiesFailed).toBe(0);
	});

	it("searches, fetches pages, extracts dossier, and stores stakeholder", async () => {
		mockFindPending.mockResolvedValue([PENDING_PERSON]);
		mockBraveSearch.mockResolvedValue([
			{ title: "Bio", url: "https://af.mil/bio/kim", description: "Official bio" },
			{ title: "Event", url: "https://afcea.org/event", description: "Speaker" },
		]);
		mockFetchPageText
			.mockResolvedValueOnce("Col. Sarah Kim serves as Director...")
			.mockResolvedValueOnce("Col. Kim spoke about Cloud One...");
		mockExtract.mockResolvedValue(DOSSIER_RESULT);
		mockInsertEnriched.mockResolvedValue("stakeholder-id-1");
		mockUpdateStatus.mockResolvedValue(undefined);

		const enricher = new EntityEnricher(mockEnv);
		const result = await enricher.enrichPending();

		expect(result.entitiesProcessed).toBe(1);
		expect(result.entitiesEnriched).toBe(1);
		expect(result.entitiesFailed).toBe(0);

		// Verify brave search was called with API key and query
		expect(mockBraveSearch).toHaveBeenCalledWith(
			fetch,
			"test-brave-key",
			'"Col. Sarah Kim" site:person',
		);

		// Verify pages were fetched
		expect(mockFetchPageText).toHaveBeenCalledTimes(2);

		// Verify dossier was extracted
		expect(mockExtract).toHaveBeenCalledOnce();

		// Verify stakeholder was stored
		expect(mockInsertEnriched).toHaveBeenCalledWith({
			dossier: DOSSIER_RESULT,
			discoveredEntityId: 1,
			signalId: "signal-123",
			bioSourceUrl: "https://af.mil/bio/kim",
			entityType: "person",
		});

		// Verify status updated to enriched
		expect(mockUpdateStatus).toHaveBeenCalledWith(1, "enriched");
	});

	it("skips pages that return null and still extracts dossier", async () => {
		mockFindPending.mockResolvedValue([PENDING_PERSON]);
		mockBraveSearch.mockResolvedValue([
			{ title: "Bio", url: "https://af.mil/bio/kim", description: "Bio" },
			{ title: "PDF", url: "https://example.com/file.pdf", description: "PDF" },
		]);
		mockFetchPageText
			.mockResolvedValueOnce("Col. Kim bio text...")
			.mockResolvedValueOnce(null); // PDF skipped
		mockExtract.mockResolvedValue(DOSSIER_RESULT);
		mockInsertEnriched.mockResolvedValue("id");
		mockUpdateStatus.mockResolvedValue(undefined);

		const enricher = new EntityEnricher(mockEnv);
		await enricher.enrichPending();

		// Should only pass one page content to extractor
		const extractCall = mockExtract.mock.calls[0][0];
		expect(extractCall.pageContents).toHaveLength(1);
	});

	it("marks entity as failed when no search results found", async () => {
		mockFindPending.mockResolvedValue([PENDING_PERSON]);
		mockBraveSearch.mockResolvedValue([]);
		mockUpdateStatus.mockResolvedValue(undefined);

		const enricher = new EntityEnricher(mockEnv);
		const result = await enricher.enrichPending();

		expect(result.entitiesEnriched).toBe(0);
		expect(result.entitiesFailed).toBe(1);
		expect(mockUpdateStatus).toHaveBeenCalledWith(1, "failed");
	});

	it("marks entity as failed when all page fetches return null", async () => {
		mockFindPending.mockResolvedValue([PENDING_PERSON]);
		mockBraveSearch.mockResolvedValue([
			{ title: "Result", url: "https://example.com", description: "Desc" },
		]);
		mockFetchPageText.mockResolvedValue(null);
		mockUpdateStatus.mockResolvedValue(undefined);

		const enricher = new EntityEnricher(mockEnv);
		const result = await enricher.enrichPending();

		expect(result.entitiesFailed).toBe(1);
		expect(mockUpdateStatus).toHaveBeenCalledWith(1, "failed");
	});

	it("continues processing other entities when one fails", async () => {
		mockFindPending.mockResolvedValue([PENDING_PERSON, PENDING_AGENCY]);
		// Person: search fails
		mockBraveSearch
			.mockResolvedValueOnce([])
			// Agency: search succeeds
			.mockResolvedValueOnce([
				{ title: "Delta 6", url: "https://spaceforce.mil/delta6", description: "Unit" },
			]);
		mockFetchPageText.mockResolvedValue("Space Force Delta 6 is a unit...");
		mockExtract.mockResolvedValue({ ...DOSSIER_RESULT, name: "Space Force Delta 6" });
		mockInsertEnriched.mockResolvedValue("id");
		mockUpdateStatus.mockResolvedValue(undefined);

		const enricher = new EntityEnricher(mockEnv);
		const result = await enricher.enrichPending();

		expect(result.entitiesProcessed).toBe(2);
		expect(result.entitiesEnriched).toBe(1);
		expect(result.entitiesFailed).toBe(1);
	});

	describe("enrichFailed", () => {
		it("re-enriches entities with failed status", async () => {
			mockFindFailed.mockResolvedValue([PENDING_PERSON]);
			mockBraveSearch.mockResolvedValue([
				{ title: "Bio", url: "https://af.mil/bio/kim", description: "Official bio" },
			]);
			mockFetchPageText.mockResolvedValue("Col. Sarah Kim serves as Director...");
			mockExtract.mockResolvedValue(DOSSIER_RESULT);
			mockInsertEnriched.mockResolvedValue("stakeholder-id-1");
			mockUpdateStatus.mockResolvedValue(undefined);

			const enricher = new EntityEnricher(mockEnv);
			const result = await enricher.enrichFailed();

			expect(result.entitiesProcessed).toBe(1);
			expect(result.entitiesEnriched).toBe(1);
			expect(result.entitiesFailed).toBe(0);
			expect(mockFindFailed).toHaveBeenCalledOnce();
			expect(mockFindPending).not.toHaveBeenCalled();
			expect(mockUpdateStatus).toHaveBeenCalledWith(1, "enriched");
		});

		it("returns zero counts when no failed entities", async () => {
			mockFindFailed.mockResolvedValue([]);

			const enricher = new EntityEnricher(mockEnv);
			const result = await enricher.enrichFailed();

			expect(result.entitiesProcessed).toBe(0);
			expect(result.entitiesEnriched).toBe(0);
			expect(result.entitiesFailed).toBe(0);
		});
	});

	it("marks entity as failed when extractor throws", async () => {
		mockFindPending.mockResolvedValue([PENDING_PERSON]);
		mockBraveSearch.mockResolvedValue([
			{ title: "Bio", url: "https://af.mil/bio", description: "Bio" },
		]);
		mockFetchPageText.mockResolvedValue("Some text");
		mockExtract.mockRejectedValue(new Error("LLM error"));
		mockUpdateStatus.mockResolvedValue(undefined);

		const enricher = new EntityEnricher(mockEnv);
		const result = await enricher.enrichPending();

		expect(result.entitiesFailed).toBe(1);
		expect(mockUpdateStatus).toHaveBeenCalledWith(1, "failed");
	});
});
