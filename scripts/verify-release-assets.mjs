/* global console, process */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const releaseDir = path.resolve(repoRoot, args.find((arg) => !arg.startsWith('--')) ?? 'release');
const requireAll = args.includes('--require-all');
const allowMissingLinux = args.includes('--allow-missing-linux') || (!requireAll && process.platform === 'win32');
const allowMissingWindows = args.includes('--allow-missing-windows') || (!requireAll && process.platform === 'linux');
const version = String(packageJson.version);
const expectedAssets = [
  {
    platform: 'win',
    fileName: `SuwolVisualReference-${version}-win-x64.zip`,
    required: requireAll || !allowMissingWindows,
    kind: 'archive'
  },
  {
    platform: 'linux',
    fileName: `SuwolVisualReference-${version}-linux-x64.zip`,
    required: requireAll || !allowMissingLinux,
    kind: 'archive'
  },
  {
    platform: 'linux',
    fileName: `SuwolVisualReference-${version}-linux-x64.AppImage`,
    required: requireAll || !allowMissingLinux,
    kind: 'appimage'
  },
  {
    platform: 'linux',
    fileName: 'latest-linux.yml',
    required: requireAll || !allowMissingLinux,
    kind: 'update-metadata'
  }
];

if (!fs.existsSync(releaseDir)) {
  fail(`release directory does not exist: ${relativePath(releaseDir)}`);
}

const checksumPath = path.join(releaseDir, `SuwolVisualReference-${version}-checksums.txt`);
const plainChecksumPath = path.join(releaseDir, 'checksums.txt');
requireNonEmptyFile(checksumPath, 'versioned checksum file');
requireNonEmptyFile(plainChecksumPath, 'generic checksum file');

const versionedChecksums = parseChecksums(checksumPath);
const plainChecksums = parseChecksums(plainChecksumPath);
if (JSON.stringify(versionedChecksums) !== JSON.stringify(plainChecksums)) {
  fail('checksums.txt and versioned checksums file differ.');
}

let verifiedCount = 0;
for (const asset of expectedAssets) {
  const assetPath = path.join(releaseDir, asset.fileName);
  if (!fs.existsSync(assetPath)) {
    if (asset.required) {
      fail(`missing required release asset: ${asset.fileName}`);
    }
    console.warn(
      `[verify-release-assets] skipping missing optional ${asset.platform} asset: ${asset.fileName} (use --require-all to require it)`
    );
    continue;
  }

  requireNonEmptyFile(assetPath, asset.kind);
  assertSafeReleaseFileName(asset.fileName);
  verifyChecksumEntry(asset.fileName, versionedChecksums);
  if (asset.kind === 'update-metadata') {
    verifyLatestLinuxMetadata(assetPath);
  }
  verifiedCount += 1;
}

if (verifiedCount === 0) {
  fail(`no release assets were verified in ${relativePath(releaseDir)}`);
}

console.log(`[verify-release-assets] verified ${verifiedCount} release asset${verifiedCount === 1 ? '' : 's'}.`);

function parseChecksums(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([a-fA-F0-9]{64})\s+(.+)$/u.exec(line);
      if (!match) {
        fail(`invalid checksum line in ${relativePath(filePath)}: ${line}`);
      }
      return { hash: match[1].toLowerCase(), fileName: match[2] };
    });
}

function verifyChecksumEntry(fileName, checksums) {
  const matches = checksums.filter((entry) => entry.fileName === fileName);
  if (matches.length !== 1) {
    fail(`expected exactly one checksum entry for ${fileName}, found ${matches.length}`);
  }

  const filePath = path.join(releaseDir, fileName);
  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  if (actualHash !== matches[0].hash) {
    fail(`hash mismatch: ${fileName} expected ${matches[0].hash}, got ${actualHash}`);
  }
}

function verifyLatestLinuxMetadata(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  requireYamlField(text, 'version', version);
  requireYamlField(text, 'path', `SuwolVisualReference-${version}-linux-x64.AppImage`);
  requireYamlField(text, 'sha512');
}

function requireYamlField(text, fieldName, expectedValue) {
  const pattern = new RegExp(`^${escapeRegExp(fieldName)}:\\s*(.+)$`, 'mu');
  const match = pattern.exec(text);
  if (!match || match[1].trim().length === 0) {
    fail(`latest-linux.yml is missing ${fieldName}`);
  }
  if (expectedValue && match[1].trim().replace(/^['"]|['"]$/gu, '') !== expectedValue) {
    fail(`latest-linux.yml ${fieldName} mismatch: expected ${expectedValue}, got ${match[1].trim()}`);
  }
}

function requireNonEmptyFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`missing ${label}: ${relativePath(filePath)}`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    fail(`${label} is not a file: ${relativePath(filePath)}`);
  }
  if (stat.size <= 0) {
    fail(`${label} is empty: ${relativePath(filePath)}`);
  }
}

function assertSafeReleaseFileName(fileName) {
  const normalized = fileName.replace(/\\/gu, '/');
  const baseName = normalized.split('/').filter(Boolean).at(-1) ?? normalized;
  if (normalized.includes('/') || normalized.includes('..')) {
    fail(`release asset must be a top-level file: ${fileName}`);
  }
  if (
    baseName === '.env' ||
    baseName.startsWith('.env.') ||
    /(?:private|revocation|passphrase|secret)/iu.test(baseName) ||
    /\.(sqlite(?:[-.]|$)|pem$|p12$|pfx$|key$|crt$|cer$|jks$|keystore$|token$)/u.test(baseName)
  ) {
    fail(`forbidden release asset name: ${fileName}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/gu, '/') || filePath;
}

function fail(message) {
  console.error(`[verify-release-assets] ${message}`);
  process.exit(1);
}
