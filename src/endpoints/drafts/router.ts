import { Hono } from "hono";
import { fromHono } from "chanfana";
import { DraftList } from "./draftList";
import { DraftAccept } from "./draftAccept";
import { DraftReject } from "./draftReject";

export const draftsRouter = fromHono(new Hono());
draftsRouter.get("/", DraftList);
draftsRouter.post("/:id/accept", DraftAccept);
draftsRouter.post("/:id/reject", DraftReject);
