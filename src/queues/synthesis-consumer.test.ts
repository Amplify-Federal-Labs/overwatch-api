import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSynthesis } from "./synthesis-consumer";
import type { SynthesisOutput } from "../services/profile-synthesis";
import type { ObservationWithEntities, ProfileForSynthesis } from "../db/synthesis-repository";
import type { MaterializationMessage } from "./types";

describe("synthesis-consumer", () => {
	const mockMaterializationQueue = {
		send: vi.fn().mockResolvedValue(undefined),
	};

	const mockProfile: ProfileForSynthesis = {
		id: "profile-1",
		type: "company",
		canonicalName: "Booz Allen Hamilton",
		observationCount: 2,
		lastSynthesizedAt: null,
	};

	const mockObservations: ObservationWithEntities[] = [
		{
			id: 1,
			signalId: "item-1",
			type: "contract_award",
			summary: "Booz Allen won $5M DevSecOps contract",
			attributes: { amount: "$5M" },
			sourceDate: "2026-02-15",
			createdAt: "2026-02-15T00:00:00Z",
			entities: [
				{ id: 10, observationId: 1, role: "subject", entityType: "company", rawName: "Booz Allen Hamilton", entityProfileId: "profile-1", resolvedAt: "2026-02-16T00:00:00Z" },
			],
		},
		{
			id: 2,
			signalId: "item-2",
			type: "solicitation",
			summary: "Booz Allen listed on Navy RFI response",
			attributes: null,
			sourceDate: "2026-03-01",
			createdAt: "2026-03-01T00:00:00Z",
			entities: [
				{ id: 11, observationId: 2, role: "subject", entityType: "company", rawName: "BAH", entityProfileId: "profile-1", resolvedAt: "2026-03-02T00:00:00Z" },
			],
		},
	];

	const mockSynthesisOutput: SynthesisOutput = {
		summary: "Booz Allen Hamilton is a major defense IT contractor.",
		trajectory: "Expanding DevSecOps portfolio.",
		relevanceScore: 80,
		insights: [
			{ type: "competitor_assessment", content: "BAH is a direct competitor in DevSecOps." },
		],
	};

	const baseDeps = {
		materializationQueue: mockMaterializationQueue,
		repository: {
			findProfileById: vi.fn(),
			findObservationsForProfile: vi.fn(),
			updateProfileSynthesis: vi.fn().mockResolvedValue(undefined),
			insertInsight: vi.fn().mockResolvedValue(undefined),
			findIngestedItemIdsForProfile: vi.fn(),
		},
		synthesizer: {
			synthesize: vi.fn(),
		},
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should synthesize a profile and produce materialization messages", async () => {
		baseDeps.repository.findProfileById.mockResolvedValue(mockProfile);
		baseDeps.repository.findObservationsForProfile.mockResolvedValue(mockObservations);
		baseDeps.synthesizer.synthesize.mockResolvedValue(mockSynthesisOutput);
		baseDeps.repository.findIngestedItemIdsForProfile.mockResolvedValue(["item-1", "item-2"]);

		const result = await handleSynthesis("profile-1", baseDeps);

		expect(result.profileId).toBe("profile-1");
		expect(result.synthesized).toBe(true);
		expect(result.insightsGenerated).toBe(1);

		// Should update profile with synthesis results
		expect(baseDeps.repository.updateProfileSynthesis).toHaveBeenCalledWith(
			"profile-1",
			mockSynthesisOutput.summary,
			mockSynthesisOutput.trajectory,
			mockSynthesisOutput.relevanceScore,
		);

		// Should insert insights
		expect(baseDeps.repository.insertInsight).toHaveBeenCalledWith(
			"profile-1",
			"competitor_assessment",
			"BAH is a direct competitor in DevSecOps.",
			"2026-02-15/2026-03-01",
			2,
		);

		// Should produce materialization messages for linked ingested items
		expect(mockMaterializationQueue.send).toHaveBeenCalledTimes(2);
		expect(mockMaterializationQueue.send).toHaveBeenCalledWith({
			type: "materialization",
			ingestedItemId: "item-1",
		});
		expect(mockMaterializationQueue.send).toHaveBeenCalledWith({
			type: "materialization",
			ingestedItemId: "item-2",
		});
	});

	it("should skip when profile is not found", async () => {
		baseDeps.repository.findProfileById.mockResolvedValue(null);

		const result = await handleSynthesis("profile-missing", baseDeps);

		expect(result.synthesized).toBe(false);
		expect(baseDeps.synthesizer.synthesize).not.toHaveBeenCalled();
		expect(mockMaterializationQueue.send).not.toHaveBeenCalled();
	});

	it("should skip when profile has no observations", async () => {
		baseDeps.repository.findProfileById.mockResolvedValue(mockProfile);
		baseDeps.repository.findObservationsForProfile.mockResolvedValue([]);

		const result = await handleSynthesis("profile-1", baseDeps);

		expect(result.synthesized).toBe(false);
		expect(baseDeps.synthesizer.synthesize).not.toHaveBeenCalled();
		expect(mockMaterializationQueue.send).not.toHaveBeenCalled();
	});

	it("should handle synthesis with no insights", async () => {
		const noInsightsOutput: SynthesisOutput = {
			summary: "Minor entity with limited data.",
			trajectory: null,
			relevanceScore: 30,
			insights: [],
		};

		baseDeps.repository.findProfileById.mockResolvedValue(mockProfile);
		baseDeps.repository.findObservationsForProfile.mockResolvedValue(mockObservations);
		baseDeps.synthesizer.synthesize.mockResolvedValue(noInsightsOutput);
		baseDeps.repository.findIngestedItemIdsForProfile.mockResolvedValue(["item-1"]);

		const result = await handleSynthesis("profile-1", baseDeps);

		expect(result.synthesized).toBe(true);
		expect(result.insightsGenerated).toBe(0);
		expect(baseDeps.repository.insertInsight).not.toHaveBeenCalled();
		expect(mockMaterializationQueue.send).toHaveBeenCalledTimes(1);
	});

	it("should compute observation window from source dates with fallback to createdAt", async () => {
		const obsWithNullDate: ObservationWithEntities[] = [
			{
				id: 3,
				signalId: "item-3",
				type: "partnership",
				summary: "Partnership announced",
				attributes: null,
				sourceDate: null,
				createdAt: "2026-01-10T00:00:00Z",
				entities: [],
			},
			{
				id: 4,
				signalId: "item-4",
				type: "contract_award",
				summary: "Contract won",
				attributes: null,
				sourceDate: "2026-03-15",
				createdAt: "2026-03-15T00:00:00Z",
				entities: [],
			},
		];

		baseDeps.repository.findProfileById.mockResolvedValue(mockProfile);
		baseDeps.repository.findObservationsForProfile.mockResolvedValue(obsWithNullDate);
		baseDeps.synthesizer.synthesize.mockResolvedValue({
			...mockSynthesisOutput,
			insights: [{ type: "opportunity_alert", content: "New opportunity." }],
		});
		baseDeps.repository.findIngestedItemIdsForProfile.mockResolvedValue([]);

		await handleSynthesis("profile-1", baseDeps);

		// Window should use createdAt date for null sourceDate
		expect(baseDeps.repository.insertInsight).toHaveBeenCalledWith(
			"profile-1",
			"opportunity_alert",
			"New opportunity.",
			"2026-01-10/2026-03-15",
			2,
		);
	});
});
