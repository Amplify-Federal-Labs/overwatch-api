import type { SignalSourceType } from "../schemas";

// --- Queue message types (1 message = 1 unit of work) ---

export interface IngestionMessage {
	readonly type: "ingestion";
	readonly source: SignalSourceType;
}

export interface ExtractionMessage {
	readonly type: "extraction";
	readonly ingestedItemId: string;
}

export interface ResolutionMessage {
	readonly type: "resolution";
	readonly observationId: number;
	readonly entities: ReadonlyArray<{
		readonly rawName: string;
		readonly entityType: string;
		readonly role: string;
	}>;
}

export interface SynthesisMessage {
	readonly type: "synthesis";
	readonly profileId: string;
}

export interface EnrichmentMessage {
	readonly type: "enrichment";
	readonly profileId: string;
	readonly entityType: string;
	readonly canonicalName: string;
}

export interface MaterializationMessage {
	readonly type: "materialization";
	readonly ingestedItemId: string;
}

export type QueueMessage =
	| IngestionMessage
	| ExtractionMessage
	| ResolutionMessage
	| SynthesisMessage
	| EnrichmentMessage
	| MaterializationMessage;
