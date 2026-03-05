import type { SignalAnalysisInput, SignalSourceType } from "../schemas";
import { SignalAnalyzer } from "./signal-analyzer";
import { SignalRepository } from "../db/signal-repository";
import { DiscoveredEntityRepository } from "../db/discovered-entity-repository";
import { MockStakeholderRepository } from "../db/stakeholder-repository";
import { StakeholderMatcher } from "./stakeholder-matcher";
import { fetchFpdsContracts } from "./fpds/fpds-contracts-fetcher";
import { entriesToSignals } from "./fpds/fpds-contracts-parser";
import { fetchRssFeed } from "./rss/rss-fetcher";
import { rssItemsToSignals } from "./rss/rss-parser";
import { fetchSamGovOpportunities } from "./sam-gov/sam-gov-fetcher";
import { opportunitiesToSignals } from "./sam-gov/sam-gov-parser";
import { Logger } from "../logger";

export interface RssFeedConfig {
	url: string;
	sourceName: string;
}

const RSS_FEEDS: readonly RssFeedConfig[] = [
	{ url: "https://www.govconwire.com/feed", sourceName: "GovConWire" },
	{ url: "https://fedscoop.com/feed/", sourceName: "FedScoop" },
] as const;

const SOURCE_TYPES: readonly SignalSourceType[] = [
	"sam_gov",
	"rss",
	"fpds",
] as const;

export interface IngestionResult {
	sourcesChecked: number;
	signalsFound: number;
	signalsAnalyzed: number;
	signalsMatched: number;
	entitiesDiscovered: number;
	startedAt: string;
}

export class SignalIngestor {
	private env: Env;
	private logger: Logger;

	constructor(env: Env) {
		this.env = env;
		this.logger = new Logger(env.LOG_LEVEL);
	}

	async ingest(sources?: SignalSourceType[]): Promise<IngestionResult> {
		const startedAt = new Date().toISOString();
		const analyzer = new SignalAnalyzer(this.env);
		const repository = new SignalRepository(this.env.DB);
		const discoveredEntityRepo = new DiscoveredEntityRepository(this.env.DB);
		const matcher = new StakeholderMatcher(new MockStakeholderRepository());
		const activeSourceTypes = sources ?? SOURCE_TYPES;
		const allSignals: SignalAnalysisInput[] = [];

		for (const sourceType of activeSourceTypes) {
			const signals = await this.fetchSource(sourceType);
			allSignals.push(...signals);
		}

		let signalsAnalyzed = 0;
		let signalsMatched = 0;
		let entitiesDiscovered = 0;
		for (const signal of allSignals) {
			try {
				if (signal.sourceLink && await repository.existsBySourceLink(signal.sourceLink)) {
					continue;
				}
				const result = await analyzer.analyze(signal);
				const matchResult = await matcher.match(result.entities, result.relevance);
				const signalId = await repository.insert(signal, result, matchResult.matchedIds);
				signalsAnalyzed++;
				if (matchResult.matchedIds.length > 0) {
					signalsMatched++;
				}
				if (matchResult.discoveredEntities.length > 0) {
					const inserted = await discoveredEntityRepo.insertMany(signalId, matchResult.discoveredEntities);
					entitiesDiscovered += inserted;
				}
			} catch (err) {
				this.logger.error("Failed to analyze signal", { sourceName: signal.sourceName, error: err instanceof Error ? err : new Error(String(err)) });
			}
		}

		return {
			sourcesChecked: activeSourceTypes.length,
			signalsFound: allSignals.length,
			signalsAnalyzed,
			signalsMatched,
			entitiesDiscovered,
			startedAt,
		};
	}

	private async fetchSource(sourceType: SignalSourceType): Promise<SignalAnalysisInput[]> {
		switch (sourceType) {
			case "fpds":
				return entriesToSignals(await fetchFpdsContracts(fetch, this.logger));
			case "rss":
				return this.fetchAllRssFeeds();
			case "sam_gov":
				return opportunitiesToSignals(
					await fetchSamGovOpportunities(fetch, this.env.SAM_GOV_API_KEY, this.logger),
				);
			case "mil_announcement":
				// TODO: implement this source connector
				return [];
		}
	}

	private async fetchAllRssFeeds(): Promise<SignalAnalysisInput[]> {
		const allSignals: SignalAnalysisInput[] = [];
		for (const feed of RSS_FEEDS) {
			const items = await fetchRssFeed(fetch, feed.url, this.logger);
			allSignals.push(...rssItemsToSignals(items, feed.sourceName));
		}
		return allSignals;
	}
}
