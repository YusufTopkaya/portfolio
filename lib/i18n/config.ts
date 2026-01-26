export interface Language {
  code: string;
  name: string;
  nativeName: string;
  locale: string;
  direction: "ltr" | "rtl";
}

export const languages: Language[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    locale: "en-US",
    direction: "ltr",
  },
  {
    code: "tr",
    name: "Turkish",
    nativeName: "Türkçe",
    locale: "tr-TR",
    direction: "ltr",
  },
  {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    locale: "de-DE",
    direction: "ltr",
  },
  {
    code: "fr",
    name: "French",
    nativeName: "Français",
    locale: "fr-FR",
    direction: "ltr",
  },
  {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    locale: "es-ES",
    direction: "ltr",
  },
  {
    code: "nl",
    name: "Dutch",
    nativeName: "Nederlands",
    locale: "nl-NL",
    direction: "ltr",
  },
  {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    locale: "pt-BR",
    direction: "ltr",
  },
  {
    code: "it",
    name: "Italian",
    nativeName: "Italiano",
    locale: "it-IT",
    direction: "ltr",
  },
  {
    code: "pl",
    name: "Polish",
    nativeName: "Polski",
    locale: "pl-PL",
    direction: "ltr",
  },
  {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    locale: "ja-JP",
    direction: "ltr",
  },
  {
    code: "ko",
    name: "Korean",
    nativeName: "한국어",
    locale: "ko-KR",
    direction: "ltr",
  },
  {
    code: "zh",
    name: "Chinese",
    nativeName: "简体中文",
    locale: "zh-CN",
    direction: "ltr",
  },
  {
    code: "ru",
    name: "Russian",
    nativeName: "Русский",
    locale: "ru-RU",
    direction: "ltr",
  },
];

export const defaultLanguage = "en";
export const defaultLocale = "en-US";

export const languageCodes = languages.map((lang) => lang.code);
export const locales = languages.map((lang) => lang.locale);

export function isValidLanguage(lang: string): boolean {
  return languageCodes.includes(lang);
}

export function getLanguageByCode(code: string): Language | undefined {
  return languages.find((l) => l.code === code);
}

export function getLocaleByLanguage(lang: string): string {
  return getLanguageByCode(lang)?.locale || defaultLocale;
}

export function formatDate(date: string | Date, lang: string): string {
  const locale = getLocaleByLanguage(lang);
  return new Date(date).toLocaleDateString(locale);
}
