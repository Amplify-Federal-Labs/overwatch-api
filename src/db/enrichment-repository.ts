import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { entityProfiles } from "./schema";
import type { Dossier, EnrichmentStatus } from "../schemas";

export interface ProfileForEnrichment {
	id: string;
	type: string;
	canonicalName: string;
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
}
