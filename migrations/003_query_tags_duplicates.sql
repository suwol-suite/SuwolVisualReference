CREATE TABLE IF NOT EXISTS duplicate_resolutions (
  library_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unresolved',
  keep_asset_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  resolved_at TEXT,
  ignored_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (library_id, hash),
  FOREIGN KEY (library_id) REFERENCES libraries(id)
);

CREATE INDEX IF NOT EXISTS idx_duplicate_resolutions_library_status ON duplicate_resolutions(library_id, status);
CREATE INDEX IF NOT EXISTS idx_duplicate_resolutions_hash ON duplicate_resolutions(hash);

CREATE INDEX IF NOT EXISTS idx_assets_library_deleted_imported ON assets(library_id, is_deleted, imported_at);
CREATE INDEX IF NOT EXISTS idx_assets_library_hash_deleted ON assets(library_id, hash, is_deleted);
CREATE INDEX IF NOT EXISTS idx_assets_library_favorite_deleted ON assets(library_id, is_favorite, is_deleted);
CREATE INDEX IF NOT EXISTS idx_assets_library_rating_deleted ON assets(library_id, rating, is_deleted);
CREATE INDEX IF NOT EXISTS idx_assets_library_extension_deleted ON assets(library_id, extension, is_deleted);
CREATE INDEX IF NOT EXISTS idx_assets_library_media_deleted ON assets(library_id, media_type, is_deleted);
CREATE INDEX IF NOT EXISTS idx_asset_tags_tag_asset ON asset_tags(tag_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_collection_assets_asset_collection ON collection_assets(asset_id, collection_id);
CREATE INDEX IF NOT EXISTS idx_duplicates_library_hash ON duplicates(library_id, hash);
