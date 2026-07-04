import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc';
import type { LocaleCode } from '@shared/i18n/types';
import type {
  AppConfig,
  AssetBatchCollectionInput,
  AssetBatchFavoriteInput,
  AssetBatchOperationResult,
  AssetBatchRatingInput,
  AssetBatchTagInput,
  AssetListResult,
  AssetListQuery,
  AssetPermanentDeleteResult,
  AssetRecord,
  AssetUpdateInput,
  CollectionCreateAndAddAssetsInput,
  CollectionCreateAndAddAssetsResult,
  CollectionRecord,
  DuplicateGroup,
  DuplicateGroupQuery,
  DuplicateMergeInput,
  DuplicateResolutionInput,
  ExportInput,
  ExportPreset,
  ExportResult,
  ImportFilesInput,
  ImportBatchRecord,
  ImportFolderInput,
  ImportSummary,
  LibrarySummary,
  RecentLibraryRecord,
  SmartFolderQuery,
  SmartFolderRecord,
  TagMergeInput,
  TagRecord
} from '@shared/types';

const api = {
  getAppConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC_CHANNELS.appConfigGet),
  getActiveLibrary: (): Promise<LibrarySummary | null> => ipcRenderer.invoke(IPC_CHANNELS.libraryGetActive),
  createLibrary: (): Promise<LibrarySummary | null> => ipcRenderer.invoke(IPC_CHANNELS.libraryCreateDialog),
  openLibrary: (): Promise<LibrarySummary | null> => ipcRenderer.invoke(IPC_CHANNELS.libraryOpenDialog),
  openLibraryPath: (rootPath: string): Promise<LibrarySummary> => ipcRenderer.invoke(IPC_CHANNELS.libraryOpenPath, rootPath),
  listRecentLibraries: (): Promise<RecentLibraryRecord[]> => ipcRenderer.invoke(IPC_CHANNELS.recentLibrariesList),
  removeRecentLibrary: (rootPath: string): Promise<RecentLibraryRecord[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.recentLibrariesRemove, rootPath),
  selectImportFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC_CHANNELS.filesSelectDialog),
  selectImportFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.folderSelectDialog),
  listAssets: (query: AssetListQuery): Promise<AssetListResult> => ipcRenderer.invoke(IPC_CHANNELS.assetsList, query),
  importFiles: (input: ImportFilesInput): Promise<ImportSummary> => ipcRenderer.invoke(IPC_CHANNELS.assetsImport, input),
  importFolder: (input: ImportFolderInput): Promise<ImportSummary> =>
    ipcRenderer.invoke(IPC_CHANNELS.assetsImportFolder, input),
  updateAsset: (input: AssetUpdateInput): Promise<AssetRecord> => ipcRenderer.invoke(IPC_CHANNELS.assetsUpdate, input),
  trashAssets: (assetIds: string[]): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.assetsTrash, assetIds),
  restoreAssets: (assetIds: string[]): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.assetsRestore, assetIds),
  permanentlyDeleteAssets: (assetIds: string[]): Promise<AssetPermanentDeleteResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.assetsPermanentDelete, assetIds),
  addTagsToAssets: (input: AssetBatchTagInput): Promise<AssetBatchOperationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.assetsAddTags, input),
  removeTagsFromAssets: (input: AssetBatchTagInput): Promise<AssetBatchOperationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.assetsRemoveTags, input),
  setAssetsRating: (input: AssetBatchRatingInput): Promise<AssetBatchOperationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.assetsSetRating, input),
  setAssetsFavorite: (input: AssetBatchFavoriteInput): Promise<AssetBatchOperationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.assetsSetFavorite, input),
  addAssetsToCollectionBatch: (input: AssetBatchCollectionInput): Promise<AssetBatchOperationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.assetsAddToCollection, input),
  listImportBatches: (): Promise<ImportBatchRecord[]> => ipcRenderer.invoke(IPC_CHANNELS.importBatchesList),
  listDuplicateGroups: (query?: DuplicateGroupQuery): Promise<DuplicateGroup[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.duplicatesList, query),
  resolveDuplicateGroup: (input: DuplicateResolutionInput): Promise<DuplicateGroup | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.duplicatesResolve, input),
  mergeDuplicateAssets: (input: DuplicateMergeInput): Promise<DuplicateGroup | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.duplicatesMerge, input),
  listTags: (): Promise<TagRecord[]> => ipcRenderer.invoke(IPC_CHANNELS.tagsList),
  createTag: (input: { name: string; color?: string }): Promise<TagRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.tagsCreate, input),
  updateTag: (input: { id: string; name?: string; color?: string }): Promise<TagRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.tagsUpdate, input),
  deleteTag: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.tagsDelete, id),
  deleteTags: (ids: string[]): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.tagsDeleteMany, ids),
  deleteUnusedTags: (): Promise<number> => ipcRenderer.invoke(IPC_CHANNELS.tagsDeleteUnused),
  mergeTags: (input: TagMergeInput): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.tagsMerge, input),
  assignTag: (input: { assetId: string; tagId: string }): Promise<AssetRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.tagsAssign, input),
  removeTag: (input: { assetId: string; tagId: string }): Promise<AssetRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.tagsRemove, input),
  listCollections: (): Promise<CollectionRecord[]> => ipcRenderer.invoke(IPC_CHANNELS.collectionsList),
  createCollection: (input: { name: string; description?: string; color?: string }): Promise<CollectionRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.collectionsCreate, input),
  updateCollection: (input: { id: string; name?: string; description?: string; color?: string; coverAssetId?: string | null }): Promise<CollectionRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.collectionsUpdate, input),
  deleteCollection: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.collectionsDelete, id),
  createCollectionAndAddAssets: (input: CollectionCreateAndAddAssetsInput): Promise<CollectionCreateAndAddAssetsResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.collectionsCreateAndAddAssets, input),
  addAssetsToCollection: (input: { collectionId: string; assetIds: string[] }): Promise<CollectionRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.collectionsAddAssets, input),
  removeAssetFromCollection: (input: { collectionId: string; assetId: string }): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.collectionsRemoveAsset, input),
  listSmartFolders: (): Promise<SmartFolderRecord[]> => ipcRenderer.invoke(IPC_CHANNELS.smartFoldersList),
  createSmartFolder: (input: { name: string; query: SmartFolderQuery }): Promise<SmartFolderRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.smartFoldersCreate, input),
  deleteSmartFolder: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.smartFoldersDelete, id),
  listExportPresets: (locale?: LocaleCode): Promise<ExportPreset[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.exportPresetsList, locale),
  createExport: (input: ExportInput): Promise<ExportResult> => ipcRenderer.invoke(IPC_CHANNELS.exportCreate, input),
  openPath: (targetPath: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.shellOpenPath, targetPath),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
};

contextBridge.exposeInMainWorld('refForge', api);

export type RefForgeApi = typeof api;
