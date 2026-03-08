import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { entityProfiles } from "./schema";
import type { Dossier, EnrichmentStatus } from "../schemas";

export interface EnrichmentContext {
	coOccurringEntities: Array<{ canonicalName: string; type: string }>;
	observationTypes: string[];
}

export interface ProfileForEnrichment {
	id: string;
	type: string;
	canonicalName: string;
	context?: EnrichmentContext;
}

const MAX_CO_OCCURRING_ENTITIES = 3;

export interface CoOccurrenceRow {
	profileId: string;
	coCanonicalName: string;
	coType: string;
	observationType: string;
}

export function buildContextMap(rows: CoOccurrenceRow[]): Map<string, EnrichmentContext> {
	const map = new Map<string, {
		entityCounts: Map<string, { canonicalName: string; type: string; count: number }>;
		observationTypes: Set<string>;
	}>();

	for (const row of rows) {
		let entry = map.get(row.profileId);
		if (!entry) {
			entry = { entityCounts: new Map(), observationTypes: new Set() };
			map.set(row.profileId, entry);
		}

		if (row.coCanonicalName) {
			const key = `${row.coType}:${row.coCanonicalName}`;
			const existing = entry.entityCounts.get(key);
			if (existing) {
				existing.count++;
			} else {
				entry.entityCounts.set(key, { canonicalName: row.coCanonicalName, type: row.coType, count: 1 });
			}
		}

		if (row.observationType) {
			entry.observationTypes.add(row.observationType);
		}
	}

	const result = new Map<string, EnrichmentContext>();
	for (const [profileId, entry] of map) {
		const sorted = [...entry.entityCounts.values()]
			.sort((a, b) => b.count - a.count)
			.slice(0, MAX_CO_OCCURRING_ENTITIES)
			.map(({ canonicalName, type }) => ({ canonicalName, type }));

		result.set(profileId, {
			coOccurringEntities: sorted,
			observationTypes: [...entry.observationTypes],
		});
	}

	return result;
}

export function buildDossierUpdate(dossier: Dossier) {
	return {
		dossier,
		enrichmentStatus: "enriched" as EnrichmentStatus,
		lastEnrichedAt: new Date().toISOString(),
	};
}

export class EnrichmentRepository {
	private db: ReturnType<typeof drizzle>;

	constructor(d1: D1Database) {
		this.db = drizzle(d1);
	}

	async findProfilesByIds(ids: string[]): Promise<ProfileForEnrichment[]> {
		if (ids.length === 0) return [];
		return this.db
			.select({
				id: entityProfiles.id,
				type: entityProfiles.type,
				canonicalName: entityProfiles.canonicalName,
			})
			.from(entityProfiles)
			.where(
				sql`${entityProfiles.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
			)
			.all();
	}

	async updateDossier(profileId: string, dossier: Dossier): Promise<void> {
		const update = buildDossierUpdate(dossier);
		await this.db
			.update(entityProfiles)
			.set({
				dossier: update.dossier,
				enrichmentStatus: update.enrichmentStatus,
				lastEnrichedAt: update.lastEnrichedAt,
			})
			.where(eq(entityProfiles.id, profileId))
			.run();
	}

	async markFailed(profileId: string): Promise<void> {
		await this.db
			.update(entityProfiles)
			.set({
				enrichmentStatus: "failed" as EnrichmentStatus,
				lastEnrichedAt: new Date().toISOString(),
			})
			.where(eq(entityProfiles.id, profileId))
			.run();
	}

	async markSkipped(profileId: string): Promise<void> {
		await this.db
			.update(entityProfiles)
			.set({
				enrichmentStatus: "skipped" as EnrichmentStatus,
				lastEnrichedAt: new Date().toISOString(),
			})
			.where(eq(entityProfiles.id, profileId))
			.run();
	}

	async findContextForProfiles(profileIds: string[]): Promise<Map<string, EnrichmentContext>> {
		if (profileIds.length === 0) return new Map();

		// Self-join on observation_entities requires raw SQL to alias the table
		// oe1 = target profile's observation refs, oe2 = co-occurring entity refs on same observations
		const placeholders = profileIds.map((id) => sql`${id}`);
		const rows = await this.db.all<CoOccurrenceRow>(sql`
			SELECT
				oe1.entity_profile_id AS profileId,
				ep2.canonical_name AS coCanonicalName,
				ep2.type AS coType,
				o.type AS observationType
			FROM observation_entities oe1
			INNER JOIN observations o ON oe1.observation_id = o.id
			INNER JOIN observation_entities oe2
				ON oe2.observation_id = o.id
				AND oe2.entity_profile_id != oe1.entity_profile_id
				AND oe2.entity_profile_id IS NOT NULL
			INNER JOIN entity_profiles ep2 ON oe2.entity_profile_id = ep2.id
			WHERE oe1.entity_profile_id IN (${sql.join(placeholders, sql`, `)})
		`);

		return buildContextMap(rows);
	}
}
