import { z } from "zod";

export const InteractionSchema = z.object({
	id: z.string(),
	date: z.string(),
	type: z.string(),
	title: z.string(),
	summary: z.string(),
	sentiment: z.string(),
	followUp: z.string(),
});

export type Interaction = z.infer<typeof InteractionSchema>;
