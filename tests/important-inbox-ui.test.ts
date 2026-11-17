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
const { render, screen, fireEvent, waitFor, cleanup, act } =
  await import("@testing-library/react");
const { default: App } = await import("../src/ui/App");
const { newGame } = await import("../src/engine/database");
const { useGame } = await import("../src/store");
const { continueGame, ensureManagementState, selectFranchiseStrategy } =
  await import("../src/engine/management");

function careerBeforeImportantMessage() {
  const g = ensureManagementState(newGame("TOR", 31337));
  selectFranchiseStrategy(g, "wild-card-hunt");
  while (g.calendar!.date < "2026-10-03") continueGame(g, "day");
  for (const event of g.events!) event.resolved = true;
  // A salary jump puts the club over the cap: the next simulated day raises
  // an important (response required) message.
  const team = g.teams.find((club) => club.id === g.user)!;
  team.players[0].salary += 25;
  return g;
}

test("Continue lands on the inbox's important tab when an important message arrives", async () => {
  useGame.setState({ game: careerBeforeImportantMessage() });
  render(React.createElement(App));
  await waitFor(() => assert(screen.getByText("Продолжить")));
  fireEvent.change(screen.getByLabelText("Режим продолжения"), {
    target: { value: "week" },
  });
  fireEvent.click(screen.getByText("Продолжить"));
  await waitFor(() => assert(screen.getByRole("alert")));
  const game = useGame.getState().game!;
  assert.equal(game.calendar!.date, "2026-10-04");
  // Inbox page, "important" filter preselected, explanation banner shown.
  assert(screen.getByRole("heading", { name: "Входящие" }));
  const tab = screen.getByRole("button", { name: /Только важные/ });
  assert.equal(tab.getAttribute("aria-pressed"), "true");
  assert.match(screen.getByRole("alert").textContent!, /Игра остановлена/);
  // The new message is highlighted at the top of the list.
  const rows = [...document.querySelectorAll(".decision-inbox .agenda-row")];
  assert(rows.length >= 1);
  assert(rows[0].classList.contains("focused"));
  assert.match(rows[0].textContent!, /потолок зарплат/);
  // Unread important badge in the sidebar and the top bar.
  assert(document.querySelector("nav em.important-count"));
  assert(screen.getByRole("button", { name: "Важные сообщения" }));
  // Acknowledging marks the messages read and removes the banner.
  fireEvent.click(screen.getByText("Понятно"));
  assert.equal(screen.queryByRole("alert"), null);
  const stop = useGame
    .getState()
    .game!.events!.find((event) => event.action === "finances")!;
  assert.equal(stop.read, true);
  cleanup();
  useGame.setState({ game: null });
});

test("routine days do not interrupt Continue or open the inbox", async () => {
  const g = careerBeforeImportantMessage();
  const team = g.teams.find((club) => club.id === g.user)!;
  team.players[0].salary -= 25;
  g.id = "routine-career";
  useGame.setState({ game: g });
  render(React.createElement(App));
  await waitFor(() => assert(screen.getByText("Продолжить")));
  // The app may have restored the career autosaved by the previous test
  // while loading; put this test's career back once loading is done.
  act(() => useGame.setState({ game: g }));
  assert.equal(useGame.getState().game!.id, "routine-career");
  fireEvent.click(screen.getByText("Продолжить"));
  assert.equal(useGame.getState().game!.calendar!.date, "2026-10-04");
  assert.equal(screen.queryByRole("alert"), null);
  assert.equal(screen.queryByRole("heading", { name: "Входящие" }), null);
  cleanup();
  useGame.setState({ game: null });
});
