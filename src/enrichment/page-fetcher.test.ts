import { describe, it, expect, vi } from "vitest";
import { fetchPageText } from "./page-fetcher";

describe("fetchPageText", () => {
	it("strips HTML tags and returns plain text", async () => {
		const html = "<html><body><h1>Title</h1><p>Hello <b>world</b></p></body></html>";
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ "content-type": "text/html" }),
			text: () => Promise.resolve(html),
		});

		const result = await fetchPageText(fetcher, "https://example.com");

		expect(result).toBe("Title Hello world");
	});

	it("truncates text to 10000 characters", async () => {
		const longText = "a".repeat(15000);
		const html = `<p>${longText}</p>`;
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ "content-type": "text/html" }),
			text: () => Promise.resolve(html),
		});

		const result = await fetchPageText(fetcher, "https://example.com");

		expect(result).not.toBeNull();
		expect(result!.length).toBe(10000);
	});

	it("returns null on fetch error", async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error("Network error"));

		const result = await fetchPageText(fetcher, "https://example.com");

		expect(result).toBeNull();
	});

	it("returns null on non-ok response", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			headers: new Headers({ "content-type": "text/html" }),
		});

		const result = await fetchPageText(fetcher, "https://example.com");

		expect(result).toBeNull();
	});

	it("returns null for PDF content-type", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ "content-type": "application/pdf" }),
		});

		const result = await fetchPageText(fetcher, "https://example.com/file.pdf");

		expect(result).toBeNull();
	});

	it("returns null for image content-type", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ "content-type": "image/png" }),
		});

		const result = await fetchPageText(fetcher, "https://example.com/photo.png");

		expect(result).toBeNull();
	});

	it("strips script and style tags with their content", async () => {
		const html = `<html><head><style>body { color: red; }</style></head><body><p>Content</p><script>alert('hi')</script></body></html>`;
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ "content-type": "text/html" }),
			text: () => Promise.resolve(html),
		});

		const result = await fetchPageText(fetcher, "https://example.com");

		expect(result).toBe("Content");
		expect(result).not.toContain("alert");
		expect(result).not.toContain("color: red");
	});

	it("sends a browser-like User-Agent header", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ "content-type": "text/html" }),
			text: () => Promise.resolve("<p>Hello</p>"),
		});

		await fetchPageText(fetcher, "https://example.com");

		const [, options] = fetcher.mock.calls[0];
		expect(options.headers["User-Agent"]).toContain("Mozilla/5.0");
	});

	it("collapses multiple whitespace into single spaces", async () => {
		const html = "<p>Hello    \n\n   world</p>";
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ "content-type": "text/html" }),
			text: () => Promise.resolve(html),
		});

		const result = await fetchPageText(fetcher, "https://example.com");

		expect(result).toBe("Hello world");
	});
});
