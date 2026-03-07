type FetchFn = typeof fetch;

const DEFAULT_MAX_LENGTH = 5000;

export const BLOCKED_DOMAINS: readonly string[] = [
	// .mil domains
	"army.mil",
	"navy.mil",
	"af.mil",
	"marines.mil",
	"disa.mil",
	"dla.mil",
	"socom.mil",
	"centcom.mil",
	"eucom.mil",
	"pacom.mil",
	"northcom.mil",
	"southcom.mil",
	"stratcom.mil",
	"transcom.mil",
	"cybercom.mil",
	"spacecom.mil",
	"jcs.mil",
	// .gov domains that block bots
	"defense.gov",
	"dni.gov",
	"nsa.gov",
	"cia.gov",
	"state.gov",
	// Social media (bot detection)
	"linkedin.com",
	"facebook.com",
	"twitter.com",
	"x.com",
];

export function isBlockedUrl(url: string): boolean {
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		return BLOCKED_DOMAINS.some(
			(domain) => hostname === domain || hostname.endsWith(`.${domain}`),
		);
	} catch {
		return true; // invalid URLs are treated as blocked
	}
}

export function extractTextFromHtml(html: string, maxLength: number = DEFAULT_MAX_LENGTH): string {
	// Remove script and style tags with their content
	let text = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
	text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
	// Remove all HTML tags
	text = text.replace(/<[^>]+>/g, " ");
	// Decode common HTML entities
	text = text.replace(/&amp;/g, "&");
	text = text.replace(/&lt;/g, "<");
	text = text.replace(/&gt;/g, ">");
	text = text.replace(/&quot;/g, '"');
	text = text.replace(/&#39;/g, "'");
	text = text.replace(/&nbsp;/g, " ");
	// Normalize whitespace
	text = text.replace(/\s+/g, " ").trim();
	// Truncate
	if (text.length > maxLength) {
		text = text.slice(0, maxLength);
	}
	return text;
}

export class PageFetcher {
	private fetchFn: FetchFn;

	constructor(fetchFn: FetchFn = fetch) {
		this.fetchFn = fetchFn;
	}

	async fetchPage(url: string): Promise<string | null> {
		if (isBlockedUrl(url)) {
			return null;
		}

		try {
			const response = await this.fetchFn(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 (compatible; OverwatchBot/1.0)",
				},
			});

			if (!response.ok) {
				return null;
			}

			const html = await response.text();
			return extractTextFromHtml(html);
		} catch {
			return null;
		}
	}

	async fetchPages(urls: string[]): Promise<string[]> {
		const results: string[] = [];
		for (const url of urls) {
			const text = await this.fetchPage(url);
			if (text) {
				results.push(text);
			}
		}
		return results;
	}
}
