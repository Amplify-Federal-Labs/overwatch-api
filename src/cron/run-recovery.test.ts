import { describe, it, expect, vi, beforeEach } from "vitest";
import { runRecovery } from "./run-recovery";
import type { PipelineStatus } from "./recovery";
import type { RecoveryDeps } from "./run-recovery";

function makeDeps(overrides: Partial<RecoveryDeps> = {}): RecoveryDeps {
	return {
		dispatchOnDemandJob: vi.fn().mockResolvedValue({ messagesProduced: 0 }),
		findUnresolvedObservationEntities: vi.fn().mockResolvedValue([]),
		resolutionQueue: { send: vi.fn().mockResolvedValue(undefined) },
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		},
		...overrides,
	};
}

describe("runRecovery", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns empty result when pipeline is healthy", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileCount: 0,
			pendingEnrichmentCount: 0,
			unmaterializedItemCount: 0,
		};
		const deps = makeDeps();

		const result = await runRecovery(status, deps);

		expect(result.stuckStages).toEqual([]);
		expect(result.recoveryActions).toEqual([]);
		expect(deps.dispatchOnDemandJob).not.toHaveBeenCalled();
	});

	it("dispatches synthesis via dispatchOnDemandJob", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileCount: 3,
			pendingEnrichmentCount: 0,
			unmaterializedItemCount: 0,
		};
		const deps = makeDeps({
			dispatchOnDemandJob: vi.fn().mockResolvedValue({ messagesProduced: 3 }),
		});

		const result = await runRecovery(status, deps);

		expect(result.recoveryActions).toHaveLength(1);
		expect(result.recoveryActions[0].agentName).toBe("synthesis");
		expect(result.recoveryActions[0].status).toBe("dispatched");
		expect(deps.dispatchOnDemandJob).toHaveBeenCalledWith("synthesis");
	});

	it("dispatches enrichment via dispatchOnDemandJob", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileCount: 0,
			pendingEnrichmentCount: 2,
			unmaterializedItemCount: 0,
		};
		const deps = makeDeps({
			dispatchOnDemandJob: vi.fn().mockResolvedValue({ messagesProduced: 2 }),
		});

		const result = await runRecovery(status, deps);

		expect(result.recoveryActions).toHaveLength(1);
		expect(result.recoveryActions[0].agentName).toBe("enrichment");
		expect(deps.dispatchOnDemandJob).toHaveBeenCalledWith("enrichment");
	});

	it("dispatches signal_materialization via dispatchOnDemandJob", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileCount: 0,
			pendingEnrichmentCount: 0,
			unmaterializedItemCount: 5,
		};
		const deps = makeDeps({
			dispatchOnDemandJob: vi.fn().mockResolvedValue({ messagesProduced: 5 }),
		});

		const result = await runRecovery(status, deps);

		expect(result.recoveryActions).toHaveLength(1);
		expect(result.recoveryActions[0].agentName).toBe("signal_materialization");
		expect(deps.dispatchOnDemandJob).toHaveBeenCalledWith("signal_materialization");
	});

	it("recovers entity_resolution by producing resolution queue messages", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 3,
			unsynthesizedProfileCount: 0,
			pendingEnrichmentCount: 0,
			unmaterializedItemCount: 0,
		};
		const sendFn = vi.fn().mockResolvedValue(undefined);
		const deps = makeDeps({
			findUnresolvedObservationEntities: vi.fn().mockResolvedValue([
				{ observationId: 10, rawName: "DISA", entityType: "agency", role: "buyer" },
				{ observationId: 10, rawName: "John Smith", entityType: "person", role: "poc" },
				{ observationId: 20, rawName: "Booz Allen", entityType: "company", role: "vendor" },
			]),
			resolutionQueue: { send: sendFn },
		});

		const result = await runRecovery(status, deps);

		expect(result.recoveryActions).toHaveLength(1);
		expect(result.recoveryActions[0].agentName).toBe("entity_resolution");
		expect(result.recoveryActions[0].status).toBe("dispatched");
		// Should group by observationId and send one message per observation
		expect(sendFn).toHaveBeenCalledTimes(2);
		expect(sendFn).toHaveBeenCalledWith({
			type: "resolution",
			observationId: 10,
			entities: [
				{ rawName: "DISA", entityType: "agency", role: "buyer" },
				{ rawName: "John Smith", entityType: "person", role: "poc" },
			],
		});
		expect(sendFn).toHaveBeenCalledWith({
			type: "resolution",
			observationId: 20,
			entities: [
				{ rawName: "Booz Allen", entityType: "company", role: "vendor" },
			],
		});
	});

	it("dispatches multiple agents when pipeline is broken at several points", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 2,
			unsynthesizedProfileCount: 1,
			pendingEnrichmentCount: 1,
			unmaterializedItemCount: 1,
		};
		const deps = makeDeps({
			dispatchOnDemandJob: vi.fn().mockResolvedValue({ messagesProduced: 1 }),
			findUnresolvedObservationEntities: vi.fn().mockResolvedValue([
				{ observationId: 10, rawName: "DISA", entityType: "agency", role: "buyer" },
			]),
		});

		const result = await runRecovery(status, deps);

		expect(result.recoveryActions).toHaveLength(4);
		expect(result.recoveryActions.map((a) => a.agentName)).toEqual([
			"entity_resolution",
			"synthesis",
			"enrichment",
			"signal_materialization",
		]);
		expect(result.recoveryActions.every((a) => a.status === "dispatched")).toBe(true);
	});

	it("records failed status when dispatch throws", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileCount: 3,
			pendingEnrichmentCount: 0,
			unmaterializedItemCount: 0,
		};
		const deps = makeDeps({
			dispatchOnDemandJob: vi.fn().mockRejectedValue(new Error("queue unavailable")),
		});

		const result = await runRecovery(status, deps);

		expect(result.recoveryActions).toHaveLength(1);
		expect(result.recoveryActions[0].status).toBe("failed");
		expect(result.recoveryActions[0].error).toBe("queue unavailable");
	});
});
