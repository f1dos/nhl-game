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
const { render, screen, fireEvent, waitFor, cleanup } =
  await import("@testing-library/react");
const { default: App } = await import("../src/ui/App");
const { useGame } = await import("../src/store");
const { saveGame, listGames, validateSave } =
  await import("../src/engine/saves");
test("UI flow: club selection, roster, lineup edits, match, replay, league, save/reload", async () => {
  render(React.createElement(App));
  await waitFor(() => assert(screen.getByText("Начать карьеру")));
  fireEvent.click(screen.getByText("Начать карьеру"));
  assert.equal(useGame.getState().game?.user, "TOR");
  fireEvent.click(screen.getByText("Состав"));
  assert(screen.getByText("ОСНОВНОЙ СОСТАВ И РЕЗЕРВ"));
  const name = useGame.getState().game!.teams.find((t) => t.id === "TOR")!
    .players[0].name;
  fireEvent.change(screen.getByPlaceholderText("Найти игрока…"), {
    target: { value: name },
  });
  assert(screen.getByText(name));
  fireEvent.click(screen.getByText(name));
  assert(screen.getByRole("dialog"));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByText("Тактика и звенья"));
  const before = useGame.getState().game!.teams.find((t) => t.id === "TOR")!;
  const lw = before.players.find(
    (p) => p.pos === "LW" && !before.lines.flat().includes(p.id),
  )!;
  fireEvent.change(screen.getAllByRole("combobox", { name: "LW lineup" })[0], {
    target: { value: lw.id },
  });
  assert.equal(
    useGame.getState().game!.teams.find((t) => t.id === "TOR")!.lines[0][0],
    lw.id,
  );
  fireEvent.click(screen.getByText("Следующий матч"));
  assert.equal(useGame.getState().game?.round, 1);
  assert(screen.getByText("Повтор ключевых событий"));
  fireEvent.click(screen.getByText("Результат"));
  assert(screen.getByText(/FINAL/));
  fireEvent.click(screen.getByText("Таблица лиги"));
  assert(screen.getByText("РЕГУЛЯРНЫЙ ЧЕМПИОНАТ"));
  fireEvent.click(screen.getByText("Сохранения"));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "en" } });
  assert(screen.getByText("Saves & settings"));
  const g = structuredClone(useGame.getState().game!);
  await saveGame(g);
  const saves = await listGames();
  assert.equal(validateSave(saves.find((s) => s.id === g.id)).round, 1);
  cleanup();
  useGame.setState({ game: null });
  render(React.createElement(App));
  await waitFor(() =>
    assert(screen.getByText("A new day. A new opportunity.")),
  );
  assert.equal(useGame.getState().game?.round, 1);
  cleanup();
});
