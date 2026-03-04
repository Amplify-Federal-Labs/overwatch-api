import { z } from "zod";

export const EmailDraftStatusEnum = z.enum([
	"draft",
	"accepted",
	"rejected",
	"sent",
]);
export type EmailDraftStatus = z.infer<typeof EmailDraftStatusEnum>;

export const EmailDraftContextSchema = z.object({
	stakeholderName: z.string(),
	stakeholderTitle: z.string(),
	stakeholderOrg: z.string(),
	signalTitle: z.string(),
	referencedInteractions: z.array(z.string()),
	playId: z.string().nullable(),
});
export type EmailDraftContext = z.infer<typeof EmailDraftContextSchema>;

export const EmailDraftSchema = z.object({
	id: z.string(),
	stakeholderId: z.string(),
	signalId: z.string(),
	subject: z.string(),
	body: z.string(),
	status: EmailDraftStatusEnum,
	context: EmailDraftContextSchema,
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type EmailDraft = z.infer<typeof EmailDraftSchema>;
