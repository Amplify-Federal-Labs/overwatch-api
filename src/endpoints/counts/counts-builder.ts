export interface TabCounts {
	signals: number;
	stakeholders: number;
	competitors: number;
}

export interface CountsResult {
	signals: number;
	stakeholders: number;
	competitors: number;
	interactions: number;
	drafts: number;
}

export function buildCounts(counts: TabCounts): CountsResult {
	return {
		signals: counts.signals,
		stakeholders: counts.stakeholders,
		competitors: counts.competitors,
		interactions: 0,
		drafts: 0,
	};
}
