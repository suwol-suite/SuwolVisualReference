import type { AppConfig, ExportPreset, TagRecord } from '@shared/types';
import type { LocaleCode } from '@shared/i18n/types';
import { readJsonResource } from './resource-paths';

export type DefaultTag = Pick<TagRecord, 'name' | 'color'>;

export function loadAppConfig(): AppConfig {
  const appConfig = readJsonResource<Omit<AppConfig, 'appVersion' | 'appDescription' | 'appLicense'>>('config/app.config.json');
  const packageMetadata = readJsonResource<{
    version?: string;
    description?: string;
    license?: string;
  }>('package.json');
  return {
    ...appConfig,
    appVersion: packageMetadata.version ?? '0.0.0',
    appDescription: packageMetadata.description ?? '',
    appLicense: packageMetadata.license ?? ''
  };
}

export function loadDefaultTags(): DefaultTag[] {
  return readJsonResource<DefaultTag[]>('config/default-tags.json');
}

export function loadExportPresets(locale?: LocaleCode): ExportPreset[] {
  if (locale) {
    try {
      return readJsonResource<ExportPreset[]>(`config/export-presets.${locale}.json`);
    } catch {
      // Fall back to the language-neutral preset file when a locale has not been added yet.
    }
  }
  return readJsonResource<ExportPreset[]>('config/export-presets.json');
}
