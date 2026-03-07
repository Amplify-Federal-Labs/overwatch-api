import { z } from "zod";

export const PersonDossierSchema = z.object({
	kind: z.literal("person"),
	title: z.string(),
	org: z.string(),
	branch: z.string(),
	programs: z.array(z.string()),
	rank: z.string().optional(),
	education: z.array(z.string()),
	careerHistory: z.array(z.object({
		role: z.string(),
		org: z.string(),
		years: z.string(),
	})),
	focusAreas: z.array(z.string()),
	decorations: z.array(z.string()),
	bioSourceUrl: z.string().optional(),
});
export type PersonDossier = z.infer<typeof PersonDossierSchema>;

export const AgencyDossierSchema = z.object({
	kind: z.literal("agency"),
	mission: z.string(),
	branch: z.string(),
	programs: z.array(z.string()),
	parentOrg: z.string(),
	leadership: z.array(z.string()),
	focusAreas: z.array(z.string()),
});
export type AgencyDossier = z.infer<typeof AgencyDossierSchema>;

export const DossierSchema = z.discriminatedUnion("kind", [
	PersonDossierSchema,
	AgencyDossierSchema,
]);
export type Dossier = z.infer<typeof DossierSchema>;

export const EnrichmentStatusEnum = z.enum(["pending", "enriched", "failed", "skipped"]);
export type EnrichmentStatus = z.infer<typeof EnrichmentStatusEnum>;
