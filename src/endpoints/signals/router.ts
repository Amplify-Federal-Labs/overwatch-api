import { Hono } from "hono";
import { fromHono } from "chanfana";
import { SignalList } from "./signalList";

export const signalsRouter = fromHono(new Hono());
signalsRouter.get("/", SignalList);
