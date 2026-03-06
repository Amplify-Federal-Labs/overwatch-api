import type { RssItem } from "./rss-parser";
import { parseRssFeed } from "./rss-parser";
import type { Logger } from "../../logger";

export async function fetchRssFeed(fetcher: typeof fetch, url: string, logger: Logger): Promise<RssItem[]> {
	let response: Response;
	try {
		response = await fetcher(url);
	} catch {
		logger.error("Failed to fetch RSS feed", { url });
		return [];
	}

	if (!response.ok) {
		logger.error("RSS feed returned error", { url, status: response.status });
		return [];
	}

	const xml = await response.text();
	return parseRssFeed(xml);
}
