-- Rename stakeholder_ids (string[]) to stakeholders ({id,name}[]) in signals table
ALTER TABLE signals RENAME COLUMN stakeholder_ids TO stakeholders;
