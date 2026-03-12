import { buildSynthesisContext } from "../db/synthesis-repository";
import type { ObservationWithEntities, ProfileForSynthesis } from "../db/synthesis-repository";
import type { SynthesisOutput } from "../services/profile-synthesis";
import type { InsightType } from "../domain/types";
import type { MaterializationMessage } from "./types";

export interface SynthesisConsumerResult {
	readonly profileId: string;
	readonly synthesized: boolean;
	readonly insightsGenerated: number;
}

interface QueueSender<T> {
	send(message: T): Promise<void>;
}

interface SynthesisRepository {
	findProfileById(profileId: string): Promise<ProfileForSynthesis | null>;
	findObservationsForProfile(profileId: string): Promise<ObservationWithEntities[]>;
	updateProfileSynthesis(
		profileId: string,
		summary: string,
		trajectory: string | null,
		relevanceScore: number | null,
	): Promise<void>;
	insertInsight(
		entityProfileId: string,
		type: InsightType,
		content: string,
		observationWindow: string,
		observationCount: number,
	): Promise<void>;
	findIngestedItemIdsForProfile(profileId: string): Promise<string[]>;
}

interface SynthesizerService {
	synthesize(context: string): Promise<SynthesisOutput>;
}

interface SynthesisLogger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
	debug(message: string, data?: Record<string, unknown>): void;
}

export interface SynthesisDeps {
	readonly materializationQueue: QueueSender<MaterializationMessage>;
	readonly repository: SynthesisRepository;
	readonly synthesizer: SynthesizerService;
	readonly logger: SynthesisLogger;
}

function computeObservationWindow(observations: ObservationWithEntities[]): string {
	const dates = observations
		.map((o) => o.sourceDate ?? o.createdAt.split("T")[0])
		.sort();
	return `${dates[0]}/${dates[dates.length - 1]}`;
}

export async function handleSynthesis(
	profileId: string,
	deps: SynthesisDeps,
): Promise<SynthesisConsumerResult> {
	const { materializationQueue, repository, synthesizer, logger } = deps;

	const profile = await repository.findProfileById(profileId);
	if (!profile) {
		logger.warn("Profile not found for synthesis", { profileId });
		return { profileId, synthesized: false, insightsGenerated: 0 };
	}

	const observations = await repository.findObservationsForProfile(profileId);
	if (observations.length === 0) {
		logger.info("No observations for profile, skipping synthesis", { profileId });
		return { profileId, synthesized: false, insightsGenerated: 0 };
	}

	const context = buildSynthesisContext(profile.canonicalName, profile.type, observations);
	const output = await synthesizer.synthesize(context);

	// Update profile with synthesis results
	await repository.updateProfileSynthesis(
		profileId,
		output.summary,
		output.trajectory,
		output.relevanceScore,
	);

	// Store insights
	let insightsGenerated = 0;
	if (output.insights.length > 0) {
		const observationWindow = computeObservationWindow(observations);

		for (const insight of output.insights) {
			await repository.insertInsight(
				profileId,
				insight.type,
				insight.content,
				observationWindow,
				observations.length,
			);
			insightsGenerated++;
		}
	}

	// Produce materialization messages for linked ingested items
	const ingestedItemIds = await repository.findIngestedItemIdsForProfile(profileId);
	for (const ingestedItemId of ingestedItemIds) {
		await materializationQueue.send({ type: "materialization", ingestedItemId });
	}

	logger.info("Synthesis complete for profile", {
		profileId,
		name: profile.canonicalName,
		insightsGenerated,
		materializationMessagesProduced: ingestedItemIds.length,
	});

	return { profileId, synthesized: true, insightsGenerated };
}
