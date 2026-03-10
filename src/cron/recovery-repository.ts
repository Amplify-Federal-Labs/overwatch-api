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

	async findUnsynthesizedProfileIds(): Promise<string[]> {
		const { results } = await this.db
			.prepare(
				`SELECT ep.id FROM entity_profiles ep
				 WHERE ep.last_synthesized_at IS NULL
				 AND ep.observation_count > 0`,
			)
			.all<{ id: string }>();
		return results.map((r) => r.id);
	}

	async findPendingEnrichmentIds(): Promise<string[]> {
		const placeholders = ENRICHABLE_TYPES.map(() => "?").join(", ");
		const { results } = await this.db
			.prepare(
				`SELECT id FROM entity_profiles
				 WHERE enrichment_status = 'pending'
				 AND type IN (${placeholders})`,
			)
			.bind(...ENRICHABLE_TYPES)
			.all<{ id: string }>();
		return results.map((r) => r.id);
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
		const [unresolvedEntityCount, unsynthesizedProfileIds, pendingEnrichmentIds, unmaterializedItemCount] =
			await Promise.all([
				this.countUnresolvedEntities(),
				this.findUnsynthesizedProfileIds(),
				this.findPendingEnrichmentIds(),
				this.countUnmaterializedItems(),
			]);

		return {
			unresolvedEntityCount,
			unsynthesizedProfileIds,
			pendingEnrichmentIds,
			unmaterializedItemCount,
		};
	}
}
