import { XMLParser } from "fast-xml-parser";
import type { SignalAnalysisInput } from "../schemas";

export interface FpdsContractEntry {
	piid: string;
	modNumber: string;
	referencedPiid?: string;
	agencyId: string;
	agencyName: string;
	vendorName: string;
	description?: string;
	obligatedAmount: string;
	totalObligatedAmount: string;
	naicsCode?: string;
	naicsDescription?: string;
	pscCode?: string;
	pscDescription?: string;
	signedDate?: string;
	performanceState?: string;
	contractType?: string;
	competitionType?: string;
}

const fpdsParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	removeNSPrefix: true,
	parseTagValue: false,
	isArray: (name) => name === "entry",
});

function getAttr(node: Record<string, unknown>, attr: string): string | undefined {
	const val = node[attr];
	return typeof val === "string" ? val : undefined;
}

function getText(node: unknown): string | undefined {
	if (typeof node === "string") return node;
	if (typeof node === "number") return String(node);
	if (node && typeof node === "object" && "#text" in (node as Record<string, unknown>)) {
		const text = (node as Record<string, unknown>)["#text"];
		return typeof text === "string" ? text : typeof text === "number" ? String(text) : undefined;
	}
	return undefined;
}

export function parseFpdsAtomEntries(xml: string): FpdsContractEntry[] {
	let parsed: Record<string, unknown>;
	try {
		parsed = fpdsParser.parse(xml) as Record<string, unknown>;
	} catch {
		return [];
	}

	const feed = parsed.feed as Record<string, unknown> | undefined;
	if (!feed) return [];

	const rawEntries = feed.entry as Array<Record<string, unknown>> | undefined;
	if (!Array.isArray(rawEntries)) return [];

	const results: FpdsContractEntry[] = [];

	for (const entry of rawEntries) {
		const content = entry.content as Record<string, unknown> | undefined;
		if (!content) continue;

		const award = content.award as Record<string, unknown> | undefined;
		if (!award) continue;

		// Check status — skip DELETE entries
		const txnInfo = award.transactionInformation as Record<string, unknown> | undefined;
		const status = txnInfo?.status as Record<string, unknown> | undefined;
		if (status && getAttr(status, "@_description") === "DELETE") continue;

		// Award ID
		const awardID = award.awardID as Record<string, unknown> | undefined;
		const contractID = awardID?.awardContractID as Record<string, unknown> | undefined;
		if (!contractID) continue;

		const piid = getText(contractID.PIID);
		const modNumber = getText(contractID.modNumber);
		const agencyNode = contractID.agencyID as Record<string, unknown> | undefined;
		const agencyId = agencyNode ? getText(agencyNode) : undefined;

		if (!piid || !modNumber || !agencyId) continue;

		// Referenced IDV (optional — delivery orders have parent contract)
		const refIDV = awardID?.referencedIDVID as Record<string, unknown> | undefined;
		const referencedPiid = refIDV ? getText(refIDV.PIID) : undefined;

		// Purchaser info
		const purchaser = award.purchaserInformation as Record<string, unknown> | undefined;
		const officeAgency = purchaser?.contractingOfficeAgencyID as Record<string, unknown> | undefined;
		const agencyName = officeAgency ? (getAttr(officeAgency, "@_name") ?? "") : "";

		// Vendor
		const vendor = award.vendor as Record<string, unknown> | undefined;
		const vendorHeader = vendor?.vendorHeader as Record<string, unknown> | undefined;
		const vendorName = vendorHeader ? (getText(vendorHeader.vendorName) ?? "") : "";

		// Dollar values
		const dollars = award.dollarValues as Record<string, unknown> | undefined;
		const obligatedAmount = dollars ? (getText(dollars.obligatedAmount) ?? "0") : "0";
		const totalDollars = award.totalDollarValues as Record<string, unknown> | undefined;
		const totalObligatedAmount = totalDollars ? (getText(totalDollars.totalObligatedAmount) ?? "0") : "0";

		// Contract data
		const contractData = award.contractData as Record<string, unknown> | undefined;
		const description = contractData ? getText(contractData.descriptionOfContractRequirement) : undefined;
		const actionType = contractData?.contractActionType as Record<string, unknown> | undefined;
		const contractType = actionType ? getAttr(actionType, "@_description") : undefined;

		// Product/service info
		const psi = award.productOrServiceInformation as Record<string, unknown> | undefined;
		const pscNode = psi?.productOrServiceCode as Record<string, unknown> | undefined;
		const pscCode = pscNode ? getText(pscNode) : undefined;
		const pscDescription = pscNode ? getAttr(pscNode, "@_description") : undefined;
		const naicsNode = psi?.principalNAICSCode as Record<string, unknown> | undefined;
		const naicsCode = naicsNode ? getText(naicsNode) : undefined;
		const naicsDescription = naicsNode ? getAttr(naicsNode, "@_description") : undefined;

		// Dates
		const dates = award.relevantContractDates as Record<string, unknown> | undefined;
		const signedDate = dates ? getText(dates.signedDate) : undefined;

		// Place of performance
		const pop = award.placeOfPerformance as Record<string, unknown> | undefined;
		const principalPop = pop?.principalPlaceOfPerformance as Record<string, unknown> | undefined;
		const stateNode = principalPop?.stateCode as Record<string, unknown> | undefined;
		const performanceState = stateNode ? getAttr(stateNode, "@_name") : undefined;

		// Competition
		const competition = award.competition as Record<string, unknown> | undefined;
		const extentCompeted = competition?.extentCompeted as Record<string, unknown> | undefined;
		const competitionType = extentCompeted ? getAttr(extentCompeted, "@_description") : undefined;

		results.push({
			piid,
			modNumber,
			referencedPiid,
			agencyId,
			agencyName,
			vendorName,
			description,
			obligatedAmount,
			totalObligatedAmount,
			naicsCode,
			naicsDescription,
			pscCode,
			pscDescription,
			signedDate,
			performanceState,
			contractType,
			competitionType,
		});
	}

	return results;
}

export function extractNextPageUrl(xml: string): string | null {
	const nextParser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
		removeNSPrefix: true,
		parseTagValue: false,
		isArray: (name) => name === "link",
	});

	try {
		const parsed = nextParser.parse(xml) as Record<string, unknown>;
		const feed = parsed.feed as Record<string, unknown> | undefined;
		if (!feed) return null;

		const links = feed.link as Array<Record<string, unknown>> | undefined;
		if (!Array.isArray(links)) return null;

		for (const link of links) {
			if (link["@_rel"] === "next") {
				const href = link["@_href"];
				return typeof href === "string" ? href : null;
			}
		}
	} catch {
		// ignore parse errors
	}

	return null;
}

export function buildFpdsSourceUrl(entry: FpdsContractEntry): string {
	const ref = entry.referencedPiid ?? "NONE";
	return `fpds://${ref}_${entry.agencyId}_${entry.piid}_${entry.modNumber}`;
}


export function formatFpdsContent(entry: FpdsContractEntry): string {
	const lines: string[] = ["FPDS Contract Award"];
	lines.push(`Agency: ${entry.agencyName}`);
	lines.push(`Vendor: ${entry.vendorName}`);

	const piidDisplay = entry.referencedPiid
		? `${entry.referencedPiid}/${entry.piid} (Mod ${entry.modNumber})`
		: `${entry.piid} (Mod ${entry.modNumber})`;
	lines.push(`PIID: ${piidDisplay}`);

	lines.push(`Obligated: $${entry.obligatedAmount} | Total: $${entry.totalObligatedAmount}`);

	if (entry.contractType) {
		lines.push(`Type: ${entry.contractType}`);
	}
	if (entry.naicsCode && entry.naicsDescription) {
		lines.push(`NAICS: ${entry.naicsCode} — ${entry.naicsDescription}`);
	}
	if (entry.pscCode && entry.pscDescription) {
		lines.push(`PSC: ${entry.pscCode} — ${entry.pscDescription}`);
	}
	if (entry.description) {
		lines.push(`Description: ${entry.description}`);
	}
	if (entry.performanceState) {
		lines.push(`Performance: ${entry.performanceState}`);
	}
	if (entry.competitionType) {
		lines.push(`Competition: ${entry.competitionType}`);
	}
	if (entry.signedDate) {
		lines.push(`Signed: ${entry.signedDate}`);
	}

	return lines.join("\n");
}

export function entriesToSignals(entries: FpdsContractEntry[]): SignalAnalysisInput[] {
	return entries.map((entry) => ({
		content: formatFpdsContent(entry),
		sourceType: "fpds" as const,
		sourceName: "FPDS",
		sourceLink: buildFpdsSourceUrl(entry),
	}));
}
