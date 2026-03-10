import { describe, it, expect } from "vitest";
import { diagnoseStuckStages, type PipelineStatus } from "./recovery";

describe("diagnoseStuckStages", () => {
	it("returns empty array when pipeline is healthy", () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileIds: [],
			pendingEnrichmentIds: [],
			unmaterializedItemCount: 0,
		};
		expect(diagnoseStuckStages(status)).toEqual([]);
	});

	it("returns entity_resolution when there are unresolved entities", () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 5,
			unsynthesizedProfileIds: [],
			pendingEnrichmentIds: [],
			unmaterializedItemCount: 0,
		};
		const result = diagnoseStuckStages(status);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			agentName: "entity_resolution",
			reason: "5 unresolved observation entities",
		});
	});

	it("returns synthesis when there are unsynthesized profiles", () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileIds: ["p1", "p2"],
			pendingEnrichmentIds: [],
			unmaterializedItemCount: 0,
		};
		const result = diagnoseStuckStages(status);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			agentName: "synthesis",
			reason: "2 profiles not yet synthesized",
			profileIds: ["p1", "p2"],
		});
	});

	it("returns enrichment when there are pending enrichable profiles", () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileIds: [],
			pendingEnrichmentIds: ["p3", "p4", "p5"],
			unmaterializedItemCount: 0,
		};
		const result = diagnoseStuckStages(status);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			agentName: "enrichment",
			reason: "3 profiles pending enrichment",
			profileIds: ["p3", "p4", "p5"],
		});
	});

	it("returns signal_materialization when there are unmaterialized items", () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileIds: [],
			pendingEnrichmentIds: [],
			unmaterializedItemCount: 3,
		};
		const result = diagnoseStuckStages(status);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			agentName: "signal_materialization",
			reason: "3 ingested items not yet materialized as signals",
		});
	});

	it("returns multiple stuck stages when pipeline is broken at several points", () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 2,
			unsynthesizedProfileIds: ["p1"],
			pendingEnrichmentIds: ["p2", "p3"],
			unmaterializedItemCount: 5,
		};
		const result = diagnoseStuckStages(status);
		expect(result).toHaveLength(4);
		expect(result.map((r) => r.agentName)).toEqual([
			"entity_resolution",
			"synthesis",
			"enrichment",
			"signal_materialization",
		]);
	});
});
