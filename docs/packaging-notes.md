# Packaging Notes

Suwol Visual Reference is distributed as a Windows ZIP plus Linux AppImage and ZIP artifacts for x64. Linux AppImage builds support automatic update checks through GitHub Releases. Windows installers, Windows automatic updates, code signing, and macOS artifacts are not part of the current release line.

## Artifact Names

Expected release assets:

- `SuwolVisualReference-<version>-win-x64.zip`
- `SuwolVisualReference-<version>-linux-x64.AppImage`
- `SuwolVisualReference-<version>-linux-x64.zip`
- `latest-linux.yml`
- `checksums.txt`
- `checksums.txt.asc`
- `SuwolVisualReference-<version>-checksums.txt`
- `SuwolVisualReference-<version>-checksums.txt.asc`
- `suwol-release-public-key.asc`

The user-facing app name remains `Suwol Visual Reference`.

## Brand Assets

Icon source and generated assets:

- `assets/brand/icon.svg`
- `assets/brand/icon-source.png`
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
When `assets/brand/icon-source.png` exists, `icons:generate` uses it as the raster source and falls back to `assets/brand/icon.svg` only when the PNG source is absent.

## Native Dependencies

The app depends on `better-sqlite3` and `sharp`.

Video thumbnail extraction is optional and uses only an external `ffmpeg`/`ffprobe` executable from config or `PATH`. The package must not add `ffmpeg-static` or bundle an ffmpeg binary.

Rules for release builds:

- Build the Windows ZIP on Windows.
- Build the Linux ZIP and AppImage on Linux.
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
- custom export templates stored in library SQLite databases at runtime
- `package.json`
- `build/icon.ico`
- `build/icon.png`

electron-builder includes `out/**`, `config/**`, `migrations/**`, `assets/brand/**`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `package.json` in the app package. Native module folders for `better-sqlite3`, `sharp`, and Sharp's platform-specific `@img` runtime payloads are marked for `asarUnpack`.

## Local Windows Commands

```powershell
npm.cmd run icons:generate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:selection
npm.cmd run test:updates
npm.cmd run i18n:check
npm.cmd run license:check
npm.cmd run smoke
npm.cmd run build
npm.cmd audit --omit=dev
npm.cmd run pack:win
npm.cmd run release:zip:win
npm.cmd run release:checksums
npm.cmd run verify:checksums
npm.cmd run verify:release-assets
npm.cmd run verify:release:zip
npm.cmd run verify:packaged-app
npm.cmd run release:verify
```

`pack:win` creates `release/win-unpacked` for local packaging QA. `release:zip:win` creates the Windows ZIP release asset. `verify:packaged-app` checks the unpacked executable, `resources/app.asar`, packaged icons, license/notices, package metadata, forbidden private paths, and the safe `--version` startup path for the current OS.

## Linux Commands

Run on Linux, normally through GitHub Actions:

```bash
npm ci
npm run rebuild:native
npm run icons:generate
npm run typecheck
npm run lint
npm run test:selection
npm run test:updates
npm run i18n:check
npm run license:check
npm run build
xvfb-run -a ./node_modules/.bin/electron --no-sandbox out/main/index.js --smoke-test
npm run dist:linux:release
npm run release:normalize-linux-appimage -- --require
npm run verify:packaged-app -- --platform=linux
```

## Checksums

```powershell
npm.cmd run release:checksums
```

`scripts/checksums.mjs` hashes matching `SuwolVisualReference-<version>-*.zip`, `.AppImage`, `.deb`, `.rpm`, and `latest-linux.yml` files in `release/` by default and writes both `SuwolVisualReference-<version>-checksums.txt` and `checksums.txt`.

`scripts/verify-checksums.mjs` reads the checksum file, recalculates SHA-256 for each listed release artifact, and fails if an artifact is missing or a hash differs.

`scripts/verify-release-zip.mjs` checks release ZIP structure, required executables, `resources/app.asar`, packaged icon resources, license/notices inside `app.asar`, and forbidden private/test paths.

`scripts/verify-release-assets.mjs` checks the release asset set, AppImage presence and size, `latest-linux.yml` version/path/sha512 metadata, checksum coverage, checksum hash matches, and forbidden release asset names. Local Windows runs allow missing Linux assets by default; the release workflow uses `--require-all`.

`scripts/verify-packaged-app.mjs` checks unpacked packaged apps after `electron-builder` creates `release/win-unpacked` or `release/linux-unpacked`. It runs the packaged executable with `--version` only on the matching OS.

On GitHub Actions Ubuntu runners, Chromium can abort packaged Electron verification if `release/linux-unpacked/chrome-sandbox` does not have root ownership and mode 4755. The verifier runs Linux packaged apps with `--no-sandbox` and `ELECTRON_DISABLE_SANDBOX=1` for this verification step only. This CI verification setting is separate from Linux AppImage update behavior and does not change the Windows ZIP or Linux ZIP update policy.

Sharp 0.34 uses platform-specific optional packages under `node_modules/@img`, including libvips payloads. Those files must be unpacked alongside `node_modules/sharp` so the packaged Linux app can load `libvips-cpp.so` during verification and runtime thumbnail work.

The GitHub Actions release workflow verifies each OS package before upload. The publish job then downloads both OS artifacts, runs checksum, release-asset, and ZIP verification scripts against `release-assets/`, signs `checksums.txt` and the versioned checksum file with the `GPG_PRIVATE_KEY_B64` secret, verifies the signatures with `suwol-release-public-key.asc`, and uploads the ZIP/AppImage files, `latest-linux.yml`, checksums, signatures, and public key to GitHub Releases.

## AppImage Update Support

Automatic update checks are enabled only when all conditions are true: the app is packaged, `process.platform` is `linux`, the `APPIMAGE` environment variable is present, and the app is not running in development mode. Windows ZIP, Linux ZIP, macOS, development, and unpacked runs return an unsupported reason through the updates IPC API.

The Linux AppImage uses electron-builder GitHub publish metadata. The Release workflow must upload both `SuwolVisualReference-<version>-linux-x64.AppImage` and `latest-linux.yml`; missing update metadata means the AppImage cannot discover updates.

electron-builder may emit AppImage files with an `x86_64` architecture suffix. The release workflow normalizes the AppImage file name and matching `latest-linux.yml` entries to the documented `linux-x64.AppImage` release asset name before upload, checksum generation, and release-asset verification.

The normal release trigger is a `v*` tag push. If a tag-triggered run fails after the tag already exists, the same workflow can be run manually with `workflow_dispatch` and the existing tag name, such as `v0.2.1`, without deleting or recreating the tag.

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
