import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type { LibrarySummary, RecentLibraryRecord } from '@shared/types';

const RECENT_LIBRARY_FILE = 'recent-libraries.json';
const RECENT_LIBRARY_LIMIT = 12;

type RecentLibraryStore = {
  version: 1;
  libraries: RecentLibraryRecord[];
};

export class RecentLibraryService {
  async list(): Promise<RecentLibraryRecord[]> {
    const store = await this.readStore();
    const checked = await Promise.all(store.libraries.map((record) => this.withExists(record)));
    return checked.sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
  }

  async upsert(summary: LibrarySummary): Promise<RecentLibraryRecord[]> {
    const store = await this.readStore();
    const rootPath = normalizePath(summary.rootPath);
    const nextRecord: RecentLibraryRecord = {
      name: summary.name,
      rootPath,
      manifestPath: normalizePath(summary.manifestPath),
      assetCount: summary.assetCount,
      lastOpenedAt: new Date().toISOString(),
      exists: true
    };
    const libraries = [
      nextRecord,
      ...store.libraries.filter((record) => normalizePath(record.rootPath) !== rootPath)
    ].slice(0, RECENT_LIBRARY_LIMIT);

    await this.writeStore({ version: 1, libraries });
    return this.list();
  }

  async remove(rootPath: string): Promise<RecentLibraryRecord[]> {
    const normalizedRootPath = normalizePath(rootPath);
    const store = await this.readStore();
    await this.writeStore({
      version: 1,
      libraries: store.libraries.filter((record) => normalizePath(record.rootPath) !== normalizedRootPath)
    });
    return this.list();
  }

  private async withExists(record: RecentLibraryRecord): Promise<RecentLibraryRecord> {
    try {
      await fs.access(record.manifestPath);
      return { ...record, exists: true };
    } catch {
      return { ...record, exists: false };
    }
  }

  private async readStore(): Promise<RecentLibraryStore> {
    const storePath = this.getStorePath();
    try {
      const raw = await fs.readFile(storePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<RecentLibraryStore>;
      return {
        version: 1,
        libraries: Array.isArray(parsed.libraries)
          ? parsed.libraries.map(normalizeRecord).filter(isRecentLibraryRecord)
          : []
      };
    } catch {
      return { version: 1, libraries: [] };
    }
  }

  private async writeStore(store: RecentLibraryStore): Promise<void> {
    const storePath = this.getStorePath();
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
  }

  private getStorePath(): string {
    return path.join(app.getPath('userData'), RECENT_LIBRARY_FILE);
  }
}

function normalizeRecord(record: RecentLibraryRecord): RecentLibraryRecord | null {
  if (!record.rootPath || !record.manifestPath || !record.name || !record.lastOpenedAt) {
    return null;
  }

  return {
    name: String(record.name),
    rootPath: normalizePath(record.rootPath),
    manifestPath: normalizePath(record.manifestPath),
    assetCount: Number.isFinite(record.assetCount) ? record.assetCount : 0,
    lastOpenedAt: String(record.lastOpenedAt),
    exists: Boolean(record.exists)
  };
}

function isRecentLibraryRecord(record: RecentLibraryRecord | null): record is RecentLibraryRecord {
  return Boolean(record);
}

function normalizePath(value: string): string {
  return path.resolve(value);
}
