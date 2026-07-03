ALTER TABLE assets ADD COLUMN permanent_delete_error TEXT;
ALTER TABLE assets ADD COLUMN permanent_delete_batch_id TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_permanent_delete_batch_id ON assets(permanent_delete_batch_id);
