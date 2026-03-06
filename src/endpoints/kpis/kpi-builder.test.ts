import { describe, it, expect } from "vitest";
import { buildKpis, type KpiCounts } from "./kpi-builder";

describe("buildKpis", () => {
	it("builds KPI array from counts", () => {
		const counts: KpiCounts = {
			totalSignals: 42,
			totalObservations: 85,
			totalEntityProfiles: 23,
			totalInsights: 7,
			recentSignals: 12,
			recentObservations: 28,
		};

		const kpis = buildKpis(counts);

		expect(kpis).toHaveLength(4);
	});

	it("includes signals KPI", () => {
		const counts: KpiCounts = {
			totalSignals: 42,
			totalObservations: 85,
			totalEntityProfiles: 23,
			totalInsights: 7,
			recentSignals: 12,
			recentObservations: 28,
		};

		const kpis = buildKpis(counts);
		const signalKpi = kpis.find((k) => k.type === "strategy-updates");

		expect(signalKpi).toBeDefined();
		expect(signalKpi!.label).toBe("Signals Ingested");
		expect(signalKpi!.value).toBe(42);
		expect(signalKpi!.prev).toBe(30);
	});

	it("includes entities KPI", () => {
		const counts: KpiCounts = {
			totalSignals: 42,
			totalObservations: 85,
			totalEntityProfiles: 23,
			totalInsights: 7,
			recentSignals: 12,
			recentObservations: 28,
		};

		const kpis = buildKpis(counts);
		const entityKpi = kpis.find((k) => k.type === "stakeholder-mentions");

		expect(entityKpi).toBeDefined();
		expect(entityKpi!.value).toBe(23);
	});

	it("handles zero counts", () => {
		const counts: KpiCounts = {
			totalSignals: 0,
			totalObservations: 0,
			totalEntityProfiles: 0,
			totalInsights: 0,
			recentSignals: 0,
			recentObservations: 0,
		};

		const kpis = buildKpis(counts);
		expect(kpis).toHaveLength(4);
		expect(kpis.every((k) => k.value === 0)).toBe(true);
	});
});
