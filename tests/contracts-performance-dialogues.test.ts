import test from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import {
  conversationOptions,
  externalContactEligibility,
  talkToPlayer,
} from "../src/engine/conversations";
import {
  recordPlayerPerformance,
  prepareAnnualDevelopment,
} from "../src/engine/performance";

const allPlayers = (g: ReturnType<typeof newGame>) =>
  g.teams.flatMap((t) => [...t.players, ...(t.farm ?? [])]);

test("verified contracts expose AAV, remaining term and remaining value", () => {
  const g = newGame("EDM", 260027);
  const players = allPlayers(g).filter((p) => p.identitySource === "nhl-api");
  const mcdavid = players.find((p) => p.name === "Connor McDavid")!;
  const draisaitl = players.find((p) => p.name === "Leon Draisaitl")!;
  assert.deepEqual(
    [
      mcdavid.salary,
      mcdavid.years,
      mcdavid.contractRemainingValue,
      mcdavid.contractSource,
    ],
    [12.5, 2, 25, "puckpedia"],
  );
  assert.deepEqual(
    [draisaitl.salary, draisaitl.years, draisaitl.contractRemainingValue],
    [14, 7, 98],
  );
  assert.ok(
    players.filter((p) => p.contractSource === "puckpedia").length /
      players.length >=
      0.95,
  );
});

test("match form moves OVR in both directions and stays capped", () => {
  const p = allPlayers(newGame())[0];
  const start = p.ovr;
  for (let i = 0; i < 20; i++) recordPlayerPerformance(p, 60);
  assert.equal(p.formAdjustment, 3);
  assert.ok(p.ovr >= start + 2);
  for (let i = 0; i < 30; i++) recordPlayerPerformance(p, -60);
  assert.equal(p.formAdjustment, -3);
  assert.ok(p.ovr <= start - 2);
});

test("injuries affect annual development and temporary form is removed", () => {
  const p = allPlayers(newGame())[0];
  recordPlayerPerformance(p, 45);
  p.performanceForm = 30;
  p.injuryBurden = 55;
  const result = prepareAnnualDevelopment(p);
  assert.equal(result.modifier, -1);
  assert.equal(p.formAdjustment, 0);
  assert.match(result.reason, /травмы -2/);
});

test("player conversations alter morale, relationship and motivation with a cooldown", () => {
  const g = newGame("TOR", 44);
  const p = g.teams.find((t) => t.id === "TOR")!.players[0];
  const before = [p.morale, p.relationship ?? 50, p.motivation ?? 50];
  const result = talkToPlayer(g, p.id, "form", "supportive");
  assert.ok(result.response.length > 20);
  assert.ok(result.managerLine.length > 40);
  assert.equal(conversationOptions("contract").length, 6);
  assert.notEqual(
    conversationOptions("contract")[0].line,
    conversationOptions("injury")[0].line,
  );
  assert.notDeepEqual([p.morale, p.relationship, p.motivation], before);
  assert.equal(p.conversationHistory?.length, 1);
  assert.equal(p.conversationHistory?.[0].managerLine, result.managerLine);
  assert.throws(() => talkToPlayer(g, p.id, "role", "direct"), /уже говорили/);
});

test("external player contact differs from own-team meetings and blocks protected stars", () => {
  const g = newGame("TOR", 45);
  const opponent = g.teams.find((team) => team.id === "EDM")!;
  const star = [...opponent.players].sort((a, b) => b.ovr - a.ovr)[0];
  assert.equal(externalContactEligibility(g, star.id).allowed, false);
  const depth = [...opponent.farm!].sort((a, b) => a.ovr - b.ovr)[0];
  depth.years = 1;
  depth.morale = 45;
  assert.equal(externalContactEligibility(g, depth.id).allowed, true);
  const freeAgent = { ...depth, id: "test-free-agent" };
  g.freeAgents = [freeAgent];
  assert.equal(externalContactEligibility(g, freeAgent.id).allowed, true);
  assert.match(externalContactEligibility(g, freeAgent.id).reason, /агента/);
});
