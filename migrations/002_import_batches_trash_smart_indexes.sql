ALTER TABLE assets ADD COLUMN original_relative_path TEXT;
ALTER TABLE assets ADD COLUMN import_batch_id TEXT;
ALTER TABLE assets ADD COLUMN deleted_at TEXT;
ALTER TABLE assets ADD COLUMN permanently_deleted_at TEXT;

ALTER TABLE tags ADD COLUMN library_id TEXT;
ALTER TABLE collections ADD COLUMN library_id TEXT;
ALTER TABLE smart_folders ADD COLUMN library_id TEXT;
ALTER TABLE duplicates ADD COLUMN library_id TEXT;
ALTER TABLE duplicates ADD COLUMN asset_id_a TEXT;
ALTER TABLE duplicates ADD COLUMN asset_id_b TEXT;

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_path TEXT NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  status TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (library_id) REFERENCES libraries(id)
);

CREATE INDEX IF NOT EXISTS idx_assets_library_id ON assets(library_id);
CREATE INDEX IF NOT EXISTS idx_assets_imported_at ON assets(imported_at);
CREATE INDEX IF NOT EXISTS idx_assets_is_deleted ON assets(is_deleted);
CREATE INDEX IF NOT EXISTS idx_assets_permanently_deleted_at ON assets(permanently_deleted_at);
CREATE INDEX IF NOT EXISTS idx_assets_is_favorite ON assets(is_favorite);
CREATE INDEX IF NOT EXISTS idx_assets_rating ON assets(rating);
CREATE INDEX IF NOT EXISTS idx_assets_media_type ON assets(media_type);
CREATE INDEX IF NOT EXISTS idx_assets_extension ON assets(extension);
CREATE INDEX IF NOT EXISTS idx_assets_hash_2 ON assets(hash);
CREATE INDEX IF NOT EXISTS idx_assets_import_batch_id ON assets(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_assets_original_relative_path ON assets(original_relative_path);
CREATE INDEX IF NOT EXISTS idx_tags_library_id ON tags(library_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_asset_tags_asset_id ON asset_tags(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_tags_tag_id ON asset_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_collections_library_id ON collections(library_id);
CREATE INDEX IF NOT EXISTS idx_collection_assets_collection_id ON collection_assets(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_assets_asset_id ON collection_assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_smart_folders_library_id ON smart_folders(library_id);
CREATE INDEX IF NOT EXISTS idx_asset_colors_asset_id ON asset_colors(asset_id);
CREATE INDEX IF NOT EXISTS idx_duplicates_library_id ON duplicates(library_id);
CREATE INDEX IF NOT EXISTS idx_duplicates_asset_id_a ON duplicates(asset_id_a);
CREATE INDEX IF NOT EXISTS idx_duplicates_asset_id_b ON duplicates(asset_id_b);
CREATE INDEX IF NOT EXISTS idx_import_batches_library_id ON import_batches(library_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_started_at ON import_batches(started_at);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);
