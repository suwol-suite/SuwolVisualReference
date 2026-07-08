# Known Issues

## Windows SmartScreen

The Windows ZIP is not code-signed. Windows SmartScreen may warn before the app runs.

## Code Signing

No Windows signing certificate is configured yet. Signed release builds are planned for a later distribution pass.

## macOS

macOS builds are not distributed.

## Linux AppImage Distribution

Linux is distributed as an AppImage. Some desktop environments may require setting executable permission manually before launch.

## Linux AppImage Updates

Linux AppImage builds support automatic update checks through GitHub Releases and `latest-linux.yml`. Some desktop environments require adding execute permission before the AppImage can run.

Network restrictions, proxy settings, or firewalls can make update checks fail even when the app itself works offline.

## Linux Headless CI

GitHub Actions runs Linux smoke tests under Xvfb and passes `--no-sandbox` to Electron because the hosted runner does not configure Chromium's SUID sandbox helper for packaged test execution. This is a CI-only headless test setting, not an app feature toggle.

## Native Modules

The app uses native dependencies, including `better-sqlite3` and `sharp`. Windows ZIP and Linux AppImage release artifacts are built on matching OS runners to avoid cross-built native modules, but unusual Linux environments may still expose native runtime issues.

## Media Preview Scope

Image import, thumbnails, GIF first-frame thumbnails, and raster SVG previews are the first priority. GIFs are not autoplayed in grid/list views; the viewer provides play/pause. Video records can be imported, and first-frame thumbnails are attempted only when an external `ffmpeg` executable is configured or available on `PATH`. No ffmpeg binary is bundled. Missing or failing ffmpeg leaves a placeholder preview with an import warning.

Media warnings are different from import failures. A warning means the library record was created but an optional preview, thumbnail, metadata, or color-analysis step fell back. A failure means the file itself was not imported.

Audio waveforms and rich previews for non-image media are not included yet.

## OCR, AI Tagging, And Browser Capture

OCR, automatic AI tagging, and browser extension capture are not included yet.

## Large Libraries

Large libraries load assets in 500-item pages. This keeps the UI responsive, but very large sessions can still benefit from future virtualized rendering work.

## Automatic Updates

Automatic updates are enabled only for Linux AppImage builds. Windows ZIP, macOS, development, and unpacked runs show an unsupported reason and link to GitHub Releases for manual downloads.

## Diagnostics And Logs

Settings shows the app name, version, license, and current library path. The app does not currently write a dedicated application log file. When reporting a bug, include the app version, OS, ZIP filename, library size or asset count, exact error message, and safe screenshots. Do not upload private assets, copyrighted files, SQLite databases, tokens, certificates, or keys.

## User Asset Rights

Suwol Visual Reference does not provide rights to imported assets. Users must confirm the usage rights for their own images, UI captures, fonts, documents, video, audio, and other source material.
