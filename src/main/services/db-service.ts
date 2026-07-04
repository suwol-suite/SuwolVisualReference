import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type {
  AssetColor,
  AssetListResult,
  AssetListQuery,
  AssetSort,
  AssetBatchCollectionInput,
  AssetBatchFavoriteInput,
  AssetBatchOperationResult,
  AssetBatchRatingInput,
  AssetBatchTagInput,
  AssetRecord,
  AssetUpdateInput,
  CollectionRecord,
  DuplicateGroup,
  DuplicateGroupQuery,
  DuplicateMergeInput,
  DuplicateResolutionInput,
  DuplicateResolutionStatus,
  ImportBatchRecord,
  ImportMetrics,
  LibraryManifest,
  LibrarySummary,
  SmartFolderQuery,
  SmartFolderRecord,
  TagMergeInput,
  TagRecord
} from '@shared/types';
import type { DefaultTag } from './config-service';
import { fromLibraryRelative, relativeToFileUrl } from './path-utils';
import { resolveResourcePath } from './resource-paths';

type DatabaseConnection = Database.Database;

type AssetRow = {
  id: string;
  library_id: string;
  title: string;
  original_file_name: string;
  stored_file_path: string;
  thumbnail_path: string | null;
  preview_path: string | null;
  media_type: string;
  mime_type: string | null;
  extension: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  hash: string;
  perceptual_hash: string | null;
  rating: number;
  memo: string;
  source_url: string;
  is_favorite: number;
  is_deleted: number;
  original_relative_path: string | null;
  import_batch_id: string | null;
  deleted_at: string | null;
  permanently_deleted_at: string | null;
  created_at: string;
  updated_at: string;
  imported_at: string;
};

type TagRow = {
  id: string;
  library_id: string | null;
  name: string;
  color: string;
  asset_count?: number;
  created_at: string;
  updated_at: string;
};

type CollectionRow = {
  id: string;
  library_id: string | null;
  name: string;
  description: string;
  color: string;
  cover_asset_id?: string | null;
  effective_cover_asset_id?: string | null;
  cover_thumbnail_path?: string | null;
  cover_stored_file_path?: string | null;
  cover_title?: string | null;
  asset_count?: number;
  created_at: string;
  updated_at: string;
};

type AssetColorRow = {
  id: string;
  asset_id: string;
  color: string;
  population: number;
  sort_order: number;
};

type ImportBatchRow = {
  id: string;
  library_id: string;
  source_type: string;
  source_path: string;
  total_count: number;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: string;
  metrics_json: string;
};

type SmartFolderRow = {
  id: string;
  library_id: string | null;
  name: string;
  query_json: string;
  created_at: string;
  updated_at: string;
};

type AssetQueryParts = {
  whereSql: string;
  params: Record<string, unknown>;
  orderSql: string;
  limit: number;
  offset: number;
};

export type InsertAssetInput = {
  id: string;
  libraryId: string;
  title: string;
  originalFileName: string;
  storedFilePath: string;
  thumbnailPath: string | null;
  previewPath: string | null;
  mediaType: string;
  mimeType: string | null;
  extension: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hash: string;
  perceptualHash: string | null;
  rating: number;
  memo: string;
  sourceUrl: string;
  isFavorite: boolean;
  isDeleted: boolean;
  originalRelativePath?: string | null;
  importBatchId?: string | null;
  deletedAt?: string | null;
  permanentlyDeletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  importedAt: string;
  colors: Array<{ color: string; population: number; sortOrder: number }>;
};

export class LibraryDatabase {
  private db: DatabaseConnection;

  constructor(
    private readonly dbPath: string,
    private readonly rootPath: string,
    private readonly manifest: LibraryManifest
  ) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  initialize(defaultTags: DefaultTag[]): void {
    this.migrate();
    this.upsertLibrary();
    this.seedDefaultTags(defaultTags);
  }

  close(): void {
    this.db.close();
  }

  getSummary(): LibrarySummary {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM assets
         WHERE library_id = ? AND is_deleted = 0 AND permanently_deleted_at IS NULL`
      )
      .get(this.manifest.libraryId) as { count: number };

    return {
      id: this.manifest.libraryId,
      name: this.manifest.name,
      rootPath: this.rootPath,
      manifestPath: path.join(this.rootPath, 'ref-forge-library.json'),
      assetCount: row.count
    };
  }

  listAssets(query: AssetListQuery = {}): AssetRecord[] {
    return this.queryAssets(query).items;
  }

  queryAssets(query: AssetListQuery = {}): AssetListResult {
    const parts = this.buildAssetQueryParts(query);
    const totalRow = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM assets a
         WHERE ${parts.whereSql}`
      )
      .get(parts.params) as { count: number };
    const rows = this.db
      .prepare(
        `SELECT a.*
         FROM assets a
         WHERE ${parts.whereSql}
         ${parts.orderSql}
         LIMIT @limit OFFSET @offset`
      )
      .all(parts.params) as AssetRow[];

    return {
      items: rows.map((row) => this.mapAsset(row)),
      totalCount: totalRow.count,
      limit: parts.limit,
      offset: parts.offset,
      hasMore: parts.offset + rows.length < totalRow.count
    };
  }

  private buildAssetQueryParts(query: AssetListQuery = {}): AssetQueryParts {
    const where = ['a.library_id = @libraryId', 'a.permanently_deleted_at IS NULL'];
    const params: Record<string, unknown> = {
      libraryId: this.manifest.libraryId
    };

    const filters = query.filters ?? {};
    const deletedOnly = Boolean(filters.deletedOnly || query.trashOnly || query.isDeleted);
    if (deletedOnly) {
      where.push('a.is_deleted = 1');
    } else {
      where.push('a.is_deleted = 0');
    }

    if (query.search?.trim()) {
      params.search = `%${query.search.trim().toLowerCase()}%`;
      where.push(`(
        LOWER(a.title) LIKE @search OR
        LOWER(a.original_file_name) LIKE @search OR
        LOWER(COALESCE(a.original_relative_path, '')) LIKE @search OR
        LOWER(a.memo) LIKE @search OR
        LOWER(a.extension) LIKE @search OR
        LOWER(a.source_url) LIKE @search OR
        EXISTS (
          SELECT 1
          FROM asset_tags sat
          JOIN tags st ON st.id = sat.tag_id
          WHERE sat.asset_id = a.id AND LOWER(st.name) LIKE @search
        )
      )`);
    }

    if (query.tagId) {
      params.tagId = query.tagId;
      where.push('EXISTS (SELECT 1 FROM asset_tags at2 WHERE at2.asset_id = a.id AND at2.tag_id = @tagId)');
    }

    if (query.tagIds && query.tagIds.length > 0) {
      const tagKeys = query.tagIds.map((tagId, index) => {
        const key = `tagId${index}`;
        params[key] = tagId;
        return `@${key}`;
      });
      where.push(`EXISTS (
        SELECT 1
        FROM asset_tags at_multi
        WHERE at_multi.asset_id = a.id AND at_multi.tag_id IN (${tagKeys.join(', ')})
      )`);
    }

    if (query.collectionId) {
      params.collectionId = query.collectionId;
      where.push(`EXISTS (
        SELECT 1 FROM collection_assets ca2
        WHERE ca2.asset_id = a.id AND ca2.collection_id = @collectionId
      )`);
    }

    if (query.favoriteOnly || filters.favoriteOnly) {
      where.push('a.is_favorite = 1');
    }

    appendListFilter(where, params, 'mediaType', 'a.media_type', filters.mediaTypes);
    appendListFilter(where, params, 'extension', 'a.extension', filters.extensions);

    if (typeof filters.minRating === 'number' && Number.isFinite(filters.minRating)) {
      params.minRating = Math.max(0, Math.min(5, filters.minRating));
      where.push('a.rating >= @minRating');
    }

    if (filters.includeTagIds && filters.includeTagIds.length > 0) {
      uniqueStrings(filters.includeTagIds).forEach((tagId, index) => {
        const key = `includeTagId${index}`;
        params[key] = tagId;
        where.push(`EXISTS (
          SELECT 1
          FROM asset_tags include_tag
          WHERE include_tag.asset_id = a.id AND include_tag.tag_id = @${key}
        )`);
      });
    }

    if (filters.excludeTagIds && filters.excludeTagIds.length > 0) {
      const tagKeys = uniqueStrings(filters.excludeTagIds).map((tagId, index) => {
        const key = `excludeTagId${index}`;
        params[key] = tagId;
        return `@${key}`;
      });
      where.push(`NOT EXISTS (
        SELECT 1
        FROM asset_tags exclude_tag
        WHERE exclude_tag.asset_id = a.id AND exclude_tag.tag_id IN (${tagKeys.join(', ')})
      )`);
    }

    if (filters.aspect === 'landscape') {
      where.push('a.width IS NOT NULL AND a.height IS NOT NULL AND a.width > a.height');
    } else if (filters.aspect === 'portrait') {
      where.push('a.width IS NOT NULL AND a.height IS NOT NULL AND a.width < a.height');
    } else if (filters.aspect === 'square') {
      where.push('a.width IS NOT NULL AND a.height IS NOT NULL AND a.width = a.height');
    }

    if (typeof filters.minWidth === 'number' && Number.isFinite(filters.minWidth) && filters.minWidth > 0) {
      params.minWidth = Math.floor(filters.minWidth);
      where.push('a.width >= @minWidth');
    }
    if (typeof filters.minHeight === 'number' && Number.isFinite(filters.minHeight) && filters.minHeight > 0) {
      params.minHeight = Math.floor(filters.minHeight);
      where.push('a.height >= @minHeight');
    }
    if (filters.hasMemo) {
      where.push("TRIM(a.memo) <> ''");
    }
    if (filters.hasSourceUrl) {
      where.push("TRIM(a.source_url) <> ''");
    }
    if (typeof filters.recentDays === 'number' && Number.isFinite(filters.recentDays) && filters.recentDays > 0) {
      params.recentSince = new Date(Date.now() - Math.floor(filters.recentDays) * 24 * 60 * 60 * 1000).toISOString();
      where.push('a.imported_at >= @recentSince');
    }

    if (query.smartFolderId) {
      const smartFolder = this.getSmartFolder(query.smartFolderId);
      if (smartFolder) {
        this.appendSmartFolderWhere(where, params, smartFolder.query);
      }
    }

    if (query.duplicateOnly || filters.duplicateOnly) {
      where.push(`a.hash IN (
        SELECT grouped.hash
        FROM assets grouped
        LEFT JOIN duplicate_resolutions dr
          ON dr.library_id = grouped.library_id AND dr.hash = grouped.hash
        WHERE grouped.library_id = @libraryId
          AND grouped.is_deleted = 0
          AND grouped.permanently_deleted_at IS NULL
          AND COALESCE(dr.status, 'unresolved') = 'unresolved'
        GROUP BY grouped.hash
        HAVING COUNT(*) > 1
      )`);
    }

    if (query.duplicateGroupHash) {
      params.duplicateGroupHash = query.duplicateGroupHash;
      where.push('a.hash = @duplicateGroupHash');
    }

    const limit = Math.max(1, Math.min(query.limit ?? 700, 2000));
    const offset = Math.max(0, query.offset ?? 0);
    params.limit = limit;
    params.offset = offset;

    return {
      whereSql: where.join(' AND '),
      params,
      orderSql: getAssetOrderSql(query.sort, query.collectionId ?? null),
      limit,
      offset
    };
  }

  getAsset(id: string): AssetRecord | null {
    const row = this.db
      .prepare('SELECT * FROM assets WHERE id = ? AND permanently_deleted_at IS NULL')
      .get(id) as AssetRow | undefined;
    return row ? this.mapAsset(row) : null;
  }

  getAssetsByIds(assetIds: string[]): AssetRecord[] {
    if (assetIds.length === 0) {
      return [];
    }

    const placeholders = assetIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM assets WHERE id IN (${placeholders}) AND is_deleted = 0 AND permanently_deleted_at IS NULL`)
      .all(...assetIds) as AssetRow[];
    const byId = new Map(rows.map((row) => [row.id, this.mapAsset(row)]));
    return assetIds.map((id) => byId.get(id)).filter((asset): asset is AssetRecord => Boolean(asset));
  }

  getAssetAllowDeleted(id: string): AssetRecord | null {
    const row = this.db
      .prepare('SELECT * FROM assets WHERE id = ? AND permanently_deleted_at IS NULL')
      .get(id) as AssetRow | undefined;
    return row ? this.mapAsset(row) : null;
  }

  getAssetByHash(hash: string): AssetRecord | null {
    const row = this.db
      .prepare(
        `SELECT *
         FROM assets
         WHERE library_id = ? AND hash = ? AND is_deleted = 0 AND permanently_deleted_at IS NULL
         LIMIT 1`
      )
      .get(this.manifest.libraryId, hash) as AssetRow | undefined;
    return row ? this.mapAsset(row) : null;
  }

  insertAsset(input: InsertAssetInput): AssetRecord {
    const insert = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO assets (
            id, library_id, title, original_file_name, stored_file_path, thumbnail_path, preview_path,
            media_type, mime_type, extension, size_bytes, width, height, duration_ms, hash, perceptual_hash,
            rating, memo, source_url, is_favorite, is_deleted, original_relative_path, import_batch_id,
            deleted_at, permanently_deleted_at, created_at, updated_at, imported_at
          )
          VALUES (
            @id, @libraryId, @title, @originalFileName, @storedFilePath, @thumbnailPath, @previewPath,
            @mediaType, @mimeType, @extension, @sizeBytes, @width, @height, @durationMs, @hash, @perceptualHash,
            @rating, @memo, @sourceUrl, @isFavorite, @isDeleted, @originalRelativePath, @importBatchId,
            @deletedAt, @permanentlyDeletedAt, @createdAt, @updatedAt, @importedAt
          )`
        )
        .run({
          ...input,
          isFavorite: input.isFavorite ? 1 : 0,
          isDeleted: input.isDeleted ? 1 : 0,
          originalRelativePath: input.originalRelativePath ?? null,
          importBatchId: input.importBatchId ?? null,
          deletedAt: input.deletedAt ?? null,
          permanentlyDeletedAt: input.permanentlyDeletedAt ?? null
        });

      const colorStatement = this.db.prepare(
        `INSERT INTO asset_colors (id, asset_id, color, population, sort_order)
         VALUES (@id, @assetId, @color, @population, @sortOrder)`
      );

      for (const color of input.colors) {
        colorStatement.run({
          id: crypto.randomUUID(),
          assetId: input.id,
          color: color.color,
          population: color.population,
          sortOrder: color.sortOrder
        });
      }
    });

    insert();
    const asset = this.getAsset(input.id);
    if (!asset) {
      throw new Error('Asset insert failed.');
    }
    return asset;
  }

  updateAsset(input: AssetUpdateInput): AssetRecord {
    const updates: string[] = [];
    const params: Record<string, unknown> = {
      id: input.id,
      updatedAt: new Date().toISOString()
    };

    if (input.title !== undefined) {
      updates.push('title = @title');
      params.title = input.title.trim() || 'Untitled';
    }
    if (input.memo !== undefined) {
      updates.push('memo = @memo');
      params.memo = input.memo;
    }
    if (input.rating !== undefined) {
      updates.push('rating = @rating');
      params.rating = Math.max(0, Math.min(5, input.rating));
    }
    if (input.sourceUrl !== undefined) {
      updates.push('source_url = @sourceUrl');
      params.sourceUrl = input.sourceUrl;
    }
    if (input.isFavorite !== undefined) {
      updates.push('is_favorite = @isFavorite');
      params.isFavorite = input.isFavorite ? 1 : 0;
    }

    if (updates.length > 0) {
      updates.push('updated_at = @updatedAt');
      this.db.prepare(`UPDATE assets SET ${updates.join(', ')} WHERE id = @id`).run(params);
    }

    const asset = this.getAsset(input.id);
    if (!asset) {
      throw new Error('Asset not found.');
    }
    return asset;
  }

  trashAssets(assetIds: string[]): void {
    if (assetIds.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const placeholders = assetIds.map(() => '?').join(',');
    this.db
      .prepare(
        `UPDATE assets
         SET is_deleted = 1, deleted_at = ?, updated_at = ?
         WHERE id IN (${placeholders}) AND library_id = ? AND permanently_deleted_at IS NULL`
      )
      .run(now, now, ...assetIds, this.manifest.libraryId);
  }

  restoreAssets(assetIds: string[]): void {
    if (assetIds.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const placeholders = assetIds.map(() => '?').join(',');
    this.db
      .prepare(
        `UPDATE assets
         SET is_deleted = 0, deleted_at = NULL, updated_at = ?
         WHERE id IN (${placeholders}) AND library_id = ? AND permanently_deleted_at IS NULL`
      )
      .run(now, ...assetIds, this.manifest.libraryId);
  }

  markAssetsPermanentlyDeleted(assetIds: string[]): void {
    if (assetIds.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const placeholders = assetIds.map(() => '?').join(',');
    this.db
      .prepare(
        `UPDATE assets
         SET is_deleted = 1, deleted_at = COALESCE(deleted_at, ?), permanently_deleted_at = ?, updated_at = ?
         WHERE id IN (${placeholders}) AND library_id = ? AND permanently_deleted_at IS NULL`
      )
      .run(now, now, now, ...assetIds, this.manifest.libraryId);
  }

  markAssetsPermanentlyDeletedWithBatch(assetIds: string[], batchId: string): void {
    if (assetIds.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const placeholders = assetIds.map(() => '?').join(',');
    this.db
      .prepare(
        `UPDATE assets
         SET is_deleted = 1,
             deleted_at = COALESCE(deleted_at, ?),
             permanently_deleted_at = ?,
             permanent_delete_error = NULL,
             permanent_delete_batch_id = ?,
             updated_at = ?
         WHERE id IN (${placeholders}) AND library_id = ? AND permanently_deleted_at IS NULL`
      )
      .run(now, now, batchId, now, ...assetIds, this.manifest.libraryId);
  }

  recordPermanentDeleteFailure(assetId: string, batchId: string, error: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE assets
         SET is_deleted = 1,
             deleted_at = COALESCE(deleted_at, ?),
             permanent_delete_error = ?,
             permanent_delete_batch_id = ?,
             updated_at = ?
         WHERE id = ? AND library_id = ? AND permanently_deleted_at IS NULL`
      )
      .run(now, error, batchId, now, assetId, this.manifest.libraryId);
  }

  batchAddTags(input: AssetBatchTagInput): AssetBatchOperationResult {
    const assetIds = uniqueStrings(input.assetIds);
    const tagIds = this.filterExistingTagIds(uniqueStrings(input.tagIds));
    const result = createBatchResult(assetIds.length);
    if (tagIds.length === 0) {
      return failAll(assetIds, result, 'NO_TAGS', 'No existing tags were selected.');
    }

    const now = new Date().toISOString();
    const insert = this.db.prepare('INSERT OR IGNORE INTO asset_tags (asset_id, tag_id, created_at) VALUES (?, ?, ?)');
    const transaction = this.db.transaction(() => {
      for (const assetId of assetIds) {
        const asset = this.getAssetAllowDeleted(assetId);
        if (!asset) {
          pushBatchFailure(result, assetId, undefined, 'ASSET_NOT_FOUND', 'Asset was not found or is permanently deleted.');
          continue;
        }

        let skippedForAsset = 0;
        for (const tagId of tagIds) {
          const info = insert.run(assetId, tagId, now);
          if (info.changes === 0) {
            skippedForAsset += 1;
          }
        }
        result.successCount += 1;
        result.skippedCount += skippedForAsset;
        result.affectedAssetIds.push(assetId);
      }
    });
    transaction();
    return result;
  }

  batchRemoveTags(input: AssetBatchTagInput): AssetBatchOperationResult {
    const assetIds = uniqueStrings(input.assetIds);
    const tagIds = this.filterExistingTagIds(uniqueStrings(input.tagIds));
    const result = createBatchResult(assetIds.length);
    if (tagIds.length === 0) {
      return failAll(assetIds, result, 'NO_TAGS', 'No existing tags were selected.');
    }

    const deleteStatement = this.db.prepare('DELETE FROM asset_tags WHERE asset_id = ? AND tag_id = ?');
    const transaction = this.db.transaction(() => {
      for (const assetId of assetIds) {
        const asset = this.getAssetAllowDeleted(assetId);
        if (!asset) {
          pushBatchFailure(result, assetId, undefined, 'ASSET_NOT_FOUND', 'Asset was not found or is permanently deleted.');
          continue;
        }

        let changed = 0;
        for (const tagId of tagIds) {
          changed += Number(deleteStatement.run(assetId, tagId).changes);
        }
        if (changed === 0) {
          result.skippedCount += 1;
        }
        result.successCount += 1;
        result.affectedAssetIds.push(assetId);
      }
    });
    transaction();
    return result;
  }

  batchSetRating(input: AssetBatchRatingInput): AssetBatchOperationResult {
    const assetIds = uniqueStrings(input.assetIds);
    const rating = Math.max(0, Math.min(5, input.rating));
    const result = createBatchResult(assetIds.length);
    const now = new Date().toISOString();
    const statement = this.db.prepare(
      'UPDATE assets SET rating = ?, updated_at = ? WHERE id = ? AND library_id = ? AND permanently_deleted_at IS NULL'
    );
    const transaction = this.db.transaction(() => {
      for (const assetId of assetIds) {
        const info = statement.run(rating, now, assetId, this.manifest.libraryId);
        if (info.changes === 0) {
          pushBatchFailure(result, assetId, undefined, 'ASSET_NOT_FOUND', 'Asset was not found or is permanently deleted.');
          continue;
        }
        result.successCount += 1;
        result.affectedAssetIds.push(assetId);
      }
    });
    transaction();
    return result;
  }

  batchSetFavorite(input: AssetBatchFavoriteInput): AssetBatchOperationResult {
    const assetIds = uniqueStrings(input.assetIds);
    const result = createBatchResult(assetIds.length);
    const now = new Date().toISOString();
    const statement = this.db.prepare(
      'UPDATE assets SET is_favorite = ?, updated_at = ? WHERE id = ? AND library_id = ? AND permanently_deleted_at IS NULL'
    );
    const transaction = this.db.transaction(() => {
      for (const assetId of assetIds) {
        const info = statement.run(input.isFavorite ? 1 : 0, now, assetId, this.manifest.libraryId);
        if (info.changes === 0) {
          pushBatchFailure(result, assetId, undefined, 'ASSET_NOT_FOUND', 'Asset was not found or is permanently deleted.');
          continue;
        }
        result.successCount += 1;
        result.affectedAssetIds.push(assetId);
      }
    });
    transaction();
    return result;
  }

  batchAddAssetsToCollection(input: AssetBatchCollectionInput): AssetBatchOperationResult {
    const assetIds = uniqueStrings(input.assetIds);
    const result = createBatchResult(assetIds.length);
    const collection = this.db
      .prepare('SELECT * FROM collections WHERE id = ? AND (library_id IS NULL OR library_id = ?)')
      .get(input.collectionId, this.manifest.libraryId) as CollectionRow | undefined;
    if (!collection) {
      return failAll(assetIds, result, 'COLLECTION_NOT_FOUND', 'Collection was not found.');
    }

    const now = new Date().toISOString();
    const nextOrder = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM collection_assets WHERE collection_id = ?')
      .get(input.collectionId) as { next_order: number };
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO collection_assets (collection_id, asset_id, sort_order, created_at)
       VALUES (?, ?, ?, ?)`
    );
    const transaction = this.db.transaction(() => {
      let orderOffset = 0;
      for (const assetId of assetIds) {
        const asset = this.getAssetAllowDeleted(assetId);
        if (!asset) {
          pushBatchFailure(result, assetId, undefined, 'ASSET_NOT_FOUND', 'Asset was not found or is permanently deleted.');
          continue;
        }
        const info = insert.run(input.collectionId, assetId, nextOrder.next_order + orderOffset, now);
        orderOffset += 1;
        if (info.changes === 0) {
          result.skippedCount += 1;
        }
        result.successCount += 1;
        result.affectedAssetIds.push(assetId);
      }
    });
    transaction();
    return result;
  }

  listTags(): TagRecord[] {
    const rows = this.db
      .prepare(
        `SELECT t.*, COUNT(a.id) AS asset_count
         FROM tags t
         LEFT JOIN asset_tags at ON at.tag_id = t.id
         LEFT JOIN assets a ON a.id = at.asset_id AND a.is_deleted = 0 AND a.permanently_deleted_at IS NULL
         WHERE t.library_id IS NULL OR t.library_id = ?
         GROUP BY t.id
         ORDER BY t.name ASC`
      )
      .all(this.manifest.libraryId) as TagRow[];
    return rows.map(mapTag);
  }

  createTag(name: string, color = '#60a5fa'): TagRecord {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.db
      .prepare('INSERT INTO tags (id, library_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, this.manifest.libraryId, name.trim(), color, now, now);
    const tag = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow;
    return mapTag(tag);
  }

  updateTag(input: { id: string; name?: string; color?: string }): TagRecord {
    const updates: string[] = [];
    const params: Record<string, unknown> = {
      id: input.id,
      updatedAt: new Date().toISOString()
    };

    if (input.name !== undefined) {
      updates.push('name = @name');
      params.name = input.name.trim();
    }
    if (input.color !== undefined) {
      updates.push('color = @color');
      params.color = input.color;
    }
    updates.push('updated_at = @updatedAt');
    this.db.prepare(`UPDATE tags SET ${updates.join(', ')} WHERE id = @id`).run(params);
    const tag = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(input.id) as TagRow | undefined;
    if (!tag) {
      throw new Error('Tag not found.');
    }
    return mapTag(tag);
  }

  deleteTag(id: string): void {
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  }

  deleteTags(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }

    const placeholders = ids.map(() => '?').join(',');
    const transaction = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM asset_tags WHERE tag_id IN (${placeholders})`).run(...ids);
      this.db.prepare(`DELETE FROM tags WHERE id IN (${placeholders})`).run(...ids);
    });
    transaction();
  }

  deleteUnusedTags(): number {
    const ids = this.db
      .prepare(
        `SELECT t.id
         FROM tags t
         LEFT JOIN asset_tags at ON at.tag_id = t.id
         WHERE t.library_id IS NULL OR t.library_id = ?
         GROUP BY t.id
         HAVING COUNT(at.asset_id) = 0`
      )
      .all(this.manifest.libraryId)
      .map((row) => (row as { id: string }).id);
    this.deleteTags(ids);
    return ids.length;
  }

  mergeTags(input: TagMergeInput): void {
    const sourceTagIds = input.sourceTagIds.filter((tagId) => tagId !== input.targetTagId);
    if (sourceTagIds.length === 0) {
      return;
    }

    const placeholders = sourceTagIds.map(() => '?').join(',');
    const now = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO asset_tags (asset_id, tag_id, created_at)
           SELECT asset_id, ?, ?
           FROM asset_tags
           WHERE tag_id IN (${placeholders})`
        )
        .run(input.targetTagId, now, ...sourceTagIds);
      this.db.prepare(`DELETE FROM asset_tags WHERE tag_id IN (${placeholders})`).run(...sourceTagIds);
      this.db.prepare(`DELETE FROM tags WHERE id IN (${placeholders})`).run(...sourceTagIds);
      this.db.prepare('UPDATE tags SET updated_at = ? WHERE id = ?').run(now, input.targetTagId);
    });
    transaction();
  }

  assignTag(assetId: string, tagId: string): AssetRecord {
    this.db
      .prepare('INSERT OR IGNORE INTO asset_tags (asset_id, tag_id, created_at) VALUES (?, ?, ?)')
      .run(assetId, tagId, new Date().toISOString());
    const asset = this.getAsset(assetId);
    if (!asset) {
      throw new Error('Asset not found.');
    }
    return asset;
  }

  removeTag(assetId: string, tagId: string): AssetRecord {
    this.db.prepare('DELETE FROM asset_tags WHERE asset_id = ? AND tag_id = ?').run(assetId, tagId);
    const asset = this.getAsset(assetId);
    if (!asset) {
      throw new Error('Asset not found.');
    }
    return asset;
  }

  listCollections(): CollectionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT c.*,
                COUNT(a.id) AS asset_count,
                COALESCE(
                  (
                    SELECT explicit_cover.id
                    FROM assets explicit_cover
                    WHERE explicit_cover.id = c.cover_asset_id
                      AND explicit_cover.is_deleted = 0
                      AND explicit_cover.permanently_deleted_at IS NULL
                    LIMIT 1
                  ),
                  (
                    SELECT ca_cover.asset_id
                    FROM collection_assets ca_cover
                    JOIN assets cover_candidate
                      ON cover_candidate.id = ca_cover.asset_id
                     AND cover_candidate.is_deleted = 0
                     AND cover_candidate.permanently_deleted_at IS NULL
                    WHERE ca_cover.collection_id = c.id
                    ORDER BY ca_cover.sort_order ASC, ca_cover.created_at ASC
                    LIMIT 1
                  )
                ) AS effective_cover_asset_id,
                cover.thumbnail_path AS cover_thumbnail_path,
                cover.stored_file_path AS cover_stored_file_path,
                cover.title AS cover_title
         FROM collections c
         LEFT JOIN collection_assets ca ON ca.collection_id = c.id
         LEFT JOIN assets a ON a.id = ca.asset_id AND a.is_deleted = 0 AND a.permanently_deleted_at IS NULL
         LEFT JOIN assets cover
           ON cover.id = COALESCE(
             (
               SELECT explicit_cover.id
               FROM assets explicit_cover
               WHERE explicit_cover.id = c.cover_asset_id
                 AND explicit_cover.is_deleted = 0
                 AND explicit_cover.permanently_deleted_at IS NULL
               LIMIT 1
             ),
             (
               SELECT ca_cover.asset_id
               FROM collection_assets ca_cover
               JOIN assets cover_candidate
                 ON cover_candidate.id = ca_cover.asset_id
                AND cover_candidate.is_deleted = 0
                AND cover_candidate.permanently_deleted_at IS NULL
               WHERE ca_cover.collection_id = c.id
               ORDER BY ca_cover.sort_order ASC, ca_cover.created_at ASC
               LIMIT 1
             )
           )
         WHERE c.library_id IS NULL OR c.library_id = ?
         GROUP BY c.id
         ORDER BY c.created_at DESC`
      )
      .all(this.manifest.libraryId) as CollectionRow[];
    return rows.map((row) => mapCollection(row, this.rootPath));
  }

  createCollection(name: string, description = '', color = '#f59e0b'): CollectionRecord {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO collections (id, library_id, name, description, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, this.manifest.libraryId, name.trim(), description, color, now, now);
    const collection = this.db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as CollectionRow;
    return mapCollection(collection, this.rootPath);
  }

  updateCollection(input: { id: string; name?: string; description?: string; color?: string; coverAssetId?: string | null }): CollectionRecord {
    const updates: string[] = [];
    const params: Record<string, unknown> = {
      id: input.id,
      updatedAt: new Date().toISOString()
    };

    if (input.name !== undefined) {
      updates.push('name = @name');
      params.name = input.name.trim();
    }
    if (input.description !== undefined) {
      updates.push('description = @description');
      params.description = input.description;
    }
    if (input.color !== undefined) {
      updates.push('color = @color');
      params.color = input.color;
    }
    if (input.coverAssetId !== undefined) {
      updates.push('cover_asset_id = @coverAssetId');
      params.coverAssetId = input.coverAssetId;
    }
    updates.push('updated_at = @updatedAt');
    this.db.prepare(`UPDATE collections SET ${updates.join(', ')} WHERE id = @id`).run(params);
    const collection = this.db.prepare('SELECT * FROM collections WHERE id = ?').get(input.id) as
      | CollectionRow
      | undefined;
    if (!collection) {
      throw new Error('Collection not found.');
    }
    return mapCollection(collection, this.rootPath);
  }

  addAssetsToCollection(collectionId: string, assetIds: string[]): CollectionRecord {
    const now = new Date().toISOString();
    const nextOrder = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM collection_assets WHERE collection_id = ?')
      .get(collectionId) as { next_order: number };

    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO collection_assets (collection_id, asset_id, sort_order, created_at)
       VALUES (?, ?, ?, ?)`
    );

    const transaction = this.db.transaction(() => {
      assetIds.forEach((assetId, index) => {
        insert.run(collectionId, assetId, nextOrder.next_order + index, now);
      });
    });
    transaction();

    const collection = this.db.prepare('SELECT * FROM collections WHERE id = ?').get(collectionId) as CollectionRow;
    return mapCollection(collection, this.rootPath);
  }

  removeAssetFromCollection(collectionId: string, assetId: string): void {
    this.db.prepare('DELETE FROM collection_assets WHERE collection_id = ? AND asset_id = ?').run(collectionId, assetId);
  }

  deleteCollection(id: string): void {
    this.db.prepare('DELETE FROM collections WHERE id = ? AND (library_id IS NULL OR library_id = ?)').run(id, this.manifest.libraryId);
  }

  listDuplicateGroups(query: DuplicateGroupQuery = {}): DuplicateGroup[] {
    const statuses = query.statuses ?? [
      'unresolved',
      ...(query.includeResolved ? ['resolved' as const] : []),
      ...(query.includeIgnored ? ['ignored' as const] : [])
    ];
    const statusKeys = statuses.map((status, index) => {
      const key = `status${index}`;
      return { key, status };
    });
    const params: Record<string, unknown> = {
      libraryId: this.manifest.libraryId,
      limit: Math.max(1, Math.min(query.limit ?? 100, 500)),
      offset: Math.max(0, query.offset ?? 0)
    };
    for (const statusKey of statusKeys) {
      params[statusKey.key] = statusKey.status;
    }

    const statusSql = statusKeys.length > 0 ? `AND status IN (${statusKeys.map(({ key }) => `@${key}`).join(', ')})` : '';
    const groups = this.db
      .prepare(
        `WITH grouped AS (
           SELECT
             a.hash,
             COUNT(*) AS file_count,
             SUM(a.size_bytes) AS total_size_bytes,
             MAX(a.size_bytes) AS largest_size_bytes,
             MAX(a.imported_at) AS newest_imported_at,
             COALESCE(dr.status, 'unresolved') AS status,
             dr.keep_asset_id,
             COALESCE(dr.note, '') AS note,
             dr.resolved_at,
             dr.ignored_at
           FROM assets a
           LEFT JOIN duplicate_resolutions dr
             ON dr.library_id = a.library_id AND dr.hash = a.hash
           WHERE a.library_id = @libraryId
             AND a.is_deleted = 0
             AND a.permanently_deleted_at IS NULL
           GROUP BY a.hash
           HAVING COUNT(*) > 1
         )
         SELECT *
         FROM grouped
         WHERE 1 = 1
         ${statusSql}
         ORDER BY
           CASE status WHEN 'unresolved' THEN 0 WHEN 'ignored' THEN 1 ELSE 2 END,
           file_count DESC,
           newest_imported_at DESC
         LIMIT @limit OFFSET @offset`
      )
      .all(params) as Array<{
      hash: string;
      file_count: number;
      total_size_bytes: number;
      largest_size_bytes: number;
      status: DuplicateResolutionStatus;
      keep_asset_id: string | null;
      note: string;
      resolved_at: string | null;
      ignored_at: string | null;
    }>;

    return groups.map((row) => this.mapDuplicateGroup(row));
  }

  getDuplicateGroup(hash: string): DuplicateGroup | null {
    const row = this.db
      .prepare(
        `SELECT
           a.hash,
           COUNT(*) AS file_count,
           SUM(a.size_bytes) AS total_size_bytes,
           MAX(a.size_bytes) AS largest_size_bytes,
           COALESCE(dr.status, 'unresolved') AS status,
           dr.keep_asset_id,
           COALESCE(dr.note, '') AS note,
           dr.resolved_at,
           dr.ignored_at
         FROM assets a
         LEFT JOIN duplicate_resolutions dr
           ON dr.library_id = a.library_id AND dr.hash = a.hash
         WHERE a.library_id = ?
           AND a.hash = ?
           AND a.is_deleted = 0
           AND a.permanently_deleted_at IS NULL
         GROUP BY a.hash
         HAVING COUNT(*) > 1`
      )
      .get(this.manifest.libraryId, hash) as
      | {
          hash: string;
          file_count: number;
          total_size_bytes: number;
          largest_size_bytes: number;
          status: DuplicateResolutionStatus;
          keep_asset_id: string | null;
          note: string;
          resolved_at: string | null;
          ignored_at: string | null;
        }
      | undefined;
    return row ? this.mapDuplicateGroup(row) : null;
  }

  setDuplicateResolution(input: DuplicateResolutionInput): DuplicateGroup | null {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO duplicate_resolutions (
          library_id, hash, status, keep_asset_id, note, resolved_at, ignored_at, updated_at
        )
        VALUES (
          @libraryId, @hash, @status, @keepAssetId, @note, @resolvedAt, @ignoredAt, @updatedAt
        )
        ON CONFLICT(library_id, hash) DO UPDATE SET
          status = excluded.status,
          keep_asset_id = excluded.keep_asset_id,
          note = excluded.note,
          resolved_at = excluded.resolved_at,
          ignored_at = excluded.ignored_at,
          updated_at = excluded.updated_at`
      )
      .run({
        libraryId: this.manifest.libraryId,
        hash: input.hash,
        status: input.status,
        keepAssetId: input.keepAssetId ?? null,
        note: input.note ?? '',
        resolvedAt: input.status === 'resolved' ? now : null,
        ignoredAt: input.status === 'ignored' ? now : null,
        updatedAt: now
      });
    return this.getDuplicateGroup(input.hash);
  }

  mergeDuplicateAssets(input: DuplicateMergeInput): DuplicateGroup | null {
    const sourceAssetIds = input.sourceAssetIds.filter((assetId) => assetId !== input.targetAssetId);
    if (sourceAssetIds.length === 0) {
      return this.setDuplicateResolution({
        hash: input.hash,
        status: 'resolved',
        keepAssetId: input.targetAssetId
      });
    }

    const assets = this.getAssetsByIds([input.targetAssetId, ...sourceAssetIds]);
    const target = assets.find((asset) => asset.id === input.targetAssetId);
    const sources = assets.filter((asset) => sourceAssetIds.includes(asset.id));
    if (!target || sources.length === 0 || assets.some((asset) => asset.hash !== input.hash)) {
      throw new Error('Duplicate merge assets must exist and share the same hash.');
    }

    const now = new Date().toISOString();
    const placeholders = sourceAssetIds.map(() => '?').join(',');
    const mergedMemo = mergeAssetMemos(target, sources);
    const mergedSourceUrl = mergeSourceUrl(target, sources);
    const mergedRating = Math.max(target.rating, ...sources.map((asset) => asset.rating));
    const mergedFavorite = target.isFavorite || sources.some((asset) => asset.isFavorite);
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO asset_tags (asset_id, tag_id, created_at)
           SELECT ?, tag_id, ?
           FROM asset_tags
           WHERE asset_id IN (${placeholders})`
        )
        .run(input.targetAssetId, now, ...sourceAssetIds);
      this.db
        .prepare(
          `INSERT OR IGNORE INTO collection_assets (collection_id, asset_id, sort_order, created_at)
           SELECT collection_id, ?, sort_order, ?
           FROM collection_assets
           WHERE asset_id IN (${placeholders})`
        )
        .run(input.targetAssetId, now, ...sourceAssetIds);
      this.db
        .prepare(
          `UPDATE assets
           SET memo = ?, source_url = ?, rating = ?, is_favorite = ?, updated_at = ?
           WHERE id = ? AND library_id = ?`
        )
        .run(mergedMemo, mergedSourceUrl, mergedRating, mergedFavorite ? 1 : 0, now, input.targetAssetId, this.manifest.libraryId);

      if (input.moveSourcesToTrash ?? true) {
        this.db
          .prepare(
            `UPDATE assets
             SET is_deleted = 1, deleted_at = COALESCE(deleted_at, ?), updated_at = ?
             WHERE id IN (${placeholders}) AND library_id = ? AND permanently_deleted_at IS NULL`
          )
          .run(now, now, ...sourceAssetIds, this.manifest.libraryId);
      }
    });
    transaction();

    return this.setDuplicateResolution({
      hash: input.hash,
      status: 'resolved',
      keepAssetId: input.targetAssetId
    });
  }

  createDuplicate(assetId: string, duplicateAssetId: string, hash: string): void {
    this.db
      .prepare(
        `INSERT INTO duplicates (id, library_id, asset_id, duplicate_asset_id, asset_id_a, asset_id_b, hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        this.manifest.libraryId,
        assetId,
        duplicateAssetId,
        assetId,
        duplicateAssetId,
        hash,
        new Date().toISOString()
      );
  }

  createImportBatch(input: {
    sourceType: string;
    sourcePath: string;
    totalCount: number;
    supportedCount: number;
  }): ImportBatchRecord {
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const metrics: Partial<ImportMetrics> = {
      totalFiles: input.totalCount,
      supportedFiles: input.supportedCount
    };

    this.db
      .prepare(
        `INSERT INTO import_batches (
          id, library_id, source_type, source_path, total_count, imported_count, skipped_count,
          failed_count, started_at, completed_at, duration_ms, status, metrics_json
        )
        VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, NULL, NULL, 'running', ?)`
      )
      .run(
        id,
        this.manifest.libraryId,
        input.sourceType,
        input.sourcePath,
        input.totalCount,
        startedAt,
        JSON.stringify(metrics)
      );

    const batch = this.getImportBatch(id);
    if (!batch) {
      throw new Error('Import batch creation failed.');
    }
    return batch;
  }

  completeImportBatch(input: {
    id: string;
    importedCount: number;
    skippedCount: number;
    failedCount: number;
    durationMs: number;
    status: string;
    metrics: ImportMetrics;
  }): ImportBatchRecord {
    const completedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE import_batches
         SET imported_count = @importedCount,
             skipped_count = @skippedCount,
             failed_count = @failedCount,
             completed_at = @completedAt,
             duration_ms = @durationMs,
             status = @status,
             metrics_json = @metricsJson
         WHERE id = @id AND library_id = @libraryId`
      )
      .run({
        ...input,
        libraryId: this.manifest.libraryId,
        completedAt,
        metricsJson: JSON.stringify(input.metrics)
      });

    const batch = this.getImportBatch(input.id);
    if (!batch) {
      throw new Error('Import batch was not found after completion.');
    }
    return batch;
  }

  getImportBatch(id: string): ImportBatchRecord | null {
    const row = this.db
      .prepare('SELECT * FROM import_batches WHERE id = ? AND library_id = ?')
      .get(id, this.manifest.libraryId) as ImportBatchRow | undefined;
    return row ? mapImportBatch(row) : null;
  }

  listImportBatches(limit = 20): ImportBatchRecord[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM import_batches
         WHERE library_id = ?
         ORDER BY started_at DESC
         LIMIT ?`
      )
      .all(this.manifest.libraryId, Math.max(1, Math.min(limit, 100))) as ImportBatchRow[];
    return rows.map(mapImportBatch);
  }

  listSmartFolders(): SmartFolderRecord[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM smart_folders
         WHERE library_id IS NULL OR library_id = ?
         ORDER BY created_at ASC`
      )
      .all(this.manifest.libraryId) as SmartFolderRow[];
    return rows.map((row) => mapSmartFolder(row, this.manifest.libraryId));
  }

  getSmartFolder(id: string): SmartFolderRecord | null {
    const row = this.db
      .prepare(
        `SELECT *
         FROM smart_folders
         WHERE id = ? AND (library_id IS NULL OR library_id = ?)
         LIMIT 1`
      )
      .get(id, this.manifest.libraryId) as SmartFolderRow | undefined;
    return row ? mapSmartFolder(row, this.manifest.libraryId) : null;
  }

  createSmartFolder(name: string, query: SmartFolderQuery): SmartFolderRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO smart_folders (id, library_id, name, query_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, this.manifest.libraryId, name.trim(), JSON.stringify(query), now, now);

    const folder = this.getSmartFolder(id);
    if (!folder) {
      throw new Error('Smart folder creation failed.');
    }
    return folder;
  }

  deleteSmartFolder(id: string): void {
    this.db.prepare('DELETE FROM smart_folders WHERE id = ? AND library_id = ?').run(id, this.manifest.libraryId);
  }

  createExportJob(name: string, outputPath: string, assetCount: number, status = 'completed'): void {
    this.db
      .prepare(
        `INSERT INTO export_jobs (id, name, output_path, asset_count, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(crypto.randomUUID(), name, outputPath, assetCount, status, new Date().toISOString());
  }

  resolvePath(relativePath: string): string {
    return fromLibraryRelative(this.rootPath, relativePath);
  }

  private migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    const migrationsDir = resolveResourcePath('migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const alreadyApplied = this.db.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(file);
      if (alreadyApplied) {
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const applyMigration = this.db.transaction(() => {
        this.db.exec(sql);
        this.db
          .prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)')
          .run(file, new Date().toISOString());
      });
      applyMigration();
    }
  }

  private upsertLibrary(): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO libraries (id, name, root_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, root_path = excluded.root_path, updated_at = excluded.updated_at`
      )
      .run(this.manifest.libraryId, this.manifest.name, '.', this.manifest.createdAt, now);
  }

  private seedDefaultTags(defaultTags: DefaultTag[]): void {
    const seedSetting = this.db
      .prepare('SELECT value_json FROM settings WHERE key = ?')
      .get('default_tags_seeded') as { value_json: string } | undefined;
    if (seedSetting) {
      return;
    }

    const existing = this.db
      .prepare('SELECT COUNT(*) AS count FROM tags WHERE library_id IS NULL OR library_id = ?')
      .get(this.manifest.libraryId) as { count: number };
    if (existing.count > 0) {
      this.db
        .prepare('INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
        .run('default_tags_seeded', JSON.stringify(true), new Date().toISOString());
      return;
    }

    const now = new Date().toISOString();
    const statement = this.db.prepare(
      `INSERT OR IGNORE INTO tags (id, library_id, name, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const seed = this.db.transaction(() => {
      for (const tag of defaultTags) {
        statement.run(crypto.randomUUID(), this.manifest.libraryId, tag.name, tag.color, now, now);
      }
      this.db
        .prepare('INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
        .run('default_tags_seeded', JSON.stringify(true), now);
    });
    seed();
  }

  private filterExistingTagIds(tagIds: string[]): string[] {
    if (tagIds.length === 0) {
      return [];
    }

    const placeholders = tagIds.map(() => '?').join(',');
    return this.db
      .prepare(`SELECT id FROM tags WHERE id IN (${placeholders}) AND (library_id IS NULL OR library_id = ?)`)
      .all(...tagIds, this.manifest.libraryId)
      .map((row) => (row as { id: string }).id);
  }

  private appendSmartFolderWhere(
    where: string[],
    params: Record<string, unknown>,
    query: SmartFolderQuery
  ): void {
    const clauses: string[] = [];
    query.conditions.forEach((condition, index) => {
      const key = `smart${index}`;
      const operator = condition.operator;

      switch (condition.field) {
        case 'tag':
          if (typeof condition.value === 'string' && condition.value.trim()) {
            params[key] = operator === 'contains' ? `%${condition.value.trim().toLowerCase()}%` : condition.value.trim();
            clauses.push(`EXISTS (
              SELECT 1
              FROM asset_tags sfat
              JOIN tags sft ON sft.id = sfat.tag_id
              WHERE sfat.asset_id = a.id
                AND ${
                  operator === 'contains'
                    ? `LOWER(sft.name) LIKE @${key}`
                    : `sft.name = @${key}`
                }
            )`);
          }
          break;
        case 'rating':
        case 'width':
        case 'height': {
          const numericValue = Number(condition.value);
          if (Number.isFinite(numericValue)) {
            params[key] = numericValue;
            const column = condition.field === 'rating' ? 'a.rating' : `a.${condition.field}`;
            clauses.push(`${column} ${operator === '>=' ? '>=' : '='} @${key}`);
          }
          break;
        }
        case 'favorite':
          params[key] = condition.value ? 1 : 0;
          clauses.push(`a.is_favorite = @${key}`);
          break;
        case 'recentDays': {
          const days = Math.max(1, Number(condition.value) || 1);
          const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
          params[key] = since;
          clauses.push(`a.imported_at >= @${key}`);
          break;
        }
        case 'mediaType':
        case 'extension': {
          if (typeof condition.value === 'string' && condition.value.trim()) {
            params[key] = condition.value.trim().toLowerCase();
            const column = condition.field === 'mediaType' ? 'a.media_type' : 'a.extension';
            clauses.push(`LOWER(${column}) = @${key}`);
          }
          break;
        }
        case 'orientation':
          if (condition.value === 'landscape') {
            clauses.push('a.width IS NOT NULL AND a.height IS NOT NULL AND a.width > a.height');
          } else if (condition.value === 'portrait') {
            clauses.push('a.width IS NOT NULL AND a.height IS NOT NULL AND a.width < a.height');
          } else if (condition.value === 'square') {
            clauses.push('a.width IS NOT NULL AND a.height IS NOT NULL AND a.width = a.height');
          }
          break;
        case 'memo':
        case 'sourceUrl': {
          const column = condition.field === 'memo' ? 'a.memo' : 'a.source_url';
          if (operator === 'exists') {
            clauses.push(`TRIM(${column}) <> ''`);
          } else if (typeof condition.value === 'string' && condition.value.trim()) {
            params[key] = `%${condition.value.trim().toLowerCase()}%`;
            clauses.push(`LOWER(${column}) LIKE @${key}`);
          }
          break;
        }
        default:
          break;
      }
    });

    if (clauses.length > 0) {
      const joiner = query.mode === 'any' ? ' OR ' : ' AND ';
      where.push(`(${clauses.join(joiner)})`);
    }
  }

  private mapDuplicateGroup(row: {
    hash: string;
    file_count: number;
    total_size_bytes: number;
    largest_size_bytes: number;
    status: DuplicateResolutionStatus;
    keep_asset_id: string | null;
    note: string;
    resolved_at: string | null;
    ignored_at: string | null;
  }): DuplicateGroup {
    const assets = this.db
      .prepare(
        `SELECT *
         FROM assets
         WHERE library_id = ? AND hash = ? AND is_deleted = 0 AND permanently_deleted_at IS NULL
         ORDER BY imported_at ASC`
      )
      .all(this.manifest.libraryId, row.hash)
      .map((assetRow) => this.mapAsset(assetRow as AssetRow));

    return {
      hash: row.hash,
      assets,
      fileCount: row.file_count,
      totalSizeBytes: row.total_size_bytes,
      reclaimableBytes: Math.max(0, row.total_size_bytes - row.largest_size_bytes),
      status: row.status,
      keepAssetId: row.keep_asset_id,
      note: row.note,
      resolvedAt: row.resolved_at,
      ignoredAt: row.ignored_at
    };
  }

  private mapAsset(row: AssetRow): AssetRecord {
    const tags = this.db
      .prepare(
        `SELECT t.*
         FROM tags t
         JOIN asset_tags at ON at.tag_id = t.id
         WHERE at.asset_id = ?
         ORDER BY t.name ASC`
      )
      .all(row.id) as TagRow[];

    const collections = this.db
      .prepare(
        `SELECT c.*
         FROM collections c
         JOIN collection_assets ca ON ca.collection_id = c.id
         WHERE ca.asset_id = ?
         ORDER BY c.created_at DESC`
      )
      .all(row.id) as CollectionRow[];

    const colors = this.db
      .prepare('SELECT * FROM asset_colors WHERE asset_id = ? ORDER BY sort_order ASC')
      .all(row.id) as AssetColorRow[];

    return {
      id: row.id,
      libraryId: row.library_id,
      title: row.title,
      originalFileName: row.original_file_name,
      storedFilePath: row.stored_file_path,
      thumbnailPath: row.thumbnail_path,
      previewPath: row.preview_path,
      mediaType: row.media_type,
      mimeType: row.mime_type,
      extension: row.extension,
      sizeBytes: row.size_bytes,
      width: row.width,
      height: row.height,
      durationMs: row.duration_ms,
      hash: row.hash,
      perceptualHash: row.perceptual_hash,
      rating: row.rating,
      memo: row.memo,
      sourceUrl: row.source_url,
      isFavorite: Boolean(row.is_favorite),
      isDeleted: Boolean(row.is_deleted),
      originalRelativePath: row.original_relative_path,
      importBatchId: row.import_batch_id,
      deletedAt: row.deleted_at,
      permanentlyDeletedAt: row.permanently_deleted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      importedAt: row.imported_at,
      tags: tags.map(mapTag),
      collections: collections.map((collection) => mapCollection(collection, this.rootPath)),
      colors: colors.map(mapColor),
      storedFileUrl: relativeToFileUrl(this.rootPath, row.stored_file_path) ?? '',
      thumbnailUrl: relativeToFileUrl(this.rootPath, row.thumbnail_path),
      previewUrl: relativeToFileUrl(this.rootPath, row.preview_path)
    };
  }
}

function getAssetOrderSql(sort: AssetListQuery['sort'], collectionId: string | null = null): string {
  const normalized = normalizeAssetSort(sort);
  if (collectionId && normalized.field === 'collectionOrder') {
    return `ORDER BY (
      SELECT ca_order.sort_order
      FROM collection_assets ca_order
      WHERE ca_order.asset_id = a.id
        AND ca_order.collection_id = @collectionId
      LIMIT 1
    ) ${normalized.direction.toUpperCase()}, a.imported_at DESC, a.id DESC`;
  }

  const direction = normalized.direction.toUpperCase();
  switch (normalized.field) {
    case 'importedAt':
      return `ORDER BY a.imported_at ${direction}, a.id ${direction}`;
    case 'title':
      return `ORDER BY LOWER(a.title) ${direction}, LOWER(a.original_file_name) ${direction}, a.imported_at DESC`;
    case 'sizeBytes':
      return `ORDER BY a.size_bytes ${direction}, a.imported_at DESC`;
    case 'pixelCount':
      return `ORDER BY COALESCE(a.width, 0) * COALESCE(a.height, 0) ${direction}, a.imported_at DESC`;
    case 'rating':
      return `ORDER BY a.rating ${direction}, a.imported_at DESC`;
    case 'extension':
      return `ORDER BY LOWER(a.extension) ${direction}, LOWER(a.title) ASC, a.imported_at DESC`;
    case 'collectionOrder':
      return 'ORDER BY a.imported_at DESC, a.id DESC';
    default:
      return 'ORDER BY a.imported_at DESC, a.id DESC';
  }
}

function normalizeAssetSort(sort: AssetListQuery['sort']): AssetSort {
  if (typeof sort === 'object' && sort) {
    const direction = sort.direction === 'asc' ? 'asc' : 'desc';
    if (['importedAt', 'title', 'sizeBytes', 'pixelCount', 'rating', 'extension', 'collectionOrder'].includes(sort.field)) {
      return { field: sort.field, direction };
    }
  }

  switch (sort) {
    case 'importedAsc':
      return { field: 'importedAt', direction: 'asc' };
    case 'titleAsc':
      return { field: 'title', direction: 'asc' };
    case 'titleDesc':
      return { field: 'title', direction: 'desc' };
    case 'ratingDesc':
      return { field: 'rating', direction: 'desc' };
    case 'ratingAsc':
      return { field: 'rating', direction: 'asc' };
    case 'sizeDesc':
      return { field: 'sizeBytes', direction: 'desc' };
    case 'sizeAsc':
      return { field: 'sizeBytes', direction: 'asc' };
    case 'extensionAsc':
      return { field: 'extension', direction: 'asc' };
    case 'pixelCountDesc':
      return { field: 'pixelCount', direction: 'desc' };
    case 'pixelCountAsc':
      return { field: 'pixelCount', direction: 'asc' };
    case 'importedDesc':
    default:
      return { field: 'importedAt', direction: 'desc' };
  }
}

function appendListFilter(
  where: string[],
  params: Record<string, unknown>,
  keyPrefix: string,
  column: string,
  values: string[] | undefined
): void {
  const normalizedValues = uniqueStrings((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (normalizedValues.length === 0) {
    return;
  }

  const keys = normalizedValues.map((value, index) => {
    const key = `${keyPrefix}${index}`;
    params[key] = value;
    return `@${key}`;
  });
  where.push(`LOWER(${column}) IN (${keys.join(', ')})`);
}

function mergeAssetMemos(target: AssetRecord, sources: AssetRecord[]): string {
  const parts = [target.memo.trim()].filter(Boolean);
  for (const source of sources) {
    const sourceMemo = source.memo.trim();
    if (sourceMemo && !parts.includes(sourceMemo)) {
      parts.push(`--- ${source.originalFileName} ---\n${sourceMemo}`);
    }
    if (source.sourceUrl.trim() && source.sourceUrl !== target.sourceUrl) {
      parts.push(`--- ${source.originalFileName} source URL ---\n${source.sourceUrl}`);
    }
  }
  return parts.join('\n\n');
}

function mergeSourceUrl(target: AssetRecord, sources: AssetRecord[]): string {
  if (target.sourceUrl.trim()) {
    return target.sourceUrl;
  }
  return sources.find((asset) => asset.sourceUrl.trim())?.sourceUrl ?? '';
}

function mapTag(row: TagRow): TagRecord {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    assetCount: row.asset_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCollection(row: CollectionRow, rootPath?: string): CollectionRecord {
  const coverPath = row.cover_thumbnail_path ?? row.cover_stored_file_path ?? null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    coverAssetId: row.cover_asset_id ?? null,
    coverAssetThumbnailUrl: rootPath && coverPath ? relativeToFileUrl(rootPath, coverPath) : null,
    coverAssetTitle: row.cover_title ?? null,
    assetCount: row.asset_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapColor(row: AssetColorRow): AssetColor {
  return {
    id: row.id,
    assetId: row.asset_id,
    color: row.color,
    population: row.population,
    sortOrder: row.sort_order
  };
}

function mapImportBatch(row: ImportBatchRow): ImportBatchRecord {
  return {
    id: row.id,
    libraryId: row.library_id,
    sourceType: row.source_type,
    sourcePath: row.source_path,
    totalCount: row.total_count,
    importedCount: row.imported_count,
    skippedCount: row.skipped_count,
    failedCount: row.failed_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    status: row.status,
    metrics: parseJsonObject<Partial<ImportMetrics>>(row.metrics_json, {})
  };
}

function mapSmartFolder(row: SmartFolderRow, fallbackLibraryId: string): SmartFolderRecord {
  return {
    id: row.id,
    libraryId: row.library_id ?? fallbackLibraryId,
    name: row.name,
    query: parseJsonObject<SmartFolderQuery>(row.query_json, { mode: 'all', conditions: [] }),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseJsonObject<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function createBatchResult(requestedCount: number): AssetBatchOperationResult {
  return {
    requestedCount,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    affectedAssetIds: [],
    failures: [],
    warnings: []
  };
}

function pushBatchFailure(
  result: AssetBatchOperationResult,
  assetId: string | null,
  title: string | undefined,
  code: string,
  message: string,
  target?: string
): void {
  result.failedCount += 1;
  result.failures.push({ assetId, title, code, message, target });
}

function failAll(
  assetIds: string[],
  result: AssetBatchOperationResult,
  code: string,
  message: string
): AssetBatchOperationResult {
  for (const assetId of assetIds) {
    pushBatchFailure(result, assetId, undefined, code, message);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
