/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const dmgPath = path.resolve(repoRoot, args.find((arg) => !arg.startsWith('--')) ?? '');
const profile = process.env.NOTARYTOOL_PROFILE || 'suwol-notary-profile';
const timeoutMinutes = Number(process.env.NOTARY_TIMEOUT_MINUTES || '120');
const diagnosticsDir = path.resolve(repoRoot, 'diagnostics', 'notary');

if (!dmgPath || !fs.existsSync(dmgPath)) {
  fail(`missing DMG path: ${dmgPath || '<empty>'}`);
}
if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
  fail(`invalid NOTARY_TIMEOUT_MINUTES: ${process.env.NOTARY_TIMEOUT_MINUTES}`);
}

fs.mkdirSync(diagnosticsDir, { recursive: true });

const submit = run('xcrun', [
  'notarytool',
  'submit',
  dmgPath,
  '--keychain-profile',
  profile,
  '--output-format',
  'json'
]);
writeJsonText('notary-submit.json', submit.stdout);

const submissionId = parseJson(submit.stdout, 'notary submit output').id;
if (!submissionId) {
  fail('notary submit output did not include an id');
}

const deadline = Date.now() + timeoutMinutes * 60_000;
let lastInfo = null;
while (Date.now() < deadline) {
  wait(30_000);
  const info = run('xcrun', ['notarytool', 'info', submissionId, '--keychain-profile', profile, '--output-format', 'json']);
  writeJsonText('notary-info.json', info.stdout);
  lastInfo = parseJson(info.stdout, 'notary info output');

  if (lastInfo.status === 'Accepted') {
    run('xcrun', ['stapler', 'staple', dmgPath]);
    run('xcrun', ['stapler', 'validate', dmgPath]);
    console.log(`[notarize-dmg] notarized and stapled ${relativePath(dmgPath)}`);
    process.exit(0);
  }

  if (lastInfo.status === 'Invalid' || lastInfo.status === 'Rejected') {
    const log = run('xcrun', ['notarytool', 'log', submissionId, '--keychain-profile', profile, '--output-format', 'json'], {
      allowFailure: true
    });
    writeJsonText('notary-log.json', log.stdout || log.stderr);
    fail(`notarization failed with status ${lastInfo.status}; see diagnostics/notary/notary-log.json`);
  }
}

fail(`notarization timed out after ${timeoutMinutes} minutes; last status: ${lastInfo?.status ?? '<unknown>'}`);

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0 && !options.allowFailure) {
    fail(`${command} ${commandArgs.join(' ')} failed with ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`could not parse ${label}: ${error.message}`);
  }
}

function writeJsonText(fileName, text) {
  fs.writeFileSync(path.join(diagnosticsDir, fileName), `${text.trim()}\n`, 'utf8');
}

function wait(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/gu, '/') || filePath;
}

function fail(message) {
  console.error(`[notarize-dmg] ${message}`);
  process.exit(1);
}
