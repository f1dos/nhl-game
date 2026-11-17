import type { IceTimePlan, IceTimePreset, Player, Team } from "./types";
import { ensureSpecialTeams } from "./tactics";

/** Even-strength shares per forward line (L1–L4) and defence pair (P1–P3). */
export const ICE_TIME_PRESETS: Record<
  Exclude<IceTimePreset, "custom">,
  { forwards: number[]; defense: number[] }
> = {
  // Matches the even-strength split the event engine produced before
  // ice time became configurable.
  balanced: { forwards: [34, 29, 20, 17], defense: [34, 33, 33] },
  top: { forwards: [40, 30, 18, 12], defense: [42, 34, 24] },
  roll: { forwards: [26, 25, 25, 24], defense: [34, 33, 33] },
  short: { forwards: [37, 35, 28, 0], defense: [45, 40, 15] },
};

export const DEFAULT_SHIFT_SECONDS = 40;
/** A unit cannot take more than every other shift. */
export const MAX_SHARE = 50;

/** Typical minutes per game by strength state, used for the TOI forecast. */
export const STATE_MINUTES = { even: 46, powerPlay: 6, penaltyKill: 6 };

/** Per-game TOI above which a skater wears down over a game. */
export const OVERLOAD_MINUTES = { F: 21, D: 26 };

export function isIceTimePlan(value: unknown): value is IceTimePlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as IceTimePlan;
  const shares = (list: unknown, n: number) =>
    Array.isArray(list) &&
    list.length === n &&
    list.every((v) => Number.isFinite(v) && v >= 0 && v <= 100) &&
    list.some((v) => v > 0);
  return (
    shares(plan.forwards, 4) &&
    shares(plan.defense, 3) &&
    (plan.preset === undefined ||
      ["balanced", "top", "roll", "short", "custom"].includes(plan.preset)) &&
    (plan.doubleShift === undefined || typeof plan.doubleShift === "string")
  );
}

/** Percent shares that sum to 100 with no unit above MAX_SHARE. */
export function normalizeShares(weights: number[]) {
  let shares = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  if (!shares.some((w) => w > 0)) shares = shares.map(() => 1);
  const cap = Math.max(MAX_SHARE, 100 / shares.length);
  for (let pass = 0; pass < shares.length; pass++) {
    const total = shares.reduce((a, b) => a + b, 0);
    shares = shares.map((w) => (w / total) * 100);
    const over = shares.filter((s) => s > cap + 1e-9);
    if (!over.length) break;
    const free = shares.filter((s) => s < cap - 1e-9 && s > 0);
    const excess = over.reduce((a, s) => a + s - cap, 0);
    const freeTotal = free.reduce((a, b) => a + b, 0);
    shares = shares.map((s) =>
      s > cap
        ? cap
        : s > 0 && s < cap && freeTotal
          ? s + (excess * s) / freeTotal
          : s,
    );
  }
  return shares;
}

const average = (players: (Player | undefined)[]) => {
  const list = players.filter((p): p is Player => !!p);
  return list.length ? list.reduce((n, p) => n + p.ovr, 0) / list.length : 0;
};

/**
 * Preset for a club without an explicit plan. A clear gap between the top
 * line and the depth means riding the stars; an even roster rolls four lines.
 */
export function autoIceTimePreset(team: Team): Exclude<IceTimePreset, "custom"> {
  const byId = (id: string) => team.players.find((p) => p.id === id);
  const lines = team.lines.map((line) => average(line.map(byId)));
  const gap = lines[0] - (lines[2] + lines[3]) / 2;
  if (gap >= 9) return "top";
  if (gap <= 4) return "roll";
  return "balanced";
}

/**
 * The plan the engines use. Managed clubs without a saved plan keep the
 * historical rotation; AI clubs (which have an AI profile) pick a preset
 * from their depth.
 */
export function resolveIceTime(team: Team): IceTimePlan {
  const saved = team.tactics.iceTime;
  if (saved && isIceTimePlan(saved)) return saved;
  const preset = team.aiProfile ? autoIceTimePreset(team) : "balanced";
  return { preset, ...structuredClone(ICE_TIME_PRESETS[preset]) };
}

export function shiftLength(team: Team) {
  return team.tactics.shiftSeconds ?? DEFAULT_SHIFT_SECONDS;
}

/**
 * Deterministic deficit scheduler: the unit furthest behind its target gets
 * the next shift, and no unit goes twice in a row. `credit` is the time
 * each unit has already played.
 */
export function pickNextUnit(
  shares: number[],
  credit: number[],
  previous: number,
) {
  const total = credit.reduce((a, b) => a + b, 0);
  let best = -1,
    bestDeficit = -Infinity;
  shares.forEach((share, i) => {
    if (share <= 0 || (i === previous && shares.filter((s) => s > 0).length > 1))
      return;
    // One shift ahead: the share each unit should have after the next shift.
    const deficit = (share / 100) * (total + 1) - credit[i];
    if (deficit > bestDeficit + 1e-9) {
      best = i;
      bestDeficit = deficit;
    }
  });
  return best < 0 ? Math.max(0, previous) : best;
}

const sequences = new Map<string, number[]>();
/** Unit for the n-th equal-length shift; a pure function of the index. */
export function unitForShift(weights: number[], index: number) {
  const shares = normalizeShares(weights);
  const key = shares.map((s) => s.toFixed(3)).join("/");
  let seq = sequences.get(key);
  if (!seq) {
    seq = [];
    sequences.set(key, seq);
  }
  if (seq.length <= index) {
    const credit = shares.map(() => 0);
    seq.forEach((u) => credit[u]++);
    while (seq.length <= index) {
      const unit = pickNextUnit(shares, credit, seq[seq.length - 1] ?? -1);
      seq.push(unit);
      credit[unit]++;
    }
  }
  return seq[Math.max(0, index)];
}

/** Forward line with the double-shifting player swapped in on the 4th line. */
export function lineWithDoubleShift(team: Team, lineIndex: number, plan: IceTimePlan) {
  const line = [...team.lines[lineIndex]];
  const star = plan.doubleShift;
  if (lineIndex !== 3 || !star || line.includes(star)) return line;
  const player = team.players.find((p) => p.id === star);
  if (!player || player.pos === "D" || player.pos === "G" || player.injury) return line;
  const byId = (id: string) => team.players.find((p) => p.id === id);
  let slot = line.findIndex((id) => byId(id)?.pos === player.pos);
  if (slot < 0) slot = 0;
  line[slot] = star;
  return line;
}

export interface IceTimeForecast {
  id: string;
  minutes: number;
  even: number;
  powerPlay: number;
  penaltyKill: number;
  overload: boolean;
  tired: boolean;
}

/** Expected minutes per game for each dressed skater under the plan. */
export function forecastIceTime(team: Team, plan = resolveIceTime(team)) {
  const forwards = normalizeShares(plan.forwards);
  const defense = normalizeShares(plan.defense);
  const rows = new Map<string, IceTimeForecast>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { id, minutes: 0, even: 0, powerPlay: 0, penaltyKill: 0, overload: false, tired: false };
      rows.set(id, r);
    }
    return r;
  };
  const even = STATE_MINUTES.even;
  team.lines.forEach((_, i) =>
    lineWithDoubleShift(team, i, plan).forEach((id) => {
      row(id).even += (even * forwards[i]) / 100;
    }),
  );
  team.lines.flat().forEach((id) => row(id));
  team.defense.forEach((pair, i) =>
    pair.forEach((id) => {
      row(id).even += (even * defense[i]) / 100;
    }),
  );
  const units = ensureSpecialTeams(team);
  units["5v4"]?.players.forEach((id) => (row(id).powerPlay += STATE_MINUTES.powerPlay));
  units["4v5"]?.players.forEach((id) => (row(id).penaltyKill += STATE_MINUTES.penaltyKill));
  for (const r of rows.values()) {
    const p = team.players.find((x) => x.id === r.id);
    r.minutes = r.even + r.powerPlay + r.penaltyKill;
    const limit = p?.pos === "D" ? OVERLOAD_MINUTES.D : OVERLOAD_MINUTES.F;
    r.overload = r.minutes > limit;
    r.tired = !!p && p.fatigue >= 25 && r.minutes > limit - 4;
  }
  return rows;
}

/**
 * In-game wear (fatigue points) from minutes already played: nothing for a
 * normal workload, growing quickly past it. Long shifts tire players more.
 */
export function inGameWear(minutes: number, pos: string, shiftSeconds = DEFAULT_SHIFT_SECONDS) {
  const free = pos === "D" ? 17 : 14;
  const excess = Math.max(0, minutes - free);
  const shift = 1 + Math.max(-0.25, (shiftSeconds - DEFAULT_SHIFT_SECONDS) / 50);
  return (excess + excess * excess * 0.08) * shift;
}

/** Fatigue carried out of a game by an overloaded skater, on top of the base. */
export function overloadFatigue(minutes: number, pos: string) {
  const limit = pos === "D" ? OVERLOAD_MINUTES.D : OVERLOAD_MINUTES.F;
  return Math.max(0, minutes - limit + 2) * 0.8;
}
