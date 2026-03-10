import { describe, it, expect } from "vitest";
import { buildMetrics, type MetricsInput } from "./metrics-builder";

describe("buildMetrics", () => {
	const input: MetricsInput = {
		ingestedItems: 268,
		observations: 273,
		observationEntities: 836,
		entityProfiles: 418,
		entityAliases: 729,
		insights: 469,
		signals: 265,
		ingestionBySource: { sam_gov: 242, rss: 26 },
		profilesByType: {
			person: 186,
			company: 56,
			technology: 52,
			contract_vehicle: 51,
			program: 47,
			agency: 26,
		},
		enrichmentStatus: { pending: 284, skipped: 77, enriched: 57 },
		synthesizedProfiles: 153,
		enrichedWithDossier: 57,
	};

	it("returns table counts", () => {
		const result = buildMetrics(input);

		expect(result.tables.ingestedItems).toBe(268);
		expect(result.tables.observations).toBe(273);
		expect(result.tables.observationEntities).toBe(836);
		expect(result.tables.entityProfiles).toBe(418);
		expect(result.tables.entityAliases).toBe(729);
		expect(result.tables.insights).toBe(469);
		expect(result.tables.signals).toBe(265);
	});

	it("returns ingestion by source", () => {
		const result = buildMetrics(input);

		expect(result.ingestionBySource).toEqual({ sam_gov: 242, rss: 26 });
	});

	it("returns entity profiles by type", () => {
		const result = buildMetrics(input);

		expect(result.profilesByType.person).toBe(186);
		expect(result.profilesByType.agency).toBe(26);
	});

	it("returns enrichment status breakdown", () => {
		const result = buildMetrics(input);

		expect(result.enrichmentStatus).toEqual({ pending: 284, skipped: 77, enriched: 57 });
	});

	it("returns pipeline progress", () => {
		const result = buildMetrics(input);

		expect(result.pipeline.synthesized).toBe(153);
		expect(result.pipeline.synthesizedTotal).toBe(418);
		expect(result.pipeline.enrichedWithDossier).toBe(57);
		expect(result.pipeline.enrichedTotal).toBe(418);
		expect(result.pipeline.materialized).toBe(265);
		expect(result.pipeline.materializedTotal).toBe(268);
	});

	it("returns summary with key observations", () => {
		const result = buildMetrics(input);

		expect(result.summary).toBeInstanceOf(Array);
		expect(result.summary.length).toBeGreaterThan(0);
		expect(result.summary.every((s) => typeof s === "string")).toBe(true);
	});

	it("flags FPDS as dark when missing from ingestion sources", () => {
		const result = buildMetrics(input);

		expect(result.summary.some((s) => s.toLowerCase().includes("fpds"))).toBe(true);
	});

	it("flags pending enrichment when count is high", () => {
		const result = buildMetrics(input);

		expect(result.summary.some((s) => s.toLowerCase().includes("enrichment"))).toBe(true);
	});
});
