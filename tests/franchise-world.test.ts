import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import {
  applyWorldMatchReaction,
  effectiveOverall,
  ensureFranchiseWorld,
  normalizeExternalRating,
  syncMoraleBonus,
} from "../src/engine/franchiseWorld";
import { ensureManagementState } from "../src/engine/management";

test("fans, rivalries, needs and morale bonus form a persistent franchise world", () => {
  const game = newGame("EDM");
  ensureManagementState(game);
  ensureFranchiseWorld(game);
  const player = game.teams.find((team) => team.id === "EDM")!.players[0];
  assert.equal(player.morale, 50);
  player.morale = 95;
  syncMoraleBonus(player);
  assert.equal(effectiveOverall(player), Math.min(99, player.ovr + 1));
  const before = game.fans!.EDM.happiness;
  applyWorldMatchReaction(game, {
    home: "EDM",
    away: "CGY",
    goals: [4, 2],
    shots: [30, 27],
    xg: [3, 2],
    pp: [1, 0],
    ppo: [3, 2],
    ot: false,
    so: false,
    duration: 60,
    events: [],
  });
  assert.equal(game.fans!.EDM.happiness, before + 2);
  assert.equal(
    game.rivalries!.find((rivalry) => rivalry.id === "EDM-CGY")!.seasonWins.EDM,
    1,
  );
  assert.equal(game.teamNeeds!.EDM.length, 2);
});

test("junior and European rating normalization preserves a meaningful potential gap", () => {
  assert.deepEqual(normalizeExternalRating("OHL", 18, 74, 60), {
    ovr: 68,
    potential: 78,
  });
  assert.deepEqual(normalizeExternalRating("Liiga", 20, 88, 72), {
    ovr: 79,
    potential: 89,
  });
});
