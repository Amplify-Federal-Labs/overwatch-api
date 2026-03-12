import type { ObservationWithEntities } from "../db/synthesis-repository";
import { Signal, type RelevanceOverride } from "../domain/signal";
import type { SignalType } from "../domain/types";

export interface IngestedItemWithObservations {
	id: string;
	sourceType: string;
	sourceName: string;
	sourceUrl: string | null;
	sourceLink: string | null;
	content: string;
	sourceMetadata: Record<string, string> | null;
	relevanceScore: number | null;
	relevanceRationale: string | null;
	competencyCodes: string[] | null;
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
	type: SignalType;
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

export { type RelevanceOverride } from "../domain/signal";

export function materializeSignal(
	item: IngestedItemWithObservations,
	entityRelevanceScores: Record<string, number>,
	relevanceOverride?: RelevanceOverride,
): MaterializedSignal {
	const signal = Signal.materialize(
		{
			id: item.id,
			sourceName: item.sourceName,
			sourceUrl: item.sourceUrl,
			content: item.content,
			sourceMetadata: item.sourceMetadata,
			createdAt: item.createdAt,
			observations: item.observations.map((o) => ({
				type: o.type,
				summary: o.summary,
				sourceDate: o.sourceDate,
				entityMentions: o.entities.map((e) => ({
					entityType: e.entityType,
					rawName: e.rawName,
					role: e.role,
					entityProfileId: e.entityProfileId,
					resolvedAt: e.resolvedAt,
				})),
			})),
		},
		entityRelevanceScores,
		relevanceOverride,
	);

	return {
		id: signal.id,
		ingestedItemId: signal.ingestedItemId,
		title: signal.title,
		summary: signal.summary,
		date: signal.date,
		branch: signal.branch,
		source: signal.source,
		type: signal.type,
		relevance: signal.relevance,
		relevanceRationale: signal.relevanceRationale,
		tags: signal.tags,
		competencies: signal.competencies,
		play: signal.play,
		competitors: signal.competitors,
		vendors: signal.vendors,
		stakeholders: signal.stakeholders,
		entities: signal.entities,
		sourceUrl: signal.sourceUrl,
		sourceMetadata: signal.sourceMetadata,
		createdAt: signal.createdAt,
		updatedAt: signal.updatedAt,
	};
}

export interface MaterializationResult {
	materialized: number;
	skipped: number;
	remaining: number;
	startedAt: string;
}

export const SELF_SCHEDULE_DELAY_SECONDS = 1;

export function shouldSelfSchedule(result: MaterializationResult): boolean {
	return result.remaining > 0 && result.materialized > 0;
}
