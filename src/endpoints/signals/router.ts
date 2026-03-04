import { Hono } from "hono";
import { fromHono } from "chanfana";
import { SignalList } from "./signalList";
import { SignalAnalyze } from "./signalAnalyze";

export const signalsRouter = fromHono(new Hono());
signalsRouter.get("/", SignalList);
signalsRouter.post("/analyze", SignalAnalyze);
