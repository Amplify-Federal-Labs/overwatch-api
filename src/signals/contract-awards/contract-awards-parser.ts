import type { SignalAnalysisInput } from "../../schemas";

export interface ContractAwardEntry {
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

interface RawRecord {
	contractId?: {
		PIID?: string;
		modNumber?: string;
		agencyID?: string;
		referencedIDVPIID?: string;
	};
	coreData?: {
		contractingOfficeAgencyName?: string;
		contractActionTypeDescription?: string;
		descriptionOfContractRequirement?: string;
		principalNAICSCode?: string;
		principalNAICSDescription?: string;
		productOrServiceCode?: string;
		productOrServiceDescription?: string;
		extentCompetedDescription?: string;
	};
	awardDetails?: {
		vendorName?: string;
		obligatedAmount?: string;
		totalObligatedAmount?: string;
		signedDate?: string;
		stateName?: string;
	};
	deletedStatus?: string;
}

export function parseContractAwardsResponse(json: Record<string, unknown>): ContractAwardEntry[] {
	const data = json.data as RawRecord[] | undefined;
	if (!Array.isArray(data) || data.length === 0) return [];

	const results: ContractAwardEntry[] = [];

	for (const record of data) {
		if (record.deletedStatus === "yes") continue;

		const cid = record.contractId;
		if (!cid?.PIID || !cid.modNumber || !cid.agencyID) continue;

		const core = record.coreData ?? {};
		const award = record.awardDetails ?? {};

		results.push({
			piid: cid.PIID,
			modNumber: cid.modNumber,
			referencedPiid: cid.referencedIDVPIID,
			agencyId: cid.agencyID,
			agencyName: core.contractingOfficeAgencyName ?? "",
			vendorName: award.vendorName ?? "",
			description: core.descriptionOfContractRequirement,
			obligatedAmount: award.obligatedAmount ?? "0",
			totalObligatedAmount: award.totalObligatedAmount ?? "0",
			naicsCode: core.principalNAICSCode,
			naicsDescription: core.principalNAICSDescription,
			pscCode: core.productOrServiceCode,
			pscDescription: core.productOrServiceDescription,
			signedDate: award.signedDate,
			performanceState: award.stateName,
			contractType: core.contractActionTypeDescription,
			competitionType: core.extentCompetedDescription,
		});
	}

	return results;
}

export function buildSourceUrl(entry: ContractAwardEntry): string {
	const ref = entry.referencedPiid ?? "NONE";
	return `contract-award://${ref}_${entry.agencyId}_${entry.piid}_${entry.modNumber}`;
}

export function formatContent(entry: ContractAwardEntry): string {
	const lines: string[] = ["Contract Award"];
	lines.push(`Agency: ${entry.agencyName}`);
	lines.push(`Vendor: ${entry.vendorName}`);

	const piidDisplay = entry.referencedPiid
		? `${entry.referencedPiid}/${entry.piid} (Mod ${entry.modNumber})`
		: `${entry.piid} (Mod ${entry.modNumber})`;
	lines.push(`PIID: ${piidDisplay}`);

	lines.push(`Obligated: $${entry.obligatedAmount} | Total: $${entry.totalObligatedAmount}`);

	if (entry.contractType) lines.push(`Type: ${entry.contractType}`);
	if (entry.naicsCode && entry.naicsDescription) lines.push(`NAICS: ${entry.naicsCode} — ${entry.naicsDescription}`);
	if (entry.pscCode && entry.pscDescription) lines.push(`PSC: ${entry.pscCode} — ${entry.pscDescription}`);
	if (entry.description) lines.push(`Description: ${entry.description}`);
	if (entry.performanceState) lines.push(`Performance: ${entry.performanceState}`);
	if (entry.competitionType) lines.push(`Competition: ${entry.competitionType}`);
	if (entry.signedDate) lines.push(`Signed: ${entry.signedDate}`);

	return lines.join("\n");
}

function buildSourceMetadata(entry: ContractAwardEntry): Record<string, string> {
	const meta: Record<string, string> = {
		sourceType: "contract_awards",
		piid: entry.piid,
		modNumber: entry.modNumber,
		agencyId: entry.agencyId,
		agencyName: entry.agencyName,
		vendorName: entry.vendorName,
		obligatedAmount: entry.obligatedAmount,
		totalObligatedAmount: entry.totalObligatedAmount,
	};

	if (entry.referencedPiid) meta.referencedPiid = entry.referencedPiid;
	if (entry.description) meta.description = entry.description;
	if (entry.naicsCode) meta.naicsCode = entry.naicsCode;
	if (entry.naicsDescription) meta.naicsDescription = entry.naicsDescription;
	if (entry.pscCode) meta.pscCode = entry.pscCode;
	if (entry.pscDescription) meta.pscDescription = entry.pscDescription;
	if (entry.signedDate) meta.signedDate = entry.signedDate;
	if (entry.performanceState) meta.performanceState = entry.performanceState;
	if (entry.contractType) meta.contractType = entry.contractType;
	if (entry.competitionType) meta.competitionType = entry.competitionType;

	return meta;
}

export function entriesToSignals(entries: ContractAwardEntry[]): SignalAnalysisInput[] {
	return entries.map((entry) => ({
		content: formatContent(entry),
		sourceType: "contract_awards" as const,
		sourceName: "SAM.gov Contract Awards",
		sourceLink: buildSourceUrl(entry),
		sourceMetadata: buildSourceMetadata(entry),
	}));
}
