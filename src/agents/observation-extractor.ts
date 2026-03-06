import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";
import type {
	SignalAnalysisInput,
	ObservationExtractionResult,
	ObservationExtraction,
	EntityRef,
} from "../schemas";
import {
	ObservationTypeEnum,
	EntityTypeEnum,
	EntityRoleEnum,
} from "../schemas";

const SYSTEM_PROMPT = `You are an intelligence analyst. Given content from a government or defense industry source, extract factual observations.

Each observation is a typed fact about something that happened or was announced. Extract one observation per distinct event.

Return a JSON object:
{
  "observations": [
    {
      "type": "contract_award" | "personnel_move" | "budget_signal" | "technology_adoption" | "solicitation" | "policy_change" | "partnership" | "program_milestone",
      "summary": "One-sentence factual description of what happened",
      "entities": [
        { "type": "person"|"agency"|"program"|"company"|"technology"|"contract_vehicle", "name": "exact name as mentioned", "role": "subject"|"object"|"mentioned" }
      ],
      "attributes": { "key": "value" },
      "sourceDate": "YYYY-MM-DD if known"
    }
  ]
}

Observation types:
- "contract_award": A company won/was awarded a contract from an agency
- "personnel_move": A person was hired, appointed, promoted, or departed
- "budget_signal": Budget allocation, funding increase/decrease for a program
- "technology_adoption": An org adopted, mandated, or deployed a technology
- "solicitation": An agency issued an RFP, RFI, sources sought, or task order
- "policy_change": A policy, memo, directive, or regulation was issued
- "partnership": Two organizations formed a team, JV, or partnership
- "program_milestone": A program reached a milestone (IOC, FOC, phase transition)

Entity roles:
- "subject": The primary actor (who did something)
- "object": The target or recipient (who it was done to/for)
- "mentioned": Referenced but not a primary actor

Attributes: Include structured details like dollar amounts, contract numbers, solicitation IDs, NAICS codes, dates, locations. Use string values only.

Extract ONLY what is explicitly stated in the content. Do not infer or speculate.
If the content contains no actionable observations, return {"observations": []}.

Return ONLY valid JSON. No markdown fences, no commentary.`;

export class ObservationExtractor {
	private client: OpenAI;
	private model: string;

	constructor(env: Env) {
		this.client = new OpenAI({
			apiKey: env.CF_AIG_TOKEN,
			baseURL: env.CF_AIG_BASEURL,
		});
		this.model = env.CF_AIG_MODEL;
	}

	async extract(input: SignalAnalysisInput): Promise<ObservationExtractionResult> {
		const userMessage = `Source: ${input.sourceName} (${input.sourceType})${input.sourceUrl ? `\nURL: ${input.sourceUrl}` : ""}

Content:
---
${input.content}
---`;

		const response = await this.client.chat.completions.create({
			model: `workers-ai/${this.model}`,
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: userMessage },
			],
		});

		const raw = response.choices[0]?.message?.content;
		if (!raw) {
			throw new Error("Empty response from Worker AI");
		}

		return this.parseResponse(raw);
	}

	private parseResponse(raw: string): ObservationExtractionResult {
		const cleaned = this.stripMarkdownFences(raw);
		let parsed: unknown;
		try {
			parsed = JSON.parse(cleaned);
		} catch {
			parsed = JSON.parse(jsonrepair(cleaned));
		}
		return this.validateResult(parsed);
	}

	private stripMarkdownFences(text: string): string {
		const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
		const match = fencePattern.exec(text.trim());
		return match ? match[1] : text;
	}

	private validateResult(parsed: unknown): ObservationExtractionResult {
		if (typeof parsed !== "object" || parsed === null) {
			return { observations: [] };
		}

		const obj = parsed as Record<string, unknown>;
		const rawObservations = Array.isArray(obj.observations) ? obj.observations : [];

		const validTypes: ReadonlySet<string> = new Set(ObservationTypeEnum.options);
		const validEntityTypes: ReadonlySet<string> = new Set(EntityTypeEnum.options);
		const validRoles: ReadonlySet<string> = new Set(EntityRoleEnum.options);

		const observations: ObservationExtraction[] = [];

		for (const raw of rawObservations) {
			if (typeof raw !== "object" || raw === null) continue;
			const obs = raw as Record<string, unknown>;

			if (typeof obs.type !== "string" || !validTypes.has(obs.type)) continue;

			const entities: EntityRef[] = [];
			if (Array.isArray(obs.entities)) {
				for (const e of obs.entities) {
					if (typeof e !== "object" || e === null) continue;
					const ent = e as Record<string, unknown>;
					if (
						typeof ent.type === "string" &&
						validEntityTypes.has(ent.type) &&
						typeof ent.name === "string" &&
						typeof ent.role === "string" &&
						validRoles.has(ent.role)
					) {
						entities.push({
							type: ent.type as EntityRef["type"],
							name: ent.name,
							role: ent.role as EntityRef["role"],
						});
					}
				}
			}

			const attributes: Record<string, string> = {};
			if (typeof obs.attributes === "object" && obs.attributes !== null) {
				for (const [k, v] of Object.entries(obs.attributes as Record<string, unknown>)) {
					if (typeof v === "string") {
						attributes[k] = v;
					} else if (v !== null && v !== undefined) {
						attributes[k] = String(v);
					}
				}
			}

			observations.push({
				type: obs.type as ObservationExtraction["type"],
				summary: typeof obs.summary === "string" ? obs.summary : "",
				entities,
				attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
				sourceDate: typeof obs.sourceDate === "string" ? obs.sourceDate : undefined,
			});
		}

		return { observations };
	}
}
