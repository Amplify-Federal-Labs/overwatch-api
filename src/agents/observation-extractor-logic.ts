import type { SignalSourceType } from "../schemas";

export interface IngestionResult {
	sourceType: SignalSourceType;
	signalsFound: number;
	signalsStored: number;
	observationsExtracted: number;
	itemsAboveThreshold: number;
	itemsBelowThreshold: number;
	startedAt: string;
}

export interface IngestionDispatchResult {
	sourceType: SignalSourceType;
	feedsQueued: number;
	startedAt: string;
}
