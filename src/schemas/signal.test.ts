import { describe, it, expect } from "vitest";
import {
	FpdsContractMetadataSchema,
	SourceMetadataSchema,
	SignalAnalysisInputSchema,
} from "./signal";

const VALID_FPDS_METADATA = {
	sourceType: "fpds" as const,
	piid: "W911QX-24-F-0042",
	modNumber: "0",
	agencyId: "9700",
	agencyName: "DEPT OF THE ARMY",
	vendorName: "PARSONS GOVERNMENT SERVICES",
	obligatedAmount: "1230000",
	totalObligatedAmount: "1230000",
	naicsCode: "541330",
	naicsDescription: "ENGINEERING SERVICES",
	pscCode: "C219",
	pscDescription: "ENVIRONMENTAL SYSTEMS PROTECTION",
	signedDate: "2026-02-28",
	performanceState: "NEW JERSEY",
	contractType: "DELIVERY ORDER",
	competitionType: "FULL AND OPEN COMPETITION",
	description: "Engineering services including monitoring devices at a Superfund site",
	referencedPiid: "W911QX-20-D-0005",
};

describe("FpdsContractMetadataSchema", () => {
	it("should parse valid FPDS metadata with all fields", () => {
		const result = FpdsContractMetadataSchema.safeParse(VALID_FPDS_METADATA);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.piid).toBe("W911QX-24-F-0042");
			expect(result.data.sourceType).toBe("fpds");
			expect(result.data.naicsCode).toBe("541330");
		}
	});

	it("should parse FPDS metadata with only required fields", () => {
		const minimal = {
			sourceType: "fpds" as const,
			piid: "0001",
			modNumber: "0",
			agencyId: "9700",
			agencyName: "DEPT OF THE ARMY",
			vendorName: "VENDOR A",
			obligatedAmount: "50000",
			totalObligatedAmount: "50000",
		};
		const result = FpdsContractMetadataSchema.safeParse(minimal);
		expect(result.success).toBe(true);
	});

	it("should reject metadata missing required fields", () => {
		const missing = {
			sourceType: "fpds" as const,
			piid: "0001",
			// missing modNumber, agencyId, etc.
		};
		const result = FpdsContractMetadataSchema.safeParse(missing);
		expect(result.success).toBe(false);
	});

	it("should reject metadata with wrong sourceType", () => {
		const wrong = { ...VALID_FPDS_METADATA, sourceType: "sam_gov" };
		const result = FpdsContractMetadataSchema.safeParse(wrong);
		expect(result.success).toBe(false);
	});
});

describe("SourceMetadataSchema", () => {
	it("should parse FPDS metadata through discriminated union", () => {
		const result = SourceMetadataSchema.safeParse(VALID_FPDS_METADATA);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.sourceType).toBe("fpds");
		}
	});

	it("should reject unknown sourceType", () => {
		const unknown = { ...VALID_FPDS_METADATA, sourceType: "unknown_source" };
		const result = SourceMetadataSchema.safeParse(unknown);
		expect(result.success).toBe(false);
	});
});

describe("SignalAnalysisInputSchema with sourceMetadata", () => {
	it("should accept input with sourceMetadata", () => {
		const input = {
			content: "FPDS Contract Award...",
			sourceType: "fpds" as const,
			sourceName: "FPDS",
			sourceMetadata: VALID_FPDS_METADATA,
		};
		const result = SignalAnalysisInputSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.sourceMetadata).toBeDefined();
			expect(result.data.sourceMetadata?.sourceType).toBe("fpds");
		}
	});

	it("should accept input without sourceMetadata (backwards compatible)", () => {
		const input = {
			content: "Some military announcement...",
			sourceType: "mil_announcement" as const,
			sourceName: "defense.gov",
		};
		const result = SignalAnalysisInputSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.sourceMetadata).toBeUndefined();
		}
	});
});
