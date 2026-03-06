import { Agent } from "agents";
import { ProfileSynthesizer } from "./profile-synthesizer";
import { SynthesisRepository, buildSynthesisContext } from "../db/synthesis-repository";
import { Logger } from "../logger";

export interface SynthesisRunResult {
	profilesProcessed: number;
	insightsGenerated: number;
	startedAt: string;
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

		const result = await this.runSynthesis();
		return new Response(JSON.stringify(result), {
			headers: { "Content-Type": "application/json" },
		});
	}

	async runSynthesis(): Promise<SynthesisRunResult> {
		const logger = new Logger(this.env.LOG_LEVEL);
		const repository = new SynthesisRepository(this.env.DB);
		const synthesizer = new ProfileSynthesizer(this.env);
		const startedAt = new Date().toISOString();

		logger.info("Starting profile synthesis");

		const profiles = await repository.findProfilesNeedingSynthesis();
		if (profiles.length === 0) {
			logger.info("No profiles need synthesis");
			return { profilesProcessed: 0, insightsGenerated: 0, startedAt };
		}

		logger.info("Found profiles needing synthesis", { count: profiles.length });

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
			startedAt,
		};

		this.setState({
			lastRun: new Date().toISOString(),
			lastResult: runResult,
		});

		logger.info("Profile synthesis complete", { ...runResult });
		return runResult;
	}
}
