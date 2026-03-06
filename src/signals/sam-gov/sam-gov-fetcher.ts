import type { SamGovOpportunity } from "./sam-gov-parser";
import { parseSamGovResponse } from "./sam-gov-parser";
import type { Logger } from "../../logger";

const PAGE_LIMIT = 100;
const MAX_PAGES = 5;
const LOOKBACK_DAYS = 3;

const PROCUREMENT_TYPES = "o,r,p,k";
const SPECIAL_NOTICE_TYPE = "s";

export const APBI_KEYWORDS = [
	"APBI",
	"Advance Planning Briefing",
	"Industry Day",
	"Industry Conference",
	"Forecast to Industry",
];

function formatDate(date: Date): string {
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(date.getUTCDate()).padStart(2, "0");
	const yyyy = date.getUTCFullYear();
	return `${mm}/${dd}/${yyyy}`;
}

export function buildSamGovUrl(apiKey: string, offset: number = 0): string {
	const now = new Date();
	const from = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

	const params = new URLSearchParams({
		api_key: apiKey,
		postedFrom: formatDate(from),
		postedTo: formatDate(now),
		ptype: PROCUREMENT_TYPES,
		limit: String(PAGE_LIMIT),
		offset: String(offset),
		organizationName: "Defense",
		status: "active",
	});

	return `https://api.sam.gov/opportunities/v2/search?${params}`;
}

export function buildApbiUrl(apiKey: string, offset: number = 0): string {
	const now = new Date();
	const from = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

	const params = new URLSearchParams({
		api_key: apiKey,
		postedFrom: formatDate(from),
		postedTo: formatDate(now),
		ptype: SPECIAL_NOTICE_TYPE,
		limit: String(PAGE_LIMIT),
		offset: String(offset),
		organizationName: "Defense",
		status: "active",
		keyword: APBI_KEYWORDS.join(" OR "),
	});

	return `https://api.sam.gov/opportunities/v2/search?${params}`;
}

type UrlBuilder = (apiKey: string, offset: number) => string;

async function fetchPaginated(
	fetcher: typeof fetch,
	apiKey: string,
	logger: Logger,
	urlBuilder: UrlBuilder,
): Promise<SamGovOpportunity[]> {
	const allOpps: SamGovOpportunity[] = [];

	for (let page = 0; page < MAX_PAGES; page++) {
		const offset = page * PAGE_LIMIT;
		const url = urlBuilder(apiKey, offset);

		let response: Response;
		try {
			response = await fetcher(url);
		} catch {
			logger.error("Failed to fetch SAM.gov opportunities", { url });
			return allOpps;
		}

		if (!response.ok) {
			logger.error("SAM.gov API returned error", { url, status: response.status });
			return allOpps;
		}

		const json = await response.json() as Record<string, unknown>;
		const opps = parseSamGovResponse(json);
		allOpps.push(...opps);

		if (opps.length < PAGE_LIMIT) {
			break;
		}
	}

	return allOpps;
}

export async function fetchSamGovOpportunities(
	fetcher: typeof fetch,
	apiKey: string,
	logger: Logger,
): Promise<SamGovOpportunity[]> {
	return fetchPaginated(fetcher, apiKey, logger, buildSamGovUrl);
}

export async function fetchApbiEvents(
	fetcher: typeof fetch,
	apiKey: string,
	logger: Logger,
): Promise<SamGovOpportunity[]> {
	return fetchPaginated(fetcher, apiKey, logger, buildApbiUrl);
}
