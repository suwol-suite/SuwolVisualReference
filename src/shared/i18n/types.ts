export type LocaleCode = 'ko' | 'en';

export type LanguagePreference = LocaleCode | 'system';

export type LanguageOption = {
  code: LocaleCode;
  nativeName: string;
  englishName: string;
};

