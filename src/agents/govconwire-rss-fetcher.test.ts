import { describe, it, expect, vi } from "vitest";
import { fetchGovConWireRss, GOVCONWIRE_FEED_URL } from "./govconwire-rss-fetcher";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>GovCon Wire</title>
    <item>
      <title>Test Article</title>
      <link>https://www.govconwire.com/articles/test</link>
      <pubDate>Wed, 04 Mar 2026 05:59:25 +0000</pubDate>
      <category>DOD</category>
      <description>Test description</description>
    </item>
  </channel>
</rss>`;

describe("fetchGovConWireRss", () => {
	it("should fetch and parse RSS items from the feed URL", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			text: () => Promise.resolve(SAMPLE_RSS),
		});

		const items = await fetchGovConWireRss(mockFetch);

		expect(mockFetch).toHaveBeenCalledWith(GOVCONWIRE_FEED_URL);
		expect(items).toHaveLength(1);
		expect(items[0].title).toBe("Test Article");
	});

	it("should return empty array on fetch error", async () => {
		const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

		const items = await fetchGovConWireRss(mockFetch);

		expect(items).toEqual([]);
	});

	it("should return empty array on non-ok response", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 503,
		});

		const items = await fetchGovConWireRss(mockFetch);

		expect(items).toEqual([]);
	});
});

describe("GOVCONWIRE_FEED_URL", () => {
	it("should be the GovConWire RSS feed URL", () => {
		expect(GOVCONWIRE_FEED_URL).toBe("https://www.govconwire.com/feed");
	});
});
