import { Hono } from "hono";
import { fromHono } from "chanfana";
import { StakeholderList } from "./stakeholderList";

export const stakeholdersRouter = fromHono(new Hono());
stakeholdersRouter.get("/", StakeholderList);
