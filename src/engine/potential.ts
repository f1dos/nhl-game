import type { Game, Player, Position } from "./types";
import { clamp } from "./random";

/**
 * Potential model. `player.potential` is the hidden true ceiling the engine
 * develops toward; the UI shows a scouted range around it (see
 * `scoutedPotential`). Bump POTENTIAL_MODEL to recompute old saves on load.
 */
export const POTENTIAL_MODEL = 2;

/** FNV-1a, stable across runs and platforms. */
export function stableHash(value: string) {
  let result = 2166136261;
  for (const char of value)
    result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

/** Deterministic value in [0, 1). */
export const hashUnit = (value: string) => stableHash(value) / 4294967296;

/** Deterministic, roughly bell-shaped value in [-1, 1]. */
const hashBell = (value: string) =>
  (hashUnit(`${value}:a`) + hashUnit(`${value}:b`) + hashUnit(`${value}:c`)) /
    1.5 -
  1;

/** Goalies mature about two years later than skaters. */
export const developmentAge = (age: number, pos: Position) =>
  pos === "G" ? age - 2 : age;

/** Typical remaining growth (OVR points) for an average player of this age. */
export function expectedHeadroom(age: number, pos: Position) {
  const a = developmentAge(age, pos);
  if (a <= 17) return 15;
  const table: Record<number, number> = {
    18: 15,
    19: 13,
    20: 11,
    21: 9,
    22: 6.5,
    23: 4.5,
    24: 3,
    25: 1.8,
    26: 0.8,
  };
  return table[a] ?? 0;
}

/** Largest gap between POT and OVR that still makes sense at this age. */
export function maxHeadroom(age: number, pos: Position) {
  const a = developmentAge(age, pos);
  if (a <= 21) return 30;
  if (a <= 24) return 18;
  if (a <= 26) return 8;
  if (a <= 28) return 3;
  return 1;
}

/** Average OVR of a player in each competition; used for "production for age". */
function tierMean(league?: string) {
  switch (league) {
    case "NHL":
      return 71;
    case "AHL":
      return 63;
    case "OHL":
    case "WHL":
    case "USHL":
    case "QMJHL":
    case "draft":
      return 56;
    case "SHL":
    case "Liiga":
    case "KHL":
    case "NL":
    case "DEL":
    case "Czech":
      return 67;
    default:
      return 64;
  }
}

/** Being drafted early is a signal on top of current ability. */
function pedigreeBonus(pick?: number) {
  if (!pick) return 0;
  if (pick <= 5) return 4;
  if (pick <= 15) return 2.5;
  if (pick <= 32) return 1.5;
  if (pick <= 64) return 0.5;
  if (pick > 128) return -1.5;
  return 0;
}

export interface PotentialInputs {
  /** Overrides `player.league` for the age/production comparison. */
  league?: string;
  /** Statistical rank inside the player's group, when known. */
  ratingRank?: number;
}

/** OVR without short-term form (hot/cold streak) adjustments. */
export const baseOverall = (player: Player) =>
  player.ovr - (player.formAdjustment ?? 0);

/**
 * True potential from age, position, production for age, pedigree and a
 * deterministic per-player variance. Always >= OVR, <= 99.
 */
export function computePotential(player: Player, inputs: PotentialInputs = {}) {
  const ovr = baseOverall(player);
  const age = player.age;
  const youth = clamp((25 - developmentAge(age, player.pos)) / 7, 0, 1);
  let headroom = expectedHeadroom(age, player.pos);
  const mean = tierMean(inputs.league ?? player.league);
  // Strong for the level at a young age means a higher ceiling.
  headroom += clamp((ovr - mean) * 0.2, -3, 3) * youth;
  headroom += pedigreeBonus(player.draftOverall) * youth;
  const rank = inputs.ratingRank ?? player.ratingRank;
  if (rank && rank <= 60) headroom += 1.5 * youth;
  // Per-player spread: wide for teenagers, narrow for players near peak.
  const spread = 1 + headroom * 0.3;
  headroom += hashBell(`pot:${player.id}`) * spread;
  // A few high-variance kids get a much higher ceiling.
  if (youth > 0.4 && hashUnit(`pot-tail:${player.id}`) < 0.06)
    headroom += 4 + Math.round(hashUnit(`pot-tail2:${player.id}`) * 3);
  // Room shrinks near the top of the scale.
  headroom *= clamp((99 - ovr) / 30, 0.2, 1);
  const floor = developmentAge(age, player.pos) <= 21 ? 2 : 0;
  headroom = clamp(headroom, floor, maxHeadroom(age, player.pos));
  return clamp(Math.round(ovr + headroom), Math.min(99, player.ovr), 99);
}

export function assignPotential(player: Player, inputs?: PotentialInputs) {
  player.potential = computePotential(player, inputs);
  return player.potential;
}

/** Keeps the POT >= OVR invariant after any OVR change. */
export function enforcePotentialFloor(player: Player) {
  if (!Number.isFinite(player.potential) || player.potential < player.ovr)
    player.potential = Math.min(99, player.ovr);
}

/**
 * Yearly revision after development: late bloomers and busts, plus caps
 * the gap for players past their development window.
 * `form` is the season development modifier (-3..+1).
 */
export function revisePotential(player: Player, year: number, form = 0, seasonDelta = 0) {
  const before = player.potential;
  let potential = before;
  const a = developmentAge(player.age, player.pos);
  if (a <= 24) {
    const roll = hashUnit(`pot-rev:${player.id}:${year}`);
    const size = 2 + Math.floor(hashUnit(`pot-size:${player.id}:${year}`) * 4);
    const bloom = 0.07 + Math.max(0, form) * 0.05;
    const bust = 0.07 + Math.max(0, -form) * 0.04;
    if (roll < bloom) potential += size;
    else if (roll > 1 - bust) potential -= size;
    else if (form > 0 && roll < 0.35) potential += 1;
    else if (form < 0 && roll > 0.65) potential -= 1;
  }
  if (seasonDelta < 0) {
    potential = Math.min(potential, before - Math.min(3, -seasonDelta));
  } else if (seasonDelta > 0 && a <= 27 && (form > 0 || before - player.ovr <= 2)) {
    potential = Math.max(potential, before + Math.min(2, Math.ceil(seasonDelta / 2)));
  }
  potential = clamp(
    potential,
    Math.min(99, player.ovr),
    Math.min(99, player.ovr + maxHeadroom(player.age, player.pos)),
  );
  player.potential = Math.round(potential);
  return player.potential - before;
}

/** Every player object the engine tracks (deduplicated). */
export function allPlayers(g: Game): Player[] {
  const seen = new Set<Player>();
  const add = (p?: Player) => p && seen.add(p);
  for (const team of g.teams)
    for (const p of [
      ...team.players,
      ...(team.farm ?? []),
      ...(team.prospects ?? []),
    ])
      add(p);
  (g.freeAgents ?? []).forEach(add);
  (g.juniorPlayers ?? []).forEach(add);
  (g.internationalMarket ?? []).forEach((entry) => add(entry.player));
  (g.draft?.prospects ?? []).forEach((entry) => add(entry.player));
  return [...seen];
}

/**
 * Recomputes potentials with the current model. Idempotent; run on load.
 * Returns true when the game was changed.
 */
export function ensurePotentialModel(g: Game) {
  let changed = false;
  for (const p of allPlayers(g))
    if (!Number.isFinite(p.potential) || p.potential < p.ovr) {
      enforcePotentialFloor(p);
      changed = true;
    }
  if (g.potentialModel === POTENTIAL_MODEL) return changed;
  for (const team of g.teams) {
    for (const p of team.players) assignPotential(p, { league: "NHL" });
    for (const p of team.farm ?? []) assignPotential(p, { league: p.league ?? "AHL" });
    for (const p of team.prospects ?? []) assignPotential(p);
  }
  for (const p of g.freeAgents ?? []) assignPotential(p);
  for (const p of g.juniorPlayers ?? []) assignPotential(p);
  for (const entry of g.internationalMarket ?? []) assignPotential(entry.player);
  if (g.draft) {
    for (const prospect of g.draft.prospects)
      assignPotential(prospect.player, { league: "draft" });
    if (g.draft.status === "scouting") rankDraftClass(g.draft.prospects);
    for (const prospect of g.draft.prospects) {
      const report = g.draft.reports[prospect.player.id];
      if (!report) continue;
      report.estimatedPotential = estimatePotential(
        prospect.player.potential,
        prospect.player.id,
        report.confidence,
      );
    }
  }
  g.potentialModel = POTENTIAL_MODEL;
  return true;
}

/**
 * A scout's POT estimate: noisy, and pulled toward an average prospect
 * (72) when little is known, so a thin report never promises a superstar.
 */
export function estimatePotential(
  truth: number,
  id: string,
  confidence: number,
) {
  const spread = Math.max(1, Math.round((100 - confidence) / 12));
  const error = (stableHash(`${id}-2`) % (spread * 2 + 1)) - spread;
  const trust = 0.5 + clamp(confidence, 0, 100) / 200;
  return clamp(Math.round(truth * trust + 72 * (1 - trust)) + error, 40, 99);
}

export function rankDraftClass(
  prospects: { player: Player; trueRank: number }[],
) {
  prospects.sort(
    (a, b) =>
      b.player.potential * 0.68 +
        b.player.ovr * 0.32 -
        (a.player.potential * 0.68 + a.player.ovr * 0.32) ||
      a.player.id.localeCompare(b.player.id),
  );
  prospects.forEach((p, i) => (p.trueRank = i + 1));
}

/* ------------------------------------------------------------------ */
/* What the user is allowed to see                                     */
/* ------------------------------------------------------------------ */

/** 0–100: how well the user's staff knows this player. */
export function potentialKnowledge(g: Game | undefined, player: Player) {
  if (!g) return 50;
  const own = g.teams.find((team) => team.id === g.user);
  if (own) {
    if (own.players.some((p) => p.id === player.id)) return 90;
    if ((own.farm ?? []).some((p) => p.id === player.id)) return 82;
    if ((own.prospects ?? []).some((p) => p.id === player.id)) return 78;
  }
  const report = g.draft?.reports[player.id];
  if (report) return report.confidence;
  const intl = g.internationalMarket?.find(
    (entry) => entry.player.id === player.id,
  );
  if (intl) return clamp(intl.scouted, 10, 95);
  if (g.teams.some((team) => team.players.some((p) => p.id === player.id)))
    return 62;
  if (g.teams.some((team) => (team.farm ?? []).some((p) => p.id === player.id)))
    return 45;
  return 35;
}

export interface ScoutedPotential {
  low: number;
  high: number;
  /** Midpoint used for stars and sorting. */
  mid: number;
  stars: number;
  /** True when the range has collapsed to a single number. */
  exact: boolean;
}

/** Star rating (0.5–5, half steps) for a potential value. */
export function potentialStars(value: number) {
  return clamp(Math.round(((value - 56) / 8) * 2) / 2, 0.5, 5);
}

/**
 * The range the user's staff reports. Width grows with youth and shrinks
 * with knowledge; the true value always lies inside it.
 */
export function scoutedPotential(
  player: Player,
  knowledge: number,
  salt = "",
): ScoutedPotential {
  const truth = Math.max(player.potential, player.ovr);
  const a = developmentAge(player.age, player.pos);
  const ageFactor = a <= 21 ? 1 : a <= 24 ? 0.7 : a <= 26 ? 0.4 : 0.1;
  const half = Math.round(((100 - clamp(knowledge, 0, 100)) / 12) * ageFactor);
  const offset = half
    ? Math.round(hashBell(`scout:${player.id}:${salt}`) * half * 0.7)
    : 0;
  const low = clamp(truth - half + offset, Math.min(99, player.ovr), 99);
  const high = clamp(truth + half + offset, low, 99);
  const lo = Math.min(low, truth);
  const hi = Math.max(high, truth);
  const mid = Math.round((lo + hi) / 2);
  return { low: lo, high: hi, mid, stars: potentialStars(mid), exact: lo === hi };
}

/** Range from a draft scouting report (its estimate can still be off). */
export function reportPotential(report: {
  confidence: number;
  estimatedPotential: number;
  estimatedOvr?: number;
}, knownOverall = report.estimatedOvr ?? 40): ScoutedPotential {
  const spread = Math.max(1, Math.ceil((100 - report.confidence) / 12));
  const low = clamp(report.estimatedPotential - spread, Math.min(99, knownOverall), 99);
  const high = clamp(report.estimatedPotential + spread, low, 99);
  const mid = Math.round((low + high) / 2);
  return { low, high, mid, stars: potentialStars(mid), exact: low === high };
}

export function scoutedPotentialFor(g: Game | undefined, player: Player) {
  const report = g?.draft?.reports[player.id];
  const prospect = g?.draft?.prospects.find((p) => p.player.id === player.id);
  if (report && prospect && !prospect.draftedBy) return reportPotential(report, player.ovr);
  return scoutedPotential(player, potentialKnowledge(g, player), g?.user ?? "");
}

export const formatPotential = (s: ScoutedPotential) =>
  s.exact ? `${s.low}` : `${s.low}–${s.high}`;
