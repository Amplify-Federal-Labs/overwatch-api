import type { ObservationWithEntities } from "../../db/synthesis-repository";

export interface StoredSignalWithObservations {
	id: string;
	sourceType: string;
	sourceName: string;
	sourceUrl: string | null;
	sourceLink: string | null;
	content: string;
	sourceMetadata: Record<string, string> | null;
	createdAt: string;
	observations: ObservationWithEntities[];
}

export interface SignalUiView {
	id: string;
	date: string;
	branch: string;
	source: string;
	title: string;
	summary: string;
	tags: string[];
	relevance: number;
	type: "opportunity" | "strategy" | "competitor";
	competencies: string[];
	play: string;
	starred: boolean;
	stakeholderIds: string[];
	competitors: string[];
	vendors: string[];
	entities: { type: string; value: string; confidence: number }[];
	sourceUrl: string;
	sourceMetadata: Record<string, string> | null;
}

const OBSERVATION_TYPE_TO_SIGNAL_TYPE: Record<string, SignalUiView["type"]> = {
	contract_award: "opportunity",
	solicitation: "opportunity",
	budget_signal: "strategy",
	technology_adoption: "strategy",
	personnel_move: "strategy",
	policy_change: "strategy",
	partnership: "competitor",
	program_milestone: "strategy",
};

export function transformSignalForUi(
	signal: StoredSignalWithObservations,
	entityRelevanceScores: Record<string, number>,
): SignalUiView {
	const allEntities = signal.observations.flatMap((o) => o.entities);

	// Title: first observation summary, or content truncated
	const firstObs = signal.observations[0];
	const title = firstObs?.summary ?? truncate(signal.content, 120);

	// Summary: signal content
	const summary = signal.content;

	// Type: derived from primary observation type
	const primaryType = firstObs?.type ?? "";
	const type = OBSERVATION_TYPE_TO_SIGNAL_TYPE[primaryType] ?? "strategy";

	// Date: first observation sourceDate, or createdAt date
	const date = firstObs?.sourceDate ?? signal.createdAt.split("T")[0];

	// Branch: first agency entity
	const agencyEntities = allEntities.filter((e) => e.entityType === "agency");
	const branch = agencyEntities[0]?.rawName ?? "";

	// Tags: technology entities + observation attribute keys
	const tags = [
		...new Set(allEntities
			.filter((e) => e.entityType === "technology")
			.map((e) => e.rawName)),
	];

	// Vendors: company entities with subject role
	const vendors = [
		...new Set(allEntities
			.filter((e) => e.entityType === "company" && e.role === "subject")
			.map((e) => e.rawName)),
	];

	// Competitors: company entities with object or mentioned role (not the awardee)
	const competitors = [
		...new Set(allEntities
			.filter((e) => e.entityType === "company" && e.role !== "subject")
			.map((e) => e.rawName)),
	];

	// StakeholderIds: resolved person entity profile IDs
	const stakeholderIds = [
		...new Set(allEntities
			.filter((e) => e.entityType === "person" && e.entityProfileId)
			.map((e) => e.entityProfileId!)),
	];

	// Relevance: max relevance score of all linked entity profiles
	const profileIds = allEntities
		.map((e) => e.entityProfileId)
		.filter((id): id is string => id !== null);
	const relevance = profileIds.length > 0
		? Math.max(...profileIds.map((id) => entityRelevanceScores[id] ?? 0))
		: 0;

	// Entities: full list for expanded detail view
	const entities = allEntities.map((e) => ({
		type: e.entityType,
		value: e.rawName,
		confidence: e.resolvedAt ? 1.0 : 0.5,
	}));

	return {
		id: signal.id,
		date,
		branch,
		source: signal.sourceName,
		title,
		summary,
		tags,
		relevance,
		type,
		competencies: [],
		play: "",
		starred: false,
		stakeholderIds,
		competitors,
		vendors,
		entities,
		sourceUrl: signal.sourceUrl ?? "",
		sourceMetadata: signal.sourceMetadata,
	};
}

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 1) + "…";
}
