import type { KPI } from "../../schemas";

export interface KpiCounts {
	totalSignals: number;
	totalObservations: number;
	totalEntityProfiles: number;
	totalInsights: number;
	recentSignals: number;
	recentObservations: number;
}

export function buildKpis(counts: KpiCounts): KPI[] {
	return [
		{
			label: "Signals Ingested",
			value: counts.totalSignals,
			prev: counts.totalSignals - counts.recentSignals,
			type: "strategy-updates",
		},
		{
			label: "Observations Extracted",
			value: counts.totalObservations,
			prev: counts.totalObservations - counts.recentObservations,
			type: "task-orders",
		},
		{
			label: "Entities Tracked",
			value: counts.totalEntityProfiles,
			prev: 0,
			type: "stakeholder-mentions",
		},
		{
			label: "Insights Generated",
			value: counts.totalInsights,
			prev: 0,
			type: "competitor-moves",
		},
	];
}
