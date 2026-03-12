import { EntityMention } from "./entity-mention";
import { Observation } from "./observation";
import type { SignalType, ObservationType, EntityRole, EntityType } from "./types";

export interface SignalObservationInput {
	type: string;
	summary: string;
	sourceDate: string | null;
	entityMentions: Array<{
		entityType: string;
		rawName: string;
		role: string;
		entityProfileId: string | null;
		resolvedAt: string | null;
	}>;
}

export interface SignalInput {
	id: string;
	sourceName: string;
	sourceUrl: string | null;
	content: string;
	sourceMetadata: Record<string, string> | null;
	createdAt: string;
	observations: SignalObservationInput[];
}

export interface RelevanceOverride {
	score: number;
	rationale: string;
	competencyCodes: readonly string[];
}

export interface SignalEntity {
	type: string;
	value: string;
	confidence: number;
}

export class Signal {
	readonly id: string;
	readonly ingestedItemId: string;
	readonly title: string;
	readonly summary: string;
	readonly date: string;
	readonly branch: string;
	readonly source: string;
	readonly type: SignalType;
	readonly relevance: number;
	readonly relevanceRationale: string;
	readonly tags: string[];
	readonly competencies: string[];
	readonly play: string;
	readonly competitors: string[];
	readonly vendors: string[];
	readonly stakeholders: Array<{ id: string; name: string }>;
	readonly entities: SignalEntity[];
	readonly sourceUrl: string;
	readonly sourceMetadata: Record<string, string> | null;
	readonly createdAt: string;
	readonly updatedAt: string;

	private constructor(props: {
		id: string;
		ingestedItemId: string;
		title: string;
		summary: string;
		date: string;
		branch: string;
		source: string;
		type: SignalType;
		relevance: number;
		relevanceRationale: string;
		tags: string[];
		competencies: string[];
		play: string;
		competitors: string[];
		vendors: string[];
		stakeholders: Array<{ id: string; name: string }>;
		entities: SignalEntity[];
		sourceUrl: string;
		sourceMetadata: Record<string, string> | null;
		createdAt: string;
		updatedAt: string;
	}) {
		Object.assign(this, props);
		this.id = props.id;
		this.ingestedItemId = props.ingestedItemId;
		this.title = props.title;
		this.summary = props.summary;
		this.date = props.date;
		this.branch = props.branch;
		this.source = props.source;
		this.type = props.type;
		this.relevance = props.relevance;
		this.relevanceRationale = props.relevanceRationale;
		this.tags = props.tags;
		this.competencies = props.competencies;
		this.play = props.play;
		this.competitors = props.competitors;
		this.vendors = props.vendors;
		this.stakeholders = props.stakeholders;
		this.entities = props.entities;
		this.sourceUrl = props.sourceUrl;
		this.sourceMetadata = props.sourceMetadata;
		this.createdAt = props.createdAt;
		this.updatedAt = props.updatedAt;
	}

	static materialize(
		input: SignalInput,
		entityRelevanceScores: Record<string, number>,
		relevanceOverride?: RelevanceOverride,
	): Signal {
		const observations = input.observations.map((o, i) =>
			new Observation({
				id: i,
				ingestedItemId: input.id,
				type: o.type as ObservationType,
				summary: o.summary,
				attributes: null,
				sourceDate: o.sourceDate,
				createdAt: input.createdAt,
				entityMentions: o.entityMentions.map((e, j) => ({
					id: j,
					observationId: i,
					role: e.role as EntityRole,
					entityType: e.entityType as EntityType,
					rawName: e.rawName,
					entityProfileId: e.entityProfileId,
					resolvedAt: e.resolvedAt,
				})),
			}),
		);

		const allMentions = observations.flatMap((o) => o.entityMentions);

		const firstObs = observations[0];
		const title = firstObs?.summary ?? truncate(input.content, 120);
		const summary = input.content;
		const type = firstObs?.signalType ?? "strategy";
		const date = firstObs?.sourceDate ?? input.createdAt.split("T")[0];
		const branch = allMentions.find((m) => m.isAgency())?.rawName ?? "";

		const tags = [...new Set(allMentions.filter((m) => m.isTechnology()).map((m) => m.rawName))];
		const vendors = [...new Set(allMentions.filter((m) => m.isVendor()).map((m) => m.rawName))];
		const competitors = [...new Set(allMentions.filter((m) => m.isCompetitor()).map((m) => m.rawName))];
		const stakeholders = dedupeStakeholders(
			allMentions
				.filter((m) => m.isStakeholder())
				.map((m) => ({ id: m.entityProfileId!, name: m.rawName })),
		);

		let relevance: number;
		let relevanceRationale: string;
		if (relevanceOverride) {
			relevance = relevanceOverride.score;
			relevanceRationale = relevanceOverride.rationale;
		} else {
			const profileIds = allMentions
				.map((m) => m.entityProfileId)
				.filter((id): id is string => id !== null);
			relevance = profileIds.length > 0
				? Math.max(...profileIds.map((id) => entityRelevanceScores[id] ?? 0))
				: 0;
			relevanceRationale = "";
		}

		const entities: SignalEntity[] = allMentions.map((m) => ({
			type: m.entityType,
			value: m.rawName,
			confidence: m.confidence,
		}));

		return new Signal({
			id: input.id,
			ingestedItemId: input.id,
			title,
			summary,
			date,
			branch,
			source: input.sourceName,
			type,
			relevance,
			relevanceRationale,
			tags,
			competencies: relevanceOverride ? [...relevanceOverride.competencyCodes] : [],
			play: "",
			competitors,
			vendors,
			stakeholders,
			entities,
			sourceUrl: input.sourceUrl ?? "",
			sourceMetadata: input.sourceMetadata,
			createdAt: input.createdAt,
			updatedAt: new Date().toISOString(),
		});
	}
}

function dedupeStakeholders(items: Array<{ id: string; name: string }>): Array<{ id: string; name: string }> {
	const seen = new Set<string>();
	const result: Array<{ id: string; name: string }> = [];
	for (const item of items) {
		if (!seen.has(item.id)) {
			seen.add(item.id);
			result.push(item);
		}
	}
	return result;
}

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 1) + "…";
}
