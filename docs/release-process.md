# Release Process

This project publishes Windows, Linux, and macOS artifacts through one GitHub Actions Release workflow.

## Version Policy

- `0.1.x`: bug fixes, release tooling, documentation, and small stabilization work.
- `0.2.x`: user-facing feature additions.

Do not create a release tag until the package version, changelog, release notes, and local checks are ready.

## Prepare A Release

1. Update `package.json` and `package-lock.json` to the target version.
2. Update `CHANGELOG.md`.
3. Add `docs/release-notes/vX.Y.Z.md`.
4. Confirm `README.md`, `docs/known-issues.md`, and `docs/packaging-notes.md` still match the release.
5. Run local checks.
6. Commit and push `main`.
7. Confirm the pushed commit passes CI on Windows and Linux.
8. Create and push the tag.
9. Watch GitHub Actions.
10. Confirm the GitHub Release assets and checksums.
11. Confirm the GitHub Release contains the full Windows/Linux/macOS asset set.

## Local Windows Checks

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

Local Windows verification may only have the Windows ZIP. The release workflow verifies Windows ZIP, Linux ZIP, Linux AppImage, `latest-linux.yml`, macOS DMG, macOS ZIP, and `latest-mac.yml` after downloading artifacts from all OS jobs.

## Tagging

```powershell
git tag v0.2.1
git push origin v0.2.1
```

Tag push starts `.github/workflows/release.yml`. That workflow publishes the full Windows/Linux/macOS release.

Do not delete or recreate a local or remote release tag without explicit user approval.

## GitHub Actions Release Flow

1. Windows runner builds and verifies the Windows ZIP.
2. Linux runner builds and verifies the Linux ZIP, Linux AppImage, and `latest-linux.yml`.
3. macOS self-hosted ARM64 runner builds, signs, notarizes, staples, and verifies macOS DMG/ZIP artifacts and `latest-mac.yml` in parallel with Windows and Linux.
4. The core publish job starts as soon as Windows and Linux artifacts are ready, before waiting for macOS.
5. The core publish job uploads Windows ZIP, Linux ZIP, Linux AppImage, `latest-linux.yml`, core checksums, signatures, and the public key.
6. The final macOS job waits for both the core publish and macOS build jobs.
7. The final macOS job downloads the existing Release assets, adds macOS DMG/ZIP and `latest-mac.yml`, regenerates complete checksums, signs them, verifies with `--require-all`, and uploads refreshed final checksums.
8. The final Release asset set must include Windows ZIP, Linux ZIP, Linux AppImage, `latest-linux.yml`, macOS DMG, macOS ZIP, `latest-mac.yml`, checksums, detached signatures, and `suwol-release-public-key.asc`.

## macOS Diagnostics

macOS release builds require a trusted Apple Silicon self-hosted runner labeled `self-hosted`, `macOS`, and `ARM64`.

Use `.github/workflows/macos-build-diagnostics.yml` only when diagnosing the macOS host. The normal release path is `.github/workflows/release.yml`.

Do not build universal or Intel macOS assets for this release line. Do not pass Apple notary passwords on the command line; use the stored `suwol-notary-profile`.

## Failure Recovery

If the tag already exists and a tag-triggered run fails after a workflow fix, run the Release workflow manually with `workflow_dispatch` and the existing release tag.

For a workflow-only recovery of an existing tag, use GitHub Actions with `Use workflow from: main` and set `release_tag` to the existing tag, such as `v0.2.5`. Running from `main` is important because running from the tag can use the older workflow file stored at that tag. The workflow reads `github.event.inputs.release_tag` for manual runs and rejects branch names such as `main`.

Use tag deletion/recreation only when the user explicitly approves it.

## Release Assets

Expected asset names:

- `SuwolVisualReference-<version>-win-x64.zip`
- `SuwolVisualReference-<version>-linux-x64.zip`
- `SuwolVisualReference-<version>-linux-x64.AppImage`
- `SuwolVisualReference-<version>-mac-arm64.dmg`
- `SuwolVisualReference-<version>-mac-arm64.zip`
- `latest-linux.yml`
- `latest-mac.yml`
- `checksums.txt`
- `checksums.txt.asc`
- `SuwolVisualReference-<version>-checksums.txt`
- `SuwolVisualReference-<version>-checksums.txt.asc`
- `suwol-release-public-key.asc`

The app itself keeps the user-facing name `Suwol Visual Reference`.

Linux AppImage update QA is separate from Windows ZIP smoke QA. Confirm that Settings/About reports update support in the AppImage, that Windows ZIP builds report automatic updates as unsupported, and that `latest-linux.yml` is included in checksums.
