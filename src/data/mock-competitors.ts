import type { CompetitorActivity, Interaction } from "../schemas";

export const mockCompetitorActivity: CompetitorActivity[] = [
	{ competitor: "Peraton", activity: "Won $45M USMC DCI platform modernization", date: "2026-02-28", threat: "high", area: "SW Factory" },
	{ competitor: "ECS", activity: "Won $28M Navy AI analytics under Seaport-e", date: "2026-02-27", threat: "high", area: "Data/AI" },
	{ competitor: "Booz Allen", activity: "Hiring surge: 12 Databricks engineers (cleared)", date: "2026-02-25", threat: "medium", area: "Data/AI" },
	{ competitor: "SAIC", activity: "Partnership with W&B for DoD MLOps", date: "2026-02-24", threat: "medium", area: "IL5/IL6" },
	{ competitor: "Leidos", activity: "Won $62M DISA infrastructure modernization", date: "2026-02-22", threat: "low", area: "IT Ops" },
	{ competitor: "ECS", activity: "Published case study on CDAO Advana integration", date: "2026-02-20", threat: "medium", area: "Data/AI" },
];

export const initialInteractions: Record<string, Interaction[]> = {
	st4: [
		{
			id: "int1",
			date: "2026-01-22",
			type: "conference",
			title: "AFCEA West 2026",
			summary: "Brief intro at the Navy cloud panel. He was interested in our STIG automation approach. Exchanged cards. Mentioned he'd be at WEST 2026 in March.",
			sentiment: "positive",
			followUp: "Follow up at WEST 2026 — reference STIG conversation",
		},
	],
};
