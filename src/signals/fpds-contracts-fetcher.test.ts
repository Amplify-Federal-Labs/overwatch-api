import { describe, it, expect, vi } from "vitest";
import { fetchFpdsContracts } from "./fpds-contracts-fetcher";
import { Logger } from "../logger";

const logger = new Logger("ERROR");

const SAMPLE_FPDS_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>FPDS Public Feed</title>
  <link rel="next" type="text/html" href="https://www.fpds.gov/ezsearch/FEEDS/ATOM?FEEDNAME=PUBLIC&amp;q=test&amp;start=10"/>
  <entry>
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
        <ns1:dollarValues><ns1:obligatedAmount>0.00</ns1:obligatedAmount></ns1:dollarValues>
        <ns1:totalDollarValues><ns1:totalObligatedAmount>38847444.67</ns1:totalObligatedAmount></ns1:totalDollarValues>
        <ns1:purchaserInformation>
          <ns1:contractingOfficeAgencyID name="DEPT OF THE ARMY">2100</ns1:contractingOfficeAgencyID>
        </ns1:purchaserInformation>
        <ns1:contractData>
          <ns1:contractActionType description="DELIVERY ORDER">C</ns1:contractActionType>
          <ns1:descriptionOfContractRequirement>ADAPTIVE DIGITAL AUTOMATED PILOTAGE TECHNOLOGY</ns1:descriptionOfContractRequirement>
        </ns1:contractData>
        <ns1:vendor><ns1:vendorHeader><ns1:vendorName>PIASECKI AIRCRAFT CORPORATION</ns1:vendorName></ns1:vendorHeader></ns1:vendor>
        <ns1:transactionInformation><ns1:status description="FINAL">F</ns1:status></ns1:transactionInformation>
      </ns1:award>
    </content>
  </entry>
</feed>`;

const EMPTY_FEED = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`;

describe("fetchFpdsContracts", () => {
	it("should fetch ATOM feed and return FpdsContractEntry array", async () => {
		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response(SAMPLE_FPDS_ATOM, { status: 200 }))
			.mockResolvedValueOnce(new Response(EMPTY_FEED, { status: 200 }));

		const entries = await fetchFpdsContracts(mockFetch, logger);

		expect(entries).toHaveLength(1);
		expect(entries[0].piid).toBe("0001");
		expect(entries[0].agencyName).toBe("DEPT OF THE ARMY");
		expect(entries[0].vendorName).toBe("PIASECKI AIRCRAFT CORPORATION");
	});

	it("should return entries with referenced PIID for delivery orders", async () => {
		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response(SAMPLE_FPDS_ATOM, { status: 200 }))
			.mockResolvedValueOnce(new Response(EMPTY_FEED, { status: 200 }));

		const entries = await fetchFpdsContracts(mockFetch, logger);

		expect(entries[0].referencedPiid).toBe("W911W617D0001");
		expect(entries[0].modNumber).toBe("15");
	});

	it("should extract dollar values from entries", async () => {
		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response(SAMPLE_FPDS_ATOM, { status: 200 }))
			.mockResolvedValueOnce(new Response(EMPTY_FEED, { status: 200 }));

		const entries = await fetchFpdsContracts(mockFetch, logger);

		expect(entries[0].obligatedAmount).toBe("0.00");
		expect(entries[0].totalObligatedAmount).toBe("38847444.67");
		expect(entries[0].contractType).toBe("DELIVERY ORDER");
		expect(entries[0].description).toContain("ADAPTIVE DIGITAL AUTOMATED PILOTAGE");
	});

	it("should return empty array when fetch fails", async () => {
		const mockFetch = vi.fn()
			.mockRejectedValueOnce(new Error("Network error"));

		const items = await fetchFpdsContracts(mockFetch, logger);
		expect(items).toEqual([]);
	});

	it("should return empty array when feed returns non-200", async () => {
		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response("Server Error", { status: 500 }));

		const items = await fetchFpdsContracts(mockFetch, logger);
		expect(items).toEqual([]);
	});

	it("should follow pagination via rel=next links", async () => {
		const page1 = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <link rel="next" type="text/html" href="https://www.fpds.gov/ezsearch/FEEDS/ATOM?FEEDNAME=PUBLIC&amp;q=test&amp;start=10"/>
  <entry>
    <content xmlns:ns1="https://www.fpds.gov/FPDS" type="application/xml">
      <ns1:award xmlns:ns1="https://www.fpds.gov/FPDS" version="1.5">
        <ns1:awardID><ns1:awardContractID>
          <ns1:agencyID name="DEPT OF DEFENSE">9700</ns1:agencyID>
          <ns1:PIID>PAGE1</ns1:PIID><ns1:modNumber>0</ns1:modNumber><ns1:transactionNumber>0</ns1:transactionNumber>
        </ns1:awardContractID></ns1:awardID>
        <ns1:dollarValues><ns1:obligatedAmount>1000</ns1:obligatedAmount></ns1:dollarValues>
        <ns1:totalDollarValues><ns1:totalObligatedAmount>1000</ns1:totalObligatedAmount></ns1:totalDollarValues>
        <ns1:purchaserInformation><ns1:contractingOfficeAgencyID name="ARMY">2100</ns1:contractingOfficeAgencyID></ns1:purchaserInformation>
        <ns1:vendor><ns1:vendorHeader><ns1:vendorName>VENDOR A</ns1:vendorName></ns1:vendorHeader></ns1:vendor>
        <ns1:transactionInformation><ns1:status description="FINAL">F</ns1:status></ns1:transactionInformation>
      </ns1:award>
    </content>
  </entry>
</feed>`;

		const page2 = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <content xmlns:ns1="https://www.fpds.gov/FPDS" type="application/xml">
      <ns1:award xmlns:ns1="https://www.fpds.gov/FPDS" version="1.5">
        <ns1:awardID><ns1:awardContractID>
          <ns1:agencyID name="DEPT OF DEFENSE">9700</ns1:agencyID>
          <ns1:PIID>PAGE2</ns1:PIID><ns1:modNumber>0</ns1:modNumber><ns1:transactionNumber>0</ns1:transactionNumber>
        </ns1:awardContractID></ns1:awardID>
        <ns1:dollarValues><ns1:obligatedAmount>2000</ns1:obligatedAmount></ns1:dollarValues>
        <ns1:totalDollarValues><ns1:totalObligatedAmount>2000</ns1:totalObligatedAmount></ns1:totalDollarValues>
        <ns1:purchaserInformation><ns1:contractingOfficeAgencyID name="NAVY">1700</ns1:contractingOfficeAgencyID></ns1:purchaserInformation>
        <ns1:vendor><ns1:vendorHeader><ns1:vendorName>VENDOR B</ns1:vendorName></ns1:vendorHeader></ns1:vendor>
        <ns1:transactionInformation><ns1:status description="FINAL">F</ns1:status></ns1:transactionInformation>
      </ns1:award>
    </content>
  </entry>
</feed>`;

		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response(page1, { status: 200 }))
			.mockResolvedValueOnce(new Response(page2, { status: 200 }));

		const entries = await fetchFpdsContracts(mockFetch, logger);

		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(entries).toHaveLength(2);
		expect(entries[0].vendorName).toBe("VENDOR A");
		expect(entries[1].vendorName).toBe("VENDOR B");
	});
});
