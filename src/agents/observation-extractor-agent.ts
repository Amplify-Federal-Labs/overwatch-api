import { Agent, getAgentByName } from "agents";
import { ObservationExtractor } from "./observation-extractor";
import { ObservationRepository } from "../db/observation-repository";
import { SignalRelevanceScorer } from "./signal-relevance-scorer";
import { PageFetcher } from "../enrichment/page-fetcher";
import { buildEarlyRelevanceInput, applyThreshold } from "./relevance-gate";
import type { EntityResolverAgent } from "./entity-resolver-agent";
import { fetchRssFeed } from "../signals/rss/rss-fetcher";
import { rssItemsToSignals } from "../signals/rss/rss-parser";
import { fetchSamGovOpportunities, fetchApbiEvents } from "../signals/sam-gov/sam-gov-fetcher";
import { opportunitiesToSignals } from "../signals/sam-gov/sam-gov-parser";
import { fetchFpdsContracts } from "../signals/fpds/fpds-contracts-fetcher";
import { entriesToSignals } from "../signals/fpds/fpds-contracts-parser";
import { Logger } from "../logger";
import { RSS_FEEDS } from "./rss-feeds";
import type { RssFeedConfig } from "./rss-feeds";
import type { IngestionResult, IngestionDispatchResult } from "./observation-extractor-logic";
import type { SignalAnalysisInput, SignalSourceType } from "../schemas";

export type { IngestionResult, IngestionDispatchResult } from "./observation-extractor-logic";

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

	async runIngestion(sourceType: SignalSourceType): Promise<IngestionResult | IngestionDispatchResult> {
		if (sourceType === "rss") {
			return this.dispatchRssFeeds();
		}

		const logger = new Logger(this.env.LOG_LEVEL);
		const deps = this.buildDeps(logger);
		const startedAt = new Date().toISOString();

		logger.info("Starting observation extraction", { sourceType });

		const inputs = await this.fetchInputs(sourceType, logger);

		let itemsStored = 0;
		let observationsExtracted = 0;
		let itemsAboveThreshold = 0;
		let itemsBelowThreshold = 0;

		for (const input of inputs) {
			try {
				const result = await this.processItem(input, deps);
				if (!result.stored) continue;

				itemsStored++;
				observationsExtracted += result.observationsExtracted;

				if (result.aboveThreshold) {
					itemsAboveThreshold++;
				} else {
					itemsBelowThreshold++;
				}
			} catch (err) {
				logger.error("Failed to process ingested item", {
					sourceName: input.sourceName,
					error: err instanceof Error ? err : new Error(String(err)),
				});
			}
		}

		const ingestionResult: IngestionResult = {
			sourceType,
			signalsFound: inputs.length,
			signalsStored: itemsStored,
			observationsExtracted,
			itemsAboveThreshold,
			itemsBelowThreshold,
			startedAt,
		};

		this.setState({
			lastRun: new Date().toISOString(),
			lastResult: ingestionResult,
		});

		logger.info("Observation extraction complete", { ...ingestionResult });

		// Chain: queue entity resolution only if items passed the relevance gate
		if (itemsAboveThreshold > 0) {
			await this.queueEntityResolution(logger);
		}

		return ingestionResult;
	}

	async ingestRssFeed(feedConfig: RssFeedConfig): Promise<IngestionResult> {
		const logger = new Logger(this.env.LOG_LEVEL);
		const deps = this.buildDeps(logger);
		const startedAt = new Date().toISOString();

		logger.info("Ingesting RSS feed", { sourceName: feedConfig.sourceName, url: feedConfig.url });

		const items = await fetchRssFeed(fetch, feedConfig.url, logger);
		const inputs = rssItemsToSignals(items, feedConfig.sourceName);

		let itemsStored = 0;
		let observationsExtracted = 0;
		let itemsAboveThreshold = 0;
		let itemsBelowThreshold = 0;

		for (const input of inputs) {
			try {
				const result = await this.processItem(input, deps);
				if (!result.stored) continue;

				itemsStored++;
				observationsExtracted += result.observationsExtracted;

				if (result.aboveThreshold) {
					itemsAboveThreshold++;
				} else {
					itemsBelowThreshold++;
				}
			} catch (err) {
				logger.error("Failed to process ingested item", {
					sourceName: input.sourceName,
					error: err instanceof Error ? err : new Error(String(err)),
				});
			}
		}

		const ingestionResult: IngestionResult = {
			sourceType: "rss",
			signalsFound: inputs.length,
			signalsStored: itemsStored,
			observationsExtracted,
			itemsAboveThreshold,
			itemsBelowThreshold,
			startedAt,
		};

		this.setState({
			lastRun: new Date().toISOString(),
			lastResult: ingestionResult,
		});

		logger.info("RSS feed ingestion complete", { sourceName: feedConfig.sourceName, ...ingestionResult });

		if (itemsAboveThreshold > 0) {
			await this.queueEntityResolution(logger);
		}

		return ingestionResult;
	}

	private buildDeps(logger: Logger) {
		const extractor = new ObservationExtractor(this.env);
		const repository = new ObservationRepository(this.env.DB);
		const scorer = new SignalRelevanceScorer(this.env);
		const pageFetcher = new PageFetcher(fetch);
		const threshold = parseInt(this.env.RELEVANCE_THRESHOLD ?? "60", 10);
		return { extractor, repository, scorer, pageFetcher, threshold, logger };
	}

	private async processItem(
		input: SignalAnalysisInput,
		deps: ReturnType<typeof this.buildDeps>,
	): Promise<{ stored: boolean; aboveThreshold: boolean; observationsExtracted: number }> {
		const { extractor, repository, scorer, pageFetcher, threshold, logger } = deps;

		// Step 1: Store ingested item (returns null if duplicate)
		const itemId = await repository.insertIngestedItem(input);
		if (!itemId) {
			return { stored: false, aboveThreshold: false, observationsExtracted: 0 };
		}

		// Step 2: Extract observations via AI
		const extraction = await extractor.extract(input);
		let observationsExtracted = 0;
		if (extraction.observations.length > 0) {
			observationsExtracted = await repository.insertObservations(itemId, extraction.observations);
		}

		// Step 3: Fetch full source page (best-effort)
		let fetchedPageText: string | null = null;
		if (input.sourceLink) {
			try {
				fetchedPageText = await pageFetcher.fetchPage(input.sourceLink);
			} catch (err) {
				logger.warn("Failed to fetch source page for relevance scoring", {
					sourceLink: input.sourceLink,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}

		// Step 4: Score relevance
		let relevanceScore = 0;
		let relevanceRationale = "";
		let competencyCodes: string[] = [];

		try {
			const relevanceInput = buildEarlyRelevanceInput(
				input.content,
				fetchedPageText,
				extraction.observations,
			);
			const result = await scorer.score(relevanceInput);
			relevanceScore = result.relevanceScore;
			relevanceRationale = result.rationale;
			competencyCodes = result.competencyCodes;
		} catch (err) {
			logger.error("AI relevance scoring failed, defaulting to 0", {
				itemId,
				error: err instanceof Error ? err : new Error(String(err)),
			});
		}

		// Step 5: Persist relevance score
		await repository.updateRelevanceScore(itemId, relevanceScore, relevanceRationale, competencyCodes);

		const aboveThreshold = applyThreshold(relevanceScore, threshold);
		logger.info("Relevance scored", {
			itemId,
			relevanceScore,
			threshold,
			aboveThreshold,
			sourceName: input.sourceName,
		});

		return { stored: true, aboveThreshold, observationsExtracted };
	}

	private async dispatchRssFeeds(): Promise<IngestionDispatchResult> {
		const logger = new Logger(this.env.LOG_LEVEL);
		const startedAt = new Date().toISOString();

		for (const feed of RSS_FEEDS) {
			await this.queue("ingestRssFeed", feed);
		}

		logger.info("Dispatched RSS feed tasks", { feedCount: RSS_FEEDS.length });

		return {
			sourceType: "rss",
			feedsQueued: RSS_FEEDS.length,
			startedAt,
		};
	}

	private async queueEntityResolution(logger: Logger): Promise<void> {
		try {
			const resolver = await getAgentByName<Env, EntityResolverAgent>(
				this.env.ENTITY_RESOLVER,
				"singleton",
			);
			await resolver.queue("runResolution", {});
			logger.info("Entity resolution queued after ingestion");
		} catch (err) {
			logger.error("Failed to queue entity resolution", {
				error: err instanceof Error ? err : new Error(String(err)),
			});
		}
	}

	private async fetchInputs(
		sourceType: SignalSourceType,
		logger: Logger,
	): Promise<SignalAnalysisInput[]> {
		switch (sourceType) {
			case "rss":
				// RSS is handled by dispatchRssFeeds → ingestRssFeed per feed
				return [];
			case "sam_gov": {
				const [opps, apbi] = await Promise.all([
					fetchSamGovOpportunities(fetch, this.env.SAM_GOV_API_KEY, logger),
					fetchApbiEvents(fetch, this.env.SAM_GOV_API_KEY, logger),
				]);
				return opportunitiesToSignals([...opps, ...apbi]);
			}
			case "fpds":
				return entriesToSignals(
					await fetchFpdsContracts(fetch, logger),
				);
			case "mil_announcement":
				return [];
		}
	}
}
