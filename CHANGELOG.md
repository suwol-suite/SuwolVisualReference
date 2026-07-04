# Changelog

## Unreleased

### Added

- Dense asset list view with sortable columns and preserved desktop selection behavior.
- Configurable list columns with show/hide, saved widths, saved order, and default restore.
- Structured asset sort options for imported date, name, size, resolution, rating, extension, and collection order.
- Advanced asset filters for extension, rating, included/excluded tags, aspect, minimum dimensions, memo, source URL, recency, favorites, duplicates, and deleted assets.
- Collection manager for create, rename, description edit, color edit, cover assignment, cover clearing, and collection deletion.
- Collection cover fallback thumbnails and database indexes for large-library organization queries.
- Manual collection asset ordering with drag handles and move-to-top/up/down/bottom controls in collection list view.
- Smart folder manager for create, edit, delete, multi-condition query building, validation, and result count previews.

### Changed

- Toolbar and status bar now expose current sort and active filter state.
- Smart folder condition UI includes media type, width, and height fields.
- Smoke coverage now checks organization queries, collection covers, collection reorder, smart folder updates, and smart folder previews.

## 0.1.2 - 2026-07-04

### Added

- Windows and Linux CI workflow for pushes, pull requests, and manual runs.
- Release ZIP structure verification script.
- Release checksum verification script.
- Packaged app verification for Windows and Linux unpacked builds.
- Safe `--version`, `--help`, and `--smoke-main` main-process diagnostics.
- Selection logic regression checks.
- Issue templates and pull request template.
- Release process and manual QA checklist documentation.

### Changed

- Release workflow now verifies downloaded ZIP artifacts before publishing GitHub Releases.
- Release build jobs now verify packaged apps before uploading artifacts.
- Checksum and ZIP verification messages now identify the failing artifact or checksum entry more clearly.
- Desktop text selection is limited to inputs, textareas, selects, and contenteditable fields.
- Filter popover positioning and button layout are more stable on narrow windows and localized text.
- README and known issues include stronger checksum, issue reporting, and release QA guidance.

## 0.1.1 - Release workflow repair

### Fixed

- Updated GitHub Actions release workflow to build with Node.js 24.
- Fixed Linux CI smoke test by running Electron under Xvfb with `--no-sandbox`.
- Added manual release workflow recovery through `workflow_dispatch` for existing tags.

## 0.1.0 - Initial public release

### Added

- Local library creation and opening.
- Recent library list.
- File and recursive folder import.
- Image thumbnails and previews.
- Tags, memo, rating, favorite state, and source URL metadata.
- Collections.
- Smart folders.
- Duplicate resolution based on SHA-256 hashes.
- Trash, restore, and permanent delete for library-internal copies.
- Multi-selection batch operations.
- Large image viewer with zoom and pan.
- Korean and English UI localization.
- Codex Markdown export.
- Windows and Linux ZIP distribution.

### Known Limitations

- Windows builds are not code-signed and may trigger SmartScreen warnings.
- macOS builds are not distributed yet.
- Advanced video preview, audio waveform preview, and similar media workflows are not included yet.
- AI and OCR features are not included.
- Browser extension capture is not included.
