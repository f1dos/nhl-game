import type { StatSnapshot } from "./performance";
import type { Player, Result, Stats, Team } from "./types";

/**
 * Football-manager style match ratings (1–10, 6.0 ≈ an ordinary night) and the
 * hockey "three stars" of the game.
 *
 * Ratings are derived only from what the player did in this match (the stat
 * delta against the pre-game snapshot), so they never use the random stream and
 * never change a result. Each rated game is also accumulated into the player's
 * season line (`ratingSum` / `rated` / `stars`) for averages and awards.
 */

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export interface MatchLine {
  goals: number;
  assists: number;
  shots: number;
  plus: number;
  pim: number;
  toi: number;
  shotsAgainst: number;
  goalsAgainst: number;
  won: boolean;
}

export function skaterRating(line: MatchLine) {
  const shots = Math.min(6, line.shots) * 0.1;
  const usage = clamp((line.toi - 15) * 0.012, -0.12, 0.1);
  return round1(
    clamp(
      6.3 +
        line.goals * 0.85 +
        line.assists * 0.5 +
        shots +
        clamp(line.plus, -4, 4) * 0.28 -
        line.pim * 0.07 +
        (line.won ? 0.2 : -0.15) +
        usage,
      4.0,
      10,
    ),
  );
}

export function goalieRating(line: MatchLine) {
  const saves = line.shotsAgainst - line.goalsAgainst;
  // League-average save percentage: every save above it lifts the rating.
  const aboveExpected = saves - line.shotsAgainst * 0.905;
  const shutout = line.goalsAgainst === 0 && line.shotsAgainst >= 15 ? 0.5 : 0;
  const shelled = Math.max(0, line.goalsAgainst - 3) * 0.2;
  return round1(
    clamp(
      6.5 + aboveExpected * 0.22 + shutout - shelled + (line.won ? 0.3 : -0.2),
      3.0,
      10,
    ),
  );
}

function lineFor(player: Player, before: Stats, won: boolean): MatchLine {
  const s = player.stats;
  return {
    goals: s.g - before.g,
    assists: s.a - before.a,
    shots: s.sog - before.sog,
    plus: s.plus - before.plus,
    pim: s.pim - before.pim,
    toi: s.toi - before.toi,
    shotsAgainst: s.sa - before.sa,
    goalsAgainst: s.ga - before.ga,
    won,
  };
}

/** Rate everyone who appeared, pick the three stars and update season lines. */
export function rateMatch(
  teams: Team[],
  before: StatSnapshot,
  winnerTeamId: string,
  result: Result,
) {
  const rated: { player: Player; rating: number; points: number; won: boolean }[] = [];
  for (const team of teams)
    for (const player of team.players) {
      const old = before[player.id];
      if (!old || player.stats.gp === old.gp) continue;
      const won = team.id === winnerTeamId;
      const line = lineFor(player, old, won);
      const rating = player.pos === "G" ? goalieRating(line) : skaterRating(line);
      rated.push({ player, rating, points: line.goals + line.assists, won });
      player.stats.ratingSum = round1((player.stats.ratingSum ?? 0) + rating);
      player.stats.rated = (player.stats.rated ?? 0) + 1;
    }
  const stars = [...rated]
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        b.points - a.points ||
        Number(b.won) - Number(a.won) ||
        a.player.id.localeCompare(b.player.id),
    )
    .slice(0, 3);
  stars.forEach(({ player }) => (player.stats.stars = (player.stats.stars ?? 0) + 1));
  result.ratings = Object.fromEntries(rated.map((r) => [r.player.id, r.rating]));
  result.stars = stars.map(({ player }) => player.id);
  return result;
}

/** Season average match rating, or undefined before the first rated game. */
export function averageRating(stats: Stats) {
  return stats.rated ? round1((stats.ratingSum ?? 0) / stats.rated) : undefined;
}

/** CSS tone for a rating badge, FM-style: green good, amber average, red poor. */
export function ratingTone(rating: number) {
  return rating >= 7.5 ? "great" : rating >= 6.9 ? "good" : rating >= 6.0 ? "ok" : "poor";
}
