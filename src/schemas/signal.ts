import { z } from "zod";

export const SignalSourceTypeEnum = z.enum([
	"sam_gov",
	"sam_gov_apbi",
	"rss",
	"mil_announcement",
	"fpds",
]);
export type SignalSourceType = z.infer<typeof SignalSourceTypeEnum>;

export const EntityTypeEnum = z.enum([
	"person",
	"agency",
	"program",
	"company",
	"technology",
	"contract_vehicle",
]);
export type EntityType = z.infer<typeof EntityTypeEnum>;

export const SignalAnalysisInputSchema = z.object({
	content: z.string(),
	sourceType: SignalSourceTypeEnum,
	sourceName: z.string(),
	sourceUrl: z.string().optional(),
	sourceLink: z.string().optional(),
	sourceMetadata: z.record(z.string(), z.string()).optional(),
});
export type SignalAnalysisInput = z.infer<typeof SignalAnalysisInputSchema>;
