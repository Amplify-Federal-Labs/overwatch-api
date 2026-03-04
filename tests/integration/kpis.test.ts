import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /kpis", () => {
	it("returns 200 with an array of KPIs", async () => {
		const response = await SELF.fetch("http://local.test/kpis");
		expect(response.status).toBe(200);

		const body = await response.json<{ success: boolean; result: unknown[] }>();
		expect(body.success).toBe(true);
		expect(Array.isArray(body.result)).toBe(true);
		expect(body.result.length).toBeGreaterThan(0);

		const kpi = body.result[0] as Record<string, unknown>;
		expect(kpi).toHaveProperty("label");
		expect(kpi).toHaveProperty("value");
		expect(kpi).toHaveProperty("prev");
		expect(kpi).toHaveProperty("type");
	});
});
