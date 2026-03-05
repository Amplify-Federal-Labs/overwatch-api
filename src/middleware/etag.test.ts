import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { etag } from "./etag";

function buildApp() {
	const app = new Hono();
	app.use("/*", etag());
	app.get("/data", (c) => c.json({ success: true, result: [1, 2, 3] }));
	app.post("/mutate", (c) => c.json({ success: true }));
	return app;
}

describe("etag middleware", () => {
	it("returns ETag header on GET response", async () => {
		const app = buildApp();
		const res = await app.request("/data");

		expect(res.status).toBe(200);
		expect(res.headers.get("ETag")).toBeTruthy();
	});

	it("returns 304 when If-None-Match matches ETag", async () => {
		const app = buildApp();

		// First request to get the ETag
		const res1 = await app.request("/data");
		const etag = res1.headers.get("ETag");
		expect(etag).toBeTruthy();

		// Second request with If-None-Match
		const res2 = await app.request("/data", {
			headers: { "If-None-Match": etag! },
		});

		expect(res2.status).toBe(304);
		expect(await res2.text()).toBe("");
	});

	it("returns 200 when If-None-Match does not match", async () => {
		const app = buildApp();

		const res = await app.request("/data", {
			headers: { "If-None-Match": '"stale-etag"' },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("ETag")).toBeTruthy();
	});

	it("does not add ETag to non-GET requests", async () => {
		const app = buildApp();
		const res = await app.request("/mutate", { method: "POST" });

		expect(res.status).toBe(200);
		expect(res.headers.get("ETag")).toBeNull();
	});

	it("produces consistent ETags for the same body", async () => {
		const app = buildApp();
		const res1 = await app.request("/data");
		const res2 = await app.request("/data");

		expect(res1.headers.get("ETag")).toBe(res2.headers.get("ETag"));
	});

	it("does not add ETag to non-200 responses", async () => {
		const app = new Hono();
		app.use("/*", etag());
		app.get("/error", (c) => c.json({ error: "not found" }, 404));

		const res = await app.request("/error");
		expect(res.status).toBe(404);
		expect(res.headers.get("ETag")).toBeNull();
	});
});
