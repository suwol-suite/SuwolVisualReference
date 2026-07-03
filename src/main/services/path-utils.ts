import path from 'node:path';

export function toLibraryRelative(rootPath: string, absolutePath: string): string {
  return path.relative(rootPath, absolutePath).split(path.sep).join('/');
}

export function fromLibraryRelative(rootPath: string, relativePath: string): string {
  return path.join(rootPath, ...relativePath.split('/'));
}

export function relativeToFileUrl(_rootPath: string, relativePath: string | null): string | null {
  if (!relativePath) {
    return null;
  }

  return `ref-forge://library/${encodeURIComponent(relativePath)}`;
}

export function safeFileName(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'export';
}
