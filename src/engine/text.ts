/**
 * Language helpers for text the engine writes into the save (news, inbox
 * events, transactions, objectives…). Generated text is produced in the
 * career's language at creation time: Russian for "ru" (and old saves
 * without a language), English for every other locale — the same rule the
 * UI uses for `tr(ru, en)`. Russian text already stored in old saves keeps
 * displaying and is still mapped by the runtime catalog in English mode.
 */
type WithLanguage = { language?: string } | null | undefined;

export const isRussian = (g: WithLanguage) =>
  !g?.language || g.language === "ru";

/** Pick the Russian or English variant for the career's language. */
export const tx = (g: WithLanguage, ru: string, en: string) =>
  isRussian(g) ? ru : en;

export type Tx = (ru: string, en: string) => string;

/** Bind `tx` to a career: `const t = textFor(g); t("Привет", "Hello")`. */
export const textFor =
  (g: WithLanguage): Tx =>
  (ru, en) =>
    tx(g, ru, en);

/** English plural helper: plural(3, "game") → "3 games". */
export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** Russian plural helper: ruPlural(5, "игрок", "игрока", "игроков"). */
export function ruPlural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? one
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? few
        : many;
  return `${n} ${word}`;
}
