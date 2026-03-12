import { EntityMention, type EntityMentionProps } from "./entity-mention";
import type { ObservationType, SignalType } from "./types";

const OBSERVATION_TYPE_TO_SIGNAL_TYPE: Record<ObservationType, SignalType> = {
	contract_award: "opportunity",
	solicitation: "opportunity",
	partnership: "competitor",
	budget_signal: "strategy",
	technology_adoption: "strategy",
	personnel_move: "strategy",
	policy_change: "strategy",
	program_milestone: "strategy",
};

export interface ObservationProps {
	id: number;
	ingestedItemId: string;
	type: ObservationType;
	summary: string;
	attributes: Record<string, string> | null;
	sourceDate: string | null;
	createdAt: string;
	entityMentions: EntityMentionProps[];
}

export class Observation {
	readonly id: number;
	readonly ingestedItemId: string;
	readonly type: ObservationType;
	readonly summary: string;
	readonly attributes: Record<string, string> | null;
	readonly sourceDate: string | null;
	readonly createdAt: string;
	readonly entityMentions: EntityMention[];

	constructor(props: ObservationProps) {
		this.id = props.id;
		this.ingestedItemId = props.ingestedItemId;
		this.type = props.type;
		this.summary = props.summary;
		this.attributes = props.attributes;
		this.sourceDate = props.sourceDate;
		this.createdAt = props.createdAt;
		this.entityMentions = props.entityMentions.map((p) => new EntityMention(p));
	}

	get signalType(): SignalType {
		return OBSERVATION_TYPE_TO_SIGNAL_TYPE[this.type];
	}
}
