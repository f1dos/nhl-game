import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyOfficialRatingsSnapshot,
  newGame,
  teamOverall,
} from "../src/engine/database";
import { overall } from "../src/engine/ratings";
import { validateSave } from "../src/engine/saves";
import { nextSeason } from "../src/engine/season";

test("McDavid is the unique top-rated player and ratings match attributes", () => {
  const g = newGame("EDM", 260027);
  const players = g.teams.flatMap((team) => [
    ...team.players,
    ...(team.farm ?? []),
  ]);
  const mcdavid = players.find((player) => player.externalId === 8478402)!;
  assert.equal(mcdavid.name, "Connor McDavid");
  assert.equal(mcdavid.ovr, 97);
  assert.equal(mcdavid.ratingRank, 1);
  assert.equal(Math.max(...players.map((player) => player.ovr)), 97);
  assert.equal(players.filter((player) => player.ovr === 97).length, 1);
  assert.equal(
    overall(mcdavid.pos, mcdavid.attributes, mcdavid.archetype),
    mcdavid.ovr,
  );
  assert.equal(g.dataSource?.ratingModel, "nhl-stats-v1");
});

test("Carolina is the unique strongest team in the 2026/27 snapshot", () => {
  const g = newGame("CAR", 260027);
  const carolina = g.teams.find((team) => team.id === "CAR")!;
  assert.equal(carolina.strengthRank, 1);
  assert.equal(teamOverall(carolina), 92);
  assert.equal(Math.max(...g.teams.map(teamOverall)), teamOverall(carolina));
  assert.equal(g.teams.filter((team) => teamOverall(team) === 92).length, 1);
  assert.equal(carolina.realWorldForm?.pointPct, 0.8);
  assert.equal(carolina.realWorldForm?.goalDifferential, 36);
});

test("version-5 careers can apply ratings without losing results or contracts", () => {
  const g = newGame("TOR", 71);
  const mcdavid = g.teams
    .flatMap((team) => [...team.players, ...(team.farm ?? [])])
    .find((player) => player.externalId === 8478402)!;
  const contract = { salary: mcdavid.salary, years: mcdavid.years };
  g.dataSource!.kind = "official-identities-demo-ratings";
  mcdavid.ovr = 70;
  mcdavid.attributes = Object.fromEntries(
    Object.keys(mcdavid.attributes).map((key) => [key, 70]),
  );
  g.teams.forEach((team) => {
    team.strengthRating = undefined;
    team.strengthRank = undefined;
  });
  applyOfficialRatingsSnapshot(g);
  assert.equal(mcdavid.ovr, 97);
  assert.deepEqual({ salary: mcdavid.salary, years: mcdavid.years }, contract);
  assert.equal(g.teams.find((team) => team.id === "CAR")!.strengthRating, 92);
  assert.equal(g.dataSource?.kind, "official-identities-modeled-ratings");
  assert(validateSave(JSON.parse(JSON.stringify(g))));
});

test("team power ratings become career-dynamic after the opening season", () => {
  const g = newGame("CAR", 144);
  const anaheim = g.teams.find((team) => team.id === "ANA")!;
  anaheim.record.gp = 82;
  anaheim.record.w = 82;
  anaheim.record.pts = 164;
  g.phase = "offseason";
  nextSeason(g);
  assert.equal(g.year, 2027);
  assert(g.teams.every((team) => !team.realWorldForm));
  assert.equal(new Set(g.teams.map((team) => team.strengthRank)).size, 32);
  assert((anaheim.strengthRank ?? 99) < 32);
});
