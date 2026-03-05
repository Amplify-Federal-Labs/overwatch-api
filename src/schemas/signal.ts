import { z } from "zod";

export const SignalTypeEnum = z.enum(["opportunity", "strategy", "competitor"]);
export type SignalType = z.infer<typeof SignalTypeEnum>;

export const CompetencyCodeEnum = z.enum(["A", "B", "C", "D", "E", "F"]);
export type CompetencyCode = z.infer<typeof CompetencyCodeEnum>;

export const PlayIdEnum = z.enum([
	"modernization",
	"navigator",
	"softwarefactory",
	"jumpfence",
	"classifiedai",
]);
export type PlayId = z.infer<typeof PlayIdEnum>;

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

export const ExtractedEntitySchema = z.object({
	type: EntityTypeEnum,
	value: z.string(),
	confidence: z.number().min(0).max(1),
});
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;

export const FpdsContractMetadataSchema = z.object({
	sourceType: z.literal("fpds"),
	piid: z.string(),
	modNumber: z.string(),
	referencedPiid: z.string().optional(),
	agencyId: z.string(),
	agencyName: z.string(),
	vendorName: z.string(),
	description: z.string().optional(),
	obligatedAmount: z.string(),
	totalObligatedAmount: z.string(),
	naicsCode: z.string().optional(),
	naicsDescription: z.string().optional(),
	pscCode: z.string().optional(),
	pscDescription: z.string().optional(),
	signedDate: z.string().optional(),
	performanceState: z.string().optional(),
	contractType: z.string().optional(),
	competitionType: z.string().optional(),
});
export type FpdsContractMetadata = z.infer<typeof FpdsContractMetadataSchema>;

export const SourceMetadataSchema = z.discriminatedUnion("sourceType", [
	FpdsContractMetadataSchema,
]);
export type SourceMetadata = z.infer<typeof SourceMetadataSchema>;

export const SignalSchema = z.object({
	id: z.string(),
	date: z.string(),
	branch: z.string(),
	source: z.string(),
	title: z.string(),
	summary: z.string(),
	tags: z.array(z.string()),
	relevance: z.number(),
	type: SignalTypeEnum,
	competencies: z.array(z.string()),
	play: z.string(),
	starred: z.boolean(),
	stakeholderIds: z.array(z.string()),
	competitors: z.array(z.string()).optional(),
	vendors: z.array(z.string()).optional(),
	sourceUrl: z.string().optional(),
	sourceMetadata: SourceMetadataSchema.optional(),
});
export type Signal = z.infer<typeof SignalSchema>;

export const SignalAnalysisInputSchema = z.object({
	content: z.string(),
	sourceType: SignalSourceTypeEnum,
	sourceName: z.string(),
	sourceUrl: z.string().optional(),
	sourceLink: z.string().optional(),
	sourceMetadata: SourceMetadataSchema.optional(),
});
export type SignalAnalysisInput = z.infer<typeof SignalAnalysisInputSchema>;

export const SignalAnalysisResultSchema = z.object({
	title: z.string(),
	summary: z.string(),
	type: SignalTypeEnum,
	branch: z.string(),
	tags: z.array(z.string()),
	competencies: z.array(CompetencyCodeEnum),
	play: PlayIdEnum.nullable(),
	relevance: z.number(),
	entities: z.array(ExtractedEntitySchema),
});
export type SignalAnalysisResult = z.infer<typeof SignalAnalysisResultSchema>;
