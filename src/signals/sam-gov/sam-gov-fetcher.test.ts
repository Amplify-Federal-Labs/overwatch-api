import { describe, it, expect, vi } from "vitest";
import { fetchSamGovOpportunities, fetchApbiEvents, buildSamGovUrl, buildApbiUrl, APBI_KEYWORDS } from "./sam-gov-fetcher";
import { Logger } from "../../logger";

const logger = new Logger("ERROR");

const SAMPLE_RESPONSE = {
	totalRecords: 2,
	limit: 100,
	offset: 0,
	opportunitiesData: [
		{
			noticeId: "opp001",
			title: "Cloud Migration Services",
			solicitationNumber: "W911QX-26-R-0001",
			postedDate: "2026-03-01",
			type: "Solicitation",
			baseType: "Solicitation",
			active: "Yes",
			organizationName: "DEPT OF THE ARMY",
			pointOfContact: [],
			award: null,
		},
		{
			noticeId: "opp002",
			title: "DevSecOps Platform Support",
			solicitationNumber: "FA8621-26-R-0042",
			postedDate: "2026-03-02",
			type: "Sources Sought",
			baseType: "Sources Sought",
			active: "Yes",
			organizationName: "DEPT OF THE AIR FORCE",
			pointOfContact: [],
			award: null,
		},
	],
};

const EMPTY_RESPONSE = {
	totalRecords: 0,
	limit: 100,
	offset: 0,
	opportunitiesData: [],
};

describe("buildSamGovUrl", () => {
	it("includes api_key parameter", () => {
		const url = buildSamGovUrl("test-key");
		expect(url).toContain("api_key=test-key");
	});

	it("includes postedFrom and postedTo dates", () => {
		const url = buildSamGovUrl("test-key");
		expect(url).toMatch(/postedFrom=\d{2}%2F\d{2}%2F\d{4}/);
		expect(url).toMatch(/postedTo=\d{2}%2F\d{2}%2F\d{4}/);
	});

	it("includes procurement types for solicitations, sources sought, pre-sol, combined", () => {
		const url = buildSamGovUrl("test-key");
		expect(url).toContain("ptype=o%2Cr%2Cp%2Ck");
	});

	it("includes limit parameter", () => {
		const url = buildSamGovUrl("test-key");
		expect(url).toContain("limit=100");
	});

	it("includes offset parameter defaulting to 0", () => {
		const url = buildSamGovUrl("test-key");
		expect(url).toContain("offset=0");
	});

	it("accepts custom offset", () => {
		const url = buildSamGovUrl("test-key", 100);
		expect(url).toContain("offset=100");
	});

	it("targets SAM.gov production API", () => {
		const url = buildSamGovUrl("test-key");
		expect(url.startsWith("https://api.sam.gov/opportunities/v2/search?")).toBe(true);
	});

	it("filters by DoD organization name", () => {
		const url = buildSamGovUrl("test-key");
		expect(url).toContain("organizationName=Defense");
	});

	it("requests only active opportunities", () => {
		const url = buildSamGovUrl("test-key");
		expect(url).toContain("status=active");
	});
});

describe("APBI_KEYWORDS", () => {
	it("includes APBI-related terms", () => {
		expect(APBI_KEYWORDS).toContain("APBI");
		expect(APBI_KEYWORDS).toContain("Advance Planning Briefing");
		expect(APBI_KEYWORDS).toContain("Industry Day");
		expect(APBI_KEYWORDS).toContain("Industry Conference");
		expect(APBI_KEYWORDS).toContain("Forecast to Industry");
	});
});

describe("buildApbiUrl", () => {
	it("targets SAM.gov production API", () => {
		const url = buildApbiUrl("test-key");
		expect(url.startsWith("https://api.sam.gov/opportunities/v2/search?")).toBe(true);
	});

	it("uses Special Notice procurement type", () => {
		const url = buildApbiUrl("test-key");
		expect(url).toContain("ptype=s");
	});

	it("includes APBI keywords joined with OR", () => {
		const url = buildApbiUrl("test-key");
		const params = new URLSearchParams(url.split("?")[1]);
		const keyword = params.get("keyword");
		expect(keyword).toBeTruthy();
		for (const kw of APBI_KEYWORDS) {
			expect(keyword).toContain(kw);
		}
	});

	it("includes api_key parameter", () => {
		const url = buildApbiUrl("test-key");
		expect(url).toContain("api_key=test-key");
	});

	it("includes postedFrom and postedTo dates", () => {
		const url = buildApbiUrl("test-key");
		expect(url).toMatch(/postedFrom=\d{2}%2F\d{2}%2F\d{4}/);
		expect(url).toMatch(/postedTo=\d{2}%2F\d{2}%2F\d{4}/);
	});

	it("filters by DoD organization name", () => {
		const url = buildApbiUrl("test-key");
		expect(url).toContain("organizationName=Defense");
	});

	it("requests only active notices", () => {
		const url = buildApbiUrl("test-key");
		expect(url).toContain("status=active");
	});

	it("accepts custom offset", () => {
		const url = buildApbiUrl("test-key", 200);
		expect(url).toContain("offset=200");
	});
});

describe("fetchSamGovOpportunities", () => {
	it("fetches and returns parsed opportunities", async () => {
		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(EMPTY_RESPONSE), { status: 200 }));

		const opps = await fetchSamGovOpportunities(mockFetch, "test-key", logger);

		expect(opps).toHaveLength(2);
		expect(opps[0].noticeId).toBe("opp001");
		expect(opps[0].title).toBe("Cloud Migration Services");
		expect(opps[1].noticeId).toBe("opp002");
	});

	it("returns empty array when fetch fails", async () => {
		const mockFetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

		const opps = await fetchSamGovOpportunities(mockFetch, "test-key", logger);

		expect(opps).toEqual([]);
	});

	it("returns empty array when API returns non-200", async () => {
		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

		const opps = await fetchSamGovOpportunities(mockFetch, "test-key", logger);

		expect(opps).toEqual([]);
	});

	it("paginates through multiple pages", async () => {
		const page1 = {
			totalRecords: 150,
			limit: 100,
			offset: 0,
			opportunitiesData: Array.from({ length: 100 }, (_, i) => ({
				noticeId: `opp-${i}`,
				title: `Opportunity ${i}`,
				postedDate: "2026-03-01",
				type: "Solicitation",
				baseType: "Solicitation",
				active: "Yes",
				pointOfContact: [],
				award: null,
			})),
		};
		const page2 = {
			totalRecords: 150,
			limit: 100,
			offset: 100,
			opportunitiesData: Array.from({ length: 50 }, (_, i) => ({
				noticeId: `opp-${100 + i}`,
				title: `Opportunity ${100 + i}`,
				postedDate: "2026-03-01",
				type: "Solicitation",
				baseType: "Solicitation",
				active: "Yes",
				pointOfContact: [],
				award: null,
			})),
		};

		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }));

		const opps = await fetchSamGovOpportunities(mockFetch, "test-key", logger);

		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(opps).toHaveLength(150);
	});

	it("stops pagination when a page returns fewer results than limit", async () => {
		const partialPage = {
			totalRecords: 50,
			limit: 100,
			offset: 0,
			opportunitiesData: Array.from({ length: 50 }, (_, i) => ({
				noticeId: `opp-${i}`,
				title: `Opportunity ${i}`,
				postedDate: "2026-03-01",
				type: "Solicitation",
				baseType: "Solicitation",
				active: "Yes",
				pointOfContact: [],
				award: null,
			})),
		};

		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(partialPage), { status: 200 }));

		const opps = await fetchSamGovOpportunities(mockFetch, "test-key", logger);

		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(opps).toHaveLength(50);
	});

	it("stops after max pages to avoid runaway pagination", async () => {
		const fullPage = (offset: number) => ({
			totalRecords: 1000,
			limit: 100,
			offset,
			opportunitiesData: Array.from({ length: 100 }, (_, i) => ({
				noticeId: `opp-${offset + i}`,
				title: `Opportunity ${offset + i}`,
				postedDate: "2026-03-01",
				type: "Solicitation",
				baseType: "Solicitation",
				active: "Yes",
				pointOfContact: [],
				award: null,
			})),
		});

		const mockFetch = vi.fn();
		for (let i = 0; i < 10; i++) {
			mockFetch.mockResolvedValueOnce(
				new Response(JSON.stringify(fullPage(i * 100)), { status: 200 }),
			);
		}

		const opps = await fetchSamGovOpportunities(mockFetch, "test-key", logger);

		expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(5);
		expect(opps).toHaveLength(500);
	});
});

const APBI_RESPONSE = {
	totalRecords: 1,
	limit: 100,
	offset: 0,
	opportunitiesData: [
		{
			noticeId: "apbi001",
			title: "NAVSEA Advance Planning Briefing for Industry 2026",
			postedDate: "2026-03-01",
			type: "Special Notice",
			baseType: "Special Notice",
			active: "Yes",
			organizationName: "DEPT OF THE NAVY",
			pointOfContact: [
				{
					fullName: "Jane Doe",
					title: "Event Coordinator",
					email: "jane.doe@navy.mil",
				},
			],
			award: null,
		},
	],
};

describe("fetchApbiEvents", () => {
	it("fetches and returns parsed APBI opportunities", async () => {
		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(APBI_RESPONSE), { status: 200 }));

		const opps = await fetchApbiEvents(mockFetch, "test-key", logger);

		expect(opps).toHaveLength(1);
		expect(opps[0].noticeId).toBe("apbi001");
		expect(opps[0].title).toContain("Advance Planning Briefing");
		expect(opps[0].type).toBe("Special Notice");
	});

	it("uses APBI URL with special notice ptype and keywords", async () => {
		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(EMPTY_RESPONSE), { status: 200 }));

		await fetchApbiEvents(mockFetch, "test-key", logger);

		const calledUrl = mockFetch.mock.calls[0][0] as string;
		expect(calledUrl).toContain("ptype=s");
		expect(calledUrl).toContain("keyword=");
	});

	it("returns empty array when fetch fails", async () => {
		const mockFetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

		const opps = await fetchApbiEvents(mockFetch, "test-key", logger);

		expect(opps).toEqual([]);
	});
});
