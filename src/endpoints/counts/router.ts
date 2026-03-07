import { Hono } from "hono";
import { fromHono } from "chanfana";
import { CountsList } from "./countsList";

export const countsRouter = fromHono(new Hono());
countsRouter.get("/", CountsList);
