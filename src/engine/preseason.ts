import {recordContract} from "./contractLedger";
import {capCharge} from "./cap";
/**
 * Preseason training camp for the managed club: camp phases, roster battles
 * for the last forward / defence spots, staff cuts to the farm or junior,
 * exhibition games and a neutral-site preseason cup (4-team group + final).
 *
 * Everything is simulated on cloned teams: preseason games never touch NHL
 * standings, season statistics, injuries or the main schedule. Camp grades
 * are deterministic (FNV hashing), cup games use the career RNG like the
 * older exhibition games did.
 */
import { rememberOpponent } from "./coaching";
import { simulateMatch } from "./match";
import { RNG, clamp } from "./random";
import { ensureSpecialTeams } from "./tactics";
import { salaryTotal } from "./contracts";
import { syncMoraleBonus, ensureFranchiseWorld } from "./franchiseWorld";
import { pushEvent } from "./management";
import { textFor } from "./text";
import type {
  Game,
  Player,
  PreseasonFixture,
  Result,
  Team,
} from "./types";

export type CampGroup = "F" | "D";
export type CampSource = "nhl" | "farm" | "prospect";
export type CampStatus = "competing" | "made" | "farm" | "junior";
export type CampPhase = "medicals" | "camp" | "cup" | "final" | "season";
export type CupStage = "group" | "final" | "third";

export interface I18nText {
  ru: string;
  en: string;
}

export interface CampCandidate {
  playerId: string;
  name: string;
  pos: Player["pos"];
  age: number;
  group: CampGroup;
  source: CampSource;
  /** Overall when camp opened. */
  ovr: number;
  potential: number;
  /** Accumulated practice grade (drills, scrimmages). */
  practice: number;
  games: number;
  goals: number;
  assists: number;
  ratingSum: number;
  score: number;
  rank: number;
  previousRank?: number;
  status: CampStatus;
  /** Manager instruction for the final cuts. */
  override?: "keep" | "cut";
}

export interface CampDecision {
  date: string;
  playerId: string;
  name: string;
  to: "nhl" | "farm" | "junior";
  reason: I18nText;
}

export interface CupFixture {
  id: string;
  date: string;
  stage: CupStage;
  home: string;
  away: string;
  goals?: [number, number];
  ot?: boolean;
  so?: boolean;
}

export interface PreseasonCup {
  host: I18nText;
  teams: string[];
  fixtures: CupFixture[];
  winner?: string;
  runnerUp?: string;
  third?: string;
}

export interface PreseasonState {
  year: number;
  candidates: CampCandidate[];
  decisions: CampDecision[];
  cup: PreseasonCup;
  firstCutsDone?: boolean;
  finalCutsDone?: boolean;
  /** Last processed camp practice date. */
  lastPractice?: string;
}

export interface CupHistoryEntry {
  year: number;
  winner: string;
  runnerUp: string;
  third: string;
  host: I18nText;
}

export const CUP_NAME: I18nText = {
  ru: "Кубок Лейкшор",
  en: "Lakeshore Cup",
};

const HOSTS: I18nText[] = [
  { ru: "Квебек", en: "Quebec City" },
  { ru: "Саскатун", en: "Saskatoon" },
  { ru: "Гамильтон", en: "Hamilton" },
  { ru: "Галифакс", en: "Halifax" },
  { ru: "Хартфорд", en: "Hartford" },
  { ru: "Канзас-Сити", en: "Kansas City" },
  { ru: "Портленд", en: "Portland" },
];

/** Camp calendar for a season that starts in `year`. */
export function campDates(year: number) {
  return {
    open: `${year}-09-15`,
    exhibitions: [`${year}-09-20`, `${year}-09-23`, `${year}-10-02`],
    firstCuts: `${year}-09-24`,
    cupGroup: [`${year}-09-26`, `${year}-09-27`, `${year}-09-28`],
    cupFinal: `${year}-09-30`,
    finalCuts: `${year}-10-05`,
    opener: `${year}-10-07`,
  };
}

export function campPhase(g: Game, date = g.calendar?.date ?? ""): CampPhase {
  const d = campDates(g.year);
  if (g.phase !== "regular" || g.round > 0 || date >= d.opener) return "season";
  if (date < d.exhibitions[0]) return "medicals";
  if (date < d.cupGroup[0]) return "camp";
  if (date <= d.cupFinal) return "cup";
  return "final";
}

export const CAMP_PHASES: { key: CampPhase; ru: string; en: string }[] = [
  { key: "medicals", ru: "Медосмотр и тесты", en: "Medicals & testing" },
  { key: "camp", ru: "Основной лагерь", en: "Main camp" },
  { key: "cup", ru: CUP_NAME.ru, en: CUP_NAME.en },
  { key: "final", ru: "Финальные сокращения", en: "Final cuts" },
  { key: "season", ru: "Старт сезона", en: "Opening night" },
];

function hash(value: string) {
  let n = 2166136261;
  for (const char of value) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return n >>> 0;
}

const groupOf = (p: Player): CampGroup | undefined =>
  p.pos === "G" ? undefined : p.pos === "D" ? "D" : "F";

function userTeam(g: Game) {
  return g.teams.find((team) => team.id === g.user)!;
}

function locate(team: Team, id: string): CampSource | undefined {
  if (team.players.some((p) => p.id === id)) return "nhl";
  if (team.farm?.some((p) => p.id === id)) return "farm";
  if (team.prospects?.some((p) => p.id === id)) return "prospect";
  return undefined;
}

function findOrgPlayer(team: Team, id: string) {
  return (
    team.players.find((p) => p.id === id) ??
    team.farm?.find((p) => p.id === id) ??
    team.prospects?.find((p) => p.id === id)
  );
}

function candidateFrom(p: Player, source: CampSource): CampCandidate {
  return {
    playerId: p.id,
    name: p.name,
    pos: p.pos,
    age: p.age,
    group: groupOf(p)!,
    source,
    ovr: p.ovr,
    potential: p.potential,
    practice: 0,
    games: 0,
    goals: 0,
    assists: 0,
    ratingSum: 0,
    score: 0,
    rank: 0,
    status: "competing",
  };
}

/** Fringe NHL players plus the best farm / junior invitees. */
function pickCandidates(team: Team): CampCandidate[] {
  const out: CampCandidate[] = [];
  const nhl = (group: CampGroup, keep: number) =>
    team.players
      .filter((p) => groupOf(p) === group)
      .sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id))
      .slice(keep);
  for (const p of nhl("F", 10)) out.push(candidateFrom(p, "nhl"));
  for (const p of nhl("D", 5)) out.push(candidateFrom(p, "nhl"));
  const upside = (p: Player) =>
    p.ovr + 0.35 * Math.max(0, p.potential - p.ovr) - Math.max(0, p.age - 25);
  const invite = (pool: Player[], group: CampGroup, n: number) =>
    pool
      .filter((p) => groupOf(p) === group && p.injury <= 0 && p.age <= 27)
      .sort((a, b) => upside(b) - upside(a) || a.id.localeCompare(b.id))
      .slice(0, n);
  const farm = team.farm ?? [];
  for (const p of invite(farm, "F", 4)) out.push(candidateFrom(p, "farm"));
  for (const p of invite(farm, "D", 2)) out.push(candidateFrom(p, "farm"));
  const juniors = (team.prospects ?? []).filter((p) => p.age <= 21);
  for (const p of [...invite(juniors, "F", 2), ...invite(juniors, "D", 1)])
    out.push(candidateFrom(p, "prospect"));
  return out;
}

function campScore(c: CampCandidate) {
  const upside = c.age <= 23 ? Math.min(3, 0.2 * Math.max(0, c.potential - c.ovr)) : 0;
  const avg = c.games ? c.ratingSum / c.games : 6;
  const perf = c.games
    ? clamp(
        (avg - 6.2) * 2.4 * Math.min(1, c.games / 2) +
          c.goals * 0.8 +
          c.assists * 0.4,
        -5,
        7,
      )
    : 0;
  // Incumbents get the benefit of the doubt from the staff.
  const experience = c.source === "nhl" ? 2 : 0;
  return Math.round((c.ovr + upside + experience + c.practice + perf) * 10) / 10;
}

export function rankCandidates(state: PreseasonState) {
  for (const c of state.candidates) c.score = campScore(c);
  for (const group of ["F", "D"] as CampGroup[]) {
    const list = state.candidates
      .filter((c) => c.group === group && c.status !== "farm" && c.status !== "junior")
      .sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));
    list.forEach((c, index) => {
      c.previousRank = c.rank || undefined;
      c.rank = index + 1;
    });
    state.candidates
      .filter((c) => c.group === group && (c.status === "farm" || c.status === "junior"))
      .forEach((c) => (c.rank = 0));
  }
}

/** Number of NHL roster spots open in a battle group. */
export function battleSpots(state: PreseasonState, group: CampGroup) {
  return state.candidates.filter((c) => c.group === group && c.source === "nhl")
    .length;
}

function pickOpponents(g: Game) {
  const team = userTeam(g);
  const order = (ids: Team[]) =>
    [...ids].sort(
      (a, b) =>
        hash(`${g.year}:${g.user}:${a.id}`) - hash(`${g.year}:${g.user}:${b.id}`) ||
        a.id.localeCompare(b.id),
    );
  const others = order(g.teams.filter((club) => club.id !== g.user));
  const sameConference = others.filter((club) => club.conference === team.conference);
  const otherConference = others.filter((club) => club.conference !== team.conference);
  const cup = [sameConference[0], otherConference[0], otherConference[1]].map(
    (club) => club.id,
  );
  const exhibition = sameConference
    .filter((club) => !cup.includes(club.id))
    .slice(0, 3)
    .map((club) => club.id);
  return { cup, exhibition };
}

/**
 * Create the camp for a brand-new season. Returns false for careers that
 * are already past the start of camp (old saves keep their old preseason).
 */
export function seedPreseasonCamp(g: Game) {
  if (g.preseasonFixtures) return false;
  const d = campDates(g.year);
  const date = g.calendar?.date ?? d.open;
  if (g.phase !== "regular" || g.round > 0 || date > d.exhibitions[0]) {
    g.preseasonFixtures = [];
    return false;
  }
  const { cup, exhibition } = pickOpponents(g);
  const teams = [g.user, ...cup];
  // Round robin: (0-1, 2-3), (0-2, 1-3), (0-3, 1-2)
  const pairs = [
    [[0, 1], [2, 3]],
    [[2, 0], [3, 1]],
    [[0, 3], [1, 2]],
  ];
  const fixtures: CupFixture[] = pairs.flatMap((day, dayIndex) =>
    day.map(([h, a], i) => ({
      id: `cup-${g.year}-g${dayIndex}${i}`,
      date: d.cupGroup[dayIndex],
      stage: "group" as const,
      home: teams[h],
      away: teams[a],
    })),
  );
  const host = HOSTS[(g.year + hash(g.user)) % HOSTS.length];
  g.preseason = {
    year: g.year,
    candidates: pickCandidates(userTeam(g)),
    decisions: [],
    cup: { host, teams, fixtures },
  };
  rankCandidates(g.preseason);
  const exhibitions: PreseasonFixture[] = d.exhibitions.map((day, index) => ({
    id: `pre-${g.year}-${index}`,
    date: day,
    home: index === 1 ? exhibition[index] : g.user,
    away: index === 1 ? g.user : exhibition[index],
    kind: "exhibition",
  }));
  const cupGames: PreseasonFixture[] = fixtures
    .filter((f) => [f.home, f.away].includes(g.user))
    .map((f) => ({
      id: f.id,
      date: f.date,
      home: f.home,
      away: f.away,
      kind: "cup",
      stage: f.stage,
      neutral: true,
    }));
  g.preseasonFixtures = [...exhibitions, ...cupGames].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return true;
}

export interface CupRow {
  team: string;
  gp: number;
  w: number;
  otw: number;
  otl: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

/** Group table: 3 points for a regulation win, 2 / 1 after overtime. */
export function cupStandings(cup: PreseasonCup): CupRow[] {
  const rows = new Map<string, CupRow>(
    cup.teams.map((team) => [
      team,
      { team, gp: 0, w: 0, otw: 0, otl: 0, l: 0, gf: 0, ga: 0, pts: 0 },
    ]),
  );
  for (const f of cup.fixtures) {
    if (f.stage !== "group" || !f.goals) continue;
    const [h, a] = f.goals;
    const extra = !!(f.ot || f.so);
    for (const [id, gf, ga] of [
      [f.home, h, a],
      [f.away, a, h],
    ] as const) {
      const row = rows.get(id)!;
      row.gp++;
      row.gf += gf;
      row.ga += ga;
      if (gf > ga) {
        if (extra) row.otw++;
        else row.w++;
        row.pts += extra ? 2 : 3;
      } else if (extra) {
        row.otl++;
        row.pts += 1;
      } else row.l++;
    }
  }
  const headToHead = (a: string, b: string) => {
    const game = cup.fixtures.find(
      (f) =>
        f.stage === "group" &&
        f.goals &&
        [f.home, f.away].includes(a) &&
        [f.home, f.away].includes(b),
    );
    if (!game?.goals) return 0;
    const winner =
      game.goals[0] > game.goals[1] ? game.home : game.away;
    return winner === a ? -1 : 1;
  };
  return [...rows.values()].sort(
    (a, b) =>
      b.pts - a.pts ||
      headToHead(a.team, b.team) ||
      b.gf - b.ga - (a.gf - a.ga) ||
      b.gf - a.gf ||
      a.team.localeCompare(b.team),
  );
}

interface LineScore {
  goals: number;
  assists: number;
  rating?: number;
}

/** Per-player goals / assists / rating of one side of a result. */
function lineScores(result: Result, clone?: Team, before?: Map<string, [number, number]>) {
  const out = new Map<string, LineScore>();
  if (clone && before)
    for (const p of clone.players) {
      const old = before.get(p.id);
      if (!old) continue;
      const rating = result.ratings?.[p.id];
      if (rating === undefined && p.stats.g === old[0] && p.stats.a === old[1]) continue;
      out.set(p.id, { goals: p.stats.g - old[0], assists: p.stats.a - old[1], rating });
    }
  else {
    for (const [id, rating] of Object.entries(result.ratings ?? {}))
      out.set(id, { goals: 0, assists: 0, rating });
    for (const event of result.events)
      if (event.type === "goal" && event.playerId) {
        const line = out.get(event.playerId) ?? { goals: 0, assists: 0 };
        line.goals++;
        out.set(event.playerId, line);
      }
  }
  return out;
}

/**
 * The user's camp lineup for simulated preseason games: the regulars play
 * the top of the lineup, competing candidates rotate through the bottom six
 * and the third pair (fewest games first).
 */
export function campLineup(g: Game, state: PreseasonState): Team {
  const team = structuredClone(userTeam(g));
  const invited = state.candidates
    .filter((c) => c.status === "competing" && c.source !== "nhl")
    .map((c) => findOrgPlayer(userTeam(g), c.playerId))
    .filter((p): p is Player => !!p && p.injury <= 0)
    .map((p) => structuredClone(p));
  team.players.push(...invited);
  const competing = new Set(
    state.candidates.filter((c) => c.status === "competing").map((c) => c.playerId),
  );
  const healthy = team.players.filter((p) => p.injury <= 0);
  const fill = (group: CampGroup, total: number, rotate: number) => {
    const regulars = healthy
      .filter((p) => groupOf(p) === group && !competing.has(p.id))
      .sort((a, b) => b.ovr - a.ovr);
    const candidates = healthy
      .filter((p) => groupOf(p) === group && competing.has(p.id))
      .sort((a, b) => {
        const ca = state.candidates.find((c) => c.playerId === a.id)!;
        const cb = state.candidates.find((c) => c.playerId === b.id)!;
        return ca.games - cb.games || ca.rank - cb.rank || a.id.localeCompare(b.id);
      });
    const dressed = candidates.slice(0, Math.min(rotate, total));
    const top = regulars.slice(0, total - dressed.length);
    const extra = [...regulars.slice(top.length), ...candidates.slice(dressed.length)];
    const list = [...top, ...dressed];
    while (list.length < total && extra.length) list.push(extra.shift()!);
    return list.map((p) => p.id);
  };
  const forwards = fill("F", 12, 5);
  const defense = fill("D", 6, 3);
  team.lines = Array.from({ length: 4 }, (_, i) => forwards.slice(i * 3, i * 3 + 3));
  team.defense = Array.from({ length: 3 }, (_, i) => defense.slice(i * 2, i * 2 + 2));
  const goalies = healthy.filter((p) => p.pos === "G").sort((a, b) => b.ovr - a.ovr);
  // Starter and backup split the camp games.
  const played = (g.preseasonFixtures ?? []).filter((f) => f.result).length;
  team.goalie = (goalies[played % 2] ?? goalies[0])?.id ?? team.goalie;
  team.specialTeams = undefined;
  ensureSpecialTeams(team);
  return team;
}

function statSnapshot(team: Team) {
  return new Map(team.players.map((p) => [p.id, [p.stats.g, p.stats.a] as [number, number]]));
}

function creditCandidates(state: PreseasonState, lines: Map<string, LineScore>) {
  for (const c of state.candidates) {
    const line = lines.get(c.playerId);
    if (!line || c.status !== "competing") continue;
    c.games++;
    c.goals += line.goals;
    c.assists += line.assists;
    c.ratingSum += line.rating ?? 6;
  }
}

function cupFixtureFor(state: PreseasonState, id: string) {
  return state.cup.fixtures.find((f) => f.id === id);
}

function storeCupScore(f: CupFixture, result: Result) {
  f.goals = [result.goals[0], result.goals[1]];
  f.ot = result.ot;
  f.so = result.so;
}

function cloneTeam(g: Game, id: string) {
  return structuredClone(g.teams.find((team) => team.id === id)!);
}

/** Practice grades on camp days without a game. */
function campPractice(g: Game, state: PreseasonState, date: string) {
  if (state.lastPractice === date) return;
  state.lastPractice = date;
  const team = userTeam(g);
  const intensity = team.trainingSchedule?.intensity ?? "normal";
  for (const c of state.candidates) {
    if (c.status !== "competing") continue;
    const p = findOrgPlayer(team, c.playerId);
    const roll = (hash(`${state.year}:${date}:${c.playerId}`) % 1000) / 1000;
    const drive = ((p?.motivation ?? 50) - 50) / 120 + (c.age <= 23 ? 0.15 : 0);
    const load = intensity === "high" ? 0.15 : intensity === "low" ? -0.1 : 0;
    c.practice = Math.round(clamp(c.practice + (roll - 0.45) * 1.6 + drive + load, -4, 5) * 10) / 10;
  }
}

function moveOut(list: Player[] | undefined, id: string) {
  const index = list?.findIndex((p) => p.id === id) ?? -1;
  return index >= 0 ? list!.splice(index, 1)[0] : undefined;
}

function replaceInLineup(team: Team, from: string, to: string) {
  team.lines = team.lines.map((line) => line.map((id) => (id === from ? to : id)));
  team.defense = team.defense.map((pair) => pair.map((id) => (id === from ? to : id)));
  for (const unit of Object.values(team.specialTeams ?? {}))
    if (unit) unit.players = unit.players.map((id) => (id === from ? to : id));
}

function adjustMorale(p: Player | undefined, delta: number) {
  if (!p) return;
  p.morale = clamp(p.morale + delta, 0, 100);
  syncMoraleBonus(p);
}

function firstCuts(g: Game, state: PreseasonState, date: string) {
  const t = textFor(g);
  const cut: CampCandidate[] = [];
  for (const group of ["F", "D"] as CampGroup[]) {
    const spots = battleSpots(state, group);
    const list = state.candidates
      .filter((c) => c.group === group && c.status === "competing")
      .sort((a, b) => a.rank - b.rank);
    for (const c of list)
      if (c.source !== "nhl" && c.override !== "keep" && (c.rank > spots + 2 || c.override === "cut"))
        cut.push(c);
  }
  for (const c of cut) {
    c.status = c.source === "prospect" ? "junior" : "farm";
    state.decisions.push({
      date,
      playerId: c.playerId,
      name: c.name,
      to: c.status,
      reason:
        c.source === "prospect"
          ? { ru: "Вернётся в юниорскую команду набирать игровое время.", en: "Returns to junior to play big minutes." }
          : { ru: "Первая волна сокращений: отправлен в AHL.", en: "First wave of cuts: assigned to the AHL." },
    });
  }
  state.firstCutsDone = true;
  rankCandidates(state);
  pushEvent(g, {
    date,
    category: "organization",
    priority: "normal",
    title: t("Лагерь: первая волна сокращений", "Camp: first round of cuts"),
    body: cut.length
      ? t(
          `Штаб отправил вниз: ${cut.map((c) => c.name).join(", ")}. Борьба за места продолжается.`,
          `The staff sent down: ${cut.map((c) => c.name).join(", ")}. The battle for spots continues.`,
        )
      : t(
          "Все приглашённые остаются в лагере до финальных сокращений.",
          "Every invitee stays in camp until the final cuts.",
        ),
    teamId: g.user,
    action: "preseason",
  });
}

function finalCuts(g: Game, state: PreseasonState, date: string) {
  const t = textFor(g);
  const team = userTeam(g);
  const promoted: string[] = [];
  const demoted: string[] = [];
  for (const group of ["F", "D"] as CampGroup[]) {
    const spots = battleSpots(state, group);
    const list = state.candidates
      .filter((c) => c.group === group && c.status === "competing")
      .sort((a, b) => {
        const weight = (c: CampCandidate) => {
          const p = findOrgPlayer(team, c.playerId);
          // Staff will not bury a big contract in the minors.
          const protectedDeal =
            c.source === "nhl" && ((p?.salary ?? 0) >= 2.5 || (p?.age ?? 0) >= 32);
          return c.override === "keep" || protectedDeal ? 0 : c.override === "cut" ? 2 : 1;
        };
        return weight(a) - weight(b) || a.rank - b.rank;
      });
    const made = list.slice(0, spots);
    const out = list.slice(spots);
    // At most two jobs per position group change hands in one camp.
    const risers = made.filter((c) => c.source !== "nhl").slice(0, 2);
    for (const c of made.filter((c) => c.source !== "nhl").slice(2)) {
      out.push(c);
      made.splice(made.indexOf(c), 1);
    }
    const fallers = out.filter((c) => c.source === "nhl").reverse();
    for (const c of fallers.slice(risers.length)) {
      made.push(c);
      out.splice(out.indexOf(c), 1);
    }
    for (const c of out.filter((c) => c.source !== "nhl")) {
      c.status = c.source === "prospect" ? "junior" : "farm";
      state.decisions.push({
        date,
        playerId: c.playerId,
        name: c.name,
        to: c.status,
        reason:
          c.source === "prospect"
            ? { ru: "Финальные сокращения: продолжит развитие в юниорах.", en: "Final cuts: keeps developing in junior." }
            : { ru: "Финальные сокращения: начнёт сезон в AHL.", en: "Final cuts: starts the season in the AHL." },
      });
      adjustMorale(findOrgPlayer(team, c.playerId), -2);
    }
    for (const c of made.filter((c) => c.source === "nhl")) c.status = "made";
    risers.forEach((riser, index) => {
      const faller = fallers[index];
      const up = findOrgPlayer(team, riser.playerId);
      const down = faller && team.players.find((p) => p.id === faller.playerId);
      const salary =
        riser.source === "prospect" ? 0.95 : Math.max(up?.salary ?? 0.8, 0.8);
      if (
        !up ||
        !down ||
        salaryTotal(team) - capCharge(down) + capCharge(up,salary) > g.rules.cap + 1e-8
      ) {
        riser.status = riser.source === "prospect" ? "junior" : "farm";
        if (faller) faller.status = "made";
        state.decisions.push({
          date,
          playerId: riser.playerId,
          name: riser.name,
          to: riser.status,
          reason: {
            ru: "Заслужил место, но не помещается под потолок зарплат.",
            en: "Earned a spot but does not fit under the salary cap.",
          },
        });
        return;
      }
      moveOut(riser.source === "prospect" ? team.prospects : team.farm, up.id);
      if (riser.source === "prospect" || up.contractType === "AHL" || !up.years) {
        up.salary = salary;
        up.years = Math.max(1, riser.source === "prospect" ? 3 : 2);
        up.contractType = riser.source === "prospect" ? "ELC" : "NHL";
        up.contractSource = "generated";
        up.contractExpiryYear = g.year + up.years;
        up.contractStatus = up.age < 27 ? "RFA" : "UFA";
        up.contractRemainingValue = Math.round(up.salary * up.years * 100) / 100;
        recordContract(g,team.id,up,"sign");
      }
      up.league = "NHL";
      up.currentClub = team.id;
      moveOut(team.players, down.id);
      team.players.push(up);
      (team.farm ??= []).push(down);
      down.league = "AHL";
      replaceInLineup(team, down.id, up.id);
      riser.status = "made";
      faller.status = "farm";
      adjustMorale(up, 8);
      adjustMorale(down, -10);
      promoted.push(up.name);
      demoted.push(down.name);
      state.decisions.push(
        {
          date,
          playerId: up.id,
          name: up.name,
          to: "nhl",
          reason: {
            ru: `Выиграл борьбу за место у ${down.name}.`,
            en: `Won the roster spot over ${down.name}.`,
          },
        },
        {
          date,
          playerId: down.id,
          name: down.name,
          to: "farm",
          reason: {
            ru: `Уступил место ${up.name} и начнёт сезон в AHL.`,
            en: `Lost the spot to ${up.name} and starts the season in the AHL.`,
          },
        },
      );
    });
  }
  if (promoted.length) {
    ensureSpecialTeams(team);
    (g.transactions ??= []).push({
      year: g.year,
      round: g.round,
      message: t(
        `Финальные сокращения: в состав — ${promoted.join(", ")}; в AHL — ${demoted.join(", ")}.`,
        `Final cuts: ${promoted.join(", ")} make the team; ${demoted.join(", ")} assigned to the AHL.`,
      ),
    });
  }
  state.finalCutsDone = true;
  rankCandidates(state);
  pushEvent(g, {
    date,
    category: "organization",
    priority: "high",
    title: t("Финальные сокращения: состав на старт сезона", "Final cuts: opening-night roster set"),
    body: promoted.length
      ? t(
          `Место в составе заработали: ${promoted.join(", ")}. В AHL отправлены: ${demoted.join(", ")}.`,
          `Earned a roster spot: ${promoted.join(", ")}. Assigned to the AHL: ${demoted.join(", ")}.`,
        )
      : t(
          "Ветераны удержали свои места. Приглашённые игроки вернулись в фарм-клуб и юниоры.",
          "The veterans kept their spots. The invitees went back to the farm and junior teams.",
        ),
    teamId: g.user,
    action: "preseason",
  });
}

function scheduleCupFinals(g: Game, state: PreseasonState) {
  const cup = state.cup;
  if (cup.fixtures.some((f) => f.stage !== "group")) return;
  if (cup.fixtures.some((f) => f.stage === "group" && !f.goals)) return;
  const table = cupStandings(cup);
  const date = campDates(state.year).cupFinal;
  const finals: CupFixture[] = [
    { id: `cup-${state.year}-final`, date, stage: "final", home: table[0].team, away: table[1].team },
    { id: `cup-${state.year}-third`, date, stage: "third", home: table[2].team, away: table[3].team },
  ];
  cup.fixtures.push(...finals);
  const own = finals.find((f) => [f.home, f.away].includes(g.user))!;
  g.preseasonFixtures!.push({
    id: own.id,
    date: own.date,
    home: own.home,
    away: own.away,
    kind: "cup",
    stage: own.stage,
    neutral: true,
  });
  const t = textFor(g);
  const opponent = own.home === g.user ? own.away : own.home;
  pushEvent(g, {
    date: g.calendar!.date,
    category: "game",
    priority: "normal",
    title:
      own.stage === "final"
        ? t(`${CUP_NAME.ru}: ${g.user} в финале против ${opponent}`, `${CUP_NAME.en}: ${g.user} reach the final against ${opponent}`)
        : t(`${CUP_NAME.ru}: матч за 3-е место против ${opponent}`, `${CUP_NAME.en}: third-place game against ${opponent}`),
    body: t(
      `Группа завершена: ${table.map((row, i) => `${i + 1}. ${row.team} ${row.pts}`).join(", ")}.`,
      `Group stage over: ${table.map((row, i) => `${i + 1}. ${row.team} ${row.pts}`).join(", ")}.`,
    ),
    teamId: g.user,
    action: "preseason",
  });
}

function crownCupWinner(g: Game, state: PreseasonState) {
  const cup = state.cup;
  if (cup.winner) return;
  const final = cup.fixtures.find((f) => f.stage === "final");
  const third = cup.fixtures.find((f) => f.stage === "third");
  if (!final?.goals || !third?.goals) return;
  const win = (f: CupFixture) => (f.goals![0] > f.goals![1] ? f.home : f.away);
  cup.winner = win(final);
  cup.runnerUp = cup.winner === final.home ? final.away : final.home;
  cup.third = win(third);
  (g.preseasonCupHistory ??= []).push({
    year: state.year,
    winner: cup.winner,
    runnerUp: cup.runnerUp,
    third: cup.third,
    host: cup.host,
  });
  g.preseasonCupHistory = g.preseasonCupHistory.slice(-20);
  const t = textFor(g);
  ensureFranchiseWorld(g);
  const fans = g.fans?.[g.user];
  const team = userTeam(g);
  const won = cup.winner === g.user;
  const place = won ? 1 : cup.runnerUp === g.user ? 2 : cup.third === g.user ? 3 : 4;
  // Small, preseason-sized effects: nothing here changes NHL standings.
  const morale = [0, 3, 1, 0, -1][place];
  const happiness = [0, 3, 1, 0, -1][place];
  for (const p of team.players) adjustMorale(p, morale);
  if (fans) {
    fans.happiness = clamp(fans.happiness + happiness, 0, 100);
    fans.engagement = clamp(fans.engagement + (won ? 2 : 0), 0, 100);
    if (won) fans.supporters += 1500;
    fans.lastChange = won
      ? t(`Трофей предсезонья: ${CUP_NAME.ru}`, `Preseason silverware: ${CUP_NAME.en}`)
      : fans.lastChange;
  }
  const score = `${final.away} ${final.goals[1]}:${final.goals[0]} ${final.home}${final.so ? " SO" : final.ot ? " OT" : ""}`;
  pushEvent(g, {
    date: g.calendar!.date,
    category: "game",
    priority: won ? "high" : "normal",
    title: won
      ? t(`${g.user} выиграли ${CUP_NAME.ru}!`, `${g.user} win the ${CUP_NAME.en}!`)
      : t(`${CUP_NAME.ru}: победа ${cup.winner}`, `${CUP_NAME.en}: ${cup.winner} take the trophy`),
    body: won
      ? t(
          `Финал: ${score}. Раздевалка получила заряд перед сезоном, болельщики довольны.`,
          `Final: ${score}. A boost for the dressing room before the season, and the fans are pleased.`,
        )
      : t(
          `Финал: ${score}. ${g.user} — ${place}-е место. На таблицу NHL турнир не влияет.`,
          `Final: ${score}. ${g.user} finish ${["", "1st", "2nd", "3rd", "4th"][place]}. The cup has no effect on the NHL standings.`,
        ),
    teamId: g.user,
    action: "preseason",
  });
}

function openCamp(g: Game, state: PreseasonState, date: string) {
  const t = textFor(g);
  const spotsF = battleSpots(state, "F");
  const spotsD = battleSpots(state, "D");
  pushEvent(g, {
    date,
    category: "organization",
    priority: "normal",
    title: t("Тренировочный лагерь открыт", "Training camp is open"),
    body: t(
      `${state.candidates.length} игроков борются за ${spotsF + spotsD} последних мест (${spotsF} нап., ${spotsD} защ.). ${CUP_NAME.ru}: 26–30 сентября, ${state.cup.host.ru}.`,
      `${state.candidates.length} players battle for the last ${spotsF + spotsD} spots (${spotsF} F, ${spotsD} D). ${CUP_NAME.en}: Sept 26–30 in ${state.cup.host.en}.`,
    ),
    teamId: g.user,
    action: "preseason",
  });
}

/** Drop candidates that left the organization (trades, releases). */
function pruneCandidates(g: Game, state: PreseasonState) {
  const team = userTeam(g);
  state.candidates = state.candidates.filter((c) => {
    const where = locate(team, c.playerId);
    if (!where) return false;
    if (c.status === "competing" && where !== c.source) c.source = where;
    return true;
  });
}

/**
 * One preseason day: practices, the user's game (simulated or the result
 * played live in the match centre), other cup games, cuts and the trophy.
 * Returns true if the user played a preseason game today.
 */
export function processPreseasonDay(g: Game, date: string, completed?: Result) {
  const state = g.preseason?.year === g.year ? g.preseason : undefined;
  const d = campDates(g.year);
  if (state && date === d.open) openCamp(g, state, date);
  if (state) pruneCandidates(g, state);
  const fixture = g.preseasonFixtures?.find(
    (item) => item.date === date && !item.result,
  );
  if (fixture) {
    const rng = new RNG(g.seed);
    let lines: Map<string, LineScore>;
    if (completed) {
      fixture.result = completed;
      lines = lineScores(completed);
    } else {
      const own = state ? campLineup(g, state) : cloneTeam(g, g.user);
      const other = cloneTeam(g, fixture.home === g.user ? fixture.away : fixture.home);
      const before = statSnapshot(own);
      fixture.result = simulateMatch(
        fixture.home === g.user ? own : other,
        fixture.home === g.user ? other : own,
        rng,
        fixture.stage === "final" || fixture.stage === "third",
      );
      lines = lineScores(fixture.result, own, before);
    }
    g.seed = rng.seed;
    for (const id of [fixture.home, fixture.away]) rememberOpponent(g.teams.find(t => t.id === id)!, fixture.result);
    g.last = fixture.result;
    if (state) {
      creditCandidates(state, lines);
      const cupGame = cupFixtureFor(state, fixture.id);
      if (cupGame) storeCupScore(cupGame, fixture.result);
    }
    const t = textFor(g);
    const [hg, ag] = fixture.result.goals;
    pushEvent(g, {
      date,
      category: "game",
      priority: "normal",
      title:
        fixture.kind === "cup"
          ? t(
              `${CUP_NAME.ru}: ${fixture.away} ${ag}:${hg} ${fixture.home}`,
              `${CUP_NAME.en}: ${fixture.away} ${ag}-${hg} ${fixture.home}`,
            )
          : t(
              `Предсезонный матч: ${fixture.away} @ ${fixture.home}`,
              `Preseason game: ${fixture.away} @ ${fixture.home}`,
            ),
      body: t(
        "Результат не влияет на таблицу. Используйте матч для проверки сочетаний и тактики.",
        "The result does not count in the standings. Use the game to test combinations and tactics.",
      ),
    });
  }
  if (state) {
    for (const f of state.cup.fixtures.filter(
      (item) => item.date === date && !item.goals && ![item.home, item.away].includes(g.user),
    )) {
      const rng = new RNG(g.seed);
      const result = simulateMatch(
        cloneTeam(g, f.home),
        cloneTeam(g, f.away),
        rng,
        f.stage !== "group",
      );
      g.seed = rng.seed;
      for (const id of [f.home,f.away]) rememberOpponent(g.teams.find(team=>team.id===id)!,result);
      storeCupScore(f, result);
    }
    if (!fixture && date >= d.open && date < d.opener) campPractice(g, state, date);
    rankCandidates(state);
    if (date === d.cupGroup[2]) scheduleCupFinals(g, state);
    if (date === d.cupFinal) crownCupWinner(g, state);
    if (date >= d.firstCuts && !state.firstCutsDone) firstCuts(g, state, date);
    if (date >= d.finalCuts && !state.finalCutsDone) finalCuts(g, state, date);
  }
  return !!fixture;
}

/** Manager instruction for the final cuts (`undefined` = staff decides). */
export function setCampOverride(
  g: Game,
  playerId: string,
  override: "keep" | "cut" | undefined,
) {
  const state = g.preseason;
  if (!state || state.finalCutsDone) throw Error(textFor(g)("Сокращения уже завершены", "Cuts are already complete"));
  const c = state.candidates.find((item) => item.playerId === playerId);
  if (!c || c.status !== "competing") throw Error(textFor(g)("Игрок не участвует в борьбе за место", "The player is not in a roster battle"));
  c.override = override;
}

/** Days until a camp milestone, for the preseason page. */
export function campCountdown(g: Game) {
  const d = campDates(g.year);
  const today = g.calendar?.date ?? d.open;
  const days = (to: string) =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return {
    firstCuts: days(d.firstCuts),
    cup: days(d.cupGroup[0]),
    finalCuts: days(d.finalCuts),
    opener: days(d.opener),
    progress: clamp(
      Math.round(
        ((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d.open}T00:00:00Z`)) /
          (Date.parse(`${d.opener}T00:00:00Z`) - Date.parse(`${d.open}T00:00:00Z`))) *
          100,
      ),
      0,
      100,
    ),
  };
}
