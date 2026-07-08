/* global console, process */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const releaseDir = path.resolve(repoRoot, args.find((arg) => !arg.startsWith('--')) ?? 'release');
const requireAll = args.includes('--require-all');
const version = String(packageJson.version);
const checksumPath = path.join(releaseDir, `SuwolVisualReference-${version}-checksums.txt`);
const expectedFiles = [
  `SuwolVisualReference-${version}-win-x64.zip`,
  `SuwolVisualReference-${version}-linux-x64.zip`,
  `SuwolVisualReference-${version}-linux-x64.AppImage`,
  'latest-linux.yml',
  `SuwolVisualReference-${version}-mac-arm64.dmg`,
  `SuwolVisualReference-${version}-mac-arm64.zip`,
  'latest-mac.yml'
];
const releaseArtifactPattern = /^([a-fA-F0-9]{64})\s+(.+\.(?:zip|AppImage|deb|rpm|dmg)|latest-(?:linux|mac)\.yml)$/u;

if (!fs.existsSync(checksumPath)) {
  fail(`checksum file does not exist: ${relativePath(checksumPath)}`);
}

const entries = fs
  .readFileSync(checksumPath, 'utf8')
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const match = line.match(releaseArtifactPattern);
    if (!match) {
      fail(`invalid checksum line in ${relativePath(checksumPath)}: ${line}`);
    }
    return { hash: match[1].toLowerCase(), fileName: match[2] };
  });

if (entries.length === 0) {
  fail(`no release artifact entries found in ${relativePath(checksumPath)}`);
}

if (requireAll) {
  for (const fileName of expectedFiles) {
    if (!entries.some((entry) => entry.fileName === fileName)) {
      fail(`missing required checksum entry: ${fileName}`);
    }
  }
}

const seen = new Set();
for (const entry of entries) {
  if (seen.has(entry.fileName)) {
    fail(`duplicate checksum entry: ${entry.fileName}`);
  }
  seen.add(entry.fileName);

  const filePath = path.join(releaseDir, entry.fileName);
  if (!fs.existsSync(filePath)) {
    fail(`checksum entry points to a missing release artifact: ${entry.fileName}`);
  }

  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  if (actualHash !== entry.hash) {
    fail(`hash mismatch: ${entry.fileName} expected ${entry.hash}, got ${actualHash}`);
  }
}

console.log(
  `[verify-checksums] verified ${entries.length} checksum entr${entries.length === 1 ? 'y' : 'ies'} in ${relativePath(
    checksumPath
  )}`
);

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/gu, '/') || filePath;
}

function fail(message) {
  console.error(`[verify-checksums] ${message}`);
  process.exit(1);
}
