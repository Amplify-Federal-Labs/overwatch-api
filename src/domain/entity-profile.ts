import type { EntityType, EnrichmentStatus, AliasSource } from "./types";

const ENRICHABLE_TYPES: ReadonlySet<EntityType> = new Set(["person", "agency", "company"]);

export function isEnrichableType(type: string): boolean {
	return ENRICHABLE_TYPES.has(type as EntityType);
}

export interface EntityAliasData {
	alias: string;
	source: AliasSource;
	createdAt: string;
}

export class EntityProfile {
	readonly id: string;
	readonly type: EntityType;
	readonly canonicalName: string;
	observationCount: number;
	summary: string | null;
	trajectory: string | null;
	relevanceScore: number | null;
	enrichmentStatus: EnrichmentStatus;
	readonly firstSeenAt: string;
	lastSeenAt: string;
	lastSynthesizedAt: string | null;
	lastEnrichedAt: string | null;
	dossier: unknown;
	readonly createdAt: string;
	readonly aliases: EntityAliasData[];

	private constructor(props: {
		id: string;
		type: EntityType;
		canonicalName: string;
		observationCount: number;
		summary: string | null;
		trajectory: string | null;
		relevanceScore: number | null;
		enrichmentStatus: EnrichmentStatus;
		firstSeenAt: string;
		lastSeenAt: string;
		lastSynthesizedAt: string | null;
		lastEnrichedAt: string | null;
		dossier: unknown;
		createdAt: string;
		aliases: EntityAliasData[];
	}) {
		this.id = props.id;
		this.type = props.type;
		this.canonicalName = props.canonicalName;
		this.observationCount = props.observationCount;
		this.summary = props.summary;
		this.trajectory = props.trajectory;
		this.relevanceScore = props.relevanceScore;
		this.enrichmentStatus = props.enrichmentStatus;
		this.firstSeenAt = props.firstSeenAt;
		this.lastSeenAt = props.lastSeenAt;
		this.lastSynthesizedAt = props.lastSynthesizedAt;
		this.lastEnrichedAt = props.lastEnrichedAt;
		this.dossier = props.dossier;
		this.createdAt = props.createdAt;
		this.aliases = props.aliases;
	}

	static create(type: EntityType, canonicalName: string): EntityProfile {
		const now = new Date().toISOString();
		return new EntityProfile({
			id: crypto.randomUUID(),
			type,
			canonicalName,
			observationCount: 0,
			summary: null,
			trajectory: null,
			relevanceScore: null,
			enrichmentStatus: "pending",
			firstSeenAt: now,
			lastSeenAt: now,
			lastSynthesizedAt: null,
			lastEnrichedAt: null,
			dossier: null,
			createdAt: now,
			aliases: [{
				alias: canonicalName,
				source: "auto",
				createdAt: now,
			}],
		});
	}

	isEnrichable(): boolean {
		return ENRICHABLE_TYPES.has(this.type);
	}

	matchesAlias(name: string): boolean {
		const normalized = name.toLowerCase().trim();
		return this.aliases.some((a) => a.alias.toLowerCase().trim() === normalized);
	}

	addAlias(alias: string, source: AliasSource): EntityAliasData {
		const entry: EntityAliasData = {
			alias,
			source,
			createdAt: new Date().toISOString(),
		};
		this.aliases.push(entry);
		return entry;
	}
}
