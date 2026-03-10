export interface MetricsInput {
	ingestedItems: number;
	observations: number;
	observationEntities: number;
	entityProfiles: number;
	entityAliases: number;
	insights: number;
	signals: number;
	ingestionBySource: Record<string, number>;
	profilesByType: Record<string, number>;
	enrichmentStatus: Record<string, number>;
	synthesizedProfiles: number;
	enrichedWithDossier: number;
}

export interface MetricsResult {
	tables: {
		ingestedItems: number;
		observations: number;
		observationEntities: number;
		entityProfiles: number;
		entityAliases: number;
		insights: number;
		signals: number;
	};
	ingestionBySource: Record<string, number>;
	profilesByType: Record<string, number>;
	enrichmentStatus: Record<string, number>;
	pipeline: {
		synthesized: number;
		synthesizedTotal: number;
		enrichedWithDossier: number;
		enrichedTotal: number;
		materialized: number;
		materializedTotal: number;
	};
	summary: string[];
}

const EXPECTED_SOURCES = ["rss", "sam_gov", "fpds"];

export function buildMetrics(input: MetricsInput): MetricsResult {
	const summary: string[] = [];

	// Check for missing ingestion sources
	const missingSources = EXPECTED_SOURCES.filter(
		(s) => !input.ingestionBySource[s] || input.ingestionBySource[s] === 0,
	);
	if (missingSources.length > 0) {
		summary.push(
			`${missingSources.join(", ").toUpperCase()} ingestion source(s) have zero items`,
		);
	}

	// Pipeline flow check
	if (input.signals > 0 && input.ingestedItems > 0) {
		summary.push(
			`Pipeline is flowing: ${input.ingestedItems} ingested → ${input.observations} observations → ${input.entityProfiles} entities → ${input.signals} signals`,
		);
	}

	// Enrichment backlog
	const pending = input.enrichmentStatus["pending"] ?? 0;
	if (pending > 0) {
		const pct = Math.round((pending / input.entityProfiles) * 100);
		summary.push(
			`${pending} entity profiles (${pct}%) pending enrichment`,
		);
	}

	// Synthesis gap
	const unsynthesized = input.entityProfiles - input.synthesizedProfiles;
	if (unsynthesized > 0) {
		summary.push(
			`${unsynthesized} entity profiles not yet synthesized (${input.synthesizedProfiles}/${input.entityProfiles})`,
		);
	}

	// Materialization status
	const unmaterialized = input.ingestedItems - input.signals;
	if (unmaterialized > 0) {
		summary.push(
			`${unmaterialized} ingested items not yet materialized as signals`,
		);
	} else {
		summary.push(
			"Signal materialization is keeping up with ingestion",
		);
	}

	return {
		tables: {
			ingestedItems: input.ingestedItems,
			observations: input.observations,
			observationEntities: input.observationEntities,
			entityProfiles: input.entityProfiles,
			entityAliases: input.entityAliases,
			insights: input.insights,
			signals: input.signals,
		},
		ingestionBySource: input.ingestionBySource,
		profilesByType: input.profilesByType,
		enrichmentStatus: input.enrichmentStatus,
		pipeline: {
			synthesized: input.synthesizedProfiles,
			synthesizedTotal: input.entityProfiles,
			enrichedWithDossier: input.enrichedWithDossier,
			enrichedTotal: input.entityProfiles,
			materialized: input.signals,
			materializedTotal: input.ingestedItems,
		},
		summary,
	};
}
