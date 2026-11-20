import type { Team, TrainingSchedule, TrainingSession } from "./types";
import { overall } from "./ratings";
import { developmentAge, enforcePotentialFloor } from "./potential";
import {
  coachBoost,
  conditioningRelief,
  doctorExtraHeal,
  physioRecovery,
} from "./staff";
export type TrainingPlan = "balanced" | "recovery" | "shooting" | "defense";

export const balancedWeek: TrainingSchedule = {
  intensity: "normal",
  days: [
    { morning: "recovery", afternoon: "tactical" },
    { morning: "offense", afternoon: "skills" },
    { morning: "defense", afternoon: "teamwork" },
    { morning: "conditioning", afternoon: "tactical" },
    { morning: "skills", afternoon: "goalie" },
    { morning: "recovery", afternoon: "teamwork" },
    { morning: "rest", afternoon: "rest" },
  ],
};

export function ensureTrainingSchedule(team: Team) {
  team.trainingSchedule ??= structuredClone(balancedWeek);
  return team.trainingSchedule;
}

/** Fatigue removed by one session (negative adds fatigue). */
export const recoveryValue: Record<TrainingSession, number> = {
  rest: 8,
  recovery: 7,
  teamwork: 3,
  tactical: 3,
  offense: 2,
  defense: 2,
  skills: 1,
  goalie: 2,
  conditioning: -2,
};

/** Attributes a session develops on a development tick. */
export const skillFocus: Partial<Record<TrainingSession, string[]>> = {
  teamwork: ["teamwork", "passing"],
  tactical: ["decisions", "offensivePosition", "defensivePosition"],
  offense: ["shooting", "accuracy", "puckControl"],
  defense: ["defensivePosition", "blocking", "checking"],
  skills: ["skating", "passing", "puckControl"],
  goalie: ["reflexes", "goaliePosition", "reboundControl"],
  conditioning: ["stamina", "strength", "durability"],
};

export function trainingLoad(team: Team) {
  const schedule = ensureTrainingSchedule(team);
  const sessions = schedule.days.flatMap((day) => [day.morning, day.afternoon]);
  const demanding = sessions.filter(
    (session) => recoveryValue[session] <= 2,
  ).length;
  const recovery = sessions.filter((session) =>
    ["rest", "recovery"].includes(session),
  ).length;
  const intensity =
    schedule.intensity === "high" ? 20 : schedule.intensity === "low" ? -12 : 0;
  return Math.max(
    0,
    Math.min(100, 38 + demanding * 5 - recovery * 4 + intensity),
  );
}

export function trainTeam(team: Team) {
  const schedule = ensureTrainingSchedule(team);
  team.trainingTicks = (team.trainingTicks || 0) + 1;
  const day = schedule.days[(team.trainingTicks - 1) % 7];
  const sessions = [day.morning, day.afternoon];
  const intensityAdjustment =
    schedule.intensity === "low" ? 4 : schedule.intensity === "high" ? -4 : 0;
  const relief = sessions.includes("conditioning") ? conditioningRelief(team) : 0;
  const recovery =
    sessions.reduce((sum, session) => sum + recoveryValue[session], 0) +
    intensityAdjustment +
    (team.staff ? physioRecovery(team) + relief : 0);
  const extraHeal = !!team.staff && doctorExtraHeal(team, team.trainingTicks);
  const boosts = sessions.map((session) =>
    team.staff ? coachBoost(team, session) : { extraKeys: 0, extraGain: 0 },
  );
  const extraKeys = Math.max(...boosts.map((b) => b.extraKeys));
  const extraGain = Math.max(...boosts.map((b) => b.extraGain));
  const lineup = new Set([
    ...team.lines.flat(),
    ...team.defense.flat(),
    team.goalie,
  ]);
  const developmentTick = Math.floor(team.trainingTicks / 6);
  for (const player of team.players) {
    player.fatigue = Math.max(0, Math.min(100, player.fatigue - recovery));
    const unavailable = player.injury > 0;
    player.injury = Math.max(0, player.injury - (extraHeal ? 2 : 1));
    if (unavailable && player.injury === 0) {
      player.injuryStatus = undefined;
      player.injuryReason = undefined;
      player.injuryTimeline = undefined;
      player.injuryReturnDate = undefined;
      player.injuryReport = undefined;
      player.injurySource = undefined;
    }
    if (
      unavailable ||
      team.trainingTicks % 6 !== 0 ||
      player.age >= 31 ||
      player.ovr >= player.potential ||
      (player.morale ?? 50) < 35 ||
      developmentTick % developmentEvery(player, lineup.has(player.id)) !== 0
    )
      continue;
    const focuses = sessions.flatMap((session) => skillFocus[session] ?? []);
    const keys =
      player.pos === "G"
        ? focuses.filter((key) =>
            [
              "reflexes",
              "goaliePosition",
              "reboundControl",
              "stamina",
              "durability",
            ].includes(key),
          )
        : focuses.filter(
            (key) =>
              !["reflexes", "goaliePosition", "reboundControl"].includes(key),
          );
    const gain =
      (schedule.intensity === "high" && (player.motivation ?? 50) >= 70
        ? 2
        : 1) + extraGain;
    for (const key of [...new Set(keys)].slice(0, 3 + extraKeys))
      player.attributes[key] = Math.min(99, player.attributes[key] + gain);
    player.ovr = overall(player.pos, player.attributes, player.archetype);
    enforcePotentialFloor(player);
  }
}

/**
 * Development days between attribute gains: teenagers and young regulars
 * grow on every one, scratches and players near their peak less often.
 */
export function developmentEvery(
  player: { age: number; pos: import("./types").Position },
  playing: boolean,
) {
  const a = developmentAge(player.age, player.pos);
  const base = a <= 23 ? 1 : a <= 27 ? 2 : 3;
  return playing || a > 23 ? base : base + 1;
}

export function readiness(team: Team) {
  const ids = new Set([
    ...team.lines.flat(),
    ...team.defense.flat(),
    team.goalie,
  ]);
  const active = team.players.filter((player) => ids.has(player.id));
  return {
    injured: active.filter((player) => player.injury > 0),
    tired: active.filter((player) => player.fatigue >= 25),
    condition: Math.round(
      active.reduce((sum, player) => sum + 100 - player.fatigue, 0) /
        Math.max(1, active.length),
    ),
    expiring: team.players.filter((player) => player.years === 1),
  };
}
