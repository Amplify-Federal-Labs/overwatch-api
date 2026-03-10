import { Hono } from "hono";
import { fromHono } from "chanfana";
import { MetricsList } from "./metricsList";

export const metricsRouter = fromHono(new Hono());
metricsRouter.get("/", MetricsList);
