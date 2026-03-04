import type { KPI } from "../schemas";

export const mockKPIs: KPI[] = [
	{ label: "New Task Orders", value: 23, prev: 18, type: "task-orders" },
	{ label: "IT Strategy Updates", value: 7, prev: 5, type: "strategy-updates" },
	{ label: "SW Factory Signals", value: 4, prev: 6, type: "sw-factory" },
	{ label: "AI/ML Awards", value: 12, prev: 9, type: "ai-ml" },
	{ label: "Competitor Moves", value: 31, prev: 28, type: "competitor-moves" },
	{ label: "Stakeholder Mentions", value: 15, prev: 12, type: "stakeholder-mentions" },
];
