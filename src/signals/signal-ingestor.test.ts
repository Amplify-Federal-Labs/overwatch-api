import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignalIngestor } from "./signal-ingestor";
import type { SignalAnalysisResult } from "../schemas";
import type { FpdsContractEntry } from "./fpds/fpds-contracts-parser";

const mockAnalyze = vi.fn();
const mockInsert = vi.fn();
const mockExistsBySourceLink = vi.fn();
const mockFetchFpdsContracts = vi.fn();
const mockEntriesToSignals = vi.fn();
const mockFetchRssFeed = vi.fn();
const mockRssItemsToSignals = vi.fn();
const mockFetchSamGovOpportunities = vi.fn();
const mockFetchApbiEvents = vi.fn();
const mockOpportunitiesToSignals = vi.fn();
const mockMatch = vi.fn();
const mockInsertMany = vi.fn();

vi.mock("./signal-analyzer", () => ({
	SignalAnalyzer: class MockSignalAnalyzer {
		analyze = mockAnalyze;
	},
}));

vi.mock("../db/signal-repository", () => ({
	SignalRepository: class MockSignalRepository {
		insert = mockInsert;
		existsBySourceLink = mockExistsBySourceLink;
	},
}));

vi.mock("../db/discovered-entity-repository", () => ({
	DiscoveredEntityRepository: class {
		insertMany = mockInsertMany;
	},
}));

vi.mock("../db/stakeholder-repository", () => ({
	MockStakeholderRepository: class {},
}));

vi.mock("./stakeholder-matcher", () => ({
	StakeholderMatcher: class {
		match = mockMatch;
	},
}));

vi.mock("./fpds/fpds-contracts-fetcher", () => ({
	fetchFpdsContracts: (...args: unknown[]) => mockFetchFpdsContracts(...args),
}));

vi.mock("./fpds/fpds-contracts-parser", () => ({
	entriesToSignals: (...args: unknown[]) => mockEntriesToSignals(...args),
}));

vi.mock("./rss/rss-fetcher", () => ({
	fetchRssFeed: (...args: unknown[]) => mockFetchRssFeed(...args),
}));

vi.mock("./rss/rss-parser", () => ({
	rssItemsToSignals: (...args: unknown[]) => mockRssItemsToSignals(...args),
}));

vi.mock("./sam-gov/sam-gov-fetcher", () => ({
	fetchSamGovOpportunities: (...args: unknown[]) => mockFetchSamGovOpportunities(...args),
	fetchApbiEvents: (...args: unknown[]) => mockFetchApbiEvents(...args),
}));

vi.mock("./sam-gov/sam-gov-parser", () => ({
	opportunitiesToSignals: (...args: unknown[]) => mockOpportunitiesToSignals(...args),
}));

function makeEnv(overrides?: Partial<Env>): Env {
	return {
		DB: {} as D1Database,
		CF_AIG_TOKEN: "test-token",
		CF_AIG_BASEURL: "https://test.example.com",
		CF_AIG_MODEL: "test-model",
		BRAVE_SEARCH_API_KEY: "test-brave-key",
		SAM_GOV_API_KEY: "test-sam-key",
		LOG_LEVEL: "ERROR",
		...overrides,
	};
}

function makeFpdsEntry(overrides?: Partial<FpdsContractEntry>): FpdsContractEntry {
	return {
		piid: "0001",
		modNumber: "0",
		agencyId: "9700",
		agencyName: "DEPT OF THE ARMY",
		vendorName: "VENDOR A",
		obligatedAmount: "1000",
		totalObligatedAmount: "1000",
		...overrides,
	};
}

function makeSignalInput(sourceLink: string) {
	return {
		content: "Test content",
		sourceType: "fpds" as const,
		sourceName: "FPDS",
		sourceLink,
	};
}

function makeRssSignalInput(sourceLink: string) {
	return {
		content: "RSS content",
		sourceType: "rss" as const,
		sourceName: "GovConWire",
		sourceLink,
	};
}

const MOCK_ANALYSIS_RESULT: SignalAnalysisResult = {
	title: "Navy Cloud Migration RFI",
	summary: "NIWC PAC seeks industry input.",
	type: "opportunity",
	branch: "Navy",
	tags: ["IL5"],
	competencies: ["B"],
	play: "classifiedai",
	relevance: 92,
	entities: [],
};

describe("SignalIngestor.ingest", () => {
	beforeEach(() => {
		mockAnalyze.mockReset();
		mockInsert.mockReset();
		mockExistsBySourceLink.mockReset();
		mockFetchFpdsContracts.mockReset();
		mockEntriesToSignals.mockReset();
		mockFetchRssFeed.mockReset();
		mockRssItemsToSignals.mockReset();
		mockFetchSamGovOpportunities.mockReset();
		mockFetchApbiEvents.mockReset();
		mockOpportunitiesToSignals.mockReset();
		mockMatch.mockReset();
		mockInsertMany.mockReset();
		mockExistsBySourceLink.mockResolvedValue(false);
		mockFetchFpdsContracts.mockResolvedValue([]);
		mockEntriesToSignals.mockReturnValue([]);
		mockFetchRssFeed.mockResolvedValue([]);
		mockRssItemsToSignals.mockReturnValue([]);
		mockFetchSamGovOpportunities.mockResolvedValue([]);
		mockFetchApbiEvents.mockResolvedValue([]);
		mockOpportunitiesToSignals.mockReturnValue([]);
		mockMatch.mockResolvedValue({ matchedIds: [], discoveredEntities: [] });
		mockInsertMany.mockResolvedValue(0);
	});

	it("should return an ingestion result with sources and signals counts", async () => {
		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest();

		expect(result).toHaveProperty("sourcesChecked");
		expect(result).toHaveProperty("signalsFound");
		expect(result).toHaveProperty("signalsAnalyzed");
		expect(result).toHaveProperty("signalsMatched");
		expect(result).toHaveProperty("entitiesDiscovered");
		expect(result).toHaveProperty("startedAt");
		expect(typeof result.sourcesChecked).toBe("number");
		expect(typeof result.signalsFound).toBe("number");
		expect(typeof result.signalsAnalyzed).toBe("number");
		expect(typeof result.signalsMatched).toBe("number");
		expect(typeof result.entitiesDiscovered).toBe("number");
		expect(typeof result.startedAt).toBe("string");
	});

	it("should check all registered source types", async () => {
		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest();

		// Should attempt to check all 4 source types: sam_gov, sam_gov_apbi, rss, fpds
		expect(result.sourcesChecked).toBe(4);
	});

	it("should analyze each fetched signal via SignalAnalyzer", async () => {
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);
		const entries = [makeFpdsEntry()];
		mockFetchFpdsContracts.mockResolvedValue(entries);
		mockEntriesToSignals.mockReturnValue([makeSignalInput("fpds://NONE_9700_0001_0")]);

		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest();

		expect(mockEntriesToSignals).toHaveBeenCalledWith(entries);
		expect(result.signalsFound).toBe(1);
		expect(result.signalsAnalyzed).toBe(1);
		expect(mockAnalyze).toHaveBeenCalledTimes(1);
	});

	it("should continue analyzing remaining signals when one analysis fails", async () => {
		mockAnalyze
			.mockRejectedValueOnce(new Error("AI analysis failed"))
			.mockResolvedValueOnce(MOCK_ANALYSIS_RESULT);
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry({ piid: "A" }), makeFpdsEntry({ piid: "B" })]);
		mockEntriesToSignals.mockReturnValue([
			makeSignalInput("fpds://1"),
			makeSignalInput("fpds://2"),
		]);

		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest();

		expect(result.signalsFound).toBe(2);
		expect(result.signalsAnalyzed).toBe(1);
		expect(mockAnalyze).toHaveBeenCalledTimes(2);
	});

	it("should persist each successfully analyzed signal via repository", async () => {
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);
		mockInsert.mockResolvedValue("fake-id");
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry()]);
		mockEntriesToSignals.mockReturnValue([makeSignalInput("fpds://1")]);

		const ingestor = new SignalIngestor(makeEnv());
		await ingestor.ingest();

		expect(mockInsert).toHaveBeenCalledTimes(1);
		expect(mockInsert.mock.calls[0][0]).toMatchObject({ sourceType: "fpds" });
		expect(mockInsert.mock.calls[0][1]).toMatchObject({ title: "Navy Cloud Migration RFI" });
	});

	it("should skip analysis for signals already in the database", async () => {
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);
		mockInsert.mockResolvedValue("new-id");
		mockExistsBySourceLink
			.mockResolvedValueOnce(true)
			.mockResolvedValueOnce(false);
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry({ piid: "A" }), makeFpdsEntry({ piid: "B" })]);
		mockEntriesToSignals.mockReturnValue([
			makeSignalInput("fpds://1"),
			makeSignalInput("fpds://2"),
		]);

		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest();

		expect(result.signalsFound).toBe(2);
		expect(result.signalsAnalyzed).toBe(1);
		expect(mockAnalyze).toHaveBeenCalledTimes(1);
		expect(mockInsert).toHaveBeenCalledTimes(1);
	});

	it("should pass sourceMetadata through to repository.insert", async () => {
		const metadata = {
			sourceType: "fpds" as const,
			piid: "0001",
			modNumber: "0",
			agencyId: "9700",
			agencyName: "DEPT OF THE ARMY",
			vendorName: "VENDOR A",
			obligatedAmount: "1000",
			totalObligatedAmount: "1000",
		};
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);
		mockInsert.mockResolvedValue("fake-id");
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry()]);
		mockEntriesToSignals.mockReturnValue([{
			...makeSignalInput("fpds://1"),
			sourceMetadata: metadata,
		}]);

		const ingestor = new SignalIngestor(makeEnv());
		await ingestor.ingest();

		expect(mockInsert).toHaveBeenCalledTimes(1);
		expect(mockInsert.mock.calls[0][0].sourceMetadata).toEqual(metadata);
	});

	it("should not persist when analysis fails", async () => {
		mockAnalyze.mockRejectedValue(new Error("AI failed"));
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry()]);
		mockEntriesToSignals.mockReturnValue([makeSignalInput("fpds://1")]);

		const ingestor = new SignalIngestor(makeEnv());
		await ingestor.ingest();

		expect(mockInsert).not.toHaveBeenCalled();
	});

	it("should fetch and convert all configured RSS feeds", async () => {
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);
		mockFetchRssFeed.mockResolvedValue([{ title: "Article" }]);
		mockRssItemsToSignals.mockReturnValue([makeRssSignalInput("https://example.com/a")]);

		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest();

		expect(mockFetchRssFeed).toHaveBeenCalledWith(
			expect.anything(),
			"https://www.govconwire.com/feed",
			expect.anything(),
		);
		expect(mockFetchRssFeed).toHaveBeenCalledWith(
			expect.anything(),
			"https://fedscoop.com/feed/",
			expect.anything(),
		);
		expect(mockRssItemsToSignals).toHaveBeenCalledWith(
			[{ title: "Article" }],
			"GovConWire",
		);
		expect(mockRssItemsToSignals).toHaveBeenCalledWith(
			[{ title: "Article" }],
			"FedScoop",
		);
		expect(result.signalsFound).toBe(2);
		expect(result.signalsAnalyzed).toBe(2);
	});

	it("should pass analysis entities and relevance to stakeholder matcher", async () => {
		const analysisResult = {
			...MOCK_ANALYSIS_RESULT,
			entities: [{ type: "agency" as const, value: "NIWC Pacific", confidence: 0.95 }],
			relevance: 92,
		};
		mockAnalyze.mockResolvedValue(analysisResult);
		mockMatch.mockResolvedValue({ matchedIds: ["st2", "st4"], discoveredEntities: [] });
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry()]);
		mockEntriesToSignals.mockReturnValue([makeSignalInput("fpds://1")]);

		const ingestor = new SignalIngestor(makeEnv());
		await ingestor.ingest();

		expect(mockMatch).toHaveBeenCalledWith(analysisResult.entities, 92);
	});

	it("should pass matched stakeholder IDs to repository insert", async () => {
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);
		mockMatch.mockResolvedValue({ matchedIds: ["st2", "st4"], discoveredEntities: [] });
		mockInsert.mockResolvedValue("fake-id");
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry()]);
		mockEntriesToSignals.mockReturnValue([makeSignalInput("fpds://1")]);

		const ingestor = new SignalIngestor(makeEnv());
		await ingestor.ingest();

		expect(mockInsert).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			["st2", "st4"],
		);
	});

	it("should count signals with stakeholder matches", async () => {
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);
		mockMatch
			.mockResolvedValueOnce({ matchedIds: ["st2"], discoveredEntities: [] })
			.mockResolvedValueOnce({ matchedIds: [], discoveredEntities: [] });
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry({ piid: "A" }), makeFpdsEntry({ piid: "B" })]);
		mockEntriesToSignals.mockReturnValue([
			makeSignalInput("fpds://1"),
			makeSignalInput("fpds://2"),
		]);

		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest();

		expect(result.signalsMatched).toBe(1);
	});

	it("should persist discovered entities via DiscoveredEntityRepository", async () => {
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);
		mockInsert.mockResolvedValue("signal-abc");
		const discoveredEntities = [
			{ type: "person", value: "Gen. Kim", confidence: 0.9, signalRelevance: 85 },
			{ type: "agency", value: "Space Force", confidence: 0.8, signalRelevance: 85 },
		];
		mockMatch.mockResolvedValue({
			matchedIds: [],
			discoveredEntities,
		});
		mockInsertMany.mockResolvedValue(2);
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry()]);
		mockEntriesToSignals.mockReturnValue([makeSignalInput("fpds://1")]);

		const ingestor = new SignalIngestor(makeEnv());
		await ingestor.ingest();

		expect(mockInsertMany).toHaveBeenCalledWith("signal-abc", discoveredEntities);
	});

	it("should count discovered entities across all signals", async () => {
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);
		mockInsert.mockResolvedValue("signal-id");
		mockMatch
			.mockResolvedValueOnce({
				matchedIds: [],
				discoveredEntities: [
					{ type: "person", value: "Gen. Kim", confidence: 0.9, signalRelevance: 85 },
					{ type: "agency", value: "Space Force", confidence: 0.8, signalRelevance: 85 },
				],
			})
			.mockResolvedValueOnce({
				matchedIds: [],
				discoveredEntities: [
					{ type: "person", value: "Col. Smith", confidence: 0.85, signalRelevance: 90 },
				],
			});
		mockInsertMany
			.mockResolvedValueOnce(2)
			.mockResolvedValueOnce(1);
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry({ piid: "A" }), makeFpdsEntry({ piid: "B" })]);
		mockEntriesToSignals.mockReturnValue([
			makeSignalInput("fpds://1"),
			makeSignalInput("fpds://2"),
		]);

		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest();

		expect(result.entitiesDiscovered).toBe(3);
	});

	it("should not call insertMany when there are no discovered entities", async () => {
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);
		mockMatch.mockResolvedValue({ matchedIds: [], discoveredEntities: [] });
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry()]);
		mockEntriesToSignals.mockReturnValue([makeSignalInput("fpds://1")]);

		const ingestor = new SignalIngestor(makeEnv());
		await ingestor.ingest();

		expect(mockInsertMany).not.toHaveBeenCalled();
	});

	it("should only fetch FPDS when sources is ['fpds']", async () => {
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry()]);
		mockEntriesToSignals.mockReturnValue([makeSignalInput("fpds://1")]);

		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest(["fpds"]);

		expect(result.sourcesChecked).toBe(1);
		expect(mockFetchFpdsContracts).toHaveBeenCalledTimes(1);
		expect(mockFetchRssFeed).not.toHaveBeenCalled();
	});

	it("should only fetch RSS when sources is ['rss']", async () => {
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);
		mockFetchRssFeed.mockResolvedValue([{ title: "Article" }]);
		mockRssItemsToSignals.mockReturnValue([makeRssSignalInput("https://example.com/a")]);

		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest(["rss"]);

		expect(result.sourcesChecked).toBe(1);
		expect(mockFetchRssFeed).toHaveBeenCalled();
		expect(mockFetchFpdsContracts).not.toHaveBeenCalled();
	});

	it("should fetch all sources when no filter is provided", async () => {
		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest();

		expect(result.sourcesChecked).toBe(4);
	});

	it("should fetch and convert SAM.gov opportunities when sources includes sam_gov", async () => {
		const samOpps = [{ noticeId: "opp001", title: "Cloud Migration" }];
		mockFetchSamGovOpportunities.mockResolvedValue(samOpps);
		mockOpportunitiesToSignals.mockReturnValue([{
			content: "SAM.gov Opportunity — Solicitation\nCloud Migration",
			sourceType: "sam_gov" as const,
			sourceName: "SAM.gov",
			sourceLink: "sam://opp001",
			sourceUrl: "https://sam.gov/opp/opp001/view",
		}]);
		mockAnalyze.mockResolvedValue(MOCK_ANALYSIS_RESULT);

		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest(["sam_gov"]);

		expect(result.sourcesChecked).toBe(1);
		expect(mockFetchSamGovOpportunities).toHaveBeenCalledWith(
			expect.anything(),
			"test-sam-key",
			expect.anything(),
		);
		expect(mockOpportunitiesToSignals).toHaveBeenCalledWith(samOpps);
		expect(result.signalsFound).toBe(1);
		expect(result.signalsAnalyzed).toBe(1);
	});

	it("should not fetch SAM.gov when sources filter excludes it", async () => {
		const ingestor = new SignalIngestor(makeEnv());
		await ingestor.ingest(["fpds"]);

		expect(mockFetchSamGovOpportunities).not.toHaveBeenCalled();
	});
});
