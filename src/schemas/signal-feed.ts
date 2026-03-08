import { z } from "zod";
import { CompetencyCodeEnum } from "./constants";

export const SignalTypeEnum = z.enum(["opportunity", "strategy", "competitor"]);
export type SignalType = z.infer<typeof SignalTypeEnum>;

export const SignalEntitySchema = z.object({
	type: z.string(),
	value: z.string(),
	confidence: z.number(),
});

export const SignalStakeholderSchema = z.object({
	id: z.string(),
	name: z.string(),
});

export const SignalSchema = z.object({
	id: z.string(),
	date: z.string(),
	branch: z.string(),
	source: z.string(),
	title: z.string(),
	summary: z.string(),
	tags: z.array(z.string()),
	relevance: z.number(),
	relevanceRationale: z.string(),
	type: SignalTypeEnum,
	competencies: z.array(CompetencyCodeEnum),
	play: z.string(),
	starred: z.boolean(),
	stakeholders: z.array(SignalStakeholderSchema),
	competitors: z.array(z.string()),
	vendors: z.array(z.string()),
	entities: z.array(SignalEntitySchema),
	sourceUrl: z.string(),
	sourceMetadata: z.record(z.string(), z.string()).nullable(),
});
export type Signal = z.infer<typeof SignalSchema>;
