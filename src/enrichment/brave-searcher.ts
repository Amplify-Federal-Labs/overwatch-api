import { isBlockedUrl } from "./page-fetcher";
import type { Logger } from "../logger";

export interface SearchResult {
	title: string;
	url: string;
	description: string;
}

type FetchFn = typeof fetch;

const DEFAULT_MAX_RESULTS = 5;

export function buildSearchQuery(entityName: string, entityType: string): string {
	switch (entityType) {
		case "person":
			return `${entityName} defense government official`;
		case "agency":
			return `${entityName} government agency mission`;
		default:
			return entityName;
	}
}

export class BraveSearcher {
	private apiKey: string;
	private fetchFn: FetchFn;
	private logger?: Logger;

	constructor(apiKey: string, fetchFn: FetchFn = fetch, logger?: Logger) {
		this.apiKey = apiKey;
		this.fetchFn = fetchFn;
		this.logger = logger;
	}

	async search(
		entityName: string,
		entityType: string,
		maxResults: number = DEFAULT_MAX_RESULTS,
	): Promise<SearchResult[]> {
		const query = buildSearchQuery(entityName, entityType);
		const params = new URLSearchParams({
			q: query,
			count: "20", // fetch extra since blocked domains are filtered out
		});

		const url = `https://api.search.brave.com/res/v1/web/search?${params}`;

		this.logger?.info("Brave search request", { query, url });

		try {
			const response = await this.fetchFn(url, {
				headers: {
					"Accept": "application/json",
					"X-Subscription-Token": this.apiKey,
				},
			});

			if (!response.ok) {
				this.logger?.error("Brave search API error", { status: response.status, query });
				return [];
			}

			const data = await response.json() as BraveApiResponse;
			const rawResults = data?.web?.results ?? [];

			this.logger?.info("Brave search raw results", {
				query,
				rawCount: rawResults.length,
				rawUrls: rawResults.map((r) => r.url),
			});

			const filtered = rawResults.filter((r) => !isBlockedUrl(r.url));

			this.logger?.info("Brave search after filtering blocked domains", {
				query,
				filteredCount: filtered.length,
				blockedCount: rawResults.length - filtered.length,
				filteredUrls: filtered.map((r) => r.url),
			});

			return filtered
				.slice(0, maxResults)
				.map((r) => ({
					title: r.title,
					url: r.url,
					description: r.description,
				}));
		} catch (err) {
			this.logger?.error("Brave search fetch failed", {
				query,
				error: err instanceof Error ? err : new Error(String(err)),
			});
			return [];
		}
	}
}

interface BraveApiResponse {
	web?: {
		results: Array<{
			title: string;
			url: string;
			description: string;
		}>;
	};
}
