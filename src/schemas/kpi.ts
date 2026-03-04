import { z } from "zod";

export const KpiSchema = z.object({
	label: z.string(),
	value: z.number(),
	prev: z.number(),
	type: z.string(),
});

export type KPI = z.infer<typeof KpiSchema>;
