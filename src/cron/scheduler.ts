import { SignalIngestor } from "../signals/signal-ingestor";
import { EntityEnricher } from "../enrichment/entity-enricher";

export interface CronJob {
	name: string;
	run: (env: Env) => Promise<unknown>;
}

export const CRON_JOBS: readonly CronJob[] = [
	{
		name: "fpds",
		run: (env) => new SignalIngestor(env).ingest(["fpds"]),
	},
	{
		name: "rss",
		run: (env) => new SignalIngestor(env).ingest(["rss"]),
	},
	{
		name: "sam_gov",
		run: (env) => new SignalIngestor(env).ingest(["sam_gov"]),
	},
	{
		name: "enrichment",
		run: (env) => new EntityEnricher(env).enrichPending(),
	},
	{
		name: "enrichFailed",
		run: (env) => new EntityEnricher(env).enrichFailed(),
	},
] as const;

export function getScheduledJob(utcHour: number): CronJob {
	return CRON_JOBS[utcHour % CRON_JOBS.length];
}
