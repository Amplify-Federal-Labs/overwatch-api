import type { EntityType, EntityRole } from "./types";

export interface EntityMentionProps {
	id: number;
	observationId: string | number;
	role: EntityRole;
	entityType: EntityType;
	rawName: string;
	entityProfileId: string | null;
	resolvedAt: string | null;
}

export class EntityMention {
	readonly id: number;
	readonly observationId: string | number;
	readonly role: EntityRole;
	readonly entityType: EntityType;
	readonly rawName: string;
	readonly entityProfileId: string | null;
	readonly resolvedAt: string | null;

	constructor(props: EntityMentionProps) {
		this.id = props.id;
		this.observationId = props.observationId;
		this.role = props.role;
		this.entityType = props.entityType;
		this.rawName = props.rawName;
		this.entityProfileId = props.entityProfileId;
		this.resolvedAt = props.resolvedAt;
	}

	isResolved(): boolean {
		return this.entityProfileId !== null;
	}

	get confidence(): number {
		return this.isResolved() ? 1.0 : 0.5;
	}

	isVendor(): boolean {
		return this.entityType === "company" && this.role === "subject";
	}

	isCompetitor(): boolean {
		return this.entityType === "company" && this.role !== "subject";
	}

	isStakeholder(): boolean {
		return this.entityType === "person" && this.isResolved();
	}

	isTechnology(): boolean {
		return this.entityType === "technology";
	}

	isAgency(): boolean {
		return this.entityType === "agency";
	}
}
