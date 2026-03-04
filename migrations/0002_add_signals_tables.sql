CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    branch TEXT NOT NULL,
    source TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_url TEXT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    type TEXT NOT NULL,
    relevance INTEGER NOT NULL,
    play TEXT,
    starred INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '[]',
    competencies TEXT NOT NULL DEFAULT '[]',
    stakeholder_ids TEXT NOT NULL DEFAULT '[]',
    competitors TEXT NOT NULL DEFAULT '[]',
    vendors TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signal_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    signal_id TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    confidence REAL NOT NULL
);

CREATE INDEX idx_signal_entities_signal_id ON signal_entities(signal_id);
