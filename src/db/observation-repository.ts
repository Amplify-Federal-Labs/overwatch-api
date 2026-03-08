import { drizzle } from "drizzle-orm/d1";
import { eq, desc, sql } from "drizzle-orm";
import { ingestedItems, observations, observationEntities, signals } from "./schema";
import type { SignalAnalysisInput, ObservationExtraction, EntityRef } from "../schemas";

export function buildIngestedItemRow(input: SignalAnalysisInput) {
	return {
		id: crypto.randomUUID(),
		sourceType: input.sourceType,
		sourceName: input.sourceName,
		sourceUrl: input.sourceUrl ?? null,
		sourceLink: input.sourceLink ?? null,
		content: input.content,
		sourceMetadata: input.sourceMetadata ? (input.sourceMetadata as Record<string, string>) : null,
		createdAt: new Date().toISOString(),
	};
}

export function buildObservationRow(ingestedItemId: string, obs: ObservationExtraction) {
	return {
		signalId: ingestedItemId,
		type: obs.type,
		summary: obs.summary,
		attributes: obs.attributes ?? null,
		sourceDate: obs.sourceDate ?? null,
		createdAt: new Date().toISOString(),
	};
}

export function buildEntityRefRows(observationId: number, entities: EntityRef[]) {
	return entities.map((entity) => ({
		observationId,
		role: entity.role,
		entityType: entity.type,
		rawName: entity.name,
	}));
}

export class ObservationRepository {
	private db: ReturnType<typeof drizzle>;

	constructor(d1: D1Database) {
		this.db = drizzle(d1);
	}

	async insertIngestedItem(input: SignalAnalysisInput): Promise<string | null> {
		if (input.sourceLink) {
			const existing = await this.db
				.select({ id: ingestedItems.id })
				.from(ingestedItems)
				.where(eq(ingestedItems.sourceLink, input.sourceLink))
				.get();

			if (existing) {
				return null;
			}
		}

		const row = buildIngestedItemRow(input);
		await this.db.insert(ingestedItems).values(row).run();
		return row.id;
	}

	async insertObservations(
		ingestedItemId: string,
		extractedObservations: ObservationExtraction[],
	): Promise<number> {
		let count = 0;

		for (const obs of extractedObservations) {
			const row = buildObservationRow(ingestedItemId, obs);
			const [inserted] = await this.db.insert(observations).values(row)
				.returning({ id: observations.id });

			if (inserted && obs.entities.length > 0) {
				const entityRows = buildEntityRefRows(inserted.id, obs.entities);
				for (const entityRow of entityRows) {
					await this.db.insert(observationEntities).values(entityRow).run();
				}
			}

			count++;
		}

		return count;
	}

	async ingestedItemExistsBySourceLink(sourceLink: string): Promise<boolean> {
		const existing = await this.db
			.select({ id: ingestedItems.id })
			.from(ingestedItems)
			.where(eq(ingestedItems.sourceLink, sourceLink))
			.get();

		return existing !== undefined;
	}

	async countIngestedItems(): Promise<number> {
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(ingestedItems)
			.get();
		return result?.count ?? 0;
	}

	async countObservations(): Promise<number> {
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(observations)
			.get();
		return result?.count ?? 0;
	}

	async countRecentIngestedItems(sinceDaysAgo: number): Promise<number> {
		const since = new Date(Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000).toISOString();
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(ingestedItems)
			.where(sql`${ingestedItems.createdAt} >= ${since}`)
			.get();
		return result?.count ?? 0;
	}

	async countRecentObservations(sinceDaysAgo: number): Promise<number> {
		const since = new Date(Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000).toISOString();
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(observations)
			.where(sql`${observations.createdAt} >= ${since}`)
			.get();
		return result?.count ?? 0;
	}

	async countCompanyObservations(): Promise<number> {
		const result = await this.db
			.select({ count: sql<number>`count(DISTINCT ${observationEntities.observationId})` })
			.from(observationEntities)
			.where(eq(observationEntities.entityType, "company"))
			.get();
		return result?.count ?? 0;
	}

	async findAllIngestedItems() {
		return this.db
			.select()
			.from(ingestedItems)
			.orderBy(desc(ingestedItems.createdAt))
			.all();
	}

	async findIngestedItemsPaginated(limit: number, offset: number) {
		return this.db
			.select()
			.from(ingestedItems)
			.orderBy(desc(ingestedItems.createdAt))
			.limit(limit)
			.offset(offset)
			.all();
	}

	async findObservationsByIngestedItemId(ingestedItemId: string) {
		const obs = await this.db
			.select()
			.from(observations)
			.where(eq(observations.signalId, ingestedItemId))
			.all();

		const result = [];
		for (const o of obs) {
			const entities = await this.db
				.select()
				.from(observationEntities)
				.where(eq(observationEntities.observationId, o.id))
				.all();
			result.push({ ...o, entities });
		}
		return result;
	}

	async findObservationsWithCompanyEntities() {
		const companyRefs = await this.db
			.select({
				observationId: observationEntities.observationId,
				rawName: observationEntities.rawName,
				role: observationEntities.role,
				entityType: observationEntities.entityType,
			})
			.from(observationEntities)
			.where(eq(observationEntities.entityType, "company"))
			.all();

		const observationIds = [...new Set(companyRefs.map((r) => r.observationId))];
		const result = [];

		for (const obsId of observationIds) {
			const obs = await this.db
				.select()
				.from(observations)
				.where(eq(observations.id, obsId))
				.get();
			if (!obs) continue;

			const entities = await this.db
				.select()
				.from(observationEntities)
				.where(eq(observationEntities.observationId, obsId))
				.all();

			const companyEntity = entities.find((e) => e.entityType === "company" && e.role === "subject")
				?? entities.find((e) => e.entityType === "company");

			const agencyEntity = entities.find((e) => e.entityType === "agency");

			if (companyEntity) {
				result.push({
					type: obs.type,
					summary: obs.summary,
					sourceDate: obs.sourceDate,
					createdAt: obs.createdAt,
					companyName: companyEntity.rawName,
					agencyName: agencyEntity?.rawName ?? null,
				});
			}
		}

		return result;
	}

	async findUnmaterializedItems(limit: number) {
		// Find ingested items that have observations but no materialized signal yet
		const items = await this.db
			.select({
				id: ingestedItems.id,
				sourceType: ingestedItems.sourceType,
				sourceName: ingestedItems.sourceName,
				sourceUrl: ingestedItems.sourceUrl,
				sourceLink: ingestedItems.sourceLink,
				content: ingestedItems.content,
				sourceMetadata: ingestedItems.sourceMetadata,
				createdAt: ingestedItems.createdAt,
			})
			.from(ingestedItems)
			.where(
				sql`${ingestedItems.id} IN (
					SELECT DISTINCT ${observations.signalId} FROM ${observations}
				) AND ${ingestedItems.id} NOT IN (
					SELECT ${signals.ingestedItemId} FROM ${signals}
				)`,
			)
			.orderBy(desc(ingestedItems.createdAt))
			.limit(limit)
			.all();

		const result = [];
		for (const item of items) {
			const obs = await this.findObservationsByIngestedItemId(item.id);
			result.push({ ...item, observations: obs });
		}
		return result;
	}

	async findIngestedItemsWithObservations() {
		const allItems = await this.findAllIngestedItems();
		const result = [];
		for (const item of allItems) {
			const obs = await this.findObservationsByIngestedItemId(item.id);
			result.push({ ...item, observations: obs });
		}
		return result;
	}

	async findIngestedItemsWithObservationsPaginated(limit: number, offset: number) {
		const paginatedItems = await this.findIngestedItemsPaginated(limit, offset);
		const result = [];
		for (const item of paginatedItems) {
			const obs = await this.findObservationsByIngestedItemId(item.id);
			result.push({ ...item, observations: obs });
		}
		return result;
	}
}
