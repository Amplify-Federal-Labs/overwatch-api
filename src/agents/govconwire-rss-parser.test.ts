import { describe, it, expect } from "vitest";
import { parseGovConWireRss, rssItemsToSignals } from "./govconwire-rss-parser";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>GovCon Wire</title>
    <item>
      <title>Lockheed Secures $1.9B Air Force Contract</title>
      <link>https://www.govconwire.com/articles/lockheed-air-force-contract</link>
      <dc:creator>Jane Edwards</dc:creator>
      <pubDate>Wed, 04 Mar 2026 05:59:25 +0000</pubDate>
      <category>Contract Awards</category>
      <category>DOD</category>
      <description><![CDATA[<p><img src="https://example.com/img.jpg" /></p><p>Lockheed Martin has won a contract worth $1.9 billion.</p>]]></description>
    </item>
    <item>
      <title>DISA Awards Cloud Migration Contract</title>
      <link>https://www.govconwire.com/articles/disa-cloud-contract</link>
      <dc:creator>John Smith</dc:creator>
      <pubDate>Tue, 03 Mar 2026 12:00:00 +0000</pubDate>
      <category>Cloud</category>
      <description><![CDATA[<p>DISA has awarded a cloud migration contract.</p>]]></description>
    </item>
  </channel>
</rss>`;

describe("parseGovConWireRss", () => {
	it("should parse RSS items from valid XML", () => {
		const items = parseGovConWireRss(SAMPLE_RSS);

		expect(items).toHaveLength(2);
		expect(items[0].title).toBe("Lockheed Secures $1.9B Air Force Contract");
		expect(items[0].link).toBe("https://www.govconwire.com/articles/lockheed-air-force-contract");
		expect(items[0].creator).toBe("Jane Edwards");
		expect(items[0].pubDate).toBe("Wed, 04 Mar 2026 05:59:25 +0000");
		expect(items[0].categories).toEqual(["Contract Awards", "DOD"]);
	});

	it("should strip HTML from description", () => {
		const items = parseGovConWireRss(SAMPLE_RSS);

		expect(items[0].description).toBe("Lockheed Martin has won a contract worth $1.9 billion.");
		expect(items[0].description).not.toContain("<");
	});

	it("should return empty array for invalid XML", () => {
		expect(parseGovConWireRss("not xml")).toEqual([]);
	});

	it("should return empty array for XML without channel", () => {
		expect(parseGovConWireRss("<rss></rss>")).toEqual([]);
	});

	it("should handle single item (non-array)", () => {
		const singleItemRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>GovCon Wire</title>
    <item>
      <title>Single Article</title>
      <link>https://www.govconwire.com/articles/single</link>
      <description>Plain text description</description>
    </item>
  </channel>
</rss>`;
		const items = parseGovConWireRss(singleItemRss);
		expect(items).toHaveLength(1);
		expect(items[0].title).toBe("Single Article");
	});

	it("should handle item with single category as string", () => {
		const singleCatRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <item>
      <title>Article</title>
      <link>https://example.com/a</link>
      <category>DOD</category>
      <description>Desc</description>
    </item>
  </channel>
</rss>`;
		const items = parseGovConWireRss(singleCatRss);
		expect(items[0].categories).toEqual(["DOD"]);
	});
});

describe("rssItemsToSignals", () => {
	it("should convert RSS items to SignalAnalysisInput array", () => {
		const items = parseGovConWireRss(SAMPLE_RSS);
		const signals = rssItemsToSignals(items);

		expect(signals).toHaveLength(2);
		expect(signals[0]).toEqual({
			content: expect.stringContaining("Lockheed Secures $1.9B Air Force Contract"),
			sourceType: "rss",
			sourceName: "GovConWire",
			sourceLink: "https://www.govconwire.com/articles/lockheed-air-force-contract",
		});
	});

	it("should include categories and date in content", () => {
		const items = parseGovConWireRss(SAMPLE_RSS);
		const signals = rssItemsToSignals(items);

		expect(signals[0].content).toContain("Contract Awards");
		expect(signals[0].content).toContain("Wed, 04 Mar 2026");
	});

	it("should return empty array for empty input", () => {
		expect(rssItemsToSignals([])).toEqual([]);
	});
});
