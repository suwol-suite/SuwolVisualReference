import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  FALLBACK_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isLanguagePreference,
  resolveLanguagePreference
} from '@shared/i18n/languages';
import type { LanguagePreference, LocaleCode } from '@shared/i18n/types';
import enCommon from './locales/en/common.json';
import enErrors from './locales/en/errors.json';
import enExport from './locales/en/export.json';
import enSettings from './locales/en/settings.json';
import koCommon from './locales/ko/common.json';
import koErrors from './locales/ko/errors.json';
import koExport from './locales/ko/export.json';
import koSettings from './locales/ko/settings.json';

const resources = {
  ko: {
    common: koCommon,
    settings: koSettings,
    export: koExport,
    errors: koErrors
  },
  en: {
    common: enCommon,
    settings: enSettings,
    export: enExport,
    errors: enErrors
  }
} as const;

export function getStoredLanguagePreference(): LanguagePreference {
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguagePreference(stored) ? stored : 'system';
}

export function resolveRendererLanguage(preference = getStoredLanguagePreference()): LocaleCode {
  return resolveLanguagePreference(preference, [...window.navigator.languages, window.navigator.language]);
}

export function getActiveLanguage(): LocaleCode {
  const language = i18n.resolvedLanguage || i18n.language;
  return language?.startsWith('en') ? 'en' : 'ko';
}

export async function changeLanguagePreference(preference: LanguagePreference): Promise<LocaleCode> {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  const nextLanguage = resolveRendererLanguage(preference);
  await i18n.changeLanguage(nextLanguage);
  document.documentElement.lang = nextLanguage;
  return nextLanguage;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveRendererLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  defaultNS: 'common',
  ns: ['common', 'settings', 'export', 'errors'],
  interpolation: {
    escapeValue: false
  },
  react: {
    useSuspense: false
  }
});

document.documentElement.lang = resolveRendererLanguage();

export default i18n;

