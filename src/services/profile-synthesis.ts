import type { InsightType } from "../domain/types";

export interface SynthesisInsight {
	type: InsightType;
	content: string;
}

export interface SynthesisOutput {
	summary: string;
	trajectory: string | null;
	relevanceScore: number;
	insights: SynthesisInsight[];
}

export interface ProfileSynthesisService {
	synthesize(context: string): Promise<SynthesisOutput>;
}
