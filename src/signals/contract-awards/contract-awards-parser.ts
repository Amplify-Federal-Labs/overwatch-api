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

interface CodeName {
	code?: string;
	name?: string;
}

interface RawRecord {
	contractId?: {
		subtier?: CodeName;
		piid?: string;
		modificationNumber?: string;
		referencedIDVPiid?: string;
	};
	coreData?: {
		awardOrIDVType?: CodeName;
		federalOrganization?: {
			contractingInformation?: {
				contractingSubtier?: CodeName;
			};
		};
		principalPlaceOfPerformance?: {
			state?: CodeName;
		};
		productOrServiceInformation?: {
			principalNaics?: CodeName[];
			productOrService?: CodeName;
		};
		competitionInformation?: {
			extentCompeted?: CodeName;
		};
	};
	awardDetails?: {
		dates?: {
			dateSigned?: string;
		};
		dollars?: {
			actionObligation?: string;
		};
		totalContractDollars?: {
			totalActionObligation?: string;
		};
		productOrServiceInformation?: {
			descriptionOfContractRequirement?: string;
		};
		awardeeData?: {
			awardeeHeader?: {
				awardeeName?: string;
			};
		};
		transactionData?: {
			status?: CodeName;
		};
	};
}

export function parseContractAwardsResponse(json: Record<string, unknown>): ContractAwardEntry[] {
	const data = json.awardSummary as RawRecord[] | undefined;
	if (!Array.isArray(data) || data.length === 0) return [];

	const results: ContractAwardEntry[] = [];

	for (const record of data) {
		const status = record.awardDetails?.transactionData?.status?.code;
		if (status === "D") continue;

		const cid = record.contractId;
		if (!cid?.piid || !cid.modificationNumber || !cid.subtier?.code) continue;

		const core = record.coreData ?? {};
		const award = record.awardDetails ?? {};
		const naics = core.productOrServiceInformation?.principalNaics?.[0];
		const psc = core.productOrServiceInformation?.productOrService;

		results.push({
			piid: cid.piid,
			modNumber: cid.modificationNumber,
			referencedPiid: cid.referencedIDVPiid,
			agencyId: cid.subtier.code,
			agencyName: core.federalOrganization?.contractingInformation?.contractingSubtier?.name ?? "",
			vendorName: award.awardeeData?.awardeeHeader?.awardeeName ?? "",
			description: award.productOrServiceInformation?.descriptionOfContractRequirement,
			obligatedAmount: award.dollars?.actionObligation ?? "0",
			totalObligatedAmount: award.totalContractDollars?.totalActionObligation ?? "0",
			naicsCode: naics?.code,
			naicsDescription: naics?.name,
			pscCode: psc?.code,
			pscDescription: psc?.name,
			signedDate: award.dates?.dateSigned,
			performanceState: core.principalPlaceOfPerformance?.state?.name,
			contractType: core.awardOrIDVType?.name,
			competitionType: core.competitionInformation?.extentCompeted?.name,
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
