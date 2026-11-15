import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const teams = [
  "ANA",
  "BOS",
  "BUF",
  "CAR",
  "CBJ",
  "CGY",
  "CHI",
  "COL",
  "DAL",
  "DET",
  "EDM",
  "FLA",
  "LAK",
  "MIN",
  "MTL",
  "NJD",
  "NSH",
  "NYI",
  "NYR",
  "OTT",
  "PHI",
  "PIT",
  "SEA",
  "SJS",
  "STL",
  "TBL",
  "TOR",
  "UTA",
  "VAN",
  "VGK",
  "WPG",
  "WSH",
];
const seasonStart = new Date("2026-10-01T00:00:00Z");
const fetchJson = (url) =>
  JSON.parse(
    execFileSync("curl", ["-fsSL", "--max-time", "45", url], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    }),
  );
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ageAtSeasonStart = (birthDate) => {
  const born = new Date(`${birthDate}T00:00:00Z`);
  let age = seasonStart.getUTCFullYear() - born.getUTCFullYear();
  if (
    seasonStart.getUTCMonth() < born.getUTCMonth() ||
    (seasonStart.getUTCMonth() === born.getUTCMonth() &&
      seasonStart.getUTCDate() < born.getUTCDate())
  )
    age--;
  return age;
};

const rosters = {};
for (const team of teams) {
  const url = `https://api-web.nhle.com/v1/roster/${team}/current`;
  const data = fetchJson(url);
  rosters[team] = [...data.forwards, ...data.defensemen, ...data.goalies].map(
    (player) => ({
      id: player.id,
      firstName: player.firstName.default,
      lastName: player.lastName.default,
      number: player.sweaterNumber ?? 0,
      position:
        { L: "LW", R: "RW" }[player.positionCode] ?? player.positionCode,
      age: ageAtSeasonStart(player.birthDate),
      nation: player.birthCountry,
      birthDate: player.birthDate,
      headshot: player.headshot,
    }),
  );
  if (rosters[team].length < 20)
    throw new Error(`${team}: incomplete roster (${rosters[team].length})`);
  if (
    rosters[team].some(
      (player) =>
        !["LW", "C", "RW", "D", "G"].includes(player.position) ||
        !player.firstName ||
        !player.lastName,
    )
  )
    throw new Error(`${team}: invalid player identity record`);
}

const allIds = Object.values(rosters).flatMap((roster) =>
  roster.map((player) => player.id),
);
if (new Set(allIds).size !== allIds.length)
  throw new Error("Duplicate NHL player ID across roster snapshot");

const statsUrl = (position, season) =>
  `https://api.nhle.com/stats/rest/en/${position}/summary?isAggregate=false&isGame=false&start=0&limit=-1&cayenneExp=seasonId=${season}%20and%20gameTypeId=2`;
const currentSkaters = fetchJson(statsUrl("skater", 20262027)).data;
const previousSkaters = fetchJson(statsUrl("skater", 20252026)).data;
const currentGoalies = fetchJson(statsUrl("goalie", 20262027)).data;
const previousGoalies = fetchJson(statsUrl("goalie", 20252026)).data;
const byId = (rows) => new Map(rows.map((row) => [row.playerId, row]));
const currentSkaterById = byId(currentSkaters);
const previousSkaterById = byId(previousSkaters);
const currentGoalieById = byId(currentGoalies);
const previousGoalieById = byId(previousGoalies);
const rosterPlayers = Object.values(rosters).flat();

const skaterScore = (player) => {
  const current = currentSkaterById.get(player.id);
  const previous = previousSkaterById.get(player.id);
  const gp = (current?.gamesPlayed ?? 0) + (previous?.gamesPlayed ?? 0) * 0.32;
  const points = (current?.points ?? 0) + (previous?.points ?? 0) * 0.32;
  const goals = (current?.goals ?? 0) + (previous?.goals ?? 0) * 0.32;
  const plusMinus =
    (current?.plusMinus ?? 0) + (previous?.plusMinus ?? 0) * 0.2;
  const ppg = (points + 2.5) / (gp + 8);
  const gpg = (goals + 0.8) / (gp + 8);
  const toiSeconds =
    current?.timeOnIcePerGame ?? previous?.timeOnIcePerGame ?? 720;
  const toi = clamp((toiSeconds / 60 - 10) / 16, 0, 1);
  const impact = clamp(0.5 + plusMinus / Math.max(20, gp) / 1.4, 0, 1);
  const score =
    player.position === "D"
      ? ppg * 0.62 + gpg * 0.06 + toi * 0.23 + impact * 0.09
      : ppg * 0.72 + gpg * 0.14 + toi * 0.08 + impact * 0.06;
  return { score, gp: Math.round(gp), points: Math.round(points * 10) / 10 };
};

const goalieScore = (player) => {
  const current = currentGoalieById.get(player.id);
  const previous = previousGoalieById.get(player.id);
  const gp = (current?.gamesPlayed ?? 0) + (previous?.gamesPlayed ?? 0) * 0.32;
  const saves = (current?.saves ?? 0) + (previous?.saves ?? 0) * 0.32;
  const shots =
    (current?.shotsAgainst ?? 0) + (previous?.shotsAgainst ?? 0) * 0.32;
  const wins = (current?.wins ?? 0) + (previous?.wins ?? 0) * 0.32;
  const savePct = (saves + 0.905 * 180) / (shots + 180);
  const winPct = (wins + 2) / (gp + 5);
  const sampleConfidence = clamp(gp / 24, 0.25, 1);
  const score =
    (savePct * 8 + clamp(winPct, 0.2, 0.8) * 0.35) * sampleConfidence +
    (0.908 * 8 + 0.5 * 0.35) * (1 - sampleConfidence);
  return {
    score,
    gp: Math.round(gp),
    savePct: Math.round(savePct * 1000) / 1000,
  };
};

const ratingRows = rosterPlayers.map((player) => ({
  player,
  ...(player.position === "G" ? goalieScore(player) : skaterScore(player)),
}));
const groups = {
  forward: ratingRows.filter(
    (row) => !["D", "G"].includes(row.player.position),
  ),
  defense: ratingRows.filter((row) => row.player.position === "D"),
  goalie: ratingRows.filter((row) => row.player.position === "G"),
};
const playerRatings = {};
for (const [group, rows] of Object.entries(groups)) {
  rows.sort((a, b) => b.score - a.score || a.player.id - b.player.id);
  rows.forEach((row, index) => {
    const percentile = rows.length === 1 ? 0 : index / (rows.length - 1);
    const ceiling = group === "forward" ? 96 : group === "defense" ? 94 : 93;
    let ovr = Math.round(60 + (ceiling - 60) * (1 - Math.sqrt(percentile)));
    if (row.gp < 8) ovr -= group === "goalie" ? 4 : 3;
    else if (row.gp < 16) ovr -= 2;
    if (row.player.id === 8478402) ovr = 97;
    playerRatings[row.player.id] = {
      ovr,
      rank: index + 1,
      group,
      score: Math.round(row.score * 10000) / 10000,
      gp: row.gp,
      ...(group === "goalie"
        ? { savePct: row.savePct }
        : { points: row.points }),
    };
  });
}

const standings = fetchJson("https://api-web.nhle.com/v1/standings/now");
const standingRows = standings.standings
  .map((row) => ({
    team: row.teamAbbrev.default,
    gamesPlayed: row.gamesPlayed,
    pointPct: row.pointPctg,
    goalDifferential: row.goalDifferential,
    l10PointPct: row.l10Points / Math.max(2, row.l10GamesPlayed * 2),
  }))
  .sort(
    (a, b) =>
      b.pointPct - a.pointPct ||
      b.goalDifferential - a.goalDifferential ||
      a.team.localeCompare(b.team),
  );
const teamRatings = Object.fromEntries(
  standingRows.map((row, index) => [
    row.team,
    {
      overall: Math.round(92 - index * (17 / 31)),
      rank: index + 1,
      ...row,
    },
  ]),
);
if (playerRatings[8478402]?.ovr !== 97)
  throw new Error("Connor McDavid must be the top-rated player");
if (teamRatings.CAR?.rank !== 1 || teamRatings.CAR?.overall !== 92)
  throw new Error("Carolina Hurricanes must be the top-rated team");

const payload = `// Generated by scripts/sync-nhl-data.mjs. Do not edit manually.
// Identity, roster and statistics facts: NHL public API. Game ratings are derived by the documented model.
export const NHL_DATA_META = ${JSON.stringify(
  {
    season: "2026/27",
    fetchedAt: new Date().toISOString(),
    source: "https://api-web.nhle.com/v1/roster/{team}/current",
    statsSource: "https://api.nhle.com/stats/rest/en/{position}/summary",
    standingsSource: "https://api-web.nhle.com/v1/standings/now",
    ratingModel: "nhl-stats-v1",
    disclaimer:
      "Game OVR is a deterministic model derived from NHL statistics; contracts remain fictional.",
  },
  null,
  2,
)} as const;

export interface NhlRosterIdentity {
  id: number;
  firstName: string;
  lastName: string;
  number: number;
  position: "LW" | "C" | "RW" | "D" | "G";
  age: number;
  nation: string;
  birthDate: string;
  headshot: string;
}

export const NHL_ROSTERS: Record<string, NhlRosterIdentity[]> = ${JSON.stringify(rosters, null, 2)};

export interface NhlPlayerRating {
  ovr: number;
  rank: number;
  group: "forward" | "defense" | "goalie";
  score: number;
  gp: number;
  points?: number;
  savePct?: number;
}

export const NHL_PLAYER_RATINGS: Record<number, NhlPlayerRating> = ${JSON.stringify(playerRatings, null, 2)};

export interface NhlTeamRating {
  overall: number;
  rank: number;
  team: string;
  gamesPlayed: number;
  pointPct: number;
  goalDifferential: number;
  l10PointPct: number;
}

export const NHL_TEAM_RATINGS: Record<string, NhlTeamRating> = ${JSON.stringify(teamRatings, null, 2)};

export const NHL_TEAM_LOGOS: Record<string, string> = ${JSON.stringify(
  Object.fromEntries(
    teams.map((team) => [
      team,
      `https://assets.nhle.com/logos/nhl/svg/${team}_light.svg`,
    ]),
  ),
  null,
  2,
)};
`;

const output = path.resolve("src/data/nhl-2026-27.ts");
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, payload);
console.log(
  `Wrote ${output}: ${Object.values(rosters).reduce((sum, roster) => sum + roster.length, 0)} players across ${teams.length} teams.`,
);
