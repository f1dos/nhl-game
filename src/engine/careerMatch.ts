import { campLineup } from "./preseason";
import { dateForRound } from "./season";
import { SpatialMatch } from "./spatialMatch";
import type { Game, Team } from "./types";

interface ClubFixture {
  date: string;
  home: string;
  away: string;
  kind: "preseason" | "regular" | "playoffs";
  eliminationRules: boolean;
}

export function nextClubFixture(g: Game): ClubFixture | undefined {
  const calendar = g.calendar;
  if (!calendar || g.phase === "offseason") return;
  const involvesClub = (f: { home: string; away: string }) =>
    f.home === g.user || f.away === g.user;
  if (g.phase === "playoffs") {
    const series = g.bracket[g.playoffRound]?.find(s =>
      !s.winner && (s.a === g.user || s.b === g.user));
    if (!series) return;
    const homeFirst = [0, 1, 4, 6].includes(series.wins[0] + series.wins[1]);
    const date = new Date(calendar.date + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + calendar.day % 2);
    return { home: homeFirst ? series.a : series.b, away: homeFirst ? series.b : series.a,
      date: date.toISOString().slice(0, 10), kind: "playoffs", eliminationRules: true };
  }
  const camp = g.preseasonFixtures?.filter(f => !f.result && involvesClub(f) && f.date >= calendar.date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const regular = g.schedule.find(f => f.round >= g.round && !f.result && involvesClub(f));
  const date = regular && dateForRound(g, regular.round).toISOString().slice(0, 10);
  if (camp && (!date || camp.date <= date))
    return { home: camp.home, away: camp.away, date: camp.date, kind: "preseason",
      eliminationRules: camp.stage === "third" || camp.stage === "final" };
  if (regular && date && date >= calendar.date)
    return { home: regular.home, away: regular.away, date, kind: "regular", eliminationRules: false };
}

export function clubMatchTeams(g: Game, fixture: ClubFixture): [Team, Team] {
  const team = (id: string) => fixture.kind === "preseason" && id === g.user && g.preseason?.year === g.year
    ? campLineup(g, g.preseason)
    : g.teams.find(t => t.id === id)!;
  const pair: [Team,Team] = [team(fixture.home), team(fixture.away)];
  const side = fixture.home === g.user ? 0 : 1;
  const coverage = g.matchCoverage;
  if (coverage?.date === fixture.date && coverage.opponent === pair[1-side].id)
    pair[side] = {...pair[side], tactics:{...pair[side].tactics, markPlayer:coverage.target}};
  const prep = g.matchPreparation;
  if (prep?.date === fixture.date && prep.opponent === pair[1-side].id)
    pair[side] = {...pair[side], tactics:{...pair[side].tactics, benchOpening:{plan:prep.plan,message:prep.talk?.message}}};
  return pair;
}

export function createClubMatch(home: Team, away: Team, seed: number, eliminationRules: boolean, recordReplay: boolean) {
  return new SpatialMatch(home, away, seed, eliminationRules, {
    presentation: true, openingDraw: true, clockRate: 2, recordReplay,
  });
}

export function applyClubMatch(g: Game, match: SpatialMatch, preseason: boolean) {
  if (!preseason)
    for (const team of match.teams) {
      const index = g.teams.findIndex(t => t.id === team.id);
      g.teams[index] = structuredClone(team);
      delete g.teams[index].tactics.markPlayer;
      delete g.teams[index].tactics.benchOpening;
    }
  g.seed = match.rng.seed;
  return structuredClone(match.result);
}

export function quickClubMatch(g: Game, fixture: ClubFixture) {
  const [home, away] = clubMatchTeams(g, fixture);
  const match = createClubMatch(home, away, g.seed, fixture.eliminationRules, false);
  while (!match.done) {
    if (match.intermission) match.resume();
    match.step();
  }
  return applyClubMatch(g, match, fixture.kind === "preseason");
}
