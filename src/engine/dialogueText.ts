/**
 * Shared helpers for bilingual dialogue content (player conversations and
 * press conferences). Every line is authored in both Russian and English at
 * the source; the UI picks the language from `game.language` instead of
 * relying on the DOM runtime translator.
 */
export type L = { ru: string; en: string };
export type DialogueLang = "ru" | "en";

/** Russian for "ru", English for every other interface language. */
export const dialogueLang = (language?: string): DialogueLang =>
  language === "ru" ? "ru" : "en";

export const say = (text: L | undefined, lang: DialogueLang) =>
  text ? text[lang] || text.ru || text.en : "";

/** FNV-style string hash; deterministic and independent of Math.random. */
export function hashText(value: string) {
  let result = 2166136261;
  for (const char of value)
    result = Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0;
  return result >>> 0;
}

export function pickBy<T>(items: readonly T[], seed: string): T {
  return items[hashText(seed) % items.length];
}

/** Picks `count` distinct items in a stable, seed-dependent order. */
export function pickManyBy<T>(
  items: readonly T[],
  seed: string,
  count: number,
) {
  return [...items]
    .map((item, index) => ({ item, key: hashText(`${seed}:${index}`) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map((entry) => entry.item);
}

export function ruPlural(n: number, one: string, few: string, many: string) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export const enPlural = (n: number, one: string, many: string) =>
  n === 1 ? one : many;

export const joinL = (...parts: (L | undefined | false)[]): L => {
  const present = parts.filter(Boolean) as L[];
  return {
    ru: present
      .map((part) => part.ru)
      .filter(Boolean)
      .join(" "),
    en: present
      .map((part) => part.en)
      .filter(Boolean)
      .join(" "),
  };
};

export const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;
/** Wraps a quotation in the typographic quotes of the language. */
export const quote = (text: string, language?: string) =>
  dialogueLang(language) === "ru" ? `«${text}»` : `“${text}”`;
