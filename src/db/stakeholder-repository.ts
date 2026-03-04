import { drizzle } from "drizzle-orm/d1";
import { stakeholders } from "./schema";
import type { DossierExtractionResult } from "../enrichment/dossier-extractor";
import type { Stakeholder } from "../schemas";
import { mockStakeholders } from "../data/mock-stakeholders";

export interface StakeholderRecord {
	id: string;
	name: string;
	org: string;
	branch: string;
	programs: string[];
	awardPrimes: string[];
	focusAreas: string[];
}

export interface StakeholderRepository {
	findAll(): Promise<StakeholderRecord[]>;
}

function toRecord(s: Stakeholder): StakeholderRecord {
	return {
		id: s.id,
		name: s.name,
		org: s.org,
		branch: s.branch,
		programs: s.programs,
		awardPrimes: s.awards.map((a) => a.prime),
		focusAreas: s.militaryBio?.focusAreas ?? [],
	};
}

export class MockStakeholderRepository implements StakeholderRepository {
	async findAll(): Promise<StakeholderRecord[]> {
		return mockStakeholders.map(toRecord);
	}
}

export interface InsertEnrichedInput {
	dossier: DossierExtractionResult;
	discoveredEntityId: number;
	signalId: string;
	bioSourceUrl: string | null;
	entityType: "person" | "agency";
}

export function buildStakeholderRow(input: InsertEnrichedInput) {
	return {
		id: crypto.randomUUID(),
		type: input.entityType,
		name: input.dossier.name,
		title: input.dossier.title,
		org: input.dossier.org,
		branch: input.dossier.branch,
		stage: "aware" as const,
		confidence: input.dossier.confidence,
		programs: input.dossier.programs,
		focusAreas: input.dossier.focusAreas,
		rank: input.dossier.rank,
		education: input.dossier.education,
		careerHistory: input.dossier.careerHistory,
		bioSourceUrl: input.bioSourceUrl,
		discoveredEntityId: input.discoveredEntityId,
		signalIds: [input.signalId],
		createdAt: new Date().toISOString(),
	};
}

export class D1StakeholderRepository {
	private db;

	constructor(d1: D1Database) {
		this.db = drizzle(d1);
	}

	async insertEnriched(input: InsertEnrichedInput): Promise<string> {
		const row = buildStakeholderRow(input);
		await this.db.insert(stakeholders).values(row);
		return row.id;
	}

	async findAllRows() {
		return this.db.select().from(stakeholders);
	}
}
