/* global console, process */

import asar from '@electron/asar';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const repoRoot = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const releaseDir = path.resolve(repoRoot, args.find((arg) => !arg.startsWith('--')) ?? 'release');
const requireAll = args.includes('--require-all');
const allowMissingLinux = args.includes('--allow-missing-linux') || (!requireAll && process.platform === 'win32');
const allowMissingWindows = args.includes('--allow-missing-windows') || (!requireAll && process.platform === 'linux');
const version = String(packageJson.version);
const expectedArtifacts = [
  {
    platform: 'win',
    fileName: `SuwolVisualReference-${version}-win-x64.zip`,
    required: requireAll || !allowMissingWindows,
    executableNames: ['Suwol Visual Reference.exe'],
    iconNames: ['resources/build/icon.ico', 'resources/build/icon.png']
  },
  {
    platform: 'linux',
    fileName: `SuwolVisualReference-${version}-linux-x64.zip`,
    required: requireAll || !allowMissingLinux,
    executableNames: ['Suwol Visual Reference', 'suwol-visual-reference', 'SuwolVisualReference'],
    iconNames: ['resources/build/icon.png']
  }
];

let verifiedCount = 0;
for (const artifact of expectedArtifacts) {
  const zipPath = path.join(releaseDir, artifact.fileName);
  if (!fs.existsSync(zipPath)) {
    if (artifact.required) {
      fail(`Missing required release ZIP: ${path.relative(repoRoot, zipPath)}`);
    }
    console.warn(`Skipping missing optional ${artifact.platform} ZIP: ${artifact.fileName}`);
    continue;
  }

  verifyArtifact(zipPath, artifact);
  verifiedCount += 1;
}

if (verifiedCount === 0) {
  fail(`No release ZIP files were verified in ${path.relative(repoRoot, releaseDir)}`);
}

console.log(`Verified ${verifiedCount} release ZIP artifact${verifiedCount === 1 ? '' : 's'}.`);

function verifyArtifact(zipPath, artifact) {
  const stat = fs.statSync(zipPath);
  if (stat.size <= 0) {
    fail(`Release ZIP is empty: ${path.relative(repoRoot, zipPath)}`);
  }

  const entries = readZipEntries(zipPath);
  const entryNames = entries.map((entry) => normalizeZipName(entry.name));
  const entrySet = new Set(entryNames);

  requireAny(entrySet, artifact.executableNames, `${artifact.platform} executable`);
  requireEntry(entrySet, 'resources/app.asar', 'packaged app.asar');
  for (const iconName of artifact.iconNames) {
    requireEntry(entrySet, iconName, `${artifact.platform} icon resource`);
  }

  const forbidden = entryNames.filter((entryName) => isForbiddenEntry(entryName));
  if (forbidden.length > 0) {
    fail(`Forbidden paths found in ${artifact.fileName}:\n${forbidden.slice(0, 20).join('\n')}`);
  }

  verifyAsarContents(zipPath, entries, artifact.fileName);
  console.log(`Verified ${artifact.fileName}`);
}

function verifyAsarContents(zipPath, entries, fileName) {
  const appAsar = entries.find((entry) => normalizeZipName(entry.name) === 'resources/app.asar');
  if (!appAsar) {
    fail(`Missing resources/app.asar in ${fileName}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suwol-release-zip-'));
  const tempAsar = path.join(tempDir, 'app.asar');
  try {
    fs.writeFileSync(tempAsar, extractZipEntry(zipPath, appAsar));
    const asarEntries = asar.listPackage(tempAsar).map((entry) => normalizeAsarName(entry));
    const asarSet = new Set(asarEntries);
    requireEntry(asarSet, 'LICENSE', 'Apache-2.0 license in app.asar');
    requireEntry(asarSet, 'THIRD_PARTY_NOTICES.md', 'third-party notices in app.asar');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function readZipEntries(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      fail(`Invalid ZIP central directory signature in ${path.relative(repoRoot, zipPath)}`);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const name = buffer.toString('utf8', nameStart, nameStart + fileNameLength);

    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset = nameStart + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function extractZipEntry(zipPath, entry) {
  const buffer = fs.readFileSync(zipPath);
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    fail(`Invalid local ZIP header for ${entry.name}`);
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressed;
  }
  if (entry.compressionMethod === 8) {
    const inflated = zlib.inflateRawSync(compressed);
    if (inflated.length !== entry.uncompressedSize) {
      fail(`Unexpected uncompressed size for ${entry.name}`);
    }
    return inflated;
  }

  fail(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}`);
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }
  fail('Could not find ZIP end of central directory record.');
}

function requireEntry(entrySet, name, label) {
  if (!entrySet.has(normalizeZipName(name))) {
    fail(`Missing ${label}: ${name}`);
  }
}

function requireAny(entrySet, names, label) {
  if (!names.some((name) => entrySet.has(normalizeZipName(name)))) {
    fail(`Missing ${label}. Tried: ${names.join(', ')}`);
  }
}

function normalizeZipName(name) {
  return name.replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/\/+$/u, '');
}

function normalizeAsarName(name) {
  return normalizeZipName(name).replace(/^\/+/u, '');
}

function isForbiddenEntry(entryName) {
  const lowerName = entryName.toLowerCase();
  const baseName = lowerName.split('/').filter(Boolean).at(-1) ?? lowerName;

  if (
    lowerName.startsWith('.test-libraries/') ||
    lowerName.includes('/.test-libraries/') ||
    lowerName.startsWith('.codex-run/') ||
    lowerName.includes('/.codex-run/') ||
    lowerName.startsWith('c/data/') ||
    lowerName.includes('c:/data/') ||
    lowerName.startsWith('assets/originals/') ||
    lowerName.includes('/assets/originals/') ||
    lowerName.startsWith('assets/thumbnails/') ||
    lowerName.includes('/assets/thumbnails/') ||
    lowerName.startsWith('assets/previews/') ||
    lowerName.includes('/assets/previews/') ||
    lowerName.startsWith('exports/') ||
    lowerName.includes('/exports/') ||
    lowerName.startsWith('backups/') ||
    lowerName.includes('/backups/') ||
    lowerName === 'node_modules' ||
    lowerName.startsWith('node_modules/')
  ) {
    return true;
  }

  if (
    baseName === '.env' ||
    baseName.startsWith('.env.') ||
    baseName === 'id_rsa' ||
    /\.(sqlite(?:[-.]|$)|pem$|p12$|pfx$|key$|crt$|cer$|jks$|keystore$|token$)/u.test(baseName)
  ) {
    return true;
  }

  return false;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
