import type { FetchFn } from "./types";
import type { GovConWireRssItem } from "./govconwire-rss-parser";
import { parseGovConWireRss } from "./govconwire-rss-parser";

export const GOVCONWIRE_FEED_URL = "https://www.govconwire.com/feed";

export async function fetchGovConWireRss(fetcher: FetchFn): Promise<GovConWireRssItem[]> {
	let response: Response;
	try {
		response = await fetcher(GOVCONWIRE_FEED_URL);
	} catch {
		console.error("Failed to fetch GovConWire RSS feed");
		return [];
	}

	if (!response.ok) {
		console.error(`GovConWire RSS feed returned ${response.status}`);
		return [];
	}

	const xml = await response.text();
	return parseGovConWireRss(xml);
}
