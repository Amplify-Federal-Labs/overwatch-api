import { getAgentByName } from "agents";
import type { ObservationExtractorAgent } from "../agents/observation-extractor-agent";

import type { SignalSourceType } from "../schemas";

export interface IngestionJob {
	name: string;
	kind: "ingestion";
	sourceType: SignalSourceType;
}

export type CronJob = IngestionJob;

export const CRON_SCHEDULE: ReadonlyMap<number, CronJob> = new Map([
	[0, { name: "rss", kind: "ingestion", sourceType: "rss" }],
	[1, { name: "sam_gov", kind: "ingestion", sourceType: "sam_gov" }],
	[2, { name: "fpds", kind: "ingestion", sourceType: "fpds" }],
]);

export function getScheduledJob(utcHour: number): CronJob | null {
	return CRON_SCHEDULE.get(utcHour) ?? null;
}

export async function runCronJob(job: CronJob, env: Env): Promise<unknown> {
	const namespace = env.OBSERVATION_EXTRACTOR as unknown as DurableObjectNamespace<ObservationExtractorAgent>;
	const agent = await getAgentByName<Env, ObservationExtractorAgent>(
		namespace,
		"singleton",
	);
	return agent.runIngestion(job.sourceType);
}
