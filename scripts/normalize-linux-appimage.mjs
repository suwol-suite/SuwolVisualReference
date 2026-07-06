/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const releaseDir = path.resolve(repoRoot, args.find((arg) => !arg.startsWith('--')) ?? 'release');
const requireAppImage = args.includes('--require');
const version = String(packageJson.version);
const canonicalName = `SuwolVisualReference-${version}-linux-x64.AppImage`;
const electronBuilderName = `SuwolVisualReference-${version}-linux-x86_64.AppImage`;
const canonicalPath = path.join(releaseDir, canonicalName);
const electronBuilderPath = path.join(releaseDir, electronBuilderName);
const latestLinuxPath = path.join(releaseDir, 'latest-linux.yml');

if (!fs.existsSync(releaseDir)) {
  fail(`release directory does not exist: ${relativePath(releaseDir)}`);
}

if (fs.existsSync(electronBuilderPath) && !fs.existsSync(canonicalPath)) {
  fs.renameSync(electronBuilderPath, canonicalPath);
  console.log(`[normalize-linux-appimage] renamed ${electronBuilderName} to ${canonicalName}`);
}

if (!fs.existsSync(canonicalPath)) {
  if (requireAppImage) {
    fail(`missing required AppImage: ${canonicalName}`);
  }
  console.warn(`[normalize-linux-appimage] skipping: ${canonicalName} not found`);
  process.exit(0);
}

if (!fs.existsSync(latestLinuxPath)) {
  if (requireAppImage) {
    fail(`missing required update metadata: ${relativePath(latestLinuxPath)}`);
  }
  console.warn('[normalize-linux-appimage] skipping metadata update: latest-linux.yml not found');
  process.exit(0);
}

const originalMetadata = fs.readFileSync(latestLinuxPath, 'utf8');
const normalizedMetadata = originalMetadata.replaceAll(electronBuilderName, canonicalName);
if (normalizedMetadata !== originalMetadata) {
  fs.writeFileSync(latestLinuxPath, normalizedMetadata, 'utf8');
  console.log('[normalize-linux-appimage] updated latest-linux.yml AppImage path');
}

if (normalizedMetadata.includes(electronBuilderName)) {
  fail(`latest-linux.yml still references ${electronBuilderName}`);
}

console.log(`[normalize-linux-appimage] verified ${canonicalName}`);

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/gu, '/') || filePath;
}

function fail(message) {
  console.error(`[normalize-linux-appimage] ${message}`);
  process.exit(1);
}
