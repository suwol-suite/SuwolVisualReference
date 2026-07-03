/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, 'package.json');
const lockPath = path.join(repoRoot, 'package-lock.json');
const noticesPath = path.join(repoRoot, 'THIRD_PARTY_NOTICES.md');
const args = new Set(process.argv.slice(2));

if (!args.has('--write') && !args.has('--check')) {
  console.error('Usage: node scripts/license-report.mjs --write|--check');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const notices = generateNotices(packageJson, lock);

if (args.has('--write')) {
  fs.writeFileSync(noticesPath, notices, 'utf8');
  console.log(`Wrote ${path.relative(repoRoot, noticesPath)}`);
}

if (args.has('--check')) {
  const current = fs.existsSync(noticesPath) ? fs.readFileSync(noticesPath, 'utf8') : '';
  if (normalize(current) !== normalize(notices)) {
    console.error('THIRD_PARTY_NOTICES.md is out of date. Run npm.cmd run license:report.');
    process.exit(1);
  }
  console.log('Third-party notices are up to date.');
}

function generateNotices(rootPackage, lockFile) {
  const directDependencies = new Set(Object.keys(rootPackage.dependencies ?? {}));
  const directDevDependencies = new Set(Object.keys(rootPackage.devDependencies ?? {}));
  const packages = Object.entries(lockFile.packages ?? {})
    .filter(([packagePath]) => packagePath.startsWith('node_modules/'))
    .map(([packagePath, metadata]) => ({
      name: packageNameFromPath(packagePath),
      version: metadata.version ?? 'UNKNOWN',
      license: formatLicense(metadata.license),
      type: dependencyType(packageNameFromPath(packagePath), directDependencies, directDevDependencies)
    }));

  const uniquePackages = [...new Map(packages.map((entry) => [`${entry.name}@${entry.version}`, entry])).values()].sort(
    (left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version)
  );

  return [
    '# Third Party Notices',
    '',
    'This file is generated from package-lock.json by `npm.cmd run license:report`.',
    'It summarizes npm packages bundled for development or runtime use by Suwol Visual Reference.',
    '',
    '| Package | Version | License | Type |',
    '| --- | --- | --- | --- |',
    ...uniquePackages.map((entry) => `| ${escapeCell(entry.name)} | ${escapeCell(entry.version)} | ${escapeCell(entry.license)} | ${entry.type} |`),
    ''
  ].join('\n');
}

function packageNameFromPath(packagePath) {
  const parts = packagePath.split('node_modules/').filter(Boolean);
  return parts[parts.length - 1] ?? packagePath;
}

function dependencyType(name, directDependencies, directDevDependencies) {
  if (directDependencies.has(name)) {
    return 'runtime direct';
  }
  if (directDevDependencies.has(name)) {
    return 'development direct';
  }
  return 'transitive';
}

function formatLicense(license) {
  if (typeof license === 'string' && license.trim()) {
    return license.trim();
  }
  if (license && typeof license === 'object') {
    return JSON.stringify(license);
  }
  return 'UNKNOWN';
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function normalize(value) {
  return value.replace(/\r\n/g, '\n');
}
