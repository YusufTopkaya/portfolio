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
