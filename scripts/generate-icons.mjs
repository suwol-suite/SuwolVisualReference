/* global console, process */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';

const repoRoot = process.cwd();
const sourcePngPath = path.join(repoRoot, 'assets', 'brand', 'icon-source.png');
const sourceSvgPath = path.join(repoRoot, 'assets', 'brand', 'icon.svg');
const brandDir = path.join(repoRoot, 'assets', 'brand');
const buildDir = path.join(repoRoot, 'build');
const pngSizes = [1024, 512, 256, 128, 64, 48, 32, 16];
const icoSizes = [256, 128, 64, 48, 32, 16];
const icnsTypes = new Map([
  [16, 'icp4'],
  [32, 'icp5'],
  [64, 'icp6'],
  [128, 'ic07'],
  [256, 'ic08'],
  [512, 'ic09'],
  [1024, 'ic10']
]);

const sourceIconPath = (await exists(sourcePngPath)) ? sourcePngPath : sourceSvgPath;
await fs.access(sourceIconPath);
await fs.mkdir(brandDir, { recursive: true });
await fs.mkdir(buildDir, { recursive: true });

const pngBuffers = new Map();
for (const size of pngSizes) {
  const buffer = await renderPng(size);
  pngBuffers.set(size, buffer);
  await fs.writeFile(path.join(brandDir, `icon-${size}.png`), buffer);
}

await fs.writeFile(path.join(buildDir, 'icon.png'), pngBuffers.get(1024));
await fs.writeFile(path.join(buildDir, 'icon.ico'), createIco(icoSizes.map((size) => ({ size, png: pngBuffers.get(size) }))));
await fs.writeFile(
  path.join(buildDir, 'icon.icns'),
  createIcns([...icnsTypes.entries()].map(([size, type]) => ({ type, png: pngBuffers.get(size) })))
);

console.log('Generated brand icons in assets/brand and build.');

async function renderPng(size) {
  const inputOptions = sourceIconPath.endsWith('.svg') ? { density: 384 } : {};
  return sharp(sourceIconPath, inputOptions)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer();
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function createIco(entries) {
  const headerSize = 6;
  const directoryEntrySize = 16;
  let imageOffset = headerSize + directoryEntrySize * entries.length;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(directoryEntrySize * entries.length);
  entries.forEach((entry, index) => {
    const offset = index * directoryEntrySize;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, offset);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, offset + 1);
    directory.writeUInt8(0, offset + 2);
    directory.writeUInt8(0, offset + 3);
    directory.writeUInt16LE(1, offset + 4);
    directory.writeUInt16LE(32, offset + 6);
    directory.writeUInt32LE(entry.png.length, offset + 8);
    directory.writeUInt32LE(imageOffset, offset + 12);
    imageOffset += entry.png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

function createIcns(entries) {
  const chunks = entries.map((entry) => {
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(entry.type, 0, 4, 'ascii');
    chunkHeader.writeUInt32BE(entry.png.length + 8, 4);
    return Buffer.concat([chunkHeader, entry.png]);
  });
  const totalLength = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(totalLength, 4);
  return Buffer.concat([header, ...chunks]);
}
