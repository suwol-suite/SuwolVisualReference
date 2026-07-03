# i18n Notes

## Supported Languages

- `ko`: Korean
- `en`: English

Language display metadata lives in `src/shared/i18n/languages.ts`.

## Default Language Policy

Renderer language is resolved in this order:

1. Saved `app.language` preference in `localStorage`
2. `navigator.languages` / OS locale, Korean first
3. English if the system locale starts with `en`
4. Korean fallback

Supported saved values are `system`, `ko`, and `en`. `system` stores the preference while still resolving the active UI language from the OS/browser locale. The setting applies immediately and survives restart.

## Locale File Structure

```text
src/shared/i18n/types.ts
src/shared/i18n/languages.ts
src/renderer/src/i18n.ts
src/renderer/src/locales/ko/common.json
src/renderer/src/locales/en/common.json
src/renderer/src/locales/ko/settings.json
src/renderer/src/locales/en/settings.json
src/renderer/src/locales/ko/export.json
src/renderer/src/locales/en/export.json
src/renderer/src/locales/ko/errors.json
src/renderer/src/locales/en/errors.json
```

Namespaces start broad and practical:

- `common`: app shell, sidebar, toolbar, grid, inspector, import status, smart folder labels
- `settings`: settings modal
- `export`: export dialog and preset display labels
- `errors`: user-facing error messages and error code labels

The large-library and desktop UX passes keep new grid, selection, tag manager, filter, viewer, and duplicate resolution UI in `common`:

- `assetGrid.totalCount`, `assetGrid.filteredCount`, `assetGrid.loadedCount`, `assetGrid.loadMore`
- `multiSelection.*` for the multi-asset inspector summary
- `filter.*` for the toolbar popover
- `viewer.*` for large-viewer controls
- `tagManager.*` for tag creation, search, unused-only view, delete confirmations, and merge actions
- `duplicates.*` for duplicate center labels, status display, recommended keep reasons, and merge/trash confirmations
- `batchResult.*` and `permanentDeleteResult.*` for batch operation and permanent-delete result dialogs
- `settings.aboutDescription` and `settings.version` for the settings About block

User-created tag names, collection names, file names, and memo/source text are displayed as stored and are not translated.
The product name `Suwol Visual Reference` is not translated and should be displayed verbatim in every locale.

## Adding A Language

1. Add the language code to `LocaleCode` in `src/shared/i18n/types.ts`.
2. Add display metadata to `SUPPORTED_LANGUAGES` in `src/shared/i18n/languages.ts`.
3. Add matching namespace JSON files under `src/renderer/src/locales/<language>/`.
4. Import the JSON files and add them to `resources` in `src/renderer/src/i18n.ts`.
5. Add `config/export-presets.<language>.json` and `config/export-templates/codex.<language>.json` if export Markdown should be localized.
6. Run `npm.cmd run i18n:check`.

## Key Naming

Use semantic keys, such as:

- `sidebar.library`
- `toolbar.importFolder`
- `assetGrid.emptyTitle`
- `inspector.sourceUrl`
- `export.outputFile`
- `errors.codes.IMPORT_FAILED`

Do not use meaningless keys such as `text1`, `button2`, or `messageA`.

## Values That Must Not Be Translated

- DB enum values such as `image`, `folder`, `completed`
- Language codes such as `ko`, `en`, `system`
- Smart folder query field values stored in `query_json`
- User-created tag names, collection names, memos, source URLs, and filenames
- Asset hashes and library-relative paths

Default tag compatibility is intentionally minimal. New libraries seed zero default tags from `config/default-tags.json`; existing DB tag names are not renamed, deleted, or translated by locale changes.

## Export Localization

The renderer sends `ExportInput.locale` with export requests. The main process then prefers:

- `config/export-templates/codex.<locale>.json`
- `config/export-presets.<locale>.json`

If a locale file is missing, the main process falls back to the neutral `codex.json` and `export-presets.json` files. User-entered export text is never auto-translated.

## Hardcoded String Checks

Run:

```powershell
npm.cmd run i18n:check
```

This compares `ko` and `en` locale key structures and fails on missing keys, extra keys, or empty strings.

For manual review, search renderer files for visible text candidates:

```powershell
rg -n "title=\"|placeholder=\"|window\\.confirm|>[^<{]*[A-Za-z가-힣][^<{]*<" src\renderer\src
```

Some matches are expected for internal identifiers, type names, user content, and i18n keys.

When adding management UI, add Korean and English keys in the same patch and run `npm.cmd run i18n:check` before manual testing. The check compares nested key structure across `ko` and `en`, so status subkeys such as `duplicates.status.unresolved` must exist in both languages.
