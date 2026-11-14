import { RULES } from "./rules";
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
  const ovr = Math.round(
    Object.values(attrs).reduce((a, b) => a + b) / attributes.length,
  );
  return {
    id,
    name: `${r.pick(first)} ${r.pick(last)}`,
    number: r.int(2, 98),
    pos,
    age: r.int(19, 35),
    nation: r.pick(["CAN", "USA", "SWE", "FIN", "CZE", "RUS"]),
    attributes: attrs,
    ovr,
    potential: clamp(ovr + r.int(0, 15), ovr, 98),
    salary:
      Math.round((0.8 + Math.pow(Math.max(0, ovr - 58) / 13, 2)) * 100) / 100,
    years: r.int(1, 5),
    fatigue: 0,
    morale: 75,
    injury: 0,
    stats: emptyStats(),
    history: [],
  };
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
  const lw = pick("LW", 4),
    c = pick("C", 4),
    rw = pick("RW", 4),
    d = pick("D", 6);
  t.lines = Array.from({ length: 4 }, (_, i) => [lw[i], c[i], rw[i]]);
  t.defense = Array.from({ length: 3 }, (_, i) => d.slice(i * 2, i * 2 + 2));
  t.goalie = pick("G", 1)[0];
}
export function newGame(user = "TOR", seed = 260027): Game {
  const r = new RNG(seed);
  const teams: Team[] = clubs.map(([id, city, name, division, color], i) => {
    const level = r.int(69, 79);
    const positions: Position[] = [
      "LW",
      "C",
      "RW",
      "LW",
      "C",
      "RW",
      "LW",
      "C",
      "RW",
      "LW",
      "C",
      "RW",
      "D",
      "D",
      "D",
      "D",
      "D",
      "D",
      "G",
      "G",
      "LW",
      "C",
      "RW",
      "D",
    ];
    const t: Team = {
      id,
      city,
      name,
      division,
      color,
      conference: i < 16 ? "East" : "West",
      players: positions.map((p, j) => createPlayer(r, `${id}-${j}`, p, level)),
      lines: [],
      defense: [],
      goalie: "",
      tactics: { forecheck: "1-2-2", pace: 50, physical: 50, shooting: 50 },
      record: emptyRecord(),
    };
    autoLines(t);
    return t;
  });
  return {
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
    news: ["Создана новая карьера. База игроков вымышленная."],
    history: [],
    rules: { cap: RULES.defaultSalaryCapMillions },
    language: "ru",
  };
}
export const teamOverall = (t: Team) =>
  Math.round(t.players.reduce((n, p) => n + p.ovr, 0) / t.players.length);
