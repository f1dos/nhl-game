import type { Game, Player, Team } from "./types";
import { AWARDS } from "./awards";
import { textFor } from "./text";

function totals(p: Player, year: number) {
  const regular = p.history.find((h) => h.year === year)?.stats;
  const live = p.stats;
  return {
    gp: (regular?.gp ?? 0) + live.gp,
    minutes: (regular?.toi ?? 0) + live.toi,
    points: (regular?.g ?? 0) + (regular?.a ?? 0) + live.g + live.a,
    shots: (regular?.sa ?? 0) + live.sa,
    allowed: (regular?.ga ?? 0) + live.ga,
    ratings: (regular?.ratingSum ?? 0) + (live.ratingSum ?? 0),
    rated: (regular?.rated ?? 0) + (live.rated ?? 0),
    stars: (regular?.stars ?? 0) + (live.stars ?? 0),
  };
}

/** Freeze the evidence before players age, retire or have their playoff stats cleared. */
export function seasonReviews(g: Game) {
  const year = g.year - 1;
  const t = textFor(g);
  const champion = g.history.find((h) => h.year === year)?.champion;
  const awards = (g.awards ?? []).filter((a) => a.year === year);
  const played = Math.max(...g.teams.map((team) => team.record.gp));
  const leaders = new Set<string>();
  for (const team of g.teams) {
    const entries = team.players.map((p) => ({ p, stats: totals(p, year) }));
    for (const defense of [true, false]) {
      const candidates = entries.filter(
        ({ p, stats }) =>
          p.pos !== "G" && (p.pos === "D") === defense && stats.gp >= 35,
      );
      candidates.sort(
        (a, b) =>
          b.stats.points - a.stats.points || b.stats.stars - a.stats.stars,
      );
      for (const { p } of candidates.slice(0, defense ? 1 : 3))
        leaders.add(p.id);
    }
  }
  return (p: Player, team: Team | undefined, active: boolean) => {
    const s = totals(p, year);
    const goalie = p.pos === "G";
    const workload = s.minutes / Math.max(1, s.gp);
    const avg = s.ratings / Math.max(1, s.rated);
    const scoring = s.points / Math.max(1, s.gp);
    const saves = 1 - s.allowed / Math.max(1, s.shots);
    const sample = goalie ? s.gp >= 22 && s.shots >= 450 : s.gp >= 30;
    const honors = awards.filter((a) => a.playerId === p.id);
    const cupStarter =
      goalie && team?.id === champion && !!champion && p.stats.wins >= 8;
    const strong =
      sample &&
      (goalie
        ? saves >= 0.916
        : scoring >= (p.pos === "D" ? 0.58 : 0.78) ||
          (s.rated >= 30 && avg >= 7.35));
    const star =
      sample &&
      (goalie
        ? saves >= 0.922 && s.gp >= 40
        : leaders.has(p.id) && (strong || s.stars >= 10));
    const regular = goalie
      ? s.gp >= 25 && s.minutes >= 1200
      : s.gp >= 35 && workload >= (p.pos === "D" ? 14 : 11);
    const poor =
      sample &&
      (goalie
        ? saves < 0.89
        : s.rated >= 25 &&
          avg < 6.4 &&
          scoring < (p.pos === "D" ? 0.16 : 0.22));
    const limited =
      played >= 60 &&
      active &&
      (goalie ? s.minutes < 600 : s.gp < 18 || workload < 7);
    const injured = (p.injuryBurden ?? 0) >= 20 || p.injury >= 15;
    const protectedSeason = !!honors.length || cupStarter || strong || star;
    const reason = [
      ...honors.map((a) => AWARDS[a.key][g.language === "ru" ? "ru" : "en"]),
      cupStarter &&
        t("основной вратарь обладателя Кубка", "Cup-winning starting goalie"),
      star
        ? t("лидер команды", "team leader")
        : strong && t("сильный сезон", "strong season"),
      !protectedSeason &&
        poor &&
        t("низкая результативность", "poor season performance"),
      limited && t("мало игрового времени", "limited ice time"),
      injured && t("пропуски из-за травм", "injury absences"),
      !goalie &&
        s.gp > 0 &&
        t(`${workload.toFixed(1)} мин/матч`, `${workload.toFixed(1)} min/game`),
      goalie &&
        s.shots > 0 &&
        t(
          `${(saves * 100).toFixed(1)}% отражённых бросков`,
          `${(saves * 100).toFixed(1)}% saves`,
        ),
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      protectedSeason,
      elite: !!honors.length || cupStarter || star,
      regular,
      poor,
      limited,
      injured,
      reason,
    };
  };
}
