import { drizzle } from "drizzle-orm/d1";
import { eq, desc, sql } from "drizzle-orm";
import { signals, observations, observationEntities } from "./schema";
import type { SignalAnalysisInput, ObservationExtraction, EntityRef } from "../schemas";

export function buildSignalRow(input: SignalAnalysisInput) {
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

export function buildObservationRow(signalId: string, obs: ObservationExtraction) {
	return {
		signalId,
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

	async insertSignal(input: SignalAnalysisInput): Promise<string | null> {
		if (input.sourceLink) {
			const existing = await this.db
				.select({ id: signals.id })
				.from(signals)
				.where(eq(signals.sourceLink, input.sourceLink))
				.get();

			if (existing) {
				return null;
			}
		}

		const row = buildSignalRow(input);
		await this.db.insert(signals).values(row).run();
		return row.id;
	}

	async insertObservations(
		signalId: string,
		extractedObservations: ObservationExtraction[],
	): Promise<number> {
		let count = 0;

		for (const obs of extractedObservations) {
			const row = buildObservationRow(signalId, obs);
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

	async signalExistsBySourceLink(sourceLink: string): Promise<boolean> {
		const existing = await this.db
			.select({ id: signals.id })
			.from(signals)
			.where(eq(signals.sourceLink, sourceLink))
			.get();

		return existing !== undefined;
	}

	async countSignals(): Promise<number> {
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(signals)
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

	async countRecentSignals(sinceDaysAgo: number): Promise<number> {
		const since = new Date(Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000).toISOString();
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(signals)
			.where(sql`${signals.createdAt} >= ${since}`)
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

	async findAllSignals() {
		return this.db
			.select()
			.from(signals)
			.orderBy(desc(signals.createdAt))
			.all();
	}

	async findObservationsBySignalId(signalId: string) {
		const obs = await this.db
			.select()
			.from(observations)
			.where(eq(observations.signalId, signalId))
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

	async findSignalsWithObservations() {
		const allSignals = await this.findAllSignals();
		const result = [];
		for (const signal of allSignals) {
			const obs = await this.findObservationsBySignalId(signal.id);
			result.push({ ...signal, observations: obs });
		}
		return result;
	}
}
