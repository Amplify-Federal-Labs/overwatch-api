import type { FetchFn } from "./types";
import type { RssItem } from "./rss-parser";
import { parseRssFeed } from "./rss-parser";

export async function fetchRssFeed(fetcher: FetchFn, url: string): Promise<RssItem[]> {
	let response: Response;
	try {
		response = await fetcher(url);
	} catch {
		console.error(`Failed to fetch RSS feed: ${url}`);
		return [];
	}

	if (!response.ok) {
		console.error(`RSS feed ${url} returned ${response.status}`);
		return [];
	}

	const xml = await response.text();
	return parseRssFeed(xml);
}
