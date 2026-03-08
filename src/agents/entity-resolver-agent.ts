import { Agent, getAgentByName } from "agents";
import { EntityResolver } from "./entity-resolver";
import { EntityProfileRepository, groupUnresolvedByName } from "../db/entity-profile-repository";
import { createAiMatchFn } from "./entity-match-ai";
import type { SynthesisAgent } from "./synthesis-agent";
import type { EnrichmentAgent } from "./enrichment-agent";
import { Logger } from "../logger";

export interface ResolutionRunResult {
	unresolvedCount: number;
	groupCount: number;
	resolvedCount: number;
	newProfilesCreated: number;
	startedAt: string;
}

interface AgentState {
	lastRun?: string;
	lastResult?: ResolutionRunResult;
}

export class EntityResolverAgent extends Agent<Env, AgentState> {
	initialState: AgentState = {};

	async onRequest(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		const result = await this.runResolution();
		return new Response(JSON.stringify(result), {
			headers: { "Content-Type": "application/json" },
		});
	}

	async runResolution(): Promise<ResolutionRunResult> {
		const logger = new Logger(this.env.LOG_LEVEL);
		const repository = new EntityProfileRepository(this.env.DB);
		const aiMatchFn = createAiMatchFn(this.env);
		const resolver = new EntityResolver(aiMatchFn);
		const startedAt = new Date().toISOString();

		logger.info("Starting entity resolution");

		// Step 1: Get unresolved entities
		const unresolved = await repository.findUnresolvedEntities();
		if (unresolved.length === 0) {
			logger.info("No unresolved entities found");
			return { unresolvedCount: 0, groupCount: 0, resolvedCount: 0, newProfilesCreated: 0, startedAt };
		}

		logger.info("Found unresolved entities", { count: unresolved.length });

		// Step 2: Group by normalized name
		const groups = groupUnresolvedByName(unresolved);
		logger.info("Grouped into name clusters", { groupCount: groups.length });

		// Step 3: Get existing profiles with aliases
		const existingProfiles = await repository.findAllProfilesWithAliases();

		let resolvedCount = 0;
		let newProfilesCreated = 0;
		const newProfileIds: string[] = [];
		const resolvedProfileIds = new Set<string>();

		// Step 4: Resolve each group
		for (const group of groups) {
			try {
				const result = await resolver.resolveGroup(group, existingProfiles);
				let profileId = result.profileId;

				if (result.isNew) {
					// Create new profile
					profileId = await repository.createProfile(group.entityType, group.mostCommonRawName);
					newProfilesCreated++;
					newProfileIds.push(profileId);
					// Add to existing profiles for subsequent groups
					existingProfiles.push({
						id: profileId,
						canonicalName: group.mostCommonRawName,
						type: group.entityType,
						aliases: [group.mostCommonRawName],
						firstSeenAt: new Date().toISOString(),
						lastSeenAt: new Date().toISOString(),
						observationCount: 0,
						summary: null,
						trajectory: null,
						relevanceScore: null,
						lastSynthesizedAt: null,
						dossier: null,
						enrichmentStatus: "pending",
						lastEnrichedAt: null,
						createdAt: new Date().toISOString(),
					});
				}

				if (profileId) {
					// Resolve all entities in this group
					const entityIds = group.entities.map((e) => e.id);
					await repository.resolveEntities(entityIds, profileId);
					resolvedCount += entityIds.length;
					resolvedProfileIds.add(profileId);

					// Add alias if it's a fuzzy match (the raw name may differ from canonical)
					if (result.matchMethod === "ai_fuzzy") {
						await repository.addAlias(profileId, group.mostCommonRawName);
					}

					// Update profile stats
					await repository.updateProfileStats(profileId);
				}
			} catch (err) {
				logger.error("Failed to resolve group", {
					name: group.mostCommonRawName,
					error: err instanceof Error ? err : new Error(String(err)),
				});
			}
		}

		const runResult: ResolutionRunResult = {
			unresolvedCount: unresolved.length,
			groupCount: groups.length,
			resolvedCount,
			newProfilesCreated,
			startedAt,
		};

		this.setState({
			lastRun: new Date().toISOString(),
			lastResult: runResult,
		});

		logger.info("Entity resolution complete", { ...runResult });

		// Chain: queue synthesis + enrichment in parallel (fire-and-forget)
		const allResolvedProfileIds = [...resolvedProfileIds];
		if (allResolvedProfileIds.length > 0) {
			try {
				const synthesis = await getAgentByName<Env, SynthesisAgent>(
					this.env.SYNTHESIS,
					"singleton",
				);
				await synthesis.queue("synthesizeProfiles", allResolvedProfileIds);
				logger.info("Synthesis queued after entity resolution", { profileIds: allResolvedProfileIds });
			} catch (err) {
				logger.error("Failed to queue synthesis", {
					error: err instanceof Error ? err : new Error(String(err)),
				});
			}

			if (newProfileIds.length > 0) {
				try {
					const enrichment = await getAgentByName<Env, EnrichmentAgent>(
						this.env.ENRICHMENT,
						"singleton",
					);
					await enrichment.queue("enrichProfiles", newProfileIds);
					logger.info("Enrichment queued after entity resolution", { profileIds: newProfileIds });
				} catch (err) {
					logger.error("Failed to queue enrichment", {
						error: err instanceof Error ? err : new Error(String(err)),
					});
				}
			}
		}

		return runResult;
	}
}
