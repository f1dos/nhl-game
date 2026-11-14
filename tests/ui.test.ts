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
  assert.equal(
    useGame.getState().game?.teams[0].players[0].identitySource,
    "nhl-api",
  );
  assert(document.querySelector(".crest.official img"));
  assert(document.querySelector(".top-club-record"));
  assert(screen.getAllByText("РАБОЧИЙ СТОЛ").length > 0);
  assert(screen.getByText("Штаб генерального менеджера"));
  fireEvent.click(screen.getByText("Скаутинг и драфт"));
  assert(screen.getByText("Центр драфта и скаутинга"));
  assert(screen.getByText("РЕЙТИНГ ПЕРСПЕКТИВНЫХ ИГРОКОВ"));
  fireEvent.click(screen.getByText("Юниоры и лиги"));
  assert(screen.getByText("Юниорские и европейские лиги"));
  assert(screen.getByRole("tab", { name: /OHL/ }));
  assert(document.querySelector(".scout-league-table"));
  fireEvent.click(screen.getByText("Обзор клуба"));
  fireEvent.click(screen.getByText("Настроить тренировки"));
  fireEvent.click(screen.getByText("Восстановление"));
  assert.equal(
    useGame.getState().game!.teams.find((t) => t.id === "TOR")!.training,
    "recovery",
  );
  fireEvent.click(screen.getByText("Состав"));
  assert(screen.getByText("ОСНОВНОЙ СОСТАВ NHL"));
  assert(screen.getByText("Фарм-клуб и резерв"));
  fireEvent.change(screen.getByLabelText("Player sort"), {
    target: { value: "rating" },
  });
  const name = useGame.getState().game!.teams.find((t) => t.id === "TOR")!
    .players[0].name;
  fireEvent.change(screen.getByPlaceholderText("Найти игрока…"), {
    target: { value: name },
  });
  assert(screen.getByText(name));
  fireEvent.click(screen.getByText(name));
  assert(screen.getByRole("dialog"));
  assert(screen.getByText(/NHL MODEL/));
  assert(screen.getByText("СТАТУС И КОНТРАКТ"));
  assert(document.querySelector(".attribute-sections"));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByText("Тактика и звенья"));
  assert(document.querySelector(".chemistry"));
  assert(document.querySelector(".tactic-analysis"));
  const before = useGame.getState().game!.teams.find((t) => t.id === "TOR")!;
  const firstForward = before.lines[0][0];
  const replacement = before.players.find(
    (p) => p.pos !== "D" && p.pos !== "G" && p.id !== firstForward,
  )!;
  fireEvent.change(screen.getAllByRole("combobox", { name: "F lineup" })[0], {
    target: { value: replacement.id },
  });
  assert.equal(
    useGame.getState().game!.teams.find((t) => t.id === "TOR")!.lines[0][0],
    replacement.id,
  );
  fireEvent.click(screen.getByText("Продолжить"));
  assert.equal(useGame.getState().game?.round, 1);
  assert(screen.getByText("Повтор ключевых событий"));
  fireEvent.click(screen.getByText("Результат"));
  assert(screen.getByText(/FINAL/));
  fireEvent.click(screen.getByText("Таблица лиги"));
  assert(screen.getByText("РЕГУЛЯРНЫЙ ЧЕМПИОНАТ"));
  assert(screen.getByText("РЕЙТИНГ СИЛЫ · NHL 2026/27"));
  fireEvent.click(screen.getByText("Статистика"));
  assert(screen.getByText("РЕЙТИНГ ИГРОКОВ · TOP 50"));
  assert(screen.getAllByText("Connor McDavid").length > 0);
  fireEvent.click(screen.getByText("Контракты и рынок"));
  const expiring = useGame
    .getState()
    .game!.teams.find((t) => t.id === "TOR")!
    .players.find((p) => p.years === 1)!;
  fireEvent.change(screen.getByLabelText("Contract player"), {
    target: { value: expiring.id },
  });
  const requestedSalary = (
    screen.getByLabelText("Contract salary") as HTMLInputElement
  ).value;
  fireEvent.change(screen.getByLabelText("Contract salary"), {
    target: { value: "0.1" },
  });
  fireEvent.click(screen.getByText("Предложить контракт"));
  assert(screen.getByText("Invalid contract terms"));
  fireEvent.change(screen.getByLabelText("Contract salary"), {
    target: { value: requestedSalary },
  });
  fireEvent.click(screen.getByText("Предложить контракт"));
  assert(screen.getByText("Контракт подписан"));
  assert.equal(
    useGame
      .getState()
      .game!.teams.find((t) => t.id === "TOR")!
      .players.find((p) => p.id === expiring.id)!.years,
    2,
  );
  fireEvent.click(screen.getByText("Сохранения"));
  fireEvent.change(screen.getByLabelText("Language"), {
    target: { value: "en" },
  });
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
