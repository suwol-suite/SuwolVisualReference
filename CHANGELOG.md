# Changelog

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
