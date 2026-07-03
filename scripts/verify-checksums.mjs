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
  `SuwolVisualReference-${version}-linux-x64.zip`
];

if (!fs.existsSync(checksumPath)) {
  fail(`Checksum file does not exist: ${path.relative(repoRoot, checksumPath)}`);
}

const entries = fs
  .readFileSync(checksumPath, 'utf8')
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^([a-fA-F0-9]{64})\s+(.+\.zip)$/u);
    if (!match) {
      fail(`Invalid checksum line: ${line}`);
    }
    return { hash: match[1].toLowerCase(), fileName: match[2] };
  });

if (entries.length === 0) {
  fail(`No ZIP entries found in ${path.relative(repoRoot, checksumPath)}`);
}

if (requireAll) {
  for (const fileName of expectedFiles) {
    if (!entries.some((entry) => entry.fileName === fileName)) {
      fail(`Missing required checksum entry: ${fileName}`);
    }
  }
}

const seen = new Set();
for (const entry of entries) {
  if (seen.has(entry.fileName)) {
    fail(`Duplicate checksum entry: ${entry.fileName}`);
  }
  seen.add(entry.fileName);

  const filePath = path.join(releaseDir, entry.fileName);
  if (!fs.existsSync(filePath)) {
    fail(`Checksum entry points to a missing ZIP: ${entry.fileName}`);
  }

  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  if (actualHash !== entry.hash) {
    fail(`Checksum mismatch for ${entry.fileName}: expected ${entry.hash}, got ${actualHash}`);
  }
}

console.log(`Verified ${entries.length} checksum entr${entries.length === 1 ? 'y' : 'ies'} in ${path.relative(repoRoot, checksumPath)}`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
