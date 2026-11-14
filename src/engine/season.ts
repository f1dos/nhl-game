import { RNG, clamp } from "./random";
import { simulateMatch } from "./match";
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
export function advance(g: Game) {
  if (g.phase === "offseason") return;
  const r = new RNG(g.seed);
  g.teams.forEach((t) =>
    t.players.forEach((p) => {
      p.fatigue = Math.max(0, p.fatigue - 8);
      p.injury = Math.max(0, p.injury - 1);
    }),
  );
  const play = (home: string, away: string, po: boolean) =>
    simulateMatch(
      g.teams.find((t) => t.id === home)!,
      g.teams.find((t) => t.id === away)!,
      r,
      po,
    );
  if (g.phase === "regular") {
    for (const f of g.schedule.filter((f) => f.round === g.round)) {
      const res = play(f.home, f.away, false);
      recordResult(g, res);
      if ([f.home, f.away].includes(g.user)) g.last = res;
      f.result = { ...res, events: [] };
    }
    g.round++;
    if (g.round === 82) {
      g.phase = "playoffs";
      g.bracket = [
        [
          ...seedConference(g.teams.filter((t) => t.conference === "East")),
          ...seedConference(g.teams.filter((t) => t.conference === "West")),
        ],
      ];
      g.news.unshift("Регулярный сезон завершён. Начинается плей-офф.");
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
      s.games.push({ ...res, events: [] });
      if ([s.a, s.b].includes(g.user)) g.last = res;
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
        g.news.unshift(
          `${series[0].winner} — обладатель Кубка Стэнли ${g.year + 1}.`,
        );
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
  if (g.last) {
    const m = g.last;
    g.news.unshift(
      `${m.away} ${m.goals[1]} : ${m.goals[0]} ${m.home}${m.so ? " SO" : m.ot ? " OT" : ""}`,
    );
    g.news = g.news.slice(0, 80);
  }
}
export function nextSeason(g: Game) {
  if (g.phase !== "offseason") throw Error("Finish playoffs first");
  const r = new RNG(g.seed);
  g.year++;
  g.round = 0;
  g.phase = "regular";
  g.bracket = [];
  g.playoffRound = 0;
  g.last = undefined;
  g.schedule = makeSchedule(g.teams);
  g.teams.forEach((t) => {
    t.record = emptyRecord();
    t.players.forEach((p) => {
      p.age++;
      const delta =
        p.age < 26
          ? Math.min(p.potential - p.ovr, r.int(0, 3))
          : p.age > 31
            ? -r.int(0, 2)
            : r.int(-1, 1);
      for (const key of Object.keys(p.attributes))
        p.attributes[key] = clamp(p.attributes[key] + delta, 30, 99);
      p.ovr = Math.round(
        Object.values(p.attributes).reduce((a, b) => a + b) / 30,
      );
      p.years = Math.max(1, p.years - 1);
      p.stats = emptyStats();
      p.fatigue = 0;
      p.injury = 0;
      p.morale = 75;
    });
  });
  g.seed = r.seed;
  g.news.unshift(
    `Начинается сезон ${g.year}/${String(g.year + 1).slice(2)}. Автопродление контрактов в базовой версии.`,
  );
}
export function dateForRound(g: Game, round = g.round) {
  const d = new Date(Date.UTC(g.year, 9, 7));
  d.setUTCDate(d.getUTCDate() + round * 2);
  return d;
}
