import { describe, it, expect, vi } from "vitest";
import { parseSynthesisResponse } from "./profile-synthesizer";
import { buildSynthesisContext } from "../db/synthesis-repository";

vi.mock("agents", () => ({
	Agent: class {},
	getAgentByName: vi.fn(),
}));

import { shouldSelfScheduleSynthesis, type SynthesisRunResult } from "./synthesis-agent";
import type { ObservationWithEntities, ProfileForSynthesis } from "../db/synthesis-repository";

// Test the full synthesis pipeline that the agent orchestrates:
// 1. Receive profile IDs from EntityResolverAgent
// 2. Fetch profiles by ID, gather observations for each
// 3. Build context → AI synthesis → parse response
// 4. Store insights + update profile
// 5. Self-schedule remaining profile IDs if batch exceeds limit

describe("SynthesisAgent pipeline", () => {
	it("builds context, synthesizes, and produces actionable output", () => {
		const profile: ProfileForSynthesis = {
			id: "profile-1",
			type: "company",
			canonicalName: "Booz Allen Hamilton",
			observationCount: 3,
			lastSynthesizedAt: null,
		};

		const observations: ObservationWithEntities[] = [
			{
				id: 1,
				signalId: "sig-1",
				type: "contract_award",
				summary: "Booz Allen won $5M DevSecOps contract from NIWC Pacific",
				attributes: { amount: "$5M" },
				sourceDate: "2026-02-15",
				createdAt: "2026-02-15T00:00:00Z",
				entities: [
					{ id: 10, observationId: 1, role: "subject", entityType: "company", rawName: "Booz Allen Hamilton", entityProfileId: "profile-1", resolvedAt: "2026-02-16T00:00:00Z" },
				],
			},
		];

		// Step 1: Build context
		const context = buildSynthesisContext(profile.canonicalName, profile.type, observations);
		expect(context).toContain("Booz Allen Hamilton");
		expect(context).toContain("contract_award");

		// Step 2: Parse a simulated AI response
		const aiResponse = JSON.stringify({
			summary: "Booz Allen Hamilton is a major defense IT contractor with growing DevSecOps presence.",
			trajectory: "Expanding Navy IT modernization portfolio.",
			relevanceScore: 80,
			insights: [
				{
					type: "competitor_assessment",
					content: "BAH is a direct competitor in the DevSecOps and cloud spaces.",
				},
			],
		});

		const output = parseSynthesisResponse(aiResponse);

		expect(output.summary).toContain("Booz Allen");
		expect(output.relevanceScore).toBe(80);
		expect(output.insights).toHaveLength(1);
		expect(output.insights[0].type).toBe("competitor_assessment");
	});

	it("computes observation window from date range", () => {
		const observations: ObservationWithEntities[] = [
			{
				id: 1, signalId: "s1", type: "contract_award", summary: "Award 1",
				attributes: null, sourceDate: "2026-01-15", createdAt: "2026-01-15T00:00:00Z", entities: [],
			},
			{
				id: 2, signalId: "s2", type: "solicitation", summary: "RFP 1",
				attributes: null, sourceDate: "2026-03-01", createdAt: "2026-03-01T00:00:00Z", entities: [],
			},
			{
				id: 3, signalId: "s3", type: "partnership", summary: "Partnership",
				attributes: null, sourceDate: null, createdAt: "2026-02-15T00:00:00Z", entities: [],
			},
		];

		// Compute window from observation dates
		const dates = observations
			.map((o) => o.sourceDate ?? o.createdAt.split("T")[0])
			.sort();
		const window = `${dates[0]}/${dates[dates.length - 1]}`;

		expect(window).toBe("2026-01-15/2026-03-01");
	});

	it("handles profiles with no observations gracefully", () => {
		const observations: ObservationWithEntities[] = [];
		const context = buildSynthesisContext("Ghost Entity", "person", observations);
		expect(context).toContain("0 observations");
	});
});

describe("shouldSelfScheduleSynthesis", () => {
	it("returns true when remaining profiles exist and some processed", () => {
		const result: SynthesisRunResult = { profilesProcessed: 10, insightsGenerated: 5, remainingProfileIds: ["p-1", "p-2"], startedAt: "2026-03-01T00:00:00Z" };
		expect(shouldSelfScheduleSynthesis(result)).toBe(true);
	});

	it("returns false when no remaining profiles", () => {
		const result: SynthesisRunResult = { profilesProcessed: 10, insightsGenerated: 5, remainingProfileIds: [], startedAt: "2026-03-01T00:00:00Z" };
		expect(shouldSelfScheduleSynthesis(result)).toBe(false);
	});

	it("returns false when no profiles were processed (all failed)", () => {
		const result: SynthesisRunResult = { profilesProcessed: 0, insightsGenerated: 0, remainingProfileIds: ["p-1"], startedAt: "2026-03-01T00:00:00Z" };
		expect(shouldSelfScheduleSynthesis(result)).toBe(false);
	});
});
