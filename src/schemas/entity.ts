import { z } from "zod";
import { EntityTypeEnum } from "./signal";

export const EntityProfileSchema = z.object({
	id: z.string(),
	type: EntityTypeEnum,
	canonicalName: z.string(),
	firstSeenAt: z.string(),
	lastSeenAt: z.string(),
	observationCount: z.number(),
	summary: z.string().nullable(),
	trajectory: z.string().nullable(),
	relevanceScore: z.number().nullable(),
	lastSynthesizedAt: z.string().nullable(),
	createdAt: z.string(),
});
export type EntityProfile = z.infer<typeof EntityProfileSchema>;

export const RelationshipTypeEnum = z.enum([
	"works_at",
	"manages",
	"awarded_to",
	"competes_with",
	"partners_with",
	"funds",
	"oversees",
]);
export type RelationshipType = z.infer<typeof RelationshipTypeEnum>;

export const EntityRelationshipSchema = z.object({
	id: z.number(),
	sourceEntityId: z.string(),
	targetEntityId: z.string(),
	type: RelationshipTypeEnum,
	observationCount: z.number(),
	firstSeenAt: z.string(),
	lastSeenAt: z.string(),
});
export type EntityRelationship = z.infer<typeof EntityRelationshipSchema>;

export const AliasSourceEnum = z.enum(["auto", "manual"]);
export type AliasSource = z.infer<typeof AliasSourceEnum>;

export const EntityAliasSchema = z.object({
	id: z.number(),
	entityProfileId: z.string(),
	alias: z.string(),
	source: AliasSourceEnum,
	createdAt: z.string(),
});
export type EntityAlias = z.infer<typeof EntityAliasSchema>;
