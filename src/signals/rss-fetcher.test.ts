import { describe, it, expect, vi } from "vitest";
import { fetchRssFeed } from "./rss-fetcher";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Test Article</title>
      <link>https://example.com/articles/test</link>
      <pubDate>Wed, 04 Mar 2026 05:59:25 +0000</pubDate>
      <category>DOD</category>
      <description>Test description</description>
    </item>
  </channel>
</rss>`;

describe("fetchRssFeed", () => {
	it("should fetch and parse RSS items from the given URL", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: () => Promise.resolve(SAMPLE_RSS),
		});

		const items = await fetchRssFeed(mockFetch, "https://example.com/feed");

		expect(mockFetch).toHaveBeenCalledWith("https://example.com/feed");
		expect(items).toHaveLength(1);
		expect(items[0].title).toBe("Test Article");
	});

	it("should return empty array on fetch error", async () => {
		const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

		const items = await fetchRssFeed(mockFetch, "https://example.com/feed");

		expect(items).toEqual([]);
	});

	it("should return empty array on non-ok response", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 503,
		});

		const items = await fetchRssFeed(mockFetch, "https://example.com/feed");

		expect(items).toEqual([]);
	});
});
