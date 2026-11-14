import type { Team } from "./types";
import { overall } from "./ratings";
export type TrainingPlan = "balanced" | "recovery" | "shooting" | "defense";
export function trainTeam(t: Team) {
  const plan = t.training || "balanced";
  t.trainingTicks = (t.trainingTicks || 0) + 1;
  const recovery = plan === "recovery" ? 14 : plan === "balanced" ? 8 : 5;
  for (const p of t.players) {
    p.fatigue = Math.max(0, p.fatigue - recovery);
    const unavailable = p.injury > 0;
    p.injury = Math.max(0, p.injury - 1);
    if (
      unavailable ||
      t.trainingTicks % 8 !== 0 ||
      p.age >= 29 ||
      p.ovr >= p.potential ||
      plan === "recovery"
    )
      continue;
    const keys =
      p.pos === "G"
        ? ["reflexes", "goaliePosition"]
        : plan === "shooting"
          ? ["accuracy", "shooting"]
          : plan === "defense"
            ? ["defensivePosition", "blocking"]
            : ["passing", "skating"];
    const gain = (p.motivation ?? 50) >= 75 ? 2 : 1;
    for (const key of keys)
      p.attributes[key] = Math.min(99, p.attributes[key] + gain);
    p.ovr = overall(p.pos, p.attributes, p.archetype);
  }
}
export function readiness(t: Team) {
  const ids = new Set([...t.lines.flat(), ...t.defense.flat(), t.goalie]);
  const active = t.players.filter((p) => ids.has(p.id));
  return {
    injured: active.filter((p) => p.injury > 0),
    tired: active.filter((p) => p.fatigue >= 25),
    condition: Math.round(
      active.reduce((n, p) => n + 100 - p.fatigue, 0) /
        Math.max(1, active.length),
    ),
    expiring: t.players.filter((p) => p.years === 1),
  };
}
