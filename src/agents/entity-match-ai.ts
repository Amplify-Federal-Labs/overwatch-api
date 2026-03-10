import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";
import type { EntityMatchResult } from "./entity-resolver";

const CONFIDENCE_THRESHOLD = 0.7;

const SYSTEM_PROMPT = `You are an entity resolution system. Given an entity name, its type, and a list of candidate entities, determine if any candidate is the same real-world entity.

Candidates are formatted as "id:name".

Return JSON:
{
  "matchedId": "the id of the matching candidate, or \"none\" if no match",
  "confidence": 0.0 to 1.0
}

General match criteria:
- Abbreviations and full names of the same entity match (e.g., "BAH" = "Booz Allen Hamilton")
- Minor spelling variations match (e.g., "Booz Allen" = "Booz Allen Hamilton")
- Different entities with similar names do NOT match (e.g., "NIWC Pacific" ≠ "NIWC Atlantic")

Person-specific rules (STRICT):
- Last names MUST match for two people to be the same person
- Different last names = different people, even if first names are similar (e.g., "Brooke Anderson" ≠ "Brooke Socolofsky")
- Rank/title changes are OK (e.g., "2nd Lt Smith" = "1st Lt Smith" = "Capt Smith")
- First name variations are OK if last name matches (e.g., "Bob Smith" = "Robert Smith")
- Maiden/married name changes cannot be inferred without evidence — treat as different people

Return ONLY valid JSON. No markdown fences, no commentary.`;

export function parseAiMatchResponse(raw: string, candidates: string[]): EntityMatchResult {
	if (!raw) {
		return { match: null };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		try {
			parsed = JSON.parse(jsonrepair(raw));
		} catch {
			return { match: null };
		}
	}

	if (typeof parsed !== "object" || parsed === null) {
		return { match: null };
	}

	const obj = parsed as Record<string, unknown>;
	const matchedId = typeof obj.matchedId === "string" ? obj.matchedId : null;
	const confidence = typeof obj.confidence === "number" ? obj.confidence : 0;

	if (!matchedId || matchedId === "none" || confidence < CONFIDENCE_THRESHOLD) {
		return { match: null };
	}

	// Validate that matchedId is actually one of the candidates
	const validIds = new Set(candidates.map((c) => c.split(":")[0]));
	if (!validIds.has(matchedId)) {
		return { match: null };
	}

	return { match: matchedId, confidence };
}

export function createAiMatchFn(env: Env) {
	const client = new OpenAI({
		apiKey: env.CF_AIG_TOKEN,
		baseURL: env.CF_AIG_BASEURL,
	});

	return async (name: string, candidates: string[], entityType: string): Promise<EntityMatchResult> => {
		const userMessage = `Entity type: ${entityType}\nEntity name: "${name}"\n\nCandidates:\n${candidates.map((c) => `- ${c}`).join("\n")}`;

		const response = await client.chat.completions.create({
			model: `workers-ai/${env.CF_AIG_MODEL}`,
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: userMessage },
			],
		});

		const raw = response.choices[0]?.message?.content ?? "";
		return parseAiMatchResponse(raw, candidates);
	};
}
