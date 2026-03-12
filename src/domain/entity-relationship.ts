import type { RelationshipType } from "./types";

export interface EntityRelationshipProps {
	sourceEntityId: string;
	targetEntityId: string;
	type: RelationshipType;
	observationCount: number;
	firstSeenAt: string;
	lastSeenAt: string;
}

export class EntityRelationship {
	readonly sourceEntityId: string;
	readonly targetEntityId: string;
	readonly type: RelationshipType;
	readonly observationCount: number;
	readonly firstSeenAt: string;
	readonly lastSeenAt: string;

	constructor(props: EntityRelationshipProps) {
		this.sourceEntityId = props.sourceEntityId;
		this.targetEntityId = props.targetEntityId;
		this.type = props.type;
		this.observationCount = props.observationCount;
		this.firstSeenAt = props.firstSeenAt;
		this.lastSeenAt = props.lastSeenAt;
	}
}
