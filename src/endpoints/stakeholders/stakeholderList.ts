import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { StakeholderSchema } from "../../schemas";
import type { Stakeholder } from "../../schemas";
import { D1StakeholderRepository } from "../../db/stakeholder-repository";
import type { AppContext } from "../../types";

const RANK_PREFIXES = ["Col.", "CAPT", "BG", "LtCol.", "Maj.", "Gen.", "Lt.", "CDR", "LCDR", "LTC", "MAJ", "CPT", "Dr.", "Mr.", "Ms.", "Mrs."] as const;

function extractRankAbbrev(name: string): string {
	const firstWord = name.split(/\s+/)[0]?.replace(/,$/, "") ?? "";
	return RANK_PREFIXES.includes(firstWord as typeof RANK_PREFIXES[number]) ? firstWord : "";
}

export class StakeholderList extends OpenAPIRoute {
	schema = {
		tags: ["Stakeholders"],
		summary: "List all stakeholder dossiers",
		operationId: "stakeholder-list",
		responses: {
			"200": {
				description: "Array of stakeholder dossiers",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(StakeholderSchema),
				})),
			},
		},
	};

	async handle(c: AppContext) {
		const repo = new D1StakeholderRepository(c.env.DB);
		const rows = await repo.findAllRows();

		const stakeholders: Stakeholder[] = rows.map((row) => ({
			id: row.id,
			type: (row.type || "person") as Stakeholder["type"],
			name: row.name,
			title: row.title || "Unknown",
			org: row.org || "Unknown",
			branch: row.branch || "Other",
			stage: (row.stage || "unknown") as Stakeholder["stage"],
			confidence: (row.confidence || "low") as Stakeholder["confidence"],
			contact: { email: "", phone: "", address: "" },
			programs: row.programs,
			awards: [],
			social: {
				linkedin: { active: false, recentTopics: [] },
				twitter: { active: false, recentTopics: [] },
			},
			events: [],
			pastEvents: [],
			proximity: {
				mutualContacts: [],
				sharedEvents: 0,
				amplifyHistory: "None — no prior interaction",
				warmIntro: "No clear path identified",
			},
			signals: row.signalIds,
			notes: "",
			militaryBio: row.rank ? {
				rank: row.rank,
				rankAbbrev: extractRankAbbrev(row.name),
				branch: row.branch ? `U.S. ${row.branch}` : "Unknown",
				commissionYear: 0,
				education: row.education,
				careerHistory: row.careerHistory,
				focusAreas: row.focusAreas,
				decorations: [],
				bioSourceUrl: row.bioSourceUrl ?? "",
				bioRetrievedDate: row.createdAt,
			} : undefined,
		}));

		return { success: true, result: stakeholders };
	}
}
