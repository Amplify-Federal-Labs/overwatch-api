import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import type { SourceMetadata } from "../schemas";

export const signals = sqliteTable("signals", {
	id: text("id").primaryKey().notNull(),
	date: text("date").notNull(),
	branch: text("branch").notNull(),
	source: text("source").notNull(),
	sourceType: text("source_type").notNull(),
	sourceUrl: text("source_url"),
	sourceLink: text("source_link"),
	title: text("title").notNull(),
	summary: text("summary").notNull(),
	type: text("type").notNull(),
	relevance: integer("relevance").notNull(),
	play: text("play"),
	starred: integer("starred", { mode: "boolean" }).notNull().default(false),
	tags: text("tags", { mode: "json" }).notNull().$type<string[]>().default([]),
	competencies: text("competencies", { mode: "json" }).notNull().$type<string[]>().default([]),
	stakeholderIds: text("stakeholder_ids", { mode: "json" }).notNull().$type<string[]>().default([]),
	competitors: text("competitors", { mode: "json" }).notNull().$type<string[]>().default([]),
	vendors: text("vendors", { mode: "json" }).notNull().$type<string[]>().default([]),
	sourceMetadata: text("source_metadata", { mode: "json" }).$type<SourceMetadata>(),
	createdAt: text("created_at").notNull(),
});

export const signalEntities = sqliteTable("signal_entities", {
	id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
	signalId: text("signal_id").notNull().references(() => signals.id, { onDelete: "cascade" }),
	type: text("type").notNull(),
	value: text("value").notNull(),
	confidence: real("confidence").notNull(),
});

export const discoveredEntities = sqliteTable("discovered_entities", {
	id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
	signalId: text("signal_id").notNull().references(() => signals.id, { onDelete: "cascade" }),
	type: text("type").notNull(),
	value: text("value").notNull(),
	confidence: real("confidence").notNull(),
	signalRelevance: integer("signal_relevance").notNull(),
	status: text("status").notNull().default("pending"),
	createdAt: text("created_at").notNull(),
});

export const stakeholders = sqliteTable("stakeholders", {
	id: text("id").primaryKey().notNull(),
	type: text("type").notNull().default("person"),
	name: text("name").notNull(),
	title: text("title").notNull().default(""),
	org: text("org").notNull().default(""),
	branch: text("branch").notNull().default(""),
	stage: text("stage").notNull().default("unknown"),
	confidence: text("confidence").notNull().default("low"),
	programs: text("programs", { mode: "json" }).notNull().$type<string[]>().default([]),
	focusAreas: text("focus_areas", { mode: "json" }).notNull().$type<string[]>().default([]),
	rank: text("rank"),
	education: text("education", { mode: "json" }).notNull().$type<string[]>().default([]),
	careerHistory: text("career_history", { mode: "json" }).notNull().$type<{ role: string; org: string; years: string }[]>().default([]),
	bioSourceUrl: text("bio_source_url"),
	discoveredEntityId: integer("discovered_entity_id").references(() => discoveredEntities.id),
	signalIds: text("signal_ids", { mode: "json" }).notNull().$type<string[]>().default([]),
	createdAt: text("created_at").notNull(),
});
