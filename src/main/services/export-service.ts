import fs from 'node:fs/promises';
import path from 'node:path';
import type { LocaleCode } from '@shared/i18n/types';
import type {
  AssetRecord,
  ExportInput,
  ExportPreset,
  ExportResult,
  ExportTemplateDefinition,
  ExportTemplatePreviewInput,
  ExportTemplatePreviewResult,
  ExportTemplateRecord,
  ExportTemplateSaveInput
} from '@shared/types';
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

  listTemplates(locale?: LocaleCode): ExportTemplateRecord[] {
    const customTemplates = this.libraryService.requireDb().listExportTemplates();
    return [createBuiltinTemplateRecord(locale), ...customTemplates];
  }

  saveTemplate(input: ExportTemplateSaveInput): ExportTemplateRecord {
    return this.libraryService.requireDb().saveExportTemplate(input);
  }

  deleteTemplate(id: string): void {
    if (isBuiltinTemplateId(id)) {
      throw new Error('Built-in export templates are read-only.');
    }
    this.libraryService.requireDb().deleteExportTemplate(id);
  }

  previewTemplate(input: ExportTemplatePreviewInput): ExportTemplatePreviewResult {
    const assets = this.resolveAssets(input.input);
    const preset = input.input.presetId
      ? loadExportPresets(input.input.locale).find((candidate) => candidate.id === input.input.presetId)
      : null;
    const effectiveInput = applyExportPreset(input.input, preset ?? null);
    const referenceLines = assets.map((asset, index) => `* ./refs/${getExportRefFileName(asset, index)}`);
    const memoLines = assets.map((asset, index) => formatAssetMemo(asset, getExportRefFileName(asset, index), input.input.locale));
    const colorLines = buildColorLines(assets);
    const warnings: string[] = [];
    const template = input.template ?? this.resolveTemplate(input.templateId, input.input.locale)?.template ?? createBuiltinTemplateRecord(input.input.locale).template;
    const markdown = buildTemplateMarkdown(effectiveInput, template, assets, referenceLines, memoLines, colorLines, warnings);
    return { markdown, warnings };
  }

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

    for (const [index, asset] of assets.entries()) {
      const refFileName = getExportRefFileName(asset, index);
      await fs.copyFile(db.resolvePath(asset.storedFilePath), path.join(refsPath, refFileName));
      referenceLines.push(`* ./refs/${refFileName}`);
      memoLines.push(formatAssetMemo(asset, refFileName, input.locale));
    }

    const colorLines = buildColorLines(assets);
    const template = readExportTemplate(input.locale);
    const preset = input.presetId
      ? loadExportPresets(input.locale).find((candidate) => candidate.id === input.presetId)
      : null;
    const effectiveInput = applyExportPreset(input, preset ?? null);
    const warnings: string[] = [];
    const customTemplate = input.templateId ? this.resolveTemplate(input.templateId, input.locale) : null;
    const effectiveTemplate = customTemplate
      ? customTemplate.template
      : preset
        ? { ...template, fileName: preset.outputFileName, sections: preset.sections }
        : template;
    const markdown = customTemplate
      ? buildTemplateMarkdown(effectiveInput, effectiveTemplate as ExportTemplateDefinition, assets, referenceLines, memoLines, colorLines, warnings)
      : buildMarkdown(effectiveInput, effectiveTemplate as ExportTemplate, referenceLines, memoLines, colorLines);
    const outputFileName = normalizeMarkdownFileName(
      effectiveInput.outputFileName ||
        (customTemplate ? customTemplate.template.defaults.outputFileName : '') ||
        preset?.outputFileName ||
        template.fileName
    );
    const markdownPath = path.join(exportRoot, outputFileName);
    await fs.writeFile(markdownPath, markdown, 'utf8');
    db.createExportJob(input.name, exportRoot, assets.length);

    return {
      exportPath: exportRoot,
      markdownPath,
      refsPath,
      assetCount: assets.length,
      warnings
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

  private resolveTemplate(id: string | undefined, locale?: LocaleCode): ExportTemplateRecord | null {
    if (!id) {
      return null;
    }
    if (isBuiltinTemplateId(id)) {
      return createBuiltinTemplateRecord(locale);
    }
    return this.libraryService.requireDb().getExportTemplate(id);
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

function createBuiltinTemplateRecord(locale?: LocaleCode): ExportTemplateRecord {
  const legacyTemplate = readExportTemplate(locale);
  const now = new Date(0).toISOString();
  return {
    id: 'builtin-codex-default',
    libraryId: null,
    name: legacyTemplate.name,
    description: 'Read-only default Codex Markdown template.',
    format: 'codex-markdown',
    template: {
      defaults: {
        outputFileName: legacyTemplate.fileName
      },
      sections: legacyTemplate.sections.map((section) => ({
        id: section,
        name: legacyTemplate.sectionLabels[section] ?? section,
        enabled: true,
        body: getBuiltinSectionBody(section, legacyTemplate)
      }))
    },
    isBuiltin: true,
    createdAt: now,
    updatedAt: now
  };
}

function getBuiltinSectionBody(section: string, template: ExportTemplate): string {
  switch (section) {
    case 'goal':
      return '{{goal}}';
    case 'references':
      return '{{references}}';
    case 'assetNotes':
      return '{{assetNotes}}';
    case 'commonTraits':
      return '{{commonFeatures}}';
    case 'instructions':
      return '{{applyInstructions}}';
    case 'constraints':
      return '{{forbiddenRules}}';
    case 'colorReferences':
      return '{{colors}}';
    case 'codexInstructions':
      return template.codexInstructions;
    default:
      return `{{${section}}}`;
  }
}

function isBuiltinTemplateId(id: string): boolean {
  return id === 'builtin-codex-default' || id.startsWith('builtin-');
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

function buildTemplateMarkdown(
  input: ExportInput,
  template: ExportTemplateDefinition,
  assets: AssetRecord[],
  references: string[],
  memoLines: string[],
  colorLines: string[],
  warnings: string[]
): string {
  const context: Record<string, string> = {
    title: input.name,
    goal: input.goal.trim(),
    references: references.join('\n'),
    assetList: buildAssetList(assets),
    assetNotes: memoLines.join('\n\n'),
    tags: buildTagSummary(assets),
    colors: colorLines.join('\n') || '',
    commonFeatures: input.commonTraits.trim(),
    applyInstructions: input.instructions.trim(),
    forbiddenRules: input.constraints.trim(),
    generatedAt: new Date().toISOString()
  };
  const seenUnknown = new Set<string>();
  const lines = [`# ${input.name}`, ''];

  for (const section of template.sections) {
    if (!section.enabled) {
      continue;
    }
    const title = section.name.trim() || section.id;
    const body = renderPlaceholders(section.body, context, seenUnknown);
    lines.push(`## ${title}`, '', body, '');
  }

  for (const placeholder of seenUnknown) {
    warnings.push(`Unknown placeholder: {{${placeholder}}}`);
  }

  return lines.join('\n');
}

function renderPlaceholders(body: string, context: Record<string, string>, unknown: Set<string>): string {
  return body.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/gu, (_match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      return context[key] ?? '';
    }
    unknown.add(key);
    return '';
  });
}

function buildAssetList(assets: AssetRecord[]): string {
  return assets
    .map((asset, index) => {
      const dimensions = asset.width && asset.height ? `${asset.width}x${asset.height}` : 'unknown size';
      const tags = asset.tags.map((tag) => tag.name).join(', ') || 'none';
      return `* ${index + 1}. ${asset.originalFileName} (${asset.extension}, ${dimensions}, tags: ${tags})`;
    })
    .join('\n');
}

function buildTagSummary(assets: AssetRecord[]): string {
  const tags = [...new Set(assets.flatMap((asset) => asset.tags.map((tag) => tag.name)))].sort((left, right) =>
    left.localeCompare(right)
  );
  return tags.length > 0 ? tags.map((tag) => `* ${tag}`).join('\n') : '';
}

function buildColorLines(assets: AssetRecord[]): string[] {
  return assets
    .filter((asset) => asset.colors.length > 0)
    .map((asset) => `* ${asset.originalFileName}: ${asset.colors.map((color) => color.color).join(', ')}`);
}

function getExportRefFileName(asset: AssetRecord, index: number): string {
  return `main_${String(index + 1).padStart(3, '0')}.${asset.extension}`;
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
