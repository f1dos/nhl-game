import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import {
  advanceDay,
  ensureManagementState,
  fixtureDate,
  selectFranchiseStrategy,
} from "../src/engine/management";
import { nextSeason } from "../src/engine/season";
import { validateSave } from "../src/engine/saves";
import {
  battleSpots,
  cupStandings,
  setCampOverride,
} from "../src/engine/preseason";
import {
  ensureInternationalSeason,
  isBreakDay,
  normalizeNation,
  processInternationalDay,
} from "../src/engine/tournaments";
import { addDays } from "../src/engine/management";
import type { Game } from "../src/engine/types";

const cyrillic = /[А-Яа-яЁё]/;

function career(language: "ru" | "en", seed = 31337, user = "TOR") {
  const g = newGame(user, seed, language);
  g.id = "career-test";
  ensureManagementState(g);
  selectFranchiseStrategy(g, "wild-card-hunt");
  return g;
}

function nhlSnapshot(g: Game) {
  return JSON.stringify({
    records: g.teams.map((t) => t.record),
    stats: g.teams
      .flatMap((t) => [...t.players, ...(t.farm ?? []), ...(t.prospects ?? [])])
      .map((p) => [p.id, p.stats, p.history.length])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    round: g.round,
    schedule: g.schedule.filter((f) => f.result).length,
  });
}

function runCamp(g: Game) {
  while (g.calendar!.date < `${g.year}-10-07`) advanceDay(g);
}

function processDates(g: Game, from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) processInternationalDay(g, d);
}

const legalRoster = (g: Game) => {
  for (const team of g.teams) {
    const f = team.players.filter((p) => p.pos !== "D" && p.pos !== "G").length;
    const d = team.players.filter((p) => p.pos === "D").length;
    const gk = team.players.filter((p) => p.pos === "G").length;
    assert(f >= 12 && d >= 6 && gk >= 2, `${team.id} roster legal`);
  }
};

test("preseason camp: battles, cuts, cup winner, no NHL stat impact", () => {
  const g = career("en");
  const before = nhlSnapshot(g);
  const camp = g.preseason!;
  assert.equal(camp.year, 2026);
  assert(camp.candidates.length >= 8);
  assert(battleSpots(camp, "F") > 0 && battleSpots(camp, "D") > 0);
  assert.equal(g.preseasonFixtures!.length, 6);
  assert.equal(camp.cup.teams.length, 4);
  assert.equal(camp.cup.teams[0], "TOR");
  // Manager instruction is honoured at the final cuts.
  const invitee = camp.candidates.find((c) => c.source !== "nhl")!;
  setCampOverride(g, invitee.playerId, "keep");
  const orgSize = (game: Game) => {
    const t = game.teams.find((x) => x.id === "TOR")!;
    return t.players.length + (t.farm?.length ?? 0) + (t.prospects?.length ?? 0);
  };
  const sizeBefore = orgSize(g);
  const rosterBefore = g.teams.find((t) => t.id === "TOR")!.players.length;

  runCamp(g);
  assert.equal(g.round, 0, "no NHL round played during camp");
  assert(nhlSnapshot(g) === before, "standings and season stats untouched");
  assert(camp.firstCutsDone && camp.finalCutsDone);
  assert(camp.candidates.every((c) => c.status !== "competing"));
  assert(camp.candidates.some((c) => c.games > 0));
  assert(camp.decisions.length > 0);
  // The kept invitee made the team.
  const kept = camp.candidates.find((c) => c.playerId === invitee.playerId)!;
  assert.equal(kept.status, "made");
  assert(g.teams.find((t) => t.id === "TOR")!.players.some((p) => p.id === invitee.playerId));
  assert.equal(orgSize(g), sizeBefore, "cuts move players, never lose them");
  assert.equal(g.teams.find((t) => t.id === "TOR")!.players.length, rosterBefore);
  legalRoster(g);
  // Cup: 6 group games, final and third-place game, a champion.
  assert.equal(camp.cup.fixtures.length, 8);
  assert(camp.cup.fixtures.every((f) => f.goals));
  assert(camp.cup.teams.includes(camp.cup.winner!));
  assert.equal(cupStandings(camp.cup).reduce((s, r) => s + r.gp, 0), 12);
  assert.equal(g.preseasonCupHistory?.length, 1);
  assert(g.preseasonFixtures!.every((f) => f.result));
  assert(g.events!.some((e) => e.action === "preseason" && /Final cuts/.test(e.title)));
  assert(g.events!.filter((e) => e.action === "preseason").every((e) => !cyrillic.test(e.title + e.body)));
  assert.doesNotThrow(() => validateSave(JSON.parse(JSON.stringify(g))));
  assert.throws(() => setCampOverride(g, invitee.playerId, "cut"));
});

test("preseason camp is deterministic and Russian text stays Russian", () => {
  const a = career("ru", 5150, "MTL");
  const b = career("ru", 5150, "MTL");
  runCamp(a);
  runCamp(b);
  assert.deepEqual(a.preseason, b.preseason);
  assert.deepEqual(a.preseasonFixtures, b.preseasonFixtures);
  const camp = a.events!.filter((e) => e.action === "preseason");
  assert(camp.length >= 3);
  assert(camp.every((e) => cyrillic.test(e.title)));
});

test("the February break leaves a gap in the NHL schedule", () => {
  const g = career("en");
  assert.equal(g.internationalSeason?.breakStart, "2027-02-06");
  assert.equal(fixtureDate(g, 60), "2027-02-04");
  assert.equal(fixtureDate(g, 61), "2027-02-18");
  const dates = Array.from({ length: 84 }, (_, r) => fixtureDate(g, r));
  assert(dates.every((d) => d < "2027-02-06" || d >= "2027-02-18"));
  assert(isBreakDay(g, "2027-02-10"));
  assert(!isBreakDay(g, "2027-02-18"));
  assert.equal(new Set(dates).size, 84);
});

test("old saves load: mid-season careers past the break simply skip it", () => {
  const g = career("en");
  const old = JSON.parse(JSON.stringify(g)) as Game;
  delete old.internationalSeason;
  delete old.preseason;
  delete old.preseasonCupHistory;
  old.round = 70;
  old.calendar!.date = "2027-03-01";
  const loaded = validateSave(old);
  ensureManagementState(loaded);
  assert.equal(loaded.internationalSeason?.breakDays, 0);
  assert.deepEqual(
    loaded.internationalSeason?.tournaments.map((t) => t.kind),
    ["worlds"],
  );
  assert.equal(fixtureDate(loaded, 70), "2027-02-24");
  // A career saved in December still gets the February tournament.
  const december = JSON.parse(JSON.stringify(g)) as Game;
  delete december.internationalSeason;
  december.round = 30;
  december.calendar!.date = "2026-12-06";
  assert.equal(ensureInternationalSeason(december).breakDays, 12);
});

test("best-on-best: national rosters by nationality, deterministic, NHL stats untouched", () => {
  const run = () => {
    const g = career("en");
    const before = nhlSnapshot(g);
    processDates(g, "2027-01-09", "2027-02-16");
    return { g, before };
  };
  const { g, before } = run();
  const t = g.internationalSeason!.tournaments.find((x) => x.kind === "best-on-best")!;
  assert.equal(t.status, "complete");
  assert.equal(t.teams.length, 8);
  assert.equal(t.games.length, 12 + 2 + 2);
  assert(t.medals && new Set(Object.values(t.medals)).size === 3);
  const world = new Map(
    g.teams.flatMap((team) => [...team.players, ...(team.farm ?? [])]).map((p) => [p.id, p]),
  );
  for (const team of t.teams) {
    assert.equal(team.roster.length, 25);
    assert.equal(team.roster.filter((e) => e.pos === "G").length, 3);
    assert.equal(team.roster.filter((e) => e.pos === "D").length, 8);
    for (const entry of team.roster) {
      const real = world.get(entry.id);
      if (real) assert.equal(normalizeNation(real.nation), team.code);
    }
  }
  // Every player appears for one nation at most.
  const ids = t.teams.flatMap((team) => team.roster.map((e) => e.id));
  assert.equal(new Set(ids).size, ids.length);
  // Canada, the USA and Sweden are deep enough to need no generated depth.
  for (const code of ["CAN", "USA", "SWE"])
    assert(t.teams.find((x) => x.code === code)!.roster.every((e) => !e.generated));
  assert(nhlSnapshot(g) === before, "NHL standings and season stats unchanged");
  const medallist = [...world.values()].find((p) => p.international?.some((l) => l.medal === "gold"));
  assert(medallist, "gold medallists get an international career line");
  assert.equal(g.internationalHistory?.length, 1);
  assert(g.events!.some((e) => e.action === "international" && /call-ups/.test(e.title)));
  const again = run().g.internationalSeason!.tournaments[0];
  assert.deepEqual(again.medals, t.medals);
  assert.deepEqual(again.stats, t.stats);
  assert.doesNotThrow(() => validateSave(JSON.parse(JSON.stringify(g))));
});

test("World Championship takes only players from clubs out of the playoffs", () => {
  const g = career("ru");
  g.phase = "playoffs";
  g.round = 84;
  g.bracket = [[{ a: "TOR", b: "BOS", wins: [0, 0], games: [] }]];
  g.playoffRound = 0;
  processDates(g, "2027-05-05", "2027-05-21");
  const t = g.internationalSeason!.tournaments.find((x) => x.kind === "worlds")!;
  assert.equal(t.status, "complete");
  assert.equal(t.teams.length, 12);
  assert.equal(t.games.length, 30 + 4 + 2 + 2);
  const alive = new Set(
    g.teams.filter((team) => ["TOR", "BOS"].includes(team.id)).flatMap((team) => team.players.map((p) => p.id)),
  );
  assert(t.teams.every((team) => team.roster.every((e) => !alive.has(e.id))));
  assert(t.teams.some((team) => team.roster.some((e) => e.nhl)));
  const result = g.events!.find((e) => e.action === "international" && /Чемпионат мира/.test(e.title) && /чемпион/.test(e.title));
  assert(result, "Russian career gets Russian tournament news");
});

test("full season: break, both tournaments and a clean rollover", () => {
  const g = career("en", 777, "SJS");
  let roundAtBreak = -1;
  while (g.phase !== "offseason") {
    const date = g.calendar!.date;
    if (date === "2027-02-06") roundAtBreak = g.round;
    if (isBreakDay(g, date)) assert.equal(g.round, roundAtBreak, `no NHL games on ${date}`);
    advanceDay(g);
  }
  assert.equal(roundAtBreak, 61);
  const season = g.internationalSeason!;
  assert(season.tournaments.every((t) => t.status === "complete"));
  assert.equal(g.internationalHistory?.length, 2);
  const restored = validateSave(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(restored.internationalSeason, season);
  nextSeason(g);
  ensureManagementState(g);
  assert.equal(g.internationalSeason?.year, 2027);
  assert.equal(g.internationalSeason?.breakDays, 12);
  assert.equal(g.preseason?.year, 2027);
  assert.equal(g.preseasonFixtures?.length, 6);
});

test("save validation rejects broken tournament and camp data", () => {
  const g = career("en");
  const bad = JSON.parse(JSON.stringify(g)) as Game;
  bad.internationalSeason!.tournaments[0].kind = "olympics" as never;
  assert.throws(() => validateSave(bad), /international/i);
  const badCamp = JSON.parse(JSON.stringify(g)) as Game;
  badCamp.preseason!.candidates[0].status = "traded" as never;
  assert.throws(() => validateSave(badCamp), /preseason/i);
});

test("Russian tournament and camp messages translate when a career switches to English", async () => {
  const { translateEnglish } = await import("../src/i18n/englishMatch");
  const g = career("ru", 4242);
  runCamp(g);
  processDates(g, "2027-01-09", "2027-02-16");
  g.phase = "playoffs";
  g.bracket = [[{ a: "TOR", b: "BOS", wins: [0, 0], games: [] }]];
  processDates(g, "2027-05-05", "2027-05-21");
  const texts = g.events!
    .filter((e) => e.action === "preseason" || e.action === "international" || /сборн/.test(e.title))
    .flatMap((e) => [e.title, e.body]);
  assert(texts.length >= 12);
  const leftovers = texts.map(translateEnglish).filter((text) => cyrillic.test(text));
  assert.deepEqual(leftovers, []);
});
