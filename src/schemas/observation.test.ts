import { describe, it, expect } from "vitest";
import {
	ObservationExtractionResultSchema,
	ObservationExtractionSchema,
	EntityRefSchema,
} from "./observation";

describe("ObservationExtractionResultSchema", () => {
	it("should parse a valid extraction result with one observation", () => {
		const input = {
			observations: [
				{
					type: "contract_award",
					summary: "Booz Allen won $5M DevSecOps contract from NIWC Pacific",
					entities: [
						{ type: "company", name: "Booz Allen Hamilton", role: "subject" },
						{ type: "agency", name: "NIWC Pacific", role: "object" },
					],
					attributes: {
						amount: "$5M",
						domain: "DevSecOps",
					},
					sourceDate: "2026-03-01",
				},
			],
		};

		const result = ObservationExtractionResultSchema.parse(input);
		expect(result.observations).toHaveLength(1);
		expect(result.observations[0].type).toBe("contract_award");
		expect(result.observations[0].entities).toHaveLength(2);
	});

	it("should parse multiple observations from a single signal", () => {
		const input = {
			observations: [
				{
					type: "personnel_move",
					summary: "Col. Jane Smith appointed director of cloud modernization at NIWC Pacific",
					entities: [
						{ type: "person", name: "Col. Jane Smith", role: "subject" },
						{ type: "agency", name: "NIWC Pacific", role: "object" },
					],
				},
				{
					type: "technology_adoption",
					summary: "NIWC Pacific mandated Kubernetes for all new deployments",
					entities: [
						{ type: "agency", name: "NIWC Pacific", role: "subject" },
						{ type: "technology", name: "Kubernetes", role: "object" },
					],
				},
			],
		};

		const result = ObservationExtractionResultSchema.parse(input);
		expect(result.observations).toHaveLength(2);
	});

	it("should reject invalid observation type", () => {
		const input = {
			observations: [
				{
					type: "invalid_type",
					summary: "Something happened",
					entities: [],
				},
			],
		};

		expect(() => ObservationExtractionResultSchema.parse(input)).toThrow();
	});

	it("should reject invalid entity role", () => {
		const input = {
			type: "person",
			name: "John Doe",
			role: "bystander",
		};

		expect(() => EntityRefSchema.parse(input)).toThrow();
	});

	it("should allow observations without optional fields", () => {
		const input = {
			type: "solicitation",
			summary: "Army issued RFP for cloud migration",
			entities: [
				{ type: "agency", name: "U.S. Army", role: "subject" },
			],
		};

		const result = ObservationExtractionSchema.parse(input);
		expect(result.attributes).toBeUndefined();
		expect(result.sourceDate).toBeUndefined();
	});
});
