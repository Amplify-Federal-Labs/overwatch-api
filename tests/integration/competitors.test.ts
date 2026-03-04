import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /competitors/activity", () => {
	it("returns 200 with an array of competitor activities", async () => {
		const response = await SELF.fetch("http://local.test/competitors/activity");
		expect(response.status).toBe(200);

		const body = await response.json<{ success: boolean; result: unknown[] }>();
		expect(body.success).toBe(true);
		expect(Array.isArray(body.result)).toBe(true);
		expect(body.result.length).toBeGreaterThan(0);

		const activity = body.result[0] as Record<string, unknown>;
		expect(activity).toHaveProperty("competitor");
		expect(activity).toHaveProperty("activity");
		expect(activity).toHaveProperty("threat");
		expect(["high", "medium", "low"]).toContain(activity.threat);
		expect(activity).toHaveProperty("area");
	});
});
