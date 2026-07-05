import type { LocaleCode } from './i18n/types';

export type ThemePreference = 'dark' | 'light' | 'system';

export type AppConfig = {
  appName: string;
  appVersion: string;
  appDescription: string;
  appLicense: string;
  formatVersion: number;
  thumbnailSize: number;
  gridThumbnailSize: number;
  theme: ThemePreference;
  defaultImportMode: 'copy' | 'link';
  autoDuplicateCheck: boolean;
  autoColorAnalysis: boolean;
  supportedImageExtensions: string[];
  supportedVideoExtensions: string[];
  placeholderExtensions: string[];
  ffmpegPath?: string;
  ffprobePath?: string;
};

export type LibraryManifest = {
  appName: string;
  formatVersion: number;
  libraryId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  paths: {
    database: string;
    originals: string;
    thumbnails: string;
    previews: string;
    exports: string;
    backups: string;
  };
};

export type LibrarySummary = {
  id: string;
  name: string;
  rootPath: string;
  manifestPath: string;
  assetCount: number;
};

export type RecentLibraryRecord = {
  name: string;
  rootPath: string;
  manifestPath: string;
  assetCount: number;
  lastOpenedAt: string;
  exists: boolean;
};

export type TagRecord = {
  id: string;
  name: string;
  color: string;
  assetCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type CollectionRecord = {
  id: string;
  name: string;
  description: string;
  color: string;
  coverAssetId: string | null;
  coverAssetThumbnailUrl: string | null;
  coverAssetTitle: string | null;
  assetCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type CollectionAssetOrderInput = {
  collectionId: string;
  assetIds: string[];
};

export type CollectionAssetOrderResult = {
  collectionId: string;
  updatedCount: number;
  items: string[];
  warnings: BatchOperationWarning[];
  failures: BatchOperationFailure[];
};

export type AssetColor = {
  id: string;
  assetId: string;
  color: string;
  red: number | null;
  green: number | null;
  blue: number | null;
  population: number;
  sortOrder: number;
};

export type AssetRecord = {
  id: string;
  libraryId: string;
  title: string;
  originalFileName: string;
  storedFilePath: string;
  thumbnailPath: string | null;
  previewPath: string | null;
  mediaType: string;
  mimeType: string | null;
  extension: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  isAnimated: boolean;
  hasTransparency: boolean;
  thumbnailStatus: string;
  previewStatus: string;
  analysisStatus: string;
  hash: string;
  perceptualHash: string | null;
  rating: number;
  memo: string;
  sourceUrl: string;
  isFavorite: boolean;
  isDeleted: boolean;
  originalRelativePath: string | null;
  importBatchId: string | null;
  deletedAt: string | null;
  permanentlyDeletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  importedAt: string;
  tags: TagRecord[];
  collections: CollectionRecord[];
  colors: AssetColor[];
  storedFileUrl: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
};

export type AssetUpdateInput = {
  id: string;
  title?: string;
  memo?: string;
  rating?: number;
  sourceUrl?: string;
  isFavorite?: boolean;
};

export type AssetSortField =
  | 'importedAt'
  | 'title'
  | 'sizeBytes'
  | 'pixelCount'
  | 'rating'
  | 'extension'
  | 'collectionOrder';

export type SortDirection = 'asc' | 'desc';

export type AssetSort = {
  field: AssetSortField;
  direction: SortDirection;
};

export type AssetFilters = {
  mediaTypes?: string[];
  extensions?: string[];
  color?: {
    hex: string;
    tolerance: number;
    minRatio?: number;
  } | null;
  favoriteOnly?: boolean;
  minRating?: number | null;
  includeTagIds?: string[];
  excludeTagIds?: string[];
  aspect?: 'portrait' | 'landscape' | 'square' | null;
  minWidth?: number | null;
  minHeight?: number | null;
  hasMemo?: boolean;
  hasSourceUrl?: boolean;
  recentDays?: number | null;
  duplicateOnly?: boolean;
  deletedOnly?: boolean;
};

export type LegacyAssetSort =
  | 'importedDesc'
  | 'importedAsc'
  | 'titleAsc'
  | 'titleDesc'
  | 'ratingDesc'
  | 'ratingAsc'
  | 'sizeDesc'
  | 'sizeAsc'
  | 'extensionAsc'
  | 'pixelCountDesc'
  | 'pixelCountAsc';

export type AssetListQuery = {
  libraryId?: string;
  viewMode?: 'library' | 'favorites' | 'trash' | 'duplicates' | 'collection' | 'smartFolder' | 'tag';
  search?: string;
  tagId?: string | null;
  tagIds?: string[];
  collectionId?: string | null;
  smartFolderId?: string | null;
  duplicateGroupHash?: string | null;
  favoriteOnly?: boolean;
  trashOnly?: boolean;
  isDeleted?: boolean;
  duplicateOnly?: boolean;
  filters?: AssetFilters;
  sort?: AssetSort | LegacyAssetSort;
  limit?: number;
  offset?: number;
};

export type AssetListResult = {
  items: AssetRecord[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type DuplicateMode = 'skip' | 'add';

export type ImportFilesInput = {
  filePaths: string[];
  duplicateMode?: DuplicateMode;
  sourceType?: 'files' | 'folder' | 'clipboard';
  sourcePath?: string;
  basePath?: string;
};

export type ImportFolderInput = {
  folderPath: string;
  duplicateMode?: DuplicateMode;
};

export type ImportMetrics = {
  totalFiles: number;
  supportedFiles: number;
  importedCount: number;
  skippedDuplicatesCount: number;
  failedCount: number;
  unsupportedCount: number;
  totalDurationMs: number;
  averagePerFileMs: number;
  scanDurationMs: number;
  hashDurationMs: number;
  copyDurationMs: number;
  thumbnailDurationMs: number;
  colorAnalysisDurationMs: number;
  dbDurationMs: number;
};

export type ImportItemResult = {
  sourcePath: string;
  status: 'imported' | 'duplicate' | 'failed' | 'unsupported';
  asset?: AssetRecord;
  duplicateAsset?: AssetRecord;
  error?: string;
  warnings?: string[];
  originalRelativePath?: string | null;
};

export type ImportSummary = {
  batchId?: string;
  sourceType?: 'files' | 'folder' | 'clipboard';
  sourcePath?: string;
  total: number;
  supported: number;
  imported: number;
  duplicates: number;
  failed: number;
  unsupported: number;
  durationMs: number;
  metrics: ImportMetrics;
  items: ImportItemResult[];
};

export type ImportBatchRecord = {
  id: string;
  libraryId: string;
  sourceType: string;
  sourcePath: string;
  totalCount: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  status: string;
  metrics: Partial<ImportMetrics>;
};

export type SmartFolderCondition = {
  field:
    | 'tag'
    | 'tagExcluded'
    | 'rating'
    | 'favorite'
    | 'recentDays'
    | 'mediaType'
    | 'extension'
    | 'orientation'
    | 'width'
    | 'height'
    | 'memo'
    | 'sourceUrl';
  operator: 'contains' | '>=' | '=' | 'exists';
  value: string | number | boolean;
};

export type SmartFolderQuery = {
  mode: 'all' | 'any';
  conditions: SmartFolderCondition[];
};

export type SmartFolderRecord = {
  id: string;
  libraryId: string;
  name: string;
  query: SmartFolderQuery;
  createdAt: string;
  updatedAt: string;
};

export type SmartFolderUpdateInput = {
  id: string;
  name?: string;
  query?: SmartFolderQuery;
};

export type DuplicateGroup = {
  hash: string;
  assets: AssetRecord[];
  fileCount: number;
  totalSizeBytes: number;
  reclaimableBytes: number;
  status: DuplicateResolutionStatus;
  keepAssetId: string | null;
  note: string;
  resolvedAt: string | null;
  ignoredAt: string | null;
};

export type DuplicateResolutionStatus = 'unresolved' | 'resolved' | 'ignored';

export type DuplicateGroupQuery = {
  statuses?: DuplicateResolutionStatus[];
  includeResolved?: boolean;
  includeIgnored?: boolean;
  limit?: number;
  offset?: number;
};

export type DuplicateResolutionInput = {
  hash: string;
  status: DuplicateResolutionStatus;
  keepAssetId?: string | null;
  note?: string;
};

export type DuplicateMergeInput = {
  hash: string;
  targetAssetId: string;
  sourceAssetIds: string[];
  moveSourcesToTrash?: boolean;
};

export type TagMergeInput = {
  sourceTagIds: string[];
  targetTagId: string;
};

export type BatchOperationFailure = {
  assetId: string | null;
  title?: string;
  target?: string;
  code: string;
  message: string;
};

export type BatchOperationWarning = {
  assetId: string | null;
  title?: string;
  target?: string;
  code: string;
  message: string;
};

export type AssetBatchOperationResult = {
  requestedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  affectedAssetIds: string[];
  failures: BatchOperationFailure[];
  warnings: BatchOperationWarning[];
};

export type AssetBatchTagInput = {
  assetIds: string[];
  tagIds: string[];
};

export type AssetBatchRatingInput = {
  assetIds: string[];
  rating: number;
};

export type AssetBatchFavoriteInput = {
  assetIds: string[];
  isFavorite: boolean;
};

export type AssetBatchCollectionInput = {
  assetIds: string[];
  collectionId: string;
};

export type CollectionCreateAndAddAssetsInput = {
  assetIds: string[];
  name: string;
  description?: string;
  color?: string;
};

export type CollectionCreateAndAddAssetsResult = {
  collection: CollectionRecord;
  result: AssetBatchOperationResult;
};

export type PermanentDeleteFileTarget = 'original' | 'thumbnail' | 'preview';

export type PermanentDeleteFileStatus = 'deleted' | 'already_missing' | 'failed' | 'outside_library';

export type PermanentDeleteFileResult = {
  assetId: string;
  title: string;
  target: PermanentDeleteFileTarget;
  relativePath: string;
  status: PermanentDeleteFileStatus;
  errorCode?: string;
  errorMessage?: string;
};

export type AssetPermanentDeleteResult = AssetBatchOperationResult & {
  batchId: string;
  deletedFileCount: number;
  missingFileCount: number;
  failedFileCount: number;
  fileResults: PermanentDeleteFileResult[];
};

export type ExportPreset = {
  id: string;
  name: string;
  description: string;
  outputFileName: string;
  sections: string[];
  defaultGoal: string;
  defaultApplyInstructions: string;
  defaultForbiddenRules: string;
};

export type ExportInput = {
  locale?: LocaleCode;
  presetId?: string;
  templateId?: string;
  name: string;
  goal: string;
  commonTraits: string;
  instructions: string;
  constraints: string;
  outputFileName?: string;
  assetIds?: string[];
  collectionId?: string | null;
};

export type ExportResult = {
  exportPath: string;
  markdownPath: string;
  refsPath: string;
  assetCount: number;
  warnings?: string[];
};

export type ExportTemplateSection = {
  id: string;
  name: string;
  body: string;
  enabled: boolean;
};

export type ExportTemplateDefinition = {
  sections: ExportTemplateSection[];
  defaults: {
    goal?: string;
    commonTraits?: string;
    applyInstructions?: string;
    forbiddenRules?: string;
    outputFileName?: string;
  };
};

export type ExportTemplateRecord = {
  id: string;
  libraryId: string | null;
  name: string;
  description: string;
  format: 'codex-markdown';
  template: ExportTemplateDefinition;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExportTemplateSaveInput = {
  id?: string;
  name: string;
  description?: string;
  template: ExportTemplateDefinition;
};

export type ExportTemplatePreviewInput = {
  templateId?: string;
  template?: ExportTemplateDefinition;
  input: ExportInput;
};

export type ExportTemplatePreviewResult = {
  markdown: string;
  warnings: string[];
};
