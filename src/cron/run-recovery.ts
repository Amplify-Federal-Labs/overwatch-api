import { getAgentByName } from "agents";
import { diagnoseStuckStages, type PipelineStatus, type StuckStage } from "./recovery";
import type { EntityResolverAgent } from "../agents/entity-resolver-agent";
import type { SynthesisAgent } from "../agents/synthesis-agent";
import type { EnrichmentAgent } from "../agents/enrichment-agent";
import type { SignalMaterializerAgent } from "../agents/signal-materializer-agent";
import { Logger } from "../logger";

export interface RecoveryAction {
	agentName: StuckStage["agentName"];
	reason: string;
	status: "dispatched" | "failed";
	error?: string;
}

export interface RecoveryResult {
	stuckStages: StuckStage[];
	recoveryActions: RecoveryAction[];
}

export async function runRecovery(env: Env, status: PipelineStatus): Promise<RecoveryResult> {
	const logger = new Logger(env.LOG_LEVEL);
	const stuckStages = diagnoseStuckStages(status);

	if (stuckStages.length === 0) {
		logger.info("Recovery check: pipeline is healthy, nothing to recover");
		return { stuckStages: [], recoveryActions: [] };
	}

	logger.info("Recovery check: found stuck stages", {
		stages: stuckStages.map((s) => s.agentName),
	});

	const recoveryActions: RecoveryAction[] = [];

	for (const stage of stuckStages) {
		try {
			await dispatchRecovery(env, stage);
			recoveryActions.push({
				agentName: stage.agentName,
				reason: stage.reason,
				status: "dispatched",
			});
			logger.info("Recovery dispatched", { agent: stage.agentName, reason: stage.reason });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			recoveryActions.push({
				agentName: stage.agentName,
				reason: stage.reason,
				status: "failed",
				error: errorMessage,
			});
			logger.error("Recovery dispatch failed", { agent: stage.agentName, error: errorMessage });
		}
	}

	return { stuckStages, recoveryActions };
}

async function dispatchRecovery(env: Env, stage: StuckStage): Promise<void> {
	switch (stage.agentName) {
		case "entity_resolution": {
			const agent = await getAgentByName<Env, EntityResolverAgent>(
				env.ENTITY_RESOLVER as unknown as DurableObjectNamespace<EntityResolverAgent>,
				"singleton",
			);
			await agent.runResolution();
			break;
		}
		case "synthesis": {
			const agent = await getAgentByName<Env, SynthesisAgent>(
				env.SYNTHESIS as unknown as DurableObjectNamespace<SynthesisAgent>,
				"singleton",
			);
			await agent.synthesizeProfiles([]);
			break;
		}
		case "enrichment": {
			const agent = await getAgentByName<Env, EnrichmentAgent>(
				env.ENRICHMENT as unknown as DurableObjectNamespace<EnrichmentAgent>,
				"singleton",
			);
			await agent.enrichProfiles([]);
			break;
		}
		case "signal_materialization": {
			const agent = await getAgentByName<Env, SignalMaterializerAgent>(
				env.SIGNAL_MATERIALIZER as unknown as DurableObjectNamespace<SignalMaterializerAgent>,
				"singleton",
			);
			await agent.materializeNew();
			break;
		}
	}
}
