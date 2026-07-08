# Electron Release Standard

This repository follows a two-phase Electron release model that can be reused for other Suwol desktop apps.

## Default CI

Push and pull request CI stays fast and only runs on Windows and Linux.

Required checks:

- typecheck
- lint
- test:selection
- test:updates
- i18n:check
- license:check
- smoke
- build
- audit --omit=dev

Do not add macOS to default push CI. macOS signing and notarization are manual release operations because they depend on a trusted Apple Silicon signing host.

## Core Release

The normal release workflow is `.github/workflows/release.yml`.

It builds and publishes:

- Windows x64 ZIP
- Linux x64 AppImage
- `latest-linux.yml`
- SHA-256 checksums
- detached GPG signatures
- `suwol-release-public-key.asc`

The core release is triggered by a `v*` tag or by manual dispatch for an existing tag after a workflow-only fix. Do not delete or recreate tags unless explicitly approved.

## macOS Release

macOS release work is separate from core Windows/Linux publishing.

Use `.github/workflows/macos-build-diagnostics.yml` first to validate the self-hosted macOS environment, signing identity, native modules, hardened runtime, DMG creation, notarization, and stapling. This workflow is manual only.

When diagnostics pass, use `.github/workflows/attach-macos-release.yml` with the release tag. It builds the macOS arm64 DMG, notarizes it, uploads macOS assets to the existing GitHub Release, and refreshes checksums and GPG signatures.

macOS support is arm64 DMG only. Do not build universal, Intel, or ZIP macOS assets for this release line.

## macOS Runner

The self-hosted runner must be:

- Apple Silicon macOS
- labeled `self-hosted`, `macOS`, and `ARM64`
- Node.js 22 capable
- Xcode command line tools installed
- Developer ID Application certificate and private key installed
- Developer ID CA chain available
- `notarytool` profile stored as `suwol-notary-profile`

Do not pass Apple notary passwords on the command line. Use the stored keychain profile.

## Required Secrets

GitHub repository secrets for release workflows:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_TEAM_ID`
- `MAC_KEYCHAIN_PASSWORD`
- `GPG_PRIVATE_KEY_B64`
- `GPG_PASSPHRASE`

Workflow logs must never echo secrets. macOS workflows must unlock the keychain before signing and must not enable shell tracing.

## Notarization

Notarization uses:

1. `xcrun notarytool submit`
2. poll status every 30 seconds
3. `xcrun stapler staple`
4. `xcrun stapler validate`

Do not rely on `notarytool --wait`; polling produces better diagnostics and keeps timeout handling explicit.

Suggested timeouts:

- diagnostics workflow: 30 minutes
- release attachment workflow: 120 minutes

## Local Secret Hygiene

Keep generated release output, diagnostics, private keys, passphrases, certificates, local databases, test libraries, user assets, and environment files out of git. Only the public release verification key may be committed.
