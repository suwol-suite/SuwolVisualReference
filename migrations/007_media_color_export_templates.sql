ALTER TABLE assets ADD COLUMN is_animated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN has_transparency INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN thumbnail_status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE assets ADD COLUMN preview_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE assets ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'ready';

ALTER TABLE asset_colors ADD COLUMN red INTEGER;
ALTER TABLE asset_colors ADD COLUMN green INTEGER;
ALTER TABLE asset_colors ADD COLUMN blue INTEGER;

CREATE INDEX IF NOT EXISTS idx_asset_colors_rgb ON asset_colors(red, green, blue);
CREATE INDEX IF NOT EXISTS idx_assets_library_media_extension_deleted ON assets(library_id, media_type, extension, is_deleted);

CREATE TABLE IF NOT EXISTS export_templates (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'codex-markdown',
  template_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_export_templates_library_updated ON export_templates(library_id, updated_at);
