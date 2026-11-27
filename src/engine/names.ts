import { regenSurnames } from "./regenSurnames";
/**
 * Nationality-aware name and hometown generation for game-generated people
 * (draft prospects, staff). Everything here is a pure function of a string
 * seed, so it never consumes the simulation's random stream.
 */

export function seeded(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = <T>(list: readonly T[], seed: string) => list[seeded(seed) % list.length];

const FIRST_NAMES: Record<string, string[]> = {
  CAN: ["Liam", "Owen", "Carter", "Brayden", "Logan", "Ethan", "Nolan", "Connor", "Tyson", "Cole", "Mason", "Jack", "Ryan", "Evan", "Dylan", "Brody", "Jaxon", "Hunter", "Mathieu", "Gabriel", "Samuel", "Olivier", "Zach", "Easton", "Cameron", "Gavin", "Riley", "Landon"],
  USA: ["Jack", "Cole", "Gavin", "Ryan", "Will", "Charlie", "Sam", "Ben", "Brady", "Tyler", "Luke", "Danny", "Cooper", "Matt", "Nick", "Drew", "Chase", "Logan", "Wyatt", "Caden", "Trevor", "Max", "Aidan", "Mikey", "Quinn", "Patrick", "Kyle", "Colin"],
  SWE: ["Oskar", "Elias", "Viktor", "Axel", "Isak", "Hugo", "Lucas", "Emil", "Filip", "Albin", "Linus", "Anton", "Måns", "Noah", "Theo", "Rasmus", "Jesper", "Gustav", "Ludvig", "Melvin", "Leo", "William"],
  FIN: ["Aleksi", "Eetu", "Joonas", "Kasper", "Ville", "Onni", "Aatu", "Niko", "Juho", "Leevi", "Konsta", "Otto", "Veeti", "Eemeli", "Topi", "Arttu", "Lauri", "Rasmus", "Jere", "Miro", "Atte", "Iiro"],
  CZE: ["Jakub", "Matěj", "Ondřej", "Tomáš", "Adam", "Filip", "Vojtěch", "David", "Lukáš", "Jan", "Dominik", "Šimon", "Michal", "Martin", "Daniel", "Petr", "Jiří", "Eduard"],
  SVK: ["Juraj", "Šimon", "Dalibor", "Martin", "Samuel", "Adam", "Filip", "Tomáš", "Matúš", "Marek", "Peter", "Michal", "Lukáš", "Dávid"],
  RUS: ["Ivan", "Matvei", "Artem", "Kirill", "Daniil", "Nikita", "Egor", "Maksim", "Dmitri", "Alexander", "Ilya", "Mikhail", "Sergei", "Yaroslav", "Timur", "Gleb", "Arseni", "Fyodor", "Vladislav", "Semyon"],
  BLR: ["Aliaksei", "Dzmitry", "Ivan", "Pavel", "Yahor", "Maksim", "Artsiom", "Vadim"],
  GER: ["Lukas", "Moritz", "Leon", "Jonas", "Tim", "Nico", "Felix", "Julian", "Maximilian", "Paul", "Niklas", "Elias"],
  SUI: ["Luca", "Noah", "Nico", "Janis", "Timo", "Gaëtan", "Lian", "Kevin", "Dario", "Yannick"],
  LAT: ["Rūdolfs", "Kristers", "Artūrs", "Eduards", "Dans", "Roberts"],
  NOR: ["Mats", "Andreas", "Sander", "Magnus", "Jonas", "Tobias"],
  DEN: ["Nikolaj", "Frederik", "Oliver", "Mads", "Jonas", "Lasse"],
  AUT: ["Marco", "Thomas", "Vinzenz", "David", "Lukas", "Benjamin"],
  KAZ: ["Nikita", "Yerlan", "Damir", "Artur", "Ilyas"],
  SLO: ["Anže", "Jan", "Žiga", "Rok", "Luka"],
};

export const NATION_LABEL: Record<string, { ru: string; en: string; flag: string }> = {
  CAN: { ru: "Канада", en: "Canada", flag: "🇨🇦" },
  USA: { ru: "США", en: "USA", flag: "🇺🇸" },
  SWE: { ru: "Швеция", en: "Sweden", flag: "🇸🇪" },
  FIN: { ru: "Финляндия", en: "Finland", flag: "🇫🇮" },
  CZE: { ru: "Чехия", en: "Czechia", flag: "🇨🇿" },
  SVK: { ru: "Словакия", en: "Slovakia", flag: "🇸🇰" },
  RUS: { ru: "Россия", en: "Russia", flag: "🇷🇺" },
  BLR: { ru: "Беларусь", en: "Belarus", flag: "🇧🇾" },
  GER: { ru: "Германия", en: "Germany", flag: "🇩🇪" },
  DEU: { ru: "Германия", en: "Germany", flag: "🇩🇪" },
  SUI: { ru: "Швейцария", en: "Switzerland", flag: "🇨🇭" },
  CHE: { ru: "Швейцария", en: "Switzerland", flag: "🇨🇭" },
  LAT: { ru: "Латвия", en: "Latvia", flag: "🇱🇻" },
  NOR: { ru: "Норвегия", en: "Norway", flag: "🇳🇴" },
  DEN: { ru: "Дания", en: "Denmark", flag: "🇩🇰" },
  AUT: { ru: "Австрия", en: "Austria", flag: "🇦🇹" },
  KAZ: { ru: "Казахстан", en: "Kazakhstan", flag: "🇰🇿" },
  SLO: { ru: "Словения", en: "Slovenia", flag: "🇸🇮" },
};

/** Aliases used by the league feeds (ISO-2 and odd spellings). */
const NATION_ALIAS: Record<string, string> = {
  SE: "SWE", FI: "FIN", US: "USA", CA: "CAN", NO: "NOR", CZ: "CZE", SK: "SVK",
  SI: "SLO", DK: "DEN", LV: "LAT", CH: "SUI", DE: "GER", DEU: "GER", CHE: "SUI",
  RU: "RUS", BY: "BLR", AT: "AUT", KZ: "KAZ",
};

export function normalizeNation(nation: string | undefined, fallback = "CAN") {
  const raw = (nation ?? "").trim().toUpperCase();
  if (!raw || raw === "—" || raw === "INT" || raw.includes("вЂ")) return fallback;
  return NATION_ALIAS[raw] ?? raw;
}

export function flagOf(nation: string) {
  return NATION_LABEL[normalizeNation(nation, nation)]?.flag ?? "🏒";
}

/** A first + last name typical for the nationality; stable for a seed. */
export function nationalName(nation: string, seed: string, usedSurnames?: Set<string>) {
  const code = normalizeNation(nation);
  const first = FIRST_NAMES[code] ?? FIRST_NAMES.CAN;
  const last = regenSurnames[code] ?? regenSurnames.CAN;
  const start = seeded(`${seed}:l`) % last.length;
  let family = last[start];
  if (usedSurnames) {
    for (let offset = 1; offset < last.length && usedSurnames.has(family); offset++)
      family = last[(start + offset) % last.length];
    usedSurnames.add(family);
  }
  return `${pick(first, `${seed}:f`)} ${family}`;
}

export const KNOWN_NAME_NATIONS = Object.keys(FIRST_NAMES);

/** Hometown: `region` is a state/province code or a country region. */
export interface Hometown {
  city: string;
  region: string;
  country: string;
  /** NHL club of the hometown market, when there is one. */
  club?: string;
}

type Town = [city: string, region: string, club?: string];
const TOWNS: Record<string, Town[]> = {
  CAN: [
    ["Toronto", "ON", "TOR"], ["Mississauga", "ON", "TOR"], ["Ottawa", "ON", "OTT"], ["Kingston", "ON", "OTT"],
    ["London", "ON"], ["Sudbury", "ON"], ["Barrie", "ON", "TOR"], ["Hamilton", "ON", "TOR"],
    ["Montréal", "QC", "MTL"], ["Québec City", "QC", "MTL"], ["Laval", "QC", "MTL"],
    ["Edmonton", "AB", "EDM"], ["Red Deer", "AB"], ["Calgary", "AB", "CGY"], ["Lethbridge", "AB", "CGY"],
    ["Vancouver", "BC", "VAN"], ["Kelowna", "BC", "VAN"], ["Victoria", "BC", "VAN"],
    ["Winnipeg", "MB", "WPG"], ["Brandon", "MB", "WPG"], ["Regina", "SK"], ["Saskatoon", "SK"],
    ["Halifax", "NS"], ["Moncton", "NB"], ["St. John's", "NL"],
  ],
  USA: [
    ["Boston", "MA", "BOS"], ["Worcester", "MA", "BOS"], ["Buffalo", "NY", "BUF"], ["Rochester", "NY", "BUF"],
    ["Long Island", "NY", "NYI"], ["New York", "NY", "NYR"], ["Detroit", "MI", "DET"], ["Grand Rapids", "MI", "DET"],
    ["Pittsburgh", "PA", "PIT"], ["Philadelphia", "PA", "PHI"], ["Newark", "NJ", "NJD"], ["Raleigh", "NC", "CAR"],
    ["Columbus", "OH", "CBJ"], ["Cleveland", "OH", "CBJ"], ["Washington", "DC", "WSH"], ["Baltimore", "MD", "WSH"],
    ["Chicago", "IL", "CHI"], ["Denver", "CO", "COL"], ["Dallas", "TX", "DAL"], ["Austin", "TX", "DAL"],
    ["St. Paul", "MN", "MIN"], ["Duluth", "MN", "MIN"], ["Edina", "MN", "MIN"], ["Nashville", "TN", "NSH"],
    ["St. Louis", "MO", "STL"], ["Salt Lake City", "UT", "UTA"], ["Los Angeles", "CA", "LAK"], ["Anaheim", "CA", "ANA"],
    ["San Jose", "CA", "SJS"], ["Seattle", "WA", "SEA"], ["Las Vegas", "NV", "VGK"], ["Tampa", "FL", "TBL"],
    ["Fort Lauderdale", "FL", "FLA"], ["Madison", "WI"], ["Fargo", "ND"], ["Anchorage", "AK"],
  ],
  SWE: [["Stockholm", "Stockholm"], ["Göteborg", "Västra Götaland"], ["Malmö", "Skåne"], ["Luleå", "Norrbotten"], ["Örnsköldsvik", "Västernorrland"], ["Växjö", "Kronoberg"]],
  FIN: [["Helsinki", "Uusimaa"], ["Tampere", "Pirkanmaa"], ["Turku", "Varsinais-Suomi"], ["Oulu", "Pohjois-Pohjanmaa"], ["Jyväskylä", "Keski-Suomi"], ["Lahti", "Päijät-Häme"]],
  CZE: [["Praha", "Praha"], ["Brno", "Jihomoravský"], ["Plzeň", "Plzeňský"], ["Pardubice", "Pardubický"], ["Třinec", "Moravskoslezský"]],
  SVK: [["Bratislava", "Bratislavský"], ["Košice", "Košický"], ["Nitra", "Nitriansky"], ["Trenčín", "Trenčiansky"]],
  RUS: [["Moscow", "Moscow"], ["St. Petersburg", "St. Petersburg"], ["Yaroslavl", "Yaroslavl"], ["Kazan", "Tatarstan"], ["Chelyabinsk", "Chelyabinsk"], ["Omsk", "Omsk"], ["Ufa", "Bashkortostan"]],
  BLR: [["Minsk", "Minsk"], ["Hrodna", "Hrodna"]],
  GER: [["Mannheim", "Baden-Württemberg"], ["Köln", "NRW"], ["München", "Bayern"], ["Berlin", "Berlin"]],
  SUI: [["Zürich", "Zürich"], ["Bern", "Bern"], ["Davos", "Graubünden"], ["Lugano", "Ticino"]],
};

/** Hometown typical for a nation; `pool` narrows the region (e.g. a league). */
export function nationalHometown(nation: string, seed: string, regions?: string[]): Hometown {
  const code = normalizeNation(nation);
  const all = TOWNS[code];
  if (!all) return { city: NATION_LABEL[code]?.en ?? code, region: code, country: code };
  const pool = regions ? all.filter((t) => regions.includes(t[1])) : all;
  const [city, region, club] = pick(pool.length ? pool : all, `${seed}:town`);
  return { city, region, country: code, club };
}

/** Typical hometown regions for players of a North American junior league. */
export const LEAGUE_REGIONS: Record<string, { nation: string; regions?: string[] }[]> = {
  OHL: [{ nation: "CAN", regions: ["ON"] }, { nation: "CAN", regions: ["ON"] }, { nation: "CAN", regions: ["ON", "QC"] }, { nation: "USA", regions: ["MI", "NY", "PA", "OH"] }],
  WHL: [{ nation: "CAN", regions: ["AB", "BC", "SK", "MB"] }, { nation: "CAN", regions: ["AB", "BC"] }, { nation: "USA", regions: ["WA", "ND", "MN", "CO"] }],
  USHL: [{ nation: "USA", regions: ["MN", "MI", "IL", "MA", "NY", "WI", "ND"] }, { nation: "USA" }, { nation: "USA", regions: ["MN", "MA", "MI"] }, { nation: "CAN", regions: ["ON", "BC", "AB"] }],
  QMJHL: [{ nation: "CAN", regions: ["QC", "NS", "NB"] }],
};
