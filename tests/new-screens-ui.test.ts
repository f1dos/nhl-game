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
const { render, screen, fireEvent, cleanup, within } = await import("@testing-library/react");
const { default: DraftCenter } = await import("../src/ui/DraftCenter");
const { default: StaffCenter } = await import("../src/ui/StaffCenter");
const { default: TradeCenter } = await import("../src/ui/TradeCenter");
const { default: LeagueCenter } = await import("../src/ui/LeagueCenter");
const { newGame } = await import("../src/engine/database");
const { ensureDraft } = await import("../src/engine/draft");
const { ensureManagementState } = await import("../src/engine/management");
const { ensureFranchiseWorld } = await import("../src/engine/franchiseWorld");
type Game = import("../src/engine/types").Game;

function harness(game: Game) {
  const state = { game };
  const edit = (fn: (g: Game) => void) => {
    const copy = structuredClone(state.game);
    fn(copy);
    state.game = copy;
  };
  return { state, edit };
}

const career = () => {
  const g = newGame("TOR", 260027, "en");
  ensureManagementState(g);
  ensureFranchiseWorld(g);
  ensureDraft(g);
  return g;
};
const tr = (_ru: string, en: string) => en;

test("draft center: open a real prospect, ask questions and see the answers", () => {
  const { state, edit } = harness(career());
  const view = () => React.createElement(DraftCenter, { game: state.game, edit, tr });
  const { rerender } = render(view());
  assert(screen.getByText("Draft & scouting center"));
  const first = state.game.draft!.prospects
    .filter((p) => p.source === "real")
    .sort((a, b) => state.game.draft!.reports[b.player.id].estimatedPotential - state.game.draft!.reports[a.player.id].estimatedPotential)[0];
  fireEvent.click(screen.getAllByText(first.player.name)[0]);
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByText(/Interview/));
  fireEvent.click(within(dialog).getByText("Tell me about yourself"));
  rerender(view());
  const meeting = state.game.draft!.interviews![first.player.id];
  assert(meeting, "interview recorded");
  assert.equal(meeting.transcript[0].speaker, "manager");
  assert(within(screen.getByRole("dialog")).getByText("Tell me about yourself", { selector: "p" }));
  cleanup();
});

test("staff center: switch role and hire a candidate", () => {
  const { state, edit } = harness(career());
  const view = () => React.createElement(StaffCenter, { game: state.game, edit });
  const { rerender } = render(view());
  fireEvent.click(screen.getByText("Physiotherapist"));
  rerender(view());
  const before = state.game.teams.find((t) => t.id === "TOR")!.staff!.physio!.id;
  const hire = screen.getAllByText("Hire").find((b) => !(b as HTMLButtonElement).disabled)!;
  fireEvent.click(hire);
  rerender(view());
  assert.notEqual(state.game.teams.find((t) => t.id === "TOR")!.staff!.physio!.id, before);
  cleanup();
});

test("trade center team picker lists clubs by division and switches partner", () => {
  const { state, edit } = harness(career());
  render(React.createElement(TradeCenter, { game: state.game, edit }));
  fireEvent.click(screen.getByRole("button", { name: /trade partner|choose club/i }));
  assert(screen.getByText("Metropolitan"));
  fireEvent.click(screen.getByRole("option", { name: /Rangers/ }));
  assert(screen.getAllByText("New York Rangers").length >= 1);
  assert(screen.getByRole("button", { name: /choose club/i }).textContent!.includes("Rangers"));
  cleanup();
});

test("league center shows flags, stats and draft badges", () => {
  const g = career();
  render(React.createElement(LeagueCenter, { game: g, onPlayer: () => {} }));
  fireEvent.click(screen.getByRole("tab", { name: /WHL/ }));
  assert(screen.getAllByText(/DRAFT 2027/).length > 0);
  assert(screen.getAllByText(/GP ·/).length > 0);
  cleanup();
});
