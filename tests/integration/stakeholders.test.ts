import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /stakeholders", () => {
	it("returns 200 with an array of stakeholders", async () => {
		const response = await SELF.fetch("http://local.test/stakeholders");
		expect(response.status).toBe(200);

		const body = await response.json<{ success: boolean; result: unknown[] }>();
		expect(body.success).toBe(true);
		expect(Array.isArray(body.result)).toBe(true);
		expect(body.result.length).toBeGreaterThan(0);

		const stakeholder = body.result[0] as Record<string, unknown>;
		expect(stakeholder).toHaveProperty("id");
		expect(stakeholder).toHaveProperty("name");
		expect(stakeholder).toHaveProperty("stage");
		expect(stakeholder).toHaveProperty("contact");
		expect(stakeholder).toHaveProperty("programs");
		expect(stakeholder).toHaveProperty("events");
		expect(stakeholder).toHaveProperty("social");
	});
});
