import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { signals, signalEntities } from "./schema";
import type { SignalAnalysisInput, SignalAnalysisResult, ExtractedEntity } from "../schemas";

export function buildSignalRow(
	input: SignalAnalysisInput,
	result: SignalAnalysisResult,
) {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		date: now,
		branch: result.branch,
		source: input.sourceName,
		sourceType: input.sourceType,
		sourceUrl: input.sourceUrl ?? null,
		sourceLink: input.sourceLink ?? null,
		sourceMetadata: input.sourceMetadata ?? null,
		title: result.title,
		summary: result.summary,
		type: result.type,
		relevance: result.relevance,
		play: result.play,
		starred: false,
		tags: result.tags,
		competencies: result.competencies,
		stakeholderIds: [] as string[],
		competitors: [] as string[],
		vendors: [] as string[],
		createdAt: now,
	};
}

export function buildEntityRows(
	signalId: string,
	entities: ExtractedEntity[],
) {
	return entities.map((entity) => ({
		signalId,
		type: entity.type,
		value: entity.value,
		confidence: entity.confidence,
	}));
}

export class SignalRepository {
	private db;

	constructor(d1: D1Database) {
		this.db = drizzle(d1);
	}

	async insert(input: SignalAnalysisInput, result: SignalAnalysisResult): Promise<string> {
		const row = buildSignalRow(input, result);
		const entityRows = buildEntityRows(row.id, result.entities);

		await this.db.insert(signals).values(row);

		if (entityRows.length > 0) {
			await this.db.insert(signalEntities).values(entityRows);
		}

		return row.id;
	}

	async existsBySourceLink(link: string): Promise<boolean> {
		const rows = await this.db
			.select({ id: signals.id })
			.from(signals)
			.where(eq(signals.sourceLink, link))
			.limit(1);
		return rows.length > 0;
	}

	async findAll() {
		const allSignals = await this.db.select().from(signals);
		const allEntities = await this.db.select().from(signalEntities);

		return allSignals.map((signal) => ({
			...signal,
			entities: allEntities.filter((e) => e.signalId === signal.id),
		}));
	}

	async findById(id: string) {
		const [signal] = await this.db.select().from(signals).where(eq(signals.id, id));
		if (!signal) return null;

		const entities = await this.db
			.select()
			.from(signalEntities)
			.where(eq(signalEntities.signalId, id));

		return { ...signal, entities };
	}
}
