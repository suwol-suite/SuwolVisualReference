# Suwol Visual Reference

Suwol Visual Reference is a local visual reference manager for game developers, published by SuwolSoft.

It helps you build portable local libraries of image and UI references, add practical metadata, review duplicates, restore or permanently delete library copies, and export selected references as Codex-ready Markdown.

## Features

- Create and open portable local libraries.
- Open recent libraries without browsing for the folder again.
- Import individual files or recursive folders.
- Keep thumbnails, SVG raster previews, animated GIF badges, video placeholder metadata, tags, memo, rating, favorite state, source URL, collections, and smart folders.
- Search, sort, filter by metadata or palette color, paginate, and incrementally load large libraries.
- Switch between thumbnail grid and dense configurable list views.
- Manage tags and collections, including collection colors, cover images, and manual collection order.
- Build smart folders with editable multi-condition rules and result count previews.
- Use desktop-style selection, range selection, drag-box selection, and multi-selection batch actions.
- Review SHA-256 duplicates, merge metadata, ignore groups, or move redundant copies to trash.
- Restore from trash or permanently delete library-internal copies.
- Open a large image viewer with zoom and pan.
- Export selected assets or collections to Codex Markdown reference packs with built-in or custom templates.
- Use the app in Korean or English.

## Screenshots

Screenshots are planned after the first public ZIP release.

## Supported Platforms

- Windows x64: ZIP distribution.
- Linux x64: ZIP distribution.
- macOS: not distributed yet.

No installer and no automatic updater are included.

## Download

Download the latest ZIP from [GitHub Releases](https://github.com/suwol-suite/SuwolVisualReference/releases).

### Windows ZIP

1. Download `SuwolVisualReference-<version>-win-x64.zip`.
2. Extract the ZIP.
3. Run `Suwol Visual Reference.exe`.
4. Windows SmartScreen may warn because the build is not code-signed.

### Linux ZIP

1. Download `SuwolVisualReference-<version>-linux-x64.zip`.
2. Extract the ZIP.
3. If your desktop environment requires it, mark the executable as runnable:

   ```bash
   chmod +x "Suwol Visual Reference"
   ```

4. Run the app from the extracted folder.

### Verify Checksums

Download `SuwolVisualReference-<version>-checksums.txt` from the same release and compare the SHA-256 hash before running the app.

Windows PowerShell:

```powershell
Get-FileHash .\SuwolVisualReference-<version>-win-x64.zip -Algorithm SHA256
```

Linux:

```bash
sha256sum SuwolVisualReference-<version>-linux-x64.zip
```

## Development Environment

The project uses:

- Electron
- React
- TypeScript
- Vite / electron-vite
- SQLite with better-sqlite3
- Sharp
- Zustand
- i18next / react-i18next
- CSS Modules

Use Node.js 24 for release builds and GitHub Actions parity.

On Windows PowerShell, use `npm.cmd` because `npm.ps1` may be blocked by execution policy.

```powershell
npm.cmd ci
npm.cmd run rebuild:native
```

Native modules are rebuilt through `electron-builder install-app-deps`.

## Development Run

```powershell
npm.cmd run dev
```

The renderer dev server normally runs at `http://localhost:5173/`, and Electron opens the app window.

## Verification

```powershell
npm.cmd run icons:generate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:selection
npm.cmd run i18n:check
npm.cmd run license:check
npm.cmd run smoke
npm.cmd run build
npm.cmd audit --omit=dev
npm.cmd run pack:win
npm.cmd run release:zip:win
npm.cmd run release:checksums
npm.cmd run verify:checksums
npm.cmd run verify:release:zip
npm.cmd run verify:packaged-app
```

Additional local checks:

```powershell
npm.cmd run test:ui-import
npm.cmd run test:library-perf -- "<existing-library-path>"
```

`smoke` creates a temporary local library, imports files and nested folders, checks SVG/GIF/video fallback import, duplicate handling, metadata operations, advanced sort/filter and palette color queries, collection covers, smart folders, trash/restore, permanent delete result handling, thumbnails, persistence, custom export templates, and Codex Markdown export.

## Release Build

Windows ZIP:

```powershell
npm.cmd run release:zip:win
```

Linux ZIP, normally on a Linux runner:

```bash
npm run release:zip:linux
```

Checksums:

```powershell
npm.cmd run release:checksums
```

Expected release assets:

- `SuwolVisualReference-<version>-win-x64.zip`
- `SuwolVisualReference-<version>-linux-x64.zip`
- `SuwolVisualReference-<version>-checksums.txt`

GitHub Actions builds Windows and Linux ZIP files on their matching OS runners when a `v*` tag is pushed. The workflow publishes a GitHub Release with ZIP files and SHA-256 checksums using the default `GITHUB_TOKEN`.

The CI workflow runs on pushes and pull requests to `main`. It checks type safety, linting, selection logic, i18n resources, third-party notices, smoke behavior, production build, and production dependency audit on Windows and Linux.

Release recovery through `workflow_dispatch` is documented in [docs/packaging-notes.md](docs/packaging-notes.md). The full release checklist is in [docs/release-process.md](docs/release-process.md).

## Library Layout

Libraries are portable folders. File paths stored in the database are relative to the library root.

```text
ref-forge-library.json
db.sqlite
assets/originals
assets/thumbnails
assets/previews
exports
backups
```

## Known Issues

See [docs/known-issues.md](docs/known-issues.md).

## Issues And Requests

Use the GitHub issue templates for bugs and feature requests. Do not attach private libraries, copyrighted assets, personal source files, SQLite databases, `.env` files, tokens, certificates, or keys.

Helpful bug report details:

- App version from Settings or `Suwol Visual Reference.exe --version`.
- Operating system and ZIP file name.
- Library size, approximate asset count, and whether the library is local, synced, or external.
- Exact error message and a screenshot when it is safe to share.
- Steps to reproduce without uploading private assets.

Manual release QA is tracked in [docs/manual-qa-checklist.md](docs/manual-qa-checklist.md).

## User Asset Rights

Suwol Visual Reference does not grant rights to imported assets. You are responsible for confirming that you have the right to use images, UI captures, fonts, logos, documents, video, audio, or any other source material you import and export.

Personal test assets and user libraries are not part of this repository.

## License

Suwol Visual Reference is licensed under [Apache-2.0](LICENSE).

Third-party package notices are generated in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Maintainer

SuwolSoft
