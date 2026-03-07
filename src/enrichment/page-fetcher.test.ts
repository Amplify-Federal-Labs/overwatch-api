import { describe, it, expect, vi, beforeEach } from "vitest";
import { PageFetcher, BLOCKED_DOMAINS, isBlockedUrl, extractTextFromHtml } from "./page-fetcher";

describe("BLOCKED_DOMAINS", () => {
	it("includes mil and gov domains", () => {
		expect(BLOCKED_DOMAINS).toContain("army.mil");
		expect(BLOCKED_DOMAINS).toContain("navy.mil");
		expect(BLOCKED_DOMAINS).toContain("af.mil");
		expect(BLOCKED_DOMAINS).toContain("marines.mil");
		expect(BLOCKED_DOMAINS).toContain("disa.mil");
		expect(BLOCKED_DOMAINS).toContain("defense.gov");
	});

	it("includes linkedin", () => {
		expect(BLOCKED_DOMAINS).toContain("linkedin.com");
	});
});

describe("isBlockedUrl", () => {
	it("blocks .mil URLs", () => {
		expect(isBlockedUrl("https://www.army.mil/article/12345")).toBe(true);
		expect(isBlockedUrl("https://www.navy.mil/news")).toBe(true);
	});

	it("blocks linkedin.com", () => {
		expect(isBlockedUrl("https://www.linkedin.com/in/john-smith")).toBe(true);
	});

	it("blocks subdomains of blocked domains", () => {
		expect(isBlockedUrl("https://news.defense.gov/article")).toBe(true);
	});

	it("allows non-blocked domains", () => {
		expect(isBlockedUrl("https://www.govconwire.com/article")).toBe(false);
		expect(isBlockedUrl("https://fedscoop.com/news")).toBe(false);
		expect(isBlockedUrl("https://en.wikipedia.org/wiki/NIWC")).toBe(false);
	});

	it("handles invalid URLs", () => {
		expect(isBlockedUrl("not-a-url")).toBe(true);
	});
});

describe("extractTextFromHtml", () => {
	it("strips HTML tags and returns text", () => {
		const html = "<html><body><h1>Title</h1><p>Hello world</p></body></html>";
		const text = extractTextFromHtml(html);
		expect(text).toContain("Title");
		expect(text).toContain("Hello world");
		expect(text).not.toContain("<h1>");
	});

	it("strips script and style tags with content", () => {
		const html = '<html><body><script>alert("x")</script><style>.a{}</style><p>Content</p></body></html>';
		const text = extractTextFromHtml(html);
		expect(text).toContain("Content");
		expect(text).not.toContain("alert");
		expect(text).not.toContain(".a{}");
	});

	it("normalizes whitespace", () => {
		const html = "<p>Hello   \n\n\n  world</p>";
		const text = extractTextFromHtml(html);
		expect(text).toBe("Hello world");
	});

	it("truncates long text", () => {
		const html = `<p>${"a".repeat(10000)}</p>`;
		const text = extractTextFromHtml(html, 500);
		expect(text.length).toBeLessThanOrEqual(500);
	});
});

describe("PageFetcher", () => {
	let mockFetch: ReturnType<typeof vi.fn>;
	let fetcher: PageFetcher;

	beforeEach(() => {
		mockFetch = vi.fn();
		fetcher = new PageFetcher(mockFetch);
	});

	it("fetches and extracts text from a page", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			text: () => Promise.resolve("<html><body><p>John Smith is the CTO of DISA.</p></body></html>"),
		});

		const text = await fetcher.fetchPage("https://www.govconwire.com/article/1");
		expect(text).toContain("John Smith is the CTO of DISA");
	});

	it("returns null for blocked URLs", async () => {
		const text = await fetcher.fetchPage("https://www.army.mil/article/1");
		expect(text).toBeNull();
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("returns null on fetch error", async () => {
		mockFetch.mockRejectedValueOnce(new Error("Network error"));
		const text = await fetcher.fetchPage("https://example.com/article");
		expect(text).toBeNull();
	});

	it("returns null on non-200 response", async () => {
		mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
		const text = await fetcher.fetchPage("https://example.com/article");
		expect(text).toBeNull();
	});

	it("fetches multiple pages skipping blocked ones", async () => {
		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve("<p>Page one</p>"),
			})
			.mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve("<p>Page two</p>"),
			});

		const results = await fetcher.fetchPages([
			"https://www.govconwire.com/1",
			"https://www.army.mil/blocked",
			"https://fedscoop.com/2",
		]);

		expect(results).toHaveLength(2);
		expect(results[0]).toContain("Page one");
		expect(results[1]).toContain("Page two");
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});
});
