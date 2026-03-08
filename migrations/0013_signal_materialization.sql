-- ADR-002: Signal Materialization
-- Rename raw "signals" to "ingested_items", create materialized "signals" table

-- Step 1: Rename signals → ingested_items
ALTER TABLE signals RENAME TO ingested_items;

-- Step 2: Update observations FK column reference (SQLite doesn't rename FK targets,
-- but the column name stays signal_id pointing to ingested_items.id — this still works)

-- Step 3: Create new materialized signals table
CREATE TABLE signals (
  id TEXT PRIMARY KEY NOT NULL,
  ingested_item_id TEXT NOT NULL REFERENCES ingested_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  date TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  relevance INTEGER NOT NULL DEFAULT 0,
  relevance_rationale TEXT NOT NULL DEFAULT '',
  tags TEXT,
  competencies TEXT,
  play TEXT DEFAULT '',
  competitors TEXT,
  vendors TEXT,
  stakeholder_ids TEXT,
  entities TEXT,
  source_url TEXT DEFAULT '',
  source_metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_signals_branch ON signals(branch);
CREATE INDEX idx_signals_type ON signals(type);
CREATE INDEX idx_signals_relevance ON signals(relevance DESC);
CREATE INDEX idx_signals_date ON signals(date DESC);
CREATE INDEX idx_signals_ingested_item_id ON signals(ingested_item_id);
