import type { SignalAnalysisInput } from "../../schemas";

export interface SamGovPointOfContact {
	fullName?: string;
	title?: string;
	email?: string;
	phone?: string;
}

export interface SamGovPlaceOfPerformance {
	city?: { name?: string };
	state?: { code?: string; name?: string };
	zip?: string;
}

export interface SamGovAward {
	amount?: string;
	date?: string;
	awardee?: { name?: string; ueiSAM?: string };
}

export interface SamGovOpportunity {
	noticeId: string;
	title: string;
	solicitationNumber?: string;
	postedDate: string;
	type: string;
	baseType: string;
	naicsCode?: string;
	classificationCode?: string;
	typeOfSetAside?: string;
	typeOfSetAsideDescription?: string;
	responseDeadLine?: string;
	active: string;
	organizationName?: string;
	pointOfContact: SamGovPointOfContact[];
	placeOfPerformance?: SamGovPlaceOfPerformance;
	description?: string;
	uiLink?: string;
	award: SamGovAward | null;
}

export function parseSamGovResponse(json: Record<string, unknown>): SamGovOpportunity[] {
	const data = json.opportunitiesData;
	if (!Array.isArray(data)) return [];

	const results: SamGovOpportunity[] = [];

	for (const raw of data) {
		if (typeof raw !== "object" || raw === null) continue;
		const item = raw as Record<string, unknown>;

		const noticeId = typeof item.noticeId === "string" ? item.noticeId : undefined;
		const title = typeof item.title === "string" ? item.title : undefined;
		if (!noticeId || !title) continue;

		const pointOfContact = parsePointOfContact(item.pointOfContact);
		const placeOfPerformance = parsePlaceOfPerformance(item.placeOfPerformance);
		const award = parseAward(item.award);

		results.push({
			noticeId,
			title,
			solicitationNumber: optionalString(item.solicitationNumber),
			postedDate: typeof item.postedDate === "string" ? item.postedDate : "",
			type: typeof item.type === "string" ? item.type : "",
			baseType: typeof item.baseType === "string" ? item.baseType : "",
			naicsCode: optionalString(item.naicsCode),
			classificationCode: optionalString(item.classificationCode),
			typeOfSetAside: optionalString(item.typeOfSetAside),
			typeOfSetAsideDescription: optionalString(item.typeOfSetAsideDescription),
			responseDeadLine: optionalString(item.responseDeadLine),
			active: typeof item.active === "string" ? item.active : "Yes",
			organizationName: optionalString(item.organizationName),
			pointOfContact,
			placeOfPerformance,
			description: optionalString(item.description),
			uiLink: optionalString(item.uiLink),
			award,
		});
	}

	return results;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function parsePointOfContact(value: unknown): SamGovPointOfContact[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
		.map((v) => ({
			fullName: optionalString(v.fullName),
			title: optionalString(v.title),
			email: optionalString(v.email),
			phone: optionalString(v.phone),
		}));
}

function parsePlaceOfPerformance(value: unknown): SamGovPlaceOfPerformance | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const v = value as Record<string, unknown>;

	const city = typeof v.city === "object" && v.city !== null
		? { name: optionalString((v.city as Record<string, unknown>).name) }
		: undefined;
	const state = typeof v.state === "object" && v.state !== null
		? {
			code: optionalString((v.state as Record<string, unknown>).code),
			name: optionalString((v.state as Record<string, unknown>).name),
		}
		: undefined;

	return { city, state, zip: optionalString(v.zip) };
}

function parseAward(value: unknown): SamGovAward | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== "object") return null;
	const v = value as Record<string, unknown>;

	const awardee = typeof v.awardee === "object" && v.awardee !== null
		? {
			name: optionalString((v.awardee as Record<string, unknown>).name),
			ueiSAM: optionalString((v.awardee as Record<string, unknown>).ueiSAM),
		}
		: undefined;

	return {
		amount: optionalString(v.amount),
		date: optionalString(v.date),
		awardee,
	};
}

export function formatSamGovContent(opp: SamGovOpportunity): string {
	const lines: string[] = [`SAM.gov Opportunity — ${opp.type}`];
	lines.push(opp.title);

	if (opp.solicitationNumber) {
		lines.push(`Solicitation #: ${opp.solicitationNumber}`);
	}
	if (opp.organizationName) {
		lines.push(`Agency: ${opp.organizationName}`);
	}
	if (opp.naicsCode) {
		lines.push(`NAICS: ${opp.naicsCode}`);
	}
	if (opp.classificationCode) {
		lines.push(`Classification: ${opp.classificationCode}`);
	}
	if (opp.typeOfSetAsideDescription) {
		lines.push(`Set-Aside: ${opp.typeOfSetAsideDescription}`);
	} else if (opp.typeOfSetAside) {
		lines.push(`Set-Aside: ${opp.typeOfSetAside}`);
	}
	if (opp.responseDeadLine) {
		lines.push(`Response Deadline: ${opp.responseDeadLine}`);
	}
	if (opp.placeOfPerformance) {
		const pop = opp.placeOfPerformance;
		const parts: string[] = [];
		if (pop.city?.name) parts.push(pop.city.name);
		if (pop.state?.name) parts.push(pop.state.name);
		if (pop.zip) parts.push(pop.zip);
		if (parts.length > 0) {
			lines.push(`Location: ${parts.join(", ")}`);
		}
	}
	for (const contact of opp.pointOfContact) {
		if (contact.fullName) {
			const parts = [contact.fullName];
			if (contact.title) parts.push(`(${contact.title})`);
			if (contact.email) parts.push(`— ${contact.email}`);
			if (contact.phone) parts.push(`| ${contact.phone}`);
			lines.push(`Contact: ${parts.join(" ")}`);
		}
	}
	if (opp.description && !opp.description.startsWith("https://")) {
		lines.push(`Description: ${opp.description}`);
	}
	if (opp.award) {
		if (opp.award.amount && opp.award.awardee?.name) {
			lines.push(`Award: $${opp.award.amount} to ${opp.award.awardee.name}`);
		}
		if (opp.award.date) {
			lines.push(`Award Date: ${opp.award.date}`);
		}
	}
	lines.push(`Posted: ${opp.postedDate}`);

	return lines.join("\n");
}

export function buildSamGovSourceUrl(opp: SamGovOpportunity): string {
	return opp.uiLink ?? `sam://${opp.noticeId}`;
}

export function buildSourceMetadata(opp: SamGovOpportunity): Record<string, string> {
	const meta: Record<string, string> = {};

	if (opp.organizationName) meta.agency = opp.organizationName;
	if (opp.solicitationNumber) meta.solicitationNumber = opp.solicitationNumber;
	if (opp.naicsCode) meta.naicsCode = opp.naicsCode;
	if (opp.classificationCode) meta.classificationCode = opp.classificationCode;
	if (opp.typeOfSetAsideDescription) {
		meta.setAside = opp.typeOfSetAsideDescription;
	} else if (opp.typeOfSetAside) {
		meta.setAside = opp.typeOfSetAside;
	}
	if (opp.responseDeadLine) meta.responseDeadline = opp.responseDeadLine;

	const primaryContact = opp.pointOfContact[0];
	if (primaryContact) {
		if (primaryContact.fullName) meta.contactName = primaryContact.fullName;
		if (primaryContact.title) meta.contactTitle = primaryContact.title;
		if (primaryContact.email) meta.contactEmail = primaryContact.email;
		if (primaryContact.phone) meta.contactPhone = primaryContact.phone;
	}

	if (opp.placeOfPerformance) {
		const parts: string[] = [];
		if (opp.placeOfPerformance.city?.name) parts.push(opp.placeOfPerformance.city.name);
		if (opp.placeOfPerformance.state?.name) parts.push(opp.placeOfPerformance.state.name);
		if (opp.placeOfPerformance.zip) parts.push(opp.placeOfPerformance.zip);
		if (parts.length > 0) meta.location = parts.join(", ");
	}

	if (opp.award) {
		if (opp.award.amount) meta.awardAmount = opp.award.amount;
		if (opp.award.date) meta.awardDate = opp.award.date;
		if (opp.award.awardee?.name) meta.awardee = opp.award.awardee.name;
	}

	return meta;
}

export function opportunitiesToSignals(opps: SamGovOpportunity[]): SignalAnalysisInput[] {
	return opps.map((opp) => ({
		content: formatSamGovContent(opp),
		sourceType: "sam_gov" as const,
		sourceName: "SAM.gov",
		sourceLink: `sam://${opp.noticeId}`,
		sourceUrl: opp.uiLink,
		sourceMetadata: buildSourceMetadata(opp),
	}));
}
