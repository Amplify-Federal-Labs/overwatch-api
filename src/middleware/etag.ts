import type { MiddlewareHandler } from "hono";

export function etag(): MiddlewareHandler {
	return async (c, next) => {
		await next();

		if (c.req.method !== "GET" || c.res.status !== 200) {
			return;
		}

		const body = await c.res.clone().text();
		const hashBuffer = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(body),
		);
		const hashHex = Array.from(new Uint8Array(hashBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		const etagValue = `"${hashHex}"`;

		const ifNoneMatch = c.req.header("If-None-Match");
		if (ifNoneMatch === etagValue) {
			c.res = new Response(null, { status: 304 });
			return;
		}

		c.res.headers.set("ETag", etagValue);
	};
}
