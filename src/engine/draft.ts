import { tx } from "./text";
import { createPlayer, setPlayerOverall } from "./database";
import { RNG, clamp } from "./random";
import { assignPotential, estimatePotential, rankDraftClass } from "./potential";
import { normalizeExternalRating } from "./franchiseWorld";
import {
  LEAGUE_REGIONS,
  NATION_LABEL,
  nationalHometown,
  nationalName,
  normalizeNation,
  seeded,
  type Hometown,
} from "./names";
import { scoutAccuracy, scoutPersuasion, staffRating } from "./staff";
import { OHL_ROSTERS } from "../data/minor-leagues-2026-27";
import { SCOUT_LEAGUE_PLAYERS } from "../data/scouting-leagues-2026-27";
import type {
  ConversationLine,
  DraftProspect,
  DraftState,
  Game,
  Player,
  Position,
  ProspectInterview,
  ProspectTrait,
  ScoutingRegion,
  Team,
} from "./types";

export const SCOUTING_REGIONS: ScoutingRegion[] = [
  "North America",
  "Nordic",
  "Central Europe",
  "Russia",
];

const rankedTeams = (teams: Team[]) =>
  [...teams].sort(
    (a, b) =>
      b.record.pts - a.record.pts ||
      b.record.rw - a.record.rw ||
      b.record.w - a.record.w ||
      b.record.gf - b.record.ga - (a.record.gf - a.record.ga) ||
      a.id.localeCompare(b.id),
  );

const regionFor = (nation: string): ScoutingRegion =>
  nation === "CAN" || nation === "USA"
    ? "North America"
    : nation === "SWE" || nation === "FIN" || nation === "NOR" || nation === "DEN"
      ? "Nordic"
      : nation === "RUS" || nation === "BLR" || nation === "KAZ"
        ? "Russia"
        : "Central Europe";

const unit = (text: string) => seeded(text) / 4294967296;

function estimate(actual: number, id: string, confidence: number, salt: number) {
  // Current ability is visible on the ice, so the error is far smaller than
  // the one on potential.
  const spread = Math.max(1, Math.round((100 - confidence) / 16));
  const error = (seeded(`${id}-${salt}`) % (spread * 2 + 1)) - spread;
  return clamp(actual + error, 38, 90);
}

function reportFor(p: Player, confidence: number, round = 0) {
  return {
    confidence,
    estimatedOvr: estimate(p.ovr, p.id, confidence, 1),
    estimatedPotential: estimatePotential(p.potential, p.id, confidence),
    lastUpdatedRound: round,
  };
}

/* ------------------------------------------------------------------ */
/* Draft class                                                         */
/* ------------------------------------------------------------------ */

const ALL_TRAITS: ProspectTrait[] = [
  "contender",
  "big-market",
  "small-market",
  "cold-climate",
  "warm-climate",
  "close-to-home",
  "playing-time",
  "development",
];

function profileFor(id: string, pos: Position, league: string | undefined): Pick<
  DraftProspect,
  "heightCm" | "weightKg" | "shoots" | "traits"
> {
  const big = pos === "D" || pos === "G";
  const heightCm = (big ? 183 : 176) + (seeded(`${id}:h`) % (big ? 16 : 15));
  const weightKg = Math.round(heightCm * 0.42 + (seeded(`${id}:w`) % 12) - 3);
  const traits: ProspectTrait[] = [];
  const count = 1 + (seeded(`${id}:tc`) % 2);
  for (let i = 0; traits.length < count && i < 6; i++) {
    const t = ALL_TRAITS[seeded(`${id}:t${i}`) % ALL_TRAITS.length];
    const clash =
      (t === "big-market" && traits.includes("small-market")) ||
      (t === "small-market" && traits.includes("big-market")) ||
      (t === "cold-climate" && traits.includes("warm-climate")) ||
      (t === "warm-climate" && traits.includes("cold-climate"));
    if (!traits.includes(t) && !clash) traits.push(t);
  }
  if (league === "USHL" && unit(`${id}:ncaa`) < 0.55) traits.push("college-first");
  return { heightCm, weightKg, shoots: unit(`${id}:s`) < 0.62 ? "L" : "R", traits };
}

function generatedStats(id: string, pos: Position, ovr: number) {
  const gp = 18 + (seeded(`${id}:gp`) % 12);
  if (pos === "G") return { gp, g: 0, a: seeded(`${id}:ga`) % 2 };
  const rate = Math.max(0.15, (ovr - 44) / 14) * (pos === "D" ? 0.55 : 1);
  const pts = Math.round(gp * rate * (0.75 + unit(`${id}:p`) * 0.5));
  const g = Math.round(pts * (pos === "D" ? 0.25 : 0.42));
  return { gp, g, a: pts - g };
}

function hometownFor(id: string, league: string, nation: string): Hometown {
  const options = LEAGUE_REGIONS[league];
  if (options && (nation === "CAN" || nation === "USA" || !NATION_LABEL[nation])) {
    const choice = options[seeded(`${id}:reg`) % options.length];
    return nationalHometown(choice.nation, id, choice.regions);
  }
  return nationalHometown(nation, id);
}

interface RealCandidate {
  sourceId: string;
  name: string;
  pos: Position;
  league: string;
  club: string;
  nation: string;
  /** False when the feed has no citizenship ("INT", "—"). */
  nationKnown: boolean;
  age: number;
  ovr: number;
  potential: number;
  stats?: { gp: number; g: number; a: number };
}
const knownNation = (nation: string) => normalizeNation(nation, "") !== "";

/**
 * First-time eligible players of the real 2026/27 junior and European
 * league snapshots. Only the 2027 class can use them: later classes are
 * still 15–16 years old today and are generated.
 */
function realCandidates(year: number): RealCandidate[] {
  if (year !== 2027) return [];
  const list: RealCandidate[] = [];
  for (const p of OHL_ROSTERS) {
    if (p.birthDate < "2008-09-16" || p.birthDate > "2009-09-15") continue;
    const ovr = 48 + (seeded(p.id) % 18);
    const rated = normalizeExternalRating("OHL", 17, ovr, ovr + 12, { id: p.id, pos: p.pos });
    list.push({ sourceId: p.id, name: p.name, pos: p.pos, league: "OHL", club: p.club, nation: normalizeNation(p.nation, "CAN"), nationKnown: knownNation(p.nation), age: 17, ...rated });
  }
  const feeds: [keyof typeof SCOUT_LEAGUE_PLAYERS, string, number[]][] = [
    ["WHL", "CAN", [17]],
    ["USHL", "USA", [17]],
    ["SHL", "SWE", [17, 18]],
    ["Liiga", "FIN", [17, 18]],
  ];
  for (const [league, fallback, ages] of feeds) {
    const seen = new Set<string>();
    for (const p of SCOUT_LEAGUE_PLAYERS[league]) {
      if (!ages.includes(p.age) || seen.has(p.name)) continue;
      seen.add(p.name);
      const rated = normalizeExternalRating(league, p.age, p.ovr, p.potential, { id: p.id, pos: p.pos });
      // A 17-year-old in a men's league is impressive, but he is still a
      // teenager: put him on the junior scale used for the rest of the class.
      if (league === "SHL" || league === "Liiga") {
        rated.ovr = clamp(rated.ovr - 9, 50, 67);
        rated.potential = clamp(rated.potential - 2, rated.ovr, 93);
      }
      list.push({
        sourceId: p.id,
        name: p.name,
        pos: p.pos,
        league,
        club: p.club,
        nation: normalizeNation(p.nation, fallback),
        nationKnown: knownNation(p.nation),
        age: p.age,
        ...rated,
        stats: p.games !== undefined ? { gp: p.games, g: p.goals ?? 0, a: p.assists ?? 0 } : undefined,
      });
    }
  }
  return list.sort((a, b) => b.potential - a.potential || b.ovr - a.ovr || a.sourceId.localeCompare(b.sourceId));
}

const GENERATED_NATIONS: [string, ScoutingRegion][] = [
  ["RUS", "Russia"], ["RUS", "Russia"], ["RUS", "Russia"], ["BLR", "Russia"], ["KAZ", "Russia"],
  ["CZE", "Central Europe"], ["CZE", "Central Europe"], ["SVK", "Central Europe"], ["SVK", "Central Europe"],
  ["GER", "Central Europe"], ["SUI", "Central Europe"], ["LAT", "Central Europe"], ["AUT", "Central Europe"],
  ["SWE", "Nordic"], ["FIN", "Nordic"], ["NOR", "Nordic"], ["DEN", "Nordic"],
  ["CAN", "North America"], ["USA", "North America"],
];
const GENERATED_CLUBS: Record<string, [string, string][]> = {
  RUS: [["MHL", "Krasnaya Armiya"], ["MHL", "Loko Yaroslavl"], ["MHL", "SKA-1946"], ["MHL", "Irbis Kazan"], ["MHL", "Belye Medvedi"]],
  BLR: [["Extraliga", "Dinamo-Molodechno"]],
  KAZ: [["MHL", "Snezhnye Barsy"]],
  CZE: [["Extraliga U20", "HC Sparta Praha U20"], ["Extraliga U20", "HC Oceláři Třinec U20"], ["Extraliga U20", "HC Dynamo Pardubice U20"]],
  SVK: [["Slovakia U20", "HK Nitra U20"], ["Slovakia U20", "HC Košice U20"]],
  GER: [["DNL", "Jungadler Mannheim"]],
  SUI: [["U20-Elit", "ZSC Lions U20"], ["U20-Elit", "HC Davos U20"]],
  LAT: [["Latvia U20", "HS Rīga"]],
  AUT: [["ICE U20", "Red Bull Akademie"]],
  SWE: [["J20 Nationell", "Frölunda J20"], ["J20 Nationell", "Djurgården J20"]],
  FIN: [["U20 SM-sarja", "Kärpät U20"], ["U20 SM-sarja", "Tappara U20"]],
  NOR: [["Norway U20", "Vålerenga U20"]],
  DEN: [["Denmark U20", "Rungsted U20"]],
  CAN: [["QMJHL", "Rimouski Océanic"], ["QMJHL", "Halifax Mooseheads"], ["QMJHL", "Saint John Sea Dogs"]],
  USA: [["USNTDP", "U.S. NTDP U18"], ["NCAA", "Boston University"], ["NCAA", "University of Michigan"]],
};

export function createDraftState(year: number, r: RNG, count = 224): DraftState {
  const positions: Position[] = ["LW", "C", "RW", "D", "D", "G"];
  const real = realCandidates(year);
  // Leave room for Europe and Russia, which the feeds do not cover.
  const realCount = Math.min(real.length, Math.round(count * 0.72));
  const prospects: DraftProspect[] = [];
  real.slice(0, realCount).forEach((c, i) => {
    const id = `draft-${year}-${c.sourceId}`;
    const player = createPlayer(r, id, c.pos, 56);
    player.name = c.name;
    player.nation = c.nation;
    player.age = c.age;
    player.salary = 0;
    player.years = 0;
    player.number = 0;
    player.identitySource = "hockeytech";
    player.currentClub = c.club;
    setPlayerOverall(player, clamp(c.ovr, 44, 68));
    assignPotential(player, { league: "draft" });
    player.potential = clamp(Math.round((player.potential + c.potential) / 2), player.ovr, 95);
    const hometown = hometownFor(id, c.league, c.nationKnown ? c.nation : "");
    // Unknown citizenship follows the modeled hometown (CAN or USA).
    if (!c.nationKnown) player.nation = hometown.country;
    prospects.push({
      player,
      region: regionFor(c.nation),
      trueRank: i,
      source: "real",
      league: c.league,
      club: c.club,
      hometown,
      hometownModeled: true,
      stats: c.stats ?? generatedStats(id, c.pos, player.ovr),
      ...profileFor(id, c.pos, c.league),
    });
  });
  const generatedTiers = Array.from({ length: count - realCount }, (_, i) => i);
  const tierRng = new RNG(year);
  for (let i = generatedTiers.length - 1; i > 0; i--) {
    const j = tierRng.int(0, i);
    [generatedTiers[i], generatedTiers[j]] = [generatedTiers[j], generatedTiers[i]];
  }
  const usedSurnames = new Set<string>();
  for (let i = prospects.length; i < count; i++) {
    const [nation, region] = GENERATED_NATIONS[i % GENERATED_NATIONS.length];
    const pos = positions[i % positions.length];
    // Draft-eligible teenagers: a few near NHL-ready, most years away.
    const percentile = (generatedTiers[i - realCount] + 0.5) / generatedTiers.length;
    const level = percentile < 0.015 ? 68 : percentile < 0.06 ? 61
      : percentile < 0.22 ? 55 : percentile < 0.60 ? 50 : 46;
    const id = `draft-${year}-${i}-${r.int(1000, 9999)}`;
    const player = createPlayer(r, id, pos, level);
    player.nation = nation;
    player.name = nationalName(nation, id, usedSurnames);
    player.age = r.int(17, 18);
    player.salary = 0;
    player.years = 0;
    player.number = 0;
    player.identitySource = "generated";
    setPlayerOverall(player, clamp(level - 4 + (seeded(`${id}:o`) % 11), 42, 70));
    assignPotential(player, { league: "draft" });
    const clubs = GENERATED_CLUBS[nation] ?? GENERATED_CLUBS.CAN;
    const [league, club] = clubs[seeded(`${id}:club`) % clubs.length];
    player.currentClub = club;
    prospects.push({
      player,
      region,
      trueRank: i,
      source: "generated",
      league,
      club,
      hometown: hometownFor(id, league, nation),
      stats: generatedStats(id, pos, player.ovr),
      ...profileFor(id, pos, league),
    });
  }
  rankDraftClass(prospects);
  return {
    year,
    status: "scouting",
    prospects,
    reports: Object.fromEntries(prospects.map(({ player }) => [player.id, reportFor(player, 18)])),
    picks: [],
    currentPick: 0,
    scoutingPoints: 8,
    assignment: "North America",
    shortlist: [],
    interviews: {},
    interviewsLeft: 10,
  };
}

export function ensureDraft(g: Game) {
  if (!g.draft) {
    g.draft = createDraftState(g.year + 1, new RNG(g.seed ^ g.year));
    const user = g.teams.find((t) => t.id === g.user);
    g.draft.interviewsLeft = 10 + Math.max(0, Math.floor(scoutPersuasion(user) / 2));
  }
  g.draft.interviews ??= {};
  g.draft.interviewsLeft ??= 10;
  for (const team of g.teams) team.prospects ??= [];
  return g.draft;
}

export function setScoutingRegion(g: Game, region: ScoutingRegion) {
  const draft = ensureDraft(g);
  if (!SCOUTING_REGIONS.includes(region)) throw Error("Unknown scouting region");
  draft.assignment = region;
  g.news.unshift(tx(g, `Скаутское задание: ${region}.`, `Scouting assignment: ${region}.`));
}

/** Follow list: followed prospects are watched by the staff every week. */
export function toggleShortlist(g: Game, prospectId: string) {
  const draft = ensureDraft(g);
  if (!draft.prospects.some((p) => p.player.id === prospectId)) throw Error("Prospect unavailable");
  draft.shortlist = draft.shortlist.includes(prospectId)
    ? draft.shortlist.filter((id) => id !== prospectId)
    : [...draft.shortlist, prospectId];
}

export function scoutProspect(g: Game, prospectId: string, requestedFocus?:import("./careerDesk").ScoutFocus) {
  const draft = ensureDraft(g);
  if (draft.status !== "scouting") throw Error("Scouting period is closed");
  if (draft.scoutingPoints < 1) throw Error("No scouting capacity available");
  const prospect = draft.prospects.find((p) => p.player.id === prospectId);
  if (!prospect) throw Error("Prospect unavailable");
  const user = g.teams.find((t) => t.id === g.user);
  const current = draft.reports[prospectId];
  const fields=["release","stride","pressure"] as const;
  const focus=requestedFocus??fields.reduce((least,key)=>(current.observations?.[key]??0)<(current.observations?.[least]??0)?key:least);
  if(requestedFocus && (current.observations?.[focus]??0)>=3)return;
  const regionalBonus = (prospect.region === draft.assignment ? 14 : 7) + Math.max(0, scoutAccuracy(user));
  const confidence = clamp(current.confidence + regionalBonus, 0, 100);
  const next:import("./types").ScoutingReport = reportFor(prospect.player, confidence, g.round);
  next.estimatedOvr = Math.round((current.estimatedOvr + prospect.player.ovr) / 2);
  next.estimatedPotential = Math.round((current.estimatedPotential + prospect.player.potential) / 2);
  next.observations={...current.observations,[focus]:Math.min(3,(current.observations?.[focus]??0)+1)};
  draft.reports[prospectId] = next;
  draft.scoutingPoints--;
}

export function progressScouting(g: Game) {
  const draft = ensureDraft(g);
  if (draft.status !== "scouting") return;
  if (g.round % 8 === 0) draft.scoutingPoints = Math.min(12, draft.scoutingPoints + 2);
  const target = draft.prospects
    .filter((p) => p.region === draft.assignment && !p.draftedBy && draft.reports[p.player.id].confidence < 80)
    .sort((a, b) => draft.reports[b.player.id].estimatedPotential - draft.reports[a.player.id].estimatedPotential)[0];
  if (target && g.round % 4 === 0) {
    const current = draft.reports[target.player.id];
    draft.reports[target.player.id] = {...reportFor(target.player, clamp(current.confidence + 4, 0, 100), g.round),observations:current.observations};
  }
  // Followed prospects: the staff watches their games every other round.
  if (g.round % 2 === 0)
    for (const id of draft.shortlist) {
      const prospect = draft.prospects.find((p) => p.player.id === id);
      const current = draft.reports[id];
      if (!prospect || prospect.draftedBy || !current || current.confidence >= 70) continue;
      draft.reports[id] = {...reportFor(prospect.player, clamp(current.confidence + 2, 0, 70), g.round),observations:current.observations};
    }
}

/* ------------------------------------------------------------------ */
/* Convictions, interest and interviews                                */
/* ------------------------------------------------------------------ */

const CLUB_REGION: Record<string, string> = {
  BOS: "MA", BUF: "NY", DET: "MI", FLA: "FL", MTL: "QC", OTT: "ON", TBL: "FL", TOR: "ON",
  CAR: "NC", CBJ: "OH", NJD: "NJ", NYI: "NY", NYR: "NY", PHI: "PA", PIT: "PA", WSH: "DC",
  CHI: "IL", COL: "CO", DAL: "TX", MIN: "MN", NSH: "TN", STL: "MO", UTA: "UT", WPG: "MB",
  ANA: "CA", CGY: "AB", EDM: "AB", LAK: "CA", SJS: "CA", SEA: "WA", VAN: "BC", VGK: "NV",
};
const BIG_MARKETS = ["NYR", "NYI", "NJD", "TOR", "MTL", "LAK", "CHI", "BOS", "PHI", "VAN"];
const WARM_MARKETS = ["FLA", "TBL", "DAL", "VGK", "ANA", "LAK", "SJS", "UTA", "NSH", "CAR"];

const clubName = (g: Game, id: string) => {
  const t = g.teams.find((team) => team.id === id);
  return t ? `${t.city} ${t.name}` : id;
};

/** Clubs a fan of `home` grows up hating: historic rivals and in-state foes. */
export function rivalClubs(g: Game, home: string) {
  const out = new Set<string>();
  for (const r of g.rivalries ?? []) {
    if (r.teamA === home) out.add(r.teamB);
    if (r.teamB === home) out.add(r.teamA);
  }
  for (const [club, region] of Object.entries(CLUB_REGION))
    if (club !== home && region === CLUB_REGION[home] && unit(`${home}:${club}:state`) < 0.85) out.add(club);
  return [...out];
}

function grudgeClub(g: Game, p: DraftProspect) {
  if (unit(`${p.player.id}:grudge`) >= 0.04) return undefined;
  return g.teams[seeded(`${p.player.id}:grudge-club`) % g.teams.length]?.id;
}

export interface ProspectStance {
  interest: number;
  refused?: "rivalry" | "grudge";
  dream?: boolean;
  /** Reasons the interest moved, for the scout's summary. */
  notes: { ru: string; en: string }[];
}

function depthAt(team: Team, pos: Position) {
  return [...team.players, ...(team.prospects ?? [])].filter((p) => p.pos === pos && p.age <= 25).length;
}

/** Baseline attitude of a prospect toward a club, before any interview. */
export function prospectStance(g: Game, p: DraftProspect, teamId: string): ProspectStance {
  const team = g.teams.find((t) => t.id === teamId);
  const notes: ProspectStance["notes"] = [];
  const home = p.hometown?.club;
  if (home === teamId) {
    notes.push({ ru: `Вырос болельщиком ${clubName(g, teamId)}`, en: `Grew up a ${clubName(g, teamId)} fan` });
    return { interest: 95, dream: true, notes };
  }
  if (home && rivalClubs(g, home).includes(teamId)) {
    notes.push({ ru: `Из ${p.hometown!.city}: в его семье болеют за ${clubName(g, home)}`, en: `From ${p.hometown!.city}: his family roots for ${clubName(g, home)}` });
    return { interest: 3, refused: "rivalry", notes };
  }
  if (grudgeClub(g, p) === teamId) {
    notes.push({ ru: "Личный конфликт агента с руководством клуба", en: "His agent has a feud with the club's front office" });
    return { interest: 4, refused: "grudge", notes };
  }
  let interest = 48 + ((seeded(`${p.player.id}:base:${teamId}`) % 17) - 8);
  const traits = p.traits ?? [];
  const rank = team?.strengthRank ?? 16;
  const add = (delta: number, ru: string, en: string) => {
    interest += delta;
    if (delta) notes.push({ ru: `${delta > 0 ? "+" : ""}${delta} · ${ru}`, en: `${delta > 0 ? "+" : ""}${delta} · ${en}` });
  };
  if (traits.includes("contender")) add(rank <= 10 ? 12 : rank >= 22 ? -10 : 0, "хочет бороться за Кубок", "wants to win now");
  if (traits.includes("big-market")) add(BIG_MARKETS.includes(teamId) ? 9 : -5, "любит большие рынки", "likes big markets");
  if (traits.includes("small-market")) add(BIG_MARKETS.includes(teamId) ? -10 : 6, "не любит давление больших городов", "dislikes big-market pressure");
  if (traits.includes("cold-climate")) add(WARM_MARKETS.includes(teamId) ? -9 : 4, "хоккей должен быть там, где зима", "wants a real hockey winter");
  if (traits.includes("warm-climate")) add(WARM_MARKETS.includes(teamId) ? 9 : -3, "хочет жить в тёплом климате", "wants a warm climate");
  if (traits.includes("close-to-home") && home)
    add(CLUB_REGION[home] && CLUB_REGION[home] === CLUB_REGION[teamId] ? 10 : -6, "хочет играть ближе к дому", "wants to stay close to home");
  if (traits.includes("playing-time") && team)
    add(depthAt(team, p.player.pos) <= 4 ? 8 : -6, "считает шансы попасть в состав", "counts his path to the roster");
  if (traits.includes("development") && team) {
    const coach = (staffRating(team, "skills-coach") + staffRating(team, "head-coach")) / 2;
    add(Math.round((coach - 65) / 3), "оценивает тренерский штаб", "rates the coaching staff");
  }
  if (home && CLUB_REGION[home] && CLUB_REGION[home] === CLUB_REGION[teamId] && !traits.includes("close-to-home"))
    add(-8, "болеет за соседний клуб", "roots for the neighbouring club");
  const scout = scoutPersuasion(team);
  if (scout) add(scout, "работа главного скаута", "head scout's relationship");
  return { interest: clamp(Math.round(interest), 8, 92), notes };
}

export const INTERVIEW_TOPICS = ["about", "city", "role", "development", "winning", "dream"] as const;
export type InterviewTopic = (typeof INTERVIEW_TOPICS)[number];
export const INTERVIEW_TOPIC_LABEL: Record<InterviewTopic, { ru: string; en: string }> = {
  about: { ru: "Расскажи о себе", en: "Tell me about yourself" },
  city: { ru: "Как тебе наш город?", en: "What do you think of our city?" },
  role: { ru: "Какую роль ты видишь у нас?", en: "Where do you see yourself with us?" },
  development: { ru: "Наш план развития и тренеры", en: "Our development plan and coaches" },
  winning: { ru: "Мы строим команду-чемпиона", en: "We're building a winner" },
  dream: { ru: "За какой клуб ты мечтаешь играть?", en: "Which club do you dream of playing for?" },
};

const TRAIT_LABEL: Record<ProspectTrait, { ru: string; en: string }> = {
  contender: { ru: "хочет побеждать сразу", en: "wants to win now" },
  "big-market": { ru: "любит большие города", en: "likes big markets" },
  "small-market": { ru: "предпочитает тихие города", en: "prefers quiet markets" },
  "cold-climate": { ru: "хоккейный север", en: "hockey-country guy" },
  "warm-climate": { ru: "любит солнце", en: "loves the sun" },
  "close-to-home": { ru: "семья рядом важна", en: "family nearby matters" },
  "playing-time": { ru: "хочет быстрый путь в NHL", en: "wants a quick NHL path" },
  "college-first": { ru: "собирается в NCAA", en: "committed to NCAA" },
  development: { ru: "думает о развитии", en: "development-minded" },
};
export const traitLabel = (t: ProspectTrait) => TRAIT_LABEL[t];

function say(transcript: ConversationLine[], speaker: ConversationLine["speaker"], ru: string, en: string, mood?: ConversationLine["mood"]) {
  transcript.push({ speaker, ru, en, mood });
}

export function interviewsAvailable(g: Game) {
  const draft = ensureDraft(g);
  return draft.status !== "complete" ? (draft.interviewsLeft ?? 0) : 0;
}

/** One question of the pre-draft meeting; the first one uses an interview slot. */
export function interviewProspect(g: Game, prospectId: string, topic: InterviewTopic) {
  const draft = ensureDraft(g);

  const p = draft.prospects.find((item) => item.player.id === prospectId);
  if (!p || p.draftedBy || draft.status === "complete")
    throw Error(tx(g, "Игрок уже недоступен для преддрафтовой беседы", "This prospect is no longer available for an interview"));
  const team = g.teams.find((t) => t.id === g.user)!;
  let meeting = draft.interviews![prospectId];
  if (!meeting) {
    if ((draft.interviewsLeft ?? 0) < 1) throw Error(tx(g, "Лимит встреч до драфта исчерпан", "No interview slots left before the draft"));
    draft.interviewsLeft = (draft.interviewsLeft ?? 0) - 1;
    const stance = prospectStance(g, p, g.user);
    meeting = { interest: stance.interest, refused: stance.refused, dream: stance.dream, asked: [], transcript: [], revealed: [], round: g.round };
    draft.interviews![prospectId] = meeting;
  }
  if (meeting.asked.includes(topic)) throw Error(tx(g, "Этот вопрос уже обсуждали", "You already asked that"));
  if (meeting.asked.length >= 3) throw Error(tx(g, "Встреча окончена", "The meeting is over"));
  meeting.asked.push(topic);
  const first = p.player.name.split(" ")[0];
  const city = team.city;
  const club = `${team.city} ${team.name}`;
  const home = p.hometown;
  const homeClub = home?.club ? clubName(g, home.club) : undefined;
  const t = meeting.transcript;
  const label = INTERVIEW_TOPIC_LABEL[topic];
  say(t, "manager", label.ru, label.en);
  const traits = p.traits ?? [];
  const reveal = (trait: ProspectTrait) => {
    if (!meeting!.revealed.includes(trait)) meeting!.revealed.push(trait);
  };
  if (meeting.refused) {
    if (topic === "dream" || topic === "city" || meeting.asked.length === 3) {
      meeting.refused === "rivalry"
        ? say(t, "player",
            `Скажу честно: я из ${home?.city}, у нас в семье все болеют за ${homeClub}. Играть за ${club} я не буду — родные мне этого не простят.`,
            `I'll be honest: I'm from ${home?.city} and my whole family bleeds ${homeClub}. I won't play for ${club} — they'd never forgive me.`, "negative")
        : say(t, "player",
            "Мой агент уже всё сказал вашему офису. Если выберете меня, подписывать контракт я не стану.",
            "My agent already told your office. If you draft me, I won't sign.", "negative");
    } else
      say(t, "player", "Нормально. Давайте без долгих разговоров, ладно?", "Fine. Let's keep this short, okay?", "negative");
    meeting.interest = Math.min(meeting.interest, 5);
    return meeting;
  }
  let delta = 0;
  let mood: ConversationLine["mood"] = "neutral";
  switch (topic) {
    case "about": {
      const trait = traits.find((tr) => !meeting.revealed.includes(tr)) ?? traits[0];
      if (trait) reveal(trait);
      const origin = home ? `${home.city}${home.region !== home.city ? `, ${home.region}` : ""}` : NATION_LABEL[p.player.nation]?.en ?? p.player.nation;
      say(t, "player",
        `Я из ${origin}. Играю за ${p.club ?? "свой клуб"} как ${p.player.pos === "G" ? "вратарь" : p.player.pos === "D" ? "защитник" : "нападающий"}. ${trait ? `Если честно, для меня важно одно — ${TRAIT_LABEL[trait].ru}.` : "Просто хочу стать лучше."}`,
        `I'm from ${origin}. I play for ${p.club ?? "my club"} as a ${p.player.pos === "G" ? "goalie" : p.player.pos === "D" ? "defenseman" : "forward"}. ${trait ? `Honestly, one thing matters to me — ${TRAIT_LABEL[trait].en}.` : "I just want to get better."}`);
      delta = 2;
      break;
    }
    case "city": {
      const big = BIG_MARKETS.includes(team.id), warm = WARM_MARKETS.includes(team.id);
      if (meeting.dream) {
        delta = 4; mood = "positive";
        say(t, "player", `${city}? Это мой дом. Я вырос на матчах ${club}.`, `${city}? That's home. I grew up at ${club} games.`, mood);
      } else if (traits.includes("small-market") && big) {
        reveal("small-market"); delta = -6; mood = "negative";
        say(t, "player", `Большой город, много прессы… Не уверен, что это моё.`, `Big city, lots of media… I'm not sure that's for me.`, mood);
      } else if (traits.includes("big-market") && big) {
        reveal("big-market"); delta = 7; mood = "positive";
        say(t, "player", `${city} — один из главных хоккейных рынков. Звучит круто!`, `${city} is one of the biggest hockey markets. Sounds awesome!`, mood);
      } else if (traits.includes("cold-climate") && warm) {
        reveal("cold-climate"); delta = -6; mood = "negative";
        say(t, "player", "Хоккей под пальмами… Я привык к настоящей зиме.", "Hockey under palm trees… I'm used to a real winter.", mood);
      } else if (traits.includes("warm-climate") && warm) {
        reveal("warm-climate"); delta = 7; mood = "positive";
        say(t, "player", "Солнце круглый год? Я только за!", "Sunshine all year? I'm in!", mood);
      } else if (home?.club && home.club !== team.id && CLUB_REGION[home.club] === CLUB_REGION[team.id]) {
        delta = -5; mood = "negative";
        say(t, "player", `Я рос рядом и болел за ${homeClub}. Это немного странно.`, `I grew up nearby cheering for ${homeClub}. It's a bit strange.`, mood);
      } else {
        delta = 2;
        say(t, "player", `Был в ${city} на турнире. Хорошая арена, болельщики шумные.`, `I played a tournament in ${city}. Nice rink, loud fans.`);
      }
      break;
    }
    case "role": {
      const depth = depthAt(team, p.player.pos);
      if (traits.includes("college-first")) {
        reveal("college-first"); delta = 0;
        say(t, "player", "Сначала два года в колледже — это обещание родителям. Потом я готов к NHL.", "College first for two years — I promised my parents. Then I'm ready for the NHL.");
      } else if (traits.includes("playing-time")) {
        reveal("playing-time");
        delta = depth <= 4 ? 12 : -6; mood = delta > 0 ? "positive" : "negative";
        say(t, "player",
          delta > 0 ? "У вас мало молодых на моей позиции — я вижу шанс пробиться быстро." : "У вас и так полно молодых на моей позиции. Где моё место?",
          delta > 0 ? "You're thin at my position — I see a quick path." : "You're already stacked with young guys at my spot. Where do I fit?", mood);
      } else {
        delta = 4;
        say(t, "player", "Готов работать в фарме сколько нужно. Главное — честный шанс.", "I'll work in the minors as long as it takes. I just want a fair shot.");
      }
      break;
    }
    case "development": {
      const coach = Math.round((staffRating(team, "skills-coach") + staffRating(team, "head-coach")) / 2);
      const base = Math.round((coach - 65) / 2.5);
      delta = traits.includes("development") ? base * 2 : base;
      if (traits.includes("development")) reveal("development");
      mood = delta > 3 ? "positive" : delta < -2 ? "negative" : "neutral";
      say(t, "player",
        delta > 3 ? `Я слышал про ваш тренерский штаб — с ними реально прибавить.` : delta < -2 ? "Честно, про ваших тренеров говорят разное." : "Звучит нормально. Посмотрим, как это будет на деле.",
        delta > 3 ? "I've heard about your coaching staff — guys really improve there." : delta < -2 ? "Honestly, people say mixed things about your coaches." : "Sounds fine. We'll see how it works out.", mood);
      break;
    }
    case "winning": {
      const rank = team.strengthRank ?? 16;
      if (traits.includes("contender")) {
        reveal("contender");
        delta = rank <= 10 ? 10 : rank >= 22 ? -8 : 2; mood = delta > 3 ? "positive" : delta < 0 ? "negative" : "neutral";
        say(t, "player",
          delta > 3 ? "Вот это мне нравится. Хочу играть там, где выигрывают." : delta < 0 ? "При всём уважении, сейчас вы далеко от Кубка." : "Хорошо, если так и будет.",
          delta > 3 ? "That's what I want to hear. I want to play where they win." : delta < 0 ? "With respect, you're far from the Cup right now." : "Good, if that's really the plan.", mood);
      } else {
        delta = 3;
        say(t, "player", "Побеждать хотят все. Я просто хочу быть частью этого.", "Everyone wants to win. I just want to be part of it.");
      }
      break;
    }
    case "dream": {
      if (meeting.dream) {
        delta = 5; mood = "positive";
        say(t, "player", `Вы серьёзно? С детства мечтаю надеть свитер ${club}! Если выберете меня — это будет лучший день в моей жизни.`, `Are you kidding? I've dreamed of wearing a ${club} sweater since I was a kid! Draft me and it'll be the best day of my life.`, mood);
      } else if (homeClub) {
        delta = traits.includes("close-to-home") ? -3 : 0;
        if (traits.includes("close-to-home")) reveal("close-to-home");
        say(t, "player", `Если честно — ${homeClub}, я из ${home!.city}. Но выбирать не мне.`, `Honestly — ${homeClub}, I'm from ${home!.city}. But it's not my call.`);
      } else {
        delta = 2;
        say(t, "player", "Любой клуб NHL — уже мечта. Я просто хочу услышать своё имя на драфте.", "Any NHL club is a dream. I just want to hear my name called.");
      }
      break;
    }
  }
  meeting.interest = clamp(Math.round(meeting.interest + delta), 5, 99);
  if (meeting.asked.length === 3)
    say(t, "player",
      meeting.interest >= 75 ? `Спасибо, что позвали. Был бы рад оказаться в ${club}.` : meeting.interest >= 45 ? "Спасибо за разговор. Увидимся на драфте." : "Ладно, спасибо. Посмотрим.",
      meeting.interest >= 75 ? `Thanks for having me. I'd love to end up in ${club}.` : meeting.interest >= 45 ? "Thanks for the talk. See you at the draft." : "Okay, thanks. We'll see.",
      meeting.interest >= 75 ? "positive" : meeting.interest >= 45 ? "neutral" : "negative");
  void first;
  return meeting;
}

/** Interest after the meeting, or the scout's read before it. */
export function prospectInterest(g: Game, p: DraftProspect) {
  const meeting = g.draft?.interviews?.[p.player.id];
  if (meeting) return { interest: meeting.interest, refused: meeting.refused, dream: meeting.dream, known: true };
  const stance = prospectStance(g, p, g.user);
  return { interest: stance.interest, refused: stance.refused, dream: stance.dream, known: false };
}

/* ------------------------------------------------------------------ */
/* Draft night                                                         */
/* ------------------------------------------------------------------ */

export const LOTTERY_WEIGHTS = [185,135,115,95,85,75,65,60,50,35,30,25,20,15,5,5];

export function prepareLottery(g: Game, r = new RNG(g.seed)) {
  const draft = ensureDraft(g);
  if (draft.lottery || draft.status !== "scouting") return draft.lottery;
  const field = new Set(g.bracket[0]?.flatMap(s => [s.a,s.b]));
  const seeds = rankedTeams(g.teams).reverse().sort((a,b) => Number(field.has(a.id)) - Number(field.has(b.id))).map(t=>t.id);
  const entrants = seeds.slice(0,16);
  const fixed = new Map<number,string>();
  const winners: string[] = [];
  for (let draw=0; draw<2; draw++) {
    const eligible = entrants.filter(id=>!winners.includes(id) && ![...fixed.values()].includes(id));
    const tickets = eligible.flatMap(id=>Array<string>(LOTTERY_WEIGHTS[entrants.indexOf(id)]).fill(id));
    const winner = r.pick(tickets);
    winners.push(winner);
    let slot = Math.max(draw,entrants.indexOf(winner)-10);
    while (fixed.has(slot)) slot++;
    fixed.set(slot,winner);
    if (!draw && slot>0) fixed.set(0,entrants[0]);
  }
  const rest = seeds.filter(id=>![...fixed.values()].includes(id));
  const order = seeds.map((_,i)=>fixed.get(i) ?? rest.shift()!);
  draft.lottery = {seeds,winners,order,revealed:0};
  return draft.lottery;
}

export function openDraft(g: Game, r = new RNG(g.seed)) {
  const draft = ensureDraft(g);
  if (draft.status !== "scouting") return;
  const lottery = prepareLottery(g,r)!;
  lottery.revealed = 2;
  const clubs = new Map(g.teams.map(t=>[t.id,t]));
  const reverse = lottery.seeds.map(id=>clubs.get(id)!);
  const firstRound = lottery.order.map(id=>clubs.get(id)!);
  draft.picks = Array.from({ length: 7 }, (_, round) =>
    (round === 0 ? firstRound : reverse).map((team, index) => ({
      year: draft.year,
      round: round + 1,
      overall: round * 32 + index + 1,
      team: g.draftAssets?.find(p=>p.year===draft.year && p.round===round+1 && p.originalTeam===team.id)?.currentTeam ?? team.id,
      originalTeam: team.id,
    })),
  ).flat();
  draft.currentPick = 0;
  draft.status = "draft";
  g.news.unshift(
    tx(
      g,
      `Драфт ${draft.year} открыт. Лотерея: ${lottery.winners.join(", ")}.`,
      `The ${draft.year} draft is open. Lottery: ${lottery.winners.join(", ")}.`,
    ),
  );
  advanceDraftToUser(g);
}

function needsScore(team: Team, player: Player) {
  const count = team.players.filter((p) => p.pos === player.pos).length;
  const prospectCount = (team.prospects ?? []).filter((p) => p.pos === player.pos).length;
  return Math.max(0, 8 - count - prospectCount) * 2;
}

function aiChoice(g: Game, team: Team) {
  const draft = ensureDraft(g);
  return draft.prospects
    .filter((p) => !p.draftedBy)
    .sort(
      (a, b) =>
        b.player.potential * 0.65 + b.player.ovr * 0.25 + needsScore(team, b.player) -
          (a.player.potential * 0.65 + a.player.ovr * 0.25 + needsScore(team, a.player)) ||
        a.trueRank - b.trueRank,
    )[0];
}

function assignPick(g: Game, prospectId: string) {
  const draft = ensureDraft(g);
  const pick = draft.picks[draft.currentPick];
  if (!pick) throw Error("Draft is complete");
  const prospect = draft.prospects.find((p) => p.player.id === prospectId && !p.draftedBy);
  if (!prospect) throw Error("Prospect unavailable");
  prospect.draftedBy = pick.team;
  prospect.draftedOverall = pick.overall;
  pick.prospectId = prospectId;
  if (g.draftAssets) g.draftAssets = g.draftAssets.filter(p =>
    p.year !== pick.year || p.round !== pick.round || p.originalTeam !== pick.originalTeam);
  const team = g.teams.find((t) => t.id === pick.team)!;
  team.prospects ??= [];
  const drafted = structuredClone(prospect.player);
  drafted.draftOverall = pick.overall;
  if (pick.team === g.user) reactToUserPick(g, prospect, drafted, team);
  team.prospects.push(drafted);
  draft.currentPick++;
  if (draft.currentPick >= draft.picks.length) {
    draft.status = "complete";
    g.news.unshift(tx(g, `Драфт ${draft.year} завершён.`, `The ${draft.year} draft is complete.`));
  }
}

/** How the drafted player takes being picked by the user's club. */
function reactToUserPick(g: Game, prospect: DraftProspect, drafted: Player, team: Team) {
  const { interest, refused, dream } = prospectInterest(g, prospect);
  const club = `${team.city} ${team.name}`;
  if (refused) {
    drafted.morale = 20;
    drafted.motivation = 20;
    drafted.relationship = 10;
    g.news.unshift(
      tx(
        g,
        `${drafted.name} отказывается подписывать контракт с ${club} и требует обмена. Его лагерь давно предупреждал об этом.`,
        `${drafted.name} refuses to sign with ${club} and wants a trade. His camp had warned about it.`,
      ),
    );
  } else if (dream || interest >= 80) {
    drafted.morale = 85;
    drafted.motivation = 88;
    drafted.relationship = 75;
    g.news.unshift(
      tx(
        g,
        `${drafted.name}: «${dream ? "Мечта сбылась!" : "Не мог и мечтать о лучшем клубе!"}» — проспект в восторге от выбора ${club}.`,
        `${drafted.name}: "${dream ? "A dream come true!" : "I couldn't ask for a better club!"}" — the prospect is thrilled to join ${club}.`,
      ),
    );
  } else if (interest < 30) {
    drafted.morale = 38;
    drafted.motivation = 40;
  }
}

export function advanceDraftToUser(g: Game) {
  const draft = ensureDraft(g);
  if (draft.status !== "draft") return;
  while (draft.currentPick < draft.picks.length && draft.picks[draft.currentPick].team !== g.user) {
    const team = g.teams.find((t) => t.id === draft.picks[draft.currentPick].team)!;
    assignPick(g, aiChoice(g, team).player.id);
  }
}

export function makeUserDraftPick(g: Game, prospectId: string) {
  const draft = ensureDraft(g);
  if (draft.status !== "draft") throw Error("Draft is not active");
  const pick = draft.picks[draft.currentPick];
  if (!pick || pick.team !== g.user) throw Error("Your club is not on the clock");
  assignPick(g, prospectId);
  advanceDraftToUser(g);
}

export function autoCompleteDraft(g: Game) {
  const draft = ensureDraft(g);
  if (draft.status === "scouting") openDraft(g);
  while (draft.status === "draft") {
    const pick = draft.picks[draft.currentPick];
    const team = g.teams.find((t) => t.id === pick.team)!;
    const shortlisted = draft.shortlist
      .map((id) => draft.prospects.find((p) => p.player.id === id))
      .find((p) => p && !p.draftedBy && !prospectInterest(g, p).refused);
    assignPick(g, (pick.team === g.user && shortlisted ? shortlisted : aiChoice(g, team)).player.id);
  }
}

export function prepareNextDraft(g: Game, r: RNG) {
  if (g.draft?.status === "complete") {
    g.draftHistory ??= [];
    g.draftHistory.push({
      year: g.draft.year,
      picks: g.draft.picks.map((pick) => {
        const prospect = g.draft!.prospects.find((item) => item.player.id === pick.prospectId)!;
        return { ...pick, player: prospect.player.name, pos: prospect.player.pos };
      }),
    });
  }
  g.draft = createDraftState(g.year + 1, r);
  const user = g.teams.find((t) => t.id === g.user);
  g.draft.interviewsLeft = 10 + Math.max(0, Math.floor(scoutPersuasion(user) / 2));
}
