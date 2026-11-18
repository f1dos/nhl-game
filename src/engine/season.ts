import { tx } from "./text";
import { RNG, clamp } from "./random";
import { overall } from "./ratings";
import { expireContracts } from "./contracts";
import { ageWorld } from "./lifecycle";
import { trainTeam } from "./training";
import {
  autoCompleteDraft,
  openDraft,
  prepareNextDraft,
  progressScouting,
} from "./draft";
import { simulateMatch } from "./match";
import { finishInternationalSeason } from "./tournaments";
import { resolveInternationalOffers } from "./international";
import { refreshInternationalMarket } from "./database";
import { reviewSeasonStrategy } from "./strategy";
import { applyWorldMatchReaction } from "./franchiseWorld";
import { decideConnSmythe, decideRegularSeasonAwards } from "./awards";
import {
  emptyRecord,
  emptyStats,
  type Team,
  type Fixture,
  type Game,
  type Result,
  type Series,
} from "./types";
export function makeSchedule(teams: Team[]): Fixture[] {
  let ring = teams.map((t) => t.id);
  const first: { home: string; away: string }[][] = [];
  for (let n = 0; n < 31; n++) {
    first.push(
      Array.from({ length: 16 }, (_, i) => ({
        home: ring[n % 2 ? 31 - i : i],
        away: ring[n % 2 ? i : 31 - i],
      })),
    );
    ring = [ring[0], ring[31], ...ring.slice(1, 31)];
  }
  const reverse = (xs: typeof first) =>
    xs.map((r) => r.map((g) => ({ home: g.away, away: g.home })));
  return [
    ...first,
    ...reverse(first),
    ...first.slice(0, 10),
    ...reverse(first.slice(0, 10)),
  ].flatMap((games, round) =>
    games.map((g, i) => ({ ...g, id: `${round}-${i}`, round })),
  );
}
export function standings(teams: Team[]) {
  return [...teams].sort(
    (a, b) =>
      b.record.pts - a.record.pts ||
      b.record.rw - a.record.rw ||
      b.record.w - a.record.w ||
      b.record.gf - b.record.ga - (a.record.gf - a.record.ga) ||
      b.record.gf - a.record.gf ||
      a.id.localeCompare(b.id),
  );
}
function recordResult(g: Game, res: Result) {
  [res.home, res.away].forEach((id, i) => {
    const s = g.teams.find((t) => t.id === id)!.record;
    const won = res.goals[i] > res.goals[1 - i];
    s.gp++;
    s.gf += res.goals[i];
    s.ga += res.goals[1 - i];
    s.w += +won;
    s.l += +(!won && !res.ot);
    s.otl += +(!won && res.ot);
    s.pts += won ? 2 : res.ot ? 1 : 0;
    s.rw += +(won && !res.ot);
    s.pp += res.pp[i];
    s.ppo += res.ppo[i];
    s.pk += res.pp[1 - i];
    s.pko += res.ppo[1 - i];
    s.form = [...s.form, won ? "W" : res.ot ? "OT" : "L"].slice(-5);
  });
  applyWorldMatchReaction(g, res);
}
function seedConference(teams: Team[]): Series[] {
  const divisions = [...new Set(teams.map((t) => t.division))];
  const top = divisions.map((d) =>
    standings(teams.filter((t) => t.division === d)).slice(0, 3),
  );
  const ids = top.flat().map((t) => t.id);
  const wc = standings(teams.filter((t) => !ids.includes(t.id))).slice(0, 2);
  const order = top[0][0].record.pts >= top[1][0].record.pts ? [0, 1] : [1, 0];
  return order
    .flatMap((d, i) => [
      [top[d][0], wc[1 - i]],
      [top[d][1], top[d][2]],
    ])
    .map(([a, b]) => ({ a: a.id, b: b.id, wins: [0, 0], games: [] }));
}
export function advance(g: Game, completed?: Result) {
  if (g.phase === "offseason") return;
  const previousResult = g.last;
  const r = new RNG(g.seed);
  g.teams.forEach(trainTeam);
  const play = (home: string, away: string, po: boolean) =>
    completed?.home === home && completed.away === away ? completed : simulateMatch(
      g.teams.find((t) => t.id === home)!,
      g.teams.find((t) => t.id === away)!,
      r,
      po,
    );
  if (g.phase === "regular") {
    for (const f of g.schedule.filter((f) => f.round === g.round)) {
      const res = play(f.home, f.away, false);
      recordResult(g, res);
      const own = [f.home, f.away].includes(g.user);
      if (own) g.last = res;
      // Per-player ratings are kept only for the managed club's games.
      f.result = { ...res, events: [], ratings: own ? res.ratings : undefined };
    }
    g.round++;
    resolveInternationalOffers(g);
    progressScouting(g);
    if (g.round === 82) {
      g.phase = "playoffs";
      g.bracket = [
        [
          ...seedConference(g.teams.filter((t) => t.conference === "East")),
          ...seedConference(g.teams.filter((t) => t.conference === "West")),
        ],
      ];
      g.news.unshift(
        tx(
          g,
          "Регулярный сезон завершён. Начинается плей-офф.",
          "The regular season is over. The playoffs begin.",
        ),
      );
      decideRegularSeasonAwards(g);
      g.teams.forEach((t) =>
        t.players.forEach((p) => {
          p.history.push({ year: g.year, ovr: p.ovr, stats: { ...p.stats } });
          p.stats = emptyStats();
        }),
      );
    }
  } else {
    const series = g.bracket[g.playoffRound];
    for (const s of series.filter((s) => !s.winner)) {
      const n = s.wins[0] + s.wins[1];
      const home = [0, 1, 4, 6].includes(n) ? s.a : s.b,
        away = home === s.a ? s.b : s.a;
      const res = play(home, away, true);
      const winner = res.goals[0] > res.goals[1] ? home : away;
      s.wins[winner === s.a ? 0 : 1]++;
      const own = [s.a, s.b].includes(g.user);
      s.games.push({ ...res, events: [], ratings: own ? res.ratings : undefined });
      if (own) g.last = res;
      if (s.wins.includes(4)) s.winner = winner;
    }
    if (series.every((s) => s.winner)) {
      if (series.length === 1) {
        g.phase = "offseason";
        g.history.push({
          year: g.year,
          champion: series[0].winner!,
          points: g.teams.find((t) => t.id === g.user)!.record.pts,
        });
        reviewSeasonStrategy(g);
        g.news.unshift(
          tx(
            g,
            `${series[0].winner} — обладатель Кубка Стэнли ${g.year + 1}.`,
            `${series[0].winner} win the ${g.year + 1} Stanley Cup.`,
          ),
        );
        decideConnSmythe(
          g,
          series[0].winner!,
          series[0].winner === series[0].a ? series[0].b : series[0].a,
        );
        openDraft(g, r);
      } else {
        const winners = series.map((s) => s.winner!);
        g.bracket.push(
          Array.from({ length: winners.length / 2 }, (_, i) => ({
            a: winners[2 * i],
            b: winners[2 * i + 1],
            wins: [0, 0],
            games: [],
          })),
        );
        g.playoffRound++;
      }
    }
  }
  g.seed = r.seed;
  if (g.last && g.last !== previousResult) {
    const m = g.last;
    g.news.unshift(
      `${m.away} ${m.goals[1]} : ${m.goals[0]} ${m.home}${m.so ? " SO" : m.ot ? " OT" : ""}`,
    );
    g.news = g.news.slice(0, 80);
  }
}
export function nextSeason(g: Game) {
  const draft = structuredClone(g);
  rollover(draft);
  Object.assign(g, draft);
}
function rollover(g: Game) {
  if (g.phase !== "offseason") throw Error("Finish playoffs first");
  finishInternationalSeason(g);
  const r = new RNG(g.seed);
  const completedRecords = new Map(
    g.teams.map((team) => [team.id, { ...team.record }]),
  );
  autoCompleteDraft(g);
  g.year++;
  g.franchiseStrategy = undefined;
  g.strategySeason = undefined;
  g.round = 0;
  g.phase = "regular";
  if (g.calendar) {
    g.calendar.date = `${g.year}-09-15`;
    g.calendar.preseasonStart = g.calendar.date;
    g.calendar.seasonStart = `${g.year}-10-07`;
    g.calendar.day = 0;
    g.calendar.lastProcessedDate = `${g.year}-09-14`;
  }
  g.preseasonFixtures = undefined;
  g.preseason = undefined;
  g.bracket = [];
  g.playoffRound = 0;
  g.last = undefined;
  g.schedule = makeSchedule(g.teams);
  if (g.draftAssets) {
    const newYear = g.year + 3;
    const known = new Set(g.draftAssets.map((asset) => asset.id));
    for (const team of g.teams)
      for (let round = 1; round <= 7; round++) {
        const id = `${newYear}-${round}-${team.id}`;
        if (!known.has(id))
          g.draftAssets.push({
            id,
            year: newYear,
            round,
            originalTeam: team.id,
            currentTeam: team.id,
            projectedOverall: 16,
            value: Math.round(100 / round),
            history: [],
          });
      }
  }
  ageWorld(g, r);
  refreshInternationalMarket(g, r);
  expireContracts(g);
  updateCareerStrengthRatings(g, completedRecords);
  g.teams.forEach((t) => {
    t.record = emptyRecord();
  });
  prepareNextDraft(g, r);
  g.seed = r.seed;
  g.news.unshift(
    tx(
      g,
      `Начинается сезон ${g.year}/${String(g.year + 1).slice(2)}. Истёкшие контракты завершены; минимальные составы укомплектованы автоматически.`,
      `The ${g.year}/${String(g.year + 1).slice(2)} season begins. Expired contracts have ended; minimum rosters were filled automatically.`,
    ),
  );
}

function updateCareerStrengthRatings(
  g: Game,
  records: Map<string, ReturnType<typeof emptyRecord>>,
) {
  for (const team of g.teams) {
    const record = records.get(team.id)!;
    const core = [...team.players].sort((a, b) => b.ovr - a.ovr).slice(0, 20);
    const rosterRating =
      core.reduce((sum, player) => sum + player.ovr, 0) /
      Math.max(1, core.length);
    const performanceRating = record.gp
      ? 70 + (record.pts / (record.gp * 2)) * 22
      : rosterRating;
    team.strengthRating = Math.round(
      clamp(rosterRating * 0.72 + performanceRating * 0.28, 65, 95),
    );
    team.realWorldForm = undefined;
  }
  [...g.teams]
    .sort(
      (a, b) =>
        (b.strengthRating ?? 0) - (a.strengthRating ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .forEach((team, index) => (team.strengthRank = index + 1));
}
export function dateForRound(g: Game, round = g.round) {
  const d = new Date(Date.UTC(g.year, 9, 7));
  d.setUTCDate(d.getUTCDate() + round * 2);
  // The mid-season international break pushes every later round back.
  const b = g.internationalSeason;
  if (
    b &&
    b.year === g.year &&
    b.breakStart &&
    b.breakDays &&
    d.toISOString().slice(0, 10) >= b.breakStart
  )
    d.setUTCDate(d.getUTCDate() + b.breakDays);
  return d;
}
