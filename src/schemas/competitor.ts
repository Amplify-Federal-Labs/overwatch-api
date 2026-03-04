import { z } from "zod";

export const ThreatLevelEnum = z.enum(["high", "medium", "low"]);
export type ThreatLevel = z.infer<typeof ThreatLevelEnum>;

export const CompetitorActivitySchema = z.object({
	competitor: z.string(),
	activity: z.string(),
	date: z.string(),
	threat: ThreatLevelEnum,
	area: z.string(),
});
export type CompetitorActivity = z.infer<typeof CompetitorActivitySchema>;
