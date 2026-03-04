import type { ExtractedEntity, EntityType } from "../schemas";
import type { StakeholderRepository, StakeholderRecord } from "../db/stakeholder-repository";

export interface DiscoveredEntity {
	type: EntityType;
	value: string;
	confidence: number;
	signalRelevance: number;
}

export interface StakeholderMatchResult {
	matchedIds: string[];
	discoveredEntities: DiscoveredEntity[];
}

const DISCOVERY_RELEVANCE_THRESHOLD = 75;
const DISCOVERY_CONFIDENCE_THRESHOLD = 0.7;
const DISCOVERABLE_TYPES: ReadonlySet<EntityType> = new Set(["person", "agency"]);

export class StakeholderMatcher {
	private repository: StakeholderRepository;

	constructor(repository: StakeholderRepository) {
		this.repository = repository;
	}

	async match(entities: ExtractedEntity[], relevance: number): Promise<StakeholderMatchResult> {
		const stakeholders = await this.repository.findAll();
		const matchedIds = new Set<string>();
		const matchedEntityIndices = new Set<number>();

		for (let i = 0; i < entities.length; i++) {
			const entity = entities[i];
			const matches = this.findMatches(entity, stakeholders);
			if (matches.length > 0) {
				matchedEntityIndices.add(i);
				for (const id of matches) {
					matchedIds.add(id);
				}
			}
		}

		const discoveredEntities = this.discoverEntities(
			entities,
			matchedEntityIndices,
			relevance,
		);

		return {
			matchedIds: [...matchedIds],
			discoveredEntities,
		};
	}

	private findMatches(entity: ExtractedEntity, stakeholders: StakeholderRecord[]): string[] {
		const ids: string[] = [];
		const valueLower = entity.value.toLowerCase();

		for (const s of stakeholders) {
			if (this.entityMatchesStakeholder(entity.type, valueLower, s)) {
				ids.push(s.id);
			}
		}

		return ids;
	}

	private entityMatchesStakeholder(type: EntityType, valueLower: string, s: StakeholderRecord): boolean {
		switch (type) {
			case "person":
				return this.personNameMatches(valueLower, s.name.toLowerCase());
			case "agency":
				return s.org.toLowerCase().includes(valueLower)
					|| valueLower.includes(s.org.toLowerCase());
			case "program":
				return s.programs.some((p) => p.toLowerCase().includes(valueLower)
					|| valueLower.includes(p.toLowerCase()));
			case "company":
				return s.awardPrimes.some((p) => p.toLowerCase() === valueLower);
			case "technology":
				return s.focusAreas.some((f) => f.toLowerCase().includes(valueLower)
					|| valueLower.includes(f.toLowerCase()));
			case "contract_vehicle":
				return false;
		}
	}

	private personNameMatches(entityName: string, stakeholderName: string): boolean {
		const entityWords = entityName.split(/\s+/).filter((w) => w.length > 1);
		return entityWords.length > 0
			&& entityWords.every((word) => stakeholderName.includes(word));
	}

	private discoverEntities(
		entities: ExtractedEntity[],
		matchedIndices: Set<number>,
		relevance: number,
	): DiscoveredEntity[] {
		if (relevance < DISCOVERY_RELEVANCE_THRESHOLD) {
			return [];
		}

		const discovered: DiscoveredEntity[] = [];

		for (let i = 0; i < entities.length; i++) {
			const entity = entities[i];

			if (matchedIndices.has(i)) continue;
			if (!DISCOVERABLE_TYPES.has(entity.type)) continue;
			if (entity.confidence < DISCOVERY_CONFIDENCE_THRESHOLD) continue;

			discovered.push({
				type: entity.type,
				value: entity.value,
				confidence: entity.confidence,
				signalRelevance: relevance,
			});
		}

		return discovered;
	}
}
