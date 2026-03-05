import { Hono } from "hono";
import { fromHono } from "chanfana";
import { CronTrigger } from "./cronTrigger";

export const cronRouter = fromHono(new Hono());
cronRouter.post("/:jobName", CronTrigger);
