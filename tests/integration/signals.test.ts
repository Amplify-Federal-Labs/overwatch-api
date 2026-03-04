import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /signals", () => {
	it("returns 200 with an array of signals", async () => {
		const response = await SELF.fetch("http://local.test/signals");
		expect(response.status).toBe(200);

		const body = await response.json<{ success: boolean; result: unknown[] }>();
		expect(body.success).toBe(true);
		expect(Array.isArray(body.result)).toBe(true);
	});
});
