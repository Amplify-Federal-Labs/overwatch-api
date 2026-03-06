-- ADR-001: Evidence-Based Intelligence - Clean break migration
-- Drops all old tables and creates new schema

-- Drop old tables (reverse dependency order)
DROP TABLE IF EXISTS competitor_activities;
DROP TABLE IF EXISTS competitors;
DROP TABLE IF EXISTS stakeholders;
DROP TABLE IF EXISTS discovered_entities;
DROP TABLE IF EXISTS signal_entities;
DROP TABLE IF EXISTS signals;
DROP TABLE IF EXISTS tasks;

-- Signals: simplified, just raw content + source metadata
CREATE TABLE signals (
  id TEXT PRIMARY KEY NOT NULL,
  source_type TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT,
  source_link TEXT UNIQUE,
  content TEXT NOT NULL,
  source_metadata TEXT,
  created_at TEXT NOT NULL
);

-- Observations: typed facts extracted from signals
CREATE TABLE observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  signal_id TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  attributes TEXT,
  source_date TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_observations_signal_id ON observations(signal_id);
CREATE INDEX idx_observations_type ON observations(type);

-- Observation entities: raw entity mentions (unresolved)
CREATE TABLE observation_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  observation_id INTEGER NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  raw_name TEXT NOT NULL,
  entity_profile_id TEXT REFERENCES entity_profiles(id),
  resolved_at TEXT
);

CREATE INDEX idx_observation_entities_observation_id ON observation_entities(observation_id);
CREATE INDEX idx_observation_entities_entity_profile_id ON observation_entities(entity_profile_id);
CREATE INDEX idx_observation_entities_unresolved ON observation_entities(entity_profile_id) WHERE entity_profile_id IS NULL;

-- Entity profiles: canonical long-lived entities
CREATE TABLE entity_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  trajectory TEXT,
  relevance_score INTEGER,
  last_synthesized_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_entity_profiles_type ON entity_profiles(type);
CREATE INDEX idx_entity_profiles_relevance ON entity_profiles(relevance_score);

-- Entity aliases: for batch name resolution
CREATE TABLE entity_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  entity_profile_id TEXT NOT NULL REFERENCES entity_profiles(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'auto',
  created_at TEXT NOT NULL,
  UNIQUE(entity_profile_id, alias)
);

CREATE INDEX idx_entity_aliases_alias ON entity_aliases(alias);

-- Entity relationships: edges between entities
CREATE TABLE entity_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_entity_id TEXT NOT NULL REFERENCES entity_profiles(id) ON DELETE CASCADE,
  target_entity_id TEXT NOT NULL REFERENCES entity_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(source_entity_id, target_entity_id, type)
);

CREATE INDEX idx_entity_relationships_source ON entity_relationships(source_entity_id);
CREATE INDEX idx_entity_relationships_target ON entity_relationships(target_entity_id);

-- Insights: synthesis outputs (historical)
CREATE TABLE insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  entity_profile_id TEXT NOT NULL REFERENCES entity_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  observation_window TEXT NOT NULL,
  observation_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_insights_entity_profile_id ON insights(entity_profile_id);
