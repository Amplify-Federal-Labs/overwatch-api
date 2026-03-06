import type { UnresolvedGroup } from "../db/entity-profile-repository";

export interface EntityMatchResult {
	match: string | null;
	confidence?: number;
}

export interface ResolutionResult {
	profileId: string | null;
	isNew: boolean;
	matchMethod: "exact_alias" | "ai_fuzzy" | "new";
}

interface ProfileWithAliases {
	id: string;
	canonicalName: string;
	type: string;
	aliases: string[];
}

export type AiMatchFn = (name: string, candidates: string[]) => Promise<EntityMatchResult>;

export class EntityResolver {
	private aiMatch: AiMatchFn;

	constructor(aiMatch: AiMatchFn) {
		this.aiMatch = aiMatch;
	}

	async resolveGroup(
		group: UnresolvedGroup,
		existingProfiles: ProfileWithAliases[],
	): Promise<ResolutionResult> {
		// Filter to same entity type
		const sameTypeProfiles = existingProfiles.filter((p) => p.type === group.entityType);

		// Step 1: exact alias match (case-insensitive)
		const exactMatch = this.findExactAliasMatch(group.mostCommonRawName, sameTypeProfiles);
		if (exactMatch) {
			return { profileId: exactMatch, isNew: false, matchMethod: "exact_alias" };
		}

		// Step 2: AI fuzzy match (only if there are candidates)
		if (sameTypeProfiles.length > 0) {
			const candidates = sameTypeProfiles.map((p) => `${p.id}:${p.canonicalName}`);
			const aiResult = await this.aiMatch(group.mostCommonRawName, candidates);

			if (aiResult.match) {
				return { profileId: aiResult.match, isNew: false, matchMethod: "ai_fuzzy" };
			}
		}

		// Step 3: new profile needed
		return { profileId: null, isNew: true, matchMethod: "new" };
	}

	private findExactAliasMatch(name: string, profiles: ProfileWithAliases[]): string | null {
		const normalized = name.toLowerCase().trim();
		for (const profile of profiles) {
			for (const alias of profile.aliases) {
				if (alias.toLowerCase().trim() === normalized) {
					return profile.id;
				}
			}
		}
		return null;
	}
}
