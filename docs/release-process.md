# Release Process

This project publishes a Windows ZIP and a Linux AppImage through GitHub Actions. macOS arm64 artifacts are built and attached later through a separate manual workflow after diagnostics pass.

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
11. If macOS distribution is approved for the release, run macOS diagnostics and then attach macOS assets to the same GitHub Release.

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

Local Windows verification may only have the Windows ZIP. The release workflow verifies Windows ZIP, Linux AppImage, and `latest-linux.yml` after downloading artifacts from both OS jobs.

## Tagging

```powershell
git tag v0.2.1
git push origin v0.2.1
```

Tag push starts `.github/workflows/release.yml`. That workflow publishes the Windows/Linux core release only.

Do not delete or recreate a local or remote release tag without explicit user approval.

## GitHub Actions Release Flow

1. Windows runner builds the Windows ZIP.
2. Linux runner builds the Linux AppImage artifact.
3. Release job downloads both artifacts.
4. OS build jobs verify unpacked packaged apps before upload.
5. Release job creates `checksums.txt` and `SuwolVisualReference-<version>-checksums.txt`.
6. Release job signs both checksum files with the `GPG_PRIVATE_KEY_B64` and `GPG_PASSPHRASE` secrets.
7. Release job verifies checksums and detached GPG signatures with `suwol-release-public-key.asc`.
8. Release job verifies AppImage/update metadata release assets.
9. Release job verifies ZIP structure and forbidden-path rules.
10. Release job publishes the GitHub Release.

## macOS Attach Flow

macOS builds are not part of push CI or the default tag release. Use this sequence only on a trusted Apple Silicon self-hosted runner:

1. Run `.github/workflows/macos-build-diagnostics.yml` manually.
2. Confirm Node, Xcode, keychain, signing identity, notary profile, native modules, DMG, notarization, and stapling diagnostics pass.
3. Run `.github/workflows/attach-macos-release.yml` manually with the existing release tag.
4. Confirm macOS arm64 DMG and optional `latest-mac.yml` were attached to the existing release.
5. Confirm `checksums.txt`, `SuwolVisualReference-<version>-checksums.txt`, and their `.asc` signatures were refreshed.

Do not build universal or Intel macOS assets for this release line. Do not pass Apple notary passwords on the command line; use the stored `suwol-notary-profile`.

## Failure Recovery

If the tag already exists and a tag-triggered run fails after a workflow fix, run the Release workflow manually with `workflow_dispatch` and the existing release tag.

Use tag deletion/recreation only when the user explicitly approves it.

## Release Assets

Expected asset names:

- `SuwolVisualReference-<version>-win-x64.zip`
- `SuwolVisualReference-<version>-linux-x64.AppImage`
- `SuwolVisualReference-<version>-mac-arm64.dmg` after macOS attachment
- `latest-linux.yml`
- `latest-mac.yml` after macOS attachment
- `checksums.txt`
- `checksums.txt.asc`
- `SuwolVisualReference-<version>-checksums.txt`
- `SuwolVisualReference-<version>-checksums.txt.asc`
- `suwol-release-public-key.asc`

The app itself keeps the user-facing name `Suwol Visual Reference`.

Linux AppImage update QA is separate from Windows ZIP smoke QA. Confirm that Settings/About reports update support in the AppImage, that Windows ZIP builds report automatic updates as unsupported, and that `latest-linux.yml` is included in checksums.
