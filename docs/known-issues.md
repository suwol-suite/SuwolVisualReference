# Known Issues

## Windows SmartScreen

The v0.1.1 Windows ZIP is not code-signed. Windows SmartScreen may warn before the app runs.

## Code Signing

No Windows signing certificate is configured yet. Signed release builds are planned for a later distribution pass.

## macOS

macOS builds are not distributed in v0.1.1.

## Linux ZIP Distribution

Linux is distributed as a ZIP archive. Some desktop environments may require setting executable permission manually after extraction.

## Linux Headless CI

GitHub Actions runs Linux smoke tests under Xvfb and passes `--no-sandbox` to Electron because the hosted runner does not configure Chromium's SUID sandbox helper for packaged test execution. This is a CI-only headless test setting, not an app feature toggle.

## Native Modules

The app uses native dependencies, including `better-sqlite3` and `sharp`. Windows and Linux release ZIPs are built on matching OS runners to avoid cross-built native modules, but unusual Linux environments may still expose native runtime issues.

## Media Preview Scope

Image import, thumbnails, and previews are the first priority. Advanced video thumbnails, audio waveforms, and rich previews for non-image media are not included yet.

## OCR, AI Tagging, And Browser Capture

OCR, automatic AI tagging, and browser extension capture are not included yet.

## Large Libraries

Large libraries load assets in 500-item pages. This keeps the UI responsive, but very large sessions can still benefit from future virtualized rendering work.

## Automatic Updates

Automatic updates are not included in v0.1.1. Download new ZIP files from GitHub Releases.

## User Asset Rights

Suwol Visual Reference does not provide rights to imported assets. Users must confirm the usage rights for their own images, UI captures, fonts, documents, video, audio, and other source material.
