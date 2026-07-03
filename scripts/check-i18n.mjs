/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const localesRoot = path.join(repoRoot, 'src', 'renderer', 'src', 'locales');
const languages = ['ko', 'en'];
const namespaces = ['common', 'settings', 'export', 'errors'];
const errors = [];

for (const namespace of namespaces) {
  const localeMaps = new Map();

  for (const language of languages) {
    const filePath = path.join(localesRoot, language, `${namespace}.json`);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing locale file: ${path.relative(repoRoot, filePath)}`);
      continue;
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const flat = flatten(parsed);
    localeMaps.set(language, flat);

    for (const [key, value] of flat.entries()) {
      if (typeof value === 'string' && value.trim() === '') {
        errors.push(`Empty string: ${language}/${namespace}:${key}`);
      }
    }
  }

  const reference = localeMaps.get(languages[0]);
  if (!reference) {
    continue;
  }

  for (const language of languages.slice(1)) {
    const candidate = localeMaps.get(language);
    if (!candidate) {
      continue;
    }

    for (const key of reference.keys()) {
      if (!candidate.has(key)) {
        errors.push(`Missing in ${language}/${namespace}: ${key}`);
      }
    }

    for (const key of candidate.keys()) {
      if (!reference.has(key)) {
        errors.push(`Extra in ${language}/${namespace}: ${key}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`i18n check passed for ${languages.join(', ')}: ${namespaces.join(', ')}`);

function flatten(value, prefix = '', output = new Map()) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) {
      flatten(nested, prefix ? `${prefix}.${key}` : key, output);
    }
    return output;
  }

  output.set(prefix, value);
  return output;
}
