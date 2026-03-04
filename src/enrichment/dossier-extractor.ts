import OpenAI from "openai";
import type { EntityType } from "../schemas";

export interface DossierExtractionInput {
	entityName: string;
	entityType: EntityType;
	pageContents: { url: string; text: string }[];
	signalContext: string;
}

export interface DossierExtractionResult {
	name: string;
	title: string;
	org: string;
	branch: string;
	programs: string[];
	focusAreas: string[];
	rank: string | null;
	education: string[];
	careerHistory: { role: string; org: string; years: string }[];
	confidence: "high" | "medium" | "low";
}

const SYSTEM_PROMPT = `You are a defense intelligence analyst building stakeholder dossiers from publicly available information.
Given page contents from web searches about a person or agency, extract structured information.

Return a JSON object with these fields:
{
  "name": "full name or official agency name",
  "title": "current job title or role",
  "org": "parent organization",
  "branch": "military branch or department (e.g. Air Force, Navy, Army, DISA, CDAO)",
  "programs": ["program names they are associated with"],
  "focusAreas": ["technology or mission focus areas"],
  "rank": "military rank if applicable, or null",
  "education": ["degree and institution"],
  "careerHistory": [{"role": "title", "org": "organization", "years": "year range"}],
  "confidence": "high" | "medium" | "low"
}

Confidence levels:
- "high": found official biography or multiple corroborating sources
- "medium": found some information but gaps remain
- "low": minimal information found

For fields you cannot determine from the provided content, use empty strings, empty arrays, or null as appropriate.
Return ONLY valid JSON. No markdown fences, no commentary.`;

export class DossierExtractor {
	private client: OpenAI;
	private model: string;

	constructor(env: Env) {
		this.client = new OpenAI({
			apiKey: env.CF_AIG_TOKEN,
			baseURL: env.CF_AIG_BASEURL,
		});
		this.model = env.CF_AIG_MODEL;
	}

	async extract(input: DossierExtractionInput): Promise<DossierExtractionResult> {
		const pageSection = input.pageContents
			.map((p) => `--- Source: ${p.url} ---\n${p.text}`)
			.join("\n\n");

		const userMessage = `Entity: ${input.entityName} (${input.entityType})
Signal context: ${input.signalContext}

Page contents:
${pageSection}`;

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

	private parseResponse(raw: string): DossierExtractionResult {
		const cleaned = this.stripMarkdownFences(raw);
		const parsed = JSON.parse(cleaned) as Record<string, unknown>;
		return this.validateResult(parsed);
	}

	private stripMarkdownFences(text: string): string {
		const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
		const match = fencePattern.exec(text.trim());
		return match ? match[1] : text;
	}

	private validateResult(obj: Record<string, unknown>): DossierExtractionResult {
		const validConfidence = ["high", "medium", "low"] as const;
		type Confidence = typeof validConfidence[number];

		return {
			name: typeof obj.name === "string" ? obj.name : "",
			title: typeof obj.title === "string" ? obj.title : "",
			org: typeof obj.org === "string" ? obj.org : "",
			branch: typeof obj.branch === "string" ? obj.branch : "",
			programs: this.toStringArray(obj.programs),
			focusAreas: this.toStringArray(obj.focusAreas),
			rank: typeof obj.rank === "string" ? obj.rank : null,
			education: this.toStringArray(obj.education),
			careerHistory: this.toCareerHistory(obj.careerHistory),
			confidence: validConfidence.includes(obj.confidence as Confidence)
				? (obj.confidence as Confidence)
				: "low",
		};
	}

	private toStringArray(value: unknown): string[] {
		return Array.isArray(value)
			? value.filter((v): v is string => typeof v === "string")
			: [];
	}

	private toCareerHistory(value: unknown): { role: string; org: string; years: string }[] {
		if (!Array.isArray(value)) return [];
		return value
			.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
			.map((v) => ({
				role: typeof v.role === "string" ? v.role : "",
				org: typeof v.org === "string" ? v.org : "",
				years: typeof v.years === "string" ? v.years : "",
			}));
	}
}
