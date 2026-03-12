import type { UnresolvedGroup } from "../db/entity-profile-repository";
import type { FuzzyEntityMatchingService } from "../services/fuzzy-entity-matching";

export interface EntityMatchResult {
	match: string | null;
	confidence?: number;
}

export interface ResolutionResult {
	profileId: string | null;
	isNew: boolean;
	matchMethod: "exact_alias" | "ai_fuzzy" | "new";
}

export interface MatchableProfile {
	id: string;
	canonicalName: string;
	type: string;
	matchesAlias(name: string): boolean;
}

export type AiMatchFn = (name: string, candidates: string[], entityType: string) => Promise<EntityMatchResult>;

export class EntityResolver {
	private fuzzyMatcher: FuzzyEntityMatchingService;

	constructor(fuzzyMatcher: FuzzyEntityMatchingService) {
		this.fuzzyMatcher = fuzzyMatcher;
	}

	async resolveGroup(
		group: UnresolvedGroup,
		existingProfiles: MatchableProfile[],
	): Promise<ResolutionResult> {
		const sameTypeProfiles = existingProfiles.filter((p) => p.type === group.entityType);

		// Step 1: exact alias match via domain behavior
		const exactMatch = sameTypeProfiles.find((p) => p.matchesAlias(group.mostCommonRawName));
		if (exactMatch) {
			return { profileId: exactMatch.id, isNew: false, matchMethod: "exact_alias" };
		}

		// Step 2: AI fuzzy match (only if there are candidates)
		if (sameTypeProfiles.length > 0) {
			const candidates = sameTypeProfiles.map((p) => ({
				id: p.id,
				canonicalName: p.canonicalName,
			}));
			const result = await this.fuzzyMatcher.match(
				group.mostCommonRawName,
				group.entityType,
				candidates,
			);

			if (result.matchedId) {
				return { profileId: result.matchedId, isNew: false, matchMethod: "ai_fuzzy" };
			}
		}

		// Step 3: new profile needed
		return { profileId: null, isNew: true, matchMethod: "new" };
	}
}
