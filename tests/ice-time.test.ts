import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { simulateMatch } from "../src/engine/match";
import { SpatialMatch } from "../src/engine/spatialMatch";
import { RNG } from "../src/engine/random";
import { validateSave } from "../src/engine/saves";
import { ensureManagementState } from "../src/engine/management";
import {
  ICE_TIME_PRESETS,
  applyIceTimePreset,
  autoIceTimePreset,
  forecastIceTime,
  inGameWear,
  normalizeShares,
  resolveIceTime,
  setDoubleShift,
  setIceTimeWeight,
  unitForShift,
} from "../src/engine/iceTime";
import type { Team } from "../src/engine/types";

/** Average per-game TOI of each forward line and defence pair of `team`. */
function lineToi(
  games: number,
  setup: (team: Team) => void,
  engine: "event" | "spatial" = "event",
) {
  const g = newGame();
  const r = new RNG(11);
  const sums = { F: [0, 0, 0, 0], D: [0, 0, 0] };
  for (let i = 0; i < games; i++) {
    const home = structuredClone(g.teams[0]);
    const away = structuredClone(g.teams[1 + (i % 30)]);
    setup(home);
    const before = new Map(home.players.map((p) => [p.id, p.stats.toi]));
    let played = home;
    if (engine === "event") simulateMatch(home, away, r);
    else {
      const m = new SpatialMatch(home, away, 100 + i);
      while (!m.done) {
        m.resume();
        m.step();
      }
      played = m.teams[0];
    }
    const toi = (id: string) =>
      played.players.find((p) => p.id === id)!.stats.toi - before.get(id)!;
    home.lines.forEach((line, li) =>
      line.forEach((id) => (sums.F[li] += toi(id) / 3 / games)),
    );
    home.defense.forEach((pair, li) =>
      pair.forEach((id) => (sums.D[li] += toi(id) / 2 / games)),
    );
  }
  return sums;
}

test("rotation is deterministic and follows the configured shares", () => {
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 200; i++) counts[unitForShift([40, 30, 18, 12], i)]++;
  assert.deepEqual(counts, [80, 60, 36, 24]);
  for (let i = 1; i < 200; i++)
    assert.notEqual(unitForShift([40, 30, 18, 12], i), unitForShift([40, 30, 18, 12], i - 1));
  assert.deepEqual(normalizeShares([80, 10, 10, 0]), [50, 25, 25, 0]);
});

test("event engine: per-line TOI matches the forecast for each preset", () => {
  for (const preset of ["balanced", "top", "roll", "short"] as const) {
    const g = newGame();
    const team = g.teams[0];
    applyIceTimePreset(team, preset);
    const forecast = forecastIceTime(team);
    const expected = {
      F: team.lines.map((l) => l.reduce((n, id) => n + forecast.get(id)!.minutes, 0) / 3),
      D: team.defense.map((p) => p.reduce((n, id) => n + forecast.get(id)!.minutes, 0) / 2),
    };
    const actual = lineToi(60, (t) => applyIceTimePreset(t, preset));
    for (const k of ["F", "D"] as const)
      actual[k].forEach((v, i) =>
        assert(
          Math.abs(v - expected[k][i]) < 2.5,
          `${preset} ${k}${i + 1}: simulated ${v.toFixed(1)} vs forecast ${expected[k][i].toFixed(1)}`,
        ),
      );
  }
});

test("default plan reproduces the old event-engine TOI split", () => {
  // Line/pair TOI averaged over all clubs on main before ice time was
  // configurable (200 games, same pairing scheme).
  const old = { F: [24.8, 15.1, 10.7, 8.6], D: [26.0, 18.1, 15.9] };
  const g = newGame();
  assert.equal(g.teams.find((t) => t.id === g.user)!.tactics.iceTime?.preset, "balanced");
  const r = new RNG(7);
  const sums = { F: [0, 0, 0, 0], D: [0, 0, 0] };
  const n = 200;
  for (let i = 0; i < n; i++) {
    const teams = [structuredClone(g.teams[i % 32]), structuredClone(g.teams[(i + 3) % 32])];
    teams.forEach((t) => applyIceTimePreset(t, "balanced"));
    simulateMatch(teams[0], teams[1], r);
    for (const t of teams) {
      const toi = (id: string) => t.players.find((p) => p.id === id)!.stats.toi;
      const base = (id: string) => g.teams.flatMap((x) => x.players).find((p) => p.id === id)!.stats.toi;
      t.lines.forEach((l, li) => l.forEach((id) => (sums.F[li] += (toi(id) - base(id)) / 3 / n / 2)));
      t.defense.forEach((d, li) => d.forEach((id) => (sums.D[li] += (toi(id) - base(id)) / 2 / n / 2)));
    }
  }
  for (const k of ["F", "D"] as const)
    sums[k].forEach((v, i) =>
      assert(Math.abs(v - old[k][i]) < 1, `${k}${i + 1}: ${v.toFixed(1)} vs ${old[k][i]}`),
    );
});

test("spatial engine honours the plan without breaking determinism", () => {
  // Average across twelve opponents so a single penalty-heavy game cannot dominate pair usage.
  const top = lineToi(12, (t) => applyIceTimePreset(t, "top"), "spatial");
  const roll = lineToi(12, (t) => applyIceTimePreset(t, "roll"), "spatial");
  assert(top.F[3] < roll.F[3] - 2, `4th line: top ${top.F[3]} vs roll ${roll.F[3]}`);
  assert(top.F[0] > roll.F[0] + 2, `1st line: top ${top.F[0]} vs roll ${roll.F[0]}`);
  assert(top.D[2] < roll.D[2] - 1, `3rd pair: top ${top.D[2]} vs roll ${roll.D[2]}`);
  const short = lineToi(1, (t) => applyIceTimePreset(t, "short"), "spatial");
  assert(short.F[3] < 1.5, `shortened bench still played the 4th line ${short.F[3]}`);
  const g = newGame();
  const a = new SpatialMatch(g.teams[0], g.teams[1], 5);
  const b = new SpatialMatch(g.teams[0], g.teams[1], 5, false, { presentation: true });
  while (!a.done) { a.resume(); a.step(); }
  for (let i = 0; i < 400000 && !b.done; i++) { b.resume(); b.step(); }
  assert.deepEqual(a.result, b.result);
});

test("double-shift puts the star on the 4th line too", () => {
  const plain = lineToi(30, () => {});
  const g = newGame();
  const star = g.teams[0].lines[0][0];
  const doubled = lineToi(30, (t) => setDoubleShift(t, star));
  const team = g.teams[0];
  setDoubleShift(team, star);
  assert(forecastIceTime(team).get(star)!.minutes > 30);
  assert(doubled.F[0] > plain.F[0] + 2);
});

test("overload raises fatigue and wears players down late in games", () => {
  assert.equal(inGameWear(15, "C"), 0);
  assert(inGameWear(28, "C") > inGameWear(24, "C"));
  assert(inGameWear(28, "C", 60) > inGameWear(28, "C", 40));
  const fatigue = (preset: "top" | "roll") => {
    const g = newGame();
    const r = new RNG(3);
    const team = g.teams[0];
    applyIceTimePreset(team, preset);
    team.players.forEach((p) => (p.fatigue = 0));
    for (let i = 1; i <= 5; i++) simulateMatch(team, g.teams[i], r);
    const first = team.lines[0].map((id) => team.players.find((p) => p.id === id)!);
    return first.reduce((n, p) => n + p.fatigue, 0) / first.length;
  };
  assert(fatigue("top") > fatigue("roll") + 5, `top ${fatigue("top")} vs roll ${fatigue("roll")}`);
  const g = newGame();
  applyIceTimePreset(g.teams[0], "top");
  setDoubleShift(g.teams[0], g.teams[0].lines[0][0]);
  assert([...forecastIceTime(g.teams[0]).values()].some((r) => r.overload));
  applyIceTimePreset(g.teams[0], "roll");
  setDoubleShift(g.teams[0]);
  assert(![...forecastIceTime(g.teams[0]).values()].some((r) => r.overload));
});

test("AI clubs pick a preset from depth; the managed club keeps its plan", () => {
  const g = newGame();
  ensureManagementState(g);
  const ai = g.teams[5];
  assert.equal(ai.tactics.iceTime, undefined);
  const byId = (id: string) => ai.players.find((p) => p.id === id)!;
  ai.lines.slice(2).flat().forEach((id) => (byId(id).ovr = 50));
  ai.lines[0].forEach((id) => (byId(id).ovr = 90));
  assert.equal(autoIceTimePreset(ai), "top");
  ai.lines.flat().forEach((id) => (byId(id).ovr = 75));
  assert.equal(autoIceTimePreset(ai), "roll");
  assert.deepEqual(resolveIceTime(ai).forwards, ICE_TIME_PRESETS.roll.forwards);
  assert.equal(g.teams.find((t) => t.id === g.user)!.tactics.iceTime?.preset, "balanced");
});

test("ice-time plans survive a save round-trip; old saves still load", () => {
  const g = newGame();
  ensureManagementState(g);
  const team = g.teams.find((t) => t.id === g.user)!;
  setIceTimeWeight(team, "forwards", 0, 45);
  setDoubleShift(team, team.lines[0][0]);
  const loaded = validateSave(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(
    loaded.teams.find((t) => t.id === g.user)!.tactics.iceTime,
    team.tactics.iceTime,
  );
  const old = JSON.parse(JSON.stringify(g));
  for (const t of old.teams) delete t.tactics.iceTime;
  const migrated = validateSave(old);
  ensureManagementState(migrated);
  assert.deepEqual(
    migrated.teams.find((t) => t.id === g.user)!.tactics.iceTime!.forwards,
    ICE_TIME_PRESETS.balanced.forwards,
  );
  const gone = JSON.parse(JSON.stringify(g));
  gone.teams.find((t: Team) => t.id === g.user).tactics.iceTime.doubleShift = "nobody";
  assert.equal(
    validateSave(gone).teams.find((t) => t.id === g.user)!.tactics.iceTime!.doubleShift,
    undefined,
  );
  const broken = JSON.parse(JSON.stringify(g));
  broken.teams[0].tactics.iceTime = { forwards: [1, 2], defense: [1, 1, 1] };
  assert.throws(() => validateSave(broken));
});
