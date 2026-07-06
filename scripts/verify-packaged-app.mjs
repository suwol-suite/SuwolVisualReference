/* global console, process */

import asar from '@electron/asar';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const releaseDir = path.resolve(repoRoot, args.find((arg) => !arg.startsWith('--')) ?? 'release');
const requireAll = args.includes('--require-all');
const skipRun = args.includes('--skip-run');
const platformFilter = getFlagValue('--platform');
const version = String(packageJson.version);
const packageName = String(packageJson.name);
const productName = String(packageJson.build?.productName ?? 'Suwol Visual Reference');
const currentPlatform = process.platform === 'win32' ? 'win' : process.platform === 'linux' ? 'linux' : process.platform;

if (platformFilter && !['win', 'linux'].includes(platformFilter)) {
  fail(`unsupported --platform value: ${platformFilter}`);
}

const targets = [
  {
    platform: 'win',
    unpackedDir: 'win-unpacked',
    executableNames: [`${productName}.exe`],
    iconNames: ['resources/build/icon.ico', 'resources/build/icon.png']
  },
  {
    platform: 'linux',
    unpackedDir: 'linux-unpacked',
    executableNames: [productName, packageName, 'suwol-visual-reference', 'SuwolVisualReference'],
    iconNames: ['resources/build/icon.png']
  }
].filter((target) => !platformFilter || target.platform === platformFilter);

let verifiedCount = 0;
for (const target of targets) {
  const unpackedPath = path.join(releaseDir, target.unpackedDir);
  const required = requireAll || platformFilter === target.platform || (!platformFilter && currentPlatform === target.platform);

  if (!fs.existsSync(unpackedPath)) {
    if (required) {
      fail(`missing required packaged app directory: ${relativePath(unpackedPath)}`);
    }
    console.warn(`[verify-packaged-app] skipping missing optional ${target.platform} package: ${target.unpackedDir}`);
    continue;
  }

  verifyUnpackedApp(unpackedPath, target);
  verifiedCount += 1;
}

if (verifiedCount === 0) {
  fail(`no packaged app directories were verified in ${relativePath(releaseDir)}`);
}

console.log(`[verify-packaged-app] verified ${verifiedCount} packaged app${verifiedCount === 1 ? '' : 's'}.`);

function verifyUnpackedApp(unpackedPath, target) {
  const rootStat = fs.statSync(unpackedPath);
  if (!rootStat.isDirectory()) {
    fail(`packaged app path is not a directory: ${relativePath(unpackedPath)}`);
  }

  const executablePath = requireAnyFile(unpackedPath, target.executableNames, `${target.platform} executable`);
  requireNonEmptyFile(executablePath, `${target.platform} executable`);
  const appAsarPath = path.join(unpackedPath, 'resources', 'app.asar');
  requireNonEmptyFile(appAsarPath, 'resources/app.asar');
  requireAnyFile(unpackedPath, target.iconNames, `${target.platform} icon resource`);

  const forbiddenPaths = collectForbiddenPaths(unpackedPath);
  if (forbiddenPaths.length > 0) {
    fail(
      `forbidden file found in ${target.unpackedDir}: ${forbiddenPaths
        .slice(0, 20)
        .map((filePath) => relativePath(filePath))
        .join(', ')}`
    );
  }

  verifyAsarMetadata(appAsarPath, target.unpackedDir);
  if (!skipRun && currentPlatform === target.platform) {
    verifyExecutableVersion(executablePath, target);
  }

  console.log(`[verify-packaged-app] verified ${target.unpackedDir}`);
}

function verifyAsarMetadata(appAsarPath, label) {
  const asarEntries = asar.listPackage(appAsarPath).map((entry) => normalizeAsarName(entry));
  const asarSet = new Set(asarEntries);
  requireAsarEntry(asarSet, 'package.json', label);
  requireAsarEntry(asarSet, 'LICENSE', label);
  requireAsarEntry(asarSet, 'THIRD_PARTY_NOTICES.md', label);

  const metadata = JSON.parse(asar.extractFile(appAsarPath, 'package.json').toString('utf8'));
  if (metadata.name !== packageName) {
    fail(`package name mismatch in ${label}: expected ${packageName}, got ${metadata.name ?? '<missing>'}`);
  }
  if (metadata.version !== version) {
    fail(`package version mismatch in ${label}: expected ${version}, got ${metadata.version ?? '<missing>'}`);
  }
}

function verifyExecutableVersion(executablePath, target) {
  const baseArgs = ['--version'];
  const runArgs = target.platform === 'linux' ? ['--no-sandbox', ...baseArgs] : baseArgs;
  const runEnv = {
    ...process.env,
    ...(target.platform === 'linux' ? { ELECTRON_DISABLE_SANDBOX: '1' } : {})
  };
  const result = spawnSync(executablePath, runArgs, {
    cwd: path.dirname(executablePath),
    encoding: 'utf8',
    env: runEnv,
    timeout: 15_000,
    windowsHide: true
  });
  if (result.error) {
    fail(formatRunFailure(target, executablePath, runArgs, result, result.error.message));
  }
  if (result.status !== 0) {
    fail(formatRunFailure(target, executablePath, runArgs, result));
  }

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (!output.includes(version)) {
    fail(
      `${target.unpackedDir} ${runArgs.join(' ')} did not print ${version}. Output: ${stringifyOutput(output)}`
    );
  }
}

function requireAnyFile(rootPath, names, label) {
  for (const name of names) {
    const filePath = path.join(rootPath, name);
    if (fs.existsSync(filePath)) {
      requireNonEmptyFile(filePath, label);
      return filePath;
    }
  }
    fail(`missing ${label}. Tried: ${names.join(', ')}`);
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

function requireAsarEntry(entrySet, name, label) {
  if (!entrySet.has(normalizeAsarName(name))) {
    fail(`missing ${name} in app.asar for ${label}`);
  }
}

function collectForbiddenPaths(rootPath) {
  const forbiddenPaths = [];
  const pending = [rootPath];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    if (!currentPath) {
      continue;
    }

    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      const relative = normalizePath(path.relative(rootPath, entryPath));
      if (isForbiddenEntry(relative)) {
        forbiddenPaths.push(entryPath);
        continue;
      }
      if (entry.isDirectory()) {
        pending.push(entryPath);
      }
    }
  }
  return forbiddenPaths;
}

function isForbiddenEntry(entryName) {
  const lowerName = normalizePath(entryName).toLowerCase();
  const segments = lowerName.split('/').filter(Boolean);
  const baseName = segments.at(-1) ?? lowerName;

  if (
    segments.includes('.test-libraries') ||
    segments.includes('.codex-run') ||
    lowerName.startsWith('assets/originals/') ||
    lowerName.includes('/assets/originals/') ||
    lowerName.startsWith('assets/thumbnails/') ||
    lowerName.includes('/assets/thumbnails/') ||
    lowerName.startsWith('assets/previews/') ||
    lowerName.includes('/assets/previews/') ||
    lowerName.startsWith('exports/') ||
    lowerName.includes('/exports/') ||
    lowerName.startsWith('backups/') ||
    lowerName.includes('/backups/')
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

function getFlagValue(name) {
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function stringifyOutput(output) {
  const text = String(output ?? '').trim();
  return text.length > 0 ? text : '<empty>';
}

function formatRunFailure(target, executablePath, runArgs, result, errorMessage = null) {
  return [
    `could not verify packaged executable for ${target.platform}`,
    `path: ${relativePath(executablePath)}`,
    `args: ${runArgs.join(' ')}`,
    `exit code: ${result.status ?? '<none>'}`,
    `error: ${errorMessage ?? '<none>'}`,
    `stdout: ${stringifyOutput(result.stdout).slice(0, 1000)}`,
    `stderr: ${stringifyOutput(result.stderr).slice(0, 1000)}`
  ].join('\n');
}

function normalizeAsarName(name) {
  return normalizePath(name).replace(/^\/+/u, '');
}

function normalizePath(name) {
  return name.replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/\/+$/u, '');
}

function relativePath(filePath) {
  return normalizePath(path.relative(repoRoot, filePath) || filePath);
}

function fail(message) {
  console.error(`[verify-packaged-app] ${message}`);
  process.exit(1);
}
