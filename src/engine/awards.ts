import { averageRating } from "./matchRatings";
import type { Game, Player, Stats, Team } from "./types";

/**
 * Individual NHL-style season awards, decided by the game's own numbers.
 *
 * Statistical trophies (Art Ross, Rocket Richard) follow the real definitions.
 * Voted trophies (Hart, Vezina, Norris, Calder, Conn Smythe) are modelled from
 * match ratings plus production, the way a football-manager game decides its
 * player-of-the-season awards. Real pre-game NHL experience is not in the data,
 * so Calder eligibility is approximated (see `isRookie`).
 */
export type AwardKey =
  | "hart"
  | "art-ross"
  | "rocket-richard"
  | "vezina"
  | "norris"
  | "calder"
  | "conn-smythe";

export interface SeasonAward {
  year: number;
  key: AwardKey;
  playerId: string;
  player: string;
  team: string;
  pos: Player["pos"];
  /** Short statistical line shown with the award. */
  line: string;
}

export const AWARDS: Record<
  AwardKey,
  { ru: string; en: string; aboutRu: string; aboutEn: string }
> = {
  hart: {
    ru: "Hart Trophy",
    en: "Hart Trophy",
    aboutRu: "Самый ценный игрок сезона",
    aboutEn: "Most valuable player",
  },
  "art-ross": {
    ru: "Art Ross Trophy",
    en: "Art Ross Trophy",
    aboutRu: "Лучший бомбардир",
    aboutEn: "Scoring leader",
  },
  "rocket-richard": {
    ru: "Maurice Richard Trophy",
    en: "Maurice Richard Trophy",
    aboutRu: "Лучший снайпер",
    aboutEn: "Goal-scoring leader",
  },
  vezina: {
    ru: "Vezina Trophy",
    en: "Vezina Trophy",
    aboutRu: "Лучший вратарь",
    aboutEn: "Best goaltender",
  },
  norris: {
    ru: "James Norris Trophy",
    en: "James Norris Trophy",
    aboutRu: "Лучший защитник",
    aboutEn: "Best defenceman",
  },
  calder: {
    ru: "Calder Trophy",
    en: "Calder Trophy",
    aboutRu: "Лучший новичок",
    aboutEn: "Best rookie",
  },
  "conn-smythe": {
    ru: "Conn Smythe Trophy",
    en: "Conn Smythe Trophy",
    aboutRu: "Самый ценный игрок плей-офф",
    aboutEn: "Playoff MVP",
  },
};

export const REGULAR_AWARDS: AwardKey[] = [
  "hart",
  "art-ross",
  "rocket-richard",
  "vezina",
  "norris",
  "calder",
];

interface Entry {
  player: Player;
  team: Team;
  stats: Stats;
}

const pts = (s: Stats) => s.g + s.a;
const avg = (s: Stats) => averageRating(s) ?? 6.0;
const savePct = (s: Stats) => (s.sa ? (s.sa - s.ga) / s.sa : 0);
const gaa = (s: Stats) => (s.toi ? (s.ga * 60) / s.toi : 0);

export function statLine(key: AwardKey, s: Stats, pos: Player["pos"]) {
  const rating = averageRating(s);
  const rt = rating !== undefined ? ` · ${rating.toFixed(1)}` : "";
  if (pos === "G")
    return `${s.gp} GP · ${s.wins} W · ${(savePct(s) * 100).toFixed(1)} SV% · ${gaa(s).toFixed(2)} GAA${rt}`;
  if (key === "rocket-richard") return `${s.g} G · ${s.gp} GP`;
  return `${pts(s)} PTS (${s.g} G, ${s.a} A) · ${s.gp} GP${rt}`;
}

/**
 * Rookie approximation. The imported data has no career NHL games, so in a
 * player's first season in this career only players aged 20 or younger count.
 * Once the game has recorded a season for him, a rookie is anyone aged 23 or
 * younger who has never played 25+ games in a season of this career.
 */
export function isRookie(player: Player, year: number) {
  const earlier = player.history.filter((h) => h.year < year);
  if (!earlier.length) return player.age <= 20;
  return player.age <= 23 && !earlier.some((h) => h.stats.gp >= 25);
}

/** Value over an ordinary (6.0) performer across the whole season. */
const value = (s: Stats) => (avg(s) - 6) * s.gp;

function score(key: AwardKey, e: Entry, champion?: string) {
  const s = e.stats;
  const goalie = e.player.pos === "G";
  switch (key) {
    case "art-ross":
      return pts(s) * 1000 + s.g * 10 - s.gp * 0.01;
    case "rocket-richard":
      return s.g * 1000 + pts(s) - s.gp * 0.01;
    case "vezina":
      return (savePct(s) - 0.9) * 600 + value(s) * 0.2 + s.wins * 0.1;
    case "conn-smythe":
      return (
        (goalie ? value(s) + (savePct(s) - 0.9) * 60 : value(s) + pts(s) * 0.5) +
        (e.team.id === champion ? 4 : 0)
      );
    default: // hart, norris, calder: season-long impact plus production
      return goalie ? value(s) + s.wins * 0.2 : value(s) + pts(s) * 0.3;
  }
}

function entries(g: Game, statsOf: (p: Player) => Stats | undefined): Entry[] {
  return g.teams.flatMap((team) =>
    team.players.flatMap((player) => {
      const stats = statsOf(player);
      return stats ? [{ player, team, stats }] : [];
    }),
  );
}

function eligible(key: AwardKey, e: Entry, minGames: number, year: number) {
  const goalie = e.player.pos === "G";
  if (key === "vezina") return goalie && e.stats.gp >= Math.ceil(minGames * 0.6);
  if (key === "norris") return e.player.pos === "D" && e.stats.gp >= minGames;
  if (key === "art-ross" || key === "rocket-richard") return !goalie && e.stats.gp > 0;
  if (key === "calder")
    return isRookie(e.player, year) && e.stats.gp >= (goalie ? Math.ceil(minGames * 0.6) : minGames);
  if (key === "conn-smythe") return e.stats.gp >= minGames;
  return e.stats.gp >= (goalie ? Math.ceil(minGames * 0.6) : minGames);
}

/**
 * Leading candidates for a regular-season award from the current statistics.
 * Used both for the live award race and for the final decision.
 */
export function awardRace(g: Game, key: AwardKey, limit = 3, statsOf = (p: Player) => p.stats) {
  const season = Math.max(1, ...g.teams.map((t) => t.record.gp));
  const minGames = Math.max(1, Math.ceil(season * 0.5));
  return entries(g, statsOf)
    .filter((e) => eligible(key, e, minGames, g.year))
    .sort((a, b) => score(key, b) - score(key, a) || a.player.id.localeCompare(b.player.id))
    .slice(0, limit)
    .map((e) => ({ ...e, line: statLine(key, e.stats, e.player.pos) }));
}

function toAward(g: Game, key: AwardKey, e: Entry & { line: string }): SeasonAward {
  return {
    year: g.year,
    key,
    playerId: e.player.id,
    player: e.player.name,
    team: e.team.id,
    pos: e.player.pos,
    line: e.line,
  };
}

function announce(g: Game, awards: SeasonAward[]) {
  g.awards = [...(g.awards ?? []).filter((a) => !awards.some((n) => n.year === a.year && n.key === a.key)), ...awards];
  for (const award of awards) {
    const name = AWARDS[award.key];
    g.news.unshift(`${name.ru}: ${award.player} (${award.team}) — ${name.aboutRu.toLowerCase()}.`);
    if (award.team === g.user && g.calendar) {
      g.events ??= [];
      const id = `${g.calendar.date}-league-award-${award.key}-${award.year}`;
      if (!g.events.some((event) => event.id === id))
        g.events.unshift({
          id,
          date: g.calendar.date,
          category: "league",
          priority: "high",
          title: `${award.player} получает ${name.ru}`,
          body: `${name.aboutRu} сезона ${award.year}/${String(award.year + 1).slice(2)}: ${award.line}. Признание поднимает настроение раздевалки.`,
          teamId: award.team,
          playerId: award.playerId,
          read: false,
          resolved: false,
        });
      const player = g.teams.find((t) => t.id === award.team)?.players.find((p) => p.id === award.playerId);
      if (player) player.morale = Math.min(100, player.morale + 5);
    }
  }
  g.news = g.news.slice(0, 100);
}

/** Decide the regular-season awards. Call before regular-season stats are archived. */
export function decideRegularSeasonAwards(g: Game) {
  const awards = REGULAR_AWARDS.flatMap((key) => {
    const [winner] = awardRace(g, key, 1);
    return winner ? [toAward(g, key, winner)] : [];
  });
  announce(g, awards);
  return awards;
}

/** Decide the Conn Smythe from playoff statistics once the Cup is won. */
export function decideConnSmythe(g: Game, champion: string, finalist?: string) {
  const contenders = entries(g, (p) => p.stats).filter(
    (e) => (e.team.id === champion || e.team.id === finalist) && e.stats.gp >= 4,
  );
  const [best] = contenders.sort(
    (a, b) =>
      score("conn-smythe", b, champion) - score("conn-smythe", a, champion) ||
      a.player.id.localeCompare(b.player.id),
  );
  if (!best) return undefined;
  const award = toAward(g, "conn-smythe", { ...best, line: statLine("conn-smythe", best.stats, best.player.pos) });
  announce(g, [award]);
  return award;
}
