# Manual QA Checklist

Use this checklist before promoting a release. Do not upload private assets, copyrighted files, SQLite databases, tokens, certificates, or keys to public issues.

## Package Startup

- [ ] Download the Windows ZIP from GitHub Releases.
- [ ] Extract the Windows ZIP and run `Suwol Visual Reference.exe`.
- [ ] Run `Suwol Visual Reference.exe --version` and confirm the version.
- [ ] Download the Linux ZIP from GitHub Releases.
- [ ] Extract the Linux ZIP.
- [ ] Add execute permission on Linux if needed.
- [ ] Launch the Linux app.
- [ ] Run the Linux executable with `--version` and confirm the version.
- [ ] Confirm the app title is `Suwol Visual Reference`.
- [ ] Confirm Windows SmartScreen behavior is understood for unsigned builds.

## Library Basics

- [ ] Create a new library.
- [ ] Open an existing library.
- [ ] Open a library from the recent library list.
- [ ] Drag a library folder onto the welcome screen and confirm it opens.
- [ ] Restart the app and confirm settings and recent libraries persist.

## Import

- [ ] Import a single image file.
- [ ] Import multiple image files.
- [ ] Import a nested folder.
- [ ] Drag a folder into an open library and confirm nested images import.
- [ ] Confirm unsupported files are reported without modifying the source folder.

## Library Navigation

- [ ] Scroll a large library.
- [ ] Load more assets with pagination.
- [ ] Search by filename, tag, memo, extension, or URL.
- [ ] Switch between grid view and list view.
- [ ] Sort by imported date, name, file size, resolution, rating, and extension.
- [ ] Use advanced filters for extension, rating, included/excluded tag, aspect, dimensions, memo, source URL, recency, favorites, duplicates, and trash/deleted state.
- [ ] Switch between library, favorites, trash, duplicates, tag, collection, and smart folder views.
- [ ] Open the filter popover, use Apply and Clear, close it with ESC, and close it by clicking outside.

## Asset UX

- [ ] Single-select an asset.
- [ ] Ctrl/Cmd-click to toggle selection.
- [ ] Shift-click to select a range.
- [ ] Drag-box select visible assets.
- [ ] Press Ctrl/Cmd+A outside text inputs and confirm loaded assets are selected.
- [ ] Press ESC and confirm selection clears.
- [ ] Press Delete outside text inputs and confirm selected assets move to trash after confirmation.
- [ ] Confirm text selection works in inputs and textareas, but not across the app chrome.
- [ ] Open the large image viewer.
- [ ] Open the large image viewer with Enter/Space.
- [ ] Zoom, pan, reset, previous, next, and ESC close in the viewer.
- [ ] Confirm failed preview loading shows a placeholder.

## Metadata

- [ ] Add and remove tags.
- [ ] Use the tag manager to create, rename, recolor, merge, and delete tags.
- [ ] Edit memo, source URL, rating, and favorite state.
- [ ] Create a collection.
- [ ] Add selected assets to a collection.
- [ ] Use the collection manager to rename, recolor, edit description, set/clear cover, and delete a collection.
- [ ] Create and use a smart folder.
- [ ] Create smart folder conditions with media type, width, and height fields.

## Safety Workflows

- [ ] Move assets to trash.
- [ ] Restore assets from trash.
- [ ] Permanently delete trash assets and confirm only library-internal copies are removed.
- [ ] Review permanent delete partial failure details if any file cannot be removed.
- [ ] Review duplicate groups.
- [ ] Merge duplicate metadata.
- [ ] Ignore or resolve duplicate groups.

## Export

- [ ] Export selected assets to Codex Markdown.
- [ ] Export a collection to Codex Markdown.
- [ ] Confirm exported references use relative paths.

## Localization

- [ ] Switch to Korean.
- [ ] Switch to English.
- [ ] Restart the app and confirm language preference persists.

## Release Assets

- [ ] Confirm Windows ZIP exists.
- [ ] Confirm Linux ZIP exists.
- [ ] Confirm checksums file exists.
- [ ] Verify ZIP hashes against the checksums file.
