/* global console, process */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.codex-run', 'selection-utils-test');
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
    path.join(repoRoot, 'src', 'renderer', 'src', 'selection-utils.ts'),
    path.join(repoRoot, 'scripts', 'selection-utils.test.ts')
  ],
  { stdio: 'inherit' }
);

execFileSync(process.execPath, [path.join(outDir, 'scripts', 'selection-utils.test.js')], { stdio: 'inherit' });
console.log('[selection-utils] temporary build removed');
fs.rmSync(outDir, { recursive: true, force: true });
