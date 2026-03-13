import { describe, it, expect } from "vitest";
import {
	parseContractAwardsResponse,
	buildSourceUrl,
	formatContent,
	entriesToSignals,
} from "./contract-awards-parser";
import type { ContractAwardEntry } from "./contract-awards-parser";

const SAMPLE_RESPONSE = {
	totalRecords: 2,
	limit: 100,
	offset: 0,
	data: [
		{
			contractId: {
				PIID: "0001",
				modNumber: "15",
				agencyID: "9700",
				referencedIDVPIID: "W911W617D0001",
				transactionNumber: "0",
			},
			coreData: {
				contractingOfficeAgencyID: "2100",
				contractingOfficeAgencyName: "DEPT OF THE ARMY",
				contractActionType: "C",
				contractActionTypeDescription: "DELIVERY ORDER",
				descriptionOfContractRequirement:
					"ADAPTIVE DIGITAL AUTOMATED PILOTAGE TECHNOLOGY ADAPT FLIGHT CONTROL DEMONSTRATION.",
				principalNAICSCode: "541712",
				principalNAICSDescription:
					"RESEARCH AND DEVELOPMENT IN PHYSICAL ENGINEERING AND LIFE SCIENCES",
				productOrServiceCode: "AC12",
				productOrServiceDescription: "NATIONAL DEFENSE R&D SERVICES",
				extentCompeted: "A",
				extentCompetedDescription: "FULL AND OPEN COMPETITION",
			},
			awardDetails: {
				vendorName: "PIASECKI AIRCRAFT CORPORATION",
				obligatedAmount: "0.00",
				totalObligatedAmount: "38847444.67",
				signedDate: "2025-12-01",
				stateCode: "PA",
				stateName: "PENNSYLVANIA",
			},
		},
		{
			contractId: {
				PIID: "FA8621",
				modNumber: "0",
				agencyID: "9700",
				transactionNumber: "0",
			},
			coreData: {
				contractingOfficeAgencyID: "5700",
				contractingOfficeAgencyName: "DEPT OF THE AIR FORCE",
			},
			awardDetails: {
				vendorName: "LOCKHEED MARTIN CORP",
				obligatedAmount: "5000000.00",
				totalObligatedAmount: "5000000.00",
			},
		},
	],
};

describe("parseContractAwardsResponse", () => {
	it("should parse a valid response into ContractAwardEntry array", () => {
		const entries = parseContractAwardsResponse(SAMPLE_RESPONSE);

		expect(entries).toHaveLength(2);
		const entry = entries[0];
		expect(entry.piid).toBe("0001");
		expect(entry.modNumber).toBe("15");
		expect(entry.referencedPiid).toBe("W911W617D0001");
		expect(entry.agencyId).toBe("9700");
		expect(entry.agencyName).toBe("DEPT OF THE ARMY");
		expect(entry.vendorName).toBe("PIASECKI AIRCRAFT CORPORATION");
		expect(entry.description).toBe(
			"ADAPTIVE DIGITAL AUTOMATED PILOTAGE TECHNOLOGY ADAPT FLIGHT CONTROL DEMONSTRATION.",
		);
		expect(entry.obligatedAmount).toBe("0.00");
		expect(entry.totalObligatedAmount).toBe("38847444.67");
		expect(entry.naicsCode).toBe("541712");
		expect(entry.naicsDescription).toBe(
			"RESEARCH AND DEVELOPMENT IN PHYSICAL ENGINEERING AND LIFE SCIENCES",
		);
		expect(entry.pscCode).toBe("AC12");
		expect(entry.pscDescription).toBe("NATIONAL DEFENSE R&D SERVICES");
		expect(entry.signedDate).toBe("2025-12-01");
		expect(entry.performanceState).toBe("PENNSYLVANIA");
		expect(entry.contractType).toBe("DELIVERY ORDER");
		expect(entry.competitionType).toBe("FULL AND OPEN COMPETITION");
	});

	it("should handle entries missing optional fields", () => {
		const entries = parseContractAwardsResponse(SAMPLE_RESPONSE);

		const entry = entries[1];
		expect(entry.piid).toBe("FA8621");
		expect(entry.referencedPiid).toBeUndefined();
		expect(entry.description).toBeUndefined();
		expect(entry.naicsCode).toBeUndefined();
		expect(entry.performanceState).toBeUndefined();
		expect(entry.contractType).toBeUndefined();
		expect(entry.competitionType).toBeUndefined();
		expect(entry.vendorName).toBe("LOCKHEED MARTIN CORP");
	});

	it("should return empty array for response with no data", () => {
		expect(parseContractAwardsResponse({})).toEqual([]);
		expect(parseContractAwardsResponse({ data: [] })).toEqual([]);
	});

	it("should skip entries missing required contractId fields", () => {
		const response = {
			data: [
				{
					contractId: { PIID: "0001" },
					coreData: {},
					awardDetails: {},
				},
			],
		};
		const entries = parseContractAwardsResponse(response);
		expect(entries).toEqual([]);
	});

	it("should filter out deleted records", () => {
		const response = {
			data: [
				{
					contractId: {
						PIID: "DEL001",
						modNumber: "0",
						agencyID: "9700",
					},
					coreData: {
						contractingOfficeAgencyName: "ARMY",
					},
					awardDetails: {
						vendorName: "DELETED VENDOR",
						obligatedAmount: "0",
						totalObligatedAmount: "0",
					},
					deletedStatus: "yes",
				},
			],
		};
		const entries = parseContractAwardsResponse(response);
		expect(entries).toEqual([]);
	});
});

describe("buildSourceUrl", () => {
	it("should build dedup URL with referenced PIID", () => {
		const entry: ContractAwardEntry = {
			piid: "0001",
			modNumber: "15",
			referencedPiid: "W911W617D0001",
			agencyId: "9700",
			agencyName: "DEPT OF THE ARMY",
			vendorName: "PIASECKI",
			obligatedAmount: "0",
			totalObligatedAmount: "0",
		};
		expect(buildSourceUrl(entry)).toBe("contract-award://W911W617D0001_9700_0001_15");
	});

	it("should use NONE when no referenced PIID", () => {
		const entry: ContractAwardEntry = {
			piid: "FA8621",
			modNumber: "0",
			agencyId: "9700",
			agencyName: "DEPT OF THE AIR FORCE",
			vendorName: "LOCKHEED",
			obligatedAmount: "0",
			totalObligatedAmount: "0",
		};
		expect(buildSourceUrl(entry)).toBe("contract-award://NONE_9700_FA8621_0");
	});
});

describe("formatContent", () => {
	it("should format a full entry with all fields", () => {
		const entry: ContractAwardEntry = {
			piid: "0001",
			modNumber: "15",
			referencedPiid: "W911W617D0001",
			agencyId: "9700",
			agencyName: "DEPT OF THE ARMY",
			vendorName: "PIASECKI AIRCRAFT CORPORATION",
			description: "ADAPTIVE DIGITAL AUTOMATED PILOTAGE TECHNOLOGY",
			obligatedAmount: "0.00",
			totalObligatedAmount: "38847444.67",
			naicsCode: "541712",
			naicsDescription: "RESEARCH AND DEVELOPMENT",
			pscCode: "AC12",
			pscDescription: "NATIONAL DEFENSE R&D SERVICES",
			signedDate: "2025-12-01",
			performanceState: "PENNSYLVANIA",
			contractType: "DELIVERY ORDER",
			competitionType: "FULL AND OPEN COMPETITION",
		};

		const content = formatContent(entry);

		expect(content).toContain("Contract Award");
		expect(content).toContain("Agency: DEPT OF THE ARMY");
		expect(content).toContain("Vendor: PIASECKI AIRCRAFT CORPORATION");
		expect(content).toContain("PIID: W911W617D0001/0001 (Mod 15)");
		expect(content).toContain("Obligated: $0.00 | Total: $38847444.67");
		expect(content).toContain("Type: DELIVERY ORDER");
		expect(content).toContain("NAICS: 541712");
		expect(content).toContain("PSC: AC12");
		expect(content).toContain("Description: ADAPTIVE DIGITAL");
		expect(content).toContain("Performance: PENNSYLVANIA");
		expect(content).toContain("Competition: FULL AND OPEN");
		expect(content).toContain("Signed: 2025-12-01");
	});

	it("should omit optional fields when missing", () => {
		const entry: ContractAwardEntry = {
			piid: "FA8621",
			modNumber: "0",
			agencyId: "9700",
			agencyName: "DEPT OF THE AIR FORCE",
			vendorName: "LOCKHEED MARTIN",
			obligatedAmount: "5000000",
			totalObligatedAmount: "5000000",
		};

		const content = formatContent(entry);

		expect(content).toContain("PIID: FA8621 (Mod 0)");
		expect(content).not.toContain("Type:");
		expect(content).not.toContain("NAICS:");
		expect(content).not.toContain("Description:");
		expect(content).not.toContain("Performance:");
	});
});

describe("entriesToSignals", () => {
	it("should convert entries to SignalAnalysisInput array", () => {
		const entries: ContractAwardEntry[] = [
			{
				piid: "0001",
				modNumber: "0",
				agencyId: "9700",
				agencyName: "ARMY",
				vendorName: "VENDOR A",
				obligatedAmount: "1000",
				totalObligatedAmount: "1000",
			},
		];

		const signals = entriesToSignals(entries);

		expect(signals).toHaveLength(1);
		expect(signals[0].sourceType).toBe("contract_awards");
		expect(signals[0].sourceName).toBe("SAM.gov Contract Awards");
		expect(signals[0].sourceUrl).toBeUndefined();
		expect(signals[0].sourceLink).toBe("contract-award://NONE_9700_0001_0");
		expect(signals[0].content).toContain("VENDOR A");
	});

	it("should attach sourceMetadata with contract fields", () => {
		const entry: ContractAwardEntry = {
			piid: "W911QX-24-F-0042",
			modNumber: "0",
			referencedPiid: "W911QX-20-D-0005",
			agencyId: "9700",
			agencyName: "DEPT OF THE ARMY",
			vendorName: "PARSONS GOVERNMENT SERVICES",
			description: "Engineering services at Superfund site",
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
		};

		const [signal] = entriesToSignals([entry]);

		expect(signal.sourceMetadata).toEqual({
			sourceType: "contract_awards",
			piid: "W911QX-24-F-0042",
			modNumber: "0",
			referencedPiid: "W911QX-20-D-0005",
			agencyId: "9700",
			agencyName: "DEPT OF THE ARMY",
			vendorName: "PARSONS GOVERNMENT SERVICES",
			description: "Engineering services at Superfund site",
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
		});
	});

	it("should set sourceMetadata.sourceType to contract_awards", () => {
		const entry: ContractAwardEntry = {
			piid: "0001",
			modNumber: "0",
			agencyId: "9700",
			agencyName: "ARMY",
			vendorName: "VENDOR A",
			obligatedAmount: "1000",
			totalObligatedAmount: "1000",
		};

		const [signal] = entriesToSignals([entry]);
		expect(signal.sourceMetadata?.sourceType).toBe("contract_awards");
	});
});
