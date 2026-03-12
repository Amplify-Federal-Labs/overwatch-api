import type { CompetencyCode } from "./types";

export interface IngestedItemProps {
	id: string;
	sourceType: string;
	sourceName: string;
	sourceUrl: string | null;
	sourceLink: string | null;
	content: string;
	sourceMetadata: Record<string, string> | null;
	relevanceScore: number | null;
	relevanceRationale: string | null;
	competencyCodes: CompetencyCode[] | null;
	createdAt: string;
}

export class IngestedItem {
	readonly id: string;
	readonly sourceType: string;
	readonly sourceName: string;
	readonly sourceUrl: string | null;
	readonly sourceLink: string | null;
	readonly content: string;
	readonly sourceMetadata: Record<string, string> | null;
	readonly relevanceScore: number | null;
	readonly relevanceRationale: string | null;
	readonly competencyCodes: CompetencyCode[] | null;
	readonly createdAt: string;

	constructor(props: IngestedItemProps) {
		this.id = props.id;
		this.sourceType = props.sourceType;
		this.sourceName = props.sourceName;
		this.sourceUrl = props.sourceUrl;
		this.sourceLink = props.sourceLink;
		this.content = props.content;
		this.sourceMetadata = props.sourceMetadata;
		this.relevanceScore = props.relevanceScore;
		this.relevanceRationale = props.relevanceRationale;
		this.competencyCodes = props.competencyCodes;
		this.createdAt = props.createdAt;
	}

	isAboveRelevanceThreshold(threshold: number): boolean {
		if (this.relevanceScore === null) return true;
		return this.relevanceScore >= threshold;
	}

	get dateFromCreatedAt(): string {
		return this.createdAt.split("T")[0];
	}
}
