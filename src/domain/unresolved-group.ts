import type { EntityType } from "./types";

export interface UnresolvedMention {
	id: number;
	observationId: number;
	role: string;
	entityType: string;
	rawName: string;
}

export class UnresolvedGroup {
	readonly normalizedName: string;
	readonly entityType: string;
	readonly mostCommonRawName: string;
	readonly entities: UnresolvedMention[];

	constructor(props: {
		normalizedName: string;
		entityType: string;
		mostCommonRawName: string;
		entities: UnresolvedMention[];
	}) {
		this.normalizedName = props.normalizedName;
		this.entityType = props.entityType;
		this.mostCommonRawName = props.mostCommonRawName;
		this.entities = props.entities;
	}

	static single(mention: UnresolvedMention): UnresolvedGroup {
		return new UnresolvedGroup({
			normalizedName: mention.rawName.toLowerCase().trim(),
			entityType: mention.entityType,
			mostCommonRawName: mention.rawName,
			entities: [mention],
		});
	}

	static fromMentions(mentions: UnresolvedMention[]): UnresolvedGroup[] {
		const map = new Map<string, UnresolvedMention[]>();

		for (const mention of mentions) {
			const key = mention.rawName.toLowerCase().trim();
			const group = map.get(key);
			if (group) {
				group.push(mention);
			} else {
				map.set(key, [mention]);
			}
		}

		const groups: UnresolvedGroup[] = [];
		for (const [normalizedName, groupEntities] of map) {
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

			groups.push(new UnresolvedGroup({
				normalizedName,
				entityType: groupEntities[0].entityType,
				mostCommonRawName,
				entities: groupEntities,
			}));
		}

		return groups;
	}
}
