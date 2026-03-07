import { describe, it, expect, vi, beforeEach } from "vitest";
import { BraveSearcher, buildSearchQuery, type SearchResult } from "./brave-searcher";

describe("buildSearchQuery", () => {
	it("builds query for a person entity", () => {
		const query = buildSearchQuery("John Smith", "person");
		expect(query).toBe("John Smith defense government official");
	});

	it("builds query for an agency entity", () => {
		const query = buildSearchQuery("NIWC Pacific", "agency");
		expect(query).toBe("NIWC Pacific government agency mission");
	});

	it("builds query for other entity types", () => {
		const query = buildSearchQuery("Palantir", "company");
		expect(query).toBe("Palantir");
	});
});

describe("BraveSearcher", () => {
	let mockFetch: ReturnType<typeof vi.fn>;
	let searcher: BraveSearcher;

	beforeEach(() => {
		mockFetch = vi.fn();
		searcher = new BraveSearcher("test-api-key", mockFetch);
	});

	it("returns search results from Brave API response", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				web: {
					results: [
						{
							title: "John Smith - GovConWire",
							url: "https://www.govconwire.com/john-smith",
							description: "John Smith appointed as CTO",
						},
						{
							title: "John Smith | Defense One",
							url: "https://www.defenseone.com/john-smith",
							description: "Profile of John Smith",
						},
					],
				},
			}),
		});

		const results = await searcher.search("John Smith", "person");

		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			title: "John Smith - GovConWire",
			url: "https://www.govconwire.com/john-smith",
			description: "John Smith appointed as CTO",
		});
		expect(mockFetch).toHaveBeenCalledOnce();

		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toContain("https://api.search.brave.com/res/v1/web/search");
		expect(url).toContain("q=");
		expect(options.headers["X-Subscription-Token"]).toBe("test-api-key");
	});

	it("returns empty array on API error", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 429,
		});

		const results = await searcher.search("John Smith", "person");
		expect(results).toEqual([]);
	});

	it("returns empty array on fetch failure", async () => {
		mockFetch.mockRejectedValueOnce(new Error("Network error"));

		const results = await searcher.search("John Smith", "person");
		expect(results).toEqual([]);
	});

	it("returns empty array when no web results", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ web: { results: [] } }),
		});

		const results = await searcher.search("John Smith", "person");
		expect(results).toEqual([]);
	});

	it("limits results to maxResults parameter", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				web: {
					results: Array.from({ length: 10 }, (_, i) => ({
						title: `Result ${i}`,
						url: `https://example.com/${i}`,
						description: `Description ${i}`,
					})),
				},
			}),
		});

		const results = await searcher.search("John Smith", "person", 3);
		expect(results).toHaveLength(3);
	});

	it("filters out blocked domains (mil, gov, linkedin)", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				web: {
					results: [
						{ title: "Army Bio", url: "https://www.army.mil/bio/smith", description: "bio" },
						{ title: "LinkedIn", url: "https://www.linkedin.com/in/smith", description: "profile" },
						{ title: "Defense.gov", url: "https://www.defense.gov/news/smith", description: "news" },
						{ title: "GovConWire", url: "https://www.govconwire.com/smith", description: "article" },
						{ title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Smith", description: "wiki" },
					],
				},
			}),
		});

		const results = await searcher.search("John Smith", "person");

		expect(results).toHaveLength(2);
		expect(results[0].url).toBe("https://www.govconwire.com/smith");
		expect(results[1].url).toBe("https://en.wikipedia.org/wiki/Smith");
	});

	it("returns empty when all results are blocked", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				web: {
					results: [
						{ title: "Army Bio", url: "https://www.army.mil/bio/smith", description: "bio" },
						{ title: "LinkedIn", url: "https://www.linkedin.com/in/smith", description: "profile" },
						{ title: "Navy", url: "https://www.navy.mil/news", description: "news" },
					],
				},
			}),
		});

		const results = await searcher.search("John Smith", "person");
		expect(results).toEqual([]);
	});
});
