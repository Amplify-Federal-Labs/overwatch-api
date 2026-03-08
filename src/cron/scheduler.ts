import { getAgentByName } from "agents";
import type { ObservationExtractorAgent } from "../agents/observation-extractor-agent";
import type { EntityResolverAgent } from "../agents/entity-resolver-agent";
import type { SynthesisAgent } from "../agents/synthesis-agent";
import type { SignalMaterializerAgent } from "../agents/signal-materializer-agent";

import type { SignalSourceType } from "../schemas";

export interface IngestionJob {
	name: string;
	kind: "ingestion";
	sourceType: SignalSourceType;
}

export interface AgentJob {
	name: string;
	kind: "agent";
	agentName: "entity_resolution" | "synthesis" | "signal_materialization";
}

export type CronJob = IngestionJob | AgentJob;

export const CRON_SCHEDULE: ReadonlyMap<number, CronJob> = new Map([
	[0, { name: "rss", kind: "ingestion", sourceType: "rss" }],
	[1, { name: "sam_gov", kind: "ingestion", sourceType: "sam_gov" }],
	[2, { name: "fpds", kind: "ingestion", sourceType: "fpds" }],
]);

export const ON_DEMAND_JOBS: ReadonlyMap<string, AgentJob> = new Map([
	["entity_resolution", { name: "entity_resolution", kind: "agent", agentName: "entity_resolution" }],
	["synthesis", { name: "synthesis", kind: "agent", agentName: "synthesis" }],
	["signal_materialization", { name: "signal_materialization", kind: "agent", agentName: "signal_materialization" }],
]);

export function getScheduledJob(utcHour: number): CronJob | null {
	return CRON_SCHEDULE.get(utcHour) ?? null;
}

export function findJobByName(name: string): CronJob | null {
	for (const job of CRON_SCHEDULE.values()) {
		if (job.name === name) return job;
	}
	return ON_DEMAND_JOBS.get(name) ?? null;
}

export async function runCronJob(job: CronJob, env: Env): Promise<unknown> {
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
	}
}
