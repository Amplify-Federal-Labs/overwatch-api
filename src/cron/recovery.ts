import type { AgentJob } from "./scheduler";

export interface PipelineStatus {
	unresolvedEntityCount: number;
	unsynthesizedProfileCount: number;
	pendingEnrichmentCount: number;
	unmaterializedItemCount: number;
}

export interface StuckStage {
	agentName: AgentJob["agentName"];
	reason: string;
}

export function diagnoseStuckStages(status: PipelineStatus): StuckStage[] {
	const stuck: StuckStage[] = [];

	if (status.unresolvedEntityCount > 0) {
		stuck.push({
			agentName: "entity_resolution",
			reason: `${status.unresolvedEntityCount} unresolved observation entities`,
		});
	}

	if (status.unsynthesizedProfileCount > 0) {
		stuck.push({
			agentName: "synthesis",
			reason: `${status.unsynthesizedProfileCount} profiles not yet synthesized`,
		});
	}

	if (status.pendingEnrichmentCount > 0) {
		stuck.push({
			agentName: "enrichment",
			reason: `${status.pendingEnrichmentCount} profiles pending enrichment`,
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
