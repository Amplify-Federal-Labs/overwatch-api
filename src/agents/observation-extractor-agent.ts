import { Agent } from "agents";
import { ObservationExtractor } from "./observation-extractor";
import { ObservationRepository } from "../db/observation-repository";
import { fetchRssFeed } from "../signals/rss/rss-fetcher";
import { rssItemsToSignals } from "../signals/rss/rss-parser";
import { fetchSamGovOpportunities, fetchApbiEvents } from "../signals/sam-gov/sam-gov-fetcher";
import { opportunitiesToSignals } from "../signals/sam-gov/sam-gov-parser";
import { fetchFpdsContracts } from "../signals/fpds/fpds-contracts-fetcher";
import { entriesToSignals } from "../signals/fpds/fpds-contracts-parser";
import { Logger } from "../logger";
import type { SignalAnalysisInput, SignalSourceType } from "../schemas";

interface RssFeedConfig {
	url: string;
	sourceName: string;
}

const RSS_FEEDS: readonly RssFeedConfig[] = [
	{ url: "https://www.govconwire.com/feed", sourceName: "GovConWire" },
	{ url: "https://fedscoop.com/feed/", sourceName: "FedScoop" },
] as const;

export interface IngestionResult {
	sourceType: SignalSourceType;
	signalsFound: number;
	signalsStored: number;
	observationsExtracted: number;
	startedAt: string;
}

interface AgentState {
	lastRun?: string;
	lastResult?: IngestionResult;
}

export class ObservationExtractorAgent extends Agent<Env, AgentState> {
	initialState: AgentState = {};

	async onRequest(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		const body = await request.json() as { sourceType?: string };
		const sourceType = body.sourceType as SignalSourceType | undefined;
		if (!sourceType) {
			return new Response(JSON.stringify({ error: "sourceType required" }), { status: 400 });
		}

		const result = await this.runIngestion(sourceType);
		return new Response(JSON.stringify(result), {
			headers: { "Content-Type": "application/json" },
		});
	}

	async runIngestion(sourceType: SignalSourceType): Promise<IngestionResult> {
		const logger = new Logger(this.env.LOG_LEVEL);
		const extractor = new ObservationExtractor(this.env);
		const repository = new ObservationRepository(this.env.DB);
		const startedAt = new Date().toISOString();

		logger.info("Starting observation extraction", { sourceType });

		const signals = await this.fetchSignals(sourceType, logger);

		let signalsStored = 0;
		let observationsExtracted = 0;

		for (const signal of signals) {
			try {
				const signalId = await repository.insertSignal(signal);
				if (!signalId) {
					continue; // duplicate
				}

				const result = await extractor.extract(signal);
				if (result.observations.length > 0) {
					const count = await repository.insertObservations(signalId, result.observations);
					observationsExtracted += count;
				}

				signalsStored++;
			} catch (err) {
				logger.error("Failed to process signal", {
					sourceName: signal.sourceName,
					error: err instanceof Error ? err : new Error(String(err)),
				});
			}
		}

		const ingestionResult: IngestionResult = {
			sourceType,
			signalsFound: signals.length,
			signalsStored,
			observationsExtracted,
			startedAt,
		};

		this.setState({
			lastRun: new Date().toISOString(),
			lastResult: ingestionResult,
		});

		logger.info("Observation extraction complete", { ...ingestionResult });
		return ingestionResult;
	}

	private async fetchSignals(
		sourceType: SignalSourceType,
		logger: Logger,
	): Promise<SignalAnalysisInput[]> {
		switch (sourceType) {
			case "rss":
				return this.fetchAllRssFeeds(logger);
			case "sam_gov":
				return opportunitiesToSignals(
					await fetchSamGovOpportunities(fetch, this.env.SAM_GOV_API_KEY, logger),
				);
			case "sam_gov_apbi":
				return opportunitiesToSignals(
					await fetchApbiEvents(fetch, this.env.SAM_GOV_API_KEY, logger),
				);
			case "fpds":
				return entriesToSignals(
					await fetchFpdsContracts(fetch, logger),
				);
			case "mil_announcement":
				return [];
		}
	}

	private async fetchAllRssFeeds(logger: Logger): Promise<SignalAnalysisInput[]> {
		const allSignals: SignalAnalysisInput[] = [];
		for (const feed of RSS_FEEDS) {
			const items = await fetchRssFeed(fetch, feed.url, logger);
			allSignals.push(...rssItemsToSignals(items, feed.sourceName));
		}
		return allSignals;
	}
}
