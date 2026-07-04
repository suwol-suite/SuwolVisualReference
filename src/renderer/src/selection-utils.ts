export type SelectionMode = 'replace' | 'toggle' | 'range';

export type AssetSelectionState = {
  orderedAssetIds: string[];
  selectedIds: string[];
  activeAssetId: string | null;
  selectionAnchorId: string | null;
};

export type AssetSelectionResult = {
  selectedIds: string[];
  activeAssetId: string | null;
  selectionAnchorId: string | null;
};

export type DragSelectionState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  initialSelectedIds: string[];
  additive: boolean;
};

export type ClientRectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export function getNextAssetSelection(
  state: AssetSelectionState,
  assetId: string,
  mode: SelectionMode = 'replace'
): AssetSelectionResult {
  if (mode === 'range') {
    const anchorId = state.selectionAnchorId ?? state.activeAssetId ?? state.selectedIds[0] ?? assetId;
    const anchorIndex = state.orderedAssetIds.indexOf(anchorId);
    const targetIndex = state.orderedAssetIds.indexOf(assetId);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      return {
        selectedIds: state.orderedAssetIds.slice(start, end + 1),
        activeAssetId: assetId,
        selectionAnchorId: anchorId
      };
    }
  }

  if (mode === 'toggle') {
    const selectedIds = state.selectedIds.includes(assetId)
      ? state.selectedIds.filter((id) => id !== assetId)
      : [...state.selectedIds, assetId];
    return {
      selectedIds: uniqueStrings(selectedIds),
      activeAssetId: assetId,
      selectionAnchorId: assetId
    };
  }

  return {
    selectedIds: [assetId],
    activeAssetId: assetId,
    selectionAnchorId: assetId
  };
}

export function getSelectAllSelection(orderedAssetIds: string[]): AssetSelectionResult {
  const selectedIds = uniqueStrings(orderedAssetIds);
  return {
    selectedIds,
    activeAssetId: selectedIds[0] ?? null,
    selectionAnchorId: selectedIds[0] ?? null
  };
}

export function filterLoadedSelection(assetIds: string[], loadedAssetIds: string[]): string[] {
  const loadedIds = new Set(loadedAssetIds);
  return uniqueStrings(assetIds).filter((assetId) => loadedIds.has(assetId));
}

export function getDragSelectedIds({
  orderedAssetIds,
  initialSelectedIds,
  hitAssetIds,
  additive
}: {
  orderedAssetIds: string[];
  initialSelectedIds: string[];
  hitAssetIds: string[];
  additive: boolean;
}): string[] {
  const orderedIds = new Set(orderedAssetIds);
  const validHitIds = hitAssetIds.filter((assetId) => orderedIds.has(assetId));
  if (!additive) {
    return uniqueStrings(validHitIds);
  }
  return uniqueStrings([...initialSelectedIds.filter((assetId) => orderedIds.has(assetId)), ...validHitIds]);
}

export function getClientSelectionRect(selection: DragSelectionState): ClientRectLike {
  const left = Math.min(selection.startX, selection.currentX);
  const top = Math.min(selection.startY, selection.currentY);
  const right = Math.max(selection.startX, selection.currentX);
  const bottom = Math.max(selection.startY, selection.currentY);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

export function rectsIntersect(left: ClientRectLike, right: ClientRectLike): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
