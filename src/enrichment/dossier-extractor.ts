import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";
import type { Dossier, PersonDossier, AgencyDossier, CompanyDossier } from "../schemas";

const PERSON_PROMPT = `You are an intelligence analyst building a dossier on a government/defense person. Given web page text about this person, extract structured profile data.

Return JSON:
{
  "kind": "person",
  "title": "Current job title or role",
  "org": "Current organization",
  "branch": "Military branch or department (e.g., Army, Navy, Air Force, DoD, IC)",
  "programs": ["Program names they are associated with"],
  "rank": "Military rank if applicable, or omit",
  "education": ["Degree and school"],
  "careerHistory": [{"role": "Title", "org": "Organization", "years": "YYYY-YYYY"}],
  "focusAreas": ["Technology or mission areas they focus on"],
  "decorations": ["Awards or decorations"],
  "bioSourceUrl": "URL of the primary biography source if mentioned"
}

Extract ONLY what is explicitly stated. Use empty arrays for missing data. Do not fabricate.
Return ONLY valid JSON. No markdown fences, no commentary.`;

const AGENCY_PROMPT = `You are an intelligence analyst building a dossier on a government agency or military organization. Given web page text about this entity, extract structured profile data.

Return JSON:
{
  "kind": "agency",
  "mission": "One-sentence mission statement",
  "branch": "Parent branch (e.g., Army, Navy, Air Force, DoD, IC)",
  "programs": ["Major programs this agency runs"],
  "parentOrg": "Parent organization",
  "leadership": ["Names of key leaders"],
  "focusAreas": ["Technology or mission areas"]
}

Extract ONLY what is explicitly stated. Use empty arrays/strings for missing data. Do not fabricate.
Return ONLY valid JSON. No markdown fences, no commentary.`;

const COMPANY_PROMPT = `You are an intelligence analyst building a dossier on a defense/government contractor company. Given web page text about this company, extract structured profile data.

Return JSON:
{
  "kind": "company",
  "description": "One-sentence description of what the company does",
  "coreCapabilities": ["Key service areas or capabilities"],
  "keyContracts": ["Notable government contracts"],
  "keyCustomers": ["Government agencies they serve"],
  "leadership": ["Names and titles of key leaders"],
  "headquarters": "City, State"
}

Extract ONLY what is explicitly stated. Use empty arrays/strings for missing data. Do not fabricate.
Return ONLY valid JSON. No markdown fences, no commentary.`;

function stripMarkdownFences(text: string): string {
	const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
	const match = fencePattern.exec(text.trim());
	return match ? match[1] : text;
}

function parseJson(raw: string): unknown {
	const cleaned = stripMarkdownFences(raw);
	try {
		return JSON.parse(cleaned);
	} catch {
		return JSON.parse(jsonrepair(cleaned));
	}
}

function validatePersonDossier(obj: Record<string, unknown>): PersonDossier {
	return {
		kind: "person",
		title: typeof obj.title === "string" ? obj.title : "",
		org: typeof obj.org === "string" ? obj.org : "",
		branch: typeof obj.branch === "string" ? obj.branch : "",
		programs: Array.isArray(obj.programs) ? obj.programs.filter((p): p is string => typeof p === "string") : [],
		rank: typeof obj.rank === "string" ? obj.rank : undefined,
		education: Array.isArray(obj.education) ? obj.education.filter((e): e is string => typeof e === "string") : [],
		careerHistory: Array.isArray(obj.careerHistory)
			? obj.careerHistory
				.filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
				.map((c) => ({
					role: typeof c.role === "string" ? c.role : "",
					org: typeof c.org === "string" ? c.org : "",
					years: typeof c.years === "string" ? c.years : "",
				}))
			: [],
		focusAreas: Array.isArray(obj.focusAreas) ? obj.focusAreas.filter((f): f is string => typeof f === "string") : [],
		decorations: Array.isArray(obj.decorations) ? obj.decorations.filter((d): d is string => typeof d === "string") : [],
		bioSourceUrl: typeof obj.bioSourceUrl === "string" ? obj.bioSourceUrl : undefined,
	};
}

function validateAgencyDossier(obj: Record<string, unknown>): AgencyDossier {
	return {
		kind: "agency",
		mission: typeof obj.mission === "string" ? obj.mission : "",
		branch: typeof obj.branch === "string" ? obj.branch : "",
		programs: Array.isArray(obj.programs) ? obj.programs.filter((p): p is string => typeof p === "string") : [],
		parentOrg: typeof obj.parentOrg === "string" ? obj.parentOrg : "",
		leadership: Array.isArray(obj.leadership) ? obj.leadership.filter((l): l is string => typeof l === "string") : [],
		focusAreas: Array.isArray(obj.focusAreas) ? obj.focusAreas.filter((f): f is string => typeof f === "string") : [],
	};
}

function validateCompanyDossier(obj: Record<string, unknown>): CompanyDossier {
	return {
		kind: "company",
		description: typeof obj.description === "string" ? obj.description : "",
		coreCapabilities: Array.isArray(obj.coreCapabilities) ? obj.coreCapabilities.filter((c): c is string => typeof c === "string") : [],
		keyContracts: Array.isArray(obj.keyContracts) ? obj.keyContracts.filter((c): c is string => typeof c === "string") : [],
		keyCustomers: Array.isArray(obj.keyCustomers) ? obj.keyCustomers.filter((c): c is string => typeof c === "string") : [],
		leadership: Array.isArray(obj.leadership) ? obj.leadership.filter((l): l is string => typeof l === "string") : [],
		headquarters: typeof obj.headquarters === "string" ? obj.headquarters : "",
	};
}

export function parseDossierResponse(raw: string, entityType: string): Dossier | null {
	if (!raw) return null;

	let parsed: unknown;
	try {
		parsed = parseJson(raw);
	} catch {
		return null;
	}

	if (typeof parsed !== "object" || parsed === null) return null;
	const obj = parsed as Record<string, unknown>;

	// Map entityType to expected dossier kind
	const kindMap: Record<string, string> = { person: "person", agency: "agency", company: "company" };
	const expectedKind = kindMap[entityType] ?? entityType;

	// If AI didn't set kind, infer from entityType
	const kind = typeof obj.kind === "string" ? obj.kind : expectedKind;

	// Verify kind matches expected entityType
	if (kind !== expectedKind) return null;

	switch (kind) {
		case "person":
			return validatePersonDossier(obj);
		case "company":
			return validateCompanyDossier(obj);
		default:
			return validateAgencyDossier(obj);
	}
}

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

	async extract(entityName: string, entityType: string, pageTexts: string[]): Promise<Dossier | null> {
		if (pageTexts.length === 0) return null;

		const combinedText = pageTexts.join("\n\n---\n\n").slice(0, 8000);
		const promptMap: Record<string, string> = { person: PERSON_PROMPT, company: COMPANY_PROMPT };
		const systemPrompt = promptMap[entityType] ?? AGENCY_PROMPT;

		const response = await this.client.chat.completions.create({
			model: `workers-ai/${this.model}`,
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: systemPrompt },
				{
					role: "user",
					content: `Entity name: ${entityName}\nEntity type: ${entityType}\n\nSource text:\n---\n${combinedText}\n---`,
				},
			],
		});

		const raw = response.choices[0]?.message?.content ?? "";
		return parseDossierResponse(raw, entityType);
	}
}
