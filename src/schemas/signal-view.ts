import { z } from "zod";

export const SignalTypeEnum = z.enum(["opportunity", "strategy", "competitor"]);
export type SignalType = z.infer<typeof SignalTypeEnum>;

export const SignalEntitySchema = z.object({
	type: z.string(),
	value: z.string(),
	confidence: z.number(),
});

export const SignalViewSchema = z.object({
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
	competitors: z.array(z.string()),
	vendors: z.array(z.string()),
	entities: z.array(SignalEntitySchema),
	sourceUrl: z.string(),
	sourceMetadata: z.record(z.string(), z.string()).nullable(),
});
export type SignalView = z.infer<typeof SignalViewSchema>;
