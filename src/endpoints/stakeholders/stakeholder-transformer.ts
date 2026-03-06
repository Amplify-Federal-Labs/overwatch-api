import type { Stakeholder, StakeholderType } from "../../schemas";

export interface EntityProfileWithDetails {
	id: string;
	type: string;
	canonicalName: string;
	observationCount: number;
	summary: string | null;
	trajectory: string | null;
	relevanceScore: number | null;
	signalIds: string[];
}

function confidenceFromObservationCount(count: number): "high" | "medium" | "low" {
	if (count >= 10) return "high";
	if (count >= 3) return "medium";
	return "low";
}

export function transformEntityToStakeholder(profile: EntityProfileWithDetails): Stakeholder {
	const stakeholderType: StakeholderType = profile.type === "person" ? "person" : "agency";

	return {
		id: profile.id,
		type: stakeholderType,
		name: profile.canonicalName,
		title: "",
		org: "",
		branch: "",
		stage: "unknown",
		confidence: confidenceFromObservationCount(profile.observationCount),
		contact: { email: "", phone: "", address: "" },
		programs: [],
		awards: [],
		social: { linkedin: null, twitter: null },
		events: [],
		pastEvents: [],
		proximity: {
			mutualContacts: [],
			sharedEvents: 0,
			amplifyHistory: "none",
			warmIntro: "none",
		},
		signals: profile.signalIds,
		notes: profile.summary ?? "",
	};
}
