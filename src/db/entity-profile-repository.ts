import { drizzle } from "drizzle-orm/d1";
import { eq, isNull, sql } from "drizzle-orm";
import { entityProfiles, entityAliases, entityRelationships, observationEntities, observations } from "./schema";
import type { AliasSource } from "../schemas";

export interface UnresolvedEntity {
	id: number;
	observationId: number;
	role: string;
	entityType: string;
	rawName: string;
}

export interface UnresolvedGroup {
	normalizedName: string;
	entityType: string;
	mostCommonRawName: string;
	entities: UnresolvedEntity[];
}

export function buildEntityProfileRow(type: string, canonicalName: string) {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		type,
		canonicalName,
		firstSeenAt: now,
		lastSeenAt: now,
		observationCount: 0,
		summary: null,
		trajectory: null,
		relevanceScore: null,
		lastSynthesizedAt: null,
		dossier: null,
		enrichmentStatus: "pending",
		lastEnrichedAt: null,
		createdAt: now,
	};
}

export function buildEntityAliasRow(
	entityProfileId: string,
	alias: string,
	source: AliasSource = "auto",
) {
	return {
		entityProfileId,
		alias,
		source,
		createdAt: new Date().toISOString(),
	};
}

export function buildEntityRelationshipRow(
	sourceEntityId: string,
	targetEntityId: string,
	type: string,
) {
	const now = new Date().toISOString();
	return {
		sourceEntityId,
		targetEntityId,
		type,
		observationCount: 1,
		firstSeenAt: now,
		lastSeenAt: now,
	};
}

export function groupUnresolvedByName(entities: UnresolvedEntity[]): UnresolvedGroup[] {
	const map = new Map<string, UnresolvedEntity[]>();

	for (const entity of entities) {
		const key = entity.rawName.toLowerCase().trim();
		const group = map.get(key);
		if (group) {
			group.push(entity);
		} else {
			map.set(key, [entity]);
		}
	}

	const groups: UnresolvedGroup[] = [];
	for (const [normalizedName, groupEntities] of map) {
		// Pick the most common raw name variant
		const nameCounts = new Map<string, number>();
		for (const e of groupEntities) {
			nameCounts.set(e.rawName, (nameCounts.get(e.rawName) ?? 0) + 1);
		}
		let mostCommonRawName = groupEntities[0].rawName;
		let maxCount = 0;
		for (const [name, count] of nameCounts) {
			if (count > maxCount) {
				maxCount = count;
				mostCommonRawName = name;
			}
		}

		groups.push({
			normalizedName,
			entityType: groupEntities[0].entityType,
			mostCommonRawName,
			entities: groupEntities,
		});
	}

	return groups;
}

export class EntityProfileRepository {
	private db: ReturnType<typeof drizzle>;

	constructor(d1: D1Database) {
		this.db = drizzle(d1);
	}

	async countProfiles(): Promise<number> {
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(entityProfiles)
			.get();
		return result?.count ?? 0;
	}

	async countAliases(): Promise<number> {
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(entityAliases)
			.get();
		return result?.count ?? 0;
	}

	async countProfilesByTypeBreakdown(): Promise<Record<string, number>> {
		const rows = await this.db
			.select({
				type: entityProfiles.type,
				count: sql<number>`count(*)`,
			})
			.from(entityProfiles)
			.groupBy(entityProfiles.type)
			.all();

		const result: Record<string, number> = {};
		for (const row of rows) {
			result[row.type] = row.count;
		}
		return result;
	}

	async countByEnrichmentStatus(): Promise<Record<string, number>> {
		const rows = await this.db
			.select({
				status: entityProfiles.enrichmentStatus,
				count: sql<number>`count(*)`,
			})
			.from(entityProfiles)
			.groupBy(entityProfiles.enrichmentStatus)
			.all();

		const result: Record<string, number> = {};
		for (const row of rows) {
			result[row.status] = row.count;
		}
		return result;
	}

	async countSynthesized(): Promise<number> {
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(entityProfiles)
			.where(sql`${entityProfiles.lastSynthesizedAt} IS NOT NULL`)
			.get();
		return result?.count ?? 0;
	}

	async countWithDossier(): Promise<number> {
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(entityProfiles)
			.where(sql`${entityProfiles.dossier} IS NOT NULL`)
			.get();
		return result?.count ?? 0;
	}

	async findUnresolvedEntities(): Promise<UnresolvedEntity[]> {
		const rows = await this.db
			.select({
				id: observationEntities.id,
				observationId: observationEntities.observationId,
				role: observationEntities.role,
				entityType: observationEntities.entityType,
				rawName: observationEntities.rawName,
			})
			.from(observationEntities)
			.where(isNull(observationEntities.entityProfileId))
			.all();
		return rows;
	}

	async findAllProfilesWithAliases() {
		const profiles = await this.db.select().from(entityProfiles).all();
		const result = [];
		for (const profile of profiles) {
			const aliases = await this.db
				.select()
				.from(entityAliases)
				.where(eq(entityAliases.entityProfileId, profile.id))
				.all();
			result.push({ ...profile, aliases: aliases.map((a) => a.alias) });
		}
		return result;
	}

	async createProfile(type: string, canonicalName: string): Promise<string> {
		const row = buildEntityProfileRow(type, canonicalName);
		await this.db.insert(entityProfiles).values(row).run();
		// Also create the canonical name as an alias
		const aliasRow = buildEntityAliasRow(row.id, canonicalName);
		await this.db.insert(entityAliases).values(aliasRow).run();
		return row.id;
	}

	async resolveEntity(observationEntityId: number, entityProfileId: string): Promise<void> {
		await this.db
			.update(observationEntities)
			.set({
				entityProfileId,
				resolvedAt: new Date().toISOString(),
			})
			.where(eq(observationEntities.id, observationEntityId))
			.run();
	}

	async resolveEntities(observationEntityIds: number[], entityProfileId: string): Promise<void> {
		for (const id of observationEntityIds) {
			await this.resolveEntity(id, entityProfileId);
		}
	}

	async addAlias(entityProfileId: string, alias: string): Promise<void> {
		const aliasRow = buildEntityAliasRow(entityProfileId, alias);
		// Use INSERT OR IGNORE to skip duplicates (unique index on entityProfileId + alias)
		await this.db.insert(entityAliases).values(aliasRow).onConflictDoNothing().run();
	}

	async updateProfileStats(entityProfileId: string): Promise<void> {
		// Count observations linked to this profile
		const countResult = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(observationEntities)
			.where(eq(observationEntities.entityProfileId, entityProfileId))
			.get();

		const count = countResult?.count ?? 0;
		await this.db
			.update(entityProfiles)
			.set({
				observationCount: count,
				lastSeenAt: new Date().toISOString(),
			})
			.where(eq(entityProfiles.id, entityProfileId))
			.run();
	}

	async resolveGroupBatch(
		entityIds: number[],
		profileId: string,
		addAlias: boolean,
		aliasName: string,
	): Promise<void> {
		const now = new Date().toISOString();

		const resolveQueries = entityIds.map((id) =>
			this.db
				.update(observationEntities)
				.set({ entityProfileId: profileId, resolvedAt: now })
				.where(eq(observationEntities.id, id)),
		);

		const aliasQueries = addAlias
			? [this.db.insert(entityAliases).values(buildEntityAliasRow(profileId, aliasName)).onConflictDoNothing()]
			: [];

		// Stats update: we can't do the COUNT inside a batch, so we update after
		// D1 batch executes all statements atomically
		const queries = [...resolveQueries, ...aliasQueries];

		if (queries.length > 0) {
			await this.db.batch(queries as [typeof queries[0], ...typeof queries]);
		}

		// Update stats after the batch (needs a read then write)
		await this.updateProfileStats(profileId);
	}

	async findProfilesWithSignalIds() {
		const profiles = await this.db.select().from(entityProfiles).all();
		return this.attachSignalIds(profiles);
	}

	async findProfileWithSignalIdsById(id: string) {
		const profile = await this.db
			.select()
			.from(entityProfiles)
			.where(eq(entityProfiles.id, id))
			.get();
		if (!profile) return null;
		const [result] = await this.attachSignalIds([profile]);
		return result;
	}

	async findProfilesWithSignalIdsPaginated(
		types: string[],
		limit: number,
		offset: number,
	) {
		const profiles = await this.db
			.select()
			.from(entityProfiles)
			.where(sql`${entityProfiles.type} IN (${sql.join(types.map((t) => sql`${t}`), sql`, `)})`)
			.limit(limit)
			.offset(offset)
			.all();
		return this.attachSignalIds(profiles);
	}

	async countProfilesByTypes(types: string[]): Promise<number> {
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(entityProfiles)
			.where(sql`${entityProfiles.type} IN (${sql.join(types.map((t) => sql`${t}`), sql`, `)})`)
			.get();
		return result?.count ?? 0;
	}

	private async attachSignalIds(profiles: (typeof entityProfiles.$inferSelect)[]) {
		const result = [];
		for (const profile of profiles) {
			const refs = await this.db
				.select({ signalId: observations.signalId })
				.from(observationEntities)
				.innerJoin(observations, eq(observationEntities.observationId, observations.id))
				.where(eq(observationEntities.entityProfileId, profile.id))
				.all();
			const signalIds = [...new Set(refs.map((r) => r.signalId))];
			result.push({
				id: profile.id,
				type: profile.type,
				canonicalName: profile.canonicalName,
				observationCount: profile.observationCount,
				summary: profile.summary,
				trajectory: profile.trajectory,
				relevanceScore: profile.relevanceScore,
				dossier: profile.dossier,
				signalIds,
			});
		}
		return result;
	}

	async findRelevanceScores(): Promise<Record<string, number>> {
		const rows = await this.db
			.select({
				id: entityProfiles.id,
				relevanceScore: entityProfiles.relevanceScore,
			})
			.from(entityProfiles)
			.all();

		const scores: Record<string, number> = {};
		for (const row of rows) {
			if (row.relevanceScore !== null) {
				scores[row.id] = row.relevanceScore;
			}
		}
		return scores;
	}

	async findProfilesByIds(ids: string[]): Promise<{ id: string; type: string; canonicalName: string; summary: string | null }[]> {
		if (ids.length === 0) return [];
		return this.db
			.select({
				id: entityProfiles.id,
				type: entityProfiles.type,
				canonicalName: entityProfiles.canonicalName,
				summary: entityProfiles.summary,
			})
			.from(entityProfiles)
			.where(sql`${entityProfiles.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)
			.all();
	}

	async findIngestedItemIdsByProfileIds(entityProfileIds: string[]): Promise<string[]> {
		if (entityProfileIds.length === 0) return [];

		const refs = await this.db
			.select({ signalId: observations.signalId })
			.from(observationEntities)
			.innerJoin(observations, eq(observationEntities.observationId, observations.id))
			.where(sql`${observationEntities.entityProfileId} IN (${sql.join(entityProfileIds.map((id) => sql`${id}`), sql`, `)})`)
			.all();

		return [...new Set(refs.map((r) => r.signalId))];
	}

	async upsertRelationship(
		sourceEntityId: string,
		targetEntityId: string,
		type: string,
	): Promise<void> {
		const row = buildEntityRelationshipRow(sourceEntityId, targetEntityId, type);
		await this.db
			.insert(entityRelationships)
			.values(row)
			.onConflictDoUpdate({
				target: [
					entityRelationships.sourceEntityId,
					entityRelationships.targetEntityId,
					entityRelationships.type,
				],
				set: {
					observationCount: sql`${entityRelationships.observationCount} + 1`,
					lastSeenAt: new Date().toISOString(),
				},
			})
			.run();
	}
}
