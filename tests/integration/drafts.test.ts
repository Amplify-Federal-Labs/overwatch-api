import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Drafts API", () => {
	describe("GET /drafts", () => {
		it("returns 200 with an array of email drafts", async () => {
			const response = await SELF.fetch("http://local.test/drafts");
			expect(response.status).toBe(200);

			const body = await response.json<{ success: boolean; result: unknown[] }>();
			expect(body.success).toBe(true);
			expect(Array.isArray(body.result)).toBe(true);
			expect(body.result.length).toBeGreaterThan(0);

			const draft = body.result[0] as Record<string, unknown>;
			expect(draft).toHaveProperty("id");
			expect(draft).toHaveProperty("stakeholderId");
			expect(draft).toHaveProperty("signalId");
			expect(draft).toHaveProperty("subject");
			expect(draft).toHaveProperty("body");
			expect(draft).toHaveProperty("status");
			expect(draft).toHaveProperty("context");
		});
	});

	describe("POST /drafts/:id/accept", () => {
		it("returns 200 with accepted draft", async () => {
			const response = await SELF.fetch("http://local.test/drafts/draft-1/accept", {
				method: "POST",
			});
			expect(response.status).toBe(200);

			const body = await response.json<{ success: boolean; result: Record<string, unknown> }>();
			expect(body.success).toBe(true);
			expect(body.result.id).toBe("draft-1");
			expect(body.result.status).toBe("accepted");
			expect(body.result).toHaveProperty("updatedAt");
		});

		it("returns 404 for nonexistent draft", async () => {
			const response = await SELF.fetch("http://local.test/drafts/nonexistent/accept", {
				method: "POST",
			});
			expect(response.status).toBe(404);
		});
	});

	describe("POST /drafts/:id/reject", () => {
		it("returns 200 with rejected draft", async () => {
			const response = await SELF.fetch("http://local.test/drafts/draft-2/reject", {
				method: "POST",
			});
			expect(response.status).toBe(200);

			const body = await response.json<{ success: boolean; result: Record<string, unknown> }>();
			expect(body.success).toBe(true);
			expect(body.result.id).toBe("draft-2");
			expect(body.result.status).toBe("rejected");
			expect(body.result).toHaveProperty("updatedAt");
		});

		it("returns 404 for nonexistent draft", async () => {
			const response = await SELF.fetch("http://local.test/drafts/nonexistent/reject", {
				method: "POST",
			});
			expect(response.status).toBe(404);
		});
	});
});
