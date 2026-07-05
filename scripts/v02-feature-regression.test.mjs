/* global console, process */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const appSource = readText('src/renderer/src/App.tsx');
const dbSource = readText('src/main/services/db-service.ts');
const exportSource = readText('src/main/services/export-service.ts');
const enCommon = readJson('src/renderer/src/locales/en/common.json');
const koCommon = readJson('src/renderer/src/locales/ko/common.json');
const enExport = readJson('src/renderer/src/locales/en/export.json');
const koExport = readJson('src/renderer/src/locales/ko/export.json');

assert.match(appSource, /const DEFAULT_COLOR_TOLERANCE = 48;/u);
assert.match(appSource, /const DEFAULT_COLOR_MIN_RATIO = 0\.02;/u);
assert.match(appSource, /options\.gifPlaying \? asset\.storedFileUrl/u);
assert.doesNotMatch(appSource, /dangerouslySetInnerHTML/u, 'renderer must not inline raw SVG content');

assert.match(dbSource, /colorDistanceSquared = tolerance \* tolerance/u);
assert.match(dbSource, /\(color_filter\.red - @colorRed\) \* \(color_filter\.red - @colorRed\)/u);
assert.doesNotMatch(dbSource, /\s\^\s/u, 'SQLite color distance must not use ^');

for (const placeholder of ['collectionName', 'assetCount', 'sourceUrls', 'fileTable']) {
  assert.match(exportSource, new RegExp(`${placeholder}:`, 'u'));
}

for (const locale of [enCommon, koCommon]) {
  assert.equal(locale.viewer.playGif.length > 0, true);
  assert.equal(locale.viewer.videoPlaceholderDescription.length > 0, true);
  assert.equal(locale.filter.colorMinRatio.length > 0, true);
  assert.equal(locale.media.type.video, 'VIDEO');
}

for (const locale of [enExport, koExport]) {
  assert.equal(locale.availablePlaceholders.length > 0, true);
  assert.equal(locale.defaultFields.applyInstructions.length > 0, true);
  assert.equal(locale.validationEnabledSectionRequired.length > 0, true);
}

console.log('[v0.2 feature regression] all checks passed');

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}
