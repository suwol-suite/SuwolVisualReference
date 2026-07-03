import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { AssetPermanentDeleteResult, AssetRecord } from '@shared/types';
import type { LibraryService } from './library-service';

export class PermanentDeleteService {
  constructor(private readonly libraryService: LibraryService) {}

  async permanentlyDeleteTrashAssets(assetIds: string[]): Promise<AssetPermanentDeleteResult> {
    const db = this.libraryService.requireDb();
    const batchId = crypto.randomUUID();
    const uniqueAssetIds = uniqueStrings(assetIds);
    const result: AssetPermanentDeleteResult = {
      batchId,
      requestedCount: uniqueAssetIds.length,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      affectedAssetIds: [],
      failures: [],
      warnings: [],
      deletedFileCount: 0,
      missingFileCount: 0,
      failedFileCount: 0,
      fileResults: []
    };

    for (const assetId of uniqueAssetIds) {
      const asset = db.getAssetAllowDeleted(assetId);
      if (!asset) {
        result.failedCount += 1;
        result.failures.push({
          assetId,
          code: 'ASSET_NOT_FOUND',
          message: 'Asset was not found or is already permanently deleted.'
        });
        continue;
      }

      if (!asset.isDeleted) {
        result.failedCount += 1;
        result.failures.push({
          assetId: asset.id,
          title: asset.title,
          code: 'NOT_IN_TRASH',
          message: 'Permanent delete is only available for assets in the trash.'
        });
        continue;
      }

      const fileResults = await this.deleteInternalAssetFilesWithResult(asset);
      result.fileResults.push(...fileResults);
      result.deletedFileCount += fileResults.filter((fileResult) => fileResult.status === 'deleted').length;
      result.missingFileCount += fileResults.filter((fileResult) => fileResult.status === 'already_missing').length;

      const failedFiles = fileResults.filter(
        (fileResult) => fileResult.status === 'failed' || fileResult.status === 'outside_library'
      );
      result.failedFileCount += failedFiles.length;

      if (failedFiles.length > 0) {
        result.failedCount += 1;
        const message = failedFiles
          .map((fileResult) => `${fileResult.target}: ${fileResult.errorMessage ?? fileResult.status}`)
          .join('; ');
        result.failures.push({
          assetId: asset.id,
          title: asset.title,
          code: 'FILE_DELETE_FAILED',
          message
        });
        db.recordPermanentDeleteFailure(asset.id, batchId, message);
        continue;
      }

      try {
        db.markAssetsPermanentlyDeletedWithBatch([asset.id], batchId);
        result.successCount += 1;
        result.affectedAssetIds.push(asset.id);
        for (const fileResult of fileResults) {
          if (fileResult.status === 'already_missing') {
            result.warnings.push({
              assetId: asset.id,
              title: asset.title,
              target: fileResult.relativePath,
              code: 'ALREADY_MISSING',
              message: `${fileResult.target} was already missing.`
            });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.failedCount += 1;
        result.failures.push({
          assetId: asset.id,
          title: asset.title,
          code: 'DB_TOMBSTONE_FAILED',
          message
        });
        db.recordPermanentDeleteFailure(asset.id, batchId, message);
      }
    }

    return result;
  }

  private async deleteInternalAssetFilesWithResult(asset: AssetRecord): Promise<AssetPermanentDeleteResult['fileResults']> {
    const db = this.libraryService.requireDb();
    const rootPath = path.resolve(this.libraryService.requireRootPath());
    const targets = [
      { target: 'original' as const, relativePath: asset.storedFilePath },
      { target: 'thumbnail' as const, relativePath: asset.thumbnailPath },
      { target: 'preview' as const, relativePath: asset.previewPath }
    ].filter((target): target is { target: 'original' | 'thumbnail' | 'preview'; relativePath: string } =>
      Boolean(target.relativePath)
    );

    const results: AssetPermanentDeleteResult['fileResults'] = [];
    for (const target of targets) {
      const absolutePath = path.resolve(db.resolvePath(target.relativePath));
      if (!isWithinPath(rootPath, absolutePath)) {
        results.push({
          assetId: asset.id,
          title: asset.title,
          target: target.target,
          relativePath: target.relativePath,
          status: 'outside_library',
          errorCode: 'OUTSIDE_LIBRARY',
          errorMessage: 'Resolved path is outside the active library root.'
        });
        continue;
      }

      try {
        await fsp.rm(absolutePath, { force: false });
        results.push({
          assetId: asset.id,
          title: asset.title,
          target: target.target,
          relativePath: target.relativePath,
          status: 'deleted'
        });
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'UNKNOWN';
        if (code === 'ENOENT') {
          results.push({
            assetId: asset.id,
            title: asset.title,
            target: target.target,
            relativePath: target.relativePath,
            status: 'already_missing',
            errorCode: code,
            errorMessage: 'File was already missing.'
          });
          continue;
        }

        results.push({
          assetId: asset.id,
          title: asset.title,
          target: target.target,
          relativePath: target.relativePath,
          status: 'failed',
          errorCode: code,
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return results;
  }
}

function isWithinPath(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
