import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { ageWorld, annualGamesPlayed } from "../src/engine/lifecycle";
import { RNG } from "../src/engine/random";
import { tradeWindowOpen } from "../src/engine/trades";
import { ensureManagementState } from "../src/engine/management";
import { projectedPayroll } from "../src/engine/careerDesk";
import { salaryTotal } from "../src/engine/contracts";
import { validateSave } from "../src/engine/saves";

test("released prospects age once and playoff counters add to the archived season", () => {
  const g = newGame("TOR", 349),
    t = g.teams[0];
  const p = structuredClone(t.players[0]);
  p.id = "unsigned-prospect";
  p.age = 22;
  t.prospects = [p];
  g.rules.cap = salaryTotal(t);
  ageWorld(g, new RNG(123));
  assert.equal(p.age, 23);
  assert.ok(g.freeAgents!.includes(p));
  assert.equal(p.developmentLog?.length, 1);
  p.history = [{ year: g.year, ovr: p.ovr, stats: { ...p.stats, gp: 68 } }];
  p.stats.gp = 4;
  assert.equal(annualGamesPlayed(p, g.year), 72);
});

test("registration and projection use the same injured reserve and activation charges", () => {
  const g = newGame("TOR", 349),
    t = g.teams.find((t) => t.id === g.user)!,
    p = t.players[0];
  assert.ok(g.teams.every((t) => salaryTotal(t) <= g.rules.cap));
  p.injury = 10;
  p.injuryStatus = "LTIR";
  const now = salaryTotal(t);
  assert.ok(
    Math.abs(projectedPayroll(t, undefined, "", "", 0).today - now) < 1e-6,
  );
  assert.ok(
    Math.abs(
      projectedPayroll(t, undefined, "", "", 0, 2, p.id).today - now - p.salary,
    ) < 1e-6,
  );
});

test("trade window closes for the freeze, deadline and playoff phase", () => {
  const g = ensureManagementState(newGame());
  for (const [date, expected] of [
    ["2026-12-18", true],
    ["2026-12-19", false],
    ["2026-12-28", true],
    ["2027-03-05", true],
    ["2027-03-06", false],
  ] as const) {
    g.calendar!.date = date;
    assert.equal(tradeWindowOpen(g), expected);
  }
  g.phase = "playoffs";
  assert.equal(tradeWindowOpen(g), false);
  g.phase = "offseason";
  assert.equal(tradeWindowOpen(g), true);
});

test("a saved 82-round season retains its original fixture list", () => {
  const g = newGame();
  g.schedule = g.schedule.filter((f) => f.round < 82);
  g.round = 81;
  assert.equal(
    validateSave(JSON.parse(JSON.stringify(g))).schedule.length,
    1312,
  );
});
