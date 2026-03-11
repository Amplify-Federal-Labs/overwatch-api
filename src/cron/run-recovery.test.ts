import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAgentByName = vi.fn();
vi.mock("agents", () => ({
	getAgentByName: (...args: unknown[]) => mockGetAgentByName(...args),
}));

import { runRecovery, type RecoveryResult } from "./run-recovery";
import type { PipelineStatus } from "./recovery";

function createMockEnv(overrides: Partial<Env> = {}): Env {
	return {
		DB: {} as D1Database,
		OBSERVATION_EXTRACTOR: {} as DurableObjectNamespace,
		ENTITY_RESOLVER: {} as DurableObjectNamespace,
		SYNTHESIS: {} as DurableObjectNamespace,
		SIGNAL_MATERIALIZER: {} as DurableObjectNamespace,
		ENRICHMENT: {} as DurableObjectNamespace,
		CF_AIG_TOKEN: "",
		CF_AIG_BASEURL: "",
		CF_AIG_MODEL: "",
		BRAVE_SEARCH_API_KEY: "",
		SAM_GOV_API_KEY: "",
		LOG_LEVEL: "ERROR",
		...overrides,
	} as Env;
}

describe("runRecovery", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns empty result when pipeline is healthy", async () => {
		const healthyStatus: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileCount: 0,
			pendingEnrichmentCount: 0,
			unmaterializedItemCount: 0,
		};

		const result = await runRecovery(createMockEnv(), healthyStatus);

		expect(result.stuckStages).toEqual([]);
		expect(result.recoveryActions).toEqual([]);
		expect(mockGetAgentByName).not.toHaveBeenCalled();
	});

	it("kicks entity resolver when entities are unresolved", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 5,
			unsynthesizedProfileCount: 0,
			pendingEnrichmentCount: 0,
			unmaterializedItemCount: 0,
		};

		const mockAgent = { runResolution: vi.fn().mockResolvedValue({}) };
		mockGetAgentByName.mockResolvedValue(mockAgent);

		const result = await runRecovery(createMockEnv(), status);

		expect(result.recoveryActions).toHaveLength(1);
		expect(result.recoveryActions[0].agentName).toBe("entity_resolution");
		expect(result.recoveryActions[0].status).toBe("dispatched");
		expect(mockAgent.runResolution).toHaveBeenCalledOnce();
	});

	it("kicks synthesis agent with empty array (agent queries DB)", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileCount: 2,
			pendingEnrichmentCount: 0,
			unmaterializedItemCount: 0,
		};

		const mockAgent = { synthesizeProfiles: vi.fn().mockResolvedValue({}) };
		mockGetAgentByName.mockResolvedValue(mockAgent);

		const result = await runRecovery(createMockEnv(), status);

		expect(result.recoveryActions).toHaveLength(1);
		expect(result.recoveryActions[0].agentName).toBe("synthesis");
		expect(mockAgent.synthesizeProfiles).toHaveBeenCalledWith([]);
	});

	it("kicks enrichment agent with empty array (agent queries DB)", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileCount: 0,
			pendingEnrichmentCount: 2,
			unmaterializedItemCount: 0,
		};

		const mockAgent = { enrichProfiles: vi.fn().mockResolvedValue({}) };
		mockGetAgentByName.mockResolvedValue(mockAgent);

		const result = await runRecovery(createMockEnv(), status);

		expect(result.recoveryActions).toHaveLength(1);
		expect(result.recoveryActions[0].agentName).toBe("enrichment");
		expect(mockAgent.enrichProfiles).toHaveBeenCalledWith([]);
	});

	it("kicks signal materializer when items are unmaterialized", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 0,
			unsynthesizedProfileCount: 0,
			pendingEnrichmentCount: 0,
			unmaterializedItemCount: 3,
		};

		const mockAgent = { materializeNew: vi.fn().mockResolvedValue({}) };
		mockGetAgentByName.mockResolvedValue(mockAgent);

		const result = await runRecovery(createMockEnv(), status);

		expect(result.recoveryActions).toHaveLength(1);
		expect(result.recoveryActions[0].agentName).toBe("signal_materialization");
		expect(mockAgent.materializeNew).toHaveBeenCalledOnce();
	});

	it("kicks multiple agents when pipeline is broken at several points", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 2,
			unsynthesizedProfileCount: 1,
			pendingEnrichmentCount: 1,
			unmaterializedItemCount: 1,
		};

		const mockAgent = {
			runResolution: vi.fn().mockResolvedValue({}),
			synthesizeProfiles: vi.fn().mockResolvedValue({}),
			enrichProfiles: vi.fn().mockResolvedValue({}),
			materializeNew: vi.fn().mockResolvedValue({}),
		};
		mockGetAgentByName.mockResolvedValue(mockAgent);

		const result = await runRecovery(createMockEnv(), status);

		expect(result.recoveryActions).toHaveLength(4);
		expect(result.recoveryActions.map((a) => a.agentName)).toEqual([
			"entity_resolution",
			"synthesis",
			"enrichment",
			"signal_materialization",
		]);
	});

	it("records failed status when agent dispatch throws", async () => {
		const status: PipelineStatus = {
			unresolvedEntityCount: 5,
			unsynthesizedProfileCount: 0,
			pendingEnrichmentCount: 0,
			unmaterializedItemCount: 0,
		};

		mockGetAgentByName.mockRejectedValue(new Error("DO unavailable"));

		const result = await runRecovery(createMockEnv(), status);

		expect(result.recoveryActions).toHaveLength(1);
		expect(result.recoveryActions[0].status).toBe("failed");
		expect(result.recoveryActions[0].error).toBe("DO unavailable");
	});
});
