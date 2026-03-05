import type { EntityType } from "../schemas";
import type { Logger } from "../logger";

type FetchFn = typeof fetch;

export interface BraveSearchResult {
	title: string;
	url: string;
	description: string;
}

const PERSON_SITE_FILTERS = "site:mil OR site:defense.gov OR site:afcea.org";
const AGENCY_SITE_FILTERS = "site:mil OR site:defense.gov";

export function buildSearchQuery(entityValue: string, entityType: EntityType): string {
	const quoted = `"${entityValue}"`;
	const siteFilters = entityType === "person" ? PERSON_SITE_FILTERS : AGENCY_SITE_FILTERS;
	return `${quoted} ${siteFilters}`;
}

export async function braveSearch(
	fetcher: FetchFn,
	apiKey: string,
	query: string,
	count: number = 5,
	logger?: Logger,
): Promise<BraveSearchResult[]> {
	try {
		const params = new URLSearchParams({ q: query, count: String(count) });
		const url = `https://api.search.brave.com/res/v1/web/search?${params}`;
		const response = await fetcher(url, {
			headers: {
				"X-Subscription-Token": apiKey,
				"Accept": "application/json",
			},
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			logger?.error("Brave Search API error", { status: response.status, body, url });
			return [];
		}

		const data = await response.json() as { web?: { results?: { title: string; url: string; description: string }[] } };
		return (data.web?.results ?? []).map(({ title, url, description }) => ({ title, url, description }));
	} catch {
		return [];
	}
}
