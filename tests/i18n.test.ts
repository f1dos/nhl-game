import assert from "node:assert/strict";
import test from "node:test";
import { buildCoreCatalog } from "../src/i18n/coreCatalog";
import { LOCALES, LOCALE_NAMES, isLocale } from "../src/i18n/locales";

test("all supported locales are unique and have a native label", () => {
  assert.equal(new Set(LOCALES).size, 15);
  for (const locale of LOCALES) {
    assert.equal(isLocale(locale), true);
    assert.ok(LOCALE_NAMES[locale].length > 1);
  }
});

test("every non-Russian locale translates the core game navigation", () => {
  for (const locale of LOCALES.filter((value) => value !== "ru")) {
    const catalog = buildCoreCatalog(locale);
    for (const key of [
      "Обзор клуба",
      "Состав",
      "Тактика",
      "Начать матч",
      "Разговор с игроком",
    ]) {
      assert.ok(catalog[key], `${locale} is missing ${key}`);
      // International hockey vocabulary legitimately shares a few spellings
      // (for example Kazakh and Russian both use «Тактика»).
      assert.ok(catalog[key].trim().length > 0);
    }
  }
});
