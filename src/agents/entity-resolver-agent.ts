import { Agent, getAgentByName } from "agents";
import { EntityResolver } from "./entity-resolver";
import { EntityProfileRepository, groupUnresolvedByName } from "../db/entity-profile-repository";
import { createAiMatchFn } from "./entity-match-ai";
import { resolveGroups } from "./entity-resolver-logic";
import type { SynthesisAgent } from "./synthesis-agent";
import type { EnrichmentAgent } from "./enrichment-agent";
import { Logger } from "../logger";

export interface ResolutionRunResult {
	unresolvedCount: number;
	groupCount: number;
	resolvedCount: number;
	newProfilesCreated: number;
	failedGroups: string[];
	startedAt: string;
}

interface AgentState {
	lastRun?: string;
	lastResult?: ResolutionRunResult;
	failedGroups?: string[];
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
			return { unresolvedCount: 0, groupCount: 0, resolvedCount: 0, newProfilesCreated: 0, failedGroups: [], startedAt };
		}

		logger.info("Found unresolved entities", { count: unresolved.length });

		// Step 2: Group by normalized name
		const groups = groupUnresolvedByName(unresolved);
		logger.info("Grouped into name clusters", { groupCount: groups.length });

		// Step 3: Get existing profiles with aliases
		const existingProfiles = await repository.findAllProfilesWithAliases();

		// Step 4: Resolve each group (batched DB ops, per-group error isolation)
		const result = await resolveGroups(groups, {
			resolver,
			repository,
			existingProfiles,
			logger,
		});

		// Track failed groups in agent state for retry on next run
		const previousFailedGroups = this.state.failedGroups ?? [];
		const allFailedGroups = [...new Set([...result.failedGroups])];

		if (allFailedGroups.length > 0) {
			logger.warn("Some groups failed resolution, will retry on next run", {
				failedGroups: allFailedGroups,
				previouslyFailed: previousFailedGroups,
			});
		} else if (previousFailedGroups.length > 0) {
			logger.info("All previously failed groups resolved successfully");
		}

		const runResult: ResolutionRunResult = {
			unresolvedCount: unresolved.length,
			groupCount: groups.length,
			resolvedCount: result.resolvedCount,
			newProfilesCreated: result.newProfilesCreated,
			failedGroups: allFailedGroups,
			startedAt,
		};

		this.setState({
			lastRun: new Date().toISOString(),
			lastResult: runResult,
			failedGroups: allFailedGroups,
		});

		logger.info("Entity resolution complete", { ...runResult });

		// Chain: queue synthesis + enrichment in parallel (fire-and-forget)
		if (result.resolvedProfileIds.length > 0) {
			try {
				const synthesis = await getAgentByName<Env, SynthesisAgent>(
					this.env.SYNTHESIS,
					"singleton",
				);
				await synthesis.queue("synthesizeProfiles", result.resolvedProfileIds);
				logger.info("Synthesis queued after entity resolution", { profileIds: result.resolvedProfileIds });
			} catch (err) {
				logger.error("Failed to queue synthesis", {
					error: err instanceof Error ? err.message : String(err),
				});
			}

			if (result.newProfileIds.length > 0) {
				try {
					const enrichment = await getAgentByName<Env, EnrichmentAgent>(
						this.env.ENRICHMENT,
						"singleton",
					);
					await enrichment.queue("enrichProfiles", result.newProfileIds);
					logger.info("Enrichment queued after entity resolution", { profileIds: result.newProfileIds });
				} catch (err) {
					logger.error("Failed to queue enrichment", {
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}
		}

		return runResult;
	}
}
