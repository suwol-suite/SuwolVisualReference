/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const appPath = path.resolve(repoRoot, args.find((arg) => !arg.startsWith('--')) ?? '');
const identity = process.env.CSC_NAME || process.env.MAC_CODESIGN_IDENTITY || findDeveloperIdIdentity();
const entitlements = path.join(repoRoot, 'build', 'entitlements.mac.inherit.plist');

if (!appPath || !fs.existsSync(appPath)) {
  fail(`missing .app path: ${appPath || '<empty>'}`);
}
if (!identity) {
  fail('CSC_NAME, MAC_CODESIGN_IDENTITY, or a Developer ID Application keychain identity is required');
}

const nativeFiles = collectNativeFiles(appPath);
let signedCount = 0;
for (const filePath of nativeFiles) {
  if (isValidSignature(filePath)) {
    continue;
  }
  sign(filePath);
  signedCount += 1;
}

if (!isValidSignature(appPath)) {
  sign(appPath);
  signedCount += 1;
}

run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
console.log(`[resign-mac-app] signed ${signedCount} item${signedCount === 1 ? '' : 's'} in ${relativePath(appPath)}.`);

function collectNativeFiles(rootPath) {
  const files = [];
  const pending = [rootPath];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (/\.(?:node|dylib)$/u.test(entry.name)) {
        files.push(entryPath);
      }
    }
  }
  return files.sort();
}

function isValidSignature(filePath) {
  const result = spawnSync('codesign', ['--verify', '--strict', '--verbose=2', filePath], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return result.status === 0;
}

function findDeveloperIdIdentity() {
  const result = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    return '';
  }
  const developerIdLine = result.stdout
    .split(/\r?\n/u)
    .find((line) => line.includes('Developer ID Application:'));
  const match = developerIdLine?.match(/"([^"]+)"/u);
  return match?.[1] ?? '';
}

function sign(filePath) {
  run('codesign', [
    '--force',
    '--sign',
    identity,
    '--timestamp',
    '--options',
    'runtime',
    '--entitlements',
    entitlements,
    filePath
  ]);
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    fail(`${command} ${commandArgs.join(' ')} failed with ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result;
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/gu, '/') || filePath;
}

function fail(message) {
  console.error(`[resign-mac-app] ${message}`);
  process.exit(1);
}
