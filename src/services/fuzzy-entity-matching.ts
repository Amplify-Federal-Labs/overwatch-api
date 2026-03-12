export interface FuzzyMatchCandidate {
	id: string;
	canonicalName: string;
}

export interface FuzzyMatchResult {
	matchedId: string | null;
	confidence: number;
}

export interface FuzzyEntityMatchingService {
	match(
		candidateName: string,
		entityType: string,
		candidates: FuzzyMatchCandidate[],
	): Promise<FuzzyMatchResult>;
}
