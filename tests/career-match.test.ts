import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { advanceDay, ensureManagementState, fixtureDate } from "../src/engine/management";
import { nextClubFixture, clubMatchTeams, createClubMatch, quickClubMatch } from "../src/engine/careerMatch";

test("club calendar resolves off days, exhibitions, league games and playoff home ice", () => {
  const g = newGame("TOR", 41);
  ensureManagementState(g);
  const first = nextClubFixture(g)!;
  assert.ok(first.date > g.calendar!.date);
  assert.equal(first.kind, "preseason");
  g.calendar!.date = first.date;
  advanceDay(g);
  assert.equal(g.last?.date, first.date);
  assert.deepEqual(g.last, g.preseasonFixtures!.find(f => f.date === first.date)!.result);
  g.calendar!.date = fixtureDate(g, 0);
  const opener = nextClubFixture(g)!;
  assert.equal(opener.kind, "regular");
  advanceDay(g);
  const stored = g.schedule.find(f => f.round === 0 && f.home === opener.home && f.away === opener.away)!.result!;
  assert.deepEqual(stored.goals, g.last!.goals);
  assert.equal(stored.date, opener.date);
  assert.deepEqual(g.clubMatchHistory!.map(m => m.date), [first.date, opener.date]);
  assert.deepEqual(g.clubMatchHistory![1].goals, stored.goals);
  g.phase = "playoffs";
  g.playoffRound = 0;
  g.bracket = [[{a: "TOR", b: "MTL", wins: [1, 1], games: []}]];
  g.calendar!.day = 3;
  const next = nextClubFixture(g)!;
  assert.ok(next.date > g.calendar!.date);
  assert.equal(next.home, "MTL");
  assert.equal(next.away, "TOR");
});

test("quick and broadcast produce the same events, shots, special teams and player stats", () => {
  const g = newGame("TOR", 51);
  ensureManagementState(g);
  g.calendar!.date = fixtureDate(g, 0);
  const due = nextClubFixture(g)!;
  const [home, away] = clubMatchTeams(g, due);
  const live = createClubMatch(home, away, g.seed, false, true);
  while (!live.done) {
    if (live.intermission) live.resume();
    live.step();
  }
  const quick = quickClubMatch(g, due);
  assert.deepEqual(quick, live.result);
  for (const team of live.teams)
    assert.deepEqual(g.teams.find(t => t.id === team.id)!.players, team.players);
});
