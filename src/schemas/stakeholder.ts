import { z } from "zod";

export const RelationshipStageEnum = z.enum([
	"unknown",
	"aware",
	"met",
	"engaged",
	"trusted",
]);
export type RelationshipStage = z.infer<typeof RelationshipStageEnum>;

export const ContactInfoSchema = z.object({
	email: z.string(),
	phone: z.string(),
	address: z.string(),
});
export type ContactInfo = z.infer<typeof ContactInfoSchema>;

export const SocialProfileSchema = z.object({
	active: z.boolean(),
	recentTopics: z.array(z.string()),
	lastPost: z.string().optional(),
	followers: z.number().optional(),
});
export type SocialProfile = z.infer<typeof SocialProfileSchema>;

export const StakeholderEventSchema = z.object({
	name: z.string(),
	date: z.string(),
	location: z.string(),
	role: z.string(),
	topic: z.string().nullable(),
	confirmed: z.boolean(),
});
export type StakeholderEvent = z.infer<typeof StakeholderEventSchema>;

export const PastEventSchema = z.object({
	name: z.string(),
	date: z.string(),
	topic: z.string(),
});
export type PastEvent = z.infer<typeof PastEventSchema>;

export const AwardSchema = z.object({
	title: z.string(),
	prime: z.string(),
	value: z.string(),
	year: z.number(),
});
export type Award = z.infer<typeof AwardSchema>;

export const ProximitySchema = z.object({
	mutualContacts: z.array(z.string()),
	sharedEvents: z.number(),
	amplifyHistory: z.string(),
	warmIntro: z.string(),
});
export type Proximity = z.infer<typeof ProximitySchema>;

export const CareerAssignmentSchema = z.object({
	role: z.string(),
	org: z.string(),
	years: z.string(),
});
export type CareerAssignment = z.infer<typeof CareerAssignmentSchema>;

export const MilitaryBioSchema = z.object({
	rank: z.string(),
	rankAbbrev: z.string(),
	branch: z.string(),
	commissionYear: z.number(),
	education: z.array(z.string()),
	careerHistory: z.array(CareerAssignmentSchema),
	focusAreas: z.array(z.string()),
	decorations: z.array(z.string()),
	bioSourceUrl: z.string(),
	bioRetrievedDate: z.string(),
});
export type MilitaryBio = z.infer<typeof MilitaryBioSchema>;

export const StakeholderSchema = z.object({
	id: z.string(),
	name: z.string(),
	title: z.string(),
	org: z.string(),
	branch: z.string(),
	stage: RelationshipStageEnum,
	confidence: z.enum(["high", "medium", "low"]),
	contact: ContactInfoSchema,
	programs: z.array(z.string()),
	awards: z.array(AwardSchema),
	social: z.object({
		linkedin: SocialProfileSchema.nullable(),
		twitter: SocialProfileSchema.nullable(),
	}),
	events: z.array(StakeholderEventSchema),
	pastEvents: z.array(PastEventSchema),
	proximity: ProximitySchema,
	signals: z.array(z.string()),
	notes: z.string(),
	militaryBio: MilitaryBioSchema.optional(),
});
export type Stakeholder = z.infer<typeof StakeholderSchema>;
