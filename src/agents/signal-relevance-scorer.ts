import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";
import { CompetencyCodeEnum, type CompetencyCode } from "../schemas";

export interface ObservationSummary {
	type: string;
	summary: string;
	entities: { type: string; name: string; role: string }[];
}

export interface EntityContextItem {
	name: string;
	type: string;
	summary: string | null;
}

export interface RelevanceInput {
	content: string;
	observations: ObservationSummary[];
	entityContext: EntityContextItem[];
}

export interface RelevanceResult {
	relevanceScore: number;
	rationale: string;
	competencyCodes: CompetencyCode[];
}

const VALID_COMPETENCY_CODES: ReadonlySet<string> = new Set(CompetencyCodeEnum.options);

const SYSTEM_PROMPT = `You are a strategic intelligence analyst for Amplify Federal, a mid-tier government contracting firm. Score how relevant a signal is to Amplify's business and identify which competency clusters it aligns with.

## Amplify Federal Profile
- **Core competencies**: DevSecOps, Cloud Migration (IL5/IL6), Cybersecurity/Zero Trust, Data Analytics/AI-ML, Software Factories, Platform Engineering
- **Target customers**: U.S. Army, Navy, Air Force, Marines, DISA, CDAO, DIU, Space Force, and their sub-agencies (NIWC, AFC, AFLCMC, PEO IEW&S, etc.)
- **Business model**: Prime and sub-contractor on DoD/IC programs
- **Competitors**: Booz Allen, SAIC, Leidos, Raytheon, Northrop, Palantir, ECS, ManTech, GDIT, Perspecta, Accenture Federal Services

## Competency Clusters
- **A**: Software Factory Stand-Up & Delivery — CI/CD pipelines, DevSecOps toolchains, Platform One, Big Bang, software factory stand-ups
- **B**: Classified Platform Engineering (IL5/IL6) — IL5/IL6 cloud environments, cATO, STIG compliance, classified workloads, GovCloud
- **C**: Mission-Critical Modernization — Legacy system modernization, application refactoring, technical debt reduction, migration to modern stacks
- **D**: Enterprise IT Operations — IT service management, network operations, helpdesk, endpoint management, infrastructure sustainment
- **E**: Enterprise Data Engineering & AI — Data platforms, ML/AI pipelines, analytics dashboards, Advana, data mesh, LLM integration
- **F**: ISR/GEOINT/Distributed Systems — ISR processing, GEOINT analysis, edge computing, distributed C2, tactical data links

## Scoring Criteria
- **80-100 (Critical)**: Direct opportunity in Amplify's competency areas at target agencies. Active RFPs/RFIs, contract awards to competitors in Amplify's space, upcoming recompetes Amplify could bid on.
- **60-79 (High)**: Relevant to Amplify's domain but not directly actionable yet. Budget signals, technology adoption mandates, personnel moves at target agencies, competitor partnerships in adjacent areas.
- **40-59 (Moderate)**: Tangentially related. Defense IT broadly, non-target agencies doing relevant work, industry trends affecting the market.
- **20-39 (Low)**: Loosely connected. General defense news, non-IT contracts at target agencies, broad policy changes.
- **0-19 (Irrelevant)**: No connection to Amplify's business. Non-defense, non-IT, civilian agencies outside scope.

Return JSON:
{
  "relevanceScore": 0-100 integer,
  "rationale": "1-2 sentence explanation of why this score, referencing specific Amplify competencies or target agencies",
  "competencyCodes": ["A", "B"] // array of codes (A-F) for matching competency clusters. Empty array if none match.
}

Return ONLY valid JSON. No markdown fences, no commentary.`;

export function parseRelevanceResponse(raw: string): RelevanceResult {
	if (!raw) {
		return { relevanceScore: 0, rationale: "", competencyCodes: [] };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		try {
			parsed = JSON.parse(jsonrepair(raw));
		} catch {
			return { relevanceScore: 0, rationale: "", competencyCodes: [] };
		}
	}

	if (typeof parsed !== "object" || parsed === null) {
		return { relevanceScore: 0, rationale: "", competencyCodes: [] };
	}

	const obj = parsed as Record<string, unknown>;

	let relevanceScore = typeof obj.relevanceScore === "number" ? obj.relevanceScore : 0;
	relevanceScore = Math.max(0, Math.min(100, Math.round(relevanceScore)));

	const rationale = typeof obj.rationale === "string" ? obj.rationale : "";

	const competencyCodes: CompetencyCode[] = [];
	if (Array.isArray(obj.competencyCodes)) {
		for (const code of obj.competencyCodes) {
			if (typeof code === "string" && VALID_COMPETENCY_CODES.has(code)) {
				competencyCodes.push(code as CompetencyCode);
			}
		}
	}

	return { relevanceScore, rationale, competencyCodes };
}

export function buildRelevanceContext(input: RelevanceInput): string {
	const parts: string[] = [];

	parts.push(`Signal content:\n---\n${input.content}\n---`);

	if (input.observations.length > 0) {
		parts.push("\nObservations:");
		for (const obs of input.observations) {
			const entityList = obs.entities
				.map((e) => `${e.name} (${e.type}, ${e.role})`)
				.join(", ");
			parts.push(`- [${obs.type}] ${obs.summary}`);
			if (entityList) {
				parts.push(`  Entities: ${entityList}`);
			}
		}
	}

	if (input.entityContext.length > 0) {
		parts.push("\nKnown entities:");
		for (const entity of input.entityContext) {
			const summaryPart = entity.summary ? `: ${entity.summary}` : "";
			parts.push(`- ${entity.name} (${entity.type})${summaryPart}`);
		}
	}

	return parts.join("\n");
}

export class SignalRelevanceScorer {
	private client: OpenAI;
	private model: string;

	constructor(env: Env) {
		this.client = new OpenAI({
			apiKey: env.CF_AIG_TOKEN,
			baseURL: env.CF_AIG_BASEURL,
		});
		this.model = env.CF_AIG_MODEL;
	}

	async score(input: RelevanceInput): Promise<RelevanceResult> {
		const context = buildRelevanceContext(input);

		const response = await this.client.chat.completions.create({
			model: `workers-ai/${this.model}`,
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: context },
			],
		});

		const raw = response.choices[0]?.message?.content ?? "";
		return parseRelevanceResponse(raw);
	}
}
