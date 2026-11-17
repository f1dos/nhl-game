import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { advance } from "../src/engine/season";
import { simulateMatch } from "../src/engine/match";
import { RNG } from "../src/engine/random";
import { SpatialMatch } from "../src/engine/spatialMatch";
import { validateSave } from "../src/engine/saves";
import {
  averageRating,
  goalieRating,
  skaterRating,
  type MatchLine,
} from "../src/engine/matchRatings";
import { awardRace, isRookie, REGULAR_AWARDS } from "../src/engine/awards";

const line = (over: Partial<MatchLine>): MatchLine => ({
  goals: 0,
  assists: 0,
  shots: 2,
  plus: 0,
  pim: 0,
  toi: 16,
  shotsAgainst: 0,
  goalsAgainst: 0,
  won: true,
  ...over,
});

test("match ratings follow the football-manager 1–10 scale", () => {
  const quiet = skaterRating(line({}));
  const hatTrick = skaterRating(line({ goals: 3, assists: 1, shots: 6, plus: 3 }));
  const awful = skaterRating(line({ plus: -4, pim: 6, shots: 0, won: false }));
  assert(quiet >= 6 && quiet <= 7, `ordinary night ${quiet}`);
  assert(hatTrick >= 9, `hat trick ${hatTrick}`);
  assert(awful < 5.5, `bad night ${awful}`);
  const shutout = goalieRating(line({ shotsAgainst: 34, goalsAgainst: 0 }));
  const shelled = goalieRating(line({ shotsAgainst: 25, goalsAgainst: 6, won: false }));
  assert(shutout >= 8, `shutout ${shutout}`);
  assert(shelled < 5, `shelled ${shelled}`);
  for (const v of [quiet, hatTrick, awful, shutout, shelled])
    assert.equal(Math.round(v * 10) / 10, v, "one decimal place");
});

test("every appearing player is rated and three distinct stars are named", () => {
  const g = newGame();
  const [home, away] = g.teams;
  const result = simulateMatch(home, away, new RNG(42));
  const appeared = [...home.players, ...away.players].filter((p) => p.stats.gp === 1);
  assert.equal(Object.keys(result.ratings!).length, appeared.length);
  for (const p of appeared) {
    const r = result.ratings![p.id];
    assert(r >= 3 && r <= 10, `${p.name} ${r}`);
    assert.equal(p.stats.rated, 1);
    assert.equal(averageRating(p.stats), r);
  }
  assert.equal(new Set(result.stars).size, 3);
  const best = Math.max(...Object.values(result.ratings!));
  assert.equal(result.ratings![result.stars![0]], best, "first star has the top rating");
  assert.equal(
    appeared.reduce((n, p) => n + (p.stats.stars ?? 0), 0),
    3,
  );
});

test("ratings never change the result of a seeded match", () => {
  const g = newGame();
  const a = simulateMatch(structuredClone(g.teams[3]), structuredClone(g.teams[4]), new RNG(7));
  const b = simulateMatch(structuredClone(g.teams[3]), structuredClone(g.teams[4]), new RNG(7));
  assert.deepEqual(a.goals, b.goals);
  assert.deepEqual(a.ratings, b.ratings);
  const live = new SpatialMatch(g.teams[0], g.teams[1], 11);
  while (!live.done) {
    live.resume();
    live.step();
  }
  assert(Object.keys(live.result.ratings ?? {}).length >= 30, "live 3D match is rated too");
  assert.equal(live.result.stars?.length, 3);
});

test("a full season produces awards, archives ratings and survives a save round-trip", () => {
  const g = newGame();
  while (g.phase === "regular") advance(g);
  const awards = g.awards!.filter((a) => a.year === g.year);
  assert.deepEqual(
    awards.map((a) => a.key).sort(),
    [...REGULAR_AWARDS].sort(),
  );
  const players = g.teams.flatMap((t) => t.players);
  const byId = (id: string) => players.find((p) => p.id === id)!;
  const season = (id: string) => byId(id).history.find((h) => h.year === g.year)!.stats;
  const ross = awards.find((a) => a.key === "art-ross")!;
  const maxPoints = Math.max(
    ...players.map((p) => {
      const h = p.history.find((x) => x.year === g.year);
      return p.pos === "G" || !h ? 0 : h.stats.g + h.stats.a;
    }),
  );
  assert.equal(season(ross.playerId).g + season(ross.playerId).a, maxPoints);
  assert.equal(byId(awards.find((a) => a.key === "vezina")!.playerId).pos, "G");
  assert.equal(byId(awards.find((a) => a.key === "norris")!.playerId).pos, "D");
  assert(isRookie(byId(awards.find((a) => a.key === "calder")!.playerId), g.year));
  assert(season(awards[0].playerId).rated! > 0, "archived season keeps rating totals");
  // Ratings are only kept for the managed club's games to keep saves small.
  const stored = g.schedule.filter((f) => f.result?.ratings);
  assert(stored.length > 0 && stored.every((f) => [f.home, f.away].includes(g.user)));
  while (g.phase === "playoffs") advance(g);
  const conn = g.awards!.find((a) => a.key === "conn-smythe" && a.year === g.year)!;
  const final = g.bracket.at(-1)![0];
  assert([final.a, final.b].includes(conn.team));
  const restored = validateSave(JSON.parse(JSON.stringify(g)));
  assert.equal(restored.awards!.length, 7);
  assert.throws(() =>
    validateSave({ ...JSON.parse(JSON.stringify(g)), awards: [{ year: 2026, key: "best-hair" }] }),
  );
});

test("award race ignores players below the games threshold", () => {
  const g = newGame();
  for (let i = 0; i < 10; i++) advance(g);
  for (const key of REGULAR_AWARDS) {
    const race = awardRace(g, key, 3);
    for (const entry of race) assert(entry.stats.gp > 0);
  }
  const hart = awardRace(g, "hart", 10);
  assert(hart.every((e) => e.stats.gp >= 5), "Hart contenders need half the games");
});
