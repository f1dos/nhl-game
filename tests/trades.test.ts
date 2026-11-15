import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { evaluateTrade, executeTrade } from "../src/engine/trades";
import { validateSave } from "../src/engine/saves";
import { ensureManagementState } from "../src/engine/management";
test("accepted trade transfers ownership, refreshes lines and survives save/load", () => {
  const g = newGame("BOS");
  g.rules.cap = 300;
  const a = g.teams[0].players[0],
    b = g.teams[1].players[0];
  a.ovr = 95;
  a.potential = 98;
  a.age = 21;
  a.salary = 1;
  b.ovr = 60;
  b.potential = 60;
  b.age = 34;
  assert(evaluateTrade(g, "BUF", [a.id], [b.id]).accepted);
  executeTrade(g, "BUF", [a.id], [b.id]);
  assert(g.teams[1].players.includes(a));
  assert(g.teams[0].players.includes(b));
  const organizationPlayers = g.teams.flatMap((t) => [
    ...t.players,
    ...(t.farm || []),
  ]);
  assert.equal(
    new Set(organizationPlayers.map((p) => p.id)).size,
    organizationPlayers.length,
  );
  assert.equal(
    organizationPlayers.filter((p) => p.identitySource === "nhl-api").length,
    794,
  );
  assert.equal(
    validateSave(JSON.parse(JSON.stringify(g))).transactions?.length,
    1,
  );
  assert.throws(() => executeTrade(g, "BUF", [a.id], [b.id]));
});
test("invalid, underpriced and over-cap deals leave state unchanged", () => {
  const g = newGame("BOS");
  const a = g.teams[0].players[0],
    b = g.teams[1].players[0];
  a.ovr = 40;
  b.ovr = 99;
  g.rules.cap = 300;
  assert(!evaluateTrade(g, "BUF", [a.id], [b.id]).accepted);
  assert(!evaluateTrade(g, "BUF", [a.id, a.id], [b.id]).accepted);
  g.rules.cap = 1;
  const before = JSON.stringify(g);
  assert.throws(() => executeTrade(g, "BUF", [a.id], [b.id]));
  assert.equal(JSON.stringify(g), before);
});
test("draft picks transfer in GM negotiations and rival clubs demand a premium", () => {
  const g = newGame("EDM");
  ensureManagementState(g);
  g.rules.cap = 300;
  const edmPick = g.draftAssets!.find((pick) => pick.currentTeam === "EDM")!;
  const cgyPick = g.draftAssets!.find((pick) => pick.currentTeam === "CGY")!;
  const edm = g.teams.find((team) => team.id === "EDM")!.players[0];
  const cgy = g.teams.find((team) => team.id === "CGY")!.players.at(-1)!;
  edm.ovr = 99;
  edm.potential = 99;
  edm.salary = 1;
  cgy.ovr = 40;
  cgy.potential = 40;
  cgy.salary = 1;
  const offer = { givePicks: [edmPick.id], takePicks: [cgyPick.id] };
  const evaluation = evaluateTrade(g, "CGY", [edm.id], [cgy.id], offer);
  assert(evaluation.rivalry);
  assert(evaluation.threshold > 1.08);
  assert(evaluation.accepted);
  executeTrade(g, "CGY", [edm.id], [cgy.id], offer);
  assert.equal(edmPick.currentTeam, "CGY");
  assert.equal(cgyPick.currentTeam, "EDM");
});
