import fs from 'node:fs/promises';
import path from 'node:path';
import type { LocaleCode } from '@shared/i18n/types';
import type { AssetRecord, ExportInput, ExportPreset, ExportResult } from '@shared/types';
import { loadExportPresets } from './config-service';
import type { LibraryService } from './library-service';
import { safeFileName } from './path-utils';
import { readJsonResource } from './resource-paths';

type ExportTemplate = {
  id: string;
  name: string;
  fileName: string;
  sectionLabels: Record<string, string>;
  codexInstructions: string;
  sections: string[];
};

export class ExportService {
  constructor(private readonly libraryService: LibraryService) {}

  async exportMarkdown(input: ExportInput): Promise<ExportResult> {
    const db = this.libraryService.requireDb();
    const manifest = this.libraryService.requireManifest();
    const exportName = safeFileName(input.name);
    const exportRoot = await this.getUniqueExportRoot(path.join(this.libraryService.requireRootPath(), manifest.paths.exports), exportName);
    const refsPath = path.join(exportRoot, 'refs');
    await fs.mkdir(refsPath, { recursive: true });

    const assets = this.resolveAssets(input);
    if (assets.length === 0) {
      throw new Error('Select at least one asset to export.');
    }

    const referenceLines: string[] = [];
    const memoLines: string[] = [];
    const colorLines: string[] = [];

    for (const [index, asset] of assets.entries()) {
      const refFileName = `main_${String(index + 1).padStart(3, '0')}.${asset.extension}`;
      await fs.copyFile(db.resolvePath(asset.storedFilePath), path.join(refsPath, refFileName));
      referenceLines.push(`* ./refs/${refFileName}`);
      memoLines.push(formatAssetMemo(asset, refFileName, input.locale));
      if (asset.colors.length > 0) {
        colorLines.push(`* ${asset.originalFileName}: ${asset.colors.map((color) => color.color).join(', ')}`);
      }
    }

    const template = readExportTemplate(input.locale);
    const preset = input.presetId
      ? loadExportPresets(input.locale).find((candidate) => candidate.id === input.presetId)
      : null;
    const effectiveInput = applyExportPreset(input, preset ?? null);
    const effectiveTemplate = preset
      ? { ...template, fileName: preset.outputFileName, sections: preset.sections }
      : template;
    const markdown = buildMarkdown(effectiveInput, effectiveTemplate, referenceLines, memoLines, colorLines);
    const outputFileName = normalizeMarkdownFileName(
      effectiveInput.outputFileName || preset?.outputFileName || template.fileName
    );
    const markdownPath = path.join(exportRoot, outputFileName);
    await fs.writeFile(markdownPath, markdown, 'utf8');
    db.createExportJob(input.name, exportRoot, assets.length);

    return {
      exportPath: exportRoot,
      markdownPath,
      refsPath,
      assetCount: assets.length
    };
  }

  private resolveAssets(input: ExportInput): AssetRecord[] {
    const db = this.libraryService.requireDb();
    if (input.collectionId) {
      return db.listAssets({ collectionId: input.collectionId });
    }

    return db.getAssetsByIds(input.assetIds ?? []);
  }

  private async getUniqueExportRoot(basePath: string, exportName: string): Promise<string> {
    let candidate = path.join(basePath, exportName);
    let suffix = 2;

    while (await exists(candidate)) {
      candidate = path.join(basePath, `${exportName}-${suffix}`);
      suffix += 1;
    }

    await fs.mkdir(candidate, { recursive: true });
    return candidate;
  }
}

function applyExportPreset(input: ExportInput, preset: ExportPreset | null): ExportInput {
  if (!preset) {
    return input;
  }

  return {
    ...input,
    goal: input.goal.trim() || preset.defaultGoal,
    instructions: input.instructions.trim() || preset.defaultApplyInstructions,
    constraints: input.constraints.trim() || preset.defaultForbiddenRules,
    outputFileName: input.outputFileName?.trim() || preset.outputFileName
  };
}

function readExportTemplate(locale?: LocaleCode): ExportTemplate {
  if (locale) {
    try {
      return readJsonResource<ExportTemplate>(`config/export-templates/codex.${locale}.json`);
    } catch {
      // Keep the existing neutral template as the fallback for future locales.
    }
  }

  return readJsonResource<ExportTemplate>('config/export-templates/codex.json');
}

function buildMarkdown(
  input: ExportInput,
  template: ExportTemplate,
  references: string[],
  memoLines: string[],
  colorLines: string[]
): string {
  const sectionContent: Record<string, string> = {
    goal: input.goal.trim(),
    references: references.join('\n'),
    assetNotes: memoLines.join('\n\n'),
    commonTraits: input.commonTraits.trim(),
    instructions: input.instructions.trim(),
    constraints: input.constraints.trim(),
    colorReferences: colorLines.join('\n') || (input.locale === 'ko' ? '* 팔레트 데이터가 없습니다.' : '* No palette data available.'),
    codexInstructions: template.codexInstructions
  };

  const lines = [`# ${input.name}`, ''];
  for (const section of template.sections) {
    lines.push(`## ${template.sectionLabels[section] ?? section}`, '', sectionContent[section] ?? '', '');
  }

  return lines.join('\n');
}

function formatAssetMemo(asset: AssetRecord, refFileName: string, locale?: LocaleCode): string {
  const isKorean = locale === 'ko';
  const tags = asset.tags.map((tag) => tag.name).join(', ') || (isKorean ? '없음' : 'none');
  const size = asset.width && asset.height ? `${asset.width}x${asset.height}` : isKorean ? '알 수 없는 크기' : 'unknown size';
  const memo = asset.memo.trim() || (isKorean ? '메모 없음.' : 'No memo.');

  return [
    `### ${refFileName}`,
    '',
    `* ${isKorean ? '원본' : 'Original'}: ${asset.originalFileName}`,
    `* ${isKorean ? '크기' : 'Size'}: ${size}`,
    `* ${isKorean ? '태그' : 'Tags'}: ${tags}`,
    `* ${isKorean ? '메모' : 'Memo'}: ${memo}`
  ].join('\n');
}

function normalizeMarkdownFileName(fileName: string): string {
  const safe = safeFileName(fileName.replace(/\.md$/i, ''));
  return `${safe}.md`;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
