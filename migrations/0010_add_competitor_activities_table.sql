CREATE TABLE competitor_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  competitor_id TEXT NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  signal_id TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  activity TEXT NOT NULL,
  date TEXT NOT NULL,
  threat TEXT NOT NULL DEFAULT 'low',
  area TEXT NOT NULL,
  created_at TEXT NOT NULL
);
