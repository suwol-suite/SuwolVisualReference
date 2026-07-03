import { performance } from 'node:perf_hooks';
import { LibraryService } from './services/library-service';

export async function runLibraryPerfTest(rootPath: string): Promise<void> {
  const libraryService = new LibraryService();
  const library = await libraryService.openLibrary(rootPath);
  const db = libraryService.requireDb();
  const checks = [
    measure('first-page-500', () => db.queryAssets({ limit: 500, offset: 0 })),
    measure('second-page-500', () => db.queryAssets({ limit: 500, offset: 500 })),
    measure('search-ui-500', () => db.queryAssets({ search: 'ui', limit: 500, offset: 0 })),
    measure('duplicate-groups', () => db.listDuplicateGroups())
  ];

  console.log(
    JSON.stringify(
      {
        ok: true,
        library,
        checks: checks.map((check) => ({
          name: check.name,
          durationMs: check.durationMs,
          totalCount: 'totalCount' in check.result ? check.result.totalCount : undefined,
          returned:
            'items' in check.result
              ? check.result.items.length
              : Array.isArray(check.result)
                ? check.result.length
                : undefined,
          hasMore: 'hasMore' in check.result ? check.result.hasMore : undefined
        }))
      },
      null,
      2
    )
  );
}

function measure<T>(name: string, task: () => T): { name: string; durationMs: number; result: T } {
  const startedAt = performance.now();
  const result = task();
  return {
    name,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    result
  };
}
