import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, app, dialog, ipcMain, net, protocol, shell } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc';
import type { LocaleCode } from '@shared/i18n/types';
import type {
  AssetListQuery,
  AssetBatchCollectionInput,
  AssetBatchFavoriteInput,
  AssetBatchRatingInput,
  AssetBatchTagInput,
  AssetUpdateInput,
  CollectionAssetOrderInput,
  CollectionAssetOrderResult,
  CollectionCreateAndAddAssetsInput,
  CollectionCreateAndAddAssetsResult,
  DuplicateGroupQuery,
  DuplicateMergeInput,
  DuplicateResolutionInput,
  ExportInput,
  ExportTemplatePreviewInput,
  ExportTemplateSaveInput,
  ImportFilesInput,
  ImportFolderInput,
  SmartFolderQuery,
  SmartFolderUpdateInput,
  TagMergeInput
} from '@shared/types';
import { AssetImportService } from './services/asset-import-service';
import { loadAppConfig, loadExportPresets } from './services/config-service';
import { ExportService } from './services/export-service';
import { LibraryService } from './services/library-service';
import { PermanentDeleteService } from './services/permanent-delete-service';
import { RecentLibraryService } from './services/recent-library-service';
import { resolveResourcePath } from './services/resource-paths';
import { runLibraryPerfTest } from './library-perf-test';
import { runSmokeTest } from './smoke-test';
import { runUiImportTest } from './ui-import-test';

let mainWindow: BrowserWindow | null = null;

const libraryService = new LibraryService();
const assetImportService = new AssetImportService(libraryService);
const exportService = new ExportService(libraryService);
const permanentDeleteService = new PermanentDeleteService(libraryService);
const recentLibraryService = new RecentLibraryService();

type AppErrorCode =
  | 'LIBRARY_CREATE_FAILED'
  | 'LIBRARY_OPEN_FAILED'
  | 'IMPORT_FAILED'
  | 'EXPORT_FAILED'
  | 'TRASH_FAILED'
  | 'RESTORE_FAILED'
  | 'PERMANENT_DELETE_FAILED'
  | 'SMART_FOLDER_SAVE_FAILED';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ref-forge',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1060,
    minHeight: 720,
    title: loadAppConfig().appName,
    icon: getWindowIconPath(),
    backgroundColor: '#111217',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

if (!handleEarlyCliFlags()) {
  app.whenReady().then(async () => {
    const libraryPerfTestIndex = process.argv.indexOf('--library-perf-test');
    if (libraryPerfTestIndex >= 0) {
      await runHeadlessTask(() => runLibraryPerfTest(process.argv[libraryPerfTestIndex + 1] ?? process.cwd()));
      return;
    }

    const uiImportTestIndex = process.argv.indexOf('--ui-import-test');
    if (uiImportTestIndex >= 0) {
      await runHeadlessTask(() => runUiImportTest(process.argv[uiImportTestIndex + 1]));
      return;
    }

    if (process.argv.includes('--smoke-test')) {
      await runHeadlessTask(runSmokeTest);
      return;
    }

    if (process.argv.includes('--smoke-main')) {
      await runHeadlessTask(runMainSmokeCheck);
      return;
    }

    registerAssetProtocol();
    registerIpcHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.appConfigGet, () => loadAppConfig());
  ipcMain.handle(IPC_CHANNELS.libraryGetActive, () => libraryService.getActiveSummary());
  ipcMain.handle(IPC_CHANNELS.recentLibrariesList, () => recentLibraryService.list());
  ipcMain.handle(IPC_CHANNELS.recentLibrariesRemove, (_event, rootPath: string) => recentLibraryService.remove(rootPath));

  ipcMain.handle(IPC_CHANNELS.libraryCreateDialog, async () => {
    const result = await dialog.showOpenDialog(assertWindow(), {
      title: 'Create a Suwol Visual Reference library',
      buttonLabel: 'Use Folder',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return withErrorCode('LIBRARY_CREATE_FAILED', async () => {
      const library = await libraryService.createLibrary(result.filePaths[0]);
      await recentLibraryService.upsert(library);
      return library;
    });
  });

  ipcMain.handle(IPC_CHANNELS.libraryOpenDialog, async () => {
    const result = await dialog.showOpenDialog(assertWindow(), {
      title: 'Open a Suwol Visual Reference library',
      buttonLabel: 'Open Library',
      properties: ['openDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return withErrorCode('LIBRARY_OPEN_FAILED', async () => {
      const library = await libraryService.openLibrary(result.filePaths[0]);
      await recentLibraryService.upsert(library);
      return library;
    });
  });

  ipcMain.handle(IPC_CHANNELS.libraryOpenPath, (_event, rootPath: string) => {
    return withErrorCode('LIBRARY_OPEN_FAILED', async () => {
      const library = await libraryService.openLibrary(rootPath);
      await recentLibraryService.upsert(library);
      return library;
    });
  });

  ipcMain.handle(IPC_CHANNELS.filesSelectDialog, async () => {
    const config = loadAppConfig();
    const result = await dialog.showOpenDialog(assertWindow(), {
      title: 'Import reference images',
      buttonLabel: 'Import',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: [...config.supportedImageExtensions, ...config.supportedVideoExtensions] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(IPC_CHANNELS.folderSelectDialog, async () => {
    const result = await dialog.showOpenDialog(assertWindow(), {
      title: 'Import a reference folder',
      buttonLabel: 'Import Folder',
      properties: ['openDirectory']
    });

    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.assetsList, (_event, query: AssetListQuery) => {
    return libraryService.requireDb().queryAssets(query);
  });

  ipcMain.handle(IPC_CHANNELS.assetsImport, (_event, input: ImportFilesInput) => {
    return withErrorCode('IMPORT_FAILED', () => assetImportService.importFiles(input));
  });

  ipcMain.handle(IPC_CHANNELS.assetsImportFolder, (_event, input: ImportFolderInput) => {
    return withErrorCode('IMPORT_FAILED', () => assetImportService.importFolder(input));
  });

  ipcMain.handle(IPC_CHANNELS.assetsUpdate, (_event, input: AssetUpdateInput) => {
    return libraryService.requireDb().updateAsset(input);
  });

  ipcMain.handle(IPC_CHANNELS.assetsTrash, (_event, assetIds: string[]) => {
    return withErrorCode('TRASH_FAILED', () => libraryService.requireDb().trashAssets(assetIds));
  });

  ipcMain.handle(IPC_CHANNELS.assetsRestore, (_event, assetIds: string[]) => {
    return withErrorCode('RESTORE_FAILED', () => libraryService.requireDb().restoreAssets(assetIds));
  });

  ipcMain.handle(IPC_CHANNELS.assetsPermanentDelete, async (_event, assetIds: string[]) => {
    return withErrorCode('PERMANENT_DELETE_FAILED', () => permanentDeleteService.permanentlyDeleteTrashAssets(assetIds));
  });

  ipcMain.handle(IPC_CHANNELS.assetsAddTags, (_event, input: AssetBatchTagInput) => {
    return libraryService.requireDb().batchAddTags(input);
  });

  ipcMain.handle(IPC_CHANNELS.assetsRemoveTags, (_event, input: AssetBatchTagInput) => {
    return libraryService.requireDb().batchRemoveTags(input);
  });

  ipcMain.handle(IPC_CHANNELS.assetsSetRating, (_event, input: AssetBatchRatingInput) => {
    return libraryService.requireDb().batchSetRating(input);
  });

  ipcMain.handle(IPC_CHANNELS.assetsSetFavorite, (_event, input: AssetBatchFavoriteInput) => {
    return libraryService.requireDb().batchSetFavorite(input);
  });

  ipcMain.handle(IPC_CHANNELS.assetsAddToCollection, (_event, input: AssetBatchCollectionInput) => {
    return libraryService.requireDb().batchAddAssetsToCollection(input);
  });

  ipcMain.handle(IPC_CHANNELS.importBatchesList, () => {
    return libraryService.requireDb().listImportBatches();
  });

  ipcMain.handle(IPC_CHANNELS.duplicatesList, (_event, query?: DuplicateGroupQuery) => {
    return libraryService.requireDb().listDuplicateGroups(query);
  });
  ipcMain.handle(IPC_CHANNELS.duplicatesResolve, (_event, input: DuplicateResolutionInput) => {
    return libraryService.requireDb().setDuplicateResolution(input);
  });
  ipcMain.handle(IPC_CHANNELS.duplicatesMerge, (_event, input: DuplicateMergeInput) => {
    return libraryService.requireDb().mergeDuplicateAssets(input);
  });

  ipcMain.handle(IPC_CHANNELS.tagsList, () => libraryService.requireDb().listTags());
  ipcMain.handle(IPC_CHANNELS.tagsCreate, (_event, input: { name: string; color?: string }) => {
    return libraryService.requireDb().createTag(input.name, input.color);
  });
  ipcMain.handle(IPC_CHANNELS.tagsUpdate, (_event, input: { id: string; name?: string; color?: string }) => {
    return libraryService.requireDb().updateTag(input);
  });
  ipcMain.handle(IPC_CHANNELS.tagsDelete, (_event, id: string) => {
    libraryService.requireDb().deleteTag(id);
  });
  ipcMain.handle(IPC_CHANNELS.tagsDeleteMany, (_event, ids: string[]) => {
    libraryService.requireDb().deleteTags(ids);
  });
  ipcMain.handle(IPC_CHANNELS.tagsDeleteUnused, () => {
    return libraryService.requireDb().deleteUnusedTags();
  });
  ipcMain.handle(IPC_CHANNELS.tagsMerge, (_event, input: TagMergeInput) => {
    libraryService.requireDb().mergeTags(input);
  });
  ipcMain.handle(IPC_CHANNELS.tagsAssign, (_event, input: { assetId: string; tagId: string }) => {
    return libraryService.requireDb().assignTag(input.assetId, input.tagId);
  });
  ipcMain.handle(IPC_CHANNELS.tagsRemove, (_event, input: { assetId: string; tagId: string }) => {
    return libraryService.requireDb().removeTag(input.assetId, input.tagId);
  });

  ipcMain.handle(IPC_CHANNELS.collectionsList, () => libraryService.requireDb().listCollections());
  ipcMain.handle(
    IPC_CHANNELS.collectionsCreate,
    (_event, input: { name: string; description?: string; color?: string }) => {
      return libraryService.requireDb().createCollection(input.name, input.description, input.color);
    }
  );
  ipcMain.handle(
    IPC_CHANNELS.collectionsUpdate,
    (_event, input: { id: string; name?: string; description?: string; color?: string; coverAssetId?: string | null }) => {
      return libraryService.requireDb().updateCollection(input);
    }
  );
  ipcMain.handle(IPC_CHANNELS.collectionsDelete, (_event, id: string) => {
    libraryService.requireDb().deleteCollection(id);
  });
  ipcMain.handle(IPC_CHANNELS.collectionsReorderAssets, (_event, input: CollectionAssetOrderInput): CollectionAssetOrderResult => {
    return libraryService.requireDb().reorderCollectionAssets(input);
  });
  ipcMain.handle(IPC_CHANNELS.collectionsCreateAndAddAssets, (_event, input: CollectionCreateAndAddAssetsInput) => {
    const db = libraryService.requireDb();
    const collection = db.createCollection(input.name, input.description, input.color);
    const result = db.batchAddAssetsToCollection({ collectionId: collection.id, assetIds: input.assetIds });
    return { collection, result } satisfies CollectionCreateAndAddAssetsResult;
  });
  ipcMain.handle(IPC_CHANNELS.collectionsAddAssets, (_event, input: { collectionId: string; assetIds: string[] }) => {
    return libraryService.requireDb().addAssetsToCollection(input.collectionId, input.assetIds);
  });
  ipcMain.handle(IPC_CHANNELS.collectionsRemoveAsset, (_event, input: { collectionId: string; assetId: string }) => {
    libraryService.requireDb().removeAssetFromCollection(input.collectionId, input.assetId);
  });

  ipcMain.handle(IPC_CHANNELS.smartFoldersList, () => libraryService.requireDb().listSmartFolders());
  ipcMain.handle(IPC_CHANNELS.smartFoldersCreate, (_event, input: { name: string; query: SmartFolderQuery }) => {
    return withErrorCode('SMART_FOLDER_SAVE_FAILED', () =>
      libraryService.requireDb().createSmartFolder(input.name, input.query)
    );
  });
  ipcMain.handle(IPC_CHANNELS.smartFoldersUpdate, (_event, input: SmartFolderUpdateInput) => {
    return withErrorCode('SMART_FOLDER_SAVE_FAILED', () => libraryService.requireDb().updateSmartFolder(input));
  });
  ipcMain.handle(IPC_CHANNELS.smartFoldersDelete, (_event, id: string) => {
    libraryService.requireDb().deleteSmartFolder(id);
  });
  ipcMain.handle(IPC_CHANNELS.smartFoldersPreview, (_event, query: SmartFolderQuery) => {
    return libraryService.requireDb().previewSmartFolderCount(query);
  });

  ipcMain.handle(IPC_CHANNELS.exportPresetsList, (_event, locale?: LocaleCode) => loadExportPresets(locale));
  ipcMain.handle(IPC_CHANNELS.exportTemplatesList, (_event, locale?: LocaleCode) => exportService.listTemplates(locale));
  ipcMain.handle(IPC_CHANNELS.exportTemplatesSave, (_event, input: ExportTemplateSaveInput) => {
    return withErrorCode('EXPORT_FAILED', () => exportService.saveTemplate(input));
  });
  ipcMain.handle(IPC_CHANNELS.exportTemplatesDelete, (_event, id: string) => {
    return withErrorCode('EXPORT_FAILED', () => exportService.deleteTemplate(id));
  });
  ipcMain.handle(IPC_CHANNELS.exportTemplatesPreview, (_event, input: ExportTemplatePreviewInput) => {
    return withErrorCode('EXPORT_FAILED', () => exportService.previewTemplate(input));
  });

  ipcMain.handle(IPC_CHANNELS.exportCreate, (_event, input: ExportInput) => {
    return withErrorCode('EXPORT_FAILED', () => exportService.exportMarkdown(input));
  });

  ipcMain.handle(IPC_CHANNELS.shellOpenPath, async (_event, targetPath: string) => {
    const result = await shell.openPath(targetPath);
    if (result) {
      throw new Error(result);
    }
  });
}

function registerAssetProtocol(): void {
  protocol.handle('ref-forge', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'library') {
      return new Response('Unknown internal asset protocol resource.', { status: 404 });
    }

    try {
      const relativePath = decodeURIComponent(url.pathname.replace(/^\//u, ''));
      const absolutePath = libraryService.requireDb().resolvePath(relativePath);
      return net.fetch(pathToFileURL(absolutePath).toString());
    } catch (error) {
      return new Response(error instanceof Error ? error.message : String(error), { status: 404 });
    }
  });
}

async function withErrorCode<T>(code: AppErrorCode, task: () => Promise<T> | T): Promise<T> {
  try {
    return await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${code}|${message}`, { cause: error });
  }
}

function assertWindow(): BrowserWindow {
  if (!mainWindow) {
    throw new Error('Main window is not ready.');
  }
  return mainWindow;
}

function getWindowIconPath(): string {
  return resolveResourcePath(process.platform === 'linux' ? 'build/icon.png' : 'build/icon.ico');
}

function handleEarlyCliFlags(): boolean {
  if (process.argv.includes('--help')) {
    console.log(
      [
        `${loadAppConfig().appName} ${loadAppConfig().appVersion}`,
        '',
        'Safe diagnostic flags:',
        '  --version      Print the packaged app version and exit.',
        '  --smoke-main   Verify main-process config and packaged resources without opening a window.',
        '  --smoke-test   Run the full local library smoke test.'
      ].join('\n')
    );
    process.exit(0);
    return true;
  }

  if (process.argv.includes('--version')) {
    console.log(loadAppConfig().appVersion);
    process.exit(0);
    return true;
  }

  return false;
}

async function runMainSmokeCheck(): Promise<void> {
  const config = loadAppConfig();
  if (!config.appName || !config.appVersion || !config.appLicense) {
    throw new Error(`App config is missing required metadata: ${JSON.stringify(config)}`);
  }

  const iconPath = getWindowIconPath();
  if (!fs.existsSync(iconPath) || fs.statSync(iconPath).size <= 0) {
    throw new Error(`Window icon is missing or empty: ${iconPath}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        appName: config.appName,
        version: config.appVersion,
        license: config.appLicense,
        iconPath
      },
      null,
      2
    )
  );
}

async function runHeadlessTask(task: () => Promise<void>): Promise<void> {
  try {
    await task();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}
