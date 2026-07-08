/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const requiredIcons = ['build/icon.ico', 'build/icon.png', 'build/icon.icns'];

for (const iconPath of requiredIcons) {
  const absolutePath = path.join(repoRoot, iconPath);
  if (!fs.existsSync(absolutePath)) {
    fail(`missing required icon: ${iconPath}`);
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile() || stat.size <= 0) {
    fail(`icon is empty or not a file: ${iconPath}`);
  }
}

console.log(`[check-icons] verified ${requiredIcons.length} generated icons.`);

function fail(message) {
  console.error(`[check-icons] ${message}`);
  process.exit(1);
}
