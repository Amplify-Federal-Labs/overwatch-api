import type { AgentJob } from "./scheduler";

export interface PipelineStatus {
	unresolvedEntityCount: number;
	unsynthesizedProfileIds: string[];
	pendingEnrichmentIds: string[];
	unmaterializedItemCount: number;
}

export interface StuckStage {
	agentName: AgentJob["agentName"];
	reason: string;
	profileIds?: string[];
}

export function diagnoseStuckStages(status: PipelineStatus): StuckStage[] {
	const stuck: StuckStage[] = [];

	if (status.unresolvedEntityCount > 0) {
		stuck.push({
			agentName: "entity_resolution",
			reason: `${status.unresolvedEntityCount} unresolved observation entities`,
		});
	}

	if (status.unsynthesizedProfileIds.length > 0) {
		stuck.push({
			agentName: "synthesis",
			reason: `${status.unsynthesizedProfileIds.length} profiles not yet synthesized`,
			profileIds: status.unsynthesizedProfileIds,
		});
	}

	if (status.pendingEnrichmentIds.length > 0) {
		stuck.push({
			agentName: "enrichment",
			reason: `${status.pendingEnrichmentIds.length} profiles pending enrichment`,
			profileIds: status.pendingEnrichmentIds,
		});
	}

	if (status.unmaterializedItemCount > 0) {
		stuck.push({
			agentName: "signal_materialization",
			reason: `${status.unmaterializedItemCount} ingested items not yet materialized as signals`,
		});
	}

	return stuck;
}
