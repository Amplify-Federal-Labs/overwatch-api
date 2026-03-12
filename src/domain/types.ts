export type EntityType = "person" | "agency" | "program" | "company" | "technology" | "contract_vehicle";

export type EntityRole = "subject" | "object" | "mentioned";

export type ObservationType =
	| "contract_award"
	| "personnel_move"
	| "budget_signal"
	| "technology_adoption"
	| "solicitation"
	| "policy_change"
	| "partnership"
	| "program_milestone";

export type SignalType = "opportunity" | "strategy" | "competitor";

export type EnrichmentStatus = "pending" | "enriched" | "failed" | "skipped";

export type AliasSource = "auto" | "manual";

export type RelationshipType =
	| "works_at"
	| "manages"
	| "awarded_to"
	| "competes_with"
	| "partners_with"
	| "funds"
	| "oversees";

export type InsightType =
	| "competitor_assessment"
	| "stakeholder_briefing"
	| "agency_landscape"
	| "opportunity_alert";

export type CompetencyCode = "A" | "B" | "C" | "D" | "E" | "F";
