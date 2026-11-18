import type { Locale } from "../i18n/locales";
import { tx } from "./text";
import { RULES } from "./rules";
import { archetypes, rolesFor, overall } from "./ratings";
import { assignPotential, ensurePotentialModel } from "./potential";
import { RNG, clamp } from "./random";
import {
  emptyRecord,
  emptyStats,
  type Team,
  type Player,
  type Position,
  type Game,
} from "./types";
import { makeSchedule } from "./season";
import { ensureSpecialTeams } from "./tactics";
import { ensureUserIceTime } from "./iceTime";
import {
  NHL_DATA_META,
  NHL_PLAYER_RATINGS,
  NHL_ROSTERS,
  NHL_TEAM_RATINGS,
  NHL_TEAM_LOGOS,
  type NhlRosterIdentity,
} from "../data/nhl-2026-27";
import {
  NHL_CONTRACT_META,
  NHL_CONTRACTS_BY_NAME,
} from "../data/nhl-contracts-2026-27";
import { NHL_INJURIES, NHL_INJURY_META } from "../data/nhl-injuries-2026-27";
import {
  AHL_ROSTERS,
  OHL_ROSTERS,
  MINOR_LEAGUE_META,
  type MinorLeagueIdentity,
} from "../data/minor-leagues-2026-27";
const clubs = [
  ["BOS", "Boston", "Bruins", "Atlantic", "#eab743"],
  ["BUF", "Buffalo", "Sabres", "Atlantic", "#3267be"],
  ["DET", "Detroit", "Red Wings", "Atlantic", "#e34646"],
  ["FLA", "Florida", "Panthers", "Atlantic", "#ce4756"],
  ["MTL", "Montréal", "Canadiens", "Atlantic", "#d64658"],
  ["OTT", "Ottawa", "Senators", "Atlantic", "#c14a51"],
  ["TBL", "Tampa Bay", "Lightning", "Atlantic", "#4483df"],
  ["TOR", "Toronto", "Maple Leafs", "Atlantic", "#5389d8"],
  ["CAR", "Carolina", "Hurricanes", "Metropolitan", "#e05258"],
  ["CBJ", "Columbus", "Blue Jackets", "Metropolitan", "#708dc3"],
  ["NJD", "New Jersey", "Devils", "Metropolitan", "#df5252"],
  ["NYI", "New York", "Islanders", "Metropolitan", "#f38b42"],
  ["NYR", "New York", "Rangers", "Metropolitan", "#487dd4"],
  ["PHI", "Philadelphia", "Flyers", "Metropolitan", "#ed773d"],
  ["PIT", "Pittsburgh", "Penguins", "Metropolitan", "#e7bf50"],
  ["WSH", "Washington", "Capitals", "Metropolitan", "#cf5365"],
  ["CHI", "Chicago", "Blackhawks", "Central", "#d35355"],
  ["COL", "Colorado", "Avalanche", "Central", "#a76d84"],
  ["DAL", "Dallas", "Stars", "Central", "#51b491"],
  ["MIN", "Minnesota", "Wild", "Central", "#6db48e"],
  ["NSH", "Nashville", "Predators", "Central", "#eabd43"],
  ["STL", "St. Louis", "Blues", "Central", "#548ce4"],
  ["UTA", "Utah", "Mammoth", "Central", "#8cb9d2"],
  ["WPG", "Winnipeg", "Jets", "Central", "#789bc6"],
  ["ANA", "Anaheim", "Ducks", "Pacific", "#f19454"],
  ["CGY", "Calgary", "Flames", "Pacific", "#e65c50"],
  ["EDM", "Edmonton", "Oilers", "Pacific", "#f28c4e"],
  ["LAK", "Los Angeles", "Kings", "Pacific", "#b7c0ca"],
  ["SJS", "San Jose", "Sharks", "Pacific", "#48b2b6"],
  ["SEA", "Seattle", "Kraken", "Pacific", "#75c5cd"],
  ["VAN", "Vancouver", "Canucks", "Pacific", "#5b9fdb"],
  ["VGK", "Vegas", "Golden Knights", "Pacific", "#cbb46e"],
];
export const attributes = [
  "shooting",
  "accuracy",
  "passing",
  "puckControl",
  "speed",
  "acceleration",
  "offensivePosition",
  "offPuck",
  "faceoffs",
  "strength",
  "defensivePosition",
  "checking",
  "blocking",
  "firstPass",
  "skating",
  "penaltyKill",
  "reflexes",
  "goaliePosition",
  "glove",
  "reboundControl",
  "stickhandling",
  "composure",
  "discipline",
  "leadership",
  "decisions",
  "consistency",
  "teamwork",
  "resilience",
  "stamina",
  "durability",
];
const first = [
  "Alex",
  "Nikita",
  "Oliver",
  "Elias",
  "Lucas",
  "Mika",
  "Noah",
  "Anton",
  "William",
  "Leo",
  "Dylan",
  "Felix",
  "Viktor",
  "Max",
  "Simon",
  "Liam",
  "Owen",
  "Theo",
  "Ivan",
  "Matteo",
  "Erik",
  "Jakub",
  "Adam",
  "Samuel",
];
const last = [
  "Norberg",
  "Volkov",
  "Mercier",
  "Hawthorne",
  "Kovalenko",
  "Lindholm",
  "Beaulieu",
  "Sorensen",
  "Whitmore",
  "Petrov",
  "Lavoie",
  "Nyberg",
  "Novak",
  "Ellis",
  "Fournier",
  "Sokolov",
  "Berglund",
  "Callahan",
  "Vesely",
  "Morozov",
  "Havel",
  "Dahl",
  "Royce",
  "Keller",
];
export function createPlayer(
  r: RNG,
  id: string,
  pos: Position,
  level = 73,
): Player {
  const base = clamp(level + r.int(-10, 10), 48, 91);
  const attrs = Object.fromEntries(
    attributes.map((a) => [a, clamp(base + r.int(-12, 12), 35, 98)]),
  );
  const archetype = r.pick(rolesFor(pos));
  for (const key of archetypes[archetype])
    attrs[key] = clamp(attrs[key] + 8, 35, 98);
  const ovr = overall(pos, attrs, archetype);
  const player: Player = {
    archetype,
    id,
    name: `${r.pick(first)} ${r.pick(last)}`,
    number: r.int(2, 98),
    pos,
    age: r.int(19, 35),
    nation: r.pick(["CAN", "USA", "SWE", "FIN", "CZE", "RUS"]),
    attributes: attrs,
    ovr,
    // Draw kept so seeded careers keep the same rosters; set by the model below.
    potential: (r.int(0, 15), ovr),
    salary:
      Math.round((0.8 + Math.pow(Math.max(0, ovr - 58) / 13, 2)) * 100) / 100,
    years: r.int(1, 5),
    fatigue: 0,
    morale: 50,
    injury: 0,
    stats: emptyStats(),
    history: [],
  };
  assignPotential(player);
  return player;
}
export function autoLines(t: Team) {
  const pick = (p: Position, n: number) =>
    t.players
      .filter((x) => x.pos === p)
      .sort(
        (a, b) =>
          (a.injury > 0 ? 1 : 0) - (b.injury > 0 ? 1 : 0) || b.ovr - a.ovr,
      )
      .slice(0, n)
      .map((x) => x.id);
  const forwards = t.players
      .filter((x) => x.pos !== "D" && x.pos !== "G")
      .sort(
        (a, b) =>
          (a.injury > 0 ? 1 : 0) - (b.injury > 0 ? 1 : 0) || b.ovr - a.ovr,
      )
      .slice(0, 12)
      .map((x) => x.id),
    d = pick("D", 6);
  t.lines = Array.from({ length: 4 }, (_, i) =>
    forwards.slice(i * 3, i * 3 + 3),
  );
  t.defense = Array.from({ length: 3 }, (_, i) => d.slice(i * 2, i * 2 + 2));
  t.goalie = pick("G", 1)[0];
  t.specialTeams = undefined;
  ensureSpecialTeams(t);
}

function calibrateRosterHierarchy(players: Player[]) {
  const goalies = players.filter((player) => player.pos === "G");
  if (goalies.length < 2) return;
  const starter = [...goalies].sort((a, b) => {
    const aGames = a.externalId
      ? (NHL_PLAYER_RATINGS[a.externalId]?.gp ?? 0)
      : 0;
    const bGames = b.externalId
      ? (NHL_PLAYER_RATINGS[b.externalId]?.gp ?? 0)
      : 0;
    return bGames - aGames || b.salary - a.salary || b.ovr - a.ovr;
  })[0];
  const starterGames = starter.externalId
    ? (NHL_PLAYER_RATINGS[starter.externalId]?.gp ?? 0)
    : 0;
  if (starterGames < 20) return;
  for (const goalie of goalies) {
    if (goalie === starter || !goalie.externalId) continue;
    const games = NHL_PLAYER_RATINGS[goalie.externalId]?.gp ?? 0;
    if (games < 10 && goalie.ovr > starter.ovr - 4)
      setPlayerOverall(goalie, starter.ovr - 4);
  }
}
export function newGame(
  user = "TOR",
  seed = 260027,
  language: Locale = "ru",
): Game {
  const r = new RNG(seed);
  const teams: Team[] = clubs.map(([id, city, name, division, color], i) => {
    const level = r.int(69, 79);
    const identities = NHL_ROSTERS[id];
    const roster = identities.map((identity, j) =>
      createOfficialPlayer(r, id, identity, level, j),
    );
    calibrateRosterHierarchy(roster);
    const ahlIdentities = AHL_ROSTERS.filter((p) => p.affiliate === id);
    const knownNames = new Set(roster.map((p) => contractName(p.name)));
    const ahl = ahlIdentities
      .filter((p) => !knownNames.has(contractName(p.name)))
      .map((identity, j) => createMinorPlayer(r, identity, "AHL", j));
    const ranked = [...roster].sort((a, b) => b.ovr - a.ovr);
    const essential = [
      ...ranked.filter((p) => p.pos !== "D" && p.pos !== "G").slice(0, 12),
      ...ranked.filter((p) => p.pos === "D").slice(0, 6),
      ...ranked.filter((p) => p.pos === "G").slice(0, 2),
    ];
    const active = [
      ...essential,
      ...ranked
        .filter((p) => !essential.includes(p))
        .slice(0, 24 - essential.length),
    ];
    const t: Team = {
      id,
      city,
      name,
      division,
      color,
      conference: i < 16 ? "East" : "West",
      logoUrl: NHL_TEAM_LOGOS[id],
      strengthRating: NHL_TEAM_RATINGS[id].overall,
      strengthRank: NHL_TEAM_RATINGS[id].rank,
      realWorldForm: {
        gamesPlayed: NHL_TEAM_RATINGS[id].gamesPlayed,
        pointPct: NHL_TEAM_RATINGS[id].pointPct,
        goalDifferential: NHL_TEAM_RATINGS[id].goalDifferential,
      },
      players: active,
      farm: [...roster.filter((p) => !active.includes(p)), ...ahl],
      ahlAffiliate: ahlIdentities[0]?.club,
      ahlLogoUrl: ahlIdentities[0]?.clubLogo,
      lines: [],
      defense: [],
      goalie: "",
      tactics: { forecheck: "1-2-2", pace: 50, physical: 50, shooting: 50 },
      record: emptyRecord(),
    };
    autoLines(t);
    return t;
  });
  const juniorPlayers = OHL_ROSTERS.map((identity, i) =>
    createMinorPlayer(r, identity, "OHL", i),
  );
  const game: Game = {
    version: 1,
    id: `career-${Date.now()}`,
    seed: r.seed,
    year: 2026,
    user,
    teams,
    round: 0,
    phase: "regular",
    schedule: makeSchedule(teams),
    bracket: [],
    playoffRound: 0,
    news: [
      tx(
        { language },
        "Создана новая карьера. Составы NHL/AHL/OHL, реальные контракты и текущий лазарет 2026/27 синхронизированы с публичными источниками.",
        "New career created. NHL/AHL/OHL rosters, real contracts and the current 2026/27 injury list are synced from public sources.",
      ),
    ],
    history: [],
    rules: { cap: RULES.defaultSalaryCapMillions },
    language,
    dataSource: {
      kind: "official-identities-modeled-ratings",
      season: NHL_DATA_META.season,
      source: NHL_DATA_META.source,
      fetchedAt: NHL_DATA_META.fetchedAt,
      ratingModel: NHL_DATA_META.ratingModel,
      contractSource: NHL_CONTRACT_META.source,
      contractsFetchedAt: NHL_CONTRACT_META.fetchedAt,
      injurySource: NHL_INJURY_META.source,
      injuriesFetchedAt: NHL_INJURY_META.fetchedAt,
      minorsSource: MINOR_LEAGUE_META.source,
      minorsFetchedAt: MINOR_LEAGUE_META.fetchedAt,
    },
    juniorPlayers,
  };
  game.internationalMarket = createInternationalMarket(r);
  game.internationalOffers = [];
  ensurePotentialModel(game);
  ensureUserIceTime(game);
  return game;
}

function createOfficialPlayer(
  r: RNG,
  teamId: string,
  identity: NhlRosterIdentity,
  level: number,
  index: number,
) {
  const player = createPlayer(
    r,
    `nhl-${teamId}-${identity.id}`,
    identity.position,
    level,
  );
  player.externalId = identity.id;
  player.name = `${identity.firstName} ${identity.lastName}`;
  player.number = identity.number || index + 1;
  player.age = identity.age;
  player.nation = identity.nation;
  player.birthDate = identity.birthDate;
  player.headshot = identity.headshot;
  player.identitySource = "nhl-api";
  applyPlayerRating(player);
  applyPlayerContract(player, teamId);
  applyPlayerInjury(player, teamId);
  player.league = "NHL";
  player.contractType = "NHL";
  return player;
}

function hash(value: string) {
  let result = 2166136261;
  for (const char of value)
    result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function setPlayerOverall(player: Player, target: number) {
  for (let pass = 0; pass < 6; pass++) {
    const delta =
      target - overall(player.pos, player.attributes, player.archetype);
    if (!delta) break;
    for (const key of Object.keys(player.attributes))
      player.attributes[key] = clamp(player.attributes[key] + delta, 30, 99);
  }
  player.ovr = overall(player.pos, player.attributes, player.archetype);
}

function ageOn(date: string, year = 2026) {
  const born = new Date(`${date}T12:00:00Z`);
  return Math.max(
    16,
    year - born.getUTCFullYear() - (born.getUTCMonth() > 9 ? 1 : 0),
  );
}

function createMinorPlayer(
  r: RNG,
  identity: MinorLeagueIdentity,
  league: "AHL" | "OHL",
  index: number,
) {
  const player = createPlayer(
    r,
    identity.id,
    identity.pos,
    league === "AHL" ? 63 : 55,
  );
  player.name = identity.name;
  player.number = identity.number || (index % 90) + 1;
  player.birthDate = identity.birthDate;
  player.age = ageOn(identity.birthDate);
  player.nation = identity.nation;
  player.identitySource = "hockeytech";
  player.leagueSource = "hockeytech";
  player.league = league;
  player.currentClub = identity.club;
  player.contractType = league === "AHL" ? "AHL" : undefined;
  const target =
    league === "AHL"
      ? 59 + (hash(identity.id) % 15)
      : 48 + (hash(identity.id) % 18);
  setPlayerOverall(player, target);
  assignPotential(player, { league });
  player.salary = league === "AHL" ? 0.15 : 0;
  player.years = 1;
  player.contractRemainingValue = player.salary;
  return player;
}

function applyPlayerInjury(player: Player, teamId: string) {
  const injury = NHL_INJURIES.find(
    (item) =>
      item.team === teamId &&
      contractName(item.player) === contractName(player.name),
  );
  if (!injury) return false;
  const snapshot = new Date(NHL_INJURY_META.fetchedAt);
  const returning = new Date(`${injury.returnDate}T12:00:00Z`);
  const days = Math.max(
    1,
    Math.ceil((returning.valueOf() - snapshot.valueOf()) / 86_400_000),
  );
  player.injury = Math.max(1, Math.ceil(days / 2));
  player.injurySource = "puckpedia";
  player.injuryStatus = injury.status;
  player.injuryReason = injury.reason;
  player.injuryTimeline = injury.timeline;
  player.injuryReturnDate = injury.returnDate;
  player.injuryReport = injury.report;
  player.injuryBurden = Math.max(player.injuryBurden ?? 0, player.injury);
  return true;
}

const internationalNames = [
  ["SWE", "SHL", "Växjö Lakers", "Emil Sundström"],
  ["SWE", "SHL", "Frölunda HC", "Viktor Nyberg"],
  ["FIN", "Liiga", "Tappara", "Eetu Laaksonen"],
  ["FIN", "Liiga", "Ilves", "Jere Mäkinen"],
  ["CHE", "NL", "ZSC Lions", "Luca Meier"],
  ["CHE", "NL", "SC Bern", "Noah Bühler"],
  ["DEU", "DEL", "Eisbären Berlin", "Felix Wagner"],
  ["DEU", "DEL", "Adler Mannheim", "Moritz Keller"],
  ["CZE", "Czech", "HC Sparta Praha", "Jakub Dvořák"],
  ["CZE", "Czech", "HC Kometa Brno", "Matěj Novotný"],
  ["RUS", "KHL", "SKA Saint Petersburg", "Ivan Sokolov"],
  ["RUS", "KHL", "Lokomotiv Yaroslavl", "Mikhail Volkov"],
] as const;
const internationalAlternates = [
  "Lindberg",
  "Korhonen",
  "Keller",
  "Vogel",
  "Horák",
  "Morozov",
  "Bergström",
  "Laine",
  "Schmid",
  "Fischer",
  "Kovář",
  "Petrov",
];

function createInternationalMarket(
  r: RNG,
  year = 2026,
): NonNullable<Game["internationalMarket"]> {
  return Array.from({ length: 36 }, (_, i) => {
    const template = internationalNames[i % internationalNames.length];
    const pos = (["LW", "C", "RW", "D", "D", "G"] as Position[])[i % 6];
    const player = createPlayer(r, `intl-${year}-${i}`, pos, 68 + (i % 5));
    const [firstName] = template[3].split(" ");
    player.name =
      i < internationalNames.length
        ? template[3]
        : `${firstName} ${internationalAlternates[(i + Math.floor(i / internationalNames.length)) % internationalAlternates.length]}`;
    player.nation = template[0];
    player.age = 18 + (hash(player.id) % 10);
    player.league = template[1];
    assignPotential(player);
    player.currentClub = template[2];
    player.leagueSource = "generated";
    player.contractType = "international";
    player.salary = 0;
    player.years = 0;
    const status =
      template[1] === "KHL"
        ? "release-required"
        : i % 7 === 0
          ? "rights-restricted"
          : "free";
    return {
      player,
      league: template[1],
      club: template[2],
      contractUntil: status === "free" ? year : year + 1 + (i % 2),
      transferStatus: status,
      desiredSalary:
        Math.round((0.9 + Math.max(0, player.ovr - 65) * 0.16) * 100) / 100,
      desiredYears: 1 + (i % 3),
      desiredRole:
        player.ovr >= 75 ? "top-six" : player.ovr >= 70 ? "rotation" : "depth",
      adaptationRisk: 20 + (hash(player.name) % 61),
      agentLeverage: 30 + (hash(player.id) % 61),
      competingOffers: hash(player.name + player.id) % 5,
      scouted: 15,
    };
  });
}

export function refreshInternationalMarket(g: Game, r: RNG) {
  g.internationalMarket = createInternationalMarket(r, g.year);
  g.internationalOffers = [];
}

const contractName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function applyPlayerContract(player: Player, teamId: string) {
  const contract =
    NHL_CONTRACTS_BY_NAME[`${teamId}|${contractName(player.name)}`];
  if (!contract) {
    player.contractSource = "generated";
    player.contractRemainingValue =
      Math.round(player.salary * player.years * 100) / 100;
    return false;
  }
  player.salary = contract.aav / 1_000_000;
  player.years = contract.remainingYears;
  player.contractRemainingValue = contract.remainingValue / 1_000_000;
  player.contractExpiryYear = contract.expiryYear;
  player.contractStatus = contract.expiryStatus;
  player.contractSource = "puckpedia";
  return true;
}

function applyPlayerRating(player: Player) {
  if (!player.externalId) return;
  const rating = NHL_PLAYER_RATINGS[player.externalId];
  if (!rating) return;
  const samplePenalty =
    rating.gp < 8
      ? rating.group === "goalie"
        ? 4
        : 3
      : rating.gp < 16
        ? 2
        : 0;
  const target = clamp(rating.ovr - samplePenalty, 55, 99);
  for (let pass = 0; pass < 6; pass++) {
    const current = overall(player.pos, player.attributes, player.archetype);
    const delta = target - current;
    if (!delta) break;
    for (const key of Object.keys(player.attributes))
      player.attributes[key] = clamp(player.attributes[key] + delta, 35, 99);
  }
  player.ovr = overall(player.pos, player.attributes, player.archetype);
  if (player.ovr !== target) player.ovr = target;
  player.ratingRank = rating.rank;
  assignPotential(player, { league: "NHL" });
  player.ratingSource = "nhl-stats-model";
}

export const teamOverall = (t: Team) =>
  t.strengthRating ??
  Math.round(t.players.reduce((n, p) => n + p.ovr, 0) / t.players.length);

export function applyOfficialIdentitySnapshot(g: Game) {
  if (g.dataSource?.kind === "official-identities-modeled-ratings")
    throw Error("Official identity snapshot is already active");
  for (const team of g.teams) {
    const available = [...(NHL_ROSTERS[team.id] ?? [])];
    const targets = [...team.players, ...(team.farm ?? [])].filter(
      (player) => !player.externalId,
    );
    for (const player of targets) {
      const exact = available.findIndex(
        (identity) => identity.position === player.pos,
      );
      const sameUnit = available.findIndex((identity) =>
        player.pos === "D" || player.pos === "G"
          ? identity.position === player.pos
          : identity.position !== "D" && identity.position !== "G",
      );
      const index = exact >= 0 ? exact : sameUnit >= 0 ? sameUnit : 0;
      const identity = available.splice(index, 1)[0];
      if (!identity) break;
      player.externalId = identity.id;
      player.name = `${identity.firstName} ${identity.lastName}`;
      player.number = identity.number || player.number;
      player.age = identity.age + Math.max(0, g.year - 2026);
      player.nation = identity.nation;
      player.birthDate = identity.birthDate;
      player.headshot = identity.headshot;
      player.identitySource = "nhl-api";
      if (g.year === 2026) applyPlayerRating(player);
    }
    team.logoUrl = NHL_TEAM_LOGOS[team.id];
  }
  if (g.year === 2026)
    for (const team of g.teams)
      for (const player of [...team.players, ...(team.farm ?? [])])
        applyPlayerRating(player);
  applyTeamRatings(g);
  g.dataSource = {
    kind: "official-identities-modeled-ratings",
    season: NHL_DATA_META.season,
    source: NHL_DATA_META.source,
    fetchedAt: NHL_DATA_META.fetchedAt,
    ratingModel: NHL_DATA_META.ratingModel,
  };
  g.news.unshift(
    tx(
      g,
      "Карьера обновлена: личности, эмблемы и статистическая модель рейтингов синхронизированы со снимком NHL 2026/27; контракты и результаты сохранены.",
      "Career updated: identities, logos and the statistical rating model are synced with the NHL 2026/27 snapshot; contracts and results are kept.",
    ),
  );
}

function applyTeamRatings(g: Game) {
  for (const team of g.teams) {
    const rating = NHL_TEAM_RATINGS[team.id];
    if (!rating) continue;
    team.strengthRating = rating.overall;
    team.strengthRank = rating.rank;
    team.realWorldForm = {
      gamesPlayed: rating.gamesPlayed,
      pointPct: rating.pointPct,
      goalDifferential: rating.goalDifferential,
    };
  }
}

export function applyOfficialRatingsSnapshot(g: Game) {
  if (g.year !== 2026)
    throw Error(
      "Ratings snapshot can only be applied to the 2026/27 career start",
    );
  let updated = 0;
  for (const team of g.teams)
    for (const player of [
      ...team.players,
      ...(team.farm ?? []),
      ...(team.prospects ?? []),
    ])
      if (player.externalId && NHL_PLAYER_RATINGS[player.externalId]) {
        applyPlayerRating(player);
        updated++;
      }
  applyTeamRatings(g);
  g.dataSource = {
    kind: "official-identities-modeled-ratings",
    season: NHL_DATA_META.season,
    source: NHL_DATA_META.source,
    fetchedAt: NHL_DATA_META.fetchedAt,
    ratingModel: NHL_DATA_META.ratingModel,
  };
  g.news.unshift(
    tx(
      g,
      `Обновлены рейтинги ${updated} игроков. McDavid — 97 OVR; Carolina — 92 OVR / #1.`,
      `Ratings updated for ${updated} players. McDavid — 97 OVR; Carolina — 92 OVR / #1.`,
    ),
  );
}

export function applyOfficialContractSnapshot(g: Game) {
  if (g.year !== 2026)
    throw Error(
      "Contract snapshot can only be applied at the 2026/27 career start",
    );
  let updated = 0;
  for (const team of g.teams)
    for (const player of [...team.players, ...(team.farm ?? [])])
      if (
        player.identitySource === "nhl-api" &&
        applyPlayerContract(player, team.id)
      )
        updated++;
  g.dataSource ??= {
    kind: "official-identities-modeled-ratings",
    season: NHL_DATA_META.season,
    source: NHL_DATA_META.source,
    fetchedAt: NHL_DATA_META.fetchedAt,
  };
  g.dataSource.contractSource = NHL_CONTRACT_META.source;
  g.dataSource.contractsFetchedAt = NHL_CONTRACT_META.fetchedAt;
  g.news.unshift(
    tx(
      g,
      `Проверенные контракты PuckPedia применены: ${updated} игроков; остальные контракты помечены как игровые.`,
      `Verified PuckPedia contracts applied: ${updated} players; the remaining contracts are marked as game-generated.`,
    ),
  );
  return updated;
}

export function applyOfficialInjurySnapshot(g: Game) {
  if (g.year !== 2026)
    throw Error("The real-world injury snapshot is only valid for 2026/27");
  let updated = 0;
  for (const team of g.teams) {
    for (const player of [...team.players, ...(team.farm ?? [])]) {
      if (player.injurySource === "puckpedia") {
        player.injury = 0;
        player.injurySource = undefined;
      }
      if (applyPlayerInjury(player, team.id)) updated++;
    }
    autoLines(team);
  }
  g.dataSource ??= {
    kind: "official-identities-modeled-ratings",
    season: NHL_DATA_META.season,
    source: NHL_DATA_META.source,
    fetchedAt: NHL_DATA_META.fetchedAt,
  };
  g.dataSource.injurySource = NHL_INJURY_META.source;
  g.dataSource.injuriesFetchedAt = NHL_INJURY_META.fetchedAt;
  g.news.unshift(
    tx(
      g,
      `Лазарет PuckPedia обновлён: ${updated} игроков NHL с реальными ожидаемыми датами возвращения.`,
      `PuckPedia injury list updated: ${updated} NHL players with real expected return dates.`,
    ),
  );
  return updated;
}

export function applyMinorLeagueSnapshot(g: Game) {
  if (g.year !== 2026)
    throw Error("The AHL/OHL snapshot is only valid for 2026/27");
  const r = new RNG(g.seed ^ 0x41_48_4c);
  let added = 0;
  for (const team of g.teams) {
    team.farm ??= [];
    const known = new Set(
      [...team.players, ...team.farm].map((p) => contractName(p.name)),
    );
    const identities = AHL_ROSTERS.filter((p) => p.affiliate === team.id);
    team.ahlAffiliate = identities[0]?.club;
    team.ahlLogoUrl = identities[0]?.clubLogo;
    for (const identity of identities)
      if (!known.has(contractName(identity.name))) {
        team.farm.push(createMinorPlayer(r, identity, "AHL", added++));
        known.add(contractName(identity.name));
      }
  }
  g.juniorPlayers = OHL_ROSTERS.map((identity, i) =>
    createMinorPlayer(r, identity, "OHL", i),
  );
  g.internationalMarket ??= createInternationalMarket(r);
  g.internationalOffers ??= [];
  g.dataSource ??= {
    kind: "official-identities-modeled-ratings",
    season: NHL_DATA_META.season,
    source: NHL_DATA_META.source,
    fetchedAt: NHL_DATA_META.fetchedAt,
  };
  g.dataSource.minorsSource = MINOR_LEAGUE_META.source;
  g.dataSource.minorsFetchedAt = MINOR_LEAGUE_META.fetchedAt;
  g.seed = r.seed;
  g.news.unshift(
    tx(
      g,
      `Подключены официальные составы AHL и OHL 2026/27: ${added} новых игроков фарма и ${g.juniorPlayers.length} юниоров.`,
      `Official 2026/27 AHL and OHL rosters connected: ${added} new farm players and ${g.juniorPlayers.length} juniors.`,
    ),
  );
  return added;
}
