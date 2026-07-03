# Manual QA Checklist

Use this checklist before promoting a release. Do not upload private assets, copyrighted files, SQLite databases, tokens, certificates, or keys to public issues.

## Package Startup

- [ ] Download the Windows ZIP from GitHub Releases.
- [ ] Extract the Windows ZIP and run `Suwol Visual Reference.exe`.
- [ ] Download the Linux ZIP from GitHub Releases.
- [ ] Extract the Linux ZIP.
- [ ] Add execute permission on Linux if needed.
- [ ] Launch the Linux app.
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
- [ ] Switch between library, favorites, trash, duplicates, tag, collection, and smart folder views.

## Asset UX

- [ ] Single-select an asset.
- [ ] Ctrl/Cmd-click to toggle selection.
- [ ] Shift-click to select a range.
- [ ] Drag-box select visible assets.
- [ ] Open the large image viewer.
- [ ] Zoom, pan, reset, previous, and next in the viewer.

## Metadata

- [ ] Add and remove tags.
- [ ] Use the tag manager to create, rename, recolor, merge, and delete tags.
- [ ] Edit memo, source URL, rating, and favorite state.
- [ ] Create a collection.
- [ ] Add selected assets to a collection.
- [ ] Create and use a smart folder.

## Safety Workflows

- [ ] Move assets to trash.
- [ ] Restore assets from trash.
- [ ] Permanently delete trash assets and confirm only library-internal copies are removed.
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
