ALTER TABLE signals ADD COLUMN source_link TEXT;
DROP INDEX idx_signals_source_url;
CREATE UNIQUE INDEX idx_signals_source_link ON signals(source_link);