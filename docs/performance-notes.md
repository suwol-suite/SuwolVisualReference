# Performance Notes

Checked on 2026-07-02 with `npm.cmd run test:ui-import` against a local large UI resource folder. The default `test:ui-import` command now uses a generated recursive fixture unless a folder path is passed.

## Large Local Import Fixture

- Source: local large UI resource folder outside the repository
- Test library: generated temporary library under the ignored `.codex-run/` directory
- Result JSON: generated temporary result file under the ignored `.codex-run/` directory
- Source unchanged check: passed. Before and after snapshots both reported 20,947 files with identical extension counts.

The importer skips common hidden/system/temp entries during recursive scan, so the import scan counted 20,942 files. The source snapshot includes 5 additional `.db` files that were not part of the import scan.

## Import Result

- Total scanned by importer: 20,942 files
- Supported image files: 19,107
- Imported: 18,467
- Skipped duplicates: 640
- Failed: 0
- Unsupported: 1,835
- Duration: 317,839 ms, about 5m 18s
- Average per supported file: 16.63 ms

## Timing Breakdown

- Folder scan: 178 ms
- Hashing: 129,697 ms
- Copying into library: 55,360 ms
- Thumbnail generation: 315,009 ms
- Image metadata and palette analysis: 298,786 ms
- SQLite inserts and relations: 39,665 ms

Thumbnail and palette work are measured per task and run with limited concurrency, so their accumulated timings exceed wall-clock duration.

## Query Checks

- First grid page, 700 assets: 86 ms
- Search `ui`, 700 assets: 63 ms
- Smart folder `.png`, 700 assets: 74 ms
- Duplicate group scan: 3 groups in 23 ms
- Export preset check: exported 5 assets to `ui-analysis.md`

## Current Performance Shape

The grid uses paged incremental loading instead of a fixed first page. `queryAssets` returns `items`, `totalCount`, `limit`, `offset`, and `hasMore`; the renderer loads 500 assets at a time and shows total, filtered, loaded, and selected counts in the workspace status bar.

The list view reuses the same paged query window as the grid. It does not load hidden pages just to populate table rows, so switching view mode changes presentation without changing query size.

Sort and filter queries are backed by whitelisted SQL order clauses and targeted indexes for common organization dimensions: imported date, file size, dimensions, collection order, and smart folder update lookup.

The second organization pass adds indexes for rating, extension, media type, and `(collection_id, sort_order, asset_id)` to keep smart folder and manual collection-order queries on indexed paths. List column settings stay in `localStorage` and do not change query shape.

The app shell has explicit internal scroll ownership: body remains hidden, the center grid uses `overflow-y: auto`, and sidebar/inspector areas have independent scroll. This fixes the 18k-library issue where wheel input could be swallowed by the three-column layout.

Desktop selection is intentionally scoped to loaded assets. Ctrl+A/Cmd+A and drag-box selection select only the currently loaded/rendered cards, avoiding a large `selectedIds` array for an unloaded 18k filtered result.

Batch metadata operations run in main-process SQLite transactions and return compact result objects. They avoid per-row renderer IPC loops for multi-select tag, collection, rating, and favorite changes.

## 2026-07-02 Paged Query Check

Checked with:

```powershell
npm.cmd run test:library-perf -- "<temporary-large-library-path>"
```

Result:

- Active assets: 18,467
- First page, 500 assets: 37.1 ms, `hasMore: true`
- Second page, 500 assets: 36.2 ms, `hasMore: true`
- Search `ui`, 500 assets: 44.6 ms, 6,349 total results
- Duplicate group lookup: 27.7 ms, 3 groups

## 2026-07-04 Organization Query Check

The smoke test now exercises the organization query surface on a generated temporary library:

- Structured sort by title and file size.
- Extension, favorite, minimum rating, included tag, excluded tag, memo, recency, and duplicate-only filters.
- Collection cover update and fallback cover lookup.
- Collection-order sorting inside a collection.

The smoke test also verifies collection reorder persistence and smart folder update/preview behavior on generated fixtures.

## 2026-07-05 Media And Template Check

The smoke test now imports generated PNG, SVG, GIF, and invalid MP4 fixtures. SVG/GIF preview generation is verified without requiring external tools. The invalid MP4 fixture verifies that optional ffprobe/ffmpeg failure records warnings and placeholder media state without failing the batch.

Palette color filtering is covered through the `asset_colors` RGB channel query. The SQL comparison uses a bounded Euclidean distance and an indexed RGB channel table, while renderer input is normalized before IPC.

Custom export template creation, preview rendering, unknown placeholder warnings, and template-backed export are covered in the same smoke run. This does not add renderer filesystem access.

## Remaining Bottlenecks

- Infinite pagination prevents initial DOM overload, but a very long browsing session can still accumulate many loaded cards. A true virtual grid remains a future upgrade if this becomes visible in manual use.
- Asset mapping still loads tags, collections, and colors per returned asset. The 500-row page size keeps this acceptable, but a batched relation loader would be the next DB optimization.
- Thumbnail generation remains the dominant import cost. Video thumbnail extraction is optional, external-ffmpeg-only, timeout-bounded, and concurrency-limited separately from the normal import worker pool.
