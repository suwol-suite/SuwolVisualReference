# npm Audit Notes

Checked on 2026-07-04.

## Commands

```powershell
npm.cmd audit --omit=dev
npm.cmd audit --audit-level=high
npm.cmd audit
```

## Result

`npm.cmd audit --omit=dev` reports 0 production dependency vulnerabilities.

`npm.cmd audit --audit-level=high` and the full audit report 4 vulnerabilities after adding `electron-builder` as a dev-only packaging dependency:

- `electron <=39.8.4`: high aggregate severity, direct dev dependency used to run the desktop app.
- `vite <=6.4.2`: high aggregate severity, direct dev dependency.
- `electron-vite <=3.0.0`: moderate, affected through Vite/esbuild.
- `esbuild <=0.24.2`: moderate, transitive through Vite/electron-vite.

## Decision

No `npm audit fix --force` was run. npm recommends breaking upgrades such as `electron@43.0.0`, `vite@8.1.3`, and newer `electron-vite` lines. Those upgrades may affect Electron runtime behavior, native ABI rebuilds, and the electron-vite config surface.

The current v0.1.1 release keeps the working Electron/Vite stack stable and documents the remaining dev-only audit items. Before a future dependency-refresh release, upgrade Electron and Vite/electron-vite together in a dedicated compatibility pass, then run:

```powershell
npm.cmd install
npm.cmd run rebuild:native
npm.cmd run icons:generate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run i18n:check
npm.cmd run license:check
npm.cmd run build
npm.cmd run smoke
npm.cmd run pack:win
npm.cmd run test:ui-import
```

The 2026-07-03 stabilization pass added `electron-builder` for Windows packaging, renamed public package metadata to Suwol Visual Reference, and did not run `npm audit fix --force`.

The 2026-07-04 release-prep pass keeps `npm audit --omit=dev` as the required runtime audit gate in CI and release verification. Dev/tooling audit items remain documented for a future Electron/Vite compatibility pass.

## Mitigations Already Present

- `nodeIntegration` is disabled in the renderer.
- `contextIsolation` is enabled.
- Renderer code uses the preload IPC bridge and does not import `fs`, `better-sqlite3`, or `sharp`.
- New windows are denied and external URLs are opened through Electron shell.
