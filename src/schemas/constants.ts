import { z } from "zod";

export const OutreachPlaySchema = z.object({
	id: z.string(),
	name: z.string(),
	trigger: z.string(),
	angle: z.string(),
});
export type OutreachPlay = z.infer<typeof OutreachPlaySchema>;

export const CompetencyCodeEnum = z.enum(["A", "B", "C", "D", "E", "F"]);
export type CompetencyCode = z.infer<typeof CompetencyCodeEnum>;

export const COMPETENCY_CLUSTERS: Record<CompetencyCode, { name: string; short: string }> = {
	A: { name: "Software Factory Stand-Up & Delivery", short: "Software Factory" },
	B: { name: "Classified Platform Engineering (IL5/IL6)", short: "Platform Engineering" },
	C: { name: "Mission-Critical Modernization", short: "Modernization" },
	D: { name: "Enterprise IT Operations", short: "IT Operations" },
	E: { name: "Enterprise Data Engineering & AI", short: "Data/AI" },
	F: { name: "ISR/GEOINT/Distributed Systems", short: "ISR/GEOINT" },
};

export const CompetencyClusterSchema = z.object({
	name: z.string(),
	short: z.string(),
});
export type CompetencyCluster = z.infer<typeof CompetencyClusterSchema>;
