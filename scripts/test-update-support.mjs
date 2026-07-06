/* global console, process */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.codex-run', 'update-support-test');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'package.json'), '{"type":"commonjs"}\n', 'utf8');

const tscBin = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
execFileSync(
  process.execPath,
  [
    tscBin,
    '--target',
    'ES2022',
    '--module',
    'CommonJS',
    '--moduleResolution',
    'Node',
    '--strict',
    '--esModuleInterop',
    '--skipLibCheck',
    '--rootDir',
    repoRoot,
    '--outDir',
    outDir,
    path.join(repoRoot, 'src', 'main', 'services', 'update-support.ts'),
    path.join(repoRoot, 'scripts', 'update-support.test.ts')
  ],
  { stdio: 'inherit' }
);

execFileSync(process.execPath, [path.join(outDir, 'scripts', 'update-support.test.js')], { stdio: 'inherit' });
console.log('[update-support] temporary build removed');
fs.rmSync(outDir, { recursive: true, force: true });
