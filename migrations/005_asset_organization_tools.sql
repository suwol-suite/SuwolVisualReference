ALTER TABLE collections ADD COLUMN cover_asset_id TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_library_size_deleted ON assets(library_id, size_bytes, is_deleted);
CREATE INDEX IF NOT EXISTS idx_assets_library_dimensions_deleted ON assets(library_id, width, height, is_deleted);
CREATE INDEX IF NOT EXISTS idx_assets_library_imported_deleted ON assets(library_id, imported_at, is_deleted);
CREATE INDEX IF NOT EXISTS idx_collection_assets_collection_sort ON collection_assets(collection_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_smart_folders_library_updated ON smart_folders(library_id, updated_at);
