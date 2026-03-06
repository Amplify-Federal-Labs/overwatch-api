import { z } from "zod";
import { EntityTypeEnum } from "./signal";

export const ObservationTypeEnum = z.enum([
	"contract_award",
	"personnel_move",
	"budget_signal",
	"technology_adoption",
	"solicitation",
	"policy_change",
	"partnership",
	"program_milestone",
]);
export type ObservationType = z.infer<typeof ObservationTypeEnum>;

export const EntityRoleEnum = z.enum(["subject", "object", "mentioned"]);
export type EntityRole = z.infer<typeof EntityRoleEnum>;

export const EntityRefSchema = z.object({
	type: EntityTypeEnum,
	name: z.string(),
	role: EntityRoleEnum,
});
export type EntityRef = z.infer<typeof EntityRefSchema>;

export const ObservationExtractionSchema = z.object({
	type: ObservationTypeEnum,
	summary: z.string(),
	entities: z.array(EntityRefSchema),
	attributes: z.record(z.string(), z.string()).optional(),
	sourceDate: z.string().optional(),
});
export type ObservationExtraction = z.infer<typeof ObservationExtractionSchema>;

export const ObservationExtractionResultSchema = z.object({
	observations: z.array(ObservationExtractionSchema),
});
export type ObservationExtractionResult = z.infer<typeof ObservationExtractionResultSchema>;
