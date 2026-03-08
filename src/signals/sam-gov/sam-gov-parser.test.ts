import { describe, it, expect } from "vitest";
import {
	parseSamGovResponse,
	formatSamGovContent,
	buildSamGovSourceUrl,
	opportunitiesToSignals,
} from "./sam-gov-parser";
import type { SamGovOpportunity } from "./sam-gov-parser";

const SAMPLE_OPPORTUNITY: SamGovOpportunity = {
	noticeId: "abc123def456",
	title: "Cloud Platform Migration to IL5 Environment",
	solicitationNumber: "W911QX-26-R-0042",
	postedDate: "2026-03-01 10:30:00",
	type: "Solicitation",
	baseType: "Solicitation",
	naicsCode: "541512",
	classificationCode: "D301",
	typeOfSetAside: "SDVOSBC",
	typeOfSetAsideDescription: "Service-Disabled Veteran-Owned Small Business",
	responseDeadLine: "2026-04-15 14:00:00",
	active: "Yes",
	organizationName: "DEPT OF THE ARMY",
	pointOfContact: [
		{
			fullName: "John Smith",
			title: "Contracting Officer",
			email: "john.smith@army.mil",
			phone: "555-123-4567",
		},
	],
	placeOfPerformance: {
		city: { name: "Fort Belvoir" },
		state: { code: "VA", name: "Virginia" },
		zip: "22060",
	},
	description: "https://sam.gov/api/prod/opps/v3/opportunities/abc123def456/resources/description",
	uiLink: "https://sam.gov/opp/abc123def456/view",
	award: null,
};

const SAMPLE_API_RESPONSE = {
	totalRecords: 1,
	limit: 100,
	offset: 0,
	opportunitiesData: [
		{
			noticeId: "abc123def456",
			title: "Cloud Platform Migration to IL5 Environment",
			solicitationNumber: "W911QX-26-R-0042",
			postedDate: "2026-03-01 10:30:00",
			type: "Solicitation",
			baseType: "Solicitation",
			naicsCode: "541512",
			classificationCode: "D301",
			typeOfSetAside: "SDVOSBC",
			typeOfSetAsideDescription: "Service-Disabled Veteran-Owned Small Business",
			responseDeadLine: "2026-04-15 14:00:00",
			active: "Yes",
			organizationName: "DEPT OF THE ARMY",
			pointOfContact: [
				{
					fullName: "John Smith",
					title: "Contracting Officer",
					email: "john.smith@army.mil",
					phone: "555-123-4567",
				},
			],
			placeOfPerformance: {
				city: { name: "Fort Belvoir" },
				state: { code: "VA", name: "Virginia" },
				zip: "22060",
			},
			description: "https://sam.gov/api/prod/opps/v3/opportunities/abc123def456/resources/description",
			uiLink: "https://sam.gov/opp/abc123def456/view",
			award: null,
		},
	],
};

describe("parseSamGovResponse", () => {
	it("parses a valid response into SamGovOpportunity array", () => {
		const opps = parseSamGovResponse(SAMPLE_API_RESPONSE);

		expect(opps).toHaveLength(1);
		expect(opps[0].noticeId).toBe("abc123def456");
		expect(opps[0].title).toBe("Cloud Platform Migration to IL5 Environment");
		expect(opps[0].solicitationNumber).toBe("W911QX-26-R-0042");
		expect(opps[0].type).toBe("Solicitation");
		expect(opps[0].naicsCode).toBe("541512");
		expect(opps[0].organizationName).toBe("DEPT OF THE ARMY");
		expect(opps[0].typeOfSetAside).toBe("SDVOSBC");
		expect(opps[0].responseDeadLine).toBe("2026-04-15 14:00:00");
	});

	it("returns empty array when opportunitiesData is missing", () => {
		expect(parseSamGovResponse({})).toEqual([]);
	});

	it("returns empty array when opportunitiesData is not an array", () => {
		expect(parseSamGovResponse({ opportunitiesData: "bad" })).toEqual([]);
	});

	it("skips entries missing noticeId", () => {
		const response = {
			opportunitiesData: [
				{ title: "No Notice ID" },
			],
		};
		expect(parseSamGovResponse(response)).toEqual([]);
	});

	it("skips entries missing title", () => {
		const response = {
			opportunitiesData: [
				{ noticeId: "abc123" },
			],
		};
		expect(parseSamGovResponse(response)).toEqual([]);
	});

	it("handles entries with minimal fields", () => {
		const response = {
			opportunitiesData: [
				{
					noticeId: "min001",
					title: "Minimal Opportunity",
				},
			],
		};
		const opps = parseSamGovResponse(response);
		expect(opps).toHaveLength(1);
		expect(opps[0].noticeId).toBe("min001");
		expect(opps[0].title).toBe("Minimal Opportunity");
		expect(opps[0].solicitationNumber).toBeUndefined();
		expect(opps[0].naicsCode).toBeUndefined();
		expect(opps[0].pointOfContact).toEqual([]);
		expect(opps[0].placeOfPerformance).toBeUndefined();
		expect(opps[0].award).toBeNull();
	});

	it("parses point of contact array", () => {
		const opps = parseSamGovResponse(SAMPLE_API_RESPONSE);
		expect(opps[0].pointOfContact).toHaveLength(1);
		expect(opps[0].pointOfContact[0].fullName).toBe("John Smith");
		expect(opps[0].pointOfContact[0].email).toBe("john.smith@army.mil");
	});

	it("parses place of performance", () => {
		const opps = parseSamGovResponse(SAMPLE_API_RESPONSE);
		expect(opps[0].placeOfPerformance?.state?.name).toBe("Virginia");
		expect(opps[0].placeOfPerformance?.city?.name).toBe("Fort Belvoir");
	});
});

describe("formatSamGovContent", () => {
	it("formats opportunity with all fields", () => {
		const content = formatSamGovContent(SAMPLE_OPPORTUNITY);

		expect(content).toContain("SAM.gov Opportunity — Solicitation");
		expect(content).toContain("Cloud Platform Migration to IL5 Environment");
		expect(content).toContain("Solicitation #: W911QX-26-R-0042");
		expect(content).toContain("Agency: DEPT OF THE ARMY");
		expect(content).toContain("NAICS: 541512");
		expect(content).toContain("Set-Aside: Service-Disabled Veteran-Owned Small Business");
		expect(content).toContain("Response Deadline: 2026-04-15 14:00:00");
		expect(content).toContain("Location: Fort Belvoir, Virginia, 22060");
		expect(content).toContain("Contact: John Smith (Contracting Officer) — john.smith@army.mil");
	});

	it("includes contact phone in formatted content", () => {
		const content = formatSamGovContent(SAMPLE_OPPORTUNITY);
		expect(content).toContain("555-123-4567");
	});

	it("includes description in formatted content when present", () => {
		const withDescription: SamGovOpportunity = {
			...SAMPLE_OPPORTUNITY,
			description: "The Army requires cloud migration services for IL5 classified workloads.",
		};
		const content = formatSamGovContent(withDescription);
		expect(content).toContain("The Army requires cloud migration services for IL5 classified workloads.");
	});

	it("omits optional fields when missing", () => {
		const minimal: SamGovOpportunity = {
			noticeId: "min001",
			title: "Basic Opportunity",
			postedDate: "2026-03-01",
			type: "Solicitation",
			baseType: "Solicitation",
			active: "Yes",
			pointOfContact: [],
			award: null,
		};

		const content = formatSamGovContent(minimal);

		expect(content).toContain("Basic Opportunity");
		expect(content).not.toContain("Solicitation #:");
		expect(content).not.toContain("NAICS:");
		expect(content).not.toContain("Set-Aside:");
		expect(content).not.toContain("Response Deadline:");
		expect(content).not.toContain("Location:");
		expect(content).not.toContain("Contact:");
	});

	it("formats award information when present", () => {
		const withAward: SamGovOpportunity = {
			...SAMPLE_OPPORTUNITY,
			award: {
				amount: "14000000000",
				date: "2026-02-15",
				awardee: { name: "Leidos Inc", ueiSAM: "ABC123" },
			},
		};

		const content = formatSamGovContent(withAward);

		expect(content).toContain("Award: $14000000000 to Leidos Inc");
		expect(content).toContain("Award Date: 2026-02-15");
	});
});

describe("buildSamGovSourceUrl", () => {
	it("returns uiLink when available", () => {
		expect(buildSamGovSourceUrl(SAMPLE_OPPORTUNITY)).toBe("https://sam.gov/opp/abc123def456/view");
	});

	it("constructs sam:// URL when uiLink is missing", () => {
		const opp: SamGovOpportunity = {
			...SAMPLE_OPPORTUNITY,
			uiLink: undefined,
		};
		expect(buildSamGovSourceUrl(opp)).toBe("sam://abc123def456");
	});
});

describe("opportunitiesToSignals", () => {
	it("converts opportunities to SignalAnalysisInput array", () => {
		const signals = opportunitiesToSignals([SAMPLE_OPPORTUNITY]);

		expect(signals).toHaveLength(1);
		expect(signals[0].sourceType).toBe("sam_gov");
		expect(signals[0].sourceName).toBe("SAM.gov");
		expect(signals[0].sourceLink).toBe("sam://abc123def456");
		expect(signals[0].sourceUrl).toBe("https://sam.gov/opp/abc123def456/view");
		expect(signals[0].content).toContain("Cloud Platform Migration");
	});

	it("returns empty array for empty input", () => {
		expect(opportunitiesToSignals([])).toEqual([]);
	});

	it("populates sourceMetadata with structured SAM.gov fields", () => {
		const signals = opportunitiesToSignals([SAMPLE_OPPORTUNITY]);
		const meta = signals[0].sourceMetadata;

		expect(meta).toBeDefined();
		expect(meta!.contactName).toBe("John Smith");
		expect(meta!.contactTitle).toBe("Contracting Officer");
		expect(meta!.contactEmail).toBe("john.smith@army.mil");
		expect(meta!.contactPhone).toBe("555-123-4567");
		expect(meta!.naicsCode).toBe("541512");
		expect(meta!.classificationCode).toBe("D301");
		expect(meta!.setAside).toBe("Service-Disabled Veteran-Owned Small Business");
		expect(meta!.responseDeadline).toBe("2026-04-15 14:00:00");
		expect(meta!.solicitationNumber).toBe("W911QX-26-R-0042");
		expect(meta!.location).toBe("Fort Belvoir, Virginia, 22060");
		expect(meta!.agency).toBe("DEPT OF THE ARMY");
	});

	it("omits undefined sourceMetadata fields for minimal opportunity", () => {
		const minimal: SamGovOpportunity = {
			noticeId: "min001",
			title: "Minimal",
			postedDate: "2026-03-01",
			type: "Solicitation",
			baseType: "Solicitation",
			active: "Yes",
			pointOfContact: [],
			award: null,
		};

		const signals = opportunitiesToSignals([minimal]);
		const meta = signals[0].sourceMetadata;

		expect(meta).toBeDefined();
		expect(meta!.contactName).toBeUndefined();
		expect(meta!.naicsCode).toBeUndefined();
	});
});
