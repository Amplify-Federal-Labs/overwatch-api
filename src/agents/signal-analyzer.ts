import OpenAI from "openai";
import type { SignalAnalysisInput, SignalAnalysisResult } from "../schemas";

const SYSTEM_PROMPT = `You are an intelligence analyst for Amplify Federal, a ~20-person SDVOSB defense consulting firm.
Analyze the provided content and return a JSON object with the following structure:

{
  "title": "concise signal title (under 80 chars)",
  "summary": "2-3 sentence summary of why this matters to a defense contractor",
  "type": "opportunity" | "strategy" | "competitor",
  "branch": "Army" | "Navy" | "Air Force" | "Marines" | "DISA" | "CDAO" | "DIU" | "Other",
  "tags": ["keyword1", "keyword2"],
  "competencies": ["A" and/or "B" and/or "C" and/or "D" and/or "E" and/or "F"],
  "play": "modernization" | "navigator" | "softwarefactory" | "jumpfence" | "classifiedai" | null,
  "relevance": 0-100,
  "entities": [{ "type": "person"|"agency"|"program"|"company"|"technology"|"contract_vehicle", "value": "...", "confidence": 0.0-1.0 }]
}

Signal types:
- "opportunity": RFIs, sources sought, RFPs, task orders, OTA announcements
- "strategy": DoD CIO memos, CDAO updates, STIG changes, budget signals, policy
- "competitor": Contract wins, hiring surges, partnerships by competitors

Amplify's competency clusters:
- A: Software Factory Stand-Up & Delivery (DevSecOps, Kubernetes, CI/CD, XP coaching)
- B: Classified Platform Engineering IL5/IL6 (STIG, RBAC, MLOps, platform hardening)
- C: Mission-Critical Modernization (cloud migration, K8s replatforming, ATO)
- D: Enterprise IT Operations (hybrid cloud, storage, VMware, DR)
- E: Enterprise Data Engineering & AI (Databricks, ETL, Advana, CJADC2)
- F: ISR/GEOINT/Distributed Systems (CEPH, Solr, TS/SCI DevSecOps)

Outreach plays (pick the best match or null):
- "modernization": Air Force, 645th, platform migration
- "navigator": App portfolio rationalization
- "softwarefactory": Government software factory language
- "jumpfence": Implementation blockers
- "classifiedai": IL5, IL6, MLOps, APFIT

Relevance scoring (0-100): Score based on alignment with Amplify's competencies, contract size/visibility, and strategic importance. 90+ = strong direct match, 75-89 = relevant, below 75 = tangential.

Return ONLY valid JSON. No markdown fences, no commentary.`;

export class SignalAnalyzer {
	private client: OpenAI;
	private model: string;

	constructor(env: Env) {
		this.client = new OpenAI({
			apiKey: env.CF_AIG_TOKEN,
			baseURL: env.CF_AIG_BASEURL
		});
		this.model = env.CF_AIG_MODEL;
	}

	async analyze(input: SignalAnalysisInput): Promise<SignalAnalysisResult> {
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

	private parseResponse(raw: string): SignalAnalysisResult {
		const cleaned = this.stripMarkdownFences(raw);
		const parsed: unknown = JSON.parse(cleaned);
		return this.validateResult(parsed);
	}

	private stripMarkdownFences(text: string): string {
		const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
		const match = fencePattern.exec(text.trim());
		return match ? match[1] : text;
	}

	private validateResult(parsed: unknown): SignalAnalysisResult {
		if (typeof parsed !== "object" || parsed === null) {
			throw new Error("Response is not an object");
		}

		const obj = parsed as Record<string, unknown>;

		const validTypes = ["opportunity", "strategy", "competitor"] as const;
		const validCompetencies = ["A", "B", "C", "D", "E", "F"] as const;
		const validPlays = ["modernization", "navigator", "softwarefactory", "jumpfence", "classifiedai"] as const;
		const validEntityTypes = ["person", "agency", "program", "company", "technology", "contract_vehicle"] as const;

		const type = validTypes.includes(obj.type as typeof validTypes[number])
			? (obj.type as typeof validTypes[number])
			: "strategy";

		const competencies = Array.isArray(obj.competencies)
			? obj.competencies.filter((c): c is typeof validCompetencies[number] =>
				validCompetencies.includes(c as typeof validCompetencies[number]))
			: [];

		const play = validPlays.includes(obj.play as typeof validPlays[number])
			? (obj.play as typeof validPlays[number])
			: null;

		const rawRelevance = typeof obj.relevance === "number" ? obj.relevance : 50;
		const relevance = Math.max(0, Math.min(100, Math.round(rawRelevance)));

		const entities = Array.isArray(obj.entities)
			? obj.entities
				.filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
				.filter((e) => validEntityTypes.includes(e.type as typeof validEntityTypes[number]))
				.map((e) => ({
					type: e.type as typeof validEntityTypes[number],
					value: typeof e.value === "string" ? e.value : String(e.value),
					confidence: typeof e.confidence === "number"
						? Math.max(0, Math.min(1, e.confidence))
						: 0.5,
				}))
			: [];

		return {
			title: typeof obj.title === "string" ? obj.title : "Untitled Signal",
			summary: typeof obj.summary === "string" ? obj.summary : "",
			type,
			branch: typeof obj.branch === "string" ? obj.branch : "Other",
			tags: Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === "string") : [],
			competencies,
			play,
			relevance,
			entities,
		};
	}
}
