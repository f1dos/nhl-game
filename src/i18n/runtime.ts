import type { Locale } from "./locales";
import { buildCoreCatalog } from "./coreCatalog";
import { englishMatch, englishDynamic } from "./englishMatch";

type Catalog = Record<string, string>;

let locale: Locale = "ru";
let catalog: Catalog = {};
let observer: MutationObserver | undefined;
let generation = 0;
const originalText = new WeakMap<Text, string>();
const renderedText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const translatedAttributes = ["placeholder", "title", "aria-label"] as const;
const machineCache = new Map<string, string>();
const pending = new Set<string>();

type BrowserTranslator = { translate: (text: string) => Promise<string> };
type TranslatorApi = {
  availability?: (options: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<string>;
  create: (options: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<BrowserTranslator>;
};
const translators = new Map<string, Promise<BrowserTranslator | null>>();

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

function translated(value: string) {
  const key = normalize(value);
  if (!key) return value;
  const next = catalog[key] ?? (locale === "en" ? englishDynamic(key) : machineCache.get(`${locale}:${key}`));
  if (!next || next === key) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  return `${leading}${next}${trailing}`;
}

function sourceLanguage(value: string) {
  return /[А-Яа-яЁё]/.test(value) ? "ru" : "en";
}

function looksLikePersonOrClubName(value: string) {
  return /^[A-ZÀ-ÖØ-Ý][\p{L}'’-]+(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’-]+){0,3}$/u.test(
    value,
  );
}

async function getBrowserTranslator(source: string, target: Locale) {
  const key = `${source}:${target}`;
  if (!translators.has(key)) {
    translators.set(
      key,
      (async () => {
        const api = (
          globalThis as typeof globalThis & { Translator?: TranslatorApi }
        ).Translator;
        if (!api || source === target) return null;
        try {
          const availability = await api.availability?.({
            sourceLanguage: source,
            targetLanguage: target,
          });
          if (availability === "unavailable") return null;
          return await api.create({
            sourceLanguage: source,
            targetLanguage: target,
          });
        } catch {
          return null;
        }
      })(),
    );
  }
  return translators.get(key)!;
}

function queueMachineTranslation(value: string) {
  const key = normalize(value);
  if (!key || locale === "ru" || catalog[key] || looksLikePersonOrClubName(key))
    return;
  const cacheKey = `${locale}:${key}`;
  if (machineCache.has(cacheKey) || pending.has(cacheKey)) return;
  pending.add(cacheKey);
  const requestedLocale = locale;
  void getBrowserTranslator(sourceLanguage(key), requestedLocale).then(
    async (translator) => {
      try {
        if (!translator) return;
        const result = normalize(await translator.translate(key));
        if (result) machineCache.set(cacheKey, result);
        if (locale === requestedLocale) translateTree(document.body);
      } catch {
        // The browser may remove an on-device model while the game is open.
      } finally {
        pending.delete(cacheKey);
      }
    },
  );
}

function translateTextNode(node: Text) {
  const parent = node.parentElement;
  if (!parent || parent.closest("[data-no-translate]")) return;
  if (!originalText.has(node) || node.data !== renderedText.get(node)) originalText.set(node, node.data);
  const source = originalText.get(node)!;
  queueMachineTranslation(source);
  const next = locale === "ru" ? source : translated(source);
  if (node.data !== next) node.data = next;
  renderedText.set(node, next);
}

function translateElement(element: Element) {
  if (element.closest("[data-no-translate]")) return;
  if (element.tagName === "OPTION" && !element.hasAttribute("value"))
    element.setAttribute("value", (element as HTMLOptionElement).value);
  let originals = originalAttributes.get(element);
  if (!originals) {
    originals = new Map();
    originalAttributes.set(element, originals);
  }
  for (const name of translatedAttributes) {
    const current = element.getAttribute(name);
    if (current !== null && !originals.has(name)) originals.set(name, current);
    const source = originals.get(name);
    if (source !== undefined) {
      queueMachineTranslation(source);
      const next = locale === "ru" ? source : translated(source);
      if (current !== next) element.setAttribute(name, next);
    }
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) translateTextNode(root as Text);
  if (root.nodeType === Node.ELEMENT_NODE) {
    translateElement(root as Element);
    const walker = document.createTreeWalker(root, 1 | 4);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text);
      else translateElement(node as Element);
    }
  }
}

async function loadCatalog(next: Locale) {
  return next === "ru" ? {} : { ...buildCoreCatalog(next), ...(next === "en" ? englishMatch : {}) };
}

export async function setDocumentLocale(next: Locale) {
  locale = next;
  const currentGeneration = ++generation;
  const loaded = await loadCatalog(next);
  if (currentGeneration !== generation) return;
  catalog = loaded;
  document.documentElement.lang = next;
  document.documentElement.dir = "ltr";
  translateTree(document.body);
}

export function installDomLocalization() {
  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    observer?.disconnect();
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(translateTree);
      if (mutation.type === "characterData") translateTextNode(mutation.target as Text);
      if (mutation.type === "attributes")
        translateElement(mutation.target as Element);
    }
    observer?.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...translatedAttributes],
    });
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...translatedAttributes],
  });
}
