import { textFor } from "./text";
import { overall } from "./ratings";
import { clamp } from "./random";
import type { Player, Stats, Team } from "./types";
import { enforcePotentialFloor } from "./potential";

export type StatSnapshot = Record<string, Stats>;

export function snapshotStats(teams: Team[]): StatSnapshot {
  return Object.fromEntries(
    teams.flatMap((team) =>
      team.players.map((p) => [p.id, { ...p.stats }] as const),
    ),
  );
}

function shiftOverall(player: Player, delta: number) {
  if (!delta) return;
  for (const key of Object.keys(player.attributes))
    player.attributes[key] = clamp(player.attributes[key] + delta, 30, 99);
  player.ovr = overall(player.pos, player.attributes, player.archetype);
  enforcePotentialFloor(player);
}

export function recordPlayerPerformance(player: Player, score: number) {
  const form = clamp(
    (player.performanceForm ?? 0) * 0.72 + score * 0.28,
    -60,
    60,
  );
  const injuryPenalty = player.injury >= 10 ? 1 : 0;
  const desired = clamp(Math.round(form / 18) - injuryPenalty, -3, 3);
  const previous = player.formAdjustment ?? 0;
  shiftOverall(player, desired - previous);
  player.performanceForm = Math.round(form * 10) / 10;
  player.formAdjustment = desired;
  return desired - previous;
}

export function updateMatchPerformance(
  teams: Team[],
  before: StatSnapshot,
  winnerTeamId: string,
) {
  for (const team of teams)
    for (const player of team.players) {
      const old = before[player.id];
      if (!old || player.stats.gp === old.gp) continue;
      const won = team.id === winnerTeamId ? 1 : 0;
      let score: number;
      if (player.pos === "G") {
        const shots = player.stats.sa - old.sa;
        const goals = player.stats.ga - old.ga;
        const savePct = shots ? (shots - goals) / shots : 0.88;
        score = (savePct - 0.9) * 260 + won * 10 - goals * 1.5;
      } else {
        const goals = player.stats.g - old.g;
        const assists = player.stats.a - old.a;
        const plus = player.stats.plus - old.plus;
        const shots = player.stats.sog - old.sog;
        score =
          goals * 18 +
          assists * 11 +
          plus * 4 +
          shots * 1.2 +
          (won ? 4 : -4) -
          6;
      }
      if (player.injury > 0) score -= Math.min(24, player.injury * 2);
      recordPlayerPerformance(player, clamp(score, -45, 45));
    }
}

/** Removes short-term form, then returns the season-long development modifier. */
export function prepareAnnualDevelopment(player: Player, language?: string) {
  const t = textFor({ language });
  shiftOverall(player, -(player.formAdjustment ?? 0));
  player.formAdjustment = 0;
  const form = player.performanceForm ?? 0;
  const burden = player.injuryBurden ?? 0;
  const performance = form >= 25 ? 1 : form <= -25 ? -1 : 0;
  const injuries = burden >= 50 ? -2 : burden >= 20 ? -1 : 0;
  return {
    modifier: performance + injuries,
    reason: [
      performance > 0
        ? t("сильный сезон", "strong season")
        : performance < 0
          ? t("слабый сезон", "weak season")
          : t("стабильный сезон", "steady season"),
      injuries
        ? t(`травмы ${injuries}`, `injuries ${injuries}`)
        : t("без серьёзного влияния травм", "no significant injury impact"),
    ].join("; "),
  };
}
