import { env, SELF } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";

async function seedStakeholder() {
	await env.DB.prepare(
		`INSERT INTO stakeholders (id, type, name, title, org, branch, stage, confidence, programs, focus_areas, education, career_history, signal_ids, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			"test-stakeholder-1",
			"person",
			"Col. Sarah Kim",
			"Director of Cloud Ops",
			"AFLCMC",
			"Air Force",
			"engaged",
			"high",
			JSON.stringify(["Cloud One"]),
			JSON.stringify(["cloud migration"]),
			JSON.stringify(["MIT"]),
			JSON.stringify([{ role: "Director", org: "AFLCMC", years: "2022-present" }]),
			JSON.stringify(["signal-123"]),
			new Date().toISOString(),
		)
		.run();
}

describe("GET /stakeholders", () => {
	beforeEach(async () => {
		await env.DB.prepare("DELETE FROM stakeholders").run();
		await seedStakeholder();
	});

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
