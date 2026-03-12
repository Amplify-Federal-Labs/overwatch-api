import type { EntityResolver, MatchableProfile, ResolutionResult } from "./entity-resolver";
import type { UnresolvedGroup } from "../db/entity-profile-repository";

export interface ResolveGroupsRepository {
	createProfile(type: string, canonicalName: string): Promise<string>;
	resolveGroupBatch(
		entityIds: number[],
		profileId: string,
		addAlias: boolean,
		aliasName: string,
	): Promise<void>;
}

export interface ResolveGroupsLogger {
	info(msg: string, meta?: Record<string, unknown>): void;
	warn(msg: string, meta?: Record<string, unknown>): void;
	error(msg: string, meta?: Record<string, unknown>): void;
	debug(msg: string, meta?: Record<string, unknown>): void;
}

export interface ResolveGroupsDeps {
	resolver: EntityResolver;
	repository: ResolveGroupsRepository;
	existingProfiles: MatchableProfile[];
	logger: ResolveGroupsLogger;
}

export interface ResolveGroupsResult {
	resolvedCount: number;
	newProfilesCreated: number;
	newProfileIds: string[];
	resolvedProfileIds: string[];
	failedGroups: string[];
}

export async function resolveGroups(
	groups: UnresolvedGroup[],
	deps: ResolveGroupsDeps,
): Promise<ResolveGroupsResult> {
	const { resolver, repository, existingProfiles, logger } = deps;

	let resolvedCount = 0;
	let newProfilesCreated = 0;
	const newProfileIds: string[] = [];
	const resolvedProfileIds = new Set<string>();
	const failedGroups: string[] = [];

	for (const group of groups) {
		try {
			const result: ResolutionResult = await resolver.resolveGroup(group, existingProfiles);
			let profileId = result.profileId;

			if (result.isNew) {
				profileId = await repository.createProfile(group.entityType, group.mostCommonRawName);
				newProfilesCreated++;
				newProfileIds.push(profileId);
				const canonicalName = group.mostCommonRawName;
				existingProfiles.push({
					id: profileId,
					canonicalName,
					type: group.entityType,
					matchesAlias(name: string): boolean {
						return name.toLowerCase().trim() === canonicalName.toLowerCase().trim();
					},
				});
			}

			if (profileId) {
				const entityIds = group.entities.map((e) => e.id);
				const addAlias = result.matchMethod === "ai_fuzzy";
				await repository.resolveGroupBatch(entityIds, profileId, addAlias, group.mostCommonRawName);
				resolvedCount += entityIds.length;
				resolvedProfileIds.add(profileId);
			}
		} catch (err) {
			failedGroups.push(group.normalizedName);
			logger.error("Failed to resolve group", {
				name: group.mostCommonRawName,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return {
		resolvedCount,
		newProfilesCreated,
		newProfileIds,
		resolvedProfileIds: [...resolvedProfileIds],
		failedGroups,
	};
}
