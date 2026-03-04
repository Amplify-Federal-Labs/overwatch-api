import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignalIngestor } from "./signal-ingestor";
import type { SignalAnalysisResult } from "../schemas";
import type { FpdsContractEntry } from "./fpds-contracts-parser";

const mockAnalyze = vi.fn();
const mockInsert = vi.fn();
const mockExistsBySourceLink = vi.fn();
const mockFetchFpdsContracts = vi.fn();
const mockEntriesToSignals = vi.fn();

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

vi.mock("./fpds-contracts-fetcher", () => ({
	fetchFpdsContracts: (...args: unknown[]) => mockFetchFpdsContracts(...args),
}));

vi.mock("./fpds-contracts-parser", () => ({
	entriesToSignals: (...args: unknown[]) => mockEntriesToSignals(...args),
}));

function makeEnv(overrides?: Partial<Env>): Env {
	return {
		DB: {} as D1Database,
		CF_AIG_TOKEN: "test-token",
		CF_AIG_BASEURL: "https://test.example.com",
		CF_AIG_MODEL: "test-model",
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
		mockExistsBySourceLink.mockResolvedValue(false);
		mockFetchFpdsContracts.mockResolvedValue([]);
		mockEntriesToSignals.mockReturnValue([]);
	});

	it("should return an ingestion result with sources and signals counts", async () => {
		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest();

		expect(result).toHaveProperty("sourcesChecked");
		expect(result).toHaveProperty("signalsFound");
		expect(result).toHaveProperty("signalsAnalyzed");
		expect(result).toHaveProperty("startedAt");
		expect(typeof result.sourcesChecked).toBe("number");
		expect(typeof result.signalsFound).toBe("number");
		expect(typeof result.signalsAnalyzed).toBe("number");
		expect(typeof result.startedAt).toBe("string");
	});

	it("should check all registered source types", async () => {
		const ingestor = new SignalIngestor(makeEnv());
		const result = await ingestor.ingest();

		// Should attempt to check all 3 source types: sam_gov, rss, fpds
		expect(result.sourcesChecked).toBe(3);
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

	it("should not persist when analysis fails", async () => {
		mockAnalyze.mockRejectedValue(new Error("AI failed"));
		mockFetchFpdsContracts.mockResolvedValue([makeFpdsEntry()]);
		mockEntriesToSignals.mockReturnValue([makeSignalInput("fpds://1")]);

		const ingestor = new SignalIngestor(makeEnv());
		await ingestor.ingest();

		expect(mockInsert).not.toHaveBeenCalled();
	});
});
