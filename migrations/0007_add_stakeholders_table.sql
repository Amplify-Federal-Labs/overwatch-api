CREATE TABLE IF NOT EXISTS stakeholders (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  org TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'unknown',
  confidence TEXT NOT NULL DEFAULT 'low',
  programs TEXT NOT NULL DEFAULT '[]',
  focus_areas TEXT NOT NULL DEFAULT '[]',
  rank TEXT,
  education TEXT NOT NULL DEFAULT '[]',
  career_history TEXT NOT NULL DEFAULT '[]',
  bio_source_url TEXT,
  discovered_entity_id INTEGER REFERENCES discovered_entities(id),
  signal_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
