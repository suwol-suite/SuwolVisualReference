/* global console, process */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const releaseDir = path.resolve(repoRoot, process.argv[2] ?? 'release');
const version = String(packageJson.version);
const artifactPrefix = `SuwolVisualReference-${version}-`;
const checksumPath = path.join(releaseDir, `SuwolVisualReference-${version}-checksums.txt`);
const plainChecksumPath = path.join(releaseDir, 'checksums.txt');
const releaseArtifactPattern = /\.(?:zip|AppImage|deb|rpm)$/u;

if (!fs.existsSync(releaseDir)) {
  console.error(`Release directory does not exist: ${path.relative(repoRoot, releaseDir)}`);
  process.exit(1);
}

const artifactFiles = fs
  .readdirSync(releaseDir)
  .filter(
    (fileName) => (fileName.startsWith(artifactPrefix) && releaseArtifactPattern.test(fileName)) || fileName === 'latest-linux.yml'
  )
  .sort((left, right) => left.localeCompare(right));

if (artifactFiles.length === 0) {
  console.error(`No release artifact files found in ${path.relative(repoRoot, releaseDir)}`);
  process.exit(1);
}

const lines = artifactFiles.map((fileName) => {
  const filePath = path.join(releaseDir, fileName);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  return `${hash}  ${fileName}`;
});

fs.writeFileSync(checksumPath, `${lines.join('\n')}\n`, 'utf8');
fs.writeFileSync(plainChecksumPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${path.relative(repoRoot, checksumPath)}`);
console.log(`Wrote ${path.relative(repoRoot, plainChecksumPath)}`);
