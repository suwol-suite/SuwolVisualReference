import type { LanguageOption, LanguagePreference, LocaleCode } from './types';

export const FALLBACK_LANGUAGE: LocaleCode = 'ko';

export const LANGUAGE_STORAGE_KEY = 'app.language';

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'ko', nativeName: '한국어', englishName: 'Korean' },
  { code: 'en', nativeName: 'English', englishName: 'English' }
];

export function isLocaleCode(value: string | null | undefined): value is LocaleCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === value);
}

export function isLanguagePreference(value: string | null | undefined): value is LanguagePreference {
  return value === 'system' || isLocaleCode(value);
}

export function resolveLanguagePreference(
  preference: LanguagePreference | null | undefined,
  localeCandidates: string[]
): LocaleCode {
  if (preference && preference !== 'system') {
    return preference;
  }

  for (const candidate of localeCandidates) {
    const normalized = candidate.toLowerCase();
    if (normalized.startsWith('ko')) {
      return 'ko';
    }
    if (normalized.startsWith('en')) {
      return 'en';
    }
  }

  return FALLBACK_LANGUAGE;
}

