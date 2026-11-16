import assert from "node:assert/strict";
import test from "node:test";
import { newGame } from "../src/engine/database";
import {
  ensureManagementState,
  initialStrategy,
} from "../src/engine/management";

test("AI strategies are distributed by team quality", () => {
  const game = newGame("NYR", 270027);
  ensureManagementState(game);
  const strategies = new Set(
    game.teams
      .filter((team) => team.id !== game.user)
      .map((team) => team.aiProfile!.strategy),
  );
  assert.ok(
    strategies.size >= 3,
    `expected at least three strategies, got ${[...strategies]}`,
  );
  const ranked = [...game.teams].sort(
    (a, b) => (b.strengthRating ?? 0) - (a.strengthRating ?? 0),
  );
  assert.equal(initialStrategy(ranked[0]), "stanley-cup");
  assert.equal(initialStrategy(ranked.at(-1)!), "draft-lottery");
});

test("legacy all-wild-card AI profiles are repaired on load", () => {
  const game = newGame("NYR", 270028);
  ensureManagementState(game);
  for (const team of game.teams)
    if (team.id !== game.user) team.aiProfile!.strategy = "wild-card-hunt";
  ensureManagementState(game);
  assert.ok(
    game.teams.some(
      (team) =>
        team.id !== game.user && team.aiProfile!.strategy !== "wild-card-hunt",
    ),
  );
});
