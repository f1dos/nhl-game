import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import {
  advanceDay,
  advisorRecommendations,
  continueGame,
  ensureManagementState,
  selectFranchiseStrategy,
} from "../src/engine/management";
import { validateSave } from "../src/engine/saves";

test("management state creates a daily calendar, AI identities and unique draft assets", () => {
  const game = ensureManagementState(newGame("SJS", 606));
  assert.equal(game.calendar?.date, "2026-10-07");
  assert.equal(
    game.events?.some((event) => event.requiresResponse),
    true,
  );
  assert.equal(game.teams.filter((team) => team.aiProfile).length, 32);
  assert.equal(game.draftAssets?.length, 32 * 3 * 7);
  assert.equal(
    new Set(game.draftAssets?.map((asset) => asset.id)).size,
    game.draftAssets?.length,
  );
  assert.equal(
    game.draftAssets?.filter((asset) => asset.currentTeam === "SJS").length,
    21,
  );
});

test("continue advances by days, stops after the next game and remains deterministic", () => {
  const a = ensureManagementState(newGame("SJS", 4201));
  const b = ensureManagementState(newGame("SJS", 4201));
  a.id = b.id;
  const daysA = continueGame(a, "next-game");
  const daysB = continueGame(b, "next-game");
  assert.equal(daysA, 1);
  assert.equal(daysA, daysB);
  assert.equal(a.round, 1);
  assert.equal(a.calendar?.date, "2026-10-08");
  assert.deepEqual(a, b);
});

test("the living world performs persistent AI actions without duplicating players", () => {
  const game = ensureManagementState(newGame("SJS", 2606));
  for (let day = 0; day < 38; day++) advanceDay(game);
  const players = game.teams.flatMap((team) => team.players);
  assert.equal(
    new Set(players.map((player) => player.id)).size,
    players.length,
  );
  assert(
    game.events?.some(
      (event) => event.category === "contract" || event.category === "trade",
    ),
  );
  assert(game.teams.every((team) => team.players.length >= 20));
  assert.doesNotThrow(() => validateSave(JSON.parse(JSON.stringify(game))));
});

test("franchise strategy resolves the board decision and drives real recommendations", () => {
  const game = ensureManagementState(newGame("SJS", 6005));
  selectFranchiseStrategy(game, "rebuild");
  assert.equal(game.franchiseStrategy, "rebuild");
  assert.equal(
    game.events?.find((event) => event.title === "Утвердите стратегию франшизы")
      ?.resolved,
    true,
  );
  const recommendations = advisorRecommendations(game);
  assert(recommendations.every((item) => item.action.length > 0));
});
