import { create } from 'zustand';
import type { LanguagePreference } from '@shared/i18n/types';
import type {
  AppConfig,
  AssetFilters,
  AssetBatchOperationResult,
  AssetListQuery,
  AssetPermanentDeleteResult,
  AssetRecord,
  AssetSort,
  CollectionRecord,
  DuplicateGroup,
  DuplicateGroupQuery,
  DuplicateResolutionInput,
  ExportInput,
  ExportPreset,
  ExportResult,
  ImportBatchRecord,
  ImportSummary,
  LibrarySummary,
  RecentLibraryRecord,
  SmartFolderQuery,
  SmartFolderRecord,
  TagMergeInput,
  TagRecord
} from '@shared/types';
import i18n, { changeLanguagePreference, getActiveLanguage, getStoredLanguagePreference } from './i18n';
import {
  filterLoadedSelection,
  getNextAssetSelection,
  getSelectAllSelection,
  uniqueStrings
} from './selection-utils';

const ASSET_PAGE_SIZE = 500;
const DEFAULT_ASSET_SORT: AssetSort = { field: 'importedAt', direction: 'desc' };
const EMPTY_ASSET_FILTERS: AssetFilters = {};

type RefForgeState = {
  config: AppConfig | null;
  library: LibrarySummary | null;
  recentLibraries: RecentLibraryRecord[];
  assets: AssetRecord[];
  assetTotalCount: number;
  assetLimit: number;
  assetOffset: number;
  assetHasMore: boolean;
  tags: TagRecord[];
  collections: CollectionRecord[];
  smartFolders: SmartFolderRecord[];
  importBatches: ImportBatchRecord[];
  duplicateGroups: DuplicateGroup[];
  exportPresets: ExportPreset[];
  languagePreference: LanguagePreference;
  selectedIds: string[];
  activeAssetId: string | null;
  selectionAnchorId: string | null;
  viewerAssetId: string | null;
  search: string;
  tagId: string | null;
  collectionId: string | null;
  smartFolderId: string | null;
  favoriteOnly: boolean;
  trashOnly: boolean;
  duplicateOnly: boolean;
  viewMode: 'grid' | 'list';
  assetSort: AssetSort;
  assetFilters: AssetFilters;
  gridThumbnailSize: number;
  showFileNames: boolean;
  loading: boolean;
  importing: boolean;
  pendingImportTotal: number;
  savingAssetIds: string[];
  lastSavedAt: string | null;
  importSummary: ImportSummary | null;
  lastExport: ExportResult | null;
  lastBatchResult: AssetBatchOperationResult | null;
  lastPermanentDeleteResult: AssetPermanentDeleteResult | null;
  error: string | null;
  boot: () => Promise<void>;
  createLibrary: () => Promise<void>;
  openLibrary: () => Promise<void>;
  openRecentLibrary: (rootPath: string) => Promise<void>;
  loadRecentLibraries: () => Promise<void>;
  removeRecentLibrary: (rootPath: string) => Promise<void>;
  loadAssets: (options?: { append?: boolean }) => Promise<void>;
  loadMoreAssets: () => Promise<void>;
  loadMetadata: () => Promise<void>;
  loadDuplicateGroups: (query?: DuplicateGroupQuery) => Promise<void>;
  selectAsset: (assetId: string, mode?: 'replace' | 'toggle' | 'range') => void;
  selectAssets: (assetIds: string[], activeAssetId?: string | null, options?: { preserveAnchor?: boolean }) => void;
  selectAllLoadedAssets: () => void;
  clearSelection: () => void;
  openViewer: (assetId?: string) => void;
  closeViewer: () => void;
  showNextViewerAsset: () => void;
  showPreviousViewerAsset: () => void;
  setSearch: (search: string) => void;
  setTagFilter: (tagId: string | null) => void;
  setCollectionFilter: (collectionId: string | null) => void;
  setSmartFolderFilter: (smartFolderId: string | null) => void;
  setFavoriteOnly: (favoriteOnly: boolean) => void;
  setTrashOnly: (trashOnly: boolean) => void;
  setDuplicateOnly: (duplicateOnly: boolean) => Promise<void>;
  setViewModeFilter: (viewMode: 'library' | 'favorites' | 'trash' | 'duplicates') => Promise<void>;
  setAssetViewMode: (viewMode: 'grid' | 'list') => void;
  setAssetSort: (sort: AssetSort) => void;
  setAssetFilters: (filters: AssetFilters) => Promise<void>;
  applyAssetFilterDraft: (viewMode: 'library' | 'favorites' | 'trash' | 'duplicates', filters: AssetFilters) => Promise<void>;
  clearFilters: () => void;
  setGridThumbnailSize: (size: number) => void;
  setShowFileNames: (showFileNames: boolean) => void;
  setLanguagePreference: (languagePreference: LanguagePreference) => Promise<void>;
  importPaths: (filePaths: string[], duplicateMode?: 'skip' | 'add') => Promise<void>;
  selectFilesAndImport: () => Promise<void>;
  selectFolderAndImport: () => Promise<void>;
  updateAsset: (input: Partial<Pick<AssetRecord, 'title' | 'memo' | 'rating' | 'sourceUrl' | 'isFavorite'>> & { id: string }) => Promise<void>;
  trashSelection: () => Promise<void>;
  restoreSelection: () => Promise<void>;
  permanentlyDeleteSelection: (assetIds?: string[]) => Promise<AssetPermanentDeleteResult | null>;
  createTag: (name: string, color?: string) => Promise<TagRecord | null>;
  updateTag: (input: { id: string; name?: string; color?: string }) => Promise<void>;
  deleteTags: (ids: string[]) => Promise<void>;
  deleteUnusedTags: () => Promise<number>;
  mergeTags: (input: TagMergeInput) => Promise<void>;
  addTagsToSelection: (tagIds: string[]) => Promise<AssetBatchOperationResult | null>;
  removeTagsFromSelection: (tagIds: string[]) => Promise<AssetBatchOperationResult | null>;
  setSelectionRating: (rating: number) => Promise<AssetBatchOperationResult | null>;
  setSelectionFavorite: (isFavorite: boolean) => Promise<AssetBatchOperationResult | null>;
  assignTag: (assetId: string, tagId: string) => Promise<void>;
  removeTag: (assetId: string, tagId: string) => Promise<void>;
  resolveDuplicateGroup: (input: DuplicateResolutionInput) => Promise<void>;
  mergeDuplicateAssets: (input: { hash: string; targetAssetId: string; sourceAssetIds: string[] }) => Promise<void>;
  trashDuplicateAsset: (hash: string, assetId: string) => Promise<void>;
  createCollection: (name: string) => Promise<CollectionRecord | null>;
  updateCollection: (input: { id: string; name?: string; description?: string; color?: string; coverAssetId?: string | null }) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  addSelectionToCollection: (collectionId: string) => Promise<void>;
  createCollectionAndAddSelection: (name: string) => Promise<AssetBatchOperationResult | null>;
  addSelectionToCollectionBatch: (collectionId: string) => Promise<AssetBatchOperationResult | null>;
  removeAssetFromCollection: (collectionId: string, assetId: string) => Promise<void>;
  createSmartFolder: (name: string, query: SmartFolderQuery) => Promise<void>;
  deleteSmartFolder: (id: string) => Promise<void>;
  createExport: (input: ExportInput) => Promise<void>;
  openPath: (targetPath: string) => Promise<void>;
  dismissImportSummary: () => void;
  dismissBatchResult: () => void;
  dismissPermanentDeleteResult: () => void;
  dismissError: () => void;
};

export const useRefForgeStore = create<RefForgeState>((set, get) => ({
  config: null,
  library: null,
  recentLibraries: [],
  assets: [],
  assetTotalCount: 0,
  assetLimit: ASSET_PAGE_SIZE,
  assetOffset: 0,
  assetHasMore: false,
  tags: [],
  collections: [],
  smartFolders: [],
  importBatches: [],
  duplicateGroups: [],
  exportPresets: [],
  languagePreference: getStoredLanguagePreference(),
  selectedIds: [],
  activeAssetId: null,
  selectionAnchorId: null,
  viewerAssetId: null,
  search: '',
  tagId: null,
  collectionId: null,
  smartFolderId: null,
  favoriteOnly: false,
  trashOnly: false,
  duplicateOnly: false,
  viewMode: readViewModePreference(),
  assetSort: readJsonPreference<AssetSort>('refForge:assetSort', DEFAULT_ASSET_SORT),
  assetFilters: EMPTY_ASSET_FILTERS,
  gridThumbnailSize: readNumberPreference('refForge:gridThumbnailSize', 176),
  showFileNames: readBooleanPreference('refForge:showFileNames', true),
  loading: false,
  importing: false,
  pendingImportTotal: 0,
  savingAssetIds: [],
  lastSavedAt: null,
  importSummary: null,
  lastExport: null,
  lastBatchResult: null,
  lastPermanentDeleteResult: null,
  error: null,

  boot: async () => {
    set({ loading: true, error: null });
    try {
      const [config, library, recentLibraries] = await Promise.all([
        window.refForge.getAppConfig(),
        window.refForge.getActiveLibrary(),
        window.refForge.listRecentLibraries()
      ]);
      set({ config, library, recentLibraries, loading: false });
      if (library) {
        await get().loadMetadata();
        await get().loadAssets();
      }
    } catch (error) {
      set({ loading: false, error: toMessage(error) });
    }
  },

  createLibrary: async () => {
    set({ loading: true, error: null });
    try {
      const library = await window.refForge.createLibrary();
      if (library) {
        set({ library });
        await get().loadRecentLibraries();
        await get().loadMetadata();
        await get().loadAssets();
      }
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ loading: false });
    }
  },

  openLibrary: async () => {
    set({ loading: true, error: null });
    try {
      const library = await window.refForge.openLibrary();
      if (library) {
        set({ library, selectedIds: [], activeAssetId: null, selectionAnchorId: null, viewerAssetId: null });
        await get().loadRecentLibraries();
        await get().loadMetadata();
        await get().loadAssets();
      }
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ loading: false });
    }
  },

  openRecentLibrary: async (rootPath) => {
    set({ loading: true, error: null });
    try {
      const library = await window.refForge.openLibraryPath(rootPath);
      set({
        library,
        selectedIds: [],
        activeAssetId: null,
        selectionAnchorId: null,
        viewerAssetId: null,
        search: '',
        tagId: null,
        collectionId: null,
        smartFolderId: null,
        favoriteOnly: false,
        trashOnly: false,
        duplicateOnly: false,
        assetFilters: EMPTY_ASSET_FILTERS,
        assets: [],
        assetTotalCount: 0,
        assetHasMore: false
      });
      await get().loadRecentLibraries();
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      await get().loadRecentLibraries();
      set({ error: toMessage(error) });
    } finally {
      set({ loading: false });
    }
  },

  loadRecentLibraries: async () => {
    try {
      const recentLibraries = await window.refForge.listRecentLibraries();
      set({ recentLibraries });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  removeRecentLibrary: async (rootPath) => {
    try {
      const recentLibraries = await window.refForge.removeRecentLibrary(rootPath);
      set({ recentLibraries });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  loadMetadata: async () => {
    const [library, tags, collections, smartFolders, importBatches, exportPresets] = await Promise.all([
      window.refForge.getActiveLibrary(),
      window.refForge.listTags(),
      window.refForge.listCollections(),
      window.refForge.listSmartFolders(),
      window.refForge.listImportBatches(),
      window.refForge.listExportPresets(getActiveLanguage())
    ]);
    set({ library, tags, collections, smartFolders, importBatches, exportPresets });
  },

  loadAssets: async (options) => {
    const state = get();
    if (!state.library) {
      return;
    }
    const append = options?.append ?? false;
    if (append && (!state.assetHasMore || state.loading)) {
      return;
    }
    const offset = append ? state.assets.length : 0;

    const query: AssetListQuery = {
      search: state.search,
      tagId: state.tagId,
      collectionId: state.collectionId,
      smartFolderId: state.smartFolderId,
      favoriteOnly: state.favoriteOnly,
      trashOnly: state.trashOnly,
      duplicateOnly: state.duplicateOnly,
      sort: state.assetSort,
      filters: state.assetFilters,
      limit: ASSET_PAGE_SIZE,
      offset
    };

    set({ loading: true, error: null });
    try {
      const [assetResult, duplicateGroups] = await Promise.all([
        window.refForge.listAssets(query),
        state.duplicateOnly ? window.refForge.listDuplicateGroups() : Promise.resolve(get().duplicateGroups)
      ]);
      const assets = append ? appendUniqueAssets(get().assets, assetResult.items) : assetResult.items;
      const activeStillExists = assets.some((asset) => asset.id === get().activeAssetId);
      const anchorStillExists = assets.some((asset) => asset.id === get().selectionAnchorId);
      const viewerStillExists = assets.some((asset) => asset.id === get().viewerAssetId);
      const selectedIds = get().selectedIds.filter((id) => assets.some((asset) => asset.id === id));
      set({
        assets,
        assetTotalCount: assetResult.totalCount,
        assetLimit: assetResult.limit,
        assetOffset: assetResult.offset,
        assetHasMore: assetResult.hasMore,
        duplicateGroups,
        loading: false,
        activeAssetId: activeStillExists ? get().activeAssetId : append ? get().activeAssetId : assets[0]?.id ?? null,
        selectionAnchorId: anchorStillExists ? get().selectionAnchorId : selectedIds[0] ?? null,
        viewerAssetId: viewerStillExists ? get().viewerAssetId : null,
        selectedIds
      });
    } catch (error) {
      set({ loading: false, error: toMessage(error) });
    }
  },

  loadMoreAssets: async () => {
    await get().loadAssets({ append: true });
  },

  loadDuplicateGroups: async (query) => {
    try {
      const duplicateGroups = await window.refForge.listDuplicateGroups(query);
      set({ duplicateGroups });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  selectAsset: (assetId, mode = 'replace') => {
    const { assets, selectedIds, activeAssetId, selectionAnchorId } = get();
    set(
      getNextAssetSelection(
        {
          orderedAssetIds: assets.map((asset) => asset.id),
          selectedIds,
          activeAssetId,
          selectionAnchorId
        },
        assetId,
        mode
      )
    );
  },

  selectAssets: (assetIds, activeAssetId, options) => {
    const selectedIds = filterLoadedSelection(
      assetIds,
      get().assets.map((asset) => asset.id)
    );
    const nextActiveAssetId = activeAssetId === undefined ? selectedIds[0] ?? null : activeAssetId;
    set({
      selectedIds,
      activeAssetId: nextActiveAssetId,
      selectionAnchorId: options?.preserveAnchor ? get().selectionAnchorId : nextActiveAssetId
    });
  },

  selectAllLoadedAssets: () => {
    set(getSelectAllSelection(get().assets.map((asset) => asset.id)));
  },

  clearSelection: () => set({ selectedIds: [], activeAssetId: null, selectionAnchorId: null }),

  openViewer: (assetId) => {
    const state = get();
    const targetId = assetId ?? state.activeAssetId ?? state.selectedIds[0] ?? state.assets[0]?.id ?? null;
    if (targetId) {
      set({ viewerAssetId: targetId, activeAssetId: targetId, selectionAnchorId: targetId, selectedIds: [targetId] });
    }
  },

  closeViewer: () => set({ viewerAssetId: null }),

  showNextViewerAsset: () => {
    const state = get();
    const currentIndex = state.assets.findIndex((asset) => asset.id === state.viewerAssetId);
    if (currentIndex < 0 || state.assets.length === 0) {
      return;
    }
    const nextAsset = state.assets[(currentIndex + 1) % state.assets.length];
    set({ viewerAssetId: nextAsset.id, activeAssetId: nextAsset.id, selectionAnchorId: nextAsset.id, selectedIds: [nextAsset.id] });
  },

  showPreviousViewerAsset: () => {
    const state = get();
    const currentIndex = state.assets.findIndex((asset) => asset.id === state.viewerAssetId);
    if (currentIndex < 0 || state.assets.length === 0) {
      return;
    }
    const previousAsset = state.assets[(currentIndex - 1 + state.assets.length) % state.assets.length];
    set({
      viewerAssetId: previousAsset.id,
      activeAssetId: previousAsset.id,
      selectionAnchorId: previousAsset.id,
      selectedIds: [previousAsset.id]
    });
  },

  setSearch: (search) => {
    set({ search, selectedIds: [], activeAssetId: null, selectionAnchorId: null });
    void get().loadAssets();
  },

  setTagFilter: (tagId) => {
    set({
      tagId,
      trashOnly: false,
      duplicateOnly: false,
      smartFolderId: null,
      selectedIds: [],
      activeAssetId: null,
      selectionAnchorId: null
    });
    void get().loadAssets();
  },

  setCollectionFilter: (collectionId) => {
    set({
      collectionId,
      trashOnly: false,
      duplicateOnly: false,
      smartFolderId: null,
      selectedIds: [],
      activeAssetId: null,
      selectionAnchorId: null
    });
    void get().loadAssets();
  },

  setSmartFolderFilter: (smartFolderId) => {
    set({
      smartFolderId,
      tagId: null,
      collectionId: null,
      trashOnly: false,
      duplicateOnly: false,
      selectedIds: [],
      activeAssetId: null,
      selectionAnchorId: null
    });
    void get().loadAssets();
  },

  setFavoriteOnly: (favoriteOnly) => {
    set({
      favoriteOnly,
      trashOnly: false,
      selectedIds: [],
      activeAssetId: null,
      selectionAnchorId: null
    });
    void get().loadAssets();
  },

  setTrashOnly: (trashOnly) => {
    set({
      trashOnly,
      duplicateOnly: false,
      smartFolderId: null,
      tagId: null,
      collectionId: null,
      selectedIds: [],
      activeAssetId: null,
      selectionAnchorId: null
    });
    void get().loadAssets();
  },

  setDuplicateOnly: async (duplicateOnly) => {
    set({
      duplicateOnly,
      trashOnly: false,
      smartFolderId: null,
      tagId: null,
      collectionId: null,
      selectedIds: [],
      activeAssetId: null,
      selectionAnchorId: null
    });
    await get().loadAssets();
  },

  setViewModeFilter: async (viewMode) => {
    set({
      favoriteOnly: viewMode === 'favorites',
      trashOnly: viewMode === 'trash',
      duplicateOnly: viewMode === 'duplicates',
      smartFolderId: viewMode === 'library' || viewMode === 'favorites' ? get().smartFolderId : null,
      tagId: viewMode === 'library' || viewMode === 'favorites' ? get().tagId : null,
      collectionId: viewMode === 'library' || viewMode === 'favorites' ? get().collectionId : null,
      selectedIds: [],
      activeAssetId: null,
      selectionAnchorId: null
    });
    await get().loadAssets();
  },

  setAssetViewMode: (viewMode) => {
    window.localStorage.setItem('refForge:viewMode', viewMode);
    set({ viewMode });
  },

  setAssetSort: (assetSort) => {
    window.localStorage.setItem('refForge:assetSort', JSON.stringify(assetSort));
    set({ assetSort, selectedIds: [], activeAssetId: null, selectionAnchorId: null });
    void get().loadAssets();
  },

  setAssetFilters: async (assetFilters) => {
    set({ assetFilters, selectedIds: [], activeAssetId: null, selectionAnchorId: null });
    await get().loadAssets();
  },

  applyAssetFilterDraft: async (viewMode, assetFilters) => {
    set({
      favoriteOnly: viewMode === 'favorites',
      trashOnly: viewMode === 'trash',
      duplicateOnly: viewMode === 'duplicates',
      assetFilters,
      smartFolderId: viewMode === 'library' || viewMode === 'favorites' ? get().smartFolderId : null,
      tagId: viewMode === 'library' || viewMode === 'favorites' ? get().tagId : null,
      collectionId: viewMode === 'library' || viewMode === 'favorites' ? get().collectionId : null,
      selectedIds: [],
      activeAssetId: null,
      selectionAnchorId: null
    });
    await get().loadAssets();
  },

  clearFilters: () => {
    set({
      search: '',
      tagId: null,
      collectionId: null,
      smartFolderId: null,
      favoriteOnly: false,
      trashOnly: false,
      duplicateOnly: false,
      assetFilters: EMPTY_ASSET_FILTERS,
      selectedIds: [],
      activeAssetId: null,
      selectionAnchorId: null
    });
    void get().loadAssets();
  },

  setGridThumbnailSize: (size) => {
    const clamped = Math.max(112, Math.min(260, size));
    window.localStorage.setItem('refForge:gridThumbnailSize', String(clamped));
    set({ gridThumbnailSize: clamped });
  },

  setShowFileNames: (showFileNames) => {
    window.localStorage.setItem('refForge:showFileNames', showFileNames ? 'true' : 'false');
    set({ showFileNames });
  },

  setLanguagePreference: async (languagePreference) => {
    await changeLanguagePreference(languagePreference);
    set({ languagePreference });
    await get().loadMetadata();
  },

  importPaths: async (filePaths, duplicateMode = 'skip') => {
    if (filePaths.length === 0) {
      return;
    }

    set({ importing: true, pendingImportTotal: filePaths.length, error: null });
    try {
      const importSummary = await window.refForge.importFiles({ filePaths, duplicateMode });
      set({ importSummary });
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ importing: false, pendingImportTotal: 0 });
    }
  },

  selectFilesAndImport: async () => {
    try {
      const filePaths = await window.refForge.selectImportFiles();
      await get().importPaths(filePaths);
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  selectFolderAndImport: async () => {
    try {
      const folderPath = await window.refForge.selectImportFolder();
      if (!folderPath) {
        return;
      }

      set({ importing: true, pendingImportTotal: 0, error: null });
      const importSummary = await window.refForge.importFolder({ folderPath, duplicateMode: 'skip' });
      set({ importSummary });
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ importing: false, pendingImportTotal: 0 });
    }
  },

  updateAsset: async (input) => {
    set({ savingAssetIds: addUnique(get().savingAssetIds, input.id) });
    try {
      const updated = await window.refForge.updateAsset(input);
      set({
        assets: get().assets.map((asset) => (asset.id === updated.id ? updated : asset)),
        lastSavedAt: new Date().toISOString(),
        error: null
      });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ savingAssetIds: get().savingAssetIds.filter((id) => id !== input.id) });
    }
  },

  trashSelection: async () => {
    const assetIds = getTargetAssetIds(get());
    if (assetIds.length === 0) {
      set({ error: i18n.t('errors:selectAssets') });
      return;
    }

    try {
      await window.refForge.trashAssets(assetIds);
      set({ selectedIds: [], activeAssetId: null, selectionAnchorId: null, viewerAssetId: null });
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  restoreSelection: async () => {
    const assetIds = getTargetAssetIds(get());
    if (assetIds.length === 0) {
      set({ error: i18n.t('errors:selectAssets') });
      return;
    }

    try {
      await window.refForge.restoreAssets(assetIds);
      set({ selectedIds: [], activeAssetId: null, selectionAnchorId: null, viewerAssetId: null });
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  permanentlyDeleteSelection: async (assetIdsOverride) => {
    const state = get();
    const assetIds = assetIdsOverride ? uniqueStrings(assetIdsOverride) : getTargetAssetIds(state);
    if (assetIds.length === 0) {
      set({ error: i18n.t('errors:selectAssets') });
      return null;
    }
    let deletedAssetIds = assetIds;
    if (!assetIdsOverride) {
      deletedAssetIds = assetIds.filter((assetId) => state.assets.some((asset) => asset.id === assetId && asset.isDeleted));
      if (deletedAssetIds.length === 0 || deletedAssetIds.length !== assetIds.length) {
        set({ error: i18n.t('errors:permanentDeleteRequiresTrash') });
        return null;
      }
    }

    try {
      const result = await window.refForge.permanentlyDeleteAssets(deletedAssetIds);
      const failedAssetIds = uniqueStrings(result.failures.map((failure) => failure.assetId).filter((id): id is string => Boolean(id)));
      set({
        selectedIds: failedAssetIds,
        activeAssetId: failedAssetIds[0] ?? null,
        selectionAnchorId: failedAssetIds[0] ?? null,
        viewerAssetId: null,
        lastPermanentDeleteResult: result
      });
      await get().loadMetadata();
      await get().loadAssets();
      return result;
    } catch (error) {
      set({ error: toMessage(error) });
      return null;
    }
  },

  createTag: async (name, color) => {
    try {
      const tag = await window.refForge.createTag({ name, color });
      await get().loadMetadata();
      return tag;
    } catch (error) {
      set({ error: toMessage(error) });
      return null;
    }
  },

  updateTag: async (input) => {
    try {
      await window.refForge.updateTag(input);
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  deleteTags: async (ids) => {
    try {
      await window.refForge.deleteTags(ids);
      set({
        tagId: ids.includes(get().tagId ?? '') ? null : get().tagId
      });
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  deleteUnusedTags: async () => {
    try {
      const deletedCount = await window.refForge.deleteUnusedTags();
      await get().loadMetadata();
      await get().loadAssets();
      return deletedCount;
    } catch (error) {
      set({ error: toMessage(error) });
      return 0;
    }
  },

  mergeTags: async (input) => {
    try {
      await window.refForge.mergeTags(input);
      set({
        tagId: input.sourceTagIds.includes(get().tagId ?? '') ? input.targetTagId : get().tagId
      });
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  addTagsToSelection: async (tagIds) => {
    const assetIds = get().selectedIds;
    if (assetIds.length === 0 || tagIds.length === 0) {
      set({ error: i18n.t('errors:selectAssets') });
      return null;
    }

    try {
      const result = await window.refForge.addTagsToAssets({ assetIds, tagIds });
      set({ lastBatchResult: result });
      await get().loadMetadata();
      await get().loadAssets();
      return result;
    } catch (error) {
      set({ error: toMessage(error) });
      return null;
    }
  },

  removeTagsFromSelection: async (tagIds) => {
    const assetIds = get().selectedIds;
    if (assetIds.length === 0 || tagIds.length === 0) {
      set({ error: i18n.t('errors:selectAssets') });
      return null;
    }

    try {
      const result = await window.refForge.removeTagsFromAssets({ assetIds, tagIds });
      set({ lastBatchResult: result });
      await get().loadMetadata();
      await get().loadAssets();
      return result;
    } catch (error) {
      set({ error: toMessage(error) });
      return null;
    }
  },

  setSelectionRating: async (rating) => {
    const assetIds = get().selectedIds;
    if (assetIds.length === 0) {
      set({ error: i18n.t('errors:selectAssets') });
      return null;
    }

    try {
      const result = await window.refForge.setAssetsRating({ assetIds, rating });
      set({ lastBatchResult: result });
      await get().loadMetadata();
      await get().loadAssets();
      return result;
    } catch (error) {
      set({ error: toMessage(error) });
      return null;
    }
  },

  setSelectionFavorite: async (isFavorite) => {
    const assetIds = get().selectedIds;
    if (assetIds.length === 0) {
      set({ error: i18n.t('errors:selectAssets') });
      return null;
    }

    try {
      const result = await window.refForge.setAssetsFavorite({ assetIds, isFavorite });
      set({ lastBatchResult: result });
      await get().loadMetadata();
      await get().loadAssets();
      return result;
    } catch (error) {
      set({ error: toMessage(error) });
      return null;
    }
  },

  assignTag: async (assetId, tagId) => {
    try {
      const updated = await window.refForge.assignTag({ assetId, tagId });
      set({ assets: get().assets.map((asset) => (asset.id === updated.id ? updated : asset)) });
      await get().loadMetadata();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  resolveDuplicateGroup: async (input) => {
    try {
      await window.refForge.resolveDuplicateGroup(input);
      await get().loadDuplicateGroups();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  mergeDuplicateAssets: async (input) => {
    try {
      await window.refForge.mergeDuplicateAssets({ ...input, moveSourcesToTrash: true });
      set({ selectedIds: [], activeAssetId: input.targetAssetId, selectionAnchorId: input.targetAssetId });
      await get().loadMetadata();
      await get().loadDuplicateGroups();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  trashDuplicateAsset: async (_hash, assetId) => {
    try {
      await window.refForge.trashAssets([assetId]);
      set({ selectedIds: [], activeAssetId: null, selectionAnchorId: null, viewerAssetId: null });
      await get().loadMetadata();
      await get().loadDuplicateGroups();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  removeTag: async (assetId, tagId) => {
    try {
      const updated = await window.refForge.removeTag({ assetId, tagId });
      set({ assets: get().assets.map((asset) => (asset.id === updated.id ? updated : asset)) });
      await get().loadMetadata();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  createCollection: async (name) => {
    try {
      const collection = await window.refForge.createCollection({ name });
      await get().loadMetadata();
      return collection;
    } catch (error) {
      set({ error: toMessage(error) });
      return null;
    }
  },

  updateCollection: async (input) => {
    try {
      await window.refForge.updateCollection(input);
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  deleteCollection: async (id) => {
    try {
      await window.refForge.deleteCollection(id);
      set({ collectionId: get().collectionId === id ? null : get().collectionId });
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  addSelectionToCollection: async (collectionId) => {
    const assetIds = get().selectedIds;
    if (assetIds.length === 0) {
      set({ error: i18n.t('errors:selectAssets') });
      return;
    }

    try {
      await window.refForge.addAssetsToCollection({ collectionId, assetIds });
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  addSelectionToCollectionBatch: async (collectionId) => {
    const assetIds = get().selectedIds;
    if (assetIds.length === 0) {
      set({ error: i18n.t('errors:selectAssets') });
      return null;
    }

    try {
      const result = await window.refForge.addAssetsToCollectionBatch({ collectionId, assetIds });
      set({ lastBatchResult: result });
      await get().loadMetadata();
      await get().loadAssets();
      return result;
    } catch (error) {
      set({ error: toMessage(error) });
      return null;
    }
  },

  createCollectionAndAddSelection: async (name) => {
    const assetIds = get().selectedIds;
    if (assetIds.length === 0) {
      set({ error: i18n.t('errors:selectAssets') });
      return null;
    }

    try {
      const { result } = await window.refForge.createCollectionAndAddAssets({ name, assetIds });
      set({ lastBatchResult: result });
      await get().loadMetadata();
      await get().loadAssets();
      return result;
    } catch (error) {
      set({ error: toMessage(error) });
      return null;
    }
  },

  removeAssetFromCollection: async (collectionId, assetId) => {
    try {
      await window.refForge.removeAssetFromCollection({ collectionId, assetId });
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  createSmartFolder: async (name, query) => {
    try {
      await window.refForge.createSmartFolder({ name, query });
      await get().loadMetadata();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  deleteSmartFolder: async (id) => {
    try {
      await window.refForge.deleteSmartFolder(id);
      if (get().smartFolderId === id) {
        set({ smartFolderId: null });
      }
      await get().loadMetadata();
      await get().loadAssets();
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  createExport: async (input) => {
    try {
      const assetIds = input.collectionId ? [] : get().selectedIds;
      const lastExport = await window.refForge.createExport({ ...input, assetIds, locale: getActiveLanguage() });
      set({ lastExport, error: null });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  openPath: async (targetPath) => {
    try {
      await window.refForge.openPath(targetPath);
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  dismissImportSummary: () => set({ importSummary: null }),
  dismissBatchResult: () => set({ lastBatchResult: null }),
  dismissPermanentDeleteResult: () => set({ lastPermanentDeleteResult: null }),
  dismissError: () => set({ error: null })
}));

export function selectActiveAsset(state: RefForgeState): AssetRecord | null {
  return state.assets.find((asset) => asset.id === state.activeAssetId) ?? null;
}

function appendUniqueAssets(currentAssets: AssetRecord[], nextAssets: AssetRecord[]): AssetRecord[] {
  const seen = new Set(currentAssets.map((asset) => asset.id));
  return [...currentAssets, ...nextAssets.filter((asset) => !seen.has(asset.id))];
}

function toMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw
    .replace(/^Error invoking remote method '[^']+': Error:\s*/u, '')
    .replace(/^Error invoking remote method '[^']+':\s*/u, '');
  const codeMatch = /^(LIBRARY_CREATE_FAILED|LIBRARY_OPEN_FAILED|IMPORT_FAILED|THUMBNAIL_FAILED|DB_SAVE_FAILED|EXPORT_FAILED|TRASH_FAILED|RESTORE_FAILED|PERMANENT_DELETE_FAILED|SMART_FOLDER_SAVE_FAILED)\|(.+)$/u.exec(message);
  if (!codeMatch) {
    return message;
  }

  return `${i18n.t(`errors:codes.${codeMatch[1]}`)} ${i18n.t('errors:details')}: ${codeMatch[2]}`;
}

function addUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function getTargetAssetIds(state: RefForgeState): string[] {
  if (state.selectedIds.length > 0) {
    return state.selectedIds;
  }
  return state.activeAssetId ? [state.activeAssetId] : [];
}

function readNumberPreference(key: string, fallback: number): number {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readBooleanPreference(key: string, fallback: boolean): boolean {
  const value = window.localStorage.getItem(key);
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fallback;
}

function readViewModePreference(): 'grid' | 'list' {
  return window.localStorage.getItem('refForge:viewMode') === 'list' ? 'list' : 'grid';
}

function readJsonPreference<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
