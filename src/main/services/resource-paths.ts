import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export function resolveResourcePath(relativePath: string): string {
  const candidates = [
    path.join(process.cwd(), relativePath),
    path.join(app.getAppPath(), relativePath),
    path.join(process.resourcesPath ?? '', relativePath)
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found ?? candidates[0];
}

export function readJsonResource<T>(relativePath: string): T {
  const resourcePath = resolveResourcePath(relativePath);
  return JSON.parse(fs.readFileSync(resourcePath, 'utf8')) as T;
}
