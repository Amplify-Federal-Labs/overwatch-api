import { Hono } from "hono";
import { fromHono } from "chanfana";
import { InteractionList } from "./interactionList";

export const interactionsRouter = fromHono(new Hono());
interactionsRouter.get("/", InteractionList);
