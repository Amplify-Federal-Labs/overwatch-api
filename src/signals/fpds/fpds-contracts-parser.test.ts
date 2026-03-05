import { describe, it, expect } from "vitest";
import {
	parseFpdsAtomEntries,
	extractNextPageUrl,
	buildFpdsSourceUrl,
	formatFpdsContent,
	entriesToSignals,
} from "./fpds-contracts-parser";
import type { FpdsContractEntry } from "./fpds-contracts-parser";

const SAMPLE_FPDS_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>FPDS Public Feed</title>
  <link rel="next" type="text/html" href="https://www.fpds.gov/ezsearch/FEEDS/ATOM?FEEDNAME=PUBLIC&amp;q=test&amp;start=10"/>
  <entry>
    <title><![CDATA[DELIVERY ORDER 0001 (15) awarded to PIASECKI AIRCRAFT CORPORATION, was modified for the amount of $0]]></title>
    <link rel="alternate" type="text/html" href="https://www.fpds.gov/ezsearch/search.do?q=PIID%3A0001"/>
    <modified>2025-12-01 14:27:12</modified>
    <content xmlns:ns1="https://www.fpds.gov/FPDS" type="application/xml">
      <ns1:award xmlns:ns1="https://www.fpds.gov/FPDS" version="1.5">
        <ns1:awardID>
          <ns1:awardContractID>
            <ns1:agencyID name="DEPT OF DEFENSE">9700</ns1:agencyID>
            <ns1:PIID>0001</ns1:PIID>
            <ns1:modNumber>15</ns1:modNumber>
            <ns1:transactionNumber>0</ns1:transactionNumber>
          </ns1:awardContractID>
          <ns1:referencedIDVID>
            <ns1:agencyID name="DEPT OF DEFENSE">9700</ns1:agencyID>
            <ns1:PIID>W911W617D0001</ns1:PIID>
            <ns1:modNumber>0</ns1:modNumber>
          </ns1:referencedIDVID>
        </ns1:awardID>
        <ns1:relevantContractDates>
          <ns1:signedDate>2025-12-01 00:00:00</ns1:signedDate>
          <ns1:currentCompletionDate>2026-07-31 00:00:00</ns1:currentCompletionDate>
        </ns1:relevantContractDates>
        <ns1:dollarValues>
          <ns1:obligatedAmount>0.00</ns1:obligatedAmount>
        </ns1:dollarValues>
        <ns1:totalDollarValues>
          <ns1:totalObligatedAmount>38847444.67</ns1:totalObligatedAmount>
        </ns1:totalDollarValues>
        <ns1:purchaserInformation>
          <ns1:contractingOfficeAgencyID name="DEPT OF THE ARMY" departmentID="9700" departmentName="DEPT OF DEFENSE">2100</ns1:contractingOfficeAgencyID>
        </ns1:purchaserInformation>
        <ns1:contractData>
          <ns1:contractActionType description="DELIVERY ORDER">C</ns1:contractActionType>
          <ns1:typeOfContractPricing description="COST PLUS FIXED FEE">U</ns1:typeOfContractPricing>
          <ns1:descriptionOfContractRequirement>ADAPTIVE DIGITAL AUTOMATED PILOTAGE TECHNOLOGY ADAPT FLIGHT CONTROL DEMONSTRATION.</ns1:descriptionOfContractRequirement>
        </ns1:contractData>
        <ns1:productOrServiceInformation>
          <ns1:productOrServiceCode description="NATIONAL DEFENSE R&amp;D SERVICES" productOrServiceType="SERVICE">AC12</ns1:productOrServiceCode>
          <ns1:principalNAICSCode description="RESEARCH AND DEVELOPMENT IN PHYSICAL ENGINEERING AND LIFE SCIENCES">541712</ns1:principalNAICSCode>
        </ns1:productOrServiceInformation>
        <ns1:vendor>
          <ns1:vendorHeader>
            <ns1:vendorName>PIASECKI AIRCRAFT CORPORATION</ns1:vendorName>
          </ns1:vendorHeader>
        </ns1:vendor>
        <ns1:placeOfPerformance>
          <ns1:principalPlaceOfPerformance>
            <ns1:stateCode name="PENNSYLVANIA">PA</ns1:stateCode>
          </ns1:principalPlaceOfPerformance>
        </ns1:placeOfPerformance>
        <ns1:competition>
          <ns1:extentCompeted description="FULL AND OPEN COMPETITION">A</ns1:extentCompeted>
        </ns1:competition>
        <ns1:transactionInformation>
          <ns1:status description="FINAL">F</ns1:status>
        </ns1:transactionInformation>
      </ns1:award>
    </content>
  </entry>
</feed>`;

describe("parseFpdsAtomEntries", () => {
	it("should parse a valid ATOM entry into FpdsContractEntry", () => {
		const entries = parseFpdsAtomEntries(SAMPLE_FPDS_ATOM);

		expect(entries).toHaveLength(1);
		const entry = entries[0];
		expect(entry.piid).toBe("0001");
		expect(entry.modNumber).toBe("15");
		expect(entry.referencedPiid).toBe("W911W617D0001");
		expect(entry.agencyId).toBe("9700");
		expect(entry.agencyName).toBe("DEPT OF THE ARMY");
		expect(entry.vendorName).toBe("PIASECKI AIRCRAFT CORPORATION");
		expect(entry.description).toBe("ADAPTIVE DIGITAL AUTOMATED PILOTAGE TECHNOLOGY ADAPT FLIGHT CONTROL DEMONSTRATION.");
		expect(entry.obligatedAmount).toBe("0.00");
		expect(entry.totalObligatedAmount).toBe("38847444.67");
		expect(entry.naicsCode).toBe("541712");
		expect(entry.naicsDescription).toBe("RESEARCH AND DEVELOPMENT IN PHYSICAL ENGINEERING AND LIFE SCIENCES");
		expect(entry.pscCode).toBe("AC12");
		expect(entry.pscDescription).toBe("NATIONAL DEFENSE R&D SERVICES");
		expect(entry.signedDate).toBe("2025-12-01 00:00:00");
		expect(entry.performanceState).toBe("PENNSYLVANIA");
		expect(entry.contractType).toBe("DELIVERY ORDER");
		expect(entry.competitionType).toBe("FULL AND OPEN COMPETITION");
	});

	it("should return empty array for invalid XML", () => {
		expect(parseFpdsAtomEntries("not xml at all")).toEqual([]);
	});

	it("should return empty array for XML with no entries", () => {
		const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>`;
		expect(parseFpdsAtomEntries(xml)).toEqual([]);
	});

	it("should handle entries missing optional fields", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <content xmlns:ns1="https://www.fpds.gov/FPDS" type="application/xml">
      <ns1:award xmlns:ns1="https://www.fpds.gov/FPDS" version="1.5">
        <ns1:awardID>
          <ns1:awardContractID>
            <ns1:agencyID name="DEPT OF DEFENSE">9700</ns1:agencyID>
            <ns1:PIID>FA8621</ns1:PIID>
            <ns1:modNumber>0</ns1:modNumber>
            <ns1:transactionNumber>0</ns1:transactionNumber>
          </ns1:awardContractID>
        </ns1:awardID>
        <ns1:dollarValues>
          <ns1:obligatedAmount>5000000.00</ns1:obligatedAmount>
        </ns1:dollarValues>
        <ns1:totalDollarValues>
          <ns1:totalObligatedAmount>5000000.00</ns1:totalObligatedAmount>
        </ns1:totalDollarValues>
        <ns1:purchaserInformation>
          <ns1:contractingOfficeAgencyID name="DEPT OF THE AIR FORCE">5700</ns1:contractingOfficeAgencyID>
        </ns1:purchaserInformation>
        <ns1:vendor>
          <ns1:vendorHeader>
            <ns1:vendorName>LOCKHEED MARTIN CORP</ns1:vendorName>
          </ns1:vendorHeader>
        </ns1:vendor>
        <ns1:transactionInformation>
          <ns1:status description="FINAL">F</ns1:status>
        </ns1:transactionInformation>
      </ns1:award>
    </content>
  </entry>
</feed>`;

		const entries = parseFpdsAtomEntries(xml);
		expect(entries).toHaveLength(1);
		expect(entries[0].piid).toBe("FA8621");
		expect(entries[0].referencedPiid).toBeUndefined();
		expect(entries[0].description).toBeUndefined();
		expect(entries[0].naicsCode).toBeUndefined();
		expect(entries[0].performanceState).toBeUndefined();
		expect(entries[0].vendorName).toBe("LOCKHEED MARTIN CORP");
	});

	it("should filter out entries with DELETE status", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <content xmlns:ns1="https://www.fpds.gov/FPDS" type="application/xml">
      <ns1:award xmlns:ns1="https://www.fpds.gov/FPDS" version="1.5">
        <ns1:awardID>
          <ns1:awardContractID>
            <ns1:agencyID name="DEPT OF DEFENSE">9700</ns1:agencyID>
            <ns1:PIID>DEL001</ns1:PIID>
            <ns1:modNumber>0</ns1:modNumber>
            <ns1:transactionNumber>0</ns1:transactionNumber>
          </ns1:awardContractID>
        </ns1:awardID>
        <ns1:dollarValues><ns1:obligatedAmount>0</ns1:obligatedAmount></ns1:dollarValues>
        <ns1:totalDollarValues><ns1:totalObligatedAmount>0</ns1:totalObligatedAmount></ns1:totalDollarValues>
        <ns1:purchaserInformation>
          <ns1:contractingOfficeAgencyID name="DEPT OF THE ARMY">2100</ns1:contractingOfficeAgencyID>
        </ns1:purchaserInformation>
        <ns1:vendor><ns1:vendorHeader><ns1:vendorName>DELETED VENDOR</ns1:vendorName></ns1:vendorHeader></ns1:vendor>
        <ns1:transactionInformation>
          <ns1:status description="DELETE">D</ns1:status>
        </ns1:transactionInformation>
      </ns1:award>
    </content>
  </entry>
</feed>`;

		const entries = parseFpdsAtomEntries(xml);
		expect(entries).toEqual([]);
	});
});

describe("extractNextPageUrl", () => {
	it("should extract next page URL from feed with rel=next link", () => {
		const url = extractNextPageUrl(SAMPLE_FPDS_ATOM);
		expect(url).toBe("https://www.fpds.gov/ezsearch/FEEDS/ATOM?FEEDNAME=PUBLIC&q=test&start=10");
	});

	it("should return null when no next link exists", () => {
		const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>No Next</title></feed>`;
		expect(extractNextPageUrl(xml)).toBeNull();
	});

	it("should return null for invalid XML", () => {
		expect(extractNextPageUrl("not xml")).toBeNull();
	});
});

describe("buildFpdsSourceUrl", () => {
	it("should build dedup URL with referenced PIID", () => {
		const entry: FpdsContractEntry = {
			piid: "0001",
			modNumber: "15",
			referencedPiid: "W911W617D0001",
			agencyId: "9700",
			agencyName: "DEPT OF THE ARMY",
			vendorName: "PIASECKI",
			obligatedAmount: "0",
			totalObligatedAmount: "0",
		};
		expect(buildFpdsSourceUrl(entry)).toBe("fpds://W911W617D0001_9700_0001_15");
	});

	it("should use NONE when no referenced PIID", () => {
		const entry: FpdsContractEntry = {
			piid: "FA8621",
			modNumber: "0",
			agencyId: "9700",
			agencyName: "DEPT OF THE AIR FORCE",
			vendorName: "LOCKHEED",
			obligatedAmount: "0",
			totalObligatedAmount: "0",
		};
		expect(buildFpdsSourceUrl(entry)).toBe("fpds://NONE_9700_FA8621_0");
	});
});

describe("formatFpdsContent", () => {
	it("should format a full entry with all fields", () => {
		const entry: FpdsContractEntry = {
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
			signedDate: "2025-12-01 00:00:00",
			performanceState: "PENNSYLVANIA",
			contractType: "DELIVERY ORDER",
			competitionType: "FULL AND OPEN COMPETITION",
		};

		const content = formatFpdsContent(entry);

		expect(content).toContain("FPDS Contract Award");
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
		const entry: FpdsContractEntry = {
			piid: "FA8621",
			modNumber: "0",
			agencyId: "9700",
			agencyName: "DEPT OF THE AIR FORCE",
			vendorName: "LOCKHEED MARTIN",
			obligatedAmount: "5000000",
			totalObligatedAmount: "5000000",
		};

		const content = formatFpdsContent(entry);

		expect(content).toContain("PIID: FA8621 (Mod 0)");
		expect(content).not.toContain("Type:");
		expect(content).not.toContain("NAICS:");
		expect(content).not.toContain("Description:");
		expect(content).not.toContain("Performance:");
	});
});

describe("entriesToSignals", () => {
	it("should convert entries to SignalAnalysisInput array", () => {
		const entries: FpdsContractEntry[] = [
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
		expect(signals[0].sourceType).toBe("fpds");
		expect(signals[0].sourceName).toBe("FPDS");
		expect(signals[0].sourceUrl).toBeUndefined();
		expect(signals[0].sourceLink).toBe("fpds://NONE_9700_0001_0");
		expect(signals[0].content).toContain("VENDOR A");
	});

	it("should attach sourceMetadata with FPDS contract fields", () => {
		const entry: FpdsContractEntry = {
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
			sourceType: "fpds",
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

	it("should set sourceMetadata.sourceType to fpds", () => {
		const entry: FpdsContractEntry = {
			piid: "0001",
			modNumber: "0",
			agencyId: "9700",
			agencyName: "ARMY",
			vendorName: "VENDOR A",
			obligatedAmount: "1000",
			totalObligatedAmount: "1000",
		};

		const [signal] = entriesToSignals([entry]);
		expect(signal.sourceMetadata?.sourceType).toBe("fpds");
	});
});
