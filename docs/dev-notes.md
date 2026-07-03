# Suwol Visual Reference Dev Notes

## Branding Boundary

The user-visible product name is `Suwol Visual Reference` and comes from `config/app.config.json` plus package metadata loaded by `loadAppConfig`.

The project folder, internal preload bridge name `window.refForge`, custom asset protocol `ref-forge://`, and library manifest filename `ref-forge-library.json` are intentionally retained for compatibility with existing libraries, asset preview URLs, and code namespace stability. Treat `ref-forge://` as an internal asset protocol name, not the product name.

Some internal compatibility names are retained for existing library compatibility:

- `ref-forge://`
- `window.refForge`
- `ref-forge-library.json`

The user-facing product name is `Suwol Visual Reference`.

## Process Boundaries

- `src/main`: Electron main process, IPC handlers, library service, DB service, import service, media service, export service.
- `src/preload`: safe IPC bridge exposed through the legacy internal bridge name.
- `src/renderer`: React UI, Zustand state, CSS Modules. It does not call Node file APIs directly.
- `src/shared`: TypeScript types and IPC channel contracts shared by main/preload/renderer.
- `src/shared/i18n`: shared language codes, language preference types, and language resolution helpers.

## DB Migrations

Migrations live in `migrations/` and are applied by `LibraryDatabase` into the active library database. Applied migration names are tracked in `schema_migrations`.

The MVP uses `libraries`, `assets`, `tags`, `asset_tags`, `collections`, `collection_assets`, `asset_colors`, `duplicates`, `smart_folders`, `import_batches`, `export_jobs`, and `settings`. Migration `002_import_batches_trash_smart_indexes.sql` adds import batch metadata, source-relative import paths, trash/permanent-delete fields, and large-library indexes.

Migration `003_query_tags_duplicates.sql` adds `duplicate_resolutions` for hash-group status and extra indexes for paged asset queries, tag lookups, collection membership, and duplicate scans.

Migration `004_permanent_delete_results.sql` adds permanent-delete failure/batch columns used by trash-only deletion result reporting and retry workflows.

## Library Folder Structure

Each library is a portable folder:

```text
ref-forge-library.json
db.sqlite
assets/originals
assets/thumbnails
assets/previews
exports
backups
```

Database paths for asset files are library-relative paths. Main-process helpers convert them to absolute paths and file URLs when needed.

## Import Flow

1. Renderer collects dropped files, selected files, or a selected folder through preload.
2. Main process validates supported image extensions from `config/app.config.json`.
3. Folder import scans recursively while skipping common hidden/system/temp entries.
4. An `import_batches` row is created before processing.
5. Import service hashes each supported file with SHA-256.
6. Duplicates are detected by hash and skipped unless `duplicateMode: "add"` is used.
7. The original is copied into `assets/originals` using the asset id.
8. Sharp extracts dimensions and a small color palette.
9. Sharp writes a WebP thumbnail into `assets/thumbnails`.
10. Metadata, source-relative path, batch id, and colors are inserted into SQLite.
11. Import metrics are written back to the batch row and exposed in the UI.
12. Renderer reloads library summary, metadata, and asset grid state.

## Export Flow

1. Renderer submits selected asset ids or a collection id.
2. Main process resolves assets from SQLite.
3. Originals are copied to `exports/<export-name>/refs/`.
4. `instruction.md` is generated using the locale-aware template lookup. `config/export-templates/codex.<locale>.json` is preferred, with `config/export-templates/codex.json` as fallback.
5. Export preset defaults are read from `config/export-presets.<locale>.json` when a locale is provided, with `config/export-presets.json` as fallback.
6. Markdown references use relative `./refs/...` paths.
7. The export job is recorded in SQLite.

## i18n Flow

Renderer i18n uses `i18next` and `react-i18next`. Locale resources live in `src/renderer/src/locales/<language>/` and are grouped into `common`, `settings`, `export`, and `errors` namespaces.

Language preference is stored in `localStorage` under `app.language`. Supported values are `system`, `ko`, and `en`. `system` resolves from `navigator.languages`, preferring Korean and English and falling back to Korean.

The main process does not import renderer locale files. When export Markdown needs localized templates or presets, the renderer passes `ExportInput.locale`, and the main process loads the matching config resource.

## MVP Settings

App defaults are loaded from `config/app.config.json`. The current settings modal clearly marks config-backed values as display-only. Renderer-only display preferences, such as grid thumbnail size, file-name visibility, and language preference, are saved in `localStorage`.

## Paged Asset Query API

Renderer asset loading uses the preload bridge, backed by `LibraryDatabase.queryAssets`. It returns `{ items, totalCount, limit, offset, hasMore }` instead of an unbounded array. The renderer keeps the loaded page window in Zustand and appends 500 assets at a time when the center grid nears the bottom or the user presses Load more.

The query accepts view/filter fields for library, favorites, trash, duplicates, tag, collection, smart folder, search, duplicate hash, sorting, limit, and offset. Normal library queries show `is_deleted = 0`; trash uses `is_deleted = 1`; duplicate view only includes unresolved active SHA-256 groups.

The app shell uses resizable sidebar/center/inspector tracks with `overflow: hidden`; the center grid, sidebar lists, and inspector own their scroll areas. Sidebar and inspector widths are saved in `localStorage`, and double-clicking a splitter resets the width. This prevents parent flex/grid `min-height` issues from blocking wheel and trackpad scroll.

The center workspace keeps grid status in a toolbar-adjacent status bar rather than inside the scroll surface. It shows the current view, total library count, filtered count, loaded count, selected count, and active search text.

## Desktop Selection Policy

The renderer applies `user-select: none` across the app shell, panels, toolbar, grid, inspector, sidebar, buttons, labels, and cards. Text selection is allowed only in editable controls: `input`, `textarea`, `select`, and `[contenteditable="true"]`.

Global Ctrl+A/Cmd+A is intercepted outside editable controls and selects the currently loaded asset page only. It does not attempt to select unloaded pages from a large filtered result. Escape clears selection, Delete moves selected assets to trash from non-trash views after confirmation, and Enter/Space opens the selected asset in the large viewer.

Asset selection follows desktop conventions: click replaces selection, Ctrl/Cmd-click toggles one asset, Shift-click selects a loaded-range from the selection anchor, and dragging from empty grid space shows a selection rectangle over currently rendered asset cards. Ctrl/Cmd drag is treated as additive selection. Browser text selection is cleared during grid drag operations.

## Tag Manager

The tag manager is renderer UI over main-process tag APIs. It supports create, search, unused-only filtering, rename, color edit, single/bulk delete, unused-tag cleanup, and merge.

Deleting a tag removes `asset_tags` links and the tag row only. It never deletes assets or library files. Default seeded tags are no longer recreated on every app open; `settings.default_tags_seeded` records the one-time seed state. `config/default-tags.json` is intentionally empty for new libraries, so new libraries start with zero automatic tags. Existing library tags remain user-manageable and are never auto-deleted or auto-translated.

Tag merge takes several source tags and one target tag. All source-tagged assets receive the target tag through `INSERT OR IGNORE`, source tag links are removed, and source tag rows are deleted.

There is no language-specific tag conversion API. User-created tag names are stored as entered, whether Korean, English, or any other text. The app must not auto-translate, auto-rename, or specially classify tags by language.

## Viewer And Toolbar UX

The toolbar filter icon opens a small anchored popover for library, favorites, trash, duplicate review, apply, and clear-all actions. The popover is kept outside text-selection behavior, can be closed with Escape or outside click, and avoids the toolbar icon-button styles that caused vertical button labels. The grid/list icon remains disabled with a pending tooltip until a list view exists.

Asset tiles show an explicit selected badge at the card top-right plus selected border/background styling. Double-clicking a tile, pressing Enter/Space on a focused tile, or clicking the inspector preview opens the large image viewer. The viewer supports previous/next navigation, mouse-wheel zoom, drag pan, reset-to-fit, and Escape close. Image drag uses `draggable={false}` and window-level mouseup handling so pan ends even when the pointer leaves the image.

Permanent delete is guarded in both UI and store state. It is only available for assets currently shown as deleted/trash assets and removes library-internal originals, thumbnails, and previews; source folders are not modified.

The multi-selection inspector supports bulk tag add/remove, create-and-add tag, add/create collections, batch rating, favorite on/off, selected export, selection clear, trash/restore, and trash-only permanent delete. Batch main/preload APIs return result objects with requested/success/failed/skipped counts plus failures and warnings.

Permanent delete lives in `src/main/services/permanent-delete-service.ts`. It deletes only library-relative internal originals, thumbnails, and previews that resolve inside the active library root. Missing internal files are warnings and still allow tombstoning; failed internal file deletes leave the asset in trash with a recorded batch/error for retry.

Resizable sidebars use pointer events, window-level pointermove/pointerup, body `col-resize` cursor, width clamps, localStorage persistence, and double-click reset.

## Duplicate Resolution

Duplicate groups are active assets grouped by identical SHA-256 `hash`. This pass does not implement perceptual hash or similar-image detection. `duplicate_resolutions` stores group `unresolved`, `resolved`, or `ignored` state by `(library_id, hash)`.

The duplicate center shows group count, reclaimable bytes, status, previews, file names, source-relative paths, library paths, size, dimensions, import date, tags, memo, rating, favorite state, and collections. The recommended keep candidate is computed by tag count, collection count, memo presence, rating, favorite state, earlier import time, and shorter file name.

Metadata merge unions tags and collection membership, combines memo text with source file headings, keeps the highest rating, ORs favorite state, and fills an empty target `source_url` from source assets. Removing duplicates from the center moves them to trash; permanent delete remains available only from the trash workflow and only removes files inside the active library root.

## Next TODO

- Persist user settings in the `settings` table and add a settings migration if needed.
- Add collection rename, color edit, and delete UI.
- Add true virtualized scrolling if infinite pagination eventually allows too many loaded cards after very long sessions.
- Add locale coverage checks for future non-renderer resources if export presets gain more nested metadata.
- Revisit Electron/Vite major upgrades once native rebuild and packaging behavior are tested.
