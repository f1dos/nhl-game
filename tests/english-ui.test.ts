import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
const window = new Window({ url: "http://localhost:5173" });
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "Node",
  "MutationObserver",
  "localStorage",
  "getComputedStyle",
])
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? window : (window as any)[key],
    configurable: true,
  });
Object.assign(globalThis, { indexedDB, IDBKeyRange });
const React = await import("react");
const { render, fireEvent, waitFor, cleanup, act } =
  await import("@testing-library/react");
const { default: App } = await import("../src/ui/App");
const { newGame } = await import("../src/engine/database");
const { useGame } = await import("../src/store");
const { advanceDay, ensureManagementState, selectFranchiseStrategy } =
  await import("../src/engine/management");
const { ensureDraft } = await import("../src/engine/draft");
const { installDomLocalization, setDocumentLocale } =
  await import("../src/i18n/runtime");
const { LOCALE_NAMES } = await import("../src/i18n/locales");

installDomLocalization();
const cyrillic = /[А-Яа-яЁё]/;
const localeNames = new Set(Object.values(LOCALE_NAMES));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Every Cyrillic text node and translated attribute currently in the DOM. */
function russianLeftovers() {
  const found = new Set<string>();
  const walker = document.createTreeWalker(document.body, 4);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text || !cyrillic.test(text) || localeNames.has(text)) continue;
    found.add(text);
  }
  for (const element of document.body.querySelectorAll(
    "[title],[placeholder],[aria-label]",
  ))
    for (const name of ["title", "placeholder", "aria-label"]) {
      const value = element.getAttribute(name);
      if (value && cyrillic.test(value)) found.add(`@${name}: ${value}`);
    }
  return [...found];
}

function career(language: "en" | "ru", days: number) {
  const g = newGame("TOR", 4242, language);
  ensureDraft(g);
  ensureManagementState(g);
  selectFranchiseStrategy(g, "wild-card-hunt");
  for (let day = 0; day < days; day++) advanceDay(g);
  for (const event of g.events!) event.read = true;
  return g;
}

async function visitEveryPage(label: string) {
  const leftovers = new Map<string, string[]>();
  const record = (area: string) => {
    const found = russianLeftovers();
    if (found.length) leftovers.set(area, found);
  };
  await tick();
  record(`${label}: start`);
  const navCount = document.querySelectorAll("aside.sidebar nav button").length;
  assert(navCount >= 15, "sidebar navigation rendered");
  for (let index = 0; index < navCount; index++) {
    const button = document.querySelectorAll("aside.sidebar nav button")[
      index
    ] as HTMLElement;
    const name = button.textContent!.trim();
    await act(async () => {
      fireEvent.click(button);
      await tick();
    });
    record(`${label}: ${name}`);
    // Sub-tabs of the page (inbox filters, draft views, stats tabs…).
    const tabs = [
      ...document.querySelectorAll("main .tabs button, main [role=tab]"),
    ].slice(0, 8) as HTMLElement[];
    for (const tab of tabs) {
      if (!tab.isConnected) continue;
      await act(async () => {
        fireEvent.click(tab);
        await tick();
      });
      record(`${label}: ${name} / ${tab.textContent!.trim()}`);
    }
    // The match centre opens the full-screen matchday hub; walk its tabs.
    for (const tab of [
      ...document.querySelectorAll(".matchday-nav button"),
    ] as HTMLElement[]) {
      await act(async () => {
        fireEvent.click(tab);
        await tick();
      });
      record(`${label}: matchday / ${tab.textContent!.trim()}`);
    }
    const leave = document.querySelector(
      ".matchday-top button",
    ) as HTMLElement | null;
    if (leave)
      await act(async () => {
        fireEvent.click(leave);
        await tick();
      });
  }
  return leftovers;
}

test("English career: key screens contain no Russian text", async () => {
  useGame.setState({ game: career("en", 45) });
  await setDocumentLocale("en");
  render(React.createElement(App));
  await waitFor(() =>
    assert(document.querySelector("aside.sidebar nav button")),
  );
  const leftovers = await visitEveryPage("en");
  // Player profile from the roster.
  await act(async () => {
    fireEvent.click(
      [...document.querySelectorAll("aside.sidebar nav button")].find(
        (button) => button.textContent!.includes("Roster"),
      )!,
    );
    await tick();
  });
  const row = document.querySelector("main table tbody tr") as HTMLElement;
  await act(async () => {
    fireEvent.click(row);
    await tick();
  });
  const profile = russianLeftovers();
  if (profile.length) leftovers.set("en: player profile", profile);
  assert.deepEqual(Object.fromEntries(leftovers), {});
  cleanup();
  useGame.setState({ game: null });
});

test("Russian career switched to English: older Russian messages are translated", async () => {
  const g = career("ru", 60);
  assert(
    g.events!.some((event) => cyrillic.test(event.title)),
    "the Russian career stored Russian messages",
  );
  g.language = "en";
  useGame.setState({ game: g });
  await setDocumentLocale("en");
  render(React.createElement(App));
  await waitFor(() =>
    assert(document.querySelector("aside.sidebar nav button")),
  );
  const leftovers = await visitEveryPage("legacy");
  assert.deepEqual(Object.fromEntries(leftovers), {});
  cleanup();
  useGame.setState({ game: null });
  await setDocumentLocale("ru");
});

test("Russian mode keeps Russian UI text", async () => {
  useGame.setState({ game: career("ru", 3) });
  await setDocumentLocale("ru");
  render(React.createElement(App));
  await waitFor(() =>
    assert(document.querySelector("aside.sidebar nav button")),
  );
  assert.match(document.body.textContent!, /Обзор клуба/);
  assert.match(
    document.body.textContent!,
    /Утвердите стратегию|Стратегия клуба утверждена/,
  );
  cleanup();
  useGame.setState({ game: null });
});
