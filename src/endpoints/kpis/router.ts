import { Hono } from "hono";
import { fromHono } from "chanfana";
import { KpiList } from "./kpiList";

export const kpisRouter = fromHono(new Hono());
kpisRouter.get("/", KpiList);
