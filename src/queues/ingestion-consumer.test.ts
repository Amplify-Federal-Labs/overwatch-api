import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleIngestion } from "./ingestion-consumer";
import type { SignalAnalysisInput } from "../schemas";

describe("ingestion-consumer", () => {
	const mockQueue = {
		send: vi.fn().mockResolvedValue(undefined),
	};

	const baseDeps = {
		extractionQueue: mockQueue,
		repository: {
			insertIngestedItem: vi.fn(),
		},
		fetchers: {
			rss: vi.fn(),
			sam_gov: vi.fn(),
			contract_awards: vi.fn(),
		},
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should fetch items from the given source and insert them", async () => {
		const items: SignalAnalysisInput[] = [
			{ content: "SAM.gov opp 1", sourceType: "sam_gov", sourceName: "SAM.gov", sourceLink: "https://sam.gov/1" },
			{ content: "SAM.gov opp 2", sourceType: "sam_gov", sourceName: "SAM.gov", sourceLink: "https://sam.gov/2" },
		];
		baseDeps.fetchers.sam_gov.mockResolvedValue(items);
		baseDeps.repository.insertIngestedItem
			.mockResolvedValueOnce("item-1")
			.mockResolvedValueOnce("item-2");

		const result = await handleIngestion("sam_gov", baseDeps);

		expect(baseDeps.fetchers.sam_gov).toHaveBeenCalledOnce();
		expect(baseDeps.repository.insertIngestedItem).toHaveBeenCalledTimes(2);
		expect(result.itemsFetched).toBe(2);
		expect(result.itemsStored).toBe(2);
	});

	it("should produce one extraction message per newly stored item", async () => {
		const items: SignalAnalysisInput[] = [
			{ content: "Item 1", sourceType: "rss", sourceName: "GovConWire", sourceLink: "https://gcw.com/1" },
			{ content: "Item 2", sourceType: "rss", sourceName: "GovConWire", sourceLink: "https://gcw.com/2" },
		];
		baseDeps.fetchers.rss.mockResolvedValue(items);
		baseDeps.repository.insertIngestedItem
			.mockResolvedValueOnce("item-1")
			.mockResolvedValueOnce("item-2");

		await handleIngestion("rss", baseDeps);

		expect(mockQueue.send).toHaveBeenCalledTimes(2);
		expect(mockQueue.send).toHaveBeenCalledWith({
			type: "extraction",
			ingestedItemId: "item-1",
		});
		expect(mockQueue.send).toHaveBeenCalledWith({
			type: "extraction",
			ingestedItemId: "item-2",
		});
	});

	it("should skip duplicates and not produce extraction messages for them", async () => {
		const items: SignalAnalysisInput[] = [
			{ content: "New item", sourceType: "contract_awards", sourceName: "SAM.gov Contract Awards", sourceLink: "contract-award://1" },
			{ content: "Duplicate", sourceType: "contract_awards", sourceName: "SAM.gov Contract Awards", sourceLink: "contract-award://2" },
		];
		baseDeps.fetchers.contract_awards.mockResolvedValue(items);
		baseDeps.repository.insertIngestedItem
			.mockResolvedValueOnce("item-1")
			.mockResolvedValueOnce(null); // duplicate

		const result = await handleIngestion("contract_awards", baseDeps);

		expect(result.itemsStored).toBe(1);
		expect(result.itemsSkipped).toBe(1);
		expect(mockQueue.send).toHaveBeenCalledTimes(1);
	});

	it("should continue processing when one item fails insertion", async () => {
		const items: SignalAnalysisInput[] = [
			{ content: "Item 1", sourceType: "rss", sourceName: "GovConWire", sourceLink: "https://gcw.com/1" },
			{ content: "Item 2", sourceType: "rss", sourceName: "GovConWire", sourceLink: "https://gcw.com/2" },
		];
		baseDeps.fetchers.rss.mockResolvedValue(items);
		baseDeps.repository.insertIngestedItem
			.mockRejectedValueOnce(new Error("D1 error"))
			.mockResolvedValueOnce("item-2");

		const result = await handleIngestion("rss", baseDeps);

		expect(result.itemsStored).toBe(1);
		expect(result.itemsFailed).toBe(1);
		expect(mockQueue.send).toHaveBeenCalledTimes(1);
	});

	it("should return zero counts when fetcher returns empty", async () => {
		baseDeps.fetchers.sam_gov.mockResolvedValue([]);

		const result = await handleIngestion("sam_gov", baseDeps);

		expect(result.itemsFetched).toBe(0);
		expect(result.itemsStored).toBe(0);
		expect(mockQueue.send).not.toHaveBeenCalled();
	});
});
