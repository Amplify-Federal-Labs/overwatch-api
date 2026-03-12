import type { CompetencyCode } from "../domain/types";

export interface RelevanceObservation {
	type: string;
	summary: string;
	entities: { type: string; name: string; role: string }[];
}

export interface RelevanceEntityContext {
	name: string;
	type: string;
	summary: string | null;
}

export interface RelevanceInput {
	content: string;
	observations: RelevanceObservation[];
	entityContext: RelevanceEntityContext[];
}

export interface RelevanceResult {
	relevanceScore: number;
	rationale: string;
	competencyCodes: CompetencyCode[];
}

export interface RelevanceScoringService {
	score(input: RelevanceInput): Promise<RelevanceResult>;
}
