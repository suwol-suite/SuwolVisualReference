# Release Process

This project publishes portable ZIP builds through GitHub Actions.

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
7. Create and push the tag.
8. Watch GitHub Actions.
9. Confirm the GitHub Release assets and checksums.

## Local Windows Checks

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

Local Windows verification may only have the Windows ZIP. The release workflow verifies both Windows and Linux ZIP files after downloading artifacts from both OS jobs.

## Tagging

```powershell
git tag v0.1.2
git push origin v0.1.2
```

Tag push starts `.github/workflows/release.yml`.

Do not delete or recreate a local or remote release tag without explicit user approval.

## GitHub Actions Release Flow

1. Windows runner builds the Windows ZIP.
2. Linux runner builds the Linux ZIP.
3. Release job downloads both artifacts.
4. Release job creates `SuwolVisualReference-<version>-checksums.txt`.
5. Release job verifies checksums.
6. Release job verifies ZIP structure and forbidden-path rules.
7. Release job publishes the GitHub Release.

## Failure Recovery

If the tag already exists and a tag-triggered run fails after a workflow fix, run the Release workflow manually with `workflow_dispatch` and the existing release tag.

Use tag deletion/recreation only when the user explicitly approves it.

## Release Assets

Expected asset names:

- `SuwolVisualReference-<version>-win-x64.zip`
- `SuwolVisualReference-<version>-linux-x64.zip`
- `SuwolVisualReference-<version>-checksums.txt`

The app itself keeps the user-facing name `Suwol Visual Reference`.
