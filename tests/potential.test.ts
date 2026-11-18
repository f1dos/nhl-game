import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { nextSeason } from "../src/engine/season";
import { validateSave } from "../src/engine/saves";
import { ensureDraft } from "../src/engine/draft";
import { recordPlayerPerformance } from "../src/engine/performance";
import {
  POTENTIAL_MODEL,
  allPlayers,
  computePotential,
  potentialStars,
  scoutedPotential,
  scoutedPotentialFor,
} from "../src/engine/potential";
import type { Game, Player } from "../src/engine/types";

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const gap = (p: Player) => p.potential - p.ovr;
const nhl = (g: Game) => g.teams.flatMap((team) => team.players);

test("every player starts with POT >= OVR and POT <= 99", () => {
  const g = newGame("TOR", 260027, "en");
  ensureDraft(g);
  const players = allPlayers(g);
  assert(players.length > 2000);
  for (const p of players) {
    assert(Number.isInteger(p.potential), p.name);
    assert(p.potential >= p.ovr, `${p.name} ${p.ovr}/${p.potential}`);
    assert(p.potential <= 99);
  }
});

test("young players have meaningful headroom, veterans almost none", () => {
  const g = newGame("TOR", 260027, "en");
  const players = allPlayers(g);
  const young = players.filter((p) => p.age <= 21);
  const mid = players.filter((p) => p.age >= 22 && p.age <= 24);
  const veterans = players.filter((p) => p.age >= 31);
  assert(median(young.map(gap)) >= 6, `young median ${median(young.map(gap))}`);
  assert(median(nhl(g).filter((p) => p.age <= 21).map(gap)) >= 6);
  assert(median(mid.map(gap)) >= 2);
  assert(median(mid.map(gap)) < median(young.map(gap)));
  assert.equal(median(veterans.map(gap)), 0);
  assert(veterans.every((p) => gap(p) <= 1));
  // Not every prospect is the same: a real spread of ceilings.
  const youngGaps = new Set(young.map(gap));
  assert(youngGaps.size >= 10);
  // "Reached potential" is rare among the young.
  assert(young.filter((p) => gap(p) <= 1).length / young.length < 0.05);
});

test("goalies keep headroom longer than skaters of the same age", () => {
  const base = newGame("TOR", 260027, "en").teams[0].players[0];
  const make = (pos: Player["pos"], id: string) =>
    ({ ...structuredClone(base), id, pos, age: 23, ovr: 75, formAdjustment: 0, league: "NHL" }) as Player;
  let skater = 0;
  let goalie = 0;
  for (let i = 0; i < 200; i++) {
    skater += computePotential(make("C", `s${i}`)) - 75;
    goalie += computePotential(make("G", `g${i}`)) - 75;
  }
  assert(goalie > skater + 200, `${goalie} vs ${skater}`);
});

test("potential is deterministic per player and per seed", () => {
  const a = newGame("TOR", 4242, "en");
  const b = newGame("TOR", 4242, "en");
  assert.deepEqual(
    allPlayers(a).map((p) => [p.id, p.potential]),
    allPlayers(b).map((p) => [p.id, p.potential]),
  );
  const p = a.teams[3].players[2];
  assert.equal(computePotential(p), computePotential(structuredClone(p)));
});

test("development converges toward POT and veterans decline", () => {
  const g = newGame("TOR", 13579, "en");
  const youngIds = nhl(g)
    .filter((p) => p.age <= 21)
    .map((p) => p.id);
  const vetIds = nhl(g)
    .filter((p) => p.age >= 33)
    .map((p) => p.id);
  const find = (id: string) =>
    [
      ...g.teams.flatMap((t) => [...t.players, ...(t.farm ?? []), ...(t.prospects ?? [])]),
      ...(g.freeAgents ?? []),
    ].find((p) => p.id === id);
  const snapshot = (ids: string[]) =>
    ids.map(find).filter((p): p is Player => !!p);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const startYoung = snapshot(youngIds);
  const startGap = avg(startYoung.map(gap));
  const startOvr = avg(startYoung.map((p) => p.ovr));
  const startVets = new Map(snapshot(vetIds).map((p) => [p.id, p.ovr]));
  for (let season = 0; season < 4; season++) {
    g.phase = "offseason";
    nextSeason(g);
    for (const p of allPlayers(g)) assert(p.potential >= p.ovr, p.name);
  }
  const endYoung = snapshot(youngIds);
  assert(avg(endYoung.map(gap)) < startGap / 2, "gap closes");
  assert(avg(endYoung.map((p) => p.ovr)) > startOvr + 3, "young players grow");
  const vets = snapshot(vetIds).filter((p) => startVets.has(p.id));
  assert(vets.length > 10);
  assert(avg(vets.map((p) => startVets.get(p.id)! - p.ovr)) >= 3, "veterans decline");
  // Some young players had a late-bloom or bust revision logged.
  const revised = allPlayers(g).filter((p) =>
    (p.developmentLog ?? []).some((entry) => entry.potentialDelta),
  );
  assert(revised.length > 20);
});

test("hot form never shows OVR above POT", () => {
  const g = newGame("TOR", 77, "en");
  const veteran = nhl(g).find((p) => p.age >= 32 && p.potential === p.ovr)!;
  for (let i = 0; i < 12; i++) recordPlayerPerformance(veteran, 45);
  assert(veteran.formAdjustment! > 0);
  assert(veteran.potential >= veteran.ovr);
});

test("scouted range contains the true value and narrows with knowledge", () => {
  const g = newGame("TOR", 260027, "en");
  const young = allPlayers(g).filter((p) => p.age <= 20).slice(0, 300);
  let unknownWidth = 0;
  let knownWidth = 0;
  for (const p of young) {
    const unknown = scoutedPotential(p, 30);
    const known = scoutedPotential(p, 90);
    for (const s of [unknown, known]) {
      assert(s.low <= p.potential && p.potential <= s.high);
      assert(s.low >= Math.min(99, p.ovr));
      assert(s.stars >= 0.5 && s.stars <= 5);
    }
    unknownWidth += unknown.high - unknown.low;
    knownWidth += known.high - known.low;
  }
  assert(unknownWidth > knownWidth * 3);
  const vet = nhl(g).find((p) => p.age >= 32)!;
  assert(scoutedPotentialFor(g, vet).high - scoutedPotentialFor(g, vet).low <= 2);
  assert.equal(potentialStars(96), 5);
  assert.equal(potentialStars(80), 3);
});

test("old saves with flat potentials are recomputed on load", () => {
  const g = newGame("TOR", 2468, "en");
  const legacy = JSON.parse(JSON.stringify(g)) as Game;
  delete legacy.potentialModel;
  for (const p of allPlayers(legacy)) p.potential = p.ovr;
  // A corrupted value is repaired instead of rejecting the career.
  legacy.teams[0].players[0].potential = Number.NaN;
  const loaded = validateSave(JSON.parse(JSON.stringify(legacy)));
  assert.equal(loaded.potentialModel, POTENTIAL_MODEL);
  const young = allPlayers(loaded).filter((p) => p.age <= 21);
  assert(median(young.map(gap)) >= 6);
  for (const p of allPlayers(loaded)) assert(p.potential >= p.ovr);
  // Already-migrated saves are left alone.
  const again = validateSave(JSON.parse(JSON.stringify(loaded)));
  assert.deepEqual(
    allPlayers(again).map((p) => p.potential),
    allPlayers(loaded).map((p) => p.potential),
  );
  assert.throws(() =>
    validateSave({ ...JSON.parse(JSON.stringify(loaded)), potentialModel: -1 }),
  );
});
