-- Add dossier JSON column to entity_profiles for structured enrichment data
ALTER TABLE entity_profiles ADD COLUMN dossier TEXT;

-- Track enrichment status
ALTER TABLE entity_profiles ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE entity_profiles ADD COLUMN last_enriched_at TEXT;

CREATE INDEX idx_entity_profiles_enrichment_status ON entity_profiles(enrichment_status);
