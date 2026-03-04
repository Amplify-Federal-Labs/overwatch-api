import { z } from "zod";

export const OutreachPlaySchema = z.object({
	id: z.string(),
	name: z.string(),
	trigger: z.string(),
	angle: z.string(),
});
export type OutreachPlay = z.infer<typeof OutreachPlaySchema>;

export const CompetencyClusterSchema = z.object({
	name: z.string(),
	short: z.string(),
});
export type CompetencyCluster = z.infer<typeof CompetencyClusterSchema>;
