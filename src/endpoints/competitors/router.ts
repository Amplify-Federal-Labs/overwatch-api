import { Hono } from "hono";
import { fromHono } from "chanfana";
import { CompetitorActivityList } from "./competitorActivityList";

export const competitorsRouter = fromHono(new Hono());
competitorsRouter.get("/activity", CompetitorActivityList);
