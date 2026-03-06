import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

// Signals: simplified, just raw content + source metadata
export const signals = sqliteTable("signals", {
	id: text("id").primaryKey().notNull(),
	sourceType: text("source_type").notNull(),
	sourceName: text("source_name").notNull(),
	sourceUrl: text("source_url"),
	sourceLink: text("source_link").unique(),
	content: text("content").notNull(),
	sourceMetadata: text("source_metadata", { mode: "json" }).$type<Record<string, string>>(),
	createdAt: text("created_at").notNull(),
});

// Observations: typed facts extracted from signals
export const observations = sqliteTable("observations", {
	id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
	signalId: text("signal_id").notNull().references(() => signals.id, { onDelete: "cascade" }),
	type: text("type").notNull(),
	summary: text("summary").notNull(),
	attributes: text("attributes", { mode: "json" }).$type<Record<string, string>>(),
	sourceDate: text("source_date"),
	createdAt: text("created_at").notNull(),
});

// Observation entities: raw entity mentions (unresolved)
export const observationEntities = sqliteTable("observation_entities", {
	id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
	observationId: integer("observation_id").notNull().references(() => observations.id, { onDelete: "cascade" }),
	role: text("role").notNull(),
	entityType: text("entity_type").notNull(),
	rawName: text("raw_name").notNull(),
	entityProfileId: text("entity_profile_id").references(() => entityProfiles.id),
	resolvedAt: text("resolved_at"),
});

// Entity profiles: canonical long-lived entities
export const entityProfiles = sqliteTable("entity_profiles", {
	id: text("id").primaryKey().notNull(),
	type: text("type").notNull(),
	canonicalName: text("canonical_name").notNull(),
	firstSeenAt: text("first_seen_at").notNull(),
	lastSeenAt: text("last_seen_at").notNull(),
	observationCount: integer("observation_count").notNull().default(0),
	summary: text("summary"),
	trajectory: text("trajectory"),
	relevanceScore: integer("relevance_score"),
	lastSynthesizedAt: text("last_synthesized_at"),
	createdAt: text("created_at").notNull(),
});

// Entity aliases: for batch name resolution
export const entityAliases = sqliteTable("entity_aliases", {
	id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
	entityProfileId: text("entity_profile_id").notNull().references(() => entityProfiles.id, { onDelete: "cascade" }),
	alias: text("alias").notNull(),
	source: text("source").notNull().default("auto"),
	createdAt: text("created_at").notNull(),
}, (table) => [
	uniqueIndex("idx_entity_aliases_unique").on(table.entityProfileId, table.alias),
]);

// Entity relationships: edges between entities
export const entityRelationships = sqliteTable("entity_relationships", {
	id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
	sourceEntityId: text("source_entity_id").notNull().references(() => entityProfiles.id, { onDelete: "cascade" }),
	targetEntityId: text("target_entity_id").notNull().references(() => entityProfiles.id, { onDelete: "cascade" }),
	type: text("type").notNull(),
	observationCount: integer("observation_count").notNull().default(1),
	firstSeenAt: text("first_seen_at").notNull(),
	lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [
	uniqueIndex("idx_entity_relationships_unique").on(table.sourceEntityId, table.targetEntityId, table.type),
]);

// Insights: synthesis outputs (historical)
export const insights = sqliteTable("insights", {
	id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
	entityProfileId: text("entity_profile_id").notNull().references(() => entityProfiles.id, { onDelete: "cascade" }),
	type: text("type").notNull(),
	content: text("content").notNull(),
	observationWindow: text("observation_window").notNull(),
	observationCount: integer("observation_count").notNull(),
	createdAt: text("created_at").notNull(),
});
