import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent,
  type WheelEvent as ReactWheelEvent
} from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Archive,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Columns3,
  Copy,
  Database,
  Eye,
  EyeOff,
  FileOutput,
  Filter,
  FolderInput,
  FolderOpen,
  FolderPlus,
  GitMerge,
  GripVertical,
  Grid2X2,
  Heart,
  Image,
  Layers,
  List,
  Maximize2,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Star,
  Tags,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
  X
} from 'lucide-react';
import type {
  AssetFilters,
  AssetRecord,
  AssetSort,
  AssetSortField,
  CollectionRecord,
  DuplicateGroup,
  ExportInput,
  ExportPreset,
  SmartFolderCondition,
  SmartFolderQuery,
  SmartFolderRecord
} from '@shared/types';
import { SUPPORTED_LANGUAGES } from '@shared/i18n/languages';
import type { LanguagePreference } from '@shared/i18n/types';
import brandIconUrl from '@brand/icon.svg';
import { selectActiveAsset, useRefForgeStore } from './store';
import {
  getClientSelectionRect,
  getDragSelectedIds,
  rectsIntersect,
  uniqueStrings,
  type ClientRectLike,
  type DragSelectionState
} from './selection-utils';
import styles from './App.module.css';

const EMPTY_FILTERS: AssetFilters = {};
const ASSET_SORT_OPTIONS: Array<{ id: string; sort: AssetSort }> = [
  { id: 'importedAt-desc', sort: { field: 'importedAt', direction: 'desc' } },
  { id: 'importedAt-asc', sort: { field: 'importedAt', direction: 'asc' } },
  { id: 'title-asc', sort: { field: 'title', direction: 'asc' } },
  { id: 'title-desc', sort: { field: 'title', direction: 'desc' } },
  { id: 'sizeBytes-desc', sort: { field: 'sizeBytes', direction: 'desc' } },
  { id: 'sizeBytes-asc', sort: { field: 'sizeBytes', direction: 'asc' } },
  { id: 'pixelCount-desc', sort: { field: 'pixelCount', direction: 'desc' } },
  { id: 'pixelCount-asc', sort: { field: 'pixelCount', direction: 'asc' } },
  { id: 'rating-desc', sort: { field: 'rating', direction: 'desc' } },
  { id: 'rating-asc', sort: { field: 'rating', direction: 'asc' } },
  { id: 'extension-asc', sort: { field: 'extension', direction: 'asc' } },
  { id: 'collectionOrder-asc', sort: { field: 'collectionOrder', direction: 'asc' } }
];

type ListColumnId =
  | 'preview'
  | 'name'
  | 'extension'
  | 'size'
  | 'dimensions'
  | 'ratio'
  | 'rating'
  | 'favorite'
  | 'tags'
  | 'collections'
  | 'imported'
  | 'source';

type ListColumnDefinition = {
  id: ListColumnId;
  labelKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  sortField?: AssetSortField;
};

type ListColumnSettings = {
  columns: Record<ListColumnId, boolean>;
  columnOrder: ListColumnId[];
  columnWidths: Record<ListColumnId, number>;
};

const LIST_COLUMN_DEFINITIONS: ListColumnDefinition[] = [
  { id: 'preview', labelKey: 'list.columns.preview', defaultWidth: 58, minWidth: 52, maxWidth: 88 },
  { id: 'name', labelKey: 'list.columns.name', defaultWidth: 240, minWidth: 150, maxWidth: 520, sortField: 'title' },
  { id: 'extension', labelKey: 'list.columns.extension', defaultWidth: 78, minWidth: 62, maxWidth: 110, sortField: 'extension' },
  { id: 'size', labelKey: 'list.columns.size', defaultWidth: 96, minWidth: 76, maxWidth: 140, sortField: 'sizeBytes' },
  { id: 'dimensions', labelKey: 'list.columns.dimensions', defaultWidth: 118, minWidth: 92, maxWidth: 170, sortField: 'pixelCount' },
  { id: 'ratio', labelKey: 'list.columns.ratio', defaultWidth: 76, minWidth: 64, maxWidth: 110 },
  { id: 'rating', labelKey: 'list.columns.rating', defaultWidth: 76, minWidth: 64, maxWidth: 110, sortField: 'rating' },
  { id: 'favorite', labelKey: 'list.columns.favorite', defaultWidth: 92, minWidth: 78, maxWidth: 130 },
  { id: 'tags', labelKey: 'list.columns.tags', defaultWidth: 170, minWidth: 110, maxWidth: 360 },
  { id: 'collections', labelKey: 'list.columns.collections', defaultWidth: 92, minWidth: 76, maxWidth: 140 },
  { id: 'imported', labelKey: 'list.columns.imported', defaultWidth: 142, minWidth: 112, maxWidth: 210, sortField: 'importedAt' },
  { id: 'source', labelKey: 'list.columns.source', defaultWidth: 220, minWidth: 130, maxWidth: 520 }
];

const LIST_COLUMN_IDS = LIST_COLUMN_DEFINITIONS.map((column) => column.id);
const DEFAULT_LIST_COLUMN_SETTINGS: ListColumnSettings = {
  columns: Object.fromEntries(LIST_COLUMN_IDS.map((id) => [id, true])) as Record<ListColumnId, boolean>,
  columnOrder: LIST_COLUMN_IDS,
  columnWidths: Object.fromEntries(LIST_COLUMN_DEFINITIONS.map((column) => [column.id, column.defaultWidth])) as Record<
    ListColumnId,
    number
  >
};

const SMART_FOLDER_FIELD_OPTIONS: SmartFolderCondition['field'][] = [
  'tag',
  'tagExcluded',
  'rating',
  'favorite',
  'recentDays',
  'mediaType',
  'extension',
  'orientation',
  'width',
  'height',
  'memo',
  'sourceUrl'
];

export function App(): JSX.Element {
  const { t } = useTranslation('common');
  const boot = useRefForgeStore((state) => state.boot);
  const library = useRefForgeStore((state) => state.library);
  const loading = useRefForgeStore((state) => state.loading);
  const error = useRefForgeStore((state) => state.error);
  const dismissError = useRefForgeStore((state) => state.dismissError);
  const selectedIds = useRefForgeStore((state) => state.selectedIds);
  const trashOnly = useRefForgeStore((state) => state.trashOnly);
  const selectAllLoadedAssets = useRefForgeStore((state) => state.selectAllLoadedAssets);
  const clearSelection = useRefForgeStore((state) => state.clearSelection);
  const trashSelection = useRefForgeStore((state) => state.trashSelection);
  const openViewer = useRefForgeStore((state) => state.openViewer);
  const viewerAssetId = useRefForgeStore((state) => state.viewerAssetId);
  const [leftPanelWidth, setLeftPanelWidth] = useState(() =>
    readLayoutNumber('refForge:leftPanelWidth', 250, 190, 430)
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(() =>
    readLayoutNumber('refForge:rightPanelWidth', 340, 260, 560)
  );
  const [draggingPanel, setDraggingPanel] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    if (!library) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isEditableElement(event.target)) {
        return;
      }
      if (viewerAssetId) {
        return;
      }

      const hasCommandModifier = event.ctrlKey || event.metaKey;
      if (hasCommandModifier && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAllLoadedAssets();
        window.getSelection()?.removeAllRanges();
        return;
      }

      if (isInteractiveElement(event.target) && !isAssetTileElement(event.target)) {
        if (event.key !== 'Escape') {
          return;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        clearSelection();
        return;
      }

      if (event.key === 'Delete' && selectedIds.length > 0 && !trashOnly) {
        event.preventDefault();
        if (window.confirm(t('confirm.moveToTrashSelected', { count: selectedIds.length }))) {
          void trashSelection();
        }
        return;
      }

      if ((event.key === 'Enter' || event.key === ' ') && selectedIds.length > 0) {
        event.preventDefault();
        openViewer(selectedIds[0]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    clearSelection,
    library,
    openViewer,
    selectAllLoadedAssets,
    selectedIds,
    t,
    trashOnly,
    trashSelection,
    viewerAssetId
  ]);

  const startPanelResize = (panel: 'left' | 'right', event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startLeftWidth = leftPanelWidth;
    const startRightWidth = rightPanelWidth;
    const minCenterWidth = 420;

    setDraggingPanel(panel);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      const delta = moveEvent.clientX - startX;
      const totalWidth = window.innerWidth;
      if (panel === 'left') {
        const maxLeft = Math.min(430, Math.max(190, totalWidth - startRightWidth - minCenterWidth - 12));
        const nextWidth = clampNumber(startLeftWidth + delta, 190, maxLeft);
        window.localStorage.setItem('refForge:leftPanelWidth', String(nextWidth));
        setLeftPanelWidth(nextWidth);
        return;
      }

      const maxRight = Math.min(560, Math.max(260, totalWidth - startLeftWidth - minCenterWidth - 12));
      const nextWidth = clampNumber(startRightWidth - delta, 260, maxRight);
      window.localStorage.setItem('refForge:rightPanelWidth', String(nextWidth));
      setRightPanelWidth(nextWidth);
    };

    const stopResize = (): void => {
      setDraggingPanel(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
  };

  const resetPanelWidth = (panel: 'left' | 'right'): void => {
    if (panel === 'left') {
      window.localStorage.setItem('refForge:leftPanelWidth', '250');
      setLeftPanelWidth(250);
      return;
    }
    window.localStorage.setItem('refForge:rightPanelWidth', '340');
    setRightPanelWidth(340);
  };

  if (!library) {
    return (
      <main className={styles.shell}>
        <Welcome />
        {loading ? <div className={styles.toast}>{t('status.loading')}</div> : null}
        {error ? <Toast tone="danger" message={error} onClose={dismissError} /> : null}
      </main>
    );
  }

  return (
    <main
      className={styles.shell}
      style={{ gridTemplateColumns: `${leftPanelWidth}px 6px minmax(0, 1fr) 6px ${rightPanelWidth}px` }}
    >
      <Sidebar />
      <button
        type="button"
        className={draggingPanel === 'left' ? styles.panelSplitterDragging : styles.panelSplitter}
        title={t('layout.resizeLeft')}
        onPointerDown={(event) => startPanelResize('left', event)}
        onDoubleClick={() => resetPanelWidth('left')}
      />
      <section className={styles.workspace}>
        <Toolbar />
        <GridStatusBar />
        <AssetGrid />
      </section>
      <button
        type="button"
        className={draggingPanel === 'right' ? styles.panelSplitterDragging : styles.panelSplitter}
        title={t('layout.resizeRight')}
        onPointerDown={(event) => startPanelResize('right', event)}
        onDoubleClick={() => resetPanelWidth('right')}
      />
      <Inspector />
      <ImageViewer />
      <ImportStatus />
      <BatchResultDialog />
      <PermanentDeleteResultDialog />
      {error ? <Toast tone="danger" message={error} onClose={dismissError} /> : null}
    </main>
  );
}

function Welcome(): JSX.Element {
  const { t } = useTranslation('common');
  const createLibrary = useRefForgeStore((state) => state.createLibrary);
  const openLibrary = useRefForgeStore((state) => state.openLibrary);
  const openRecentLibrary = useRefForgeStore((state) => state.openRecentLibrary);
  const config = useRefForgeStore((state) => state.config);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault();
    setDragActive(false);
    const rootPath = collectDroppedRootPaths(event.dataTransfer)[0];
    if (rootPath) {
      void openRecentLibrary(rootPath);
    }
  };

  return (
    <section
      className={dragActive ? styles.welcomeDragging : styles.welcome}
      onDragEnter={() => setDragActive(true)}
      onDragLeave={() => setDragActive(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <div className={styles.brandMark}>
        <img src={brandIconUrl} alt="" />
      </div>
      <h1>{config?.appName ?? 'Suwol Visual Reference'}</h1>
      <div className={styles.welcomeActions}>
        <button className={styles.primaryButton} onClick={() => void createLibrary()}>
          <FolderPlus size={18} />
          {t('actions.newLibrary')}
        </button>
        <button className={styles.secondaryButton} onClick={() => void openLibrary()}>
          <FolderOpen size={18} />
          {t('actions.openLibrary')}
        </button>
      </div>
      <RecentLibrariesPanel />
    </section>
  );
}

function RecentLibrariesPanel({ showHeader = true }: { showHeader?: boolean }): JSX.Element {
  const { t, i18n: i18nInstance } = useTranslation('common');
  const openLibrary = useRefForgeStore((state) => state.openLibrary);
  const openRecentLibrary = useRefForgeStore((state) => state.openRecentLibrary);
  const removeRecentLibrary = useRefForgeStore((state) => state.removeRecentLibrary);
  const recentLibraries = useRefForgeStore((state) => state.recentLibraries);

  return (
    <section className={styles.recentLibraries}>
      {showHeader ? (
        <div className={styles.recentHeader}>
          <div>
            <h2>{t('recentLibraries.title')}</h2>
            <span>{t('recentLibraries.subtitle')}</span>
          </div>
          <button className={styles.secondaryButton} onClick={() => void openLibrary()}>
            <Plus size={16} />
            {t('recentLibraries.add')}
          </button>
        </div>
      ) : (
        <div className={styles.recentHeader}>
          <span>{t('recentLibraries.listLabel')}</span>
          <button className={styles.secondaryButton} onClick={() => void openLibrary()}>
            <Plus size={16} />
            {t('recentLibraries.add')}
          </button>
        </div>
      )}
      <div className={styles.recentList}>
        {recentLibraries.length === 0 ? (
          <div className={styles.miniEmpty}>{t('recentLibraries.empty')}</div>
        ) : null}
        {recentLibraries.map((library) => (
          <div key={library.rootPath} className={library.exists ? styles.recentItem : styles.recentItemMissing}>
            <button
              className={styles.recentOpenButton}
              disabled={!library.exists}
              onClick={() => void openRecentLibrary(library.rootPath)}
              title={library.rootPath}
            >
              <Database size={18} />
              <span>
                <strong>{library.name}</strong>
                <small>{library.rootPath}</small>
              </span>
            </button>
            <div className={styles.recentMeta}>
              <span>{t('sidebar.assetCount', { count: library.assetCount })}</span>
              <span>{formatDateTime(library.lastOpenedAt, i18nInstance.language)}</span>
              {!library.exists ? <strong>{t('recentLibraries.missing')}</strong> : null}
            </div>
            <button
              title={t('recentLibraries.remove')}
              onClick={() => void removeRecentLibrary(library.rootPath)}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentLibrariesDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation('common');
  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.managementDialog}>
        <div className={styles.modalHeader}>
          <div>
            <h2>{t('recentLibraries.title')}</h2>
            <span>{t('recentLibraries.subtitle')}</span>
          </div>
          <button type="button" title={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <RecentLibrariesPanel showHeader={false} />
      </section>
    </div>
  );
}

function Sidebar(): JSX.Element {
  const { t } = useTranslation('common');
  const library = useRefForgeStore((state) => state.library);
  const tags = useRefForgeStore((state) => state.tags);
  const collections = useRefForgeStore((state) => state.collections);
  const smartFolders = useRefForgeStore((state) => state.smartFolders);
  const tagId = useRefForgeStore((state) => state.tagId);
  const collectionId = useRefForgeStore((state) => state.collectionId);
  const smartFolderId = useRefForgeStore((state) => state.smartFolderId);
  const favoriteOnly = useRefForgeStore((state) => state.favoriteOnly);
  const trashOnly = useRefForgeStore((state) => state.trashOnly);
  const duplicateOnly = useRefForgeStore((state) => state.duplicateOnly);
  const clearFilters = useRefForgeStore((state) => state.clearFilters);
  const setTagFilter = useRefForgeStore((state) => state.setTagFilter);
  const setCollectionFilter = useRefForgeStore((state) => state.setCollectionFilter);
  const setSmartFolderFilter = useRefForgeStore((state) => state.setSmartFolderFilter);
  const setFavoriteOnly = useRefForgeStore((state) => state.setFavoriteOnly);
  const setTrashOnly = useRefForgeStore((state) => state.setTrashOnly);
  const setDuplicateOnly = useRefForgeStore((state) => state.setDuplicateOnly);
  const createCollection = useRefForgeStore((state) => state.createCollection);
  const createSmartFolder = useRefForgeStore((state) => state.createSmartFolder);
  const deleteSmartFolder = useRefForgeStore((state) => state.deleteSmartFolder);
  const addSelectionToCollection = useRefForgeStore((state) => state.addSelectionToCollection);
  const selectedIds = useRefForgeStore((state) => state.selectedIds);
  const [collectionName, setCollectionName] = useState('');
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [collectionManagerOpen, setCollectionManagerOpen] = useState(false);
  const [smartFolderManagerOpen, setSmartFolderManagerOpen] = useState(false);
  const [hideUnusedTags, setHideUnusedTags] = useState(() => window.localStorage.getItem('refForge:hideUnusedTags') === 'true');
  const [smartForm, setSmartForm] = useState({
    name: '',
    field: 'rating' as SmartFolderCondition['field'],
    operator: '>=' as SmartFolderCondition['operator'],
    value: '4'
  });
  const libraryActive = !tagId && !collectionId && !smartFolderId && !favoriteOnly && !trashOnly && !duplicateOnly;
  const visibleTags = hideUnusedTags ? tags.filter((tag) => (tag.assetCount ?? 0) > 0) : tags;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.libraryBlock}>
        <Database size={18} />
        <div>
          <strong>{library?.name}</strong>
          <span>{t('sidebar.assetCount', { count: library?.assetCount ?? 0 })}</span>
        </div>
      </div>

      <nav className={styles.sideSection}>
        <button
          className={libraryActive ? styles.sideItemActive : styles.sideItem}
          onClick={clearFilters}
        >
          <Grid2X2 size={16} />
          {t('sidebar.library')}
        </button>
        <button
          className={favoriteOnly ? styles.sideItemActive : styles.sideItem}
          onClick={() => setFavoriteOnly(!favoriteOnly)}
        >
          <Heart size={16} />
          {t('sidebar.favorites')}
        </button>
        <button
          className={duplicateOnly ? styles.sideItemActive : styles.sideItem}
          onClick={() => void setDuplicateOnly(!duplicateOnly)}
        >
          <Copy size={16} />
          {t('sidebar.duplicates')}
        </button>
        <button className={trashOnly ? styles.sideItemActive : styles.sideItem} onClick={() => setTrashOnly(!trashOnly)}>
          <Archive size={16} />
          {t('sidebar.trash')}
        </button>
      </nav>

      <div className={styles.sideHeader}>
        <span>{t('sidebar.smartFolders')}</span>
        <div className={styles.sideHeaderActions}>
          <button title={t('smartFolder.managerOpen')} onClick={() => setSmartFolderManagerOpen(true)}>
            <Settings size={14} />
          </button>
          <button
            title={t('sidebar.createSmartFolder')}
            onClick={() => {
              if (!smartForm.name.trim()) {
                return;
              }
              void createSmartFolder(smartForm.name.trim(), {
                mode: 'all',
                conditions: [
                  {
                    field: smartForm.field,
                    operator: getSmartOperator(smartForm.field),
                    value: normalizeSmartValue(smartForm.field, smartForm.value)
                  }
                ]
              });
              setSmartForm((current) => ({ ...current, name: '' }));
            }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <form
        className={styles.smartFolderForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (!smartForm.name.trim()) {
            return;
          }
          void createSmartFolder(smartForm.name.trim(), {
            mode: 'all',
            conditions: [
              {
                field: smartForm.field,
                operator: getSmartOperator(smartForm.field),
                value: normalizeSmartValue(smartForm.field, smartForm.value)
              }
            ]
          });
          setSmartForm((current) => ({ ...current, name: '' }));
        }}
      >
        <input
          value={smartForm.name}
          onChange={(event) => setSmartForm((current) => ({ ...current, name: event.target.value }))}
          placeholder={t('sidebar.smartFolderName')}
        />
        <select
          value={smartForm.field}
          onChange={(event) =>
            setSmartForm((current) => ({
              ...current,
              field: event.target.value as SmartFolderCondition['field'],
              value: defaultSmartValue(event.target.value as SmartFolderCondition['field'])
            }))
          }
        >
          <option value="rating">{t('smartFolder.fields.rating')}</option>
          <option value="favorite">{t('smartFolder.fields.favorite')}</option>
          <option value="tag">{t('smartFolder.fields.tag')}</option>
          <option value="tagExcluded">{t('smartFolder.fields.tagExcluded')}</option>
          <option value="extension">{t('smartFolder.fields.extension')}</option>
          <option value="mediaType">{t('smartFolder.fields.mediaType')}</option>
          <option value="orientation">{t('smartFolder.fields.orientation')}</option>
          <option value="width">{t('smartFolder.fields.width')}</option>
          <option value="height">{t('smartFolder.fields.height')}</option>
          <option value="recentDays">{t('smartFolder.fields.recentDays')}</option>
          <option value="memo">{t('smartFolder.fields.memo')}</option>
          <option value="sourceUrl">{t('smartFolder.fields.sourceUrl')}</option>
        </select>
        <input
          value={smartForm.value}
          onChange={(event) => setSmartForm((current) => ({ ...current, value: event.target.value }))}
          placeholder={t('smartFolder.valuePlaceholder')}
        />
      </form>
      <div className={styles.sideScroll}>
        {smartFolders.length === 0 ? <div className={styles.miniEmpty}>{t('sidebar.noSmartFolders')}</div> : null}
        {smartFolders.map((folder) => (
          <div key={folder.id} className={styles.collectionRow}>
            <button
              className={smartFolderId === folder.id ? styles.sideItemActive : styles.sideItem}
              onClick={() => setSmartFolderFilter(smartFolderId === folder.id ? null : folder.id)}
            >
              <Filter size={16} />
              {folder.name}
              <small>{formatSmartFolderQuery(folder.query, t)}</small>
            </button>
            <button
              title={t('sidebar.deleteSmartFolder')}
              onClick={() => {
                if (window.confirm(t('smartFolder.confirmDelete', { name: folder.name }))) {
                  void deleteSmartFolder(folder.id);
                }
              }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className={styles.sideHeader}>
        <span>{t('sidebar.tags')}</span>
        <div className={styles.sideHeaderActions}>
          <button
            title={hideUnusedTags ? t('tagManager.showUnusedTags') : t('tagManager.hideUnusedTags')}
            onClick={() => {
              const next = !hideUnusedTags;
              window.localStorage.setItem('refForge:hideUnusedTags', next ? 'true' : 'false');
              setHideUnusedTags(next);
            }}
          >
            {hideUnusedTags ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button title={t('tagManager.open')} onClick={() => setTagManagerOpen(true)}>
            <Tags size={14} />
          </button>
        </div>
      </div>
      <div className={styles.sideScroll}>
        {visibleTags.map((tag) => (
          <button
            key={tag.id}
            className={tagId === tag.id ? styles.sideItemActive : styles.sideItem}
            onClick={() => setTagFilter(tagId === tag.id ? null : tag.id)}
            title={tag.name}
          >
            <span className={styles.tagDot} style={{ background: tag.color }} />
            <span className={styles.sideLabel}>{tag.name}</span>
            <small>{tag.assetCount ?? 0}</small>
          </button>
        ))}
        {visibleTags.length === 0 ? <div className={styles.miniEmpty}>{t('tagManager.noTags')}</div> : null}
      </div>

      <div className={styles.sideHeader}>
        <span>{t('sidebar.collections')}</span>
        <div className={styles.sideHeaderActions}>
          <button title={t('collectionManager.open')} onClick={() => setCollectionManagerOpen(true)}>
            <Layers size={14} />
          </button>
          <button
            title={t('sidebar.createCollection')}
            onClick={() => {
              if (collectionName.trim()) {
                void createCollection(collectionName.trim());
                setCollectionName('');
              }
            }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <form
        className={styles.sidebarForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (collectionName.trim()) {
            void createCollection(collectionName.trim());
            setCollectionName('');
          }
        }}
      >
        <input
          value={collectionName}
          onChange={(event) => setCollectionName(event.target.value)}
          placeholder={t('sidebar.newCollection')}
        />
      </form>
      <div className={styles.sideScroll}>
        {collections.length === 0 ? <div className={styles.miniEmpty}>{t('sidebar.noCollections')}</div> : null}
        {collections.map((collection) => (
          <div key={collection.id} className={styles.collectionRow}>
            <button
              className={collectionId === collection.id ? styles.sideItemActive : styles.sideItem}
              onClick={() => setCollectionFilter(collectionId === collection.id ? null : collection.id)}
              title={t('sidebar.showCollection')}
            >
              <span className={styles.tagDot} style={{ background: collection.color }} />
              {collection.name}
              <small>{collection.assetCount ?? 0}</small>
            </button>
            <button
              title={t('sidebar.addSelectedAssets')}
              disabled={selectedIds.length === 0}
              onClick={() => void addSelectionToCollection(collection.id)}
            >
              <Plus size={13} />
            </button>
          </div>
        ))}
      </div>
      {tagManagerOpen ? <TagManagerDialog onClose={() => setTagManagerOpen(false)} /> : null}
      {collectionManagerOpen ? <CollectionManagerDialog onClose={() => setCollectionManagerOpen(false)} /> : null}
      {smartFolderManagerOpen ? <SmartFolderManagerDialog onClose={() => setSmartFolderManagerOpen(false)} /> : null}
    </aside>
  );
}

function Toolbar(): JSX.Element {
  const { t } = useTranslation('common');
  const search = useRefForgeStore((state) => state.search);
  const setSearch = useRefForgeStore((state) => state.setSearch);
  const selectFilesAndImport = useRefForgeStore((state) => state.selectFilesAndImport);
  const selectFolderAndImport = useRefForgeStore((state) => state.selectFolderAndImport);
  const trashSelection = useRefForgeStore((state) => state.trashSelection);
  const restoreSelection = useRefForgeStore((state) => state.restoreSelection);
  const permanentlyDeleteSelection = useRefForgeStore((state) => state.permanentlyDeleteSelection);
  const importing = useRefForgeStore((state) => state.importing);
  const selectedIds = useRefForgeStore((state) => state.selectedIds);
  const trashOnly = useRefForgeStore((state) => state.trashOnly);
  const gridThumbnailSize = useRefForgeStore((state) => state.gridThumbnailSize);
  const showFileNames = useRefForgeStore((state) => state.showFileNames);
  const viewMode = useRefForgeStore((state) => state.viewMode);
  const assetSort = useRefForgeStore((state) => state.assetSort);
  const setGridThumbnailSize = useRefForgeStore((state) => state.setGridThumbnailSize);
  const setShowFileNames = useRefForgeStore((state) => state.setShowFileNames);
  const setAssetViewMode = useRefForgeStore((state) => state.setAssetViewMode);
  const setAssetSort = useRefForgeStore((state) => state.setAssetSort);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const [searchDraft, setSearchDraft] = useState(search);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [filterPopover, setFilterPopover] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchDraft !== search) {
        setSearch(searchDraft);
      }
    }, 260);
    return () => window.clearTimeout(timer);
  }, [search, searchDraft, setSearch]);

  return (
    <header className={styles.toolbar}>
      <div className={styles.searchBox}>
        <Search size={17} />
        <input
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder={t('toolbar.searchPlaceholder')}
        />
      </div>
      <div className={styles.gridControls}>
        <span>{t('toolbar.selectedCount', { count: selectedIds.length })}</span>
        <select
          className={styles.sortSelect}
          title={t('sort.title')}
          value={serializeAssetSort(assetSort)}
          onChange={(event) => setAssetSort(parseAssetSort(event.target.value))}
        >
          {ASSET_SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {t(`sort.options.${option.id}`)}
            </option>
          ))}
        </select>
        <input
          title={t('toolbar.thumbnailSize')}
          type="range"
          min="112"
          max="260"
          step="8"
          value={gridThumbnailSize}
          onChange={(event) => setGridThumbnailSize(Number(event.target.value))}
        />
        <button title={showFileNames ? t('toolbar.hideFileNames') : t('toolbar.showFileNames')} onClick={() => setShowFileNames(!showFileNames)}>
          {showFileNames ? <Eye size={17} /> : <EyeOff size={17} />}
        </button>
      </div>
      <div className={styles.toolGroup}>
        <button
          ref={filterButtonRef}
          title={t('toolbar.filter')}
          onClick={() => {
            if (filterPopover) {
              setFilterPopover(null);
              return;
            }
            const rect = filterButtonRef.current?.getBoundingClientRect();
            if (rect) {
              setFilterPopover(getPopoverPosition(rect, 340, 260));
            }
          }}
        >
          <Filter size={17} />
        </button>
        <button
          title={viewMode === 'grid' ? t('toolbar.listView') : t('toolbar.gridView')}
          onClick={() => setAssetViewMode(viewMode === 'grid' ? 'list' : 'grid')}
        >
          {viewMode === 'grid' ? <List size={17} /> : <Grid2X2 size={17} />}
        </button>
        <button title={t('toolbar.openLibrary')} onClick={() => setRecentOpen(true)}>
          <FolderOpen size={17} />
        </button>
        <button title={t('toolbar.importFiles')} onClick={() => void selectFilesAndImport()} disabled={importing}>
          <Upload size={17} />
        </button>
        <button title={t('toolbar.importFolder')} onClick={() => void selectFolderAndImport()} disabled={importing}>
          <FolderInput size={17} />
        </button>
        {trashOnly ? (
          <>
            <button title={t('toolbar.restoreSelected')} onClick={() => void restoreSelection()} disabled={selectedIds.length === 0}>
              <RotateCcw size={17} />
            </button>
            <button
              title={t('toolbar.permanentlyDeleteSelected')}
              onClick={() => {
                if (window.confirm(t('confirm.permanentDeleteSelectedStrong', { count: selectedIds.length }))) {
                  void permanentlyDeleteSelection();
                }
              }}
              disabled={selectedIds.length === 0}
            >
              <Trash2 size={17} />
            </button>
          </>
        ) : (
          <button
            title={selectedIds.length === 0 ? t('toolbar.selectAssetsFirst') : t('toolbar.moveSelectedToTrash')}
            onClick={() => {
              if (window.confirm(t('confirm.moveToTrashSelected', { count: selectedIds.length }))) {
                void trashSelection();
              }
            }}
            disabled={selectedIds.length === 0}
          >
            <Trash2 size={17} />
          </button>
        )}
        <button
          title={t('toolbar.exportSelected')}
          onClick={() => setExportOpen(true)}
          disabled={selectedIds.length === 0}
        >
          <FileOutput size={17} />
        </button>
        <button title={t('toolbar.settings')} onClick={() => setSettingsOpen(true)}>
          <Settings size={17} />
        </button>
      </div>
      {exportOpen ? <ExportDialog onClose={() => setExportOpen(false)} /> : null}
      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
      {recentOpen ? <RecentLibrariesDialog onClose={() => setRecentOpen(false)} /> : null}
      {filterPopover ? <FilterPopover position={filterPopover} onClose={() => setFilterPopover(null)} /> : null}
    </header>
  );
}

function GridStatusBar(): JSX.Element {
  const { t } = useTranslation('common');
  const library = useRefForgeStore((state) => state.library);
  const assets = useRefForgeStore((state) => state.assets);
  const assetTotalCount = useRefForgeStore((state) => state.assetTotalCount);
  const selectedIds = useRefForgeStore((state) => state.selectedIds);
  const search = useRefForgeStore((state) => state.search);
  const tagId = useRefForgeStore((state) => state.tagId);
  const collectionId = useRefForgeStore((state) => state.collectionId);
  const smartFolderId = useRefForgeStore((state) => state.smartFolderId);
  const favoriteOnly = useRefForgeStore((state) => state.favoriteOnly);
  const trashOnly = useRefForgeStore((state) => state.trashOnly);
  const duplicateOnly = useRefForgeStore((state) => state.duplicateOnly);
  const assetSort = useRefForgeStore((state) => state.assetSort);
  const assetFilters = useRefForgeStore((state) => state.assetFilters);
  const viewName = getViewName(
    {
      duplicateOnly,
      trashOnly,
      favoriteOnly,
      tagId,
      collectionId,
      smartFolderId
    },
    t
  );

  return (
    <div className={styles.gridStatusBar}>
      <strong>{viewName}</strong>
      <span>
        {t('assetGrid.statusLine', {
          total: library?.assetCount ?? 0,
          filtered: assetTotalCount,
          loaded: assets.length,
          selected: selectedIds.length
        })}
      </span>
      {search.trim() ? <span>{t('assetGrid.searchApplied', { search })}</span> : null}
      <span>{t('sort.current', { sort: t(`sort.options.${serializeAssetSort(assetSort)}`) })}</span>
      <span>{t('filter.activeSummary', { count: countAssetFilters(assetFilters) })}</span>
    </div>
  );
}

function FilterPopover({
  position,
  onClose
}: {
  position: { top: number; left: number };
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation('common');
  const popoverRef = useRef<HTMLElement | null>(null);
  const search = useRefForgeStore((state) => state.search);
  const tagId = useRefForgeStore((state) => state.tagId);
  const collectionId = useRefForgeStore((state) => state.collectionId);
  const smartFolderId = useRefForgeStore((state) => state.smartFolderId);
  const favoriteOnly = useRefForgeStore((state) => state.favoriteOnly);
  const trashOnly = useRefForgeStore((state) => state.trashOnly);
  const duplicateOnly = useRefForgeStore((state) => state.duplicateOnly);
  const assetFilters = useRefForgeStore((state) => state.assetFilters);
  const tags = useRefForgeStore((state) => state.tags);
  const applyAssetFilterDraft = useRefForgeStore((state) => state.applyAssetFilterDraft);
  const clearFilters = useRefForgeStore((state) => state.clearFilters);
  const [viewMode, setViewMode] = useState<'library' | 'favorites' | 'trash' | 'duplicates'>(() => {
    if (trashOnly) {
      return 'trash';
    }
    if (duplicateOnly) {
      return 'duplicates';
    }
    if (favoriteOnly) {
      return 'favorites';
    }
    return 'library';
  });
  const [filterDraft, setFilterDraft] = useState<AssetFilters>(assetFilters);
  const [extensionDraft, setExtensionDraft] = useState((assetFilters.extensions ?? []).join(', '));
  const includeTagId = filterDraft.includeTagIds?.[0] ?? '';
  const excludeTagId = filterDraft.excludeTagIds?.[0] ?? '';
  const activeCount = [
    search.trim(),
    tagId,
    collectionId,
    smartFolderId,
    favoriteOnly,
    trashOnly,
    duplicateOnly
  ].filter(Boolean).length;
  const filterCount = activeCount + countAssetFilters(assetFilters);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [onClose]);

  return (
    <section ref={popoverRef} className={styles.filterPopover} style={{ top: position.top, left: position.left }}>
      <div className={styles.modalHeader}>
        <div>
          <h2>{t('filter.title')}</h2>
          <span>{t('filter.activeSummary', { count: filterCount })}</span>
        </div>
        <button type="button" title={t('actions.close')} onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className={styles.filterOptions}>
        {(['library', 'favorites', 'trash', 'duplicates'] as const).map((mode) => (
          <label key={mode} className={styles.checkControl}>
            <input type="radio" checked={viewMode === mode} onChange={() => setViewMode(mode)} />
            {t(`filter.viewModes.${mode}`)}
          </label>
        ))}
        <label>
          {t('filter.extensions')}
          <input
            value={extensionDraft}
            onChange={(event) => setExtensionDraft(event.target.value)}
            placeholder={t('filter.extensionsPlaceholder')}
          />
        </label>
        <label>
          {t('filter.minRating')}
          <select
            value={filterDraft.minRating ?? ''}
            onChange={(event) =>
              setFilterDraft((current) => ({
                ...current,
                minRating: event.target.value ? Number(event.target.value) : null
              }))
            }
          >
            <option value="">{t('filter.any')}</option>
            {[1, 2, 3, 4, 5].map((rating) => (
              <option key={rating} value={rating}>
                {t('filter.ratingAtLeast', { rating })}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('filter.includeTag')}
          <select
            value={includeTagId}
            onChange={(event) =>
              setFilterDraft((current) => ({ ...current, includeTagIds: event.target.value ? [event.target.value] : [] }))
            }
          >
            <option value="">{t('filter.any')}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('filter.excludeTag')}
          <select
            value={excludeTagId}
            onChange={(event) =>
              setFilterDraft((current) => ({ ...current, excludeTagIds: event.target.value ? [event.target.value] : [] }))
            }
          >
            <option value="">{t('filter.none')}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('filter.aspect')}
          <select
            value={filterDraft.aspect ?? ''}
            onChange={(event) =>
              setFilterDraft((current) => ({
                ...current,
                aspect: event.target.value ? (event.target.value as AssetFilters['aspect']) : null
              }))
            }
          >
            <option value="">{t('filter.any')}</option>
            <option value="landscape">{t('smartFolder.values.landscape')}</option>
            <option value="portrait">{t('smartFolder.values.portrait')}</option>
            <option value="square">{t('smartFolder.values.square')}</option>
          </select>
        </label>
        <div className={styles.filterNumberGrid}>
          <label>
            {t('filter.minWidth')}
            <input
              type="number"
              min="0"
              value={filterDraft.minWidth ?? ''}
              onChange={(event) =>
                setFilterDraft((current) => ({
                  ...current,
                  minWidth: event.target.value ? Number(event.target.value) : null
                }))
              }
            />
          </label>
          <label>
            {t('filter.minHeight')}
            <input
              type="number"
              min="0"
              value={filterDraft.minHeight ?? ''}
              onChange={(event) =>
                setFilterDraft((current) => ({
                  ...current,
                  minHeight: event.target.value ? Number(event.target.value) : null
                }))
              }
            />
          </label>
        </div>
        <label>
          {t('filter.recentDays')}
          <input
            type="number"
            min="1"
            value={filterDraft.recentDays ?? ''}
            onChange={(event) =>
              setFilterDraft((current) => ({
                ...current,
                recentDays: event.target.value ? Number(event.target.value) : null
              }))
            }
          />
        </label>
        <label className={styles.checkControl}>
          <input
            type="checkbox"
            checked={Boolean(filterDraft.favoriteOnly)}
            onChange={(event) => setFilterDraft((current) => ({ ...current, favoriteOnly: event.target.checked }))}
          />
          {t('filter.favoritesOnly')}
        </label>
        <label className={styles.checkControl}>
          <input
            type="checkbox"
            checked={Boolean(filterDraft.hasMemo)}
            onChange={(event) => setFilterDraft((current) => ({ ...current, hasMemo: event.target.checked }))}
          />
          {t('filter.hasMemo')}
        </label>
        <label className={styles.checkControl}>
          <input
            type="checkbox"
            checked={Boolean(filterDraft.hasSourceUrl)}
            onChange={(event) => setFilterDraft((current) => ({ ...current, hasSourceUrl: event.target.checked }))}
          />
          {t('filter.hasSourceUrl')}
        </label>
      </div>

      <div className={styles.filterActions}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            clearFilters();
            setFilterDraft(EMPTY_FILTERS);
            setExtensionDraft('');
            onClose();
          }}
        >
          <RotateCcw size={15} />
          {t('filter.clear')}
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            void applyAssetFilterDraft(viewMode, normalizeAssetFilters({ ...filterDraft, extensions: parseCsv(extensionDraft) }));
            onClose();
          }}
        >
          <Check size={15} />
          {t('filter.apply')}
        </button>
      </div>
    </section>
  );
}

function AssetGrid(): JSX.Element {
  const { t } = useTranslation('common');
  const assets = useRefForgeStore((state) => state.assets);
  const assetHasMore = useRefForgeStore((state) => state.assetHasMore);
  const selectedIds = useRefForgeStore((state) => state.selectedIds);
  const selectAsset = useRefForgeStore((state) => state.selectAsset);
  const selectAssets = useRefForgeStore((state) => state.selectAssets);
  const loadMoreAssets = useRefForgeStore((state) => state.loadMoreAssets);
  const reorderCollectionAssets = useRefForgeStore((state) => state.reorderCollectionAssets);
  const importPaths = useRefForgeStore((state) => state.importPaths);
  const importing = useRefForgeStore((state) => state.importing);
  const loading = useRefForgeStore((state) => state.loading);
  const duplicateGroups = useRefForgeStore((state) => state.duplicateGroups);
  const search = useRefForgeStore((state) => state.search);
  const tagId = useRefForgeStore((state) => state.tagId);
  const collectionId = useRefForgeStore((state) => state.collectionId);
  const smartFolderId = useRefForgeStore((state) => state.smartFolderId);
  const favoriteOnly = useRefForgeStore((state) => state.favoriteOnly);
  const trashOnly = useRefForgeStore((state) => state.trashOnly);
  const duplicateOnly = useRefForgeStore((state) => state.duplicateOnly);
  const viewMode = useRefForgeStore((state) => state.viewMode);
  const assetSort = useRefForgeStore((state) => state.assetSort);
  const assetFilters = useRefForgeStore((state) => state.assetFilters);
  const gridThumbnailSize = useRefForgeStore((state) => state.gridThumbnailSize);
  const showFileNames = useRefForgeStore((state) => state.showFileNames);
  const gridSurfaceRef = useRef<HTMLElement | null>(null);
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  const [dragActive, setDragActive] = useState(false);
  const [dragSelection, setDragSelection] = useState<DragSelectionState | null>(null);
  const hasActiveFilter = Boolean(
    search.trim() ||
      tagId ||
      collectionId ||
      smartFolderId ||
      favoriteOnly ||
      trashOnly ||
      duplicateOnly ||
      countAssetFilters(assetFilters) > 0
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    if (gridSurfaceRef.current) {
      gridSurfaceRef.current.scrollTop = 0;
    }
  }, [assetFilters, assetSort, collectionId, duplicateOnly, favoriteOnly, search, smartFolderId, tagId, trashOnly, viewMode]);

  const handleScroll = (event: UIEvent<HTMLElement>): void => {
    const target = event.currentTarget;
    if (!assetHasMore || loading || importing) {
      return;
    }
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 900) {
      void loadMoreAssets();
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault();
    setDragActive(false);
    void collectDroppedPaths(event.dataTransfer).then((filePaths) => importPaths(filePaths));
  };

  const setTileRef = (assetId: string, element: HTMLButtonElement | null): void => {
    if (element) {
      tileRefs.current.set(assetId, element);
      return;
    }
    tileRefs.current.delete(assetId);
  };

  const handleSelectionPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || isInteractiveElement(event.target)) {
      return;
    }

    event.preventDefault();
    window.getSelection()?.removeAllRanges();

    const initialSelectedIds = selectedIds;
    const initialDrag: DragSelectionState = {
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      initialSelectedIds,
      additive: event.ctrlKey || event.metaKey
    };
    setDragSelection(initialDrag);
    if (!initialDrag.additive) {
      selectAssets([], null);
    }
    document.body.style.userSelect = 'none';

    const updateSelectionFromPointer = (pointerEvent: PointerEvent): void => {
      pointerEvent.preventDefault();
      window.getSelection()?.removeAllRanges();
      const nextDrag = {
        ...initialDrag,
        currentX: pointerEvent.clientX,
        currentY: pointerEvent.clientY
      };
      setDragSelection(nextDrag);
      const selectionRect = getClientSelectionRect(nextDrag);
      const hitIds = assets
        .filter((asset) => {
          const element = tileRefs.current.get(asset.id);
          return element ? rectsIntersect(selectionRect, element.getBoundingClientRect()) : false;
        })
        .map((asset) => asset.id);
      const nextSelectedIds = getDragSelectedIds({
        orderedAssetIds: assets.map((asset) => asset.id),
        initialSelectedIds,
        hitAssetIds: hitIds,
        additive: nextDrag.additive
      });
      selectAssets(nextSelectedIds, nextSelectedIds[0] ?? null, { preserveAnchor: nextDrag.additive });
    };

    const stopSelectionDrag = (): void => {
      document.body.style.userSelect = '';
      setDragSelection(null);
      window.removeEventListener('pointermove', updateSelectionFromPointer);
      window.removeEventListener('pointerup', stopSelectionDrag);
    };

    window.addEventListener('pointermove', updateSelectionFromPointer);
    window.addEventListener('pointerup', stopSelectionDrag);
  };

  return (
    <section
      ref={gridSurfaceRef}
      className={dragActive ? styles.gridSurfaceDragging : styles.gridSurface}
      onDragEnter={() => setDragActive(true)}
      onDragLeave={() => setDragActive(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onPointerDown={viewMode === 'grid' ? handleSelectionPointerDown : undefined}
      onScroll={handleScroll}
    >
      {duplicateOnly ? <DuplicateResolutionCenter groups={duplicateGroups} /> : null}
      {assets.length === 0 ? (
        <div className={styles.emptyState}>
          <Upload size={32} />
          <h2>{hasActiveFilter ? t('assetGrid.emptyFilteredTitle') : t('assetGrid.emptyTitle')}</h2>
          <p>
            {hasActiveFilter
              ? t('assetGrid.emptyFilteredDescription')
              : t('assetGrid.emptyDescription')}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <AssetList
          assets={assets}
          selectedSet={selectedSet}
          onSelect={selectAsset}
          canReorder={Boolean(collectionId && assetSort.field === 'collectionOrder' && assetSort.direction === 'asc')}
          hasMore={assetHasMore}
          onReorder={(orderedAssetIds) => {
            if (collectionId) {
              void reorderCollectionAssets(collectionId, orderedAssetIds);
            }
          }}
        />
      ) : (
        <div
          className={styles.assetGrid}
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridThumbnailSize}px, 1fr))` }}
        >
          {assets.map((asset) => {
            const selected = selectedSet.has(asset.id);
            return (
              <AssetTile
                key={asset.id}
                asset={asset}
                selected={selected}
                gridThumbnailSize={gridThumbnailSize}
                showFileNames={showFileNames}
                onSelect={selectAsset}
                setTileRef={setTileRef}
              />
            );
          })}
        </div>
      )}
      {assetHasMore && assets.length > 0 ? (
        <button className={styles.loadMoreButton} onClick={() => void loadMoreAssets()} disabled={loading}>
          {loading ? t('assetGrid.loading') : t('assetGrid.loadMore')}
        </button>
      ) : null}
      {dragSelection ? (
        <div
          className={styles.dragSelectionBox}
          style={getDragSelectionStyle(getClientSelectionRect(dragSelection))}
        />
      ) : null}
      {dragActive ? <div className={styles.dropOverlay}>{t('assetGrid.dropOverlay')}</div> : null}
      {importing || loading ? <div className={styles.busyStrip}>{importing ? t('assetGrid.importing') : t('assetGrid.loading')}</div> : null}
    </section>
  );
}

function AssetList({
  assets,
  selectedSet,
  onSelect,
  canReorder = false,
  hasMore,
  onReorder
}: {
  assets: AssetRecord[];
  selectedSet: Set<string>;
  onSelect: (assetId: string, mode?: 'replace' | 'toggle' | 'range') => void;
  canReorder?: boolean;
  hasMore: boolean;
  onReorder: (orderedAssetIds: string[]) => void;
}): JSX.Element {
  const { t, i18n: i18nInstance } = useTranslation('common');
  const assetSort = useRefForgeStore((state) => state.assetSort);
  const setAssetSort = useRefForgeStore((state) => state.setAssetSort);
  const [settings, setSettings] = useState(readListColumnSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
  const visibleColumns = useMemo(
    () =>
      settings.columnOrder
        .map((columnId) => getListColumnDefinition(columnId))
        .filter((column): column is ListColumnDefinition => Boolean(column && settings.columns[column.id])),
    [settings]
  );
  const gridTemplateColumns = `${canReorder ? '116px ' : ''}${visibleColumns
    .map((column) => `${settings.columnWidths[column.id] ?? column.defaultWidth}px`)
    .join(' ')}`;

  const updateSettings = (updater: (current: ListColumnSettings) => ListColumnSettings): void => {
    setSettings((current) => {
      const next = normalizeListColumnSettings(updater(current));
      writeListColumnSettings(next);
      return next;
    });
  };

  const moveAssetInList = (assetId: string, targetIndex: number): void => {
    const currentIds = assets.map((asset) => asset.id);
    const fromIndex = currentIds.indexOf(assetId);
    if (fromIndex < 0) {
      return;
    }
    const nextIds = moveArrayItem(currentIds, fromIndex, clampNumber(targetIndex, 0, currentIds.length - 1));
    onReorder(nextIds);
  };

  const resizeColumn = (column: ListColumnDefinition, event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = settings.columnWidths[column.id] ?? column.defaultWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      const width = clampNumber(startWidth + moveEvent.clientX - startX, column.minWidth, column.maxWidth);
      updateSettings((current) => ({
        ...current,
        columnWidths: {
          ...current.columnWidths,
          [column.id]: width
        }
      }));
    };
    const stopResize = (): void => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
  };

  return (
    <div className={styles.assetList}>
      <div className={styles.assetListToolbar}>
        <button type="button" className={styles.secondaryButton} onClick={() => setSettingsOpen(true)}>
          <Columns3 size={15} />
          {t('list.settings.open')}
        </button>
        {canReorder ? <span>{hasMore ? t('collectionOrder.partialPageHint') : t('collectionOrder.dragHint')}</span> : null}
      </div>
      <div className={styles.assetListHeader} style={{ gridTemplateColumns }}>
        {canReorder ? <span className={styles.assetListHeaderCell}>{t('list.columns.order')}</span> : null}
        {visibleColumns.map((column) => (
          <span key={column.id} className={styles.assetListHeaderCell}>
            {column.sortField ? (
              <button onClick={() => setAssetSort(toggleSort(assetSort, column.sortField ?? 'importedAt'))}>{t(column.labelKey)}</button>
            ) : (
              t(column.labelKey)
            )}
            <button
              type="button"
              className={styles.columnResizeHandle}
              title={t('list.settings.resizeColumn')}
              onPointerDown={(event) => resizeColumn(column, event)}
            />
          </span>
        ))}
      </div>
      {assets.map((asset) => (
        <AssetListRow
          key={asset.id}
          asset={asset}
          selected={selectedSet.has(asset.id)}
          language={i18nInstance.language}
          columns={visibleColumns}
          gridTemplateColumns={gridTemplateColumns}
          canReorder={canReorder}
          assetIndex={assets.findIndex((candidate) => candidate.id === asset.id)}
          assetCount={assets.length}
          draggedAssetId={draggedAssetId}
          setDraggedAssetId={setDraggedAssetId}
          onMoveAsset={moveAssetInList}
          onSelect={onSelect}
        />
      ))}
      {settingsOpen ? (
        <ListColumnSettingsDialog
          settings={settings}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}

function AssetListRow({
  asset,
  selected,
  language,
  columns,
  gridTemplateColumns,
  canReorder,
  assetIndex,
  assetCount,
  draggedAssetId,
  setDraggedAssetId,
  onMoveAsset,
  onSelect
}: {
  asset: AssetRecord;
  selected: boolean;
  language: string;
  columns: ListColumnDefinition[];
  gridTemplateColumns: string;
  canReorder: boolean;
  assetIndex: number;
  assetCount: number;
  draggedAssetId: string | null;
  setDraggedAssetId: (assetId: string | null) => void;
  onMoveAsset: (assetId: string, targetIndex: number) => void;
  onSelect: (assetId: string, mode?: 'replace' | 'toggle' | 'range') => void;
}): JSX.Element {
  const { t } = useTranslation('common');
  const openViewer = useRefForgeStore((state) => state.openViewer);
  const modeFromEvent = (event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): 'replace' | 'toggle' | 'range' =>
    event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'replace';

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        styles.assetListRow,
        selected ? styles.assetListRowSelected : '',
        asset.isFavorite ? styles.assetListRowFavorite : '',
        asset.isDeleted ? styles.assetListRowDeleted : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ gridTemplateColumns }}
      onClick={(event) => onSelect(asset.id, modeFromEvent(event))}
      onDoubleClick={() => openViewer(asset.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onSelect(asset.id, 'replace');
          openViewer(asset.id);
        }
      }}
      onDragOver={(event) => {
        if (canReorder && draggedAssetId && draggedAssetId !== asset.id) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (canReorder && draggedAssetId && draggedAssetId !== asset.id) {
          event.preventDefault();
          onMoveAsset(draggedAssetId, assetIndex);
          setDraggedAssetId(null);
        }
      }}
      title={asset.originalRelativePath ?? asset.originalFileName}
      data-asset-tile="true"
    >
      {canReorder ? (
        <span className={styles.listReorderCell} onClick={(event) => event.stopPropagation()}>
          <span
            className={styles.dragHandle}
            draggable
            title={t('collectionOrder.dragHandle')}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', asset.id);
              setDraggedAssetId(asset.id);
            }}
            onDragEnd={() => setDraggedAssetId(null)}
          >
            <GripVertical size={15} />
          </span>
          <button type="button" title={t('collectionOrder.moveTop')} disabled={assetIndex === 0} onClick={() => onMoveAsset(asset.id, 0)}>
            <ChevronsUp size={13} />
          </button>
          <button
            type="button"
            title={t('collectionOrder.moveUp')}
            disabled={assetIndex === 0}
            onClick={() => onMoveAsset(asset.id, assetIndex - 1)}
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            title={t('collectionOrder.moveDown')}
            disabled={assetIndex >= assetCount - 1}
            onClick={() => onMoveAsset(asset.id, assetIndex + 1)}
          >
            <ArrowDown size={13} />
          </button>
          <button
            type="button"
            title={t('collectionOrder.moveBottom')}
            disabled={assetIndex >= assetCount - 1}
            onClick={() => onMoveAsset(asset.id, assetCount - 1)}
          >
            <ChevronsDown size={13} />
          </button>
        </span>
      ) : null}
      {columns.map((column) => (
        <ListColumnValue key={column.id} columnId={column.id} asset={asset} language={language} />
      ))}
    </div>
  );
}

function ListColumnValue({
  columnId,
  asset,
  language
}: {
  columnId: ListColumnId;
  asset: AssetRecord;
  language: string;
}): JSX.Element {
  const { t } = useTranslation('common');
  const [imageFailed, setImageFailed] = useState(false);
  switch (columnId) {
    case 'preview':
      return (
        <span className={styles.listThumb}>
          {asset.thumbnailUrl && !imageFailed ? (
            <img src={asset.thumbnailUrl} alt={asset.title} loading="lazy" draggable={false} onError={() => setImageFailed(true)} />
          ) : (
            <Image size={20} />
          )}
        </span>
      );
    case 'name':
      return (
        <span className={styles.listTitle}>
          <strong>{asset.title}</strong>
          <small>{asset.originalFileName}</small>
        </span>
      );
    case 'extension':
      return <span>{asset.extension.toUpperCase()}</span>;
    case 'size':
      return <span>{formatBytes(asset.sizeBytes, language)}</span>;
    case 'dimensions':
      return <span>{asset.width && asset.height ? `${asset.width}x${asset.height}` : t('status.unknown')}</span>;
    case 'ratio':
      return <span>{formatRatio(asset.width, asset.height, t)}</span>;
    case 'rating':
      return <span>{t('assetGrid.ratingCompact', { rating: asset.rating })}</span>;
    case 'favorite':
      return <span>{asset.isFavorite ? t('status.enabled') : t('status.disabled')}</span>;
    case 'tags':
      return <span className={styles.listPills}>{formatTagSummary(asset.tags, t)}</span>;
    case 'collections':
      return <span>{asset.collections.length}</span>;
    case 'imported':
      return <span>{formatDateTime(asset.importedAt, language)}</span>;
    case 'source':
      return <span className={styles.listPath}>{asset.originalRelativePath ?? t('status.none')}</span>;
    default:
      return <span />;
  }
}

function ListColumnSettingsDialog({
  settings,
  onChange,
  onClose
}: {
  settings: ListColumnSettings;
  onChange: (updater: (current: ListColumnSettings) => ListColumnSettings) => void;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation('common');
  const moveColumn = (columnId: ListColumnId, direction: -1 | 1): void => {
    onChange((current) => {
      const index = current.columnOrder.indexOf(columnId);
      if (index < 0) {
        return current;
      }
      return {
        ...current,
        columnOrder: moveArrayItem(current.columnOrder, index, clampNumber(index + direction, 0, current.columnOrder.length - 1))
      };
    });
  };

  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.managementDialog}>
        <div className={styles.modalHeader}>
          <div>
            <h2>{t('list.settings.title')}</h2>
            <span>{t('list.settings.subtitle')}</span>
          </div>
          <button type="button" title={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className={styles.managerList}>
          {settings.columnOrder.map((columnId, index) => {
            const column = getListColumnDefinition(columnId);
            if (!column) {
              return null;
            }
            return (
              <div key={column.id} className={styles.columnSettingsRow}>
                <label className={styles.checkControl}>
                  <input
                    type="checkbox"
                    checked={settings.columns[column.id]}
                    onChange={(event) =>
                      onChange((current) => ({
                        ...current,
                        columns: {
                          ...current.columns,
                          [column.id]: event.target.checked
                        }
                      }))
                    }
                  />
                  {t(column.labelKey)}
                </label>
                <input
                  type="number"
                  min={column.minWidth}
                  max={column.maxWidth}
                  value={settings.columnWidths[column.id] ?? column.defaultWidth}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      columnWidths: {
                        ...current.columnWidths,
                        [column.id]: clampNumber(Number(event.target.value) || column.defaultWidth, column.minWidth, column.maxWidth)
                      }
                    }))
                  }
                  title={t('list.settings.width')}
                />
                <button type="button" title={t('list.settings.moveUp')} disabled={index === 0} onClick={() => moveColumn(column.id, -1)}>
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  title={t('list.settings.moveDown')}
                  disabled={index === settings.columnOrder.length - 1}
                  onClick={() => moveColumn(column.id, 1)}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <div className={styles.filterActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => onChange(() => DEFAULT_LIST_COLUMN_SETTINGS)}
          >
            <RotateCcw size={15} />
            {t('list.settings.reset')}
          </button>
          <button type="button" className={styles.primaryButton} onClick={onClose}>
            <Check size={15} />
            {t('actions.close')}
          </button>
        </div>
      </section>
    </div>
  );
}

const AssetTile = memo(function AssetTile({
  asset,
  selected,
  gridThumbnailSize,
  showFileNames,
  onSelect,
  setTileRef
}: {
  asset: AssetRecord;
  selected: boolean;
  gridThumbnailSize: number;
  showFileNames: boolean;
  onSelect: (assetId: string, mode?: 'replace' | 'toggle' | 'range') => void;
  setTileRef: (assetId: string, element: HTMLButtonElement | null) => void;
}): JSX.Element {
  const { t } = useTranslation('common');
  const openViewer = useRefForgeStore((state) => state.openViewer);
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <button
      ref={(element) => setTileRef(asset.id, element)}
      className={selected ? styles.assetTileSelected : styles.assetTile}
      onClick={(event) => {
        const mode = event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'replace';
        onSelect(asset.id, mode);
      }}
      onDoubleClick={() => openViewer(asset.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onSelect(asset.id, 'replace');
          openViewer(asset.id);
        }
      }}
      title={t('viewer.open')}
      data-asset-tile="true"
    >
      {selected ? (
        <span className={styles.selectionBadge}>
          <Check size={14} />
        </span>
      ) : null}
      <span className={styles.thumbWrap} style={{ height: `${gridThumbnailSize}px` }}>
        {asset.thumbnailUrl && !imageFailed ? (
          <img
            src={asset.thumbnailUrl}
            alt={asset.title}
            loading="lazy"
            draggable={false}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Image size={36} />
        )}
        {asset.isFavorite ? (
          <span className={styles.favoriteBadge}>
            <Heart size={13} fill="currentColor" />
          </span>
        ) : null}
      </span>
      {showFileNames ? <span className={styles.assetTitle}>{asset.title}</span> : null}
      <span className={styles.assetMeta}>
        {asset.width && asset.height ? `${asset.width}x${asset.height}` : asset.extension.toUpperCase()}
        <span className={styles.tileStars}>{t('assetGrid.ratingCompact', { rating: asset.rating })}</span>
      </span>
    </button>
  );
});

function TagManagerDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation('common');
  const tags = useRefForgeStore((state) => state.tags);
  const createTag = useRefForgeStore((state) => state.createTag);
  const updateTag = useRefForgeStore((state) => state.updateTag);
  const deleteTags = useRefForgeStore((state) => state.deleteTags);
  const deleteUnusedTags = useRefForgeStore((state) => state.deleteUnusedTags);
  const mergeTags = useRefForgeStore((state) => state.mergeTags);
  const [search, setSearch] = useState('');
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [targetTagId, setTargetTagId] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const filteredTags = tags.filter((tag) => {
    const matchesSearch = !search.trim() || tag.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesUsage = !unusedOnly || (tag.assetCount ?? 0) === 0;
    return matchesSearch && matchesUsage;
  });
  const sourceTagIds = selectedTagIds.filter((tagId) => tagId !== targetTagId);

  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.managementDialog}>
        <div className={styles.modalHeader}>
          <div>
            <h2>{t('tagManager.title')}</h2>
            <span>{t('tagManager.subtitle')}</span>
          </div>
          <button type="button" title={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.managementToolbar}>
          <form
            className={styles.managerCreateForm}
            onSubmit={(event) => {
              event.preventDefault();
              const name = newTagName.trim();
              if (name) {
                void createTag(name);
                setNewTagName('');
              }
            }}
          >
            <input
              value={newTagName}
              onChange={(event) => setNewTagName(event.target.value)}
              placeholder={t('tagManager.newTag')}
            />
            <button title={t('tagManager.createTag')} disabled={!newTagName.trim()}>
              <Plus size={15} />
            </button>
          </form>
          <div className={styles.searchBox}>
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('tagManager.search')} />
          </div>
          <label className={styles.checkControl}>
            <input type="checkbox" checked={unusedOnly} onChange={(event) => setUnusedOnly(event.target.checked)} />
            {t('tagManager.unusedOnly')}
          </label>
          <button
            className={styles.secondaryButton}
            disabled={selectedTagIds.length === 0}
            onClick={() => {
              if (window.confirm(t('tagManager.confirmDeleteMany', { count: selectedTagIds.length }))) {
                void deleteTags(selectedTagIds);
                setSelectedTagIds([]);
              }
            }}
          >
            <Trash2 size={15} />
            {t('tagManager.deleteSelected')}
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => {
              if (window.confirm(t('tagManager.confirmDeleteUnused'))) {
                void deleteUnusedTags();
                setSelectedTagIds([]);
              }
            }}
          >
            <Trash2 size={15} />
            {t('tagManager.deleteUnused')}
          </button>
        </div>

        <div className={styles.mergeBar}>
          <select value={targetTagId} onChange={(event) => setTargetTagId(event.target.value)}>
            <option value="">{t('tagManager.mergeTarget')}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <button
            className={styles.primaryButton}
            disabled={!targetTagId || sourceTagIds.length === 0}
            onClick={() => {
              if (window.confirm(t('tagManager.confirmMerge', { count: sourceTagIds.length }))) {
                void mergeTags({ sourceTagIds, targetTagId });
                setSelectedTagIds([]);
              }
            }}
          >
            <GitMerge size={15} />
            {t('tagManager.mergeSelected')}
          </button>
        </div>

        <div className={styles.managerList}>
          {filteredTags.length === 0 ? <div className={styles.miniEmpty}>{t('tagManager.empty')}</div> : null}
          {filteredTags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);
            return (
              <div key={tag.id} className={styles.tagManagerRow}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() =>
                    setSelectedTagIds((current) =>
                      selected ? current.filter((tagId) => tagId !== tag.id) : [...current, tag.id]
                    )
                  }
                />
                <span className={styles.tagDot} style={{ background: tag.color }} />
                <input
                  defaultValue={tag.name}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== tag.name) {
                      void updateTag({ id: tag.id, name });
                    }
                  }}
                />
                <input type="color" value={tag.color} onChange={(event) => void updateTag({ id: tag.id, color: event.target.value })} />
                <span>{t('tagManager.usageCount', { count: tag.assetCount ?? 0 })}</span>
                <button
                  title={t('tagManager.deleteOne')}
                  onClick={() => {
                    const key = (tag.assetCount ?? 0) > 0 ? 'tagManager.confirmDeleteUsed' : 'tagManager.confirmDeleteOne';
                    if (window.confirm(t(key, { name: tag.name, count: tag.assetCount ?? 0 }))) {
                      void deleteTags([tag.id]);
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function CollectionManagerDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation('common');
  const collections = useRefForgeStore((state) => state.collections);
  const selectedIds = useRefForgeStore((state) => state.selectedIds);
  const activeAssetId = useRefForgeStore((state) => state.activeAssetId);
  const createCollection = useRefForgeStore((state) => state.createCollection);
  const updateCollection = useRefForgeStore((state) => state.updateCollection);
  const deleteCollection = useRefForgeStore((state) => state.deleteCollection);
  const [search, setSearch] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const coverCandidateId = selectedIds[0] ?? activeAssetId;
  const filteredCollections = collections.filter((collection) => {
    const query = search.trim().toLowerCase();
    return !query || collection.name.toLowerCase().includes(query) || collection.description.toLowerCase().includes(query);
  });

  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.managementDialog}>
        <div className={styles.modalHeader}>
          <div>
            <h2>{t('collectionManager.title')}</h2>
            <span>{t('collectionManager.subtitle')}</span>
          </div>
          <button type="button" title={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.managementToolbar}>
          <form
            className={styles.managerCreateForm}
            onSubmit={(event) => {
              event.preventDefault();
              const name = newCollectionName.trim();
              if (name) {
                void createCollection(name);
                setNewCollectionName('');
              }
            }}
          >
            <input
              value={newCollectionName}
              onChange={(event) => setNewCollectionName(event.target.value)}
              placeholder={t('sidebar.newCollection')}
            />
            <button title={t('sidebar.createCollection')} disabled={!newCollectionName.trim()}>
              <Plus size={15} />
            </button>
          </form>
          <div className={styles.searchBox}>
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('collectionManager.search')} />
          </div>
        </div>

        <div className={styles.managerList}>
          {filteredCollections.length === 0 ? <div className={styles.miniEmpty}>{t('collectionManager.empty')}</div> : null}
          {filteredCollections.map((collection) => (
            <CollectionManagerRow
              key={collection.id}
              collection={collection}
              coverCandidateId={coverCandidateId}
              onUpdate={updateCollection}
              onDelete={deleteCollection}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function CollectionManagerRow({
  collection,
  coverCandidateId,
  onUpdate,
  onDelete
}: {
  collection: CollectionRecord;
  coverCandidateId: string | null;
  onUpdate: (input: { id: string; name?: string; description?: string; color?: string; coverAssetId?: string | null }) => void;
  onDelete: (id: string) => void;
}): JSX.Element {
  const { t } = useTranslation('common');
  return (
    <div className={styles.collectionManagerRow}>
      <span className={styles.collectionCover}>
        {collection.coverAssetThumbnailUrl ? (
          <img src={collection.coverAssetThumbnailUrl} alt={collection.coverAssetTitle ?? collection.name} />
        ) : (
          <Layers size={20} />
        )}
      </span>
      <input
        defaultValue={collection.name}
        onBlur={(event) => {
          const name = event.target.value.trim();
          if (name && name !== collection.name) {
            onUpdate({ id: collection.id, name });
          }
        }}
      />
      <input
        defaultValue={collection.description}
        onBlur={(event) => {
          if (event.target.value !== collection.description) {
            onUpdate({ id: collection.id, description: event.target.value });
          }
        }}
        placeholder={t('collectionManager.description')}
      />
      <input type="color" value={collection.color} onChange={(event) => onUpdate({ id: collection.id, color: event.target.value })} />
      <span>{t('collectionManager.assetCount', { count: collection.assetCount ?? 0 })}</span>
      <button
        className={styles.secondaryButton}
        disabled={!coverCandidateId}
        onClick={() => {
          if (coverCandidateId) {
            onUpdate({ id: collection.id, coverAssetId: coverCandidateId });
          }
        }}
      >
        <Image size={15} />
        {t('collectionManager.setCover')}
      </button>
      <button
        className={styles.secondaryButton}
        onClick={() => onUpdate({ id: collection.id, coverAssetId: null })}
        disabled={!collection.coverAssetId}
      >
        <RotateCcw size={15} />
        {t('collectionManager.clearCover')}
      </button>
      <button
        title={t('collectionManager.delete')}
        onClick={() => {
          if (window.confirm(t('collectionManager.confirmDelete', { name: collection.name }))) {
            onDelete(collection.id);
          }
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function SmartFolderManagerDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation('common');
  const smartFolders = useRefForgeStore((state) => state.smartFolders);
  const tags = useRefForgeStore((state) => state.tags);
  const config = useRefForgeStore((state) => state.config);
  const createSmartFolder = useRefForgeStore((state) => state.createSmartFolder);
  const updateSmartFolder = useRefForgeStore((state) => state.updateSmartFolder);
  const deleteSmartFolder = useRefForgeStore((state) => state.deleteSmartFolder);
  const previewSmartFolderCount = useRefForgeStore((state) => state.previewSmartFolderCount);
  const setSmartFolderFilter = useRefForgeStore((state) => state.setSmartFolderFilter);
  const [selectedId, setSelectedId] = useState<string | null>(smartFolders[0]?.id ?? null);
  const selectedFolder = smartFolders.find((folder) => folder.id === selectedId) ?? null;
  const [draft, setDraft] = useState(() => createSmartFolderDraft(selectedFolder));
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  useEffect(() => {
    setDraft(createSmartFolderDraft(selectedFolder));
  }, [selectedFolder]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void previewSmartFolderCount(normalizeSmartFolderDraft(draft.query)).then((count) => {
        if (active) {
          setPreviewCount(count);
        }
      });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draft.query, previewSmartFolderCount]);

  const saveDisabled = !draft.name.trim() || draft.query.conditions.length === 0 || !isSmartQueryValid(draft.query);

  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.managementDialog}>
        <div className={styles.modalHeader}>
          <div>
            <h2>{t('smartFolder.managerTitle')}</h2>
            <span>{t('smartFolder.managerSubtitle')}</span>
          </div>
          <button type="button" title={t('actions.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.smartFolderManagerLayout}>
          <div className={styles.smartFolderList}>
            <button
              type="button"
              className={selectedId === null ? styles.sideItemActive : styles.sideItem}
              onClick={() => setSelectedId(null)}
            >
              <Plus size={16} />
              {t('smartFolder.newFolder')}
            </button>
            {smartFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={selectedId === folder.id ? styles.sideItemActive : styles.sideItem}
                onClick={() => setSelectedId(folder.id)}
              >
                <Filter size={16} />
                {folder.name}
                <small>{formatSmartFolderQuery(folder.query, t)}</small>
              </button>
            ))}
          </div>

          <div className={styles.smartFolderEditor}>
            <label>
              {t('smartFolder.name')}
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder={t('sidebar.smartFolderName')}
              />
            </label>
            <label>
              {t('smartFolder.mode')}
              <select
                value={draft.query.mode}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    query: { ...current.query, mode: event.target.value === 'any' ? 'any' : 'all' }
                  }))
                }
              >
                <option value="all">{t('smartFolder.modes.all')}</option>
                <option value="any">{t('smartFolder.modes.any')}</option>
              </select>
            </label>

            <div className={styles.conditionList}>
              {draft.query.conditions.map((condition, index) => (
                <SmartFolderConditionRow
                  key={`${index}-${condition.field}`}
                  condition={condition}
                  tags={tags}
                  onChange={(nextCondition) =>
                    setDraft((current) => ({
                      ...current,
                      query: {
                        ...current.query,
                        conditions: current.query.conditions.map((candidate, candidateIndex) =>
                          candidateIndex === index ? nextCondition : candidate
                        )
                      }
                    }))
                  }
                  onDelete={() =>
                    setDraft((current) => ({
                      ...current,
                      query: {
                        ...current.query,
                        conditions: current.query.conditions.filter((_, candidateIndex) => candidateIndex !== index)
                      }
                    }))
                  }
                />
              ))}
              {draft.query.conditions.length === 0 ? <div className={styles.miniEmpty}>{t('smartFolder.noConditions')}</div> : null}
            </div>
            <datalist id="smart-folder-extensions">
              {(config?.supportedImageExtensions ?? []).map((extension) => (
                <option key={extension} value={extension} />
              ))}
            </datalist>

            <div className={styles.managementToolbar}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    query: {
                      ...current.query,
                      conditions: [...current.query.conditions, createDefaultSmartCondition(tags[0]?.id)]
                    }
                  }))
                }
              >
                <Plus size={15} />
                {t('smartFolder.addCondition')}
              </button>
              <span>{t('smartFolder.previewCount', { count: previewCount ?? 0 })}</span>
            </div>

            {!isSmartQueryValid(draft.query) ? <div className={styles.inlineError}>{t('smartFolder.conditionError')}</div> : null}

            <div className={styles.modalActions}>
              {selectedFolder ? (
                <>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      void setSmartFolderFilter(selectedFolder.id);
                      onClose();
                    }}
                  >
                    <Filter size={15} />
                    {t('smartFolder.showResults')}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (window.confirm(t('smartFolder.confirmDelete', { name: selectedFolder.name }))) {
                        void deleteSmartFolder(selectedFolder.id);
                        setSelectedId(null);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                    {t('actions.delete')}
                  </button>
                </>
              ) : null}
              <button type="button" className={styles.secondaryButton} onClick={onClose}>
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={saveDisabled}
                onClick={() => {
                  const query = normalizeSmartFolderDraft(draft.query);
                  if (selectedFolder) {
                    void updateSmartFolder({ id: selectedFolder.id, name: draft.name.trim(), query });
                    return;
                  }
                  void createSmartFolder(draft.name.trim(), query);
                  setSelectedId(null);
                  setDraft(createSmartFolderDraft(null));
                }}
              >
                <Check size={15} />
                {selectedFolder ? t('smartFolder.saveChanges') : t('smartFolder.create')}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SmartFolderConditionRow({
  condition,
  tags,
  onChange,
  onDelete
}: {
  condition: SmartFolderCondition;
  tags: AssetRecord['tags'];
  onChange: (condition: SmartFolderCondition) => void;
  onDelete: () => void;
}): JSX.Element {
  const { t } = useTranslation('common');
  const operatorOptions = getSmartOperatorOptions(condition.field);

  const updateField = (field: SmartFolderCondition['field']): void => {
    onChange({
      field,
      operator: getSmartOperator(field),
      value: defaultSmartValueForField(field, tags[0]?.id)
    });
  };

  return (
    <div className={styles.conditionRow}>
      <select value={condition.field} onChange={(event) => updateField(event.target.value as SmartFolderCondition['field'])}>
        {SMART_FOLDER_FIELD_OPTIONS.map((field) => (
          <option key={field} value={field}>
            {t(`smartFolder.fields.${field}`)}
          </option>
        ))}
      </select>
      <select
        value={condition.operator}
        onChange={(event) => onChange({ ...condition, operator: event.target.value as SmartFolderCondition['operator'] })}
      >
        {operatorOptions.map((operator) => (
          <option key={operator} value={operator}>
            {t(`smartFolder.operators.${operator}`)}
          </option>
        ))}
      </select>
      <SmartFolderValueControl condition={condition} tags={tags} onChange={onChange} />
      <button type="button" title={t('smartFolder.deleteCondition')} onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function SmartFolderValueControl({
  condition,
  tags,
  onChange
}: {
  condition: SmartFolderCondition;
  tags: AssetRecord['tags'];
  onChange: (condition: SmartFolderCondition) => void;
}): JSX.Element {
  const { t } = useTranslation('common');
  if (condition.field === 'tag' || condition.field === 'tagExcluded') {
    return (
      <select value={String(condition.value)} onChange={(event) => onChange({ ...condition, value: event.target.value })}>
        <option value="">{t('filter.any')}</option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>
    );
  }
  if (condition.field === 'rating') {
    return (
      <select value={String(condition.value)} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) })}>
        {[0, 1, 2, 3, 4, 5].map((rating) => (
          <option key={rating} value={rating}>
            {rating}
          </option>
        ))}
      </select>
    );
  }
  if (condition.field === 'favorite') {
    return (
      <select value={String(condition.value)} onChange={(event) => onChange({ ...condition, value: event.target.value === 'true' })}>
        <option value="true">{t('smartFolder.values.true')}</option>
        <option value="false">{t('smartFolder.values.false')}</option>
      </select>
    );
  }
  if (condition.field === 'orientation') {
    return (
      <select value={String(condition.value)} onChange={(event) => onChange({ ...condition, value: event.target.value })}>
        <option value="landscape">{t('smartFolder.values.landscape')}</option>
        <option value="portrait">{t('smartFolder.values.portrait')}</option>
        <option value="square">{t('smartFolder.values.square')}</option>
      </select>
    );
  }
  if (condition.field === 'extension') {
    return (
      <input
        value={String(condition.value)}
        list="smart-folder-extensions"
        onChange={(event) => onChange({ ...condition, value: event.target.value.replace(/^\./u, '').toLowerCase() })}
      />
    );
  }
  if (condition.field === 'mediaType') {
    return (
      <select value={String(condition.value)} onChange={(event) => onChange({ ...condition, value: event.target.value })}>
        <option value="image">image</option>
      </select>
    );
  }
  if (condition.field === 'sourceUrl') {
    return <input value={t('smartFolder.values.true')} readOnly />;
  }
  if (condition.field === 'width' || condition.field === 'height' || condition.field === 'recentDays') {
    return (
      <input
        type="number"
        min="0"
        value={Number(condition.value)}
        onChange={(event) => onChange({ ...condition, value: Number(event.target.value) })}
      />
    );
  }
  return <input value={String(condition.value)} onChange={(event) => onChange({ ...condition, value: event.target.value })} />;
}

function DuplicateResolutionCenter({ groups }: { groups: DuplicateGroup[] }): JSX.Element {
  const { t, i18n: i18nInstance } = useTranslation('common');
  const resolveDuplicateGroup = useRefForgeStore((state) => state.resolveDuplicateGroup);
  const mergeDuplicateAssets = useRefForgeStore((state) => state.mergeDuplicateAssets);
  const trashDuplicateAsset = useRefForgeStore((state) => state.trashDuplicateAsset);
  const loadDuplicateGroups = useRefForgeStore((state) => state.loadDuplicateGroups);
  const [selectedHash, setSelectedHash] = useState<string | null>(groups[0]?.hash ?? null);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [includeIgnored, setIncludeIgnored] = useState(false);

  useEffect(() => {
    void loadDuplicateGroups({ includeResolved, includeIgnored });
  }, [includeIgnored, includeResolved, loadDuplicateGroups]);

  useEffect(() => {
    if (!selectedHash || !groups.some((group) => group.hash === selectedHash)) {
      setSelectedHash(groups[0]?.hash ?? null);
    }
  }, [groups, selectedHash]);

  const selectedGroup = groups.find((group) => group.hash === selectedHash) ?? groups[0] ?? null;
  const recommendedAsset = selectedGroup ? pickRecommendedAsset(selectedGroup.assets) : null;

  if (groups.length === 0) {
    return (
      <section className={styles.duplicateCenter}>
        <div className={styles.emptyState}>
          <Copy size={30} />
          <h2>{t('duplicates.emptyTitle')}</h2>
          <p>{t('duplicates.emptyDescription')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.duplicateCenter}>
      <div className={styles.duplicateHeader}>
        <div>
          <strong>{t('duplicates.centerTitle')}</strong>
          <span>{t('duplicates.groupCount', { count: groups.length })}</span>
        </div>
        <label className={styles.checkControl}>
          <input type="checkbox" checked={includeResolved} onChange={(event) => setIncludeResolved(event.target.checked)} />
          {t('duplicates.showResolved')}
        </label>
        <label className={styles.checkControl}>
          <input type="checkbox" checked={includeIgnored} onChange={(event) => setIncludeIgnored(event.target.checked)} />
          {t('duplicates.showIgnored')}
        </label>
      </div>

      <div className={styles.duplicateLayout}>
        <div className={styles.duplicateGroupList}>
          {groups.map((group) => (
            <button
              key={group.hash}
              className={group.hash === selectedGroup?.hash ? styles.duplicateGroupActive : styles.duplicateGroup}
              onClick={() => setSelectedHash(group.hash)}
            >
              <strong>{t('duplicates.filesCount', { count: group.fileCount })}</strong>
              <span>{formatBytes(group.reclaimableBytes, i18nInstance.language)} {t('duplicates.reclaimable')}</span>
              <small>{t(`duplicates.status.${group.status}`)}</small>
            </button>
          ))}
        </div>

        {selectedGroup ? (
          <div className={styles.duplicateDetail}>
            <div className={styles.duplicateDetailHeader}>
              <div>
                <strong title={selectedGroup.hash}>{selectedGroup.hash.slice(0, 18)}...</strong>
                <span>
                  {t('duplicates.detailSummary', {
                    count: selectedGroup.fileCount,
                    size: formatBytes(selectedGroup.totalSizeBytes, i18nInstance.language)
                  })}
                </span>
              </div>
              <button
                className={styles.secondaryButton}
                onClick={() =>
                  void resolveDuplicateGroup({
                    hash: selectedGroup.hash,
                    status: 'resolved',
                    keepAssetId: recommendedAsset?.id ?? null
                  })
                }
              >
                <CheckCircle2 size={15} />
                {t('duplicates.markResolved')}
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => void resolveDuplicateGroup({ hash: selectedGroup.hash, status: 'ignored' })}
              >
                <Archive size={15} />
                {t('duplicates.ignore')}
              </button>
            </div>

            <div className={styles.duplicateCards}>
              {selectedGroup.assets.map((asset) => {
                const isRecommended = asset.id === recommendedAsset?.id;
                const sourceIds = selectedGroup.assets.filter((candidate) => candidate.id !== asset.id).map((candidate) => candidate.id);
                return (
                  <article key={asset.id} className={isRecommended ? styles.duplicateAssetRecommended : styles.duplicateAsset}>
                    <div className={styles.duplicatePreview}>
                      {asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt={asset.title} loading="lazy" /> : <Image size={28} />}
                      {isRecommended ? <span>{t('duplicates.recommended')}</span> : null}
                    </div>
                    <h3 title={asset.originalFileName}>{asset.originalFileName}</h3>
                    <dl className={styles.duplicateMeta}>
                      <div><dt>{t('inspector.original')}</dt><dd title={asset.originalRelativePath ?? ''}>{asset.originalRelativePath ?? t('status.none')}</dd></div>
                      <div><dt>{t('inspector.path')}</dt><dd title={asset.storedFilePath}>{asset.storedFilePath}</dd></div>
                      <div><dt>{t('inspector.size')}</dt><dd>{formatBytes(asset.sizeBytes, i18nInstance.language)}</dd></div>
                      <div><dt>{t('inspector.dimensions')}</dt><dd>{asset.width && asset.height ? `${asset.width} x ${asset.height}` : t('inspector.unknownDimensions')}</dd></div>
                      <div><dt>{t('duplicates.importedAt')}</dt><dd>{formatDateTime(asset.importedAt, i18nInstance.language)}</dd></div>
                      <div><dt>{t('inspector.tags')}</dt><dd>{asset.tags.map((tag) => tag.name).join(', ') || t('status.none')}</dd></div>
                      <div><dt>{t('inspector.collections')}</dt><dd>{asset.collections.map((collection) => collection.name).join(', ') || t('status.none')}</dd></div>
                      <div><dt>{t('inspector.ratingStars', { rating: asset.rating })}</dt><dd>{asset.isFavorite ? t('actions.favorite') : t('status.none')}</dd></div>
                      <div><dt>{t('inspector.memo')}</dt><dd>{asset.memo.trim() || t('status.none')}</dd></div>
                    </dl>
                    {isRecommended ? <p className={styles.recommendReason}>{getRecommendationReason(asset, selectedGroup.assets, t)}</p> : null}
                    <div className={styles.duplicateActions}>
                      <button
                        className={styles.primaryButton}
                        onClick={() => {
                          if (window.confirm(t('duplicates.confirmMergeKeep', { name: asset.originalFileName }))) {
                            void mergeDuplicateAssets({ hash: selectedGroup.hash, targetAssetId: asset.id, sourceAssetIds: sourceIds });
                          }
                        }}
                      >
                        <GitMerge size={15} />
                        {t('duplicates.mergeIntoThis')}
                      </button>
                      <button
                        className={styles.secondaryButton}
                        onClick={() => {
                          if (window.confirm(t('duplicates.confirmTrashOne', { name: asset.originalFileName }))) {
                            void trashDuplicateAsset(selectedGroup.hash, asset.id);
                          }
                        }}
                      >
                        <Trash2 size={15} />
                        {t('duplicates.moveThisToTrash')}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Inspector(): JSX.Element {
  const { t, i18n: i18nInstance } = useTranslation('common');
  const asset = useRefForgeStore(selectActiveAsset);
  const tags = useRefForgeStore((state) => state.tags);
  const collections = useRefForgeStore((state) => state.collections);
  const selectedIds = useRefForgeStore((state) => state.selectedIds);
  const updateAsset = useRefForgeStore((state) => state.updateAsset);
  const createTag = useRefForgeStore((state) => state.createTag);
  const assignTag = useRefForgeStore((state) => state.assignTag);
  const removeTag = useRefForgeStore((state) => state.removeTag);
  const addSelectionToCollection = useRefForgeStore((state) => state.addSelectionToCollection);
  const removeAssetFromCollection = useRefForgeStore((state) => state.removeAssetFromCollection);
  const trashSelection = useRefForgeStore((state) => state.trashSelection);
  const restoreSelection = useRefForgeStore((state) => state.restoreSelection);
  const permanentlyDeleteSelection = useRefForgeStore((state) => state.permanentlyDeleteSelection);
  const openViewer = useRefForgeStore((state) => state.openViewer);
  const savingAssetIds = useRefForgeStore((state) => state.savingAssetIds);
  const lastSavedAt = useRefForgeStore((state) => state.lastSavedAt);
  const [draft, setDraft] = useState({ title: '', memo: '', sourceUrl: '' });
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    setDraft({
      title: asset?.title ?? '',
      memo: asset?.memo ?? '',
      sourceUrl: asset?.sourceUrl ?? ''
    });
  }, [asset?.id, asset?.memo, asset?.sourceUrl, asset?.title]);

  if (selectedIds.length > 1) {
    return <MultiSelectionInspector />;
  }

  if (!asset) {
    return (
      <aside className={styles.inspector}>
        <div className={styles.emptyInspector}>
          <Image size={30} />
          <span>{t('inspector.noSelection')}</span>
        </div>
      </aside>
    );
  }

  const assignedTagIds = new Set(asset.tags.map((tag) => tag.id));
  const collectionIds = new Set(asset.collections.map((collection) => collection.id));
  const saveLabel = savingAssetIds.includes(asset.id)
    ? t('status.saving')
    : lastSavedAt
      ? t('status.savedAt', { time: formatDateTime(lastSavedAt, i18nInstance.language) })
      : t('status.saved');

  return (
    <aside className={styles.inspector}>
      <button className={styles.preview} title={t('viewer.open')} onClick={() => openViewer(asset.id)}>
        <img src={asset.storedFileUrl} alt={asset.title} />
      </button>

      <section className={styles.inspectorSection}>
        <div className={styles.inspectorTitle}>
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            onBlur={() => void updateAsset({ id: asset.id, title: draft.title })}
          />
          <button
            title={t('inspector.favorite')}
            className={asset.isFavorite ? styles.iconButtonActive : styles.iconButton}
            onClick={() => void updateAsset({ id: asset.id, isFavorite: !asset.isFavorite })}
          >
            <Heart size={17} fill={asset.isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className={styles.ratingRow}>
          {Array.from({ length: 5 }).map((_, index) => {
            const rating = index + 1;
            return (
              <button
                key={rating}
                title={t('inspector.ratingStars', { rating })}
                className={rating <= asset.rating ? styles.starActive : styles.starButton}
                onClick={() => void updateAsset({ id: asset.id, rating })}
              >
                <Star size={16} fill={rating <= asset.rating ? 'currentColor' : 'none'} />
              </button>
            );
          })}
          <span className={styles.saveState}>{saveLabel}</span>
        </div>
        <div className={styles.inspectorActions}>
          {asset.isDeleted ? (
            <>
              <button className={styles.secondaryButton} onClick={() => void restoreSelection()}>
                <RotateCcw size={15} />
                {t('inspector.restore')}
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => {
                  if (window.confirm(t('confirm.permanentDeleteOneStrong'))) {
                    void permanentlyDeleteSelection();
                  }
                }}
              >
                <Trash2 size={15} />
                {t('inspector.delete')}
              </button>
            </>
          ) : (
            <button
              className={styles.secondaryButton}
              onClick={() => {
                if (window.confirm(t('confirm.moveToTrashOne'))) {
                  void trashSelection();
                }
              }}
            >
              <Trash2 size={15} />
              {t('inspector.moveToTrash')}
            </button>
          )}
        </div>
      </section>

      <section className={styles.inspectorSection}>
        <h3>{t('inspector.file')}</h3>
        <dl className={styles.metaList}>
          <div>
            <dt>{t('inspector.name')}</dt>
            <dd>{asset.originalFileName}</dd>
          </div>
          <div>
            <dt>{t('inspector.size')}</dt>
            <dd>{formatBytes(asset.sizeBytes, i18nInstance.language)}</dd>
          </div>
          <div>
            <dt>{t('inspector.dimensions')}</dt>
            <dd>{asset.width && asset.height ? `${asset.width} x ${asset.height}` : t('inspector.unknownDimensions')}</dd>
          </div>
          <div>
            <dt>{t('inspector.ratio')}</dt>
            <dd>{formatRatio(asset.width, asset.height, t)}</dd>
          </div>
          <div>
            <dt>{t('inspector.extension')}</dt>
            <dd>.{asset.extension}</dd>
          </div>
          <div>
            <dt>{t('inspector.type')}</dt>
            <dd>{asset.mimeType ?? asset.extension}</dd>
          </div>
          <div>
            <dt>{t('inspector.hash')}</dt>
            <dd title={asset.hash}>{asset.hash.slice(0, 16)}...</dd>
          </div>
          <div>
            <dt>{t('inspector.path')}</dt>
            <dd>{asset.storedFilePath}</dd>
          </div>
          {asset.originalRelativePath ? (
            <div>
              <dt>{t('inspector.original')}</dt>
              <dd title={asset.originalRelativePath}>{asset.originalRelativePath}</dd>
            </div>
          ) : null}
          {asset.importBatchId ? (
            <div>
              <dt>{t('inspector.batch')}</dt>
              <dd title={asset.importBatchId}>{asset.importBatchId.slice(0, 8)}</dd>
            </div>
          ) : null}
          {asset.deletedAt ? (
            <div>
              <dt>{t('inspector.deleted')}</dt>
              <dd>{formatDateTime(asset.deletedAt, i18nInstance.language)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className={styles.inspectorSection}>
        <h3>{t('inspector.tags')}</h3>
        <div className={styles.tagCloud}>
          {tags.map((tag) => (
            <button
              key={tag.id}
              className={assignedTagIds.has(tag.id) ? styles.tagPillActive : styles.tagPill}
              onClick={() =>
                assignedTagIds.has(tag.id)
                  ? void removeTag(asset.id, tag.id)
                  : void assignTag(asset.id, tag.id)
              }
            >
              <span style={{ background: tag.color }} />
              {tag.name}
            </button>
          ))}
        </div>
        <form
          className={styles.inlineForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (newTag.trim()) {
              void createTag(newTag.trim());
              setNewTag('');
            }
          }}
        >
          <input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder={t('inspector.newTag')} />
          <button title={t('inspector.createTag')}>
            <Plus size={15} />
          </button>
        </form>
      </section>

      <section className={styles.inspectorSection}>
        <h3>{t('inspector.collections')}</h3>
        <div className={styles.collectionList}>
          {collections.length === 0 ? <div className={styles.miniEmpty}>{t('inspector.createCollectionHint')}</div> : null}
          {collections.map((collection) => (
            <span key={collection.id} className={collectionIds.has(collection.id) ? styles.collectionActive : styles.collectionItem}>
              <button
                onClick={() => void addSelectionToCollection(collection.id)}
                title={t('inspector.addSelectedToCollection', { count: selectedIds.length || 1 })}
              >
                <Layers size={14} />
                {collection.name}
              </button>
              {collectionIds.has(collection.id) ? (
                <button
                  title={t('inspector.removeFromCollection')}
                  onClick={() => void removeAssetFromCollection(collection.id, asset.id)}
                >
                  <X size={13} />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.inspectorSection}>
        <h3>{t('inspector.memo')}</h3>
        <textarea
          value={draft.memo}
          onChange={(event) => setDraft((current) => ({ ...current, memo: event.target.value }))}
          onBlur={() => void updateAsset({ id: asset.id, memo: draft.memo })}
          rows={5}
        />
        <input
          value={draft.sourceUrl}
          onChange={(event) => setDraft((current) => ({ ...current, sourceUrl: event.target.value }))}
          onBlur={() => void updateAsset({ id: asset.id, sourceUrl: draft.sourceUrl })}
          placeholder={t('inspector.sourceUrl')}
        />
      </section>

      <section className={styles.inspectorSection}>
        <h3>{t('inspector.palette')}</h3>
        <div className={styles.palette}>
          {asset.colors.map((color) => (
            <span key={color.id} title={color.color} style={{ background: color.color }} />
          ))}
        </div>
      </section>
    </aside>
  );
}

function MultiSelectionInspector(): JSX.Element {
  const { t } = useTranslation('common');
  const assets = useRefForgeStore((state) => state.assets);
  const tags = useRefForgeStore((state) => state.tags);
  const collections = useRefForgeStore((state) => state.collections);
  const selectedIds = useRefForgeStore((state) => state.selectedIds);
  const trashOnly = useRefForgeStore((state) => state.trashOnly);
  const trashSelection = useRefForgeStore((state) => state.trashSelection);
  const restoreSelection = useRefForgeStore((state) => state.restoreSelection);
  const permanentlyDeleteSelection = useRefForgeStore((state) => state.permanentlyDeleteSelection);
  const createTag = useRefForgeStore((state) => state.createTag);
  const addTagsToSelection = useRefForgeStore((state) => state.addTagsToSelection);
  const removeTagsFromSelection = useRefForgeStore((state) => state.removeTagsFromSelection);
  const addSelectionToCollectionBatch = useRefForgeStore((state) => state.addSelectionToCollectionBatch);
  const createCollectionAndAddSelection = useRefForgeStore((state) => state.createCollectionAndAddSelection);
  const setSelectionRating = useRefForgeStore((state) => state.setSelectionRating);
  const setSelectionFavorite = useRefForgeStore((state) => state.setSelectionFavorite);
  const clearSelection = useRefForgeStore((state) => state.clearSelection);
  const [exportOpen, setExportOpen] = useState(false);
  const [tagToAdd, setTagToAdd] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [tagToRemove, setTagToRemove] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.includes(asset.id)),
    [assets, selectedIds]
  );
  const tagUsage = useMemo(() => {
    const usage = new Map<string, { tag: AssetRecord['tags'][number]; count: number }>();
    for (const asset of selectedAssets) {
      for (const tag of asset.tags) {
        usage.set(tag.id, { tag, count: (usage.get(tag.id)?.count ?? 0) + 1 });
      }
    }
    return [...usage.values()].sort((left, right) => left.tag.name.localeCompare(right.tag.name));
  }, [selectedAssets]);
  const commonTags = tagUsage.filter((entry) => entry.count === selectedAssets.length);
  const favoriteCount = selectedAssets.filter((asset) => asset.isFavorite).length;
  const averageRating =
    selectedAssets.length === 0
      ? 0
      : selectedAssets.reduce((sum, asset) => sum + asset.rating, 0) / selectedAssets.length;

  return (
    <aside className={styles.inspector}>
      <section className={styles.multiSelectionPanel}>
        <CheckCircle2 size={30} />
        <h2>{t('multiSelection.title', { count: selectedIds.length })}</h2>
        <p>
          {t('multiSelection.summary', {
            favorites: favoriteCount,
            count: selectedAssets.length,
            rating: averageRating.toFixed(1)
          })}
        </p>
        <div className={styles.inspectorActions}>
          {trashOnly ? (
            <>
              <button className={styles.secondaryButton} onClick={() => void restoreSelection()}>
                <RotateCcw size={15} />
                {t('inspector.restore')}
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => {
                  if (window.confirm(t('confirm.permanentDeleteSelectedStrong', { count: selectedIds.length }))) {
                    void permanentlyDeleteSelection();
                  }
                }}
              >
                <Trash2 size={15} />
                {t('inspector.delete')}
              </button>
            </>
          ) : (
            <button
              className={styles.secondaryButton}
              onClick={() => {
                if (window.confirm(t('confirm.moveToTrashSelected', { count: selectedIds.length }))) {
                  void trashSelection();
                }
              }}
            >
              <Trash2 size={15} />
              {t('inspector.moveToTrash')}
            </button>
          )}
          <button className={styles.secondaryButton} onClick={() => setExportOpen(true)}>
            <FileOutput size={15} />
            {t('multiSelection.export')}
          </button>
          <button className={styles.secondaryButton} onClick={clearSelection}>
            <X size={15} />
            {t('multiSelection.clear')}
          </button>
        </div>
      </section>
      <section className={styles.inspectorSection}>
        <h3>{t('inspector.tags')}</h3>
        <div className={styles.bulkMeta}>
          <span>{t('multiSelection.commonTags')}</span>
          <div className={styles.tagCloud}>
            {commonTags.length === 0 ? <span className={styles.readOnlyPill}>{t('status.none')}</span> : null}
            {commonTags.map(({ tag }) => (
              <span key={tag.id} className={styles.readOnlyPill}>
                <span className={styles.tagDot} style={{ background: tag.color }} />
                {tag.name}
              </span>
            ))}
          </div>
          <span>{t('multiSelection.allTags')}</span>
          <div className={styles.tagCloud}>
            {tagUsage.length === 0 ? <span className={styles.readOnlyPill}>{t('status.none')}</span> : null}
            {tagUsage.map(({ tag, count }) => (
              <span key={tag.id} className={styles.readOnlyPill}>
                <span className={styles.tagDot} style={{ background: tag.color }} />
                {tag.name}
                <small>{count}</small>
              </span>
            ))}
          </div>
        </div>
        <div className={styles.bulkActionGrid}>
          <label>
            {t('multiSelection.addExistingTag')}
            <span>
              <select value={tagToAdd} onChange={(event) => setTagToAdd(event.target.value)}>
                <option value="">{t('multiSelection.chooseTag')}</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <button
                className={styles.secondaryButton}
                disabled={!tagToAdd}
                onClick={() => {
                  void addTagsToSelection([tagToAdd]);
                  setTagToAdd('');
                }}
              >
                <Plus size={15} />
                {t('actions.add')}
              </button>
            </span>
          </label>
          <label>
            {t('multiSelection.createAndAddTag')}
            <span>
              <input value={newTagName} onChange={(event) => setNewTagName(event.target.value)} />
              <button
                className={styles.secondaryButton}
                disabled={!newTagName.trim()}
                onClick={() => {
                  void createTag(newTagName.trim()).then((tag) => {
                    if (tag) {
                      void addTagsToSelection([tag.id]);
                    }
                    setNewTagName('');
                  });
                }}
              >
                <Plus size={15} />
                {t('actions.add')}
              </button>
            </span>
          </label>
          <label>
            {t('multiSelection.removeTag')}
            <span>
              <select value={tagToRemove} onChange={(event) => setTagToRemove(event.target.value)}>
                <option value="">{t('multiSelection.chooseTag')}</option>
                {tagUsage.map(({ tag }) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <button
                className={styles.secondaryButton}
                disabled={!tagToRemove}
                onClick={() => {
                  void removeTagsFromSelection([tagToRemove]);
                  setTagToRemove('');
                }}
              >
                <X size={15} />
                {t('actions.remove')}
              </button>
            </span>
          </label>
        </div>
      </section>
      <section className={styles.inspectorSection}>
        <h3>{t('multiSelection.collections')}</h3>
        <div className={styles.bulkActionGrid}>
          <label>
            {t('multiSelection.addToCollection')}
            <span>
              <select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
                <option value="">{t('multiSelection.chooseCollection')}</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
              <button
                className={styles.secondaryButton}
                disabled={!collectionId}
                onClick={() => {
                  void addSelectionToCollectionBatch(collectionId);
                  setCollectionId('');
                }}
              >
                <Layers size={15} />
                {t('actions.add')}
              </button>
            </span>
          </label>
          <label>
            {t('multiSelection.createAndAddCollection')}
            <span>
              <input value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} />
              <button
                className={styles.secondaryButton}
                disabled={!newCollectionName.trim()}
                onClick={() => {
                  void createCollectionAndAddSelection(newCollectionName.trim());
                  setNewCollectionName('');
                }}
              >
                <Plus size={15} />
                {t('actions.add')}
              </button>
            </span>
          </label>
        </div>
      </section>
      <section className={styles.inspectorSection}>
        <h3>{t('multiSelection.batchMetadata')}</h3>
        <div className={styles.ratingRow}>
          {Array.from({ length: 6 }).map((_, rating) => (
            <button
              key={rating}
              className={styles.secondaryButton}
              onClick={() => void setSelectionRating(rating)}
              title={t('multiSelection.setRating', { rating })}
            >
              {rating}
            </button>
          ))}
        </div>
        <div className={styles.inspectorActions}>
          <button className={styles.secondaryButton} onClick={() => void setSelectionFavorite(true)}>
            <Heart size={15} fill="currentColor" />
            {t('multiSelection.favoriteOn')}
          </button>
          <button className={styles.secondaryButton} onClick={() => void setSelectionFavorite(false)}>
            <Heart size={15} />
            {t('multiSelection.favoriteOff')}
          </button>
        </div>
      </section>
      {exportOpen ? <ExportDialog onClose={() => setExportOpen(false)} /> : null}
    </aside>
  );
}

function ImageViewer(): JSX.Element | null {
  const { t, i18n: i18nInstance } = useTranslation('common');
  const viewerAssetId = useRefForgeStore((state) => state.viewerAssetId);
  const assets = useRefForgeStore((state) => state.assets);
  const closeViewer = useRefForgeStore((state) => state.closeViewer);
  const showNextViewerAsset = useRefForgeStore((state) => state.showNextViewerAsset);
  const showPreviousViewerAsset = useRefForgeStore((state) => state.showPreviousViewerAsset);
  const asset = assets.find((candidate) => candidate.id === viewerAssetId) ?? null;
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragStart(null);
    setImageFailed(false);
  }, [asset?.id]);

  useEffect(() => {
    if (!asset) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeViewer();
      } else if (event.key === 'ArrowRight') {
        showNextViewerAsset();
      } else if (event.key === 'ArrowLeft') {
        showPreviousViewerAsset();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [asset, closeViewer, showNextViewerAsset, showPreviousViewerAsset]);

  useEffect(() => {
    if (!dragStart) {
      return;
    }

    document.body.style.cursor = 'grabbing';
    const handleMouseMove = (event: MouseEvent): void => {
      event.preventDefault();
      setOffset({
        x: dragStart.originX + event.clientX - dragStart.x,
        y: dragStart.originY + event.clientY - dragStart.y
      });
    };
    const handleMouseUp = (): void => {
      setDragStart(null);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragStart]);

  if (!asset) {
    return null;
  }

  const zoomBy = (delta: number): void => {
    setScale((current) => clampNumber(current + delta, 0.25, 5));
  };

  const resetView = (): void => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -0.12 : 0.12);
  };

  const startDrag = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || isInteractiveElement(event.target)) {
      return;
    }
    event.preventDefault();
    setDragStart({ x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y });
  };

  return (
    <div className={styles.viewerBackdrop} onClick={closeViewer}>
      <section className={styles.viewerDialog} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className={styles.viewerHeader}>
          <div>
            <strong title={asset.originalFileName}>{asset.title}</strong>
            <span>
              {asset.width && asset.height ? `${asset.width} x ${asset.height}` : asset.extension.toUpperCase()}
              {' · '}
              {formatBytes(asset.sizeBytes, i18nInstance.language)}
            </span>
          </div>
          <div className={styles.viewerTools}>
            <button title={t('viewer.zoomOut')} onClick={() => zoomBy(-0.2)}>
              <ZoomOut size={17} />
            </button>
            <span>{t('viewer.zoomLevel', { value: Math.round(scale * 100) })}</span>
            <button title={t('viewer.zoomIn')} onClick={() => zoomBy(0.2)}>
              <ZoomIn size={17} />
            </button>
            <button title={t('viewer.reset')} onClick={resetView}>
              <Maximize2 size={17} />
            </button>
            <button title={t('actions.close')} onClick={closeViewer}>
              <X size={18} />
            </button>
          </div>
        </header>

        <div
          className={dragStart ? styles.viewerStageDragging : styles.viewerStage}
          onWheel={handleWheel}
          onMouseDown={startDrag}
        >
          <button
            className={styles.viewerPrevious}
            title={t('viewer.previous')}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              showPreviousViewerAsset();
            }}
          >
            <ChevronLeft size={22} />
          </button>
          <div className={styles.viewerCanvas}>
            {imageFailed ? (
              <div className={styles.viewerFallback}>
                <Image size={34} />
                <span>{t('viewer.loadingFailed')}</span>
              </div>
            ) : (
              <img
                src={asset.storedFileUrl}
                alt={asset.title}
                draggable={false}
                className={styles.viewerImage}
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                onError={() => setImageFailed(true)}
              />
            )}
          </div>
          <button
            className={styles.viewerNext}
            title={t('viewer.next')}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              showNextViewerAsset();
            }}
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </section>
    </div>
  );
}

function BatchResultDialog(): JSX.Element | null {
  const { t } = useTranslation('common');
  const result = useRefForgeStore((state) => state.lastBatchResult);
  const dismissBatchResult = useRefForgeStore((state) => state.dismissBatchResult);

  if (!result) {
    return null;
  }

  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.resultDialog}>
        <div className={styles.modalHeader}>
          <div>
            <h2>{t('batchResult.title')}</h2>
            <span>
              {t('batchResult.summary', {
                requested: result.requestedCount,
                success: result.successCount,
                failed: result.failedCount,
                skipped: result.skippedCount
              })}
            </span>
          </div>
          <button type="button" title={t('actions.close')} onClick={dismissBatchResult}>
            <X size={18} />
          </button>
        </div>
        {result.failures.length > 0 ? (
          <div className={styles.resultList}>
            {result.failures.map((failure, index) => (
              <div key={`${failure.assetId ?? 'unknown'}-${failure.code}-${index}`}>
                <strong>{failure.title ?? failure.assetId ?? t('status.unknown')}</strong>
                <span>{failure.code}: {failure.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.mutedText}>{t('batchResult.noFailures')}</p>
        )}
        <div className={styles.modalActions}>
          <button className={styles.primaryButton} onClick={dismissBatchResult}>
            {t('actions.close')}
          </button>
        </div>
      </section>
    </div>
  );
}

function PermanentDeleteResultDialog(): JSX.Element | null {
  const { t } = useTranslation('common');
  const result = useRefForgeStore((state) => state.lastPermanentDeleteResult);
  const dismissPermanentDeleteResult = useRefForgeStore((state) => state.dismissPermanentDeleteResult);
  const permanentlyDeleteSelection = useRefForgeStore((state) => state.permanentlyDeleteSelection);

  if (!result) {
    return null;
  }

  const retryAssetIds = uniqueStrings(result.failures.map((failure) => failure.assetId).filter((id): id is string => Boolean(id)));
  const failedFiles = result.fileResults.filter(
    (fileResult) => fileResult.status === 'failed' || fileResult.status === 'outside_library'
  );

  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.resultDialog}>
        <div className={styles.modalHeader}>
          <div>
            <h2>{t('permanentDeleteResult.title')}</h2>
            <span>
              {t('permanentDeleteResult.summary', {
                success: result.successCount,
                failed: result.failedCount,
                missing: result.missingFileCount,
                deleted: result.deletedFileCount
              })}
            </span>
          </div>
          <button type="button" title={t('actions.close')} onClick={dismissPermanentDeleteResult}>
            <X size={18} />
          </button>
        </div>
        {failedFiles.length > 0 ? (
          <div className={styles.resultList}>
            {failedFiles.map((fileResult, index) => (
              <div key={`${fileResult.assetId}-${fileResult.target}-${index}`}>
                <strong>{fileResult.title}</strong>
                <span>{fileResult.target}: {fileResult.relativePath}</span>
                <small>{fileResult.errorCode ?? fileResult.status}: {fileResult.errorMessage ?? fileResult.status}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.mutedText}>{t('permanentDeleteResult.noFailures')}</p>
        )}
        <div className={styles.modalActions}>
          <button
            className={styles.secondaryButton}
            onClick={() => void navigator.clipboard.writeText(JSON.stringify(result, null, 2))}
          >
            <Copy size={15} />
            {t('permanentDeleteResult.copyDetails')}
          </button>
          <button
            className={styles.secondaryButton}
            disabled={retryAssetIds.length === 0}
            onClick={() => void permanentlyDeleteSelection(retryAssetIds)}
          >
            <RotateCcw size={15} />
            {t('permanentDeleteResult.retry')}
          </button>
          <button className={styles.primaryButton} onClick={dismissPermanentDeleteResult}>
            {t('actions.close')}
          </button>
        </div>
      </section>
    </div>
  );
}

function ImportStatus(): JSX.Element | null {
  const { t, i18n: i18nInstance } = useTranslation('common');
  const summary = useRefForgeStore((state) => state.importSummary);
  const importing = useRefForgeStore((state) => state.importing);
  const pendingImportTotal = useRefForgeStore((state) => state.pendingImportTotal);
  const importPaths = useRefForgeStore((state) => state.importPaths);
  const dismissImportSummary = useRefForgeStore((state) => state.dismissImportSummary);

  if (!summary && !importing) {
    return null;
  }

  const duplicatePaths = summary?.items
    .filter((item) => item.status === 'duplicate')
    .map((item) => item.sourcePath) ?? [];
  const issueItems = summary?.items.filter((item) => item.status !== 'imported') ?? [];

  return (
    <div className={styles.importStatus}>
      <header>
        <div>
          <Check size={17} />
          <strong>
            {importing
              ? pendingImportTotal > 0
                ? t('import.statusFiles', { count: pendingImportTotal })
                : t('import.statusFolder')
              : t('import.imported', { count: summary?.imported ?? 0 })}
          </strong>
          {summary ? (
            <span>
              {t('import.summary', {
                supported: summary.supported,
                total: summary.total,
                duplicates: summary.duplicates,
                failed: summary.failed,
                unsupported: summary.unsupported,
                duration: formatDuration(summary.durationMs, i18nInstance.language, t)
              })}
            </span>
          ) : null}
        </div>
        <button title={t('actions.dismiss')} onClick={dismissImportSummary}>
          <X size={16} />
        </button>
      </header>
      {importing ? <div className={styles.progressBar}><span /></div> : null}
      {duplicatePaths.length > 0 ? (
        <button className={styles.secondaryButton} onClick={() => void importPaths(duplicatePaths, 'add')}>
          {t('import.importDuplicatesAnyway')}
        </button>
      ) : null}
      {issueItems.length > 0 ? (
        <div className={styles.importIssues}>
          {issueItems.slice(0, 8).map((item) => (
            <div key={`${item.sourcePath}-${item.status}`}>
              <strong>{t(`fileStatus.${item.status}`)}</strong>
              <span title={item.sourcePath}>{fileBaseName(item.sourcePath)}</span>
              {item.error ? <small>{item.error}</small> : null}
            </div>
          ))}
          {issueItems.length > 8 ? <small>{t('import.moreIssues', { count: issueItems.length - 8 })}</small> : null}
        </div>
      ) : null}
    </div>
  );
}

function ExportDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation(['export', 'common']);
  const selectedIds = useRefForgeStore((state) => state.selectedIds);
  const collections = useRefForgeStore((state) => state.collections);
  const exportPresets = useRefForgeStore((state) => state.exportPresets);
  const createExport = useRefForgeStore((state) => state.createExport);
  const lastExport = useRefForgeStore((state) => state.lastExport);
  const openPath = useRefForgeStore((state) => state.openPath);
  const defaultPreset = exportPresets[0] ?? null;
  const [form, setForm] = useState<ExportInput>({
    presetId: defaultPreset?.id,
    name: 'reference-pack',
    goal: defaultPreset?.defaultGoal ?? '',
    commonTraits: '',
    instructions: defaultPreset?.defaultApplyInstructions ?? '',
    constraints: defaultPreset?.defaultForbiddenRules ?? '',
    outputFileName: defaultPreset?.outputFileName ?? 'instruction.md',
    assetIds: selectedIds,
    collectionId: null
  });

  const canSubmit = form.name.trim() && (selectedIds.length > 0 || form.collectionId);
  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === form.collectionId) ?? null,
    [collections, form.collectionId]
  );

  return (
    <div className={styles.modalBackdrop}>
      <form
        className={styles.exportDialog}
        onSubmit={(event) => {
          event.preventDefault();
          void createExport(form);
        }}
      >
        <div className={styles.modalHeader}>
          <div>
            <h2>{t('export:dialogTitle')}</h2>
            <span>{selectedCollection ? selectedCollection.name : t('export:selectedAssets', { count: selectedIds.length })}</span>
          </div>
          <button type="button" title={t('common:actions.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <label>
          {t('export:preset')}
          <select
            value={form.presetId ?? ''}
            onChange={(event) => {
              const preset = exportPresets.find((candidate) => candidate.id === event.target.value) ?? null;
              setForm((current) => applyPresetToForm(current, preset));
            }}
          >
            {exportPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {t(`export:presets.${preset.id}.name`, { defaultValue: preset.name })}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t('export:exportName')}
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        </label>

        <label>
          {t('export:sourceCollection')}
          <select
            value={form.collectionId ?? ''}
            onChange={(event) => setForm((current) => ({ ...current, collectionId: event.target.value || null }))}
          >
            <option value="">{t('export:selectedAssetsOption')}</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t('export:goal')}
          <textarea value={form.goal} onChange={(event) => setForm((current) => ({ ...current, goal: event.target.value }))} rows={3} />
        </label>
        <label>
          {t('export:commonTraits')}
          <textarea value={form.commonTraits} onChange={(event) => setForm((current) => ({ ...current, commonTraits: event.target.value }))} rows={3} />
        </label>
        <label>
          {t('export:instructions')}
          <textarea value={form.instructions} onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))} rows={3} />
        </label>
        <label>
          {t('export:constraints')}
          <textarea value={form.constraints} onChange={(event) => setForm((current) => ({ ...current, constraints: event.target.value }))} rows={3} />
        </label>
        <label>
          {t('export:outputFile')}
          <input value={form.outputFileName} onChange={(event) => setForm((current) => ({ ...current, outputFileName: event.target.value }))} />
        </label>

        {lastExport ? (
          <div className={styles.exportResult}>
            <div>
              <strong>{t('export:createdRefs', { count: lastExport.assetCount })}</strong>
              <span>{lastExport.markdownPath}</span>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={() => void openPath(lastExport.exportPath)}>
              <FolderOpen size={16} />
              {t('export:openFolder')}
            </button>
          </div>
        ) : null}

        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            {t('common:actions.cancel')}
          </button>
          <button className={styles.primaryButton} disabled={!canSubmit}>
            <FileOutput size={16} />
            {t('export:export')}
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { t, i18n: i18nInstance } = useTranslation(['settings', 'common']);
  const config = useRefForgeStore((state) => state.config);
  const library = useRefForgeStore((state) => state.library);
  const importBatches = useRefForgeStore((state) => state.importBatches);
  const languagePreference = useRefForgeStore((state) => state.languagePreference);
  const setLanguagePreference = useRefForgeStore((state) => state.setLanguagePreference);
  const gridThumbnailSize = useRefForgeStore((state) => state.gridThumbnailSize);
  const showFileNames = useRefForgeStore((state) => state.showFileNames);
  const setGridThumbnailSize = useRefForgeStore((state) => state.setGridThumbnailSize);
  const setShowFileNames = useRefForgeStore((state) => state.setShowFileNames);

  return (
    <div className={styles.modalBackdrop}>
      <section className={styles.settingsDialog}>
        <div className={styles.modalHeader}>
          <div>
            <h2>{t('settings:title')}</h2>
            <span>{t('settings:subtitle')}</span>
          </div>
          <button type="button" title={t('common:actions.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.settingsGrid}>
          <label>
            {t('settings:language')}
            <select
              value={languagePreference}
              onChange={(event) => void setLanguagePreference(event.target.value as LanguagePreference)}
            >
              <option value="system">{t('settings:languageOptions.system')}</option>
              {SUPPORTED_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {t(`settings:languageOptions.${language.code}`)}
                </option>
              ))}
            </select>
            <small>{t('settings:languageHelp')}</small>
          </label>
          <label>
            {t('settings:appName')}
            <input value={config?.appName ?? ''} readOnly />
            <small>{t('settings:displayOnlyConfig')}</small>
          </label>
          <label>
            {t('settings:theme')}
            <input value={config?.theme ?? 'dark'} readOnly />
            <small>{t('settings:displayOnly')}</small>
          </label>
          <label>
            {t('settings:defaultThumbnailSize')}
            <input value={config?.thumbnailSize ?? ''} readOnly />
            <small>{t('settings:displayOnlyThumbnail')}</small>
          </label>
          <label>
            {t('settings:gridThumbnailSize')}
            <input
              type="range"
              min="112"
              max="260"
              step="8"
              value={gridThumbnailSize}
              onChange={(event) => setGridThumbnailSize(Number(event.target.value))}
            />
            <small>{t('settings:savedLocallyWithValue', { value: `${gridThumbnailSize}px` })}</small>
          </label>
          <label>
            {t('settings:showFileNames')}
            <select value={showFileNames ? 'true' : 'false'} onChange={(event) => setShowFileNames(event.target.value === 'true')}>
              <option value="true">{t('common:actions.show')}</option>
              <option value="false">{t('common:actions.hide')}</option>
            </select>
            <small>{t('settings:savedLocally')}</small>
          </label>
          <label>
            {t('settings:importPolicy')}
            <input value={config?.defaultImportMode ?? 'copy'} readOnly />
            <small>{t('settings:displayOnlyImportPolicy')}</small>
          </label>
          <label>
            {t('settings:autoDuplicateCheck')}
            <input value={config?.autoDuplicateCheck ? t('common:status.enabled') : t('common:status.disabled')} readOnly />
            <small>{t('settings:displayOnlyImportFlow')}</small>
          </label>
          <label>
            {t('settings:autoColorAnalysis')}
            <input value={config?.autoColorAnalysis ? t('common:status.enabled') : t('common:status.disabled')} readOnly />
            <small>{t('settings:displayOnlyImportFlow')}</small>
          </label>
          <label>
            {t('settings:defaultLibraryPath')}
            <input value={library?.rootPath ?? t('settings:notSet')} readOnly />
            <small>{t('settings:currentLibraryPath')}</small>
          </label>
        </div>

        <section className={styles.settingsAbout}>
          <img src={brandIconUrl} alt="" />
          <div>
            <h3>{config?.appName ?? 'Suwol Visual Reference'}</h3>
            <p>{t('settings:aboutDescription')}</p>
            <span>
              {t('settings:version', { version: config?.appVersion ?? '0.0.0' })}
              {' · '}
              {config?.appLicense ?? 'Apache-2.0'}
            </span>
          </div>
        </section>

        <section className={styles.inspectorSection}>
          <h3>{t('settings:supportedExtensions')}</h3>
          <div className={styles.tagCloud}>
            {config?.supportedImageExtensions.map((extension) => (
              <span key={extension} className={styles.readOnlyPill}>.{extension}</span>
            ))}
          </div>
        </section>

        <section className={styles.inspectorSection}>
          <h3>{t('settings:recentImports')}</h3>
          <div className={styles.batchList}>
            {importBatches.length === 0 ? <div className={styles.miniEmpty}>{t('settings:noImportBatches')}</div> : null}
            {importBatches.slice(0, 5).map((batch) => (
              <div key={batch.id}>
                <strong>{batch.sourceType}</strong>
                <span title={batch.sourcePath}>{fileBaseName(batch.sourcePath)}</span>
                <small>
                  {t('settings:batchSummary', {
                    imported: batch.importedCount,
                    total: batch.totalCount,
                    failed: batch.failedCount,
                    duration: formatDuration(batch.durationMs ?? 0, i18nInstance.language, t)
                  })}
                </small>
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function Toast({ tone, message, onClose }: { tone: 'danger' | 'info'; message: string; onClose: () => void }): JSX.Element {
  const { t } = useTranslation('common');
  return (
    <div className={tone === 'danger' ? styles.toastDanger : styles.toast}>
      <AlertTriangle size={17} />
      <span>{message}</span>
      <button title={t('actions.dismiss')} onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
}

function applyPresetToForm(current: ExportInput, preset: ExportPreset | null): ExportInput {
  if (!preset) {
    return { ...current, presetId: undefined };
  }

  return {
    ...current,
    presetId: preset.id,
    goal: current.goal.trim() ? current.goal : preset.defaultGoal,
    instructions: current.instructions.trim() ? current.instructions : preset.defaultApplyInstructions,
    constraints: current.constraints.trim() ? current.constraints : preset.defaultForbiddenRules,
    outputFileName: current.outputFileName?.trim() ? current.outputFileName : preset.outputFileName
  };
}

function createSmartFolderDraft(folder: SmartFolderRecord | null): { name: string; query: SmartFolderQuery } {
  return folder
    ? { name: folder.name, query: normalizeSmartFolderDraft(folder.query) }
    : { name: '', query: { mode: 'all', conditions: [createDefaultSmartCondition()] } };
}

function createDefaultSmartCondition(tagId?: string): SmartFolderCondition {
  return {
    field: tagId ? 'tag' : 'rating',
    operator: tagId ? 'contains' : '>=',
    value: tagId ?? 4
  };
}

function normalizeSmartFolderDraft(query: SmartFolderQuery): SmartFolderQuery {
  return {
    mode: query.mode === 'any' ? 'any' : 'all',
    conditions: query.conditions
      .map((condition) => ({
        field: condition.field,
        operator: getSmartOperatorOptions(condition.field).includes(condition.operator)
          ? condition.operator
          : getSmartOperator(condition.field),
        value: normalizeSmartValue(condition.field, String(condition.value))
      }))
      .filter((condition) => isSmartConditionValid(condition))
  };
}

function isSmartQueryValid(query: SmartFolderQuery): boolean {
  return query.conditions.length > 0 && query.conditions.every(isSmartConditionValid);
}

function isSmartConditionValid(condition: SmartFolderCondition): boolean {
  if (condition.operator === 'exists') {
    return true;
  }
  if (condition.field === 'sourceUrl' || condition.field === 'favorite') {
    return true;
  }
  if (condition.field === 'rating' || condition.field === 'width' || condition.field === 'height' || condition.field === 'recentDays') {
    return Number.isFinite(Number(condition.value));
  }
  return String(condition.value ?? '').trim().length > 0;
}

function normalizeSmartValue(field: SmartFolderCondition['field'], value: string): SmartFolderCondition['value'] {
  if (field === 'rating' || field === 'width' || field === 'height' || field === 'recentDays') {
    return Number(value) || 0;
  }
  if (field === 'favorite' || field === 'sourceUrl') {
    return value !== 'false';
  }
  return value.trim();
}

function defaultSmartValue(field: SmartFolderCondition['field']): string {
  if (field === 'favorite') {
    return 'true';
  }
  if (field === 'recentDays') {
    return '14';
  }
  if (field === 'orientation') {
    return 'landscape';
  }
  if (field === 'extension') {
    return 'png';
  }
  if (field === 'mediaType') {
    return 'image';
  }
  if (field === 'rating') {
    return '4';
  }
  return '';
}

function getSmartOperator(field: SmartFolderCondition['field']): SmartFolderCondition['operator'] {
  if (field === 'rating' || field === 'width' || field === 'height' || field === 'recentDays') {
    return '>=';
  }
  if (field === 'memo' || field === 'tag' || field === 'tagExcluded') {
    return 'contains';
  }
  if (field === 'sourceUrl') {
    return 'exists';
  }
  return '=';
}

function getSmartOperatorOptions(field: SmartFolderCondition['field']): SmartFolderCondition['operator'][] {
  switch (field) {
    case 'tag':
    case 'tagExcluded':
      return ['contains', '='];
    case 'rating':
    case 'width':
    case 'height':
    case 'recentDays':
      return ['>=', '='];
    case 'memo':
      return ['contains', 'exists'];
    case 'sourceUrl':
      return ['exists'];
    default:
      return ['='];
  }
}

function defaultSmartValueForField(field: SmartFolderCondition['field'], tagId?: string): SmartFolderCondition['value'] {
  if (field === 'tag' || field === 'tagExcluded') {
    return tagId ?? '';
  }
  return normalizeSmartValue(field, defaultSmartValue(field));
}

function formatSmartFolderQuery(query: SmartFolderQuery, t: TFunction<'common'>): string {
  const firstCondition = query.conditions[0];
  if (!firstCondition) {
    return t('status.none');
  }

  const field = t(`smartFolder.fields.${firstCondition.field}`);
  const operator = t(`smartFolder.operators.${firstCondition.operator}`);
  const value = localizeSmartValue(firstCondition.value, t);

  if (firstCondition.field === 'rating' && firstCondition.operator === '>=') {
    return t('smartFolder.conditionRating', { value });
  }

  const first = t('smartFolder.conditionDefault', { field, operator, value });
  return query.conditions.length > 1
    ? t('smartFolder.conditionSummary', {
        first,
        count: query.conditions.length - 1,
        mode: t(`smartFolder.modes.${query.mode === 'any' ? 'any' : 'all'}`)
      })
    : first;
}

function localizeSmartValue(value: SmartFolderCondition['value'], t: TFunction<'common'>): string {
  if (typeof value === 'boolean') {
    return t(`smartFolder.values.${String(value)}`);
  }
  if (typeof value === 'string' && ['landscape', 'portrait', 'square'].includes(value)) {
    return t(`smartFolder.values.${value}`);
  }
  return String(value);
}

function getViewName(
  state: {
    duplicateOnly: boolean;
    trashOnly: boolean;
    favoriteOnly: boolean;
    tagId: string | null;
    collectionId: string | null;
    smartFolderId: string | null;
  },
  t: TFunction<'common'>
): string {
  if (state.duplicateOnly) {
    return t('sidebar.duplicates');
  }
  if (state.trashOnly) {
    return t('sidebar.trash');
  }
  if (state.favoriteOnly) {
    return t('sidebar.favorites');
  }
  if (state.tagId) {
    return t('sidebar.tags');
  }
  if (state.collectionId) {
    return t('sidebar.collections');
  }
  if (state.smartFolderId) {
    return t('sidebar.smartFolders');
  }
  return t('sidebar.library');
}

function pickRecommendedAsset(assets: AssetRecord[]): AssetRecord | null {
  return [...assets].sort((left, right) => getDuplicateKeepScore(right) - getDuplicateKeepScore(left))[0] ?? null;
}

function getDuplicateKeepScore(asset: AssetRecord): number {
  const importedAtScore = Math.max(0, 4_000_000_000_000 - new Date(asset.importedAt).getTime()) / 1_000_000_000;
  const fileNameScore = Math.max(0, 240 - asset.originalFileName.length) / 10;
  return (
    asset.tags.length * 100_000 +
    asset.collections.length * 10_000 +
    (asset.memo.trim() ? 1_000 : 0) +
    asset.rating * 100 +
    (asset.isFavorite ? 50 : 0) +
    importedAtScore +
    fileNameScore
  );
}

function getRecommendationReason(asset: AssetRecord, groupAssets: AssetRecord[], t: TFunction<'common'>): string {
  const reasons: string[] = [];
  if (asset.tags.length === Math.max(...groupAssets.map((candidate) => candidate.tags.length))) {
    reasons.push(t('duplicates.reasonTags'));
  }
  if (asset.collections.length === Math.max(...groupAssets.map((candidate) => candidate.collections.length))) {
    reasons.push(t('duplicates.reasonCollections'));
  }
  if (asset.memo.trim()) {
    reasons.push(t('duplicates.reasonMemo'));
  }
  if (asset.rating === Math.max(...groupAssets.map((candidate) => candidate.rating))) {
    reasons.push(t('duplicates.reasonRating'));
  }
  if (asset.isFavorite) {
    reasons.push(t('duplicates.reasonFavorite'));
  }
  return reasons.slice(0, 3).join(', ') || t('duplicates.reasonImported');
}

function serializeAssetSort(sort: AssetSort): string {
  return `${sort.field}-${sort.direction}`;
}

function parseAssetSort(value: string): AssetSort {
  return ASSET_SORT_OPTIONS.find((option) => option.id === value)?.sort ?? ASSET_SORT_OPTIONS[0].sort;
}

function toggleSort(current: AssetSort, field: AssetSort['field']): AssetSort {
  if (current.field === field) {
    return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  const defaultDirection: AssetSort['direction'] =
    field === 'title' || field === 'extension' || field === 'collectionOrder' ? 'asc' : 'desc';
  return { field, direction: defaultDirection };
}

function getListColumnDefinition(columnId: ListColumnId): ListColumnDefinition | undefined {
  return LIST_COLUMN_DEFINITIONS.find((column) => column.id === columnId);
}

function readListColumnSettings(): ListColumnSettings {
  const columns = readJsonLocal<Partial<Record<ListColumnId, boolean>>>('listView.columns', {});
  const columnOrder = readJsonLocal<ListColumnId[]>('listView.columnOrder', []);
  const columnWidths = readJsonLocal<Partial<Record<ListColumnId, number>>>('listView.columnWidths', {});
  return normalizeListColumnSettings({
    columns: { ...DEFAULT_LIST_COLUMN_SETTINGS.columns, ...columns },
    columnOrder,
    columnWidths: { ...DEFAULT_LIST_COLUMN_SETTINGS.columnWidths, ...columnWidths }
  });
}

function writeListColumnSettings(settings: ListColumnSettings): void {
  window.localStorage.setItem('listView.columns', JSON.stringify(settings.columns));
  window.localStorage.setItem('listView.columnOrder', JSON.stringify(settings.columnOrder));
  window.localStorage.setItem('listView.columnWidths', JSON.stringify(settings.columnWidths));
}

function normalizeListColumnSettings(settings: ListColumnSettings): ListColumnSettings {
  const columnOrder = [
    ...settings.columnOrder.filter((columnId): columnId is ListColumnId => LIST_COLUMN_IDS.includes(columnId)),
    ...LIST_COLUMN_IDS.filter((columnId) => !settings.columnOrder.includes(columnId))
  ];
  const columns = { ...DEFAULT_LIST_COLUMN_SETTINGS.columns, ...settings.columns };
  if (!Object.values(columns).some(Boolean)) {
    columns.name = true;
  }
  const columnWidths = { ...DEFAULT_LIST_COLUMN_SETTINGS.columnWidths };
  for (const column of LIST_COLUMN_DEFINITIONS) {
    columnWidths[column.id] = clampNumber(settings.columnWidths[column.id] ?? column.defaultWidth, column.minWidth, column.maxWidth);
  }
  return { columns, columnOrder, columnWidths };
}

function readJsonLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().replace(/^\./u, '').toLowerCase())
    .filter(Boolean);
}

function normalizeAssetFilters(filters: AssetFilters): AssetFilters {
  return {
    ...filters,
    extensions: filters.extensions?.filter(Boolean),
    includeTagIds: filters.includeTagIds?.filter(Boolean),
    excludeTagIds: filters.excludeTagIds?.filter(Boolean),
    minRating: typeof filters.minRating === 'number' && filters.minRating > 0 ? filters.minRating : null,
    minWidth: typeof filters.minWidth === 'number' && filters.minWidth > 0 ? filters.minWidth : null,
    minHeight: typeof filters.minHeight === 'number' && filters.minHeight > 0 ? filters.minHeight : null,
    recentDays: typeof filters.recentDays === 'number' && filters.recentDays > 0 ? filters.recentDays : null
  };
}

function countAssetFilters(filters: AssetFilters): number {
  return [
    filters.mediaTypes?.length,
    filters.extensions?.length,
    filters.favoriteOnly,
    filters.minRating,
    filters.includeTagIds?.length,
    filters.excludeTagIds?.length,
    filters.aspect,
    filters.minWidth,
    filters.minHeight,
    filters.hasMemo,
    filters.hasSourceUrl,
    filters.recentDays,
    filters.duplicateOnly,
    filters.deletedOnly
  ].filter(Boolean).length;
}

function formatTagSummary(tags: AssetRecord['tags'], t: TFunction<'common'>): string {
  if (tags.length === 0) {
    return t('status.none');
  }
  const visibleTags = tags.slice(0, 3).map((tag) => tag.name).join(', ');
  const remaining = tags.length - 3;
  return remaining > 0 ? `${visibleTags} ${t('list.moreTags', { count: remaining })}` : visibleTags;
}

function formatDateTime(value: string, language: string): string {
  return new Intl.DateTimeFormat(language.startsWith('en') ? 'en' : 'ko', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatRatio(width: number | null, height: number | null, t: TFunction<'common'>): string {
  if (!width || !height) {
    return t('inspector.unknownRatio');
  }

  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b > 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function fileBaseName(filePath: string): string {
  return filePath.split(/[\\/]/u).pop() ?? filePath;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function isInteractiveElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest('button, input, textarea, select, a, [contenteditable="true"]'));
}

function isAssetTileElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest('[data-asset-tile="true"]'));
}

function getDragSelectionStyle(rect: ClientRectLike): CSSProperties {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  };
}

function getPopoverPosition(rect: DOMRect, width: number, height: number): { top: number; left: number } {
  const margin = 12;
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  return {
    top: Math.min(Math.max(margin, rect.bottom + 8), maxTop),
    left: Math.min(Math.max(margin, rect.left), maxLeft)
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readLayoutNumber(key: string, fallback: number, min: number, max: number): number {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) ? clampNumber(value, min, max) : fallback;
}

type DroppedEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file?: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
  createReader?: () => {
    readEntries: (success: (entries: DroppedEntry[]) => void, error?: (error: DOMException) => void) => void;
  };
};

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => DroppedEntry | null;
};

async function collectDroppedPaths(dataTransfer: DataTransfer): Promise<string[]> {
  const directPaths = Array.from(dataTransfer.files)
    .map((file) => window.refForge.getPathForFile(file))
    .filter(Boolean);
  if (directPaths.length > 0) {
    return directPaths;
  }

  const entryPaths = new Set<string>();
  const entries: DroppedEntry[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    const entry = (item as DataTransferItemWithEntry).webkitGetAsEntry?.() as DroppedEntry | null | undefined;
    if (entry) {
      entries.push(entry);
    }
  }

  for (const entry of entries) {
    const files = await collectEntryFiles(entry);
    for (const file of files) {
      const filePath = window.refForge.getPathForFile(file);
      if (filePath) {
        entryPaths.add(filePath);
      }
    }
  }

  return [...entryPaths];
}

function collectDroppedRootPaths(dataTransfer: DataTransfer): string[] {
  return Array.from(dataTransfer.files)
    .map((file) => window.refForge.getPathForFile(file))
    .filter(Boolean);
}

async function collectEntryFiles(entry: DroppedEntry): Promise<File[]> {
  const fileMethod = entry.file;
  if (entry.isFile && fileMethod) {
    return new Promise((resolve, reject) => {
      fileMethod.call(entry, (file) => resolve([file]), reject);
    });
  }

  if (!entry.isDirectory || !entry.createReader) {
    return [];
  }

  const reader = entry.createReader();
  const files: File[] = [];
  while (true) {
    const entries = await new Promise<DroppedEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (entries.length === 0) {
      break;
    }

    const nestedFiles = await Promise.all(entries.map((nestedEntry) => collectEntryFiles(nestedEntry)));
    files.push(...nestedFiles.flat());
  }

  return files;
}

function formatBytes(bytes: number, language: string): string {
  const locale = language.startsWith('en') ? 'en' : 'ko';
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: bytes < 1024 ? 0 : 1 });
  if (bytes < 1024) {
    return `${formatter.format(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatter.format(bytes / 1024)} KB`;
  }
  return `${formatter.format(bytes / 1024 / 1024)} MB`;
}

function formatDuration(milliseconds: number, language: string, t: TFunction): string {
  const locale = language.startsWith('en') ? 'en' : 'ko';
  const numberFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (milliseconds < 1000) {
    return t('common:format.durationMs', { value: numberFormatter.format(milliseconds) });
  }
  if (milliseconds < 60_000) {
    return t('common:format.durationSeconds', { value: numberFormatter.format(milliseconds / 1000) });
  }
  return t('common:format.durationMinutes', {
    minutes: Math.floor(milliseconds / 60_000),
    seconds: Math.round((milliseconds % 60_000) / 1000)
  });
}
