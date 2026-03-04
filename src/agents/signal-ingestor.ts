import type { SignalAnalysisInput, SignalSourceType } from "../schemas";
import { SignalAnalyzer } from "./signal-analyzer";
import { SignalRepository } from "../db/signal-repository";
import { fetchFpdsContracts } from "./fpds-contracts-fetcher";
import { entriesToSignals } from "./fpds-contracts-parser";
import { fetchGovConWireRss } from "./govconwire-rss-fetcher";
import { rssItemsToSignals } from "./govconwire-rss-parser";

const SOURCE_TYPES: readonly SignalSourceType[] = [
	"sam_gov",
	"rss",
	"fpds",
] as const;

export interface IngestionResult {
	sourcesChecked: number;
	signalsFound: number;
	signalsAnalyzed: number;
	startedAt: string;
}

export class SignalIngestor {
	private env: Env;

	constructor(env: Env) {
		this.env = env;
	}

	async ingest(): Promise<IngestionResult> {
		const startedAt = new Date().toISOString();
		const analyzer = new SignalAnalyzer(this.env);
		const repository = new SignalRepository(this.env.DB);
		const allSignals: SignalAnalysisInput[] = [];

		for (const sourceType of SOURCE_TYPES) {
			const signals = await this.fetchSource(sourceType);
			allSignals.push(...signals);
		}

		let signalsAnalyzed = 0;
		for (const signal of allSignals) {
			try {
				if (signal.sourceLink && await repository.existsBySourceLink(signal.sourceLink)) {
					continue;
				}
				const result = await analyzer.analyze(signal);
				await repository.insert(signal, result);
				signalsAnalyzed++;
			} catch (err) {
				console.error(`Failed to analyze signal from ${signal.sourceName}:`, err);
			}
		}

		return {
			sourcesChecked: SOURCE_TYPES.length,
			signalsFound: allSignals.length,
			signalsAnalyzed,
			startedAt,
		};
	}

	private async fetchSource(sourceType: SignalSourceType): Promise<SignalAnalysisInput[]> {
		switch (sourceType) {
			case "fpds":
				return entriesToSignals(await fetchFpdsContracts(fetch));
			case "rss":
				return rssItemsToSignals(await fetchGovConWireRss(fetch));
			case "sam_gov":
			case "mil_announcement":
				// TODO: implement these source connectors
				return [];
		}
	}
}
