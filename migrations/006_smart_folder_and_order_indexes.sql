CREATE INDEX IF NOT EXISTS idx_assets_library_rating_deleted ON assets(library_id, rating, is_deleted);
CREATE INDEX IF NOT EXISTS idx_assets_library_extension_deleted ON assets(library_id, extension, is_deleted);
CREATE INDEX IF NOT EXISTS idx_assets_library_media_deleted ON assets(library_id, media_type, is_deleted);
CREATE INDEX IF NOT EXISTS idx_collection_assets_collection_order_asset ON collection_assets(collection_id, sort_order, asset_id);
