import { z } from "zod";

export const InsightTypeEnum = z.enum([
	"competitor_assessment",
	"stakeholder_briefing",
	"agency_landscape",
	"opportunity_alert",
]);
export type InsightType = z.infer<typeof InsightTypeEnum>;

export const InsightSchema = z.object({
	id: z.number(),
	entityProfileId: z.string(),
	type: InsightTypeEnum,
	content: z.string(),
	observationWindow: z.string(),
	observationCount: z.number(),
	createdAt: z.string(),
});
export type Insight = z.infer<typeof InsightSchema>;
