import { describe, it, expect, vi } from "vitest";
import { ObservationExtractor } from "./observation-extractor";
import type { ObservationExtractionResult } from "../schemas";

describe("ObservationExtractor", () => {
	function createMockClient(response: ObservationExtractionResult) {
		return {
			chat: {
				completions: {
					create: vi.fn().mockResolvedValue({
						choices: [
							{
								message: {
									content: JSON.stringify(response),
								},
							},
						],
					}),
				},
			},
		};
	}

	function createExtractor(response: ObservationExtractionResult) {
		const mockClient = createMockClient(response);
		const extractor = new ObservationExtractor({
			CF_AIG_TOKEN: "test-token",
			CF_AIG_BASEURL: "https://test.api",
			CF_AIG_MODEL: "test-model",
		} as Env);
		// Inject mock client
		(extractor as unknown as Record<string, unknown>)["client"] = mockClient;
		return { extractor, mockClient };
	}

	it("should extract observations from signal content", async () => {
		const aiResponse: ObservationExtractionResult = {
			observations: [
				{
					type: "contract_award",
					summary: "Booz Allen Hamilton won $5M DevSecOps contract from NIWC Pacific",
					entities: [
						{ type: "company", name: "Booz Allen Hamilton", role: "subject" },
						{ type: "agency", name: "NIWC Pacific", role: "object" },
					],
					attributes: { amount: "$5M", domain: "DevSecOps" },
					sourceDate: "2026-03-01",
				},
			],
		};

		const { extractor } = createExtractor(aiResponse);

		const result = await extractor.extract({
			content: "Booz Allen wins $5M NIWC Pacific DevSecOps contract",
			sourceType: "rss",
			sourceName: "GovConWire",
		});

		expect(result.observations).toHaveLength(1);
		expect(result.observations[0].type).toBe("contract_award");
		expect(result.observations[0].entities).toHaveLength(2);
	});

	it("should handle multiple observations from a single signal", async () => {
		const aiResponse: ObservationExtractionResult = {
			observations: [
				{
					type: "contract_award",
					summary: "SAIC won $10M cloud migration contract",
					entities: [
						{ type: "company", name: "SAIC", role: "subject" },
					],
				},
				{
					type: "personnel_move",
					summary: "New program manager appointed",
					entities: [
						{ type: "person", name: "John Doe", role: "subject" },
					],
				},
			],
		};

		const { extractor } = createExtractor(aiResponse);

		const result = await extractor.extract({
			content: "SAIC wins contract; new PM appointed",
			sourceType: "rss",
			sourceName: "FedScoop",
		});

		expect(result.observations).toHaveLength(2);
	});

	it("should handle empty AI response gracefully", async () => {
		const aiResponse: ObservationExtractionResult = {
			observations: [],
		};

		const { extractor } = createExtractor(aiResponse);

		const result = await extractor.extract({
			content: "Weather report for DC area",
			sourceType: "rss",
			sourceName: "GovConWire",
		});

		expect(result.observations).toHaveLength(0);
	});

	it("should strip markdown fences from AI response", async () => {
		const mockClient = {
			chat: {
				completions: {
					create: vi.fn().mockResolvedValue({
						choices: [
							{
								message: {
									content: "```json\n{\"observations\":[{\"type\":\"solicitation\",\"summary\":\"Army RFP\",\"entities\":[{\"type\":\"agency\",\"name\":\"Army\",\"role\":\"subject\"}]}]}\n```",
								},
							},
						],
					}),
				},
			},
		};

		const extractor = new ObservationExtractor({
			CF_AIG_TOKEN: "test-token",
			CF_AIG_BASEURL: "https://test.api",
			CF_AIG_MODEL: "test-model",
		} as Env);
		(extractor as unknown as Record<string, unknown>)["client"] = mockClient;

		const result = await extractor.extract({
			content: "Army issues RFP",
			sourceType: "sam_gov",
			sourceName: "SAM.gov",
		});

		expect(result.observations).toHaveLength(1);
		expect(result.observations[0].type).toBe("solicitation");
	});

	it("should throw on empty AI response", async () => {
		const mockClient = {
			chat: {
				completions: {
					create: vi.fn().mockResolvedValue({
						choices: [{ message: { content: null } }],
					}),
				},
			},
		};

		const extractor = new ObservationExtractor({
			CF_AIG_TOKEN: "test-token",
			CF_AIG_BASEURL: "https://test.api",
			CF_AIG_MODEL: "test-model",
		} as Env);
		(extractor as unknown as Record<string, unknown>)["client"] = mockClient;

		await expect(
			extractor.extract({
				content: "test",
				sourceType: "rss",
				sourceName: "test",
			}),
		).rejects.toThrow("Empty response from Worker AI");
	});

	it("should filter out observations with invalid types", async () => {
		const mockClient = {
			chat: {
				completions: {
					create: vi.fn().mockResolvedValue({
						choices: [
							{
								message: {
									content: JSON.stringify({
										observations: [
											{
												type: "contract_award",
												summary: "Valid observation",
												entities: [],
											},
											{
												type: "invalid_garbage",
												summary: "Invalid observation",
												entities: [],
											},
										],
									}),
								},
							},
						],
					}),
				},
			},
		};

		const extractor = new ObservationExtractor({
			CF_AIG_TOKEN: "test-token",
			CF_AIG_BASEURL: "https://test.api",
			CF_AIG_MODEL: "test-model",
		} as Env);
		(extractor as unknown as Record<string, unknown>)["client"] = mockClient;

		const result = await extractor.extract({
			content: "test content",
			sourceType: "rss",
			sourceName: "test",
		});

		expect(result.observations).toHaveLength(1);
		expect(result.observations[0].type).toBe("contract_award");
	});
});
