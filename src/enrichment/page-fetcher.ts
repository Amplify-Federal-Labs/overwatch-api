type FetchFn = typeof fetch;

const MAX_TEXT_LENGTH = 4000;
const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain"];

export async function fetchPageText(fetcher: FetchFn, url: string): Promise<string | null> {
	try {
		const response = await fetcher(url);

		if (!response.ok) {
			return null;
		}

		const contentType = response.headers.get("content-type") ?? "";
		if (!ALLOWED_CONTENT_TYPES.some((type) => contentType.includes(type))) {
			return null;
		}

		const html = await response.text();
		const text = stripHtml(html);
		return text.slice(0, MAX_TEXT_LENGTH);
	} catch {
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
