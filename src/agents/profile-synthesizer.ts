import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";
import { InsightTypeEnum } from "../schemas";
import type { InsightType } from "../domain/types";
import type {
	ProfileSynthesisService,
	SynthesisOutput,
	SynthesisInsight,
} from "../services/profile-synthesis";

export type { SynthesisOutput, SynthesisInsight };

const SYSTEM_PROMPT = `You are a strategic intelligence analyst for a government contracting firm (Amplify Federal). Given accumulated observations about an entity, synthesize an actionable profile.

Return JSON:
{
  "summary": "2-3 sentence overview of who this entity is and what they do in the defense/government space",
  "trajectory": "1-2 sentence assessment of their recent direction, momentum, or strategic shifts. Null if insufficient data.",
  "relevanceScore": 0-100 integer indicating how relevant this entity is to a mid-tier GovCon firm focused on DevSecOps, cloud, and data analytics for DoD/IC,
  "insights": [
    {
      "type": "competitor_assessment" | "stakeholder_briefing" | "agency_landscape" | "opportunity_alert",
      "content": "Actionable insight paragraph"
    }
  ]
}

Insight types:
- "competitor_assessment": This entity competes with or could compete with Amplify Federal
- "stakeholder_briefing": This entity is a potential customer, partner, or decision-maker worth engaging
- "agency_landscape": This entity is a government agency whose priorities or structure are shifting
- "opportunity_alert": Recent observations suggest an actionable business opportunity

Generate 0-3 insights. Only generate insights where there is genuine signal — do not fabricate.
relevanceScore guidance: 0 = irrelevant, 25 = tangential, 50 = moderately relevant, 75 = highly relevant, 100 = critical

Return ONLY valid JSON. No markdown fences, no commentary.`;

export function parseSynthesisResponse(raw: string): SynthesisOutput {
	if (!raw) {
		return { summary: "", trajectory: null, relevanceScore: 0, insights: [] };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		try {
			parsed = JSON.parse(jsonrepair(raw));
		} catch {
			return { summary: "", trajectory: null, relevanceScore: 0, insights: [] };
		}
	}

	if (typeof parsed !== "object" || parsed === null) {
		return { summary: "", trajectory: null, relevanceScore: 0, insights: [] };
	}

	const obj = parsed as Record<string, unknown>;

	const summary = typeof obj.summary === "string" ? obj.summary : "";
	const trajectory = typeof obj.trajectory === "string" ? obj.trajectory : null;

	let relevanceScore = typeof obj.relevanceScore === "number" ? obj.relevanceScore : 0;
	relevanceScore = Math.max(0, Math.min(100, Math.round(relevanceScore)));

	const validTypes: ReadonlySet<string> = new Set(InsightTypeEnum.options);
	const insights: SynthesisInsight[] = [];

	if (Array.isArray(obj.insights)) {
		for (const item of obj.insights) {
			if (typeof item !== "object" || item === null) continue;
			const i = item as Record<string, unknown>;
			if (
				typeof i.type === "string" &&
				validTypes.has(i.type) &&
				typeof i.content === "string"
			) {
				insights.push({
					type: i.type as InsightType,
					content: i.content,
				});
			}
		}
	}

	return { summary, trajectory, relevanceScore, insights };
}

export class ProfileSynthesizer implements ProfileSynthesisService {
	private client: OpenAI;
	private model: string;

	constructor(env: Env) {
		this.client = new OpenAI({
			apiKey: env.CF_AIG_TOKEN,
			baseURL: env.CF_AIG_BASEURL,
		});
		this.model = env.CF_AIG_MODEL;
	}

	async synthesize(context: string): Promise<SynthesisOutput> {
		const response = await this.client.chat.completions.create({
			model: `workers-ai/${this.model}`,
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: context },
			],
		});

		const raw = response.choices[0]?.message?.content ?? "";
		return parseSynthesisResponse(raw);
	}
}
