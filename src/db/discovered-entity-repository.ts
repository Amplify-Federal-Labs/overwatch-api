import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import { discoveredEntities } from "./schema";
import type { DiscoveredEntity } from "../signals/stakeholder-matcher";

export interface PendingEntity {
	id: number;
	signalId: string;
	type: string;
	value: string;
	confidence: number;
	signalRelevance: number;
}

export function buildDiscoveredEntityRow(
	signalId: string,
	entity: DiscoveredEntity,
) {
	return {
		signalId,
		type: entity.type,
		value: entity.value,
		confidence: entity.confidence,
		signalRelevance: entity.signalRelevance,
		status: "pending" as const,
		createdAt: new Date().toISOString(),
	};
}

export class DiscoveredEntityRepository {
	private db;

	constructor(d1: D1Database) {
		this.db = drizzle(d1);
	}

	async insertMany(signalId: string, entities: DiscoveredEntity[]): Promise<number> {
		let inserted = 0;

		for (const entity of entities) {
			const exists = await this.existsByTypeAndValue(entity.type, entity.value);
			if (exists) continue;

			const row = buildDiscoveredEntityRow(signalId, entity);
			await this.db.insert(discoveredEntities).values(row);
			inserted++;
		}

		return inserted;
	}

	async findPending(limit: number = 10): Promise<PendingEntity[]> {
		const rows = await this.db
			.select({
				id: discoveredEntities.id,
				signalId: discoveredEntities.signalId,
				type: discoveredEntities.type,
				value: discoveredEntities.value,
				confidence: discoveredEntities.confidence,
				signalRelevance: discoveredEntities.signalRelevance,
			})
			.from(discoveredEntities)
			.where(eq(discoveredEntities.status, "pending"))
			.limit(limit);
		return rows;
	}

	async findFailed(limit: number = 10): Promise<PendingEntity[]> {
		const rows = await this.db
			.select({
				id: discoveredEntities.id,
				signalId: discoveredEntities.signalId,
				type: discoveredEntities.type,
				value: discoveredEntities.value,
				confidence: discoveredEntities.confidence,
				signalRelevance: discoveredEntities.signalRelevance,
			})
			.from(discoveredEntities)
			.where(eq(discoveredEntities.status, "failed"))
			.limit(limit);
		return rows;
	}

	async updateStatus(id: number, status: string): Promise<void> {
		await this.db
			.update(discoveredEntities)
			.set({ status })
			.where(eq(discoveredEntities.id, id));
	}

	private async existsByTypeAndValue(type: string, value: string): Promise<boolean> {
		const rows = await this.db
			.select({ id: discoveredEntities.id })
			.from(discoveredEntities)
			.where(
				and(
					eq(discoveredEntities.type, type),
					eq(discoveredEntities.value, value),
				),
			)
			.limit(1);
		return rows.length > 0;
	}
}
