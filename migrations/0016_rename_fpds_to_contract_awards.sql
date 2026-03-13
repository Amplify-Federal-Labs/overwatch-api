-- Rename source_type 'fpds' to 'contract_awards' in ingested_items and signals tables
-- Part of FPDS → SAM.gov Contract Awards API migration

UPDATE ingested_items
SET source_type = 'contract_awards'
WHERE source_type = 'fpds';

UPDATE ingested_items
SET source_metadata = REPLACE(source_metadata, '"sourceType":"fpds"', '"sourceType":"contract_awards"')
WHERE source_metadata LIKE '%"sourceType":"fpds"%';

UPDATE signals
SET source_metadata = REPLACE(source_metadata, '"sourceType":"fpds"', '"sourceType":"contract_awards"')
WHERE source_metadata LIKE '%"sourceType":"fpds"%';
