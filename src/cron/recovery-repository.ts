import type { PipelineStatus } from "./recovery";

const ENRICHABLE_TYPES = ["person", "agency", "company"];

export class RecoveryRepository {
	constructor(private readonly db: D1Database) {}

	async countUnresolvedEntities(): Promise<number> {
		const row = await this.db
			.prepare("SELECT COUNT(*) as count FROM observation_entities WHERE entity_profile_id IS NULL")
			.first<{ count: number }>();
		return row?.count ?? 0;
	}

	async countUnsynthesizedProfiles(): Promise<number> {
		const row = await this.db
			.prepare(
				`SELECT COUNT(*) as count FROM entity_profiles
				 WHERE last_synthesized_at IS NULL
				 AND observation_count > 0`,
			)
			.first<{ count: number }>();
		return row?.count ?? 0;
	}

	async countPendingEnrichments(): Promise<number> {
		const placeholders = ENRICHABLE_TYPES.map(() => "?").join(", ");
		const row = await this.db
			.prepare(
				`SELECT COUNT(*) as count FROM entity_profiles
				 WHERE enrichment_status = 'pending'
				 AND type IN (${placeholders})`,
			)
			.bind(...ENRICHABLE_TYPES)
			.first<{ count: number }>();
		return row?.count ?? 0;
	}

	async countUnmaterializedItems(): Promise<number> {
		const row = await this.db
			.prepare(
				`SELECT COUNT(*) as count FROM ingested_items
				 WHERE id IN (SELECT DISTINCT signal_id FROM observations)
				 AND id NOT IN (SELECT ingested_item_id FROM signals)`,
			)
			.first<{ count: number }>();
		return row?.count ?? 0;
	}

	async getPipelineStatus(): Promise<PipelineStatus> {
		const [unresolvedEntityCount, unsynthesizedProfileCount, pendingEnrichmentCount, unmaterializedItemCount] =
			await Promise.all([
				this.countUnresolvedEntities(),
				this.countUnsynthesizedProfiles(),
				this.countPendingEnrichments(),
				this.countUnmaterializedItems(),
			]);

		return {
			unresolvedEntityCount,
			unsynthesizedProfileCount,
			pendingEnrichmentCount,
			unmaterializedItemCount,
		};
	}
}
