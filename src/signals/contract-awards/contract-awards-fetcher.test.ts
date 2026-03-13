import { describe, it, expect, vi } from "vitest";
import { fetchContractAwards, buildContractAwardsUrl } from "./contract-awards-fetcher";
import { Logger } from "../../logger";

const logger = new Logger("ERROR");

function makeRecord(piid: string, vendorName: string, agencyName: string) {
	return {
		contractId: {
			subtier: { code: "9700", name: "DEPT OF DEFENSE" },
			piid,
			modificationNumber: "0",
		},
		coreData: {
			federalOrganization: {
				contractingInformation: {
					contractingSubtier: { code: "2100", name: agencyName },
				},
			},
		},
		awardDetails: {
			dollars: { actionObligation: "1000" },
			totalContractDollars: { totalActionObligation: "1000" },
			awardeeData: {
				awardeeHeader: { awardeeName: vendorName },
			},
		},
	};
}

const SAMPLE_RESPONSE = {
	totalRecords: "1",
	limit: "100",
	offset: "0",
	awardSummary: [
		{
			contractId: {
				subtier: { code: "9700", name: "DEPT OF DEFENSE" },
				piid: "0001",
				modificationNumber: "15",
				referencedIDVPiid: "W911W617D0001",
				transactionNumber: "0",
			},
			coreData: {
				federalOrganization: {
					contractingInformation: {
						contractingSubtier: { code: "2100", name: "DEPT OF THE ARMY" },
					},
				},
			},
			awardDetails: {
				dollars: { actionObligation: "0.00" },
				totalContractDollars: { totalActionObligation: "38847444.67" },
				awardeeData: {
					awardeeHeader: { awardeeName: "PIASECKI AIRCRAFT CORPORATION" },
				},
			},
		},
	],
};

const EMPTY_RESPONSE = { totalRecords: "0", awardSummary: [] };

describe("buildContractAwardsUrl", () => {
	it("should build URL with api_key, lastModifiedDate, contractingDepartmentCode, and limit", () => {
		const url = buildContractAwardsUrl("test-key", 0);

		expect(url).toContain("https://api.sam.gov/contract-awards/v1/search");
		expect(url).toContain("api_key=test-key");
		expect(url).toContain("contractingDepartmentCode=9700");
		expect(url).toContain("limit=100");
		expect(url).toContain("offset=0");
		expect(url).toContain("lastModifiedDate=");
	});

	it("should use provided offset", () => {
		const url = buildContractAwardsUrl("test-key", 100);
		expect(url).toContain("offset=100");
	});
});

describe("fetchContractAwards", () => {
	it("should fetch JSON and return ContractAwardEntry array", async () => {
		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }));

		const entries = await fetchContractAwards(mockFetch, "test-key", logger);

		expect(entries).toHaveLength(1);
		expect(entries[0].piid).toBe("0001");
		expect(entries[0].agencyName).toBe("DEPT OF THE ARMY");
		expect(entries[0].vendorName).toBe("PIASECKI AIRCRAFT CORPORATION");
	});

	it("should paginate when first page returns full results", async () => {
		const fullPage = {
			totalRecords: "150",
			awardSummary: Array.from({ length: 100 }, (_, i) =>
				makeRecord(`PIID-${i}`, `VENDOR-${i}`, "ARMY"),
			),
		};
		const partialPage = {
			totalRecords: "150",
			awardSummary: Array.from({ length: 50 }, (_, i) =>
				makeRecord(`PIID-${100 + i}`, `VENDOR-${100 + i}`, "ARMY"),
			),
		};

		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(fullPage), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(partialPage), { status: 200 }));

		const entries = await fetchContractAwards(mockFetch, "test-key", logger);

		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(entries).toHaveLength(150);
	});

	it("should stop paginating after max pages", async () => {
		const fullPage = (offset: number) => ({
			totalRecords: "1000",
			awardSummary: Array.from({ length: 100 }, (_, i) =>
				makeRecord(`PIID-${offset + i}`, "VENDOR", "ARMY"),
			),
		});

		const mockFetch = vi.fn();
		for (let i = 0; i < 5; i++) {
			mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(fullPage(i * 100)), { status: 200 }));
		}

		const entries = await fetchContractAwards(mockFetch, "test-key", logger);

		// MAX_PAGES is 5
		expect(mockFetch).toHaveBeenCalledTimes(5);
		expect(entries).toHaveLength(500);
	});

	it("should return empty array when fetch fails", async () => {
		const mockFetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

		const entries = await fetchContractAwards(mockFetch, "test-key", logger);
		expect(entries).toEqual([]);
	});

	it("should return empty array when API returns non-200", async () => {
		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

		const entries = await fetchContractAwards(mockFetch, "test-key", logger);
		expect(entries).toEqual([]);
	});

	it("should return empty array when API returns empty data", async () => {
		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(EMPTY_RESPONSE), { status: 200 }));

		const entries = await fetchContractAwards(mockFetch, "test-key", logger);
		expect(entries).toEqual([]);
	});
});
