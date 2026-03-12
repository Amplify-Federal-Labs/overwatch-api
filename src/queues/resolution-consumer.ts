import type { MatchableProfile, ResolutionResult } from "../agents/entity-resolver";
import type { UnresolvedGroup } from "../db/entity-profile-repository";
import { UnresolvedGroup as DomainUnresolvedGroup } from "../domain/unresolved-group";
import type { SynthesisMessage, EnrichmentMessage } from "./types";

const ENRICHABLE_TYPES: ReadonlySet<string> = new Set(["person", "agency", "company"]);

export interface ResolutionConsumerResult {
	readonly observationId: number;
	readonly resolvedCount: number;
	readonly newProfilesCreated: number;
	readonly failedGroups: string[];
}

interface QueueSender<T> {
	send(message: T): Promise<void>;
}

interface ResolutionRepository {
	findAllProfilesWithAliases(): Promise<
		Array<{ id: string; canonicalName: string; type: string; aliases: string[] }>
	>;
	createProfile(type: string, canonicalName: string): Promise<string>;
	resolveGroupBatch(
		entityIds: number[],
		profileId: string,
		addAlias: boolean,
		aliasName: string,
	): Promise<void>;
}

interface EntityResolverService {
	resolveGroup(
		group: UnresolvedGroup,
		existingProfiles: MatchableProfile[],
	): Promise<ResolutionResult>;
}

interface ResolutionLogger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
	debug(message: string, data?: Record<string, unknown>): void;
}

export interface ResolutionDeps {
	readonly synthesisQueue: QueueSender<SynthesisMessage>;
	readonly enrichmentQueue: QueueSender<EnrichmentMessage>;
	readonly repository: ResolutionRepository;
	readonly resolver: EntityResolverService;
	readonly logger: ResolutionLogger;
}

export interface ResolutionInput {
	readonly observationId: number;
	readonly entities: ReadonlyArray<{
		readonly rawName: string;
		readonly entityType: string;
		readonly role: string;
	}>;
}

export async function handleResolution(
	input: ResolutionInput,
	deps: ResolutionDeps,
): Promise<ResolutionConsumerResult> {
	const { synthesisQueue, enrichmentQueue, repository, resolver, logger } = deps;

	if (input.entities.length === 0) {
		return { observationId: input.observationId, resolvedCount: 0, newProfilesCreated: 0, failedGroups: [] };
	}

	// Load existing profiles with aliases for matching
	const dbProfiles = await repository.findAllProfilesWithAliases();
	const existingProfiles: MatchableProfile[] = dbProfiles.map((p) => ({
		id: p.id,
		canonicalName: p.canonicalName,
		type: p.type,
		matchesAlias(name: string): boolean {
			const normalized = name.toLowerCase().trim();
			return p.aliases.some((a) => a.toLowerCase().trim() === normalized);
		},
	}));

	// Build one UnresolvedGroup per entity mention
	const groups: UnresolvedGroup[] = input.entities.map((entity, index) =>
		DomainUnresolvedGroup.single({
			// Use negative IDs based on observationId to create unique placeholder IDs
			// These won't match real DB IDs but the resolution consumer doesn't use them for DB lookups
			id: -(input.observationId * 1000 + index),
			observationId: input.observationId,
			rawName: entity.rawName,
			entityType: entity.entityType,
			role: entity.role,
		}),
	);

	let resolvedCount = 0;
	let newProfilesCreated = 0;
	const resolvedProfileIds = new Set<string>();
	const newProfiles: Array<{ profileId: string; entityType: string; canonicalName: string }> = [];
	const failedGroups: string[] = [];

	for (const group of groups) {
		try {
			const result: ResolutionResult = await resolver.resolveGroup(group, existingProfiles);
			let profileId = result.profileId;

			if (result.isNew) {
				profileId = await repository.createProfile(group.entityType, group.mostCommonRawName);
				newProfilesCreated++;
				newProfiles.push({
					profileId,
					entityType: group.entityType,
					canonicalName: group.mostCommonRawName,
				});
				// Add to existing profiles so subsequent entities in same batch can match
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
				resolvedCount++;
				resolvedProfileIds.add(profileId);
			}
		} catch (err) {
			failedGroups.push(group.normalizedName);
			logger.error("Failed to resolve entity group", {
				name: group.mostCommonRawName,
				observationId: input.observationId,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	// Fan-out: produce synthesis messages for all resolved profiles
	for (const profileId of resolvedProfileIds) {
		await synthesisQueue.send({ type: "synthesis", profileId });
	}

	// Fan-out: produce enrichment messages for new enrichable profiles only
	for (const newProfile of newProfiles) {
		if (ENRICHABLE_TYPES.has(newProfile.entityType)) {
			await enrichmentQueue.send({
				type: "enrichment",
				profileId: newProfile.profileId,
				entityType: newProfile.entityType,
				canonicalName: newProfile.canonicalName,
			});
		}
	}

	logger.info("Resolution complete for observation", {
		observationId: input.observationId,
		resolvedCount,
		newProfilesCreated,
		failedGroups,
	});

	return {
		observationId: input.observationId,
		resolvedCount,
		newProfilesCreated,
		failedGroups,
	};
}
