import type { Logger } from "../logger";

type FetchFn = typeof fetch;

const MAX_TEXT_LENGTH = 10000;
const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain"];
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function fetchPageText(fetcher: FetchFn, url: string, logger?: Logger): Promise<string | null> {
	try {
		const response = await fetcher(url, {
			headers: { "User-Agent": USER_AGENT },
		});

		if (!response.ok) {
			logger?.error("Page fetch failed", { url, status: response.status });
			return null;
		}

		const contentType = response.headers.get("content-type") ?? "";
		if (!ALLOWED_CONTENT_TYPES.some((type) => contentType.includes(type))) {
			logger?.error("Page has unsupported content-type", { url, contentType });
			return null;
		}

		const html = await response.text();
		const text = stripHtml(html);
		return text.slice(0, MAX_TEXT_LENGTH);
	} catch (err) {
		logger?.error("Page fetch threw", { url, error: err instanceof Error ? err : new Error(String(err)) });
		return null;
	}
}

function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}
