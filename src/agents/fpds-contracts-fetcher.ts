import type { FetchFn } from "./types";
import type { FpdsContractEntry } from "./fpds-contracts-parser";
import { parseFpdsAtomEntries, extractNextPageUrl } from "./fpds-contracts-parser";

export function buildFpdsUrl(): string {
	const end = new Date();
	const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
	const fmt = (d: Date) =>
		`${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
	const q = `SIGNED_DATE:[${fmt(start)},${fmt(end)}] DEPARTMENT_ID:9700`;
	return `https://www.fpds.gov/ezsearch/FEEDS/ATOM?FEEDNAME=PUBLIC&q=${encodeURIComponent(q)}&start=0`;
}

export async function fetchFpdsContracts(fetcher: FetchFn): Promise<FpdsContractEntry[]> {
	const allEntries: FpdsContractEntry[] = [];
	const maxPages = 5;
	let url: string | null = buildFpdsUrl();

	for (let page = 0; page < maxPages && url; page++) {
		let response: Response;
		try {
			response = await fetcher(url);
		} catch {
			console.error("Failed to fetch FPDS ATOM feed");
			return allEntries;
		}

		if (!response.ok) {
			console.error(`FPDS ATOM feed returned ${response.status}`);
			return allEntries;
		}

		const xml = await response.text();
		const entries = parseFpdsAtomEntries(xml);
		allEntries.push(...entries);

		url = extractNextPageUrl(xml);
	}

	return allEntries;
}
