/**
 * International tournaments: a February best-on-best event during a
 * two-week NHL break and a World Championship in May for players whose
 * clubs are out of the playoffs.
 *
 * National teams are picked from the real nationalities in the save (NHL,
 * AHL, junior, European and free-agent pools) and topped up with generated
 * depth for the smaller hockey nations. Games run through the normal match
 * engine on cloned players, so NHL standings and season statistics never
 * change. What carries back to the clubs: injuries, some fatigue, morale
 * (medallists get a lift), players' international history, news and inbox.
 */
import { autoLines, createPlayer } from "./database";
import { simulateMatch } from "./match";
import { RNG, clamp } from "./random";
import { syncMoraleBonus } from "./franchiseWorld";
import { pushEvent } from "./management";
import { textFor } from "./text";
import {
  emptyRecord,
  emptyStats,
  type Game,
  type Player,
  type Position,
  type Team,
} from "./types";

export type TournamentKind = "best-on-best" | "worlds";
export type MedalColor = "gold" | "silver" | "bronze";
export type TournamentStage = "group" | "qf" | "sf" | "bronze" | "final";

export interface I18n {
  ru: string;
  en: string;
}

export const TOURNAMENT_NAMES: Record<TournamentKind, I18n> = {
  "best-on-best": { ru: "Зимний Кубок наций", en: "Winter Nations Cup" },
  worlds: { ru: "Чемпионат мира", en: "World Championship" },
};

export interface NationalRosterEntry {
  id: string;
  name: string;
  pos: Position;
  ovr: number;
  age: number;
  /** NHL club id, or a league / club label for players outside the NHL. */
  club: string;
  nhl: boolean;
  generated?: boolean;
}

export interface NationalTeam {
  code: string;
  group: "A" | "B";
  seed: number;
  strength: number;
  roster: NationalRosterEntry[];
}

export interface TournamentGame {
  id: string;
  date: string;
  stage: TournamentStage;
  group?: "A" | "B";
  home: string;
  away: string;
  goals?: [number, number];
  ot?: boolean;
  so?: boolean;
  /** Three stars (player ids). */
  stars?: string[];
}

export interface TournamentStatLine {
  id: string;
  name: string;
  nation: string;
  pos: Position;
  club: string;
  gp: number;
  g: number;
  a: number;
  sa: number;
  ga: number;
  wins: number;
}

export interface TournamentInjury {
  id: string;
  name: string;
  nation: string;
  club: string;
  days: number;
  date: string;
}

export interface InternationalTournament {
  id: string;
  kind: TournamentKind;
  season: number;
  host: I18n;
  announce: string;
  start: string;
  end: string;
  groupDays: string[];
  qfDay?: string;
  sfDay: string;
  medalDay: string;
  seed: number;
  status: "scheduled" | "announced" | "live" | "complete";
  nations: string[];
  teams: NationalTeam[];
  games: TournamentGame[];
  stats: Record<string, TournamentStatLine>;
  injuries: TournamentInjury[];
  medals?: { gold: string; silver: string; bronze: string };
}

export interface InternationalSeason {
  year: number;
  /** First day of the NHL break (no games until breakStart + breakDays). */
  breakStart?: string;
  breakDays: number;
  tournaments: InternationalTournament[];
}

export interface TournamentHistoryEntry {
  year: number;
  kind: TournamentKind;
  host: I18n;
  gold: string;
  silver: string;
  bronze: string;
  topScorer?: { id: string; name: string; nation: string; pts: number };
}

export interface InternationalCareerLine {
  year: number;
  kind: TournamentKind;
  nation: string;
  gp: number;
  g: number;
  a: number;
  medal?: MedalColor;
}

interface NationInfo {
  code: string;
  ru: string;
  en: string;
  level: number;
  color: string;
  aliases: string[];
  first: string[];
  last: string[];
}

export const NATIONS: NationInfo[] = [
  { code: "CAN", ru: "Канада", en: "Canada", level: 74, color: "#d52b1e", aliases: [], first: ["Connor", "Ryan", "Tyler", "Brayden", "Cole"], last: ["MacLeod", "Fraser", "Gagnon", "Tremblay", "Campbell"] },
  { code: "USA", ru: "США", en: "USA", level: 73, color: "#2a4b8d", aliases: [], first: ["Jack", "Logan", "Brady", "Owen", "Mason"], last: ["Walsh", "Sullivan", "Peterson", "Murphy", "Hanson"] },
  { code: "SWE", ru: "Швеция", en: "Sweden", level: 72, color: "#f2c200", aliases: [], first: ["Elias", "Oskar", "Hugo", "Linus", "Viktor"], last: ["Lindqvist", "Sandberg", "Holm", "Ekström", "Nyqvist"] },
  { code: "FIN", ru: "Финляндия", en: "Finland", level: 71, color: "#1d4e9e", aliases: [], first: ["Aleksi", "Eetu", "Joonas", "Kasperi", "Otto"], last: ["Virtanen", "Lehtonen", "Heikkinen", "Salonen", "Koivisto"] },
  { code: "RUS", ru: "Россия", en: "Russia", level: 72, color: "#c8102e", aliases: [], first: ["Artyom", "Kirill", "Nikita", "Daniil", "Yegor"], last: ["Smirnov", "Kuznetsov", "Popov", "Lebedev", "Kozlov"] },
  { code: "CZE", ru: "Чехия", en: "Czechia", level: 70, color: "#11457e", aliases: [], first: ["Jakub", "Ondřej", "Tomáš", "Lukáš", "Matěj"], last: ["Novák", "Svoboda", "Dvořák", "Černý", "Procházka"] },
  { code: "SUI", ru: "Швейцария", en: "Switzerland", level: 69, color: "#da291c", aliases: ["CHE", "SWI"], first: ["Nico", "Luca", "Timo", "Janis", "Sven"], last: ["Meier", "Brunner", "Gerber", "Baumann", "Frehner"] },
  { code: "GER", ru: "Германия", en: "Germany", level: 68, color: "#2b2b2b", aliases: ["DEU"], first: ["Lukas", "Moritz", "Leon", "Tobias", "Jonas"], last: ["Müller", "Schmidt", "Weber", "Hoffmann", "Krämer"] },
  { code: "SVK", ru: "Словакия", en: "Slovakia", level: 68, color: "#0b4ea2", aliases: ["SLO"], first: ["Marek", "Adam", "Samuel", "Dávid", "Patrik"], last: ["Horváth", "Kováč", "Varga", "Tóth", "Baláž"] },
  { code: "LAT", ru: "Латвия", en: "Latvia", level: 66, color: "#9e3039", aliases: ["LVA"], first: ["Kristians", "Rihards", "Artūrs", "Roberts", "Oskars"], last: ["Bērziņš", "Kalniņš", "Ozols", "Liepiņš", "Krūmiņš"] },
  { code: "DEN", ru: "Дания", en: "Denmark", level: 65, color: "#c60c30", aliases: ["DNK"], first: ["Mads", "Nikolaj", "Frederik", "Mikkel", "Jesper"], last: ["Jensen", "Nielsen", "Hansen", "Larsen", "Madsen"] },
  { code: "NOR", ru: "Норвегия", en: "Norway", level: 64, color: "#ba0c2f", aliases: [], first: ["Mathias", "Andreas", "Sander", "Eirik", "Tobias"], last: ["Olsen", "Johansen", "Berg", "Haugen", "Dahl"] },
];

export const nationInfo = (code: string) =>
  NATIONS.find((nation) => nation.code === code);

export function nationName(code: string, ru: boolean) {
  const info = nationInfo(code);
  return info ? (ru ? info.ru : info.en) : code;
}

/** Normalize the nationality codes used by the different data sources. */
export function normalizeNation(code: string | undefined) {
  const value = (code ?? "").trim().toUpperCase();
  return NATIONS.find((n) => n.code === value || n.aliases.includes(value))?.code;
}

function hash(value: string) {
  let n = 2166136261;
  for (const char of value) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return n >>> 0;
}

const ROSTER = { F: 14, D: 8, G: 3 };
const BREAK_DAYS = 12;

export function breakStartFor(year: number) {
  return `${year + 1}-02-06`;
}

function makeTournament(g: Game, kind: TournamentKind): InternationalTournament {
  const y = g.year + 1;
  const hosts: I18n[] =
    kind === "best-on-best"
      ? [
          { ru: "Милан", en: "Milan" },
          { ru: "Прага", en: "Prague" },
          { ru: "Хельсинки", en: "Helsinki" },
          { ru: "Калгари", en: "Calgary" },
        ]
      : [
          { ru: "Стокгольм", en: "Stockholm" },
          { ru: "Цюрих", en: "Zurich" },
          { ru: "Рига", en: "Riga" },
          { ru: "Братислава", en: "Bratislava" },
          { ru: "Копенгаген", en: "Copenhagen" },
        ];
  const host = hosts[y % hosts.length];
  const id = `${kind}-${y}`;
  const base = {
    id,
    kind,
    season: g.year,
    host,
    seed: (g.seed ^ hash(id)) >>> 0,
    status: "scheduled" as const,
    nations: [],
    teams: [],
    games: [],
    stats: {},
    injuries: [],
  };
  return kind === "best-on-best"
    ? {
        ...base,
        announce: `${y}-01-10`,
        start: breakStartFor(g.year),
        groupDays: [`${y}-02-08`, `${y}-02-09`, `${y}-02-11`],
        sfDay: `${y}-02-13`,
        medalDay: `${y}-02-15`,
        end: `${y}-02-15`,
      }
    : {
        ...base,
        announce: `${y}-05-06`,
        start: `${y}-05-08`,
        groupDays: [`${y}-05-08`, `${y}-05-09`, `${y}-05-11`, `${y}-05-12`, `${y}-05-14`],
        qfDay: `${y}-05-16`,
        sfDay: `${y}-05-18`,
        medalDay: `${y}-05-20`,
        end: `${y}-05-20`,
      };
}

/**
 * Create this season's international calendar once. Old saves that load
 * after the break date simply skip it (and the World Championship if May
 * has already started) — the next season gets both.
 */
export function ensureInternationalSeason(g: Game) {
  if (g.internationalSeason?.year === g.year) return g.internationalSeason;
  const breakStart = breakStartFor(g.year);
  const date = g.calendar?.date ?? `${g.year}-09-15`;
  const bob = makeTournament(g, "best-on-best");
  const worlds = makeTournament(g, "worlds");
  const canBreak = g.phase === "regular" && date <= breakStart;
  const canWorlds = g.phase !== "offseason" && date <= worlds.announce;
  g.internationalSeason = {
    year: g.year,
    breakStart: canBreak ? breakStart : undefined,
    breakDays: canBreak ? BREAK_DAYS : 0,
    tournaments: [...(canBreak ? [bob] : []), ...(canWorlds ? [worlds] : [])],
  };
  return g.internationalSeason;
}

/** Whether `date` falls inside the NHL's international break. */
export function isBreakDay(g: Game, date: string) {
  const s = g.internationalSeason;
  if (!s || s.year !== g.year || !s.breakStart || !s.breakDays) return false;
  const end = new Date(Date.parse(`${s.breakStart}T00:00:00Z`) + s.breakDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return date >= s.breakStart && date < end;
}

/** Tournament activity on a date, for calendars. */
export function tournamentOnDate(g: Game, date: string) {
  const s = g.internationalSeason;
  if (!s || s.year !== g.year) return undefined;
  return s.tournaments.find((t) => date >= t.start && date <= t.end);
}

// --- player pools ----------------------------------------------------------

interface PoolPlayer {
  player: Player;
  club: string;
  nhl: boolean;
}

function teamAlive(g: Game, id: string) {
  if (g.phase === "regular") return true;
  if (g.phase !== "playoffs") return false;
  return !!g.bracket[g.playoffRound]?.some(
    (series) => !series.winner && [series.a, series.b].includes(id),
  );
}

function playerPool(g: Game, kind: TournamentKind): PoolPlayer[] {
  const pool: PoolPlayer[] = [];
  for (const team of g.teams) {
    const available = kind === "best-on-best" || !teamAlive(g, team.id);
    if (available)
      for (const player of team.players)
        pool.push({ player, club: team.id, nhl: true });
    for (const player of team.farm ?? [])
      pool.push({ player, club: team.ahlAffiliate ?? `${team.id} AHL`, nhl: false });
    for (const player of team.prospects ?? [])
      pool.push({ player, club: player.currentClub ?? "Junior", nhl: false });
  }
  for (const item of g.internationalMarket ?? [])
    pool.push({ player: item.player, club: item.club, nhl: false });
  for (const player of g.freeAgents ?? [])
    if (player.age >= 20 && player.ovr >= 66)
      pool.push({ player, club: "FA", nhl: false });
  for (const player of g.juniorPlayers ?? [])
    pool.push({ player, club: player.currentClub ?? "OHL", nhl: false });
  return pool.filter((item) => item.player.injury <= 0);
}

const slotOf = (pos: Position) => (pos === "G" ? "G" : pos === "D" ? "D" : "F");

function fillerPlayer(id: string, code: string, pos: Position): Player {
  const info = nationInfo(code)!;
  const r = new RNG(hash(id));
  const player = createPlayer(r, id, pos, info.level - 6);
  player.name = `${info.first[hash(`${id}:f`) % info.first.length]} ${info.last[hash(`${id}:l`) % info.last.length]}`;
  player.nation = code;
  player.age = 21 + (hash(`${id}:age`) % 12);
  return player;
}

function entryFrom(item: PoolPlayer): NationalRosterEntry {
  return {
    id: item.player.id,
    name: item.player.name,
    pos: item.player.pos,
    ovr: item.player.ovr,
    age: item.player.age,
    club: item.club,
    nhl: item.nhl,
  };
}

function pickRoster(
  t: InternationalTournament,
  code: string,
  pool: PoolPlayer[],
  taken: Set<string>,
): NationalRosterEntry[] {
  const mine = pool
    .filter((item) => normalizeNation(item.player.nation) === code && !taken.has(item.player.id))
    .sort((a, b) => b.player.ovr - a.player.ovr || a.player.id.localeCompare(b.player.id));
  const roster: NationalRosterEntry[] = [];
  for (const slot of ["F", "D", "G"] as const) {
    const chosen = mine.filter((item) => slotOf(item.player.pos) === slot).slice(0, ROSTER[slot]);
    roster.push(...chosen.map(entryFrom));
    for (let i = chosen.length; i < ROSTER[slot]; i++) {
      const pos: Position = slot === "F" ? (["C", "LW", "RW"] as const)[i % 3] : slot;
      const id = `nt-${t.id}-${code}-${slot}${i}`;
      const filler = fillerPlayer(id, code, pos);
      roster.push({
        id,
        name: filler.name,
        pos,
        ovr: filler.ovr,
        age: filler.age,
        club: code === "CAN" || code === "USA" ? "AHL" : "Europe",
        nhl: false,
        generated: true,
      });
    }
  }
  roster.forEach((entry) => taken.add(entry.id));
  return roster;
}

function rosterStrength(roster: NationalRosterEntry[]) {
  const best = (slot: "F" | "D" | "G", n: number) =>
    roster
      .filter((e) => slotOf(e.pos) === slot)
      .map((e) => e.ovr)
      .sort((a, b) => b - a)
      .slice(0, n);
  const values = [...best("F", 12), ...best("D", 6), ...best("G", 1), ...best("G", 1)];
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

function roundRobin(codes: string[]) {
  const ring = [...codes];
  const rounds: [string, string][][] = [];
  for (let r = 0; r < ring.length - 1; r++) {
    const games: [string, string][] = [];
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i];
      const b = ring[ring.length - 1 - i];
      games.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(games);
    ring.splice(1, 0, ring.pop()!);
  }
  return rounds;
}

function selectTeams(g: Game, t: InternationalTournament) {
  const pool = playerPool(g, t.kind);
  const taken = new Set<string>();
  const field = t.kind === "best-on-best" ? 8 : 12;
  const candidates = NATIONS.map((nation) => {
    const roster = pickRoster(t, nation.code, pool, new Set());
    return { code: nation.code, strength: rosterStrength(roster) };
  })
    .sort((a, b) => b.strength - a.strength || a.code.localeCompare(b.code))
    .slice(0, field);
  const order = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0];
  t.teams = candidates.map((c, index) => {
    const roster = pickRoster(t, c.code, pool, taken);
    return {
      code: c.code,
      group: order[index] ? "B" : "A",
      seed: index + 1,
      strength: rosterStrength(roster),
      roster,
    };
  });
  t.nations = t.teams.map((team) => team.code);
  t.games = [];
  for (const group of ["A", "B"] as const) {
    const codes = t.teams.filter((team) => team.group === group).map((team) => team.code);
    roundRobin(codes).forEach((games, round) =>
      games.forEach(([home, away], i) =>
        t.games.push({
          id: `${t.id}-${group}${round}${i}`,
          date: t.groupDays[round],
          stage: "group",
          group,
          home,
          away,
        }),
      ),
    );
  }
}

/** Replace players who got hurt between the announcement and the opener. */
function refreshInjured(g: Game, t: InternationalTournament) {
  const pool = playerPool(g, t.kind);
  const taken = new Set(t.teams.flatMap((team) => team.roster.map((e) => e.id)));
  const lookup = worldPlayers(g);
  for (const team of t.teams)
    team.roster = team.roster.map((entry) => {
      const player = lookup.get(entry.id);
      if (!player || player.injury <= 0) return entry;
      const replacement = pool
        .filter(
          (item) =>
            normalizeNation(item.player.nation) === team.code &&
            slotOf(item.player.pos) === slotOf(entry.pos) &&
            !taken.has(item.player.id),
        )
        .sort((a, b) => b.player.ovr - a.player.ovr)[0];
      if (!replacement) return entry;
      taken.add(replacement.player.id);
      return entryFrom(replacement);
    });
}

function worldPlayers(g: Game) {
  const map = new Map<string, Player>();
  for (const team of g.teams)
    for (const p of [...team.players, ...(team.farm ?? []), ...(team.prospects ?? [])])
      map.set(p.id, p);
  for (const item of g.internationalMarket ?? []) map.set(item.player.id, item.player);
  for (const p of [...(g.freeAgents ?? []), ...(g.juniorPlayers ?? [])]) map.set(p.id, p);
  return map;
}

// --- standings and bracket -------------------------------------------------

export interface GroupRow {
  code: string;
  gp: number;
  w: number;
  otw: number;
  otl: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

/** IIHF-style table: 3 points for a regulation win, 2 / 1 after overtime. */
export function groupTable(t: InternationalTournament, group: "A" | "B"): GroupRow[] {
  const rows = new Map<string, GroupRow>(
    t.teams
      .filter((team) => team.group === group)
      .map((team) => [
        team.code,
        { code: team.code, gp: 0, w: 0, otw: 0, otl: 0, l: 0, gf: 0, ga: 0, pts: 0 },
      ]),
  );
  const games = t.games.filter((game) => game.stage === "group" && game.group === group && game.goals);
  for (const game of games) {
    const extra = !!(game.ot || game.so);
    for (const [code, gf, ga] of [
      [game.home, game.goals![0], game.goals![1]],
      [game.away, game.goals![1], game.goals![0]],
    ] as const) {
      const row = rows.get(code)!;
      row.gp++;
      row.gf += gf;
      row.ga += ga;
      if (gf > ga) {
        if (extra) row.otw++;
        else row.w++;
        row.pts += extra ? 2 : 3;
      } else if (extra) {
        row.otl++;
        row.pts++;
      } else row.l++;
    }
  }
  const h2h = (a: string, b: string) => {
    const game = games.find((x) => [x.home, x.away].includes(a) && [x.home, x.away].includes(b));
    if (!game) return 0;
    const winner = game.goals![0] > game.goals![1] ? game.home : game.away;
    return winner === a ? -1 : 1;
  };
  const seed = (code: string) => t.teams.find((team) => team.code === code)!.seed;
  return [...rows.values()].sort(
    (a, b) =>
      b.pts - a.pts ||
      h2h(a.code, b.code) ||
      b.gf - b.ga - (a.gf - a.ga) ||
      b.gf - a.gf ||
      seed(a.code) - seed(b.code),
  );
}

const winnerOf = (game: TournamentGame) =>
  game.goals![0] > game.goals![1] ? game.home : game.away;
const loserOf = (game: TournamentGame) =>
  game.goals![0] > game.goals![1] ? game.away : game.home;

function addGame(t: InternationalTournament, stage: TournamentStage, date: string, a: string, b: string, i: number) {
  const seed = (code: string) => t.teams.find((team) => team.code === code)!.seed;
  const [home, away] = seed(a) <= seed(b) ? [a, b] : [b, a];
  t.games.push({ id: `${t.id}-${stage}${i}`, date, stage, home, away });
}

function advanceBracket(t: InternationalTournament) {
  const stage = (s: TournamentStage) => t.games.filter((game) => game.stage === s);
  const done = (games: TournamentGame[]) => games.length > 0 && games.every((game) => game.goals);
  const groups = stage("group");
  if (!done(groups)) return;
  const a = groupTable(t, "A").map((row) => row.code);
  const b = groupTable(t, "B").map((row) => row.code);
  if (t.qfDay) {
    if (!stage("qf").length) {
      [
        [a[0], b[3]],
        [b[1], a[2]],
        [b[0], a[3]],
        [a[1], b[2]],
      ].forEach(([x, y], i) => addGame(t, "qf", t.qfDay!, x, y, i));
      return;
    }
    if (!done(stage("qf"))) return;
    if (!stage("sf").length) {
      const qf = stage("qf");
      addGame(t, "sf", t.sfDay, winnerOf(qf[0]), winnerOf(qf[1]), 0);
      addGame(t, "sf", t.sfDay, winnerOf(qf[2]), winnerOf(qf[3]), 1);
      return;
    }
  } else if (!stage("sf").length) {
    addGame(t, "sf", t.sfDay, a[0], b[1], 0);
    addGame(t, "sf", t.sfDay, b[0], a[1], 1);
    return;
  }
  const sf = stage("sf");
  if (!done(sf) || stage("final").length) return;
  addGame(t, "bronze", t.medalDay, loserOf(sf[0]), loserOf(sf[1]), 0);
  addGame(t, "final", t.medalDay, winnerOf(sf[0]), winnerOf(sf[1]), 0);
}

// --- simulation ------------------------------------------------------------

function nationalTeam(
  t: InternationalTournament,
  team: NationalTeam,
  lookup: Map<string, Player>,
): Team {
  const hurt = new Set(t.injuries.map((injury) => injury.id));
  const players = team.roster
    .filter((entry) => !hurt.has(entry.id))
    .map((entry) => {
      const real = entry.generated ? undefined : lookup.get(entry.id);
      const player = real ? structuredClone(real) : fillerPlayer(entry.id, team.code, entry.pos);
      if (!real) player.name = entry.name;
      player.stats = emptyStats();
      player.fatigue = 0;
      player.injury = 0;
      return player;
    });
  const info = nationInfo(team.code)!;
  const squad: Team = {
    id: team.code,
    city: info.en,
    name: "",
    division: "International",
    conference: "International",
    color: info.color,
    players,
    lines: [],
    defense: [],
    goalie: "",
    tactics: { forecheck: "1-2-2", pace: 55, physical: 45, shooting: 52 },
    record: emptyRecord(),
  };
  autoLines(squad);
  return squad;
}

function recordGame(
  g: Game,
  t: InternationalTournament,
  game: TournamentGame,
  sides: Team[],
  lookup: Map<string, Player>,
  result: ReturnType<typeof simulateMatch>,
) {
  game.goals = [result.goals[0], result.goals[1]];
  game.ot = result.ot;
  game.so = result.so;
  game.stars = result.stars;
  sides.forEach((side) => {
    const national = t.teams.find((team) => team.code === side.id)!;
    for (const p of side.players) {
      if (!p.stats.gp) continue;
      const entry = national.roster.find((e) => e.id === p.id)!;
      const line = (t.stats[p.id] ??= {
        id: p.id,
        name: entry.name,
        nation: national.code,
        pos: entry.pos,
        club: entry.club,
        gp: 0,
        g: 0,
        a: 0,
        sa: 0,
        ga: 0,
        wins: 0,
      });
      line.gp += 1;
      line.g += p.stats.g;
      line.a += p.stats.a;
      line.sa += p.stats.sa;
      line.ga += p.stats.ga;
      line.wins += p.stats.wins;
      const real = entry.generated ? undefined : lookup.get(p.id);
      if (real && t.kind === "best-on-best")
        real.fatigue = clamp(real.fatigue + 3, 0, 100);
      if (p.injury > 0) {
        t.injuries.push({
          id: p.id,
          name: entry.name,
          nation: national.code,
          club: entry.club,
          days: p.injury,
          date: game.date,
        });
        if (real) {
          real.injury = Math.max(real.injury, p.injury);
          real.injuryBurden = (real.injuryBurden ?? 0) + p.injury;
          real.injurySource = "simulation";
          real.injuryStatus = p.injuryStatus;
          real.injuryReason = p.injuryReason;
          real.injuryTimeline = p.injuryTimeline;
          real.injuryReport = textFor(g)(
            `Травма на турнире «${TOURNAMENT_NAMES[t.kind].ru}» за сборную.`,
            `Injured with the national team at the ${TOURNAMENT_NAMES[t.kind].en}.`,
          );
          const userTeam = g.teams.find((club) => club.id === g.user)!;
          if ([...userTeam.players, ...(userTeam.farm ?? [])].some((x) => x.id === p.id))
            pushEvent(g, {
              date: game.date,
              category: "medical",
              priority: "high",
              title: textFor(g)(
                `${entry.name} травмирован в сборной`,
                `${entry.name} injured on national-team duty`,
              ),
              body: textFor(g)(
                `${nationName(national.code, true)}, ${TOURNAMENT_NAMES[t.kind].ru}. Предварительный срок: ${p.injury} дн.`,
                `${nationName(national.code, false)}, ${TOURNAMENT_NAMES[t.kind].en}. Early estimate: ${p.injury} days.`,
              ),
              teamId: g.user,
              playerId: p.id,
              action: "injuries",
            });
        }
      }
    }
  });
}

function playGame(g: Game, t: InternationalTournament, game: TournamentGame, lookup: Map<string, Player>) {
  const team = (code: string) => t.teams.find((x) => x.code === code)!;
  const home = nationalTeam(t, team(game.home), lookup);
  const away = nationalTeam(t, team(game.away), lookup);
  const rng = new RNG(t.seed);
  const result = simulateMatch(home, away, rng, game.stage !== "group");
  t.seed = rng.seed;
  recordGame(g, t, game, [home, away], lookup, result);
}

function userCallUps(g: Game, t: InternationalTournament) {
  const team = g.teams.find((club) => club.id === g.user)!;
  const ids = new Set([...team.players, ...(team.farm ?? []), ...(team.prospects ?? [])].map((p) => p.id));
  return t.teams.flatMap((national) =>
    national.roster.filter((entry) => ids.has(entry.id)).map((entry) => ({ entry, nation: national.code })),
  );
}

function announce(g: Game, t: InternationalTournament, date: string) {
  selectTeams(g, t);
  t.status = "announced";
  const tt = textFor(g);
  const name = TOURNAMENT_NAMES[t.kind];
  const favourite = [...t.teams].sort((a, b) => b.strength - a.strength)[0];
  pushEvent(g, {
    date,
    category: "league",
    priority: "normal",
    title: tt(`${name.ru}: составы сборных объявлены`, `${name.en}: national team rosters announced`),
    body: tt(
      `${t.teams.length} сборных, ${name.ru.toLowerCase()} пройдёт в городе ${t.host.ru} с ${t.start.slice(8)}.${t.start.slice(5, 7)}. Фаворит по составу — ${nationName(favourite.code, true)}.`,
      `${t.teams.length} nations; the ${name.en} opens in ${t.host.en} on ${t.start}. Strongest roster on paper: ${nationName(favourite.code, false)}.`,
    ),
    action: "international",
  });
  const called = userCallUps(g, t);
  if (called.length)
    pushEvent(g, {
      date,
      category: "organization",
      priority: "normal",
      title: tt(
        `Вызов в сборные: ${called.length} игрок(ов) ${g.user}`,
        `National team call-ups: ${called.length} ${g.user} player${called.length === 1 ? "" : "s"}`,
      ),
      body: called
        .map(({ entry, nation }) => `${entry.name} (${nationName(nation, g.language === "ru" || !g.language)})`)
        .join(", ") +
        tt(
          t.kind === "best-on-best"
            ? ". Риск травм и усталости ложится на клуб."
            : ". Сезон для них продолжится в сборной.",
          t.kind === "best-on-best"
            ? ". The club carries the injury and fatigue risk."
            : ". Their season continues with the national team.",
        ),
      teamId: g.user,
      action: "international",
    });
}

function goLive(g: Game, t: InternationalTournament, date: string) {
  if (t.kind === "best-on-best") refreshInjured(g, t);
  t.status = "live";
  const tt = textFor(g);
  const name = TOURNAMENT_NAMES[t.kind];
  pushEvent(g, {
    date,
    category: "league",
    priority: "normal",
    title:
      t.kind === "best-on-best"
        ? tt(`NHL уходит на паузу: ${name.ru}`, `NHL break: the ${name.en} begins`)
        : tt(`${name.ru} стартует`, `The ${name.en} begins`),
    body:
      t.kind === "best-on-best"
        ? tt(
            `Игры NHL возобновятся через ${g.internationalSeason?.breakDays ?? BREAK_DAYS} дней. Клубы без игроков в сборных тренируются по своему плану.`,
            `NHL games resume in ${g.internationalSeason?.breakDays ?? BREAK_DAYS} days. Clubs train on their own plan in the meantime.`,
          )
        : tt(
            `${t.teams.length} сборных в городе ${t.host.ru}. Игроки клубов, выбывших из плей-офф, получили шанс на медаль.`,
            `${t.teams.length} nations in ${t.host.en}. Players from clubs out of the playoffs get a shot at a medal.`,
          ),
    action: "international",
  });
}

function complete(g: Game, t: InternationalTournament, date: string) {
  const final = t.games.find((game) => game.stage === "final")!;
  const bronze = t.games.find((game) => game.stage === "bronze")!;
  t.medals = { gold: winnerOf(final), silver: loserOf(final), bronze: winnerOf(bronze) };
  t.status = "complete";
  const medalOf = (code: string): MedalColor | undefined =>
    code === t.medals!.gold ? "gold" : code === t.medals!.silver ? "silver" : code === t.medals!.bronze ? "bronze" : undefined;
  const lookup = worldPlayers(g);
  const year = Number(t.end.slice(0, 4));
  for (const team of t.teams) {
    const medal = medalOf(team.code);
    const morale = medal === "gold" ? 6 : medal === "silver" ? 3 : medal === "bronze" ? 2 : -1;
    for (const entry of team.roster) {
      const real = entry.generated ? undefined : lookup.get(entry.id);
      const line = t.stats[entry.id];
      if (!real || !line) continue;
      real.morale = clamp(real.morale + morale, 0, 100);
      syncMoraleBonus(real);
      (real.international ??= []).push({
        year,
        kind: t.kind,
        nation: team.code,
        gp: line.gp,
        g: line.g,
        a: line.a,
        medal,
      });
    }
  }
  const scorer = Object.values(t.stats)
    .filter((line) => line.pos !== "G")
    .sort((a, b) => b.g + b.a - (a.g + a.a) || b.g - a.g || a.id.localeCompare(b.id))[0];
  (g.internationalHistory ??= []).push({
    year,
    kind: t.kind,
    host: t.host,
    gold: t.medals.gold,
    silver: t.medals.silver,
    bronze: t.medals.bronze,
    topScorer: scorer
      ? { id: scorer.id, name: scorer.name, nation: scorer.nation, pts: scorer.g + scorer.a }
      : undefined,
  });
  g.internationalHistory = g.internationalHistory.slice(-40);
  const tt = textFor(g);
  const name = TOURNAMENT_NAMES[t.kind];
  const score = `${final.home} ${final.goals![0]}:${final.goals![1]} ${final.away}${final.so ? " SO" : final.ot ? " OT" : ""}`;
  g.news.unshift(
    tt(
      `${name.ru}: золото — ${nationName(t.medals.gold, true)} (${score}).`,
      `${name.en}: gold for ${nationName(t.medals.gold, false)} (${score}).`,
    ),
  );
  pushEvent(g, {
    date,
    category: "league",
    priority: "normal",
    title: tt(
      `${name.ru}: ${nationName(t.medals.gold, true)} — чемпион`,
      `${name.en}: ${nationName(t.medals.gold, false)} win gold`,
    ),
    body: tt(
      `Финал ${score}. Серебро — ${nationName(t.medals.silver, true)}, бронза — ${nationName(t.medals.bronze, true)}.${scorer ? ` Лучший бомбардир: ${scorer.name}, ${scorer.g + scorer.a} очк.` : ""}`,
      `Final ${score}. Silver: ${nationName(t.medals.silver, false)}, bronze: ${nationName(t.medals.bronze, false)}.${scorer ? ` Top scorer: ${scorer.name}, ${scorer.g + scorer.a} pts.` : ""}`,
    ),
    action: "international",
  });
  const medallists = userCallUps(g, t)
    .map(({ entry, nation }) => ({ entry, nation, medal: medalOf(nation) }))
    .filter((item) => item.medal && t.stats[item.entry.id]);
  if (medallists.length) {
    const label = (medal: MedalColor, ru: boolean) =>
      ru
        ? { gold: "золото", silver: "серебро", bronze: "бронза" }[medal]
        : medal;
    pushEvent(g, {
      date,
      category: "organization",
      priority: "normal",
      title: tt(
        `Медали игроков ${g.user}: ${medallists.length}`,
        `${g.user} medallists: ${medallists.length}`,
      ),
      body: medallists
        .map(({ entry, nation, medal }) =>
          `${entry.name} — ${label(medal!, g.language === "ru" || !g.language)} (${nationName(nation, g.language === "ru" || !g.language)})`,
        )
        .join(", ") +
        tt(". Медалисты вернутся в клуб с подъёмом настроения.", ". The medallists return to the club in high spirits."),
      teamId: g.user,
      action: "international",
    });
  }
}

/** Run one tournament through `date` (announcement, start, games, medals). */
function processTournament(g: Game, t: InternationalTournament, date: string) {
  if (t.status === "complete") return;
  if (t.status === "scheduled" && date >= t.announce) announce(g, t, date);
  if (t.status === "announced" && date >= t.start) goLive(g, t, date);
  if (t.status !== "live") return;
  const lookup = worldPlayers(g);
  for (let guard = 0; guard < 6; guard++) {
    const due = t.games.filter((game) => !game.goals && game.date <= date);
    if (!due.length) break;
    for (const game of due) playGame(g, t, game, lookup);
    advanceBracket(t);
  }
  advanceBracket(t);
  const final = t.games.find((game) => game.stage === "final");
  const bronze = t.games.find((game) => game.stage === "bronze");
  if (final?.goals && bronze?.goals) complete(g, t, date);
}

/** Daily hook from the calendar. */
export function processInternationalDay(g: Game, date: string) {
  const season = ensureInternationalSeason(g);
  for (const t of season.tournaments) processTournament(g, t, date);
}

/**
 * When the Stanley Cup is decided before a tournament finishes, play the
 * rest of it straight away so the season can roll over cleanly.
 */
export function finishInternationalSeason(g: Game) {
  const season = g.internationalSeason;
  if (!season || season.year !== g.year) return;
  for (const t of season.tournaments) processTournament(g, t, t.end);
}

/** Medal table of a finished tournament set (history). */
export function medalTable(history: TournamentHistoryEntry[]) {
  const rows = new Map<string, { code: string; gold: number; silver: number; bronze: number }>();
  const row = (code: string) => {
    if (!rows.has(code)) rows.set(code, { code, gold: 0, silver: 0, bronze: 0 });
    return rows.get(code)!;
  };
  for (const item of history) {
    row(item.gold).gold++;
    row(item.silver).silver++;
    row(item.bronze).bronze++;
  }
  return [...rows.values()].sort(
    (a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.code.localeCompare(b.code),
  );
}

export const STAGE_LABELS: Record<TournamentStage, I18n> = {
  group: { ru: "Группа", en: "Group" },
  qf: { ru: "1/4 финала", en: "Quarterfinal" },
  sf: { ru: "1/2 финала", en: "Semifinal" },
  bronze: { ru: "Матч за бронзу", en: "Bronze medal game" },
  final: { ru: "Финал", en: "Final" },
};
