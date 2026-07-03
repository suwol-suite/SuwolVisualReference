import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { AssetImportService } from './services/asset-import-service';
import { ExportService } from './services/export-service';
import { LibraryService } from './services/library-service';
import { PermanentDeleteService } from './services/permanent-delete-service';

export async function runSmokeTest(): Promise<void> {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const rootPath = path.join(process.cwd(), '.codex-run', `smoke-library-${runId}`);
  const fixturePath = path.join(process.cwd(), '.codex-run', `fixture-${runId}.png`);
  const permanentDeleteFixturePath = path.join(process.cwd(), '.codex-run', `delete-candidate-${runId}.png`);
  const folderFixtureRoot = path.join(process.cwd(), '.codex-run', `folder-fixture-${runId}`);
  const folderNestedPath = path.join(folderFixtureRoot, 'nested');
  const droppedFolderFixtureRoot = path.join(process.cwd(), '.codex-run', `dropped-folder-fixture-${runId}`);
  const droppedFolderNestedPath = path.join(droppedFolderFixtureRoot, 'nested');

  await fs.mkdir(path.dirname(fixturePath), { recursive: true });
  await fs.mkdir(folderNestedPath, { recursive: true });
  await fs.mkdir(droppedFolderNestedPath, { recursive: true });
  await sharp({
    create: {
      width: 320,
      height: 180,
      channels: 4,
      background: { r: 34, g: 153, b: 128, alpha: 1 }
    }
  })
    .png()
    .toFile(fixturePath);
  await sharp({
    create: {
      width: 132,
      height: 96,
      channels: 4,
      background: { r: 208, g: 80, b: 112, alpha: 1 }
    }
  })
    .png()
    .toFile(permanentDeleteFixturePath);
  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: { r: 192, g: 120, b: 76, alpha: 1 }
    }
  })
    .png()
    .toFile(path.join(folderFixtureRoot, 'folder-a.png'));
  await sharp({
    create: {
      width: 120,
      height: 220,
      channels: 4,
      background: { r: 90, g: 136, b: 214, alpha: 1 }
    }
  })
    .jpeg()
    .toFile(path.join(folderNestedPath, 'folder-b.jpg'));
  await fs.writeFile(path.join(folderFixtureRoot, 'notes.txt'), 'unsupported smoke fixture', 'utf8');
  await sharp({
    create: {
      width: 96,
      height: 144,
      channels: 4,
      background: { r: 160, g: 88, b: 180, alpha: 1 }
    }
  })
    .png()
    .toFile(path.join(droppedFolderNestedPath, 'dropped-c.png'));
  await fs.writeFile(path.join(droppedFolderFixtureRoot, 'dropped-notes.txt'), 'unsupported dropped folder fixture', 'utf8');

  const libraryService = new LibraryService();
  const importService = new AssetImportService(libraryService);
  const exportService = new ExportService(libraryService);
  const permanentDeleteService = new PermanentDeleteService(libraryService);

  const library = await libraryService.createLibrary(rootPath, 'Smoke Library');
  const importSummary = await importService.importFiles({ filePaths: [fixturePath], duplicateMode: 'skip' });
  const importedAsset = importSummary.items.find((item) => item.status === 'imported')?.asset;

  if (!importedAsset) {
    throw new Error(`Smoke import failed: ${JSON.stringify(importSummary.items)}`);
  }
  if (importSummary.total !== 1 || importSummary.supported !== 1 || !importSummary.batchId) {
    throw new Error(`Smoke import summary missed batch/count fields: ${JSON.stringify(importSummary)}`);
  }

  const db = libraryService.requireDb();
  if (db.listTags().length !== 0) {
    throw new Error('New libraries should not auto-create default tags.');
  }
  const tag = db.createTag('smoke-tag', '#78dcca');
  db.assignTag(importedAsset.id, tag.id);
  db.updateAsset({
    id: importedAsset.id,
    memo: 'Imported by the smoke pipeline.',
    rating: 4,
    isFavorite: true
  });

  const permanentDeleteImport = await importService.importFiles({
    filePaths: [permanentDeleteFixturePath],
    duplicateMode: 'skip'
  });
  const permanentDeleteAsset = permanentDeleteImport.items.find((item) => item.status === 'imported')?.asset;
  if (!permanentDeleteAsset) {
    throw new Error(`Permanent-delete fixture import failed: ${JSON.stringify(permanentDeleteImport.items)}`);
  }
  db.trashAssets([permanentDeleteAsset.id]);
  if (permanentDeleteAsset.thumbnailPath) {
    await fs.rm(db.resolvePath(permanentDeleteAsset.thumbnailPath), { force: true });
  }
  const permanentDeleteResult = await permanentDeleteService.permanentlyDeleteTrashAssets([permanentDeleteAsset.id]);
  if (
    permanentDeleteResult.successCount !== 1 ||
    permanentDeleteResult.failedCount !== 0 ||
    permanentDeleteResult.missingFileCount < 1 ||
    permanentDeleteResult.warnings.length < 1 ||
    db.getAssetAllowDeleted(permanentDeleteAsset.id)
  ) {
    throw new Error(`Permanent delete result did not handle missing internal files correctly: ${JSON.stringify(permanentDeleteResult)}`);
  }
  await fs.access(permanentDeleteFixturePath);

  const duplicateSummary = await importService.importFiles({ filePaths: [fixturePath], duplicateMode: 'skip' });
  if (duplicateSummary.duplicates !== 1) {
    throw new Error(`Expected duplicate import to be skipped, got ${JSON.stringify(duplicateSummary.items)}`);
  }

  const duplicateAddSummary = await importService.importFiles({ filePaths: [fixturePath], duplicateMode: 'add' });
  const duplicateAsset = duplicateAddSummary.items.find((item) => item.status === 'imported')?.asset;
  if (!duplicateAsset) {
    throw new Error(`Expected duplicate import with add mode to create an asset: ${JSON.stringify(duplicateAddSummary.items)}`);
  }

  const batchTag = db.createTag('smoke-batch-tag', '#38bdf8');
  const batchTagResult = db.batchAddTags({
    assetIds: [importedAsset.id, duplicateAsset.id, 'missing-smoke-asset'],
    tagIds: [batchTag.id]
  });
  if (batchTagResult.successCount !== 2 || batchTagResult.failedCount !== 1 || batchTagResult.requestedCount !== 3) {
    throw new Error(`Batch tag result did not report partial success correctly: ${JSON.stringify(batchTagResult)}`);
  }
  const batchRatingResult = db.batchSetRating({ assetIds: [importedAsset.id, duplicateAsset.id], rating: 5 });
  if (batchRatingResult.successCount !== 2 || batchRatingResult.failedCount !== 0) {
    throw new Error(`Batch rating failed: ${JSON.stringify(batchRatingResult)}`);
  }
  const batchFavoriteResult = db.batchSetFavorite({ assetIds: [importedAsset.id, duplicateAsset.id], isFavorite: true });
  if (batchFavoriteResult.successCount !== 2 || batchFavoriteResult.failedCount !== 0) {
    throw new Error(`Batch favorite failed: ${JSON.stringify(batchFavoriteResult)}`);
  }
  const batchCollection = db.createCollection('Smoke Batch Collection', 'Generated by batch smoke test.', '#38bdf8');
  const batchCollectionResult = db.batchAddAssetsToCollection({
    collectionId: batchCollection.id,
    assetIds: [importedAsset.id, duplicateAsset.id]
  });
  if (batchCollectionResult.successCount !== 2 || batchCollectionResult.failedCount !== 0) {
    throw new Error(`Batch collection add failed: ${JSON.stringify(batchCollectionResult)}`);
  }
  const batchedImportedAsset = db.getAsset(importedAsset.id);
  if (
    batchedImportedAsset?.rating !== 5 ||
    !batchedImportedAsset.isFavorite ||
    !batchedImportedAsset.tags.some((candidate) => candidate.id === batchTag.id) ||
    !batchedImportedAsset.collections.some((candidate) => candidate.id === batchCollection.id)
  ) {
    throw new Error('Batch metadata operations did not persist on the imported asset.');
  }

  const queryPage = db.queryAssets({ limit: 1, offset: 0 });
  if (queryPage.items.length !== 1 || queryPage.totalCount < 2 || !queryPage.hasMore) {
    throw new Error(`Asset query pagination fields were not returned correctly: ${JSON.stringify(queryPage)}`);
  }

  const renamedTag = db.createTag('smoke-rename-me', '#111111');
  const updatedTag = db.updateTag({ id: renamedTag.id, name: 'smoke-renamed', color: '#abcdef' });
  if (updatedTag.name !== 'smoke-renamed' || updatedTag.color !== '#abcdef') {
    throw new Error(`Tag update failed: ${JSON.stringify(updatedTag)}`);
  }

  const mergeTargetTag = db.createTag('smoke-merge-target', '#00ffcc');
  const mergeSourceTag = db.createTag('smoke-merge-source', '#cc00ff');
  db.assignTag(importedAsset.id, mergeSourceTag.id);
  db.mergeTags({ sourceTagIds: [mergeSourceTag.id], targetTagId: mergeTargetTag.id });
  const tagMergedAsset = db.getAsset(importedAsset.id);
  if (!tagMergedAsset?.tags.some((candidate) => candidate.id === mergeTargetTag.id)) {
    throw new Error('Tag merge did not attach the target tag to the source assets.');
  }
  if (db.listTags().some((candidate) => candidate.id === mergeSourceTag.id)) {
    throw new Error('Tag merge did not delete the source tag.');
  }

  const deletedUnusedTags = db.deleteUnusedTags();
  if (deletedUnusedTags < 1 || db.listTags().some((candidate) => candidate.id === updatedTag.id)) {
    throw new Error('Unused tag deletion did not remove unused tags.');
  }

  const duplicateMetadataTag = db.createTag('smoke-duplicate-metadata', '#ffaa00');
  db.assignTag(duplicateAsset.id, duplicateMetadataTag.id);
  db.updateAsset({
    id: duplicateAsset.id,
    memo: 'Merged duplicate memo.',
    sourceUrl: 'https://example.test/suwol-visual-reference-smoke'
  });
  const duplicateGroupsBeforeMerge = db.listDuplicateGroups();
  if (!duplicateGroupsBeforeMerge.some((group) => group.hash === importedAsset.hash && group.assets.length === 2)) {
    throw new Error(`Duplicate group lookup failed: ${JSON.stringify(duplicateGroupsBeforeMerge)}`);
  }
  db.mergeDuplicateAssets({
    hash: importedAsset.hash,
    targetAssetId: importedAsset.id,
    sourceAssetIds: [duplicateAsset.id],
    moveSourcesToTrash: true
  });
  const mergedDuplicateTarget = db.getAsset(importedAsset.id);
  if (
    !mergedDuplicateTarget?.tags.some((candidate) => candidate.id === duplicateMetadataTag.id) ||
    !mergedDuplicateTarget.memo.includes('Merged duplicate memo.') ||
    mergedDuplicateTarget.sourceUrl !== 'https://example.test/suwol-visual-reference-smoke'
  ) {
    throw new Error('Duplicate metadata merge did not preserve source metadata.');
  }
  if (!db.listAssets({ trashOnly: true }).some((asset) => asset.id === duplicateAsset.id)) {
    throw new Error('Duplicate merge did not move the source duplicate to trash.');
  }
  db.restoreAssets([duplicateAsset.id]);
  if (!db.listAssets().some((asset) => asset.id === duplicateAsset.id)) {
    throw new Error('Duplicate source asset did not restore from trash.');
  }
  db.trashAssets([duplicateAsset.id]);

  const droppedFolderSummary = await importService.importFiles({
    filePaths: [droppedFolderFixtureRoot],
    duplicateMode: 'skip'
  });
  if (
    droppedFolderSummary.sourceType !== 'folder' ||
    droppedFolderSummary.total !== 2 ||
    droppedFolderSummary.supported !== 1 ||
    droppedFolderSummary.imported !== 1 ||
    droppedFolderSummary.unsupported !== 1 ||
    !droppedFolderSummary.items.some((item) => item.originalRelativePath === 'nested/dropped-c.png')
  ) {
    throw new Error(`Dropped folder import did not recurse correctly: ${JSON.stringify(droppedFolderSummary)}`);
  }

  const folderImportSummary = await importService.importFolder({ folderPath: folderFixtureRoot, duplicateMode: 'skip' });
  if (
    folderImportSummary.total !== 3 ||
    folderImportSummary.supported !== 2 ||
    folderImportSummary.imported !== 2 ||
    folderImportSummary.unsupported !== 1 ||
    !folderImportSummary.batchId
  ) {
    throw new Error(`Folder import summary did not match fixtures: ${JSON.stringify(folderImportSummary)}`);
  }

  const folderAssets = db.listAssets({ search: 'folder-' });
  if (folderAssets.length !== 2 || folderAssets.some((asset) => !asset.originalRelativePath || !asset.importBatchId)) {
    throw new Error('Folder import did not persist original relative paths and import batch ids.');
  }

  const smartFolder = db.createSmartFolder('Rated Smoke Assets', {
    mode: 'all',
    conditions: [{ field: 'rating', operator: '>=', value: 4 }]
  });
  const smartFolderAssets = db.listAssets({ smartFolderId: smartFolder.id });
  if (!smartFolderAssets.some((asset) => asset.id === importedAsset.id)) {
    throw new Error('Smart folder query did not include the rated smoke asset.');
  }

  db.trashAssets([importedAsset.id]);
  if (!db.listAssets({ trashOnly: true }).some((asset) => asset.id === importedAsset.id)) {
    throw new Error('Trash view did not include the trashed smoke asset.');
  }
  if (db.listAssets().some((asset) => asset.id === importedAsset.id)) {
    throw new Error('Default asset list included a trashed smoke asset.');
  }
  db.restoreAssets([importedAsset.id]);
  if (!db.listAssets().some((asset) => asset.id === importedAsset.id)) {
    throw new Error('Restored smoke asset did not return to the default list.');
  }

  const collection = db.createCollection('Smoke Collection', 'Generated by smoke test.', '#f59e0b');
  db.addAssetsToCollection(collection.id, [importedAsset.id]);

  const exportResult = await exportService.exportMarkdown({
    name: 'smoke-export',
    goal: 'Verify Suwol Visual Reference export generation.',
    commonTraits: 'Clean thumbnail, preserved metadata, useful palette.',
    instructions: 'Use this image as a local reference.',
    constraints: 'Do not ignore tags or memo.',
    outputFileName: 'instruction.md',
    assetIds: [importedAsset.id],
    collectionId: null
  });

  await fs.access(path.join(rootPath, 'ref-forge-library.json'));
  await fs.access(path.join(rootPath, 'db.sqlite'));
  await fs.access(db.resolvePath(importedAsset.storedFilePath));
  if (importedAsset.thumbnailPath) {
    await fs.access(db.resolvePath(importedAsset.thumbnailPath));
  }
  await fs.access(exportResult.markdownPath);
  const refs = await fs.readdir(exportResult.refsPath);
  if (refs.length !== 1) {
    throw new Error(`Expected 1 copied ref file, found ${refs.length}.`);
  }
  await fs.access(path.join(exportResult.refsPath, refs[0]));

  await libraryService.openLibrary(rootPath);
  const persistedAssets = libraryService.requireDb().listAssets({ search: 'fixture' });

  if (persistedAssets.length !== 1) {
    throw new Error(`Expected 1 persisted asset, found ${persistedAssets.length}.`);
  }
  if (
    persistedAssets[0].rating !== 5 ||
    !persistedAssets[0].memo.includes('Imported by the smoke pipeline.') ||
    !persistedAssets[0].memo.includes('Merged duplicate memo.')
  ) {
    throw new Error('Persisted asset metadata did not match the saved memo/rating.');
  }
  if (!persistedAssets[0].isFavorite) {
    throw new Error('Persisted favorite flag did not survive reopen.');
  }
  if (!persistedAssets[0].tags.some((persistedTag) => persistedTag.name === 'smoke-tag')) {
    throw new Error('Persisted tag relation did not survive reopen.');
  }
  if (!persistedAssets[0].collections.some((persistedCollection) => persistedCollection.name === 'Smoke Collection')) {
    throw new Error('Persisted collection relation did not survive reopen.');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        library: libraryService.getActiveSummary() ?? library,
        imported: importSummary.imported,
        folderImported: folderImportSummary.imported,
        droppedFolderImported: droppedFolderSummary.imported,
        duplicateSkipped: duplicateSummary.duplicates,
        assetId: importedAsset.id,
        thumbnailPath: importedAsset.thumbnailPath,
        markdownPath: exportResult.markdownPath,
        persistedAssets: persistedAssets.length
      },
      null,
      2
    )
  );
}
