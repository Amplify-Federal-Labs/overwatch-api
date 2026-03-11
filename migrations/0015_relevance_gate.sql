-- Add early relevance scoring columns to ingested_items (ADR-004)
ALTER TABLE ingested_items ADD COLUMN relevance_score INTEGER;
ALTER TABLE ingested_items ADD COLUMN relevance_rationale TEXT;
ALTER TABLE ingested_items ADD COLUMN competency_codes TEXT;
