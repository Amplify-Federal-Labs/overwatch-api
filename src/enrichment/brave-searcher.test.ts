import { describe, it, expect, vi } from "vitest";
import { braveSearch, buildSearchQuery } from "./brave-searcher";

describe("buildSearchQuery", () => {
	it("builds a person search query with military and govcon site filters", () => {
		const query = buildSearchQuery("Col. Sarah Kim", "person");
		expect(query).toContain('"Col. Sarah Kim"');
		expect(query).toContain("site:mil");
		expect(query).toContain("site:defense.gov");
		expect(query).toContain("site:afcea.org");
		expect(query).toContain("site:govexec.com");
		expect(query).toContain("site:federalnewsnetwork.com");
		expect(query).toContain("site:executivegov.com");
		expect(query).toContain("site:linkedin.com");
	});

	it("builds an agency search query with government and govcon site filters", () => {
		const query = buildSearchQuery("Space Force Delta 6", "agency");
		expect(query).toContain('"Space Force Delta 6"');
		expect(query).toContain("site:mil");
		expect(query).toContain("site:defense.gov");
		expect(query).toContain("site:govexec.com");
		expect(query).toContain("site:federalnewsnetwork.com");
		expect(query).toContain("site:executivegov.com");
		expect(query).not.toContain("site:linkedin.com");
	});
});

describe("braveSearch", () => {
	it("returns parsed search results from Brave API", async () => {
		const mockResponse = {
			web: {
				results: [
					{ title: "Col. Kim Bio", url: "https://af.mil/bio/kim", description: "Official biography" },
					{ title: "Kim speaks at AFCEA", url: "https://afcea.org/event", description: "Conference speaker" },
				],
			},
		};
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});

		const results = await braveSearch(fetcher, "test-api-key", '"Col. Sarah Kim"');

		expect(results).toHaveLength(2);
		expect(results[0].title).toBe("Col. Kim Bio");
		expect(results[0].url).toBe("https://af.mil/bio/kim");
		expect(results[0].description).toBe("Official biography");
	});

	it("sends correct headers and query params", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ web: { results: [] } }),
		});

		await braveSearch(fetcher, "my-api-key", '"test query"', 3);

		expect(fetcher).toHaveBeenCalledOnce();
		const [url, options] = fetcher.mock.calls[0];
		expect(url).toContain("https://api.search.brave.com/res/v1/web/search");
		expect(url).toContain("q=%22test+query%22");
		expect(url).toContain("count=3");
		expect(options.headers["X-Subscription-Token"]).toBe("my-api-key");
		expect(options.headers["Accept"]).toBe("application/json");
	});

	it("defaults count to 5", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ web: { results: [] } }),
		});

		await braveSearch(fetcher, "key", "query");

		const [url] = fetcher.mock.calls[0];
		expect(url).toContain("count=5");
	});

	it("returns empty array on fetch error", async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error("Network error"));

		const results = await braveSearch(fetcher, "key", "query");

		expect(results).toEqual([]);
	});

	it("returns empty array on non-ok response", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
		});

		const results = await braveSearch(fetcher, "key", "query");

		expect(results).toEqual([]);
	});

	it("returns empty array when web.results is missing", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({}),
		});

		const results = await braveSearch(fetcher, "key", "query");

		expect(results).toEqual([]);
	});
});
