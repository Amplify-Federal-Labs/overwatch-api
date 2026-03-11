import { Agent, getAgentByName } from "agents";
import { ProfileSynthesizer } from "./profile-synthesizer";
import { SynthesisRepository, buildSynthesisContext } from "../db/synthesis-repository";
import { Logger } from "../logger";
import type { SignalMaterializerAgent } from "./signal-materializer-agent";

const BATCH_SIZE = 25;

export interface SynthesisRunResult {
	profilesProcessed: number;
	insightsGenerated: number;
	remainingProfileIds: string[];
	startedAt: string;
}

export function shouldSelfScheduleSynthesis(result: SynthesisRunResult): boolean {
	return result.remainingProfileIds.length > 0 && result.profilesProcessed > 0;
}

interface AgentState {
	lastRun?: string;
	lastResult?: SynthesisRunResult;
}

export class SynthesisAgent extends Agent<Env, AgentState> {
	initialState: AgentState = {};

	async onRequest(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		const body = await request.json() as { profileIds?: string[] };
		const result = await this.synthesizeProfiles(body.profileIds ?? []);
		return new Response(JSON.stringify(result), {
			headers: { "Content-Type": "application/json" },
		});
	}

	async synthesizeProfiles(profileIds: string[]): Promise<SynthesisRunResult> {
		const logger = new Logger(this.env.LOG_LEVEL);
		const repository = new SynthesisRepository(this.env.DB);
		const synthesizer = new ProfileSynthesizer(this.env);
		const startedAt = new Date().toISOString();

		logger.info("Starting profile synthesis", { profileCount: profileIds.length });

		// When called with empty array, query DB for unsynthesized profiles
		const effectiveIds = profileIds.length > 0
			? profileIds
			: await repository.findUnsynthesizedProfileIds();

		if (effectiveIds.length === 0) {
			logger.info("No profiles need synthesis");
			return { profilesProcessed: 0, insightsGenerated: 0, remainingProfileIds: [], startedAt };
		}

		logger.info("Profiles to synthesize", { count: effectiveIds.length });

		const batch = effectiveIds.slice(0, BATCH_SIZE);
		const remainingProfileIds = effectiveIds.slice(BATCH_SIZE);

		const profiles = await repository.findProfilesByIds(batch);
		if (profiles.length === 0) {
			logger.info("No profiles found for provided IDs");
			return { profilesProcessed: 0, insightsGenerated: 0, remainingProfileIds, startedAt };
		}

		logger.info("Found profiles for synthesis", { count: profiles.length });

		let profilesProcessed = 0;
		let insightsGenerated = 0;

		for (const profile of profiles) {
			try {
				const observations = await repository.findObservationsForProfile(profile.id);
				if (observations.length === 0) {
					logger.info("No observations for profile, skipping", { profileId: profile.id });
					continue;
				}

				const context = buildSynthesisContext(profile.canonicalName, profile.type, observations);
				const output = await synthesizer.synthesize(context);

				// Update profile with synthesis results
				await repository.updateProfileSynthesis(
					profile.id,
					output.summary,
					output.trajectory,
					output.relevanceScore,
				);

				// Compute observation window
				const dates = observations
					.map((o) => o.sourceDate ?? o.createdAt.split("T")[0])
					.sort();
				const observationWindow = `${dates[0]}/${dates[dates.length - 1]}`;

				// Store insights
				for (const insight of output.insights) {
					await repository.insertInsight(
						profile.id,
						insight.type,
						insight.content,
						observationWindow,
						observations.length,
					);
					insightsGenerated++;
				}

				profilesProcessed++;
				logger.info("Synthesized profile", {
					profileId: profile.id,
					name: profile.canonicalName,
					insights: output.insights.length,
				});
			} catch (err) {
				logger.error("Failed to synthesize profile", {
					profileId: profile.id,
					error: err instanceof Error ? err : new Error(String(err)),
				});
			}
		}

		const runResult: SynthesisRunResult = {
			profilesProcessed,
			insightsGenerated,
			remainingProfileIds,
			startedAt,
		};

		this.setState({
			lastRun: new Date().toISOString(),
			lastResult: runResult,
		});

		logger.info("Profile synthesis complete", { ...runResult });

		// Self-schedule remaining profiles
		if (shouldSelfScheduleSynthesis(runResult)) {
			logger.info("Queuing next synthesis batch", { remainingCount: remainingProfileIds.length });
			await this.queue("synthesizeProfiles", remainingProfileIds);
		}

		// Chain: queue signal materialization after synthesis
		if (profilesProcessed > 0) {
			try {
				const materializer = await getAgentByName<Env, SignalMaterializerAgent>(
					this.env.SIGNAL_MATERIALIZER,
					"singleton",
				);
				await materializer.queue("materializeNew", {});
				logger.info("Signal materialization queued after synthesis");
			} catch (err) {
				logger.error("Failed to queue signal materialization", {
					error: err instanceof Error ? err : new Error(String(err)),
				});
			}
		}

		return runResult;
	}
}
