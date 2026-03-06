import type { CompetitorActivity, ThreatLevel } from "../../schemas";

export interface ObservationForCompetitor {
	type: string;
	summary: string;
	sourceDate: string | null;
	createdAt: string;
	companyName: string;
	agencyName: string | null;
}

const THREAT_BY_OBSERVATION_TYPE: Record<string, ThreatLevel> = {
	contract_award: "high",
	partnership: "medium",
	solicitation: "low",
	technology_adoption: "medium",
	program_milestone: "low",
	budget_signal: "low",
	personnel_move: "low",
	policy_change: "low",
};

export function transformObservationToActivity(obs: ObservationForCompetitor): CompetitorActivity {
	return {
		competitor: obs.companyName,
		activity: obs.summary,
		date: obs.sourceDate ?? obs.createdAt.split("T")[0],
		threat: THREAT_BY_OBSERVATION_TYPE[obs.type] ?? "low",
		area: obs.agencyName ?? obs.type,
	};
}
