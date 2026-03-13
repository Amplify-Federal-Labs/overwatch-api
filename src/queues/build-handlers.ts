import { ObservationRepository } from "../db/observation-repository";
import { EntityProfileRepository } from "../db/entity-profile-repository";
import { SynthesisRepository } from "../db/synthesis-repository";
import { SignalRepository } from "../db/signal-repository";
import { EnrichmentRepository } from "../db/enrichment-repository";
import { ObservationExtractor } from "../agents/observation-extractor";
import { SignalRelevanceScorer } from "../agents/signal-relevance-scorer";
import { EntityResolver } from "../agents/entity-resolver";
import { AiFuzzyEntityMatcher } from "../agents/entity-match-ai";
import { ProfileSynthesizer } from "../agents/profile-synthesizer";
import { BraveSearcher } from "../enrichment/brave-searcher";
import { PageFetcher } from "../enrichment/page-fetcher";
import { DossierExtractor } from "../enrichment/dossier-extractor";
import { fetchRssFeed } from "../signals/rss/rss-fetcher";
import { rssItemsToSignals } from "../signals/rss/rss-parser";
import { fetchSamGovOpportunities, fetchApbiEvents } from "../signals/sam-gov/sam-gov-fetcher";
import { opportunitiesToSignals } from "../signals/sam-gov/sam-gov-parser";
import { fetchContractAwards } from "../signals/contract-awards/contract-awards-fetcher";
import { entriesToSignals } from "../signals/contract-awards/contract-awards-parser";
import { RSS_FEEDS } from "../agents/rss-feeds";
import { Logger } from "../logger";
import { handleIngestion } from "./ingestion-consumer";
import { handleExtraction } from "./extraction-consumer";
import { handleResolution } from "./resolution-consumer";
import { handleSynthesis } from "./synthesis-consumer";
import { handleEnrichment } from "./enrichment-consumer";
import { handleMaterialization } from "./materialization-consumer";
import type { QueueHandlers } from "./queue-router";
import type { SignalAnalysisInput } from "../schemas";
import type { ExtractionMessage, SynthesisMessage, EnrichmentMessage, MaterializationMessage } from "./types";

export function buildQueueHandlers(env: Env, logger: Logger): QueueHandlers {
	const repository = new ObservationRepository(env.DB);
	const entityProfileRepository = new EntityProfileRepository(env.DB);
	const synthesisRepository = new SynthesisRepository(env.DB);
	const signalRepository = new SignalRepository(env.DB);
	const enrichmentRepository = new EnrichmentRepository(env.DB);
	const threshold = parseInt(env.RELEVANCE_THRESHOLD ?? "60", 10);

	return {
		async onIngestion(source) {
			const fetchers: Record<string, () => Promise<SignalAnalysisInput[]>> = {
				async rss() {
					const allItems: SignalAnalysisInput[] = [];
					for (const feed of RSS_FEEDS) {
						const items = await fetchRssFeed(fetch, feed.url, logger);
						allItems.push(...rssItemsToSignals(items, feed.sourceName));
					}
					return allItems;
				},
				async sam_gov() {
					const [opps, apbi] = await Promise.all([
						fetchSamGovOpportunities(fetch, env.SAM_GOV_API_KEY, logger),
						fetchApbiEvents(fetch, env.SAM_GOV_API_KEY, logger),
					]);
					return opportunitiesToSignals([...opps, ...apbi]);
				},
				async contract_awards() {
					return entriesToSignals(await fetchContractAwards(fetch, env.SAM_GOV_API_KEY, logger));
				},
			};

			const extractionQueue: { send(msg: ExtractionMessage): Promise<void> } = {
				async send(msg) {
					await env.EXTRACTION_QUEUE.send(msg);
				},
			};

			return handleIngestion(source, {
				extractionQueue,
				repository,
				fetchers,
				logger,
			});
		},

		async onExtraction(ingestedItemId) {
			return handleExtraction(ingestedItemId, {
				resolutionQueue: {
					async send(msg) {
						await env.RESOLUTION_QUEUE.send(msg);
					},
				},
				repository: {
					findIngestedItemById: (id) => repository.findIngestedItemById(id),
					insertObservations: (itemId, obs) => repository.insertObservationsReturningIds(itemId, obs),
					updateRelevanceScore: (itemId, score, rationale, codes) =>
						repository.updateRelevanceScore(itemId, score, rationale, codes),
				},
				extractor: new ObservationExtractor(env),
				scorer: new SignalRelevanceScorer(env),
				pageFetcher: new PageFetcher(fetch),
				threshold,
				logger,
			});
		},

		async onResolution(input) {
			const fuzzyMatcher = new AiFuzzyEntityMatcher(env);
			const resolver = new EntityResolver(fuzzyMatcher);

			return handleResolution(input, {
				synthesisQueue: {
					async send(msg: SynthesisMessage) {
						await env.SYNTHESIS_QUEUE.send(msg);
					},
				},
				enrichmentQueue: {
					async send(msg: EnrichmentMessage) {
						await env.ENRICHMENT_QUEUE.send(msg);
					},
				},
				repository: {
					findAllProfilesWithAliases: () => entityProfileRepository.findAllProfilesWithAliases(),
					createProfile: (type, canonicalName) => entityProfileRepository.createProfile(type, canonicalName),
					resolveGroupBatch: (entityIds, profileId, addAlias, aliasName) =>
						entityProfileRepository.resolveGroupBatch(entityIds, profileId, addAlias, aliasName),
				},
				resolver,
				logger,
			});
		},

		async onSynthesis(profileId) {
			return handleSynthesis(profileId, {
				materializationQueue: {
					async send(msg: MaterializationMessage) {
						await env.MATERIALIZATION_QUEUE.send(msg);
					},
				},
				repository: {
					findProfileById: async (id) => {
						const profiles = await synthesisRepository.findProfilesByIds([id]);
						return profiles[0] ?? null;
					},
					findObservationsForProfile: (id) => synthesisRepository.findObservationsForProfile(id),
					updateProfileSynthesis: (id, summary, trajectory, relevanceScore) =>
						synthesisRepository.updateProfileSynthesis(id, summary, trajectory, relevanceScore),
					insertInsight: (entityProfileId, type, content, observationWindow, observationCount) =>
						synthesisRepository.insertInsight(entityProfileId, type, content, observationWindow, observationCount),
					findIngestedItemIdsForProfile: (id) =>
						entityProfileRepository.findIngestedItemIdsByProfileIds([id]),
				},
				synthesizer: new ProfileSynthesizer(env),
				logger,
			});
		},

		async onEnrichment(input) {
			const braveSearcher = new BraveSearcher(env.BRAVE_SEARCH_API_KEY, fetch, logger);
			const pageFetcher = new PageFetcher(fetch);
			const dossierExtractor = new DossierExtractor(env);

			return handleEnrichment(input, {
				search: (name, type, context) => braveSearcher.search(name, type, undefined, context),
				fetchPages: (urls) => pageFetcher.fetchPages(urls),
				extractDossier: (name, type, pages) => dossierExtractor.extract(name, type, pages),
				repository: {
					saveDossier: (profileId, dossier) => enrichmentRepository.updateDossier(profileId, dossier),
					markFailed: (profileId) => enrichmentRepository.markFailed(profileId),
					markSkipped: (profileId) => enrichmentRepository.markSkipped(profileId),
					findContextForProfile: async (profileId) => {
						const contextMap = await enrichmentRepository.findContextForProfiles([profileId]);
						return contextMap.get(profileId);
					},
				},
				logger,
			});
		},

		async onMaterialization(ingestedItemId) {
			return handleMaterialization(ingestedItemId, {
				repository: {
					findIngestedItemWithObservations: async (id) => {
						const item = await repository.findIngestedItemById(id);
						if (!item) return null;
						const obs = await repository.findObservationsByIngestedItemId(id);
						return { ...item, observations: obs };
					},
					findRelevanceScores: () => entityProfileRepository.findRelevanceScores(),
					upsertSignal: (signal) => signalRepository.upsert(signal),
				},
				logger,
			});
		},
	};
}
