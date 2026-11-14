import type { Player, Tactics } from "./types";

export function lineChemistry(players: Player[]) {
  if (!players.length) return 0;
  const average = (key: string) =>
    players.reduce((n, p) => n + p.attributes[key], 0) / players.length;
  const roles = new Set(players.map((p) => p.archetype).filter(Boolean)).size;
  const fatigue = players.reduce((n, p) => n + p.fatigue, 0) / players.length;
  return Math.round(
    Math.max(
      1,
      Math.min(
        100,
        average("teamwork") * 0.48 +
          average("decisions") * 0.34 +
          average("consistency") * 0.18 +
          Math.min(6, roles * 2) -
          fatigue * 0.15,
      ),
    ),
  );
}

export function tacticalAssessment(t: Tactics) {
  const forecheck =
    t.forecheck === "2-1-2" ? 8 : t.forecheck === "1-3-1" ? -5 : 1;
  return {
    possession: Math.round(
      Math.max(0, Math.min(100, 50 + forecheck + (t.pace - 50) * 0.18)),
    ),
    chanceVolume: Math.round(
      Math.max(
        0,
        Math.min(100, 45 + (t.shooting - 50) * 0.45 + (t.pace - 50) * 0.12),
      ),
    ),
    defensiveStability: Math.round(
      Math.max(
        0,
        Math.min(
          100,
          54 -
            (t.pace - 50) * 0.2 +
            (t.forecheck === "1-3-1" ? 12 : t.forecheck === "2-1-2" ? -7 : 2),
        ),
      ),
    ),
    penaltyRisk: Math.round(
      Math.max(
        0,
        Math.min(
          100,
          20 + t.physical * 0.55 + (t.forecheck === "2-1-2" ? 6 : 0),
        ),
      ),
    ),
  };
}
