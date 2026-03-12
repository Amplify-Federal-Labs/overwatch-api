import type { ObservationExtractionResult } from "../schemas";

export interface ObservationExtractionInput {
	content: string;
	sourceType: string;
	sourceName: string;
	sourceUrl?: string;
	sourceMetadata?: Record<string, string>;
}

export interface ObservationExtractionService {
	extract(input: ObservationExtractionInput): Promise<ObservationExtractionResult>;
}
