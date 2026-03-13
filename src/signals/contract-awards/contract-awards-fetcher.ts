import type { ContractAwardEntry } from "./contract-awards-parser";
import { parseContractAwardsResponse } from "./contract-awards-parser";
import type { Logger } from "../../logger";

const PAGE_LIMIT = 100;
const MAX_PAGES = 5;
const LOOKBACK_DAYS = 3;

function formatDate(date: Date): string {
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(date.getUTCDate()).padStart(2, "0");
	const yyyy = date.getUTCFullYear();
	return `${mm}/${dd}/${yyyy}`;
}

export function buildContractAwardsUrl(apiKey: string, offset: number): string {
	const now = new Date();
	const from = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

	const params = new URLSearchParams({
		api_key: apiKey,
		lastModifiedDate: `[${formatDate(from)},${formatDate(now)}]`,
		contractingDepartmentCode: "9700",
		modificationNumber: "0",
		limit: String(PAGE_LIMIT),
		offset: String(offset),
	});

	return `https://api.sam.gov/contract-awards/v1/search?${params}`;
}

export async function fetchContractAwards(
	fetcher: typeof fetch,
	apiKey: string,
	logger: Logger,
): Promise<ContractAwardEntry[]> {
	const allEntries: ContractAwardEntry[] = [];

	for (let page = 0; page < MAX_PAGES; page++) {
		const offset = page * PAGE_LIMIT;
		const url = buildContractAwardsUrl(apiKey, offset);

		let response: Response;
		try {
			response = await fetcher(url);
		} catch {
			logger.error("Failed to fetch SAM.gov contract awards", { url });
			return allEntries;
		}

		if (!response.ok) {
			logger.error("SAM.gov Contract Awards API returned error", { url, status: response.status });
			return allEntries;
		}

		const json = await response.json() as Record<string, unknown>;
		const entries = parseContractAwardsResponse(json);
		allEntries.push(...entries);

		if (entries.length < PAGE_LIMIT) {
			break;
		}
	}

	return allEntries;
}
