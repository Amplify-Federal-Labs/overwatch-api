import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /interactions", () => {
	it("returns 200 with a record of interactions keyed by stakeholder ID", async () => {
		const response = await SELF.fetch("http://local.test/interactions");
		expect(response.status).toBe(200);

		const body = await response.json<{ success: boolean; result: Record<string, unknown[]> }>();
		expect(body.success).toBe(true);
		expect(typeof body.result).toBe("object");

		// Should have at least the st4 key with interactions
		expect(body.result).toHaveProperty("st4");
		expect(Array.isArray(body.result.st4)).toBe(true);

		const interaction = body.result.st4[0] as Record<string, unknown>;
		expect(interaction).toHaveProperty("id");
		expect(interaction).toHaveProperty("date");
		expect(interaction).toHaveProperty("type");
		expect(interaction).toHaveProperty("title");
		expect(interaction).toHaveProperty("summary");
		expect(interaction).toHaveProperty("sentiment");
		expect(interaction).toHaveProperty("followUp");
	});
});
