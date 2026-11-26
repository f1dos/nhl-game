import type { Result, Team } from "./types";

export type Forecheck = Team["tactics"]["forecheck"];
export type LineStyle = "cycle" | "skill" | "balanced";
export type AttackPlan = "auto" | "wide" | "slot" | "high";
export interface ShiftReport {
  plan?: AttackPlan;
  opponentLine?: number;
  events: number[];
  side: number;
  line: number;
  start: number;
  end: number;
  forecheck: Forecheck;
  recoveries: number;
  exitsAgainst: number;
  shots: number;
  against: number;
  xg: number;
}
export interface LineMatchup {
  home: number;
  away: number;
  seconds: number;
  shots: [number, number];
  goals: [number, number];
}
export interface ScoutFrame {
  puck: number[];
  home: number[][];
  away: number[][];
}
export interface ScoutExample {
  score: number[];
  teammates: string[];
  film?: ScoutFrame[];
  time: number;
  player: string;
  id: string;
  xg: number;
  goal: boolean;
}
export interface ScoutGame {
  opponent: string;
  examples: ScoutExample[];
}
export function scoutGame(result: Result, club: string): ScoutGame {
  return {
    opponent: club === result.home ? result.away : result.home,
    examples: result.events
      .filter(
        (e) =>
          e.team === club &&
          (e.type === "goal" || e.type === "shot") &&
          e.playerId,
      )
      .map((e) => ({
        time: e.time,
        id: e.playerId!,
        player: e.player,
        xg: e.xg ?? 0,
        goal: e.type === "goal",
        score: e.score,
        film: e.scoutFilm,
        teammates: e.skaters?.[result.home === club ? 0 : 1] ?? [],
      })),
  };
}
export function rememberOpponent(team: Team, result: Result) {
  team.scoutGames = [
    ...(team.scoutGames ?? []),
    scoutGame(result, team.id),
  ].slice(-5);
}
export function scoutBrief(team: Team) {
  const available = team.players.filter(
    (p) => !p.injury && p.pos !== "G" && team.lines.flat().includes(p.id),
  );
  const samples = (team.scoutGames ?? []).flatMap((g) =>
    g.examples.map((e) => ({ ...e, opponent: g.opponent })),
  );
  const weight = (id: string) =>
    samples.filter((e) => e.id === id).reduce((n, e) => n + e.xg, 0);
  const target = available.sort(
    (a, b) =>
      weight(b.id) - weight(a.id) ||
      b.attributes.accuracy - a.attributes.accuracy,
  )[0];
  return (
    target && {
      target,
      games: team.scoutGames?.length ?? 0,
      examples: samples
        .filter((e) => e.id === target.id)
        .sort((a, b) => Number(!!b.film) - Number(!!a.film) || b.xg - a.xg)
        .slice(0, 2),
    }
  );
}
export function lineStyle(team: Team, line: number): LineStyle {
  const group =
    team.lines[line]
      ?.map((id) => team.players.find((p) => p.id === id))
      .filter((p) => !!p) ?? [];
  const difference =
    group.reduce(
      (sum, p) =>
        sum +
        (p.attributes.passing +
          p.attributes.puckControl -
          (p.attributes.checking + p.attributes.strength)) /
          2,
      0,
    ) / Math.max(1, group.length);
  return difference > 3 ? "skill" : difference < -2 ? "cycle" : "balanced";
}
