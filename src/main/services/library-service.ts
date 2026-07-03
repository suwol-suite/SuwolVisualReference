import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LibraryManifest, LibrarySummary } from '@shared/types';
import { loadAppConfig, loadDefaultTags } from './config-service';
import { LibraryDatabase } from './db-service';

const MANIFEST_FILE_NAME = 'ref-forge-library.json';

export class LibraryService {
  private activeDb: LibraryDatabase | null = null;
  private activeRootPath: string | null = null;
  private activeManifest: LibraryManifest | null = null;

  async createLibrary(rootPath: string, name?: string): Promise<LibrarySummary> {
    const config = loadAppConfig();
    const libraryName = name?.trim() || path.basename(rootPath) || config.appName;
    const now = new Date().toISOString();
    const manifest: LibraryManifest = {
      appName: config.appName,
      formatVersion: config.formatVersion,
      libraryId: crypto.randomUUID(),
      name: libraryName,
      createdAt: now,
      updatedAt: now,
      paths: {
        database: 'db.sqlite',
        originals: 'assets/originals',
        thumbnails: 'assets/thumbnails',
        previews: 'assets/previews',
        exports: 'exports',
        backups: 'backups'
      }
    };

    await this.ensureLibraryFolders(rootPath, manifest);
    await fs.writeFile(path.join(rootPath, MANIFEST_FILE_NAME), JSON.stringify(manifest, null, 2), 'utf8');
    return this.openLibrary(rootPath);
  }

  async openLibrary(rootPath: string): Promise<LibrarySummary> {
    const manifestPath = path.join(rootPath, MANIFEST_FILE_NAME);
    try {
      await fs.access(manifestPath);
    } catch {
      throw new Error('This folder does not contain a Suwol Visual Reference library manifest.');
    }

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as LibraryManifest;
    await this.ensureLibraryFolders(rootPath, manifest);

    this.activeDb?.close();
    this.activeRootPath = rootPath;
    this.activeManifest = manifest;
    this.activeDb = new LibraryDatabase(path.join(rootPath, manifest.paths.database), rootPath, manifest);
    this.activeDb.initialize(loadDefaultTags());
    return this.activeDb.getSummary();
  }

  getActiveSummary(): LibrarySummary | null {
    return this.activeDb?.getSummary() ?? null;
  }

  requireDb(): LibraryDatabase {
    if (!this.activeDb) {
      throw new Error('Open or create a library first.');
    }
    return this.activeDb;
  }

  requireRootPath(): string {
    if (!this.activeRootPath) {
      throw new Error('Open or create a library first.');
    }
    return this.activeRootPath;
  }

  requireManifest(): LibraryManifest {
    if (!this.activeManifest) {
      throw new Error('Open or create a library first.');
    }
    return this.activeManifest;
  }

  private async ensureLibraryFolders(rootPath: string, manifest: LibraryManifest): Promise<void> {
    await fs.mkdir(rootPath, { recursive: true });
    await Promise.all([
      fs.mkdir(path.join(rootPath, manifest.paths.originals), { recursive: true }),
      fs.mkdir(path.join(rootPath, manifest.paths.thumbnails), { recursive: true }),
      fs.mkdir(path.join(rootPath, manifest.paths.previews), { recursive: true }),
      fs.mkdir(path.join(rootPath, manifest.paths.exports), { recursive: true }),
      fs.mkdir(path.join(rootPath, manifest.paths.backups), { recursive: true })
    ]);
  }
}
