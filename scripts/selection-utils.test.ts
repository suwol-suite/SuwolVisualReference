import assert from 'node:assert/strict';
import {
  filterLoadedSelection,
  getClientSelectionRect,
  getDragSelectedIds,
  getNextAssetSelection,
  getSelectAllSelection,
  rectsIntersect
} from '../src/renderer/src/selection-utils';

const orderedAssetIds = ['a', 'b', 'c', 'd', 'e'];

assert.deepEqual(getNextAssetSelection({ orderedAssetIds, selectedIds: [], activeAssetId: null, selectionAnchorId: null }, 'c'), {
  selectedIds: ['c'],
  activeAssetId: 'c',
  selectionAnchorId: 'c'
});

assert.deepEqual(
  getNextAssetSelection(
    { orderedAssetIds, selectedIds: ['b'], activeAssetId: 'b', selectionAnchorId: 'b' },
    'd',
    'range'
  ),
  {
    selectedIds: ['b', 'c', 'd'],
    activeAssetId: 'd',
    selectionAnchorId: 'b'
  }
);

assert.deepEqual(
  getNextAssetSelection(
    { orderedAssetIds, selectedIds: ['b', 'd'], activeAssetId: 'd', selectionAnchorId: 'd' },
    'b',
    'toggle'
  ),
  {
    selectedIds: ['d'],
    activeAssetId: 'b',
    selectionAnchorId: 'b'
  }
);

assert.deepEqual(getSelectAllSelection(['a', 'a', 'b']), {
  selectedIds: ['a', 'b'],
  activeAssetId: 'a',
  selectionAnchorId: 'a'
});

assert.deepEqual(filterLoadedSelection(['c', 'missing', 'a', 'c'], orderedAssetIds), ['c', 'a']);
assert.deepEqual(
  getDragSelectedIds({
    orderedAssetIds,
    initialSelectedIds: ['a', 'missing'],
    hitAssetIds: ['b', 'd', 'missing'],
    additive: true
  }),
  ['a', 'b', 'd']
);
assert.deepEqual(
  getDragSelectedIds({
    orderedAssetIds,
    initialSelectedIds: ['a'],
    hitAssetIds: ['e', 'c'],
    additive: false
  }),
  ['e', 'c']
);

const selectionRect = getClientSelectionRect({
  startX: 20,
  startY: 45,
  currentX: 5,
  currentY: 10,
  initialSelectedIds: [],
  additive: false
});
assert.deepEqual(selectionRect, { left: 5, top: 10, right: 20, bottom: 45, width: 15, height: 35 });
assert.equal(rectsIntersect(selectionRect, { left: 10, top: 20, right: 30, bottom: 50, width: 20, height: 30 }), true);
assert.equal(rectsIntersect(selectionRect, { left: 21, top: 20, right: 30, bottom: 50, width: 9, height: 30 }), false);

console.log('[selection-utils] all checks passed');
