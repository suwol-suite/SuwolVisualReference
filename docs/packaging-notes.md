# Packaging Notes

Suwol Visual Reference v0.1.1 is distributed as ZIP archives for Windows x64 and Linux x64. Installers, automatic updates, code signing, and macOS artifacts are not part of the first public release.

## Artifact Names

Expected release assets:

- `SuwolVisualReference-0.1.1-win-x64.zip`
- `SuwolVisualReference-0.1.1-linux-x64.zip`
- `SuwolVisualReference-0.1.1-checksums.txt`

The user-facing app name remains `Suwol Visual Reference`.

## Brand Assets

Icon source and generated assets:

- `assets/brand/icon.svg`
- `assets/brand/icon-1024.png`
- `assets/brand/icon-512.png`
- `assets/brand/icon-256.png`
- `assets/brand/icon-128.png`
- `assets/brand/icon-64.png`
- `assets/brand/icon-48.png`
- `assets/brand/icon-32.png`
- `assets/brand/icon-16.png`
- `build/icon.ico`
- `build/icon.png`
- `build/icon.icns`

Generate them with:

```powershell
npm.cmd run icons:generate
```

`build/icon.ico` and `build/icon.png` are copied into packaged app resources so the runtime window icon resolves in Windows and Linux packages.

## Native Dependencies

The app depends on `better-sqlite3` and `sharp`.

Rules for release builds:

- Build the Windows ZIP on Windows.
- Build the Linux ZIP on Linux.
- Do not force cross-OS release packaging for native modules.
- Run `npm ci` before packaging.
- Run `npm run rebuild:native` or `npm.cmd run rebuild:native` before release packaging.

`rebuild:native` uses `electron-builder install-app-deps`.

## Resource Files

The main process reads these runtime resources:

- `migrations/*.sql`
- `config/app.config.json`
- `config/default-tags.json`
- `config/export-presets*.json`
- `config/export-templates/*.json`
- `package.json`
- `build/icon.ico`
- `build/icon.png`

electron-builder includes `out/**`, `config/**`, `migrations/**`, `assets/brand/**`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `package.json` in the app package. Native module folders for `better-sqlite3` and `sharp` are marked for `asarUnpack`.

## Local Windows Commands

```powershell
npm.cmd run icons:generate
npm.cmd run typecheck
npm.cmd run lint
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
npm.cmd run release:verify
```

`pack:win` creates `release/win-unpacked` for local packaging QA. `release:zip:win` creates the Windows ZIP release asset.

## Linux Commands

Run on Linux, normally through GitHub Actions:

```bash
npm ci
npm run rebuild:native
npm run icons:generate
npm run typecheck
npm run lint
npm run i18n:check
npm run license:check
npm run build
xvfb-run -a ./node_modules/.bin/electron --no-sandbox out/main/index.js --smoke-test
npm run release:zip:linux
```

## Checksums

```powershell
npm.cmd run release:checksums
```

`scripts/checksums.mjs` hashes matching `SuwolVisualReference-<version>-*.zip` files in `release/` by default and writes `SuwolVisualReference-<version>-checksums.txt`.

`scripts/verify-checksums.mjs` reads the checksum file, recalculates SHA-256 for each listed ZIP, and fails if a ZIP is missing or a hash differs.

`scripts/verify-release-zip.mjs` checks release ZIP structure, required executables, `resources/app.asar`, packaged icon resources, license/notices inside `app.asar`, and forbidden private/test paths.

The GitHub Actions release job downloads both OS artifacts, runs the same checksum and ZIP verification scripts against `release-assets/`, and uploads the ZIP files plus checksum file to GitHub Releases.

The normal release trigger is a `v*` tag push. If a tag-triggered run fails after the tag already exists, the same workflow can be run manually with `workflow_dispatch` and the existing tag name, such as `v0.1.1`, without deleting or recreating the tag.

## Security Notes

- Renderer `nodeIntegration` remains disabled.
- `contextIsolation` remains enabled.
- Renderer file and database access goes through preload IPC.
- Permanent delete only removes files resolved inside the active library root.
- Duplicate resolution actions move redundant assets to trash first; permanent delete remains trash-only.
- Tag manager delete and merge actions only change tag rows and `asset_tags` relations.

## Remaining Distribution Work

- Add Windows code signing to reduce SmartScreen warnings.
- Add macOS signing and notarization before distributing macOS artifacts.
- Add manual release QA for extracted ZIP folders on clean Windows and Linux machines.
- Revisit Electron, Vite, and electron-vite major upgrades in a dedicated compatibility pass.
