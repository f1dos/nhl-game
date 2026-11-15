export const LOCALES = [
  "ru",
  "en",
  "sv",
  "zh",
  "de",
  "fr",
  "fi",
  "cs",
  "lv",
  "da",
  "no",
  "es",
  "pt",
  "it",
  "kk",
] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
  sv: "Svenska",
  zh: "中文",
  de: "Deutsch",
  fr: "Français",
  fi: "Suomi",
  cs: "Čeština",
  lv: "Latviešu",
  da: "Dansk",
  no: "Norsk",
  es: "Español",
  pt: "Português",
  it: "Italiano",
  kk: "Қазақша",
};

export const isLocale = (value: string): value is Locale =>
  LOCALES.includes(value as Locale);
