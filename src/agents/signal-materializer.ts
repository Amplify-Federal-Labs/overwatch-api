import type { ObservationWithEntities } from "../db/synthesis-repository";

export interface IngestedItemWithObservations {
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

export interface MaterializedSignalEntity {
	type: string;
	value: string;
	confidence: number;
}

export interface MaterializedSignal {
	id: string;
	ingestedItemId: string;
	title: string;
	summary: string;
	date: string;
	branch: string;
	source: string;
	type: "opportunity" | "strategy" | "competitor";
	relevance: number;
	relevanceRationale: string;
	tags: string[];
	competencies: string[];
	play: string;
	competitors: string[];
	vendors: string[];
	stakeholders: { id: string; name: string }[];
	entities: MaterializedSignalEntity[];
	sourceUrl: string;
	sourceMetadata: Record<string, string> | null;
	createdAt: string;
	updatedAt: string;
}

export interface RelevanceOverride {
	score: number;
	rationale: string;
	competencyCodes: readonly string[];
}

const OBSERVATION_TYPE_TO_SIGNAL_TYPE: Record<string, MaterializedSignal["type"]> = {
	contract_award: "opportunity",
	solicitation: "opportunity",
	budget_signal: "strategy",
	technology_adoption: "strategy",
	personnel_move: "strategy",
	policy_change: "strategy",
	partnership: "competitor",
	program_milestone: "strategy",
};

export function materializeSignal(
	item: IngestedItemWithObservations,
	entityRelevanceScores: Record<string, number>,
	relevanceOverride?: RelevanceOverride,
): MaterializedSignal {
	const allEntities = item.observations.flatMap((o) => o.entities);

	const firstObs = item.observations[0];
	const title = firstObs?.summary ?? truncate(item.content, 120);
	const summary = item.content;

	const primaryType = firstObs?.type ?? "";
	const type = OBSERVATION_TYPE_TO_SIGNAL_TYPE[primaryType] ?? "strategy";

	const date = firstObs?.sourceDate ?? item.createdAt.split("T")[0];

	const agencyEntities = allEntities.filter((e) => e.entityType === "agency");
	const branch = agencyEntities[0]?.rawName ?? "";

	const tags = [
		...new Set(allEntities
			.filter((e) => e.entityType === "technology")
			.map((e) => e.rawName)),
	];

	const vendors = [
		...new Set(allEntities
			.filter((e) => e.entityType === "company" && e.role === "subject")
			.map((e) => e.rawName)),
	];

	const competitors = [
		...new Set(allEntities
			.filter((e) => e.entityType === "company" && e.role !== "subject")
			.map((e) => e.rawName)),
	];

	const stakeholders = dedupeStakeholders(
		allEntities
			.filter((e) => e.entityType === "person" && e.entityProfileId)
			.map((e) => ({ id: e.entityProfileId!, name: e.rawName })),
	);

	// Use AI-scored relevance when available, fall back to max entity profile score
	let relevance: number;
	let relevanceRationale: string;
	if (relevanceOverride) {
		relevance = relevanceOverride.score;
		relevanceRationale = relevanceOverride.rationale;
	} else {
		const profileIds = allEntities
			.map((e) => e.entityProfileId)
			.filter((id): id is string => id !== null);
		relevance = profileIds.length > 0
			? Math.max(...profileIds.map((id) => entityRelevanceScores[id] ?? 0))
			: 0;
		relevanceRationale = "";
	}

	const entities: MaterializedSignalEntity[] = allEntities.map((e) => ({
		type: e.entityType,
		value: e.rawName,
		confidence: e.resolvedAt ? 1.0 : 0.5,
	}));

	return {
		id: item.id,
		ingestedItemId: item.id,
		title,
		summary,
		date,
		branch,
		source: item.sourceName,
		type,
		relevance,
		relevanceRationale,
		tags,
		competencies: relevanceOverride ? [...relevanceOverride.competencyCodes] : [],
		play: "",
		competitors,
		vendors,
		stakeholders,
		entities,
		sourceUrl: item.sourceUrl ?? "",
		sourceMetadata: item.sourceMetadata,
		createdAt: item.createdAt,
		updatedAt: new Date().toISOString(),
	};
}

function dedupeStakeholders(items: { id: string; name: string }[]): { id: string; name: string }[] {
	const seen = new Set<string>();
	const result: { id: string; name: string }[] = [];
	for (const item of items) {
		if (!seen.has(item.id)) {
			seen.add(item.id);
			result.push(item);
		}
	}
	return result;
}

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 1) + "…";
}

export interface MaterializationResult {
	materialized: number;
	skipped: number;
	remaining: number;
	startedAt: string;
}

export const SELF_SCHEDULE_DELAY_SECONDS = 1;

/**
 * Determines whether the agent should self-schedule another batch.
 * Returns true only when there are remaining items AND the current batch
 * made progress (materialized > 0) to avoid infinite loops on persistent errors.
 */
export function shouldSelfSchedule(result: MaterializationResult): boolean {
	return result.remaining > 0 && result.materialized > 0;
}
