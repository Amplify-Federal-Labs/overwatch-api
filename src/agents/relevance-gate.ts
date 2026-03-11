import type { ObservationExtraction } from "../schemas";
import type { RelevanceInput, ObservationSummary } from "./signal-relevance-scorer";

export function buildEarlyRelevanceInput(
	content: string,
	fetchedPageText: string | null,
	observations: ObservationExtraction[],
): RelevanceInput {
	const enrichedContent = fetchedPageText
		? `${content}\n\n--- Full source page ---\n${fetchedPageText}`
		: content;

	const observationSummaries: ObservationSummary[] = observations.map((obs) => ({
		type: obs.type,
		summary: obs.summary,
		entities: obs.entities.map((e) => ({
			type: e.type,
			name: e.name,
			role: e.role,
		})),
	}));

	return {
		content: enrichedContent,
		observations: observationSummaries,
		entityContext: [],
	};
}

export function applyThreshold(score: number, threshold: number): boolean {
	return score >= threshold;
}
