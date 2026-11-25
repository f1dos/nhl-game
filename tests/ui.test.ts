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
const { default: PlayerConversation } =
  await import("../src/ui/PlayerConversation");
const { newGame } = await import("../src/engine/database");
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
  fireEvent.click(screen.getByText("Стратегия клуба"));
  fireEvent.click(screen.getByText("Wild Card Hunt"));
  assert(screen.getByRole("dialog"));
  assert.equal(useGame.getState().game?.franchiseStrategy, undefined);
  fireEvent.click(screen.getByText("Утвердить стратегию"));
  assert.equal(useGame.getState().game?.franchiseStrategy, "wild-card-hunt");
  assert(screen.getByText("ЗАДАЧИ СОВЕТА ДИРЕКТОРОВ"));
  fireEvent.click(screen.getByText("Обзор клуба"));
  fireEvent.click(screen.getByText("Скаутинг и драфт"));
  assert(screen.getByText("Центр драфта и скаутинга"));
  assert(screen.getByText("РЕЙТИНГ ПЕРСПЕКТИВНЫХ ИГРОКОВ"));
  fireEvent.click(screen.getByText("Юниоры и лиги"));
  assert(screen.getByText("Юниорские и европейские лиги"));
  assert(screen.getByRole("tab", { name: /OHL/ }));
  assert(document.querySelector(".scout-league-table"));
  fireEvent.click(screen.getByText("Обзор клуба"));
  fireEvent.click(screen.getByText("Настроить тренировки"));
  fireEvent.change(screen.getByLabelText("Training 0 morning"), {
    target: { value: "recovery" },
  });
  assert.equal(
    useGame.getState().game!.teams.find((t) => t.id === "TOR")!
      .trainingSchedule!.days[0].morning,
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
  fireEvent.click(screen.getByText("Начать личную встречу"));
  assert(screen.getByText("Разговор с игроком"));
  assert(screen.getByText("Как вы хотите провести разговор?"));
  fireEvent.click(screen.getByText("Поддержать"));
  assert(document.querySelector(".dialogue-result"));
  fireEvent.click(screen.getByRole("button", { name: "Close conversation" }));
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
  fireEvent.change(screen.getByLabelText("Режим продолжения"), {
    target: { value: "next-game" },
  });
  fireEvent.click(screen.getByText("Продолжить"));
  assert.equal(useGame.getState().game?.round, 0);
  assert(screen.getByText("Последние решения перед вбрасыванием"));
  const quickResult = "Пропустить матч и получить результат";
  assert.equal((screen.getByRole("button", { name: quickResult }) as HTMLButtonElement).disabled, true);
  fireEvent.click(screen.getByRole("button", { name: "Выбрать капитана" }));
  fireEvent.click(screen.getByText("Утвердить лидерскую группу"));
  assert.equal(useGame.getState().game?.leadershipSeason, useGame.getState().game?.year);
  fireEvent.click(screen.getByText("Продолжить"));
  assert.equal((screen.getByRole("button", { name: quickResult }) as HTMLButtonElement).disabled, false);
  fireEvent.click(screen.getByText("Перейти к пресс-конференции"));
  // Multi-question press conference: every reporter gets an answer.
  let asked = 0;
  while (document.querySelector(".presser-answers button")) {
    assert(document.querySelector(".press-avatar"));
    fireEvent.click(document.querySelector(".presser-answers button")!);
    asked++;
  }
  assert.equal(asked, 3);
  assert(screen.getByText("Медиа-обязательства выполнены", { selector: "b" }));
  assert.equal(
    useGame
      .getState()
      .game!.pressHistory!.filter((entry) => entry.type === "pre-match").length,
    3,
  );
  fireEvent.click(screen.getByText("Начать матч"));
  assert(screen.getByText(/^МАТЧ В РЕАЛЬНОМ ВРЕМЕНИ/));
  // The live match opens as a full-screen broadcast with its own controls.
  assert(screen.getByRole("combobox", { name: "Скорость матча" }));
  fireEvent.click(screen.getByText("Обзор клуба"));
  fireEvent.click(screen.getByText("Продолжить"));
  const matchDate = useGame.getState().game?.calendar?.date;
  fireEvent.click(screen.getByRole("button", { name: quickResult }));
  assert(screen.getByText("ИТОГ МАТЧА"));
  assert.notEqual(useGame.getState().game?.calendar?.date, matchDate);
  assert(useGame.getState().game?.last);
  fireEvent.click(screen.getByText("Таблица лиги"));
  assert(screen.getByText("РЕГУЛЯРНЫЙ ЧЕМПИОНАТ"));
  assert(screen.getByText("РЕЙТИНГ СИЛЫ · NHL 2026/27"));
  fireEvent.click(screen.getByText("Клубы NHL"));
  assert(screen.getByText("Профили клубов"));
  assert(screen.getByText("Основной состав NHL"));
  fireEvent.click(screen.getByText("Пресс-центр"));
  assert(
    screen.getByText(
      "Журналисты задают вопросы по ситуации в команде. Ответы влияют на ожидания фанатов, раздевалку, руководство и отдельных игроков.",
    ),
  );
  fireEvent.click(screen.getByText("Статистика"));
  assert(screen.getByText("РЕЙТИНГ ИГРОКОВ · TOP 50"));
  assert(screen.getAllByText("Connor McDavid").length > 0);
  fireEvent.click(screen.getByText("Контракты и рынок"));
  // Keep this UI-form assertion independent from AI transactions made during
  // the preceding calendar advance; cap enforcement has dedicated tests.
  useGame.getState().game!.rules.cap = 200;
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
  await waitFor(() => assert(screen.getByText("Контракт подписан")));
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
  assert.equal(validateSave(saves.find((s) => s.id === g.id)).round, 0);
  cleanup();
  useGame.setState({ game: null });
  render(React.createElement(App));
  await waitFor(() =>
    assert(screen.getByText("A new day. A new opportunity.")),
  );
  assert.equal(useGame.getState().game?.round, 0);
  cleanup();
});

test("an unattached player never receives own-team conversation topics", () => {
  const game = newGame("TOR", 9901);
  const source = game.teams.find((team) => team.id === "EDM")!.players[0];
  const unattached = { ...source, id: "unattached-ui-player" };
  render(
    React.createElement(PlayerConversation, {
      player: unattached,
      game,
      edit: () => undefined,
      onClose: () => undefined,
    }),
  );
  assert(screen.getByText("Внутренние темы недоступны"));
  assert.equal(screen.queryByText("Игровое время"), null);
  assert(screen.getByText(/Организация и статус прав/));
  cleanup();
});

test("English player meeting runs as a multi-turn chat and records history once", () => {
  const game = newGame("TOR", 9902);
  game.language = "en";
  const playerId = game.teams.find((team) => team.id === "TOR")!.players[2].id;
  // Old Russian-only history entry from an earlier save still renders.
  game.teams.find((team) => team.id === "TOR")!.players[2].conversationHistory = [
    {
      year: 2025,
      round: 3,
      topic: "form",
      tone: "supportive",
      managerLine: "Я вижу твою работу.",
      response: "Спасибо, тренер.",
      moraleDelta: 2,
      relationshipDelta: 1,
    },
  ];
  useGame.setState({ game });
  const Harness = () => {
    const current = useGame((state) => state.game)!;
    const player = current.teams
      .find((team) => team.id === "TOR")!
      .players.find((item) => item.id === playerId)!;
    return React.createElement(PlayerConversation, {
      player,
      game: current,
      edit: useGame.getState().edit,
      onClose: () => undefined,
    });
  };
  render(React.createElement(Harness));
  assert(screen.getByText("Player conversation"));
  assert(screen.getByText("Спасибо, тренер.", { exact: false }));
  fireEvent.click(document.querySelector(".dialogue-choices > button")!);
  assert.equal(document.querySelectorAll(".dialogue-thread .speech").length, 2);
  let rounds = 0;
  while (document.querySelector(".conversation-follow-up > button")) {
    fireEvent.click(document.querySelector(".conversation-follow-up > button")!);
    rounds++;
  }
  assert.ok(rounds >= 1 && rounds <= 3);
  assert.equal(
    document.querySelectorAll(".dialogue-thread .speech").length,
    (rounds + 1) * 2,
  );
  assert(screen.getByText(/MEETING OUTCOME/));
  const thread = document.querySelector(".dialogue-thread")!.textContent!;
  assert.doesNotMatch(thread, /[А-Яа-яЁё]/);
  const stored = useGame
    .getState()
    .game!.teams.find((team) => team.id === "TOR")!
    .players.find((item) => item.id === playerId)!;
  assert.equal(stored.conversationHistory!.length, 2);
  assert.equal(stored.lastConversationRound, game.round);
  cleanup();
});
