import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { entityProfiles, observations, observationEntities, insights } from "./schema";
import type { InsightType } from "../schemas";

export interface ObservationEntity {
	id: number;
	observationId: number;
	role: string;
	entityType: string;
	rawName: string;
	entityProfileId: string | null;
	resolvedAt: string | null;
}

export interface ObservationWithEntities {
	id: number;
	signalId: string;
	type: string;
	summary: string;
	attributes: Record<string, string> | null;
	sourceDate: string | null;
	createdAt: string;
	entities: ObservationEntity[];
}

export interface ProfileForSynthesis {
	id: string;
	type: string;
	canonicalName: string;
	observationCount: number;
	lastSynthesizedAt: string | null;
}

export function buildInsightRow(
	entityProfileId: string,
	type: InsightType,
	content: string,
	observationWindow: string,
	observationCount: number,
) {
	return {
		entityProfileId,
		type,
		content,
		observationWindow,
		observationCount,
		createdAt: new Date().toISOString(),
	};
}

export function buildSynthesisContext(
	canonicalName: string,
	entityType: string,
	obs: ObservationWithEntities[],
): string {
	const lines: string[] = [];
	lines.push(`Entity: ${canonicalName} (${entityType})`);
	lines.push(`${obs.length} observations:\n`);

	for (const o of obs) {
		lines.push(`- [${o.type}] ${o.summary}`);
		if (o.attributes && Object.keys(o.attributes).length > 0) {
			const attrs = Object.entries(o.attributes)
				.map(([k, v]) => `${k}=${v}`)
				.join(", ");
			lines.push(`  Attributes: ${attrs}`);
		}
		if (o.entities.length > 0) {
			const entityNames = o.entities
				.map((e) => `${e.rawName} (${e.entityType}, ${e.role})`)
				.join("; ");
			lines.push(`  Entities: ${entityNames}`);
		}
		if (o.sourceDate) {
			lines.push(`  Date: ${o.sourceDate}`);
		}
	}

	return lines.join("\n");
}

export function buildUnsynthesizedProfilesQuery() {
	return {
		lastSynthesizedAt: null,
		minObservationCount: 1,
	};
}

export class SynthesisRepository {
	private db: ReturnType<typeof drizzle>;

	constructor(d1: D1Database) {
		this.db = drizzle(d1);
	}

	async countInsights(): Promise<number> {
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(insights)
			.get();
		return result?.count ?? 0;
	}

	async findUnsynthesizedProfileIds(): Promise<string[]> {
		const { lastSynthesizedAt, minObservationCount } = buildUnsynthesizedProfilesQuery();
		const rows = await this.db
			.select({ id: entityProfiles.id })
			.from(entityProfiles)
			.where(
				sql`${entityProfiles.lastSynthesizedAt} IS NULL AND ${entityProfiles.observationCount} >= ${minObservationCount}`,
			)
			.all();
		return rows.map((r) => r.id);
	}

	async findProfilesByIds(ids: string[]): Promise<ProfileForSynthesis[]> {
		if (ids.length === 0) return [];
		return this.db
			.select({
				id: entityProfiles.id,
				type: entityProfiles.type,
				canonicalName: entityProfiles.canonicalName,
				observationCount: entityProfiles.observationCount,
				lastSynthesizedAt: entityProfiles.lastSynthesizedAt,
			})
			.from(entityProfiles)
			.where(
				sql`${entityProfiles.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
			)
			.all();
	}

	async findObservationsForProfile(profileId: string): Promise<ObservationWithEntities[]> {
		// Find all observations where this profile is mentioned
		const entityRefs = await this.db
			.select({ observationId: observationEntities.observationId })
			.from(observationEntities)
			.where(eq(observationEntities.entityProfileId, profileId))
			.all();

		const observationIds = [...new Set(entityRefs.map((r) => r.observationId))];
		if (observationIds.length === 0) return [];

		const result: ObservationWithEntities[] = [];
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

			result.push({ ...obs, entities });
		}

		return result;
	}

	async insertInsight(
		entityProfileId: string,
		type: InsightType,
		content: string,
		observationWindow: string,
		observationCount: number,
	): Promise<void> {
		const row = buildInsightRow(entityProfileId, type, content, observationWindow, observationCount);
		await this.db.insert(insights).values(row).run();
	}

	async updateProfileSynthesis(
		profileId: string,
		summary: string,
		trajectory: string | null,
		relevanceScore: number | null,
	): Promise<void> {
		await this.db
			.update(entityProfiles)
			.set({
				summary,
				trajectory,
				relevanceScore,
				lastSynthesizedAt: new Date().toISOString(),
			})
			.where(eq(entityProfiles.id, profileId))
			.run();
	}
}
