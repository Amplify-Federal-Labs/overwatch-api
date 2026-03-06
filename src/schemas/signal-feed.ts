import { z } from "zod";
import { SignalSourceTypeEnum, EntityTypeEnum } from "./signal";
import { ObservationTypeEnum, EntityRoleEnum } from "./observation";

export const ObservationEntityRefResponseSchema = z.object({
	id: z.number(),
	observationId: z.number(),
	role: EntityRoleEnum,
	entityType: EntityTypeEnum,
	rawName: z.string(),
	entityProfileId: z.string().nullable(),
	resolvedAt: z.string().nullable(),
});

export const ObservationResponseSchema = z.object({
	id: z.number(),
	signalId: z.string(),
	type: ObservationTypeEnum,
	summary: z.string(),
	attributes: z.record(z.string(), z.string()).nullable(),
	sourceDate: z.string().nullable(),
	createdAt: z.string(),
	entities: z.array(ObservationEntityRefResponseSchema),
});

export const SignalFeedItemSchema = z.object({
	id: z.string(),
	sourceType: SignalSourceTypeEnum,
	sourceName: z.string(),
	sourceUrl: z.string().nullable(),
	sourceLink: z.string().nullable(),
	content: z.string(),
	sourceMetadata: z.record(z.string(), z.string()).nullable(),
	createdAt: z.string(),
	observations: z.array(ObservationResponseSchema),
});
export type SignalFeedItem = z.infer<typeof SignalFeedItemSchema>;
