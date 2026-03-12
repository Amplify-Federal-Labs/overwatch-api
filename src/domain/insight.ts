import type { InsightType } from "./types";

export interface InsightProps {
	entityProfileId: string;
	type: InsightType;
	content: string;
	observationWindow: string;
	observationCount: number;
}

export class Insight {
	readonly entityProfileId: string;
	readonly type: InsightType;
	readonly content: string;
	readonly observationWindow: string;
	readonly observationCount: number;

	constructor(props: InsightProps) {
		this.entityProfileId = props.entityProfileId;
		this.type = props.type;
		this.content = props.content;
		this.observationWindow = props.observationWindow;
		this.observationCount = props.observationCount;
	}
}
