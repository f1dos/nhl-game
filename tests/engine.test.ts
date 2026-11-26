import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { advance, nextSeason, standings } from "../src/engine/season";
import { simulateMatch } from "../src/engine/match";
import { RNG } from "../src/engine/random";
import { validateSave } from "../src/engine/saves";
test("32 franchises, unique players, 30 valid attributes and legal lineups", () => {
  const g = newGame();
  assert.equal(g.teams.length, 32);
  const organizationPlayers = g.teams.flatMap((t) => [
    ...t.players,
    ...(t.farm ?? []),
  ]);
  assert.equal(
    new Set(organizationPlayers.map((p) => p.id)).size,
    organizationPlayers.length,
  );
  assert.equal(
    organizationPlayers.filter((p) => p.identitySource === "nhl-api").length,
    795,
  );
  for (const t of g.teams) {
    assert.equal(t.lines.flat().length, 12);
    assert(
      t.lines.flat().every((id) => {
        const p = t.players.find((player) => player.id === id)!;
        return p.pos !== "D" && p.pos !== "G";
      }),
    );
    assert.equal(t.defense.flat().length, 6);
    assert.equal(t.players.find((p) => p.id === t.goalie)?.pos, "G");
    for (const p of t.players) {
      assert.equal(Object.keys(p.attributes).length, 30);
      assert(Object.values(p.attributes).every((n) => n >= 1 && n <= 100));
    }
  }
});
test("84 games per club, 42 home games, no round conflicts or self matches", () => {
  const g = newGame();
  assert.equal(g.schedule.length, 1344);
  for (const t of g.teams) {
    for(const other of g.teams.filter(x=>x!==t)){
      const pairs=g.schedule.filter(f=>f.home===t.id&&f.away===other.id||f.home===other.id&&f.away===t.id);
      assert.equal(pairs.length,other.division===t.division?4:other.conference===t.conference?3:2);
    }
    assert.equal(g.schedule.filter((f) => f.home === t.id).length, 42);
    assert.equal(g.schedule.filter((f) => f.away === t.id).length, 42);
  }
  for (let round = 0; round < 84; round++) {
    const fixtures = g.schedule.filter((f) => f.round === round);
    assert.equal(fixtures.length, 16);
    assert.equal(new Set(fixtures.flatMap((f) => [f.home, f.away])).size, 32);
  }
});
test("identical seed and actions reproduce simulation", () => {
  const a = newGame("TOR", 42),
    b = newGame("TOR", 42);
  a.id = b.id;
  advance(a);
  advance(b);
  assert.deepEqual(a, b);
});
test("event and individual statistics reconcile, shootout goal excluded from player goals", () => {
  for (let seed = 0; seed < 80; seed++) {
    const g = newGame("TOR", seed);
    const [a, b] = g.teams;
    const r = simulateMatch(a, b, new RNG(seed));
    assert.notEqual(r.goals[0], r.goals[1]);
    [a, b].forEach((t, i) => {
      assert.equal(
        t.players.reduce((n, p) => n + p.stats.sog, 0),
        r.shots[i],
      );
      assert.equal(
        t.players.reduce((n, p) => n + p.stats.g, 0),
        r.goals[i] - (r.so && r.goals[i] > r.goals[1 - i] ? 1 : 0),
      );
      assert.equal(
        t.players.find((p) => p.id === t.goalie)!.stats.sa,
        r.shots[1 - i],
      );
      assert(r.pp[i] <= r.ppo[i]);
      assert.equal(
        r.events.filter(
          (e) => e.team === t.id && (e.type === "shot" || e.type === "goal"),
        ).length,
        r.shots[i],
      );
    });
    assert(r.events.every((e, i) => !i || e.time >= r.events[i - 1].time));
  }
});
test("full regular season → 16-team playoffs → champion → next season", () => {
  const g = newGame();
  for (let i = 0; i < 84; i++) advance(g);
  assert.equal(g.phase, "playoffs");
  assert(g.teams.every((t) => t.record.gp === 84));
  assert.equal(
    g.teams.reduce((n, t) => n + t.record.w, 0),
    1344,
  );
  assert.equal(
    g.teams.reduce((n, t) => n + t.record.gf, 0),
    g.teams.reduce((n, t) => n + t.record.ga, 0),
  );
  assert(g.teams.every((t) => t.record.pts === t.record.w * 2 + t.record.otl));
  assert.equal(g.bracket[0].length, 8);
  assert.equal(new Set(g.bracket[0].flatMap((s) => [s.a, s.b])).size, 16);
  for (const conference of ["East", "West"]) {
    const teams = g.teams.filter((t) => t.conference === conference);
    const qualified = g.bracket[0].flatMap((s) => [s.a, s.b]);
    for (const d of new Set(teams.map((t) => t.division)))
      assert(
        standings(teams.filter((t) => t.division === d))
          .slice(0, 3)
          .every((t) => qualified.includes(t.id)),
      );
  }
  let n = 0;
  while (String(g.phase) !== "offseason" && n++ < 30) advance(g);
  assert.equal(g.phase, "offseason");
  assert.deepEqual(
    g.bracket.map((r) => r.length),
    [8, 4, 2, 1],
  );
  for (const s of g.bracket.flat()) {
    assert.equal(Math.max(...s.wins), 4);
    assert(s.games.length >= 4 && s.games.length <= 7);
    assert(s.games.every((r) => !r.so));
  }
  assert.equal(g.history.length, 1);
  const age = g.teams[0].players[0].age;
  const playerId = g.teams[0].players[0].id;
  nextSeason(g);
  assert.equal(g.year, 2027);
  assert.equal(g.phase, "regular");
  assert(g.teams.every((t) => t.record.gp === 0));
  const original = [
    ...g.teams.flatMap((t) => [...t.players,...(t.farm??[])]),
    ...(g.freeAgents || []),
  ].find((p) => p.id === playerId)!;
  assert.equal(original.age, age + 1);
  assert.equal(original.history.length, 1);
  assert.equal(g.schedule.length, 1344);
  assert.equal(validateSave(JSON.parse(JSON.stringify(g))).year, 2027);
});
test("save validation rejects corrupt/unsupported files", () => {
  assert.throws(() => validateSave(null));
  assert.throws(() => validateSave({ version: 99 }));
  const g = newGame();
  g.teams[0].lines[0][0] = "unknown";
  assert.throws(() => validateSave(g));
});
test("1000-game statistical balance smoke test", () => {
  const base = newGame("TOR", 7621);
  let goals = 0,
    shots = 0,
    pp = 0,
    ppo = 0,
    homeWins = 0;
  for (let i = 0; i < 1000; i++) {
    const a = structuredClone(base.teams[i % 32]),
      b = structuredClone(base.teams[(i + 11) % 32]);
    const r = simulateMatch(a, b, new RNG(i * 391 + 57));
    goals += r.goals[0] + r.goals[1] - (r.so ? 1 : 0);
    shots += r.shots[0] + r.shots[1];
    pp += r.pp[0] + r.pp[1];
    ppo += r.ppo[0] + r.ppo[1];
    homeWins += +(r.goals[0] > r.goals[1]);
  }
  const report = {
    games: 1000,
    goalsPerGame: goals / 1000,
    shotsPerGame: shots / 1000,
    powerPlayPct: (100 * pp) / ppo,
    savePct: 100 * (1 - goals / shots),
    homeWinPct: homeWins / 10,
  };
  console.log("BALANCE", JSON.stringify(report));
  assert(report.goalsPerGame > 4 && report.goalsPerGame < 8);
  assert(report.shotsPerGame > 48 && report.shotsPerGame < 78);
  assert(report.savePct > 87 && report.savePct < 94);
  assert(report.homeWinPct > 35 && report.homeWinPct < 65);
  assert(report.powerPlayPct > 5 && report.powerPlayPct < 40);
});
test("shot-frequency tactics affect outcomes under the same seeds", () => {
  const base = newGame();
  let low = 0,
    high = 0;
  for (let i = 0; i < 200; i++) {
    const a = structuredClone(base.teams[0]),
      b = structuredClone(base.teams[1]),
      c = structuredClone(a),
      d = structuredClone(b);
    a.tactics.shooting = 0;
    c.tactics.shooting = 100;
    low += simulateMatch(a, b, new RNG(i + 50)).shots[0];
    high += simulateMatch(c, d, new RNG(i + 50)).shots[0];
  }
  assert(high > low * 1.12);
});
