import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { kpisRouter } from "./endpoints/kpis/router";
import { signalsRouter } from "./endpoints/signals/router";
import { stakeholdersRouter } from "./endpoints/stakeholders/router";
import { competitorsRouter } from "./endpoints/competitors/router";
import { interactionsRouter } from "./endpoints/interactions/router";
import { draftsRouter } from "./endpoints/drafts/router";
import { cronRouter } from "./endpoints/cron/router";
import { getScheduledJob } from "./cron/scheduler";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// CORS — allow frontend origins
app.use("/*", cors({
	origin: [
		"http://localhost:5173",
		"https://overwatch-d0f.pages.dev",
		"https://*.overwatch-d0f.pages.dev",
	],
	allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	allowHeaders: ["Content-Type"],
}));

app.onError((err, c) => {
	if (err instanceof ApiException) {
		// If it's a Chanfana ApiException, let Chanfana handle the response
		return c.json(
			{ success: false, errors: err.buildResponse() },
			err.status as ContentfulStatusCode,
		);
	}

	console.error("Global error handler caught:", err); // Log the error if it's not known

	// For other errors, return a generic 500 response
	return c.json(
		{
			success: false,
			errors: [{ code: 7000, message: "Internal Server Error" }],
		},
		500,
	);
});

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
	schema: {
		info: {
			title: "Overwatch API",
			version: "1.0.0",
			description: "Intelligence and relationship management API for Amplify Federal.",
		},
	},
});

// Register routers
openapi.route("/kpis", kpisRouter);
openapi.route("/signals", signalsRouter);
openapi.route("/stakeholders", stakeholdersRouter);
openapi.route("/competitors", competitorsRouter);
openapi.route("/interactions", interactionsRouter);
openapi.route("/drafts", draftsRouter);
openapi.route("/cron", cronRouter);

// Named export for testing (Hono's app.request() method)
export { app };

// Export the Worker with fetch and scheduled handlers
export default {
	fetch: app.fetch,
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		const hour = new Date(event.scheduledTime).getUTCHours();
		const job = getScheduledJob(hour);
		ctx.waitUntil(
			job.run(env).then((result) => {
				console.log(`Cron job "${job.name}" completed:`, JSON.stringify(result));
			}).catch((err) => {
				console.error(`Cron job "${job.name}" failed:`, err);
			})
		);
	},
};
