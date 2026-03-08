import { drizzle } from "drizzle-orm/d1";
import { eq, desc, sql, and, gte, like } from "drizzle-orm";
import { signals } from "./schema";
import type { MaterializedSignal } from "../agents/signal-materializer";

export function buildSignalRow(signal: MaterializedSignal) {
	return {
		id: signal.id,
		ingestedItemId: signal.ingestedItemId,
		title: signal.title,
		summary: signal.summary,
		date: signal.date,
		branch: signal.branch,
		source: signal.source,
		type: signal.type,
		relevance: signal.relevance,
		relevanceRationale: signal.relevanceRationale,
		tags: signal.tags,
		competencies: signal.competencies,
		play: signal.play,
		competitors: signal.competitors,
		vendors: signal.vendors,
		stakeholders: signal.stakeholders,
		entities: signal.entities,
		sourceUrl: signal.sourceUrl,
		sourceMetadata: signal.sourceMetadata,
		createdAt: signal.createdAt,
		updatedAt: signal.updatedAt,
	};
}

export interface SignalFilters {
	branch?: string;
	type?: string;
	minRelevance?: number;
}

export class SignalRepository {
	private db: ReturnType<typeof drizzle>;

	constructor(d1: D1Database) {
		this.db = drizzle(d1);
	}

	async upsert(signal: MaterializedSignal): Promise<void> {
		const row = buildSignalRow(signal);
		await this.db
			.insert(signals)
			.values(row)
			.onConflictDoUpdate({
				target: signals.id,
				set: {
					title: row.title,
					summary: row.summary,
					date: row.date,
					branch: row.branch,
					source: row.source,
					type: row.type,
					relevance: row.relevance,
					relevanceRationale: row.relevanceRationale,
					tags: row.tags,
					competencies: row.competencies,
					play: row.play,
					competitors: row.competitors,
					vendors: row.vendors,
					stakeholders: row.stakeholders,
					entities: row.entities,
					sourceUrl: row.sourceUrl,
					sourceMetadata: row.sourceMetadata,
					updatedAt: row.updatedAt,
				},
			})
			.run();
	}

	async findPaginated(limit: number, offset: number, filters?: SignalFilters) {
		const conditions = this.buildFilterConditions(filters);

		return this.db
			.select()
			.from(signals)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(signals.relevance), desc(signals.date))
			.limit(limit)
			.offset(offset)
			.all();
	}

	async count(filters?: SignalFilters): Promise<number> {
		const conditions = this.buildFilterConditions(filters);

		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(signals)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.get();
		return result?.count ?? 0;
	}

	async countRecent(sinceDaysAgo: number): Promise<number> {
		const since = new Date(Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000).toISOString();
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(signals)
			.where(sql`${signals.createdAt} >= ${since}`)
			.get();
		return result?.count ?? 0;
	}

	async findByIngestedItemId(ingestedItemId: string) {
		return this.db
			.select()
			.from(signals)
			.where(eq(signals.ingestedItemId, ingestedItemId))
			.get();
	}

	async findByIngestedItemIds(ingestedItemIds: string[]) {
		const result = [];
		for (const id of ingestedItemIds) {
			const signal = await this.findByIngestedItemId(id);
			if (signal) result.push(signal);
		}
		return result;
	}

	private buildFilterConditions(filters?: SignalFilters) {
		const conditions = [];

		if (filters?.branch) {
			conditions.push(like(signals.branch, `%${filters.branch}%`));
		}

		if (filters?.type) {
			conditions.push(eq(signals.type, filters.type));
		}

		if (filters?.minRelevance !== undefined) {
			conditions.push(gte(signals.relevance, filters.minRelevance));
		}

		return conditions;
	}
}
