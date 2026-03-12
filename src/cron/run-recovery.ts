import { diagnoseStuckStages, type PipelineStatus, type StuckStage } from "./recovery";
import type { AgentJob } from "./scheduler";
import type { OnDemandResult } from "./scheduler";
import type { ResolutionMessage } from "../queues/types";

export interface UnresolvedEntity {
	observationId: number;
	rawName: string;
	entityType: string;
	role: string;
}

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

interface RecoveryLogger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
	debug(message: string, data?: Record<string, unknown>): void;
}

export interface RecoveryDeps {
	dispatchOnDemandJob(agentName: AgentJob["agentName"]): Promise<OnDemandResult>;
	findUnresolvedObservationEntities(): Promise<UnresolvedEntity[]>;
	resolutionQueue: { send(msg: ResolutionMessage): Promise<void> };
	logger: RecoveryLogger;
}

function groupEntitiesByObservation(
	entities: UnresolvedEntity[],
): Map<number, Array<{ rawName: string; entityType: string; role: string }>> {
	const grouped = new Map<number, Array<{ rawName: string; entityType: string; role: string }>>();
	for (const entity of entities) {
		let group = grouped.get(entity.observationId);
		if (!group) {
			group = [];
			grouped.set(entity.observationId, group);
		}
		group.push({ rawName: entity.rawName, entityType: entity.entityType, role: entity.role });
	}
	return grouped;
}

async function dispatchEntityResolution(deps: RecoveryDeps): Promise<void> {
	const entities = await deps.findUnresolvedObservationEntities();
	const grouped = groupEntitiesByObservation(entities);
	for (const [observationId, entityGroup] of grouped) {
		await deps.resolutionQueue.send({
			type: "resolution",
			observationId,
			entities: entityGroup,
		});
	}
}

export async function runRecovery(status: PipelineStatus, deps: RecoveryDeps): Promise<RecoveryResult> {
	const { logger } = deps;
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
			if (stage.agentName === "entity_resolution") {
				await dispatchEntityResolution(deps);
			} else {
				await deps.dispatchOnDemandJob(stage.agentName);
			}
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
