import { getAgentByName } from "agents";
import type { ObservationExtractorAgent } from "../agents/observation-extractor-agent";
import type { EntityResolverAgent } from "../agents/entity-resolver-agent";
import type { SynthesisAgent } from "../agents/synthesis-agent";
import type { SignalMaterializerAgent } from "../agents/signal-materializer-agent";
import type { EnrichmentAgent } from "../agents/enrichment-agent";

import type { SignalSourceType } from "../schemas";

export interface IngestionJob {
	name: string;
	kind: "ingestion";
	sourceType: SignalSourceType;
}

export interface AgentJob {
	name: string;
	kind: "agent";
	agentName: "entity_resolution" | "synthesis" | "signal_materialization" | "enrichment";
}

export interface RecoveryJob {
	name: "recovery";
	kind: "recovery";
}

export type CronJob = IngestionJob | AgentJob | RecoveryJob;

export const INGESTION_SCHEDULE: ReadonlyMap<number, IngestionJob> = new Map([
	[0, { name: "rss", kind: "ingestion", sourceType: "rss" }],
	[1, { name: "sam_gov", kind: "ingestion", sourceType: "sam_gov" }],
	[2, { name: "fpds", kind: "ingestion", sourceType: "fpds" }],
]);

export const ON_DEMAND_JOBS: ReadonlyMap<string, AgentJob> = new Map([
	["entity_resolution", { name: "entity_resolution", kind: "agent", agentName: "entity_resolution" }],
	["synthesis", { name: "synthesis", kind: "agent", agentName: "synthesis" }],
	["signal_materialization", { name: "signal_materialization", kind: "agent", agentName: "signal_materialization" }],
	["enrichment", { name: "enrichment", kind: "agent", agentName: "enrichment" }],
]);

const RECOVERY_JOB: RecoveryJob = { name: "recovery", kind: "recovery" };

export function getScheduledJob(utcHour: number): CronJob {
	return INGESTION_SCHEDULE.get(utcHour) ?? RECOVERY_JOB;
}

export function findJobByName(name: string): CronJob | null {
	if (name === "recovery") return RECOVERY_JOB;
	for (const job of INGESTION_SCHEDULE.values()) {
		if (job.name === name) return job;
	}
	return ON_DEMAND_JOBS.get(name) ?? null;
}

export async function runCronJob(job: CronJob, env: Env): Promise<unknown> {
	if (job.kind === "recovery") {
		const { RecoveryRepository } = await import("./recovery-repository");
		const { runRecovery } = await import("./run-recovery");
		const repo = new RecoveryRepository(env.DB);
		const status = await repo.getPipelineStatus();
		return runRecovery(env, status);
	}

	if (job.kind === "ingestion") {
		const agent = await getAgentByName<Env, ObservationExtractorAgent>(
			env.OBSERVATION_EXTRACTOR as unknown as DurableObjectNamespace<ObservationExtractorAgent>,
			"singleton",
		);
		return agent.runIngestion(job.sourceType);
	}

	switch (job.agentName) {
		case "entity_resolution": {
			const agent = await getAgentByName<Env, EntityResolverAgent>(
				env.ENTITY_RESOLVER as unknown as DurableObjectNamespace<EntityResolverAgent>,
				"singleton",
			);
			return agent.runResolution();
		}
		case "synthesis": {
			const agent = await getAgentByName<Env, SynthesisAgent>(
				env.SYNTHESIS as unknown as DurableObjectNamespace<SynthesisAgent>,
				"singleton",
			);
			const { EntityProfileRepository } = await import("../db/entity-profile-repository");
			const repo = new EntityProfileRepository(env.DB);
			const profiles = await repo.findAllProfilesWithAliases();
			const profileIds = profiles.map((p) => p.id);
			return agent.synthesizeProfiles(profileIds);
		}
		case "signal_materialization": {
			const agent = await getAgentByName<Env, SignalMaterializerAgent>(
				env.SIGNAL_MATERIALIZER as unknown as DurableObjectNamespace<SignalMaterializerAgent>,
				"singleton",
			);
			return agent.materializeNew();
		}
		case "enrichment": {
			const agent = await getAgentByName<Env, EnrichmentAgent>(
				env.ENRICHMENT as unknown as DurableObjectNamespace<EnrichmentAgent>,
				"singleton",
			);
			const { EnrichmentRepository } = await import("../db/enrichment-repository");
			const repo = new EnrichmentRepository(env.DB);
			const pendingIds = await repo.findPendingProfileIds();
			return agent.enrichProfiles(pendingIds);
		}
	}
}
