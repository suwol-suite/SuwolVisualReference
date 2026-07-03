import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { AssetImportService } from './services/asset-import-service';
import { ExportService } from './services/export-service';
import { LibraryService } from './services/library-service';

type FileSnapshot = {
  totalFiles: number;
  byExtension: Record<string, number>;
};

export async function runUiImportTest(sourcePath?: string): Promise<void> {
  const resolvedSourcePath = path.resolve(sourcePath ?? (await createUiImportFixture()));
  const sourceStat = await fs.stat(resolvedSourcePath);
  if (!sourceStat.isDirectory()) {
    throw new Error(`UI import source is not a directory: ${resolvedSourcePath}`);
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const libraryRoot = path.join(process.cwd(), '.codex-run', `ui-resource-import-test-${runId}`);
  const resultPath = path.join(process.cwd(), '.codex-run', `ui-resource-import-test-${runId}.json`);
  const beforeSnapshot = await snapshotFiles(resolvedSourcePath);

  const libraryService = new LibraryService();
  const importService = new AssetImportService(libraryService);
  const exportService = new ExportService(libraryService);
  const library = await libraryService.createLibrary(libraryRoot, 'UI Resource Import Test');
  const importSummary = await importService.importFolder({
    folderPath: resolvedSourcePath,
    duplicateMode: 'skip'
  });

  const db = libraryService.requireDb();
  const listStartedAt = Date.now();
  const firstPage = db.listAssets({ limit: 700 });
  const firstPageDurationMs = Date.now() - listStartedAt;
  const searchStartedAt = Date.now();
  const searchResults = db.listAssets({ search: 'ui', limit: 700 });
  const searchDurationMs = Date.now() - searchStartedAt;
  const smartFolder = db.createSmartFolder('PNG imports', {
    mode: 'all',
    conditions: [{ field: 'extension', operator: '=', value: 'png' }]
  });
  const smartStartedAt = Date.now();
  const smartResults = db.listAssets({ smartFolderId: smartFolder.id, limit: 700 });
  const smartDurationMs = Date.now() - smartStartedAt;

  if (firstPage[0]) {
    db.trashAssets([firstPage[0].id]);
    db.restoreAssets([firstPage[0].id]);
  }

  let exportResult: Awaited<ReturnType<ExportService['exportMarkdown']>> | null = null;
  const exportAssets = firstPage.slice(0, 5);
  if (exportAssets.length > 0) {
    exportResult = await exportService.exportMarkdown({
      presetId: 'ui-analysis',
      name: 'ui-resource-smoke-export',
      goal: 'Verify export against imported UI resources.',
      commonTraits: 'UI resource import validation.',
      instructions: 'Use these files to validate local reference export.',
      constraints: 'Keep paths local and portable.',
      outputFileName: 'ui-analysis.md',
      assetIds: exportAssets.map((asset) => asset.id),
      collectionId: null
    });
  }

  const duplicateStartedAt = Date.now();
  const duplicateGroups = db.listDuplicateGroups();
  const duplicateDurationMs = Date.now() - duplicateStartedAt;
  const afterSnapshot = await snapshotFiles(resolvedSourcePath);
  const sourceUnchanged =
    beforeSnapshot.totalFiles === afterSnapshot.totalFiles &&
    JSON.stringify(beforeSnapshot.byExtension) === JSON.stringify(afterSnapshot.byExtension);

  const result = {
    ok: true,
    sourcePath: resolvedSourcePath,
    sourceUnchanged,
    beforeSnapshot,
    afterSnapshot,
    library: libraryService.getActiveSummary() ?? library,
    libraryRoot,
    resultPath,
    importSummary: {
      batchId: importSummary.batchId,
      total: importSummary.total,
      supported: importSummary.supported,
      imported: importSummary.imported,
      duplicates: importSummary.duplicates,
      failed: importSummary.failed,
      unsupported: importSummary.unsupported,
      durationMs: importSummary.durationMs,
      metrics: importSummary.metrics,
      returnedItems: importSummary.items.length
    },
    checks: {
      firstPage: {
        count: firstPage.length,
        durationMs: firstPageDurationMs
      },
      search: {
        query: 'ui',
        count: searchResults.length,
        durationMs: searchDurationMs
      },
      smartFolder: {
        id: smartFolder.id,
        count: smartResults.length,
        durationMs: smartDurationMs
      },
      duplicateGroups: {
        count: duplicateGroups.length,
        durationMs: duplicateDurationMs
      },
      export: exportResult
        ? {
            markdownPath: exportResult.markdownPath,
            assetCount: exportResult.assetCount
          }
        : null
    }
  };

  await fs.writeFile(resultPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

async function createUiImportFixture(): Promise<string> {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const rootPath = path.join(process.cwd(), '.codex-run', `ui-import-fixture-${runId}`);
  const nestedPath = path.join(rootPath, 'nested');
  await fs.mkdir(nestedPath, { recursive: true });
  await sharp({
    create: {
      width: 220,
      height: 140,
      channels: 4,
      background: { r: 78, g: 140, b: 214, alpha: 1 }
    }
  })
    .png()
    .toFile(path.join(rootPath, 'ui-fixture-a.png'));
  await sharp({
    create: {
      width: 180,
      height: 220,
      channels: 4,
      background: { r: 214, g: 126, b: 86, alpha: 1 }
    }
  })
    .jpeg()
    .toFile(path.join(nestedPath, 'ui-fixture-b.jpg'));
  await fs.writeFile(path.join(rootPath, 'notes.txt'), 'unsupported ui import fixture', 'utf8');
  return rootPath;
}

async function snapshotFiles(rootPath: string): Promise<FileSnapshot> {
  const byExtension: Record<string, number> = {};
  let totalFiles = 0;
  const pending = [rootPath];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        totalFiles += 1;
        const extension = path.extname(entry.name).toLowerCase() || '[none]';
        byExtension[extension] = (byExtension[extension] ?? 0) + 1;
      }
    }
  }

  return {
    totalFiles,
    byExtension: Object.fromEntries(Object.entries(byExtension).sort(([left], [right]) => left.localeCompare(right)))
  };
}
