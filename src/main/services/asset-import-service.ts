import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { lookup } from 'mime-types';
import type {
  AppConfig,
  DuplicateMode,
  ImportFilesInput,
  ImportFolderInput,
  ImportItemResult,
  ImportMetrics,
  ImportSummary
} from '@shared/types';
import { loadAppConfig } from './config-service';
import type { LibraryService } from './library-service';
import { MediaService } from './media-service';

const IMPORT_CONCURRENCY = 3;
const FOLDER_RESULT_ITEM_LIMIT = 1200;

type ImportContext = {
  batchId?: string;
  duplicateMode: DuplicateMode;
  basePath?: string;
  relativePathByFile?: Map<string, string | null>;
  metrics: ImportMetrics;
  keepAssetPayloads: boolean;
};

type ExpandedImportInput = {
  filePaths: string[];
  unsupportedItems: ImportItemResult[];
  totalCount: number;
  supportedCount: number;
  scanDurationMs: number;
  sourceType: 'files' | 'folder' | 'clipboard';
  sourcePath: string;
  compactItems: boolean;
  keepAssetPayloads: boolean;
  relativePathByFile: Map<string, string | null>;
};

export class AssetImportService {
  private readonly mediaService = new MediaService();

  constructor(private readonly libraryService: LibraryService) {}

  async importFiles(input: ImportFilesInput): Promise<ImportSummary> {
    const config = loadAppConfig();
    const startedAt = Date.now();
    const expanded = await expandImportInput(input, getSupportedImportExtensions(config));
    const db = this.libraryService.requireDb();
    const batch = db.createImportBatch({
      sourceType: expanded.sourceType,
      sourcePath: expanded.sourcePath,
      totalCount: expanded.totalCount,
      supportedCount: expanded.supportedCount
    });
    const metrics = createMetrics(expanded.totalCount, expanded.supportedCount);
    metrics.scanDurationMs = expanded.scanDurationMs;
    const context: ImportContext = {
      batchId: batch.id,
      duplicateMode: input.duplicateMode ?? 'skip',
      basePath: input.basePath,
      relativePathByFile: expanded.relativePathByFile,
      metrics,
      keepAssetPayloads: expanded.keepAssetPayloads
    };

    const processedItems = await mapWithConcurrency(expanded.filePaths, IMPORT_CONCURRENCY, (filePath) =>
      this.importOne(filePath, context)
    );
    return this.finishImportSummary({
      batchId: batch.id,
      sourceType: expanded.sourceType,
      sourcePath: expanded.sourcePath,
      startedAt,
      metrics,
      items: [...processedItems, ...expanded.unsupportedItems],
      compactItems: expanded.compactItems
    });
  }

  async importFolder(input: ImportFolderInput): Promise<ImportSummary> {
    const config = loadAppConfig();
    const startedAt = Date.now();
    const scanStartedAt = Date.now();
    const scan = await scanFolder(input.folderPath);
    const scanDurationMs = Date.now() - scanStartedAt;
    const supportedExtensions = getSupportedImportExtensions(config);
    const supportedPaths = scan.filePaths.filter((filePath) => isSupported(filePath, supportedExtensions));
    const unsupportedItems = scan.filePaths
      .filter((filePath) => !isSupported(filePath, supportedExtensions))
      .map((filePath): ImportItemResult => ({
        sourcePath: filePath,
        status: 'unsupported',
        error: `.${path.extname(filePath).replace('.', '').toLowerCase() || 'unknown'} is not supported.`,
        originalRelativePath: toOriginalRelativePath(input.folderPath, filePath)
      }));
    const db = this.libraryService.requireDb();
    const batch = db.createImportBatch({
      sourceType: 'folder',
      sourcePath: input.folderPath,
      totalCount: scan.filePaths.length,
      supportedCount: supportedPaths.length
    });
    const metrics = createMetrics(scan.filePaths.length, supportedPaths.length);
    metrics.scanDurationMs = scanDurationMs;

    const context: ImportContext = {
      batchId: batch.id,
      duplicateMode: input.duplicateMode ?? 'skip',
      basePath: input.folderPath,
      metrics,
      keepAssetPayloads: false
    };
    const processedItems = await mapWithConcurrency(supportedPaths, IMPORT_CONCURRENCY, (filePath) =>
      this.importOne(filePath, context)
    );

    return this.finishImportSummary({
      batchId: batch.id,
      sourceType: 'folder',
      sourcePath: input.folderPath,
      startedAt,
      metrics,
      items: [...processedItems, ...unsupportedItems],
      compactItems: true
    });
  }

  private finishImportSummary(input: {
    batchId: string;
    sourceType: 'files' | 'folder' | 'clipboard';
    sourcePath: string;
    startedAt: number;
    metrics: ImportMetrics;
    items: ImportItemResult[];
    compactItems: boolean;
  }): ImportSummary {
    const durationMs = Date.now() - input.startedAt;
    const imported = input.items.filter((item) => item.status === 'imported').length;
    const duplicates = input.items.filter((item) => item.status === 'duplicate').length;
    const failed = input.items.filter((item) => item.status === 'failed').length;
    const unsupported = input.items.filter((item) => item.status === 'unsupported').length;
    input.metrics.importedCount = imported;
    input.metrics.skippedDuplicatesCount = duplicates;
    input.metrics.failedCount = failed;
    input.metrics.unsupportedCount = unsupported;
    input.metrics.totalDurationMs = durationMs;
    input.metrics.averagePerFileMs = input.metrics.supportedFiles > 0 ? durationMs / input.metrics.supportedFiles : 0;

    const db = this.libraryService.requireDb();
    db.completeImportBatch({
      id: input.batchId,
      importedCount: imported,
      skippedCount: duplicates + unsupported,
      failedCount: failed,
      durationMs,
      status: failed > 0 ? 'completed_with_errors' : 'completed',
      metrics: input.metrics
    });

    const items = input.compactItems ? compactFolderItems(input.items) : input.items;
    return {
      batchId: input.batchId,
      sourceType: input.sourceType,
      sourcePath: input.sourcePath,
      total: input.metrics.totalFiles,
      supported: input.metrics.supportedFiles,
      imported,
      duplicates,
      failed,
      unsupported,
      durationMs,
      metrics: input.metrics,
      items
    };
  }

  private async importOne(filePath: string, context: ImportContext): Promise<ImportItemResult> {
    const config = loadAppConfig();
    const db = this.libraryService.requireDb();
    const manifest = this.libraryService.requireManifest();
    const extension = path.extname(filePath).replace('.', '').toLowerCase();
    const originalRelativePath =
      context.relativePathByFile?.get(filePath) ?? (context.basePath ? toOriginalRelativePath(context.basePath, filePath) : null);

    const supportedExtensions = getSupportedImportExtensions(config);
    if (!supportedExtensions.includes(extension)) {
      return {
        sourcePath: filePath,
        status: config.placeholderExtensions.includes(extension) ? 'unsupported' : 'unsupported',
        error: `.${extension || 'unknown'} is not supported.`,
        originalRelativePath
      };
    }

    try {
      const stat = await fsp.stat(filePath);
      if (!stat.isFile()) {
        return { sourcePath: filePath, status: 'unsupported', error: 'Only files can be imported.', originalRelativePath };
      }

      const hash = await measureAsync(context.metrics, 'hashDurationMs', () => hashFile(filePath));
      const duplicateAsset = db.getAssetByHash(hash);
      if (duplicateAsset && context.duplicateMode === 'skip') {
        return {
          sourcePath: filePath,
          status: 'duplicate',
          duplicateAsset: context.keepAssetPayloads ? duplicateAsset : undefined,
          originalRelativePath
        };
      }

      const id = crypto.randomUUID();
      const isVideo = config.supportedVideoExtensions.includes(extension);
      const isSvg = extension === 'svg';
      const storedRelativePath = `${manifest.paths.originals}/${id}.${extension}`;
      const thumbnailRelativePath = `${manifest.paths.thumbnails}/${id}.webp`;
      const previewRelativePath = isSvg ? `${manifest.paths.previews}/${id}.webp` : null;
      const storedAbsolutePath = db.resolvePath(storedRelativePath);
      const thumbnailAbsolutePath = db.resolvePath(thumbnailRelativePath);
      const previewAbsolutePath = previewRelativePath ? db.resolvePath(previewRelativePath) : null;
      const warnings: string[] = [];

      await fsp.mkdir(path.dirname(storedAbsolutePath), { recursive: true });
      await measureAsync(context.metrics, 'copyDurationMs', () => fsp.copyFile(filePath, storedAbsolutePath));

      let width: number | null = null;
      let height: number | null = null;
      let durationMs: number | null = null;
      let isAnimated = false;
      let hasTransparency = false;
      let colors: Array<{ color: string; population: number; sortOrder: number }> = [];
      let thumbnailPath: string | null = null;
      let previewPath: string | null = null;
      let thumbnailStatus = 'none';
      let previewStatus = 'none';
      let analysisStatus = 'ready';

      if (isVideo) {
        const metadata = await measureAsync(context.metrics, 'colorAnalysisDurationMs', () =>
          this.mediaService.analyzeVideo(storedAbsolutePath, config.ffprobePath)
        );
        width = metadata.width;
        height = metadata.height;
        durationMs = metadata.durationMs;
        if (metadata.warnings.length > 0) {
          warnings.push(...metadata.warnings);
          analysisStatus = 'partial';
        }
        const thumbnail = await measureAsync(context.metrics, 'thumbnailDurationMs', () =>
          this.mediaService.createVideoThumbnail(storedAbsolutePath, thumbnailAbsolutePath, config.thumbnailSize, {
            ffmpegPath: config.ffmpegPath,
            durationMs
          })
        );
        if (thumbnail.created) {
          thumbnailPath = thumbnailRelativePath;
          thumbnailStatus = 'ready';
        } else {
          thumbnailStatus = 'unavailable';
          warnings.push(...thumbnail.warnings);
        }
      } else {
        try {
          const analysis = await measureAsync(context.metrics, 'colorAnalysisDurationMs', () =>
            this.mediaService.analyzeImage(storedAbsolutePath)
          );
          width = analysis.width;
          height = analysis.height;
          durationMs = analysis.durationMs;
          isAnimated = analysis.isAnimated;
          hasTransparency = analysis.hasTransparency;
          colors = analysis.colors;
        } catch (error) {
          analysisStatus = 'failed';
          warnings.push(`Image analysis unavailable: ${error instanceof Error ? error.message : String(error)}`);
        }

        try {
          await measureAsync(context.metrics, 'thumbnailDurationMs', () =>
            this.mediaService.createThumbnail(storedAbsolutePath, thumbnailAbsolutePath, config.thumbnailSize)
          );
          thumbnailPath = thumbnailRelativePath;
          thumbnailStatus = 'ready';
        } catch (error) {
          thumbnailStatus = 'failed';
          warnings.push(`Thumbnail unavailable: ${error instanceof Error ? error.message : String(error)}`);
        }

        if (previewAbsolutePath && previewRelativePath) {
          try {
            await measureAsync(context.metrics, 'thumbnailDurationMs', () =>
              this.mediaService.createPreview(storedAbsolutePath, previewAbsolutePath, config.thumbnailSize)
            );
            previewPath = previewRelativePath;
            previewStatus = 'ready';
          } catch (error) {
            previewStatus = 'failed';
            warnings.push(`SVG preview unavailable: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      const now = new Date().toISOString();
      const originalFileName = path.basename(filePath);
      const asset = await measureSync(context.metrics, 'dbDurationMs', () =>
        db.insertAsset({
          id,
          libraryId: manifest.libraryId,
          title: path.parse(originalFileName).name,
          originalFileName,
          storedFilePath: storedRelativePath,
          thumbnailPath,
          previewPath,
          mediaType: isVideo ? 'video' : 'image',
          mimeType: lookup(filePath) || null,
          extension,
          sizeBytes: stat.size,
          width,
          height,
          durationMs,
          isAnimated,
          hasTransparency,
          thumbnailStatus,
          previewStatus,
          analysisStatus,
          hash,
          perceptualHash: null,
          rating: 0,
          memo: '',
          sourceUrl: '',
          isFavorite: false,
          isDeleted: false,
          originalRelativePath,
          importBatchId: context.batchId ?? null,
          deletedAt: null,
          permanentlyDeletedAt: null,
          createdAt: now,
          updatedAt: now,
          importedAt: now,
          colors
        })
      );

      if (duplicateAsset) {
        await measureSync(context.metrics, 'dbDurationMs', () => db.createDuplicate(asset.id, duplicateAsset.id, hash));
      }

      return {
        sourcePath: filePath,
        status: 'imported',
        asset: context.keepAssetPayloads ? asset : undefined,
        duplicateAsset: context.keepAssetPayloads ? (duplicateAsset ?? undefined) : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        originalRelativePath
      };
    } catch (error) {
      return {
        sourcePath: filePath,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        originalRelativePath
      };
    }
  }
}

function createMetrics(totalFiles: number, supportedFiles: number): ImportMetrics {
  return {
    totalFiles,
    supportedFiles,
    importedCount: 0,
    skippedDuplicatesCount: 0,
    failedCount: 0,
    unsupportedCount: 0,
    totalDurationMs: 0,
    averagePerFileMs: 0,
    scanDurationMs: 0,
    hashDurationMs: 0,
    copyDurationMs: 0,
    thumbnailDurationMs: 0,
    colorAnalysisDurationMs: 0,
    dbDurationMs: 0
  };
}

async function expandImportInput(
  input: ImportFilesInput,
  supportedExtensions: string[]
): Promise<ExpandedImportInput> {
  const scanStartedAt = Date.now();
  const filePaths: string[] = [];
  const unsupportedItems: ImportItemResult[] = [];
  const relativePathByFile = new Map<string, string | null>();
  const directoryRoots: string[] = [];
  let totalCount = 0;
  let supportedCount = 0;

  for (const incomingPath of input.filePaths) {
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(incomingPath);
    } catch (error) {
      totalCount += 1;
      unsupportedItems.push({
        sourcePath: incomingPath,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        originalRelativePath: input.basePath ? toOriginalRelativePath(input.basePath, incomingPath) : null
      });
      continue;
    }

    if (stat.isDirectory()) {
      directoryRoots.push(incomingPath);
      const scan = await scanFolder(incomingPath);
      for (const scannedPath of scan.filePaths) {
        const originalRelativePath = toOriginalRelativePath(incomingPath, scannedPath);
        totalCount += 1;
        relativePathByFile.set(scannedPath, originalRelativePath);
        if (isSupported(scannedPath, supportedExtensions)) {
          supportedCount += 1;
          filePaths.push(scannedPath);
        } else {
          unsupportedItems.push(createUnsupportedItem(scannedPath, originalRelativePath));
        }
      }
      continue;
    }

    if (!stat.isFile()) {
      totalCount += 1;
      unsupportedItems.push({
        sourcePath: incomingPath,
        status: 'unsupported',
        error: 'Only files and folders can be imported.',
        originalRelativePath: input.basePath ? toOriginalRelativePath(input.basePath, incomingPath) : null
      });
      continue;
    }

    const originalRelativePath = input.basePath ? toOriginalRelativePath(input.basePath, incomingPath) : null;
    totalCount += 1;
    relativePathByFile.set(incomingPath, originalRelativePath);
    if (isSupported(incomingPath, supportedExtensions)) {
      supportedCount += 1;
      filePaths.push(incomingPath);
    } else {
      unsupportedItems.push(createUnsupportedItem(incomingPath, originalRelativePath));
    }
  }

  const inferredFolderImport = directoryRoots.length > 0;
  const sourceType = input.sourceType ?? (inferredFolderImport ? 'folder' : 'files');
  return {
    filePaths,
    unsupportedItems,
    totalCount,
    supportedCount,
    scanDurationMs: inferredFolderImport ? Date.now() - scanStartedAt : 0,
    sourceType,
    sourcePath:
      input.sourcePath ??
      (directoryRoots.length === 1 && input.filePaths.length === 1 ? directoryRoots[0] : describeFileSelection(input.filePaths)),
    compactItems: sourceType === 'folder',
    keepAssetPayloads: sourceType !== 'folder',
    relativePathByFile
  };
}

function createUnsupportedItem(filePath: string, originalRelativePath: string | null): ImportItemResult {
  return {
    sourcePath: filePath,
    status: 'unsupported',
    error: `.${path.extname(filePath).replace('.', '').toLowerCase() || 'unknown'} is not supported.`,
    originalRelativePath
  };
}

async function scanFolder(rootPath: string): Promise<{ filePaths: string[] }> {
  const resolvedRoot = path.resolve(rootPath);
  const pending = [resolvedRoot];
  const filePaths: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (shouldSkipEntry(entry.name)) {
        continue;
      }

      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        filePaths.push(entryPath);
      }
    }
  }

  filePaths.sort((left, right) => left.localeCompare(right));
  return { filePaths };
}

function shouldSkipEntry(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    name.startsWith('.') ||
    name.startsWith('~$') ||
    normalized === 'thumbs.db' ||
    normalized === 'desktop.ini' ||
    normalized === '$recycle.bin' ||
    normalized === 'system volume information' ||
    normalized === 'node_modules' ||
    normalized === '__macosx'
  );
}

function isSupported(filePath: string, supportedExtensions: string[]): boolean {
  return supportedExtensions.includes(path.extname(filePath).replace('.', '').toLowerCase());
}

function getSupportedImportExtensions(config: AppConfig): string[] {
  return uniqueStrings([...config.supportedImageExtensions, ...config.supportedVideoExtensions]);
}

function toOriginalRelativePath(basePath: string, filePath: string): string {
  return path.relative(basePath, filePath).split(path.sep).join('/');
}

function describeFileSelection(filePaths: string[]): string {
  if (filePaths.length === 0) {
    return 'empty selection';
  }
  if (filePaths.length === 1) {
    return filePaths[0];
  }
  return `${filePaths.length} selected files`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function compactFolderItems(items: ImportItemResult[]): ImportItemResult[] {
  const importantItems = items.filter((item) => item.status !== 'imported');
  if (importantItems.length >= FOLDER_RESULT_ITEM_LIMIT) {
    return importantItems.slice(0, FOLDER_RESULT_ITEM_LIMIT);
  }

  const importedItems = items
    .filter((item) => item.status === 'imported')
    .slice(0, FOLDER_RESULT_ITEM_LIMIT - importantItems.length)
    .map((item) => ({ ...item, asset: undefined, duplicateAsset: undefined }));
  return [...importantItems, ...importedItems];
}

async function measureAsync<T>(
  metrics: ImportMetrics,
  key:
    | 'hashDurationMs'
    | 'copyDurationMs'
    | 'thumbnailDurationMs'
    | 'colorAnalysisDurationMs'
    | 'dbDurationMs',
  task: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await task();
  } finally {
    metrics[key] += Date.now() - startedAt;
  }
}

async function measureSync<T>(
  metrics: ImportMetrics,
  key: 'dbDurationMs',
  task: () => T
): Promise<T> {
  const startedAt = Date.now();
  try {
    return task();
  } finally {
    metrics[key] += Date.now() - startedAt;
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
