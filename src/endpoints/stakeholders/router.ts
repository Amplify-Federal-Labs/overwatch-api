import { Hono } from "hono";
import { fromHono } from "chanfana";
import { StakeholderList } from "./stakeholderList";
import { StakeholderDetail } from "./stakeholderDetail";

export const stakeholdersRouter = fromHono(new Hono());
stakeholdersRouter.get("/", StakeholderList);
stakeholdersRouter.get("/:id", StakeholderDetail);
