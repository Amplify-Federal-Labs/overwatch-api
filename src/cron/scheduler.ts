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

interface QueueSender<T> {
	send(message: T): Promise<void>;
}

export interface OnDemandDeps {
	synthesisQueue: QueueSender<{ type: "synthesis"; profileId: string }>;
	enrichmentQueue: QueueSender<{ type: "enrichment"; profileId: string; entityType: string; canonicalName: string }>;
	materializationQueue: QueueSender<{ type: "materialization"; ingestedItemId: string }>;
	findUnsynthesizedProfileIds(): Promise<string[]>;
	findPendingEnrichmentProfiles(): Promise<Array<{ id: string; type: string; canonicalName: string }>>;
	findUnmaterializedItemIds(): Promise<string[]>;
}

export interface OnDemandResult {
	messagesProduced: number;
}

export async function dispatchOnDemandJob(
	agentName: AgentJob["agentName"],
	deps: OnDemandDeps,
): Promise<OnDemandResult> {
	switch (agentName) {
		case "entity_resolution":
			throw new Error("entity_resolution cannot be triggered on-demand via queues");

		case "synthesis": {
			const profileIds = await deps.findUnsynthesizedProfileIds();
			for (const profileId of profileIds) {
				await deps.synthesisQueue.send({ type: "synthesis", profileId });
			}
			return { messagesProduced: profileIds.length };
		}

		case "enrichment": {
			const profiles = await deps.findPendingEnrichmentProfiles();
			for (const profile of profiles) {
				await deps.enrichmentQueue.send({
					type: "enrichment",
					profileId: profile.id,
					entityType: profile.type,
					canonicalName: profile.canonicalName,
				});
			}
			return { messagesProduced: profiles.length };
		}

		case "signal_materialization": {
			const itemIds = await deps.findUnmaterializedItemIds();
			for (const ingestedItemId of itemIds) {
				await deps.materializationQueue.send({ type: "materialization", ingestedItemId });
			}
			return { messagesProduced: itemIds.length };
		}
	}
}

export async function runCronJob(job: CronJob, env: Env): Promise<unknown> {
	if (job.kind === "recovery") {
		const { RecoveryRepository } = await import("./recovery-repository");
		const { runRecovery } = await import("./run-recovery");
		const { SynthesisRepository } = await import("../db/synthesis-repository");
		const { EnrichmentRepository } = await import("../db/enrichment-repository");
		const { ObservationRepository } = await import("../db/observation-repository");
		const { Logger } = await import("../logger");

		const repo = new RecoveryRepository(env.DB);
		const synthesisRepo = new SynthesisRepository(env.DB);
		const enrichmentRepo = new EnrichmentRepository(env.DB);
		const observationRepo = new ObservationRepository(env.DB);
		const threshold = parseInt(env.RELEVANCE_THRESHOLD ?? "60", 10);
		const logger = new Logger(env.LOG_LEVEL);

		const onDemandDeps: OnDemandDeps = {
			synthesisQueue: { send: (msg) => env.SYNTHESIS_QUEUE.send(msg) },
			enrichmentQueue: { send: (msg) => env.ENRICHMENT_QUEUE.send(msg) },
			materializationQueue: { send: (msg) => env.MATERIALIZATION_QUEUE.send(msg) },
			findUnsynthesizedProfileIds: () => synthesisRepo.findUnsynthesizedProfileIds(),
			findPendingEnrichmentProfiles: async () => {
				const ids = await enrichmentRepo.findPendingProfileIds();
				return enrichmentRepo.findProfilesByIds(ids);
			},
			findUnmaterializedItemIds: async () => {
				const items = await observationRepo.findUnmaterializedItems(100, threshold);
				return items.map((item) => item.id);
			},
		};

		const status = await repo.getPipelineStatus();
		return runRecovery(status, {
			dispatchOnDemandJob: (agentName) => dispatchOnDemandJob(agentName, onDemandDeps),
			findUnresolvedObservationEntities: () => repo.findUnresolvedObservationEntities(),
			resolutionQueue: { send: (msg) => env.RESOLUTION_QUEUE.send(msg) },
			logger,
		});
	}

	if (job.kind === "ingestion") {
		await env.INGESTION_QUEUE.send({
			type: "ingestion" as const,
			source: job.sourceType,
		});
		return { queued: true, source: job.sourceType };
	}

	// On-demand agent jobs: scan DB for pending work, produce queue messages
	const { SynthesisRepository } = await import("../db/synthesis-repository");
	const { EnrichmentRepository } = await import("../db/enrichment-repository");
	const { ObservationRepository } = await import("../db/observation-repository");

	const synthesisRepo = new SynthesisRepository(env.DB);
	const enrichmentRepo = new EnrichmentRepository(env.DB);
	const observationRepo = new ObservationRepository(env.DB);
	const threshold = parseInt(env.RELEVANCE_THRESHOLD ?? "60", 10);

	return dispatchOnDemandJob(job.agentName, {
		synthesisQueue: { send: (msg) => env.SYNTHESIS_QUEUE.send(msg) },
		enrichmentQueue: { send: (msg) => env.ENRICHMENT_QUEUE.send(msg) },
		materializationQueue: { send: (msg) => env.MATERIALIZATION_QUEUE.send(msg) },
		findUnsynthesizedProfileIds: () => synthesisRepo.findUnsynthesizedProfileIds(),
		findPendingEnrichmentProfiles: async () => {
			const ids = await enrichmentRepo.findPendingProfileIds();
			return enrichmentRepo.findProfilesByIds(ids);
		},
		findUnmaterializedItemIds: async () => {
			const items = await observationRepo.findUnmaterializedItems(100, threshold);
			return items.map((item) => item.id);
		},
	});
}
