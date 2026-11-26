import { rosterCharge } from "./cap";
import type { Game, Player, Position } from "./types";
import { RNG, clamp } from "./random";
import { overall } from "./ratings";
import { createPlayer } from "./database";
import { emptyStats } from "./types";
import { prepareAnnualDevelopment } from "./performance";
import { tx } from "./text";
import {
  assignPotential,
  developmentAge,
  hashUnit,
  revisePotential,
} from "./potential";
import type { Team } from "./types";

interface DevelopmentContext {
  kind: "nhl" | "farm" | "prospect" | "free-agent";
  team?: Team;
}

/** Share of a full season's development the player's minutes allow. */
export function annualGamesPlayed(p: Player, season: number) {
  return p.stats.gp + (p.history.find((h) => h.year === season)?.stats.gp ?? 0);
}
function iceTimeFactor(p: Player, context: DevelopmentContext, season: number) {
  if (context.kind === "free-agent") return 0.35;
  if (context.kind !== "nhl") {
    // Junior and affiliate minutes vary. Only a minority of prospects
    // develop as quickly as established NHL regulars.
    return 0.30 + 0.65 * hashUnit(`development-opportunity:${p.id}`);
  }
  const gp = annualGamesPlayed(p, season);
  return gp >= 60 ? 1.15 : gp >= 30 ? 1 : gp >= 10 ? 0.9 : 0.8;
}

/** Age at which this player starts to decline (30–33, goalies a year later). */
export function declineAge(p: Player) {
  return (
    30 + Math.floor(hashUnit(`decline:${p.id}`) * 4) + (p.pos === "G" ? 1 : 0)
  );
}

/**
 * Yearly OVR change. Young players close a share of the gap to POT
 * (faster with minutes, intense training and good morale); veterans
 * decline from 30–33 at a per-player rate.
 */
export function annualGrowth(
  p: Player,
  modifier: number,
  iceTime: number,
  team: Team | undefined,
  r: RNG,
) {
  const a = developmentAge(p.age, p.pos);
  const gap = Math.max(0, p.potential - p.ovr);
  const start = declineAge(p);
  if (p.age >= start) {
    const years = p.age - start + 1;
    const pace = 0.7 + hashUnit(`decline-rate:${p.id}`) * 0.6;
    const decline = Math.round((0.5 + years * 0.35) * pace + r.next() * 0.8);
    return clamp(-decline + Math.max(0, modifier), -6, 0);
  }
  // Prime years: small swings; a good season can still add a point.
  if (a > 26) return clamp(r.int(-1, 1) + modifier, -3, gap);
  const rate = a <= 20 ? 0.24 : a <= 23 ? 0.22 : 0.16;
  const intensity = team?.trainingSchedule?.intensity;
  const training = intensity === "high" ? 0.1 : intensity === "low" ? -0.1 : 0;
  const morale = p.morale >= 75 ? 0.1 : p.morale <= 40 ? -0.15 : 0;
  const expected = gap * rate * (iceTime + training + morale) + modifier;
  return clamp(Math.round(expected + (r.next() - 0.5) * 1.5), -3, gap);
}
export function ageWorld(g: Game, r: RNG) {
  g.freeAgents ??= [];
  g.retired ??= [];
  const age = (p: Player, context: DevelopmentContext) => {
    const before = p.ovr;
    const potentialBefore = p.potential;
    const season = prepareAnnualDevelopment(p, g.language);
    const iceTime = iceTimeFactor(p, context, g.year - 1);
    p.age++;
    const trained = Math.max(0, p.ovr - (p.trainingStartOverall ?? p.ovr));
    const growth = annualGrowth(p, season.modifier, iceTime, context.team, r);
    // Do not award the same development twice in the season and at rollover.
    const remaining = growth > 0 ? Math.max(0, growth - trained) : growth;
    p.trainingStartOverall = undefined;
    for (const key of Object.keys(p.attributes))
      p.attributes[key] = clamp(p.attributes[key] + remaining, 30, 99);
    p.ovr = overall(p.pos, p.attributes, p.archetype);
    p.potential = Math.max(p.potential, Math.min(99, p.ovr));
    revisePotential(p, g.year, season.modifier);
    (p.developmentLog ??= []).unshift({
      year: g.year,
      delta: p.ovr - before,
      reason: season.reason,
      ovrBefore: before,
      ovrAfter: p.ovr,
      ...(p.potential !== potentialBefore
        ? { potentialDelta: p.potential - potentialBefore }
        : {}),
    });
    p.developmentLog = p.developmentLog.slice(0, 8);
    p.stats = emptyStats();
    p.fatigue = 0;
    p.injury = 0;
    p.morale = 75;
    p.performanceForm = 0;
    p.injuryBurden = 0;
    p.motivation = clamp((p.motivation ?? 50) * 0.6 + 20, 20, 80);
  };
  const retired = (p: Player) =>
    p.age >= 40 || (p.age >= 36 && r.next() < 0.12 + (p.age - 36) * 0.08);
  const priorFreeAgents = [...g.freeAgents];
  for (const t of g.teams) {
    t.players.forEach((p) => age(p, { kind: "nhl", team: t }));
    const retiring = t.players.filter(retired);
    g.retired.push(...retiring.map((player) => ({ year: g.year, player })));
    t.players = t.players.filter((p) => !retiring.includes(p));
    t.farm ??= [];
    t.farm.forEach((p) => age(p, { kind: "farm", team: t }));
    const farmRetiring = t.farm.filter(retired);
    g.retired.push(...farmRetiring.map((player) => ({ year: g.year, player })));
    t.farm = t.farm.filter((p) => !farmRetiring.includes(p));
    t.prospects ??= [];
    t.prospects.forEach((p) => age(p, { kind: "prospect", team: t }));
    const promoted: Player[] = [];
    for (const p of [...t.prospects].sort((a, b) => b.ovr - a.ovr)) {
      const payroll = rosterCharge(t.players);
      if (
        p.ovr >= 74 &&
        t.players.length < 30 &&
        payroll + 0.8 <= g.rules.cap
      ) {
        p.salary = 0.8;
        p.years = 4;
        p.contractSource = "generated";
        p.contractExpiryYear = g.year + 4;
        p.contractStatus = p.age < 27 ? "RFA" : "UFA";
        p.contractRemainingValue = 3.2;
        t.players.push(p);
        promoted.push(p);
      } else if (
        p.age >= 20 &&
        p.age < 23 &&
        t.farm.filter((x) => x.years > 1).length < 26
      ) {
        p.contractType = "ELC";
        p.contractSource = "generated";
        p.salary = 0.8;
        p.years = 3;
        p.contractExpiryYear = g.year + 3;
        p.contractRemainingValue = 2.4;
        p.contractStatus = "RFA";
        t.farm.push(p);
        promoted.push(p);
      }
    }
    t.prospects = t.prospects.filter((p) => !promoted.includes(p));
    const released = t.prospects.filter((p) => p.age >= 23);
    for (const p of released) {
      p.salary = 0;
      p.years = 0;
      p.contractRemainingValue = 0;
      g.freeAgents.push(p);
    }
    t.prospects = t.prospects.filter((p) => !released.includes(p));
  }
  priorFreeAgents.forEach((p) => age(p, { kind: "free-agent" }));
  const retiring = g.freeAgents.filter(retired);
  g.retired.push(...retiring.map((player) => ({ year: g.year, player })));
  g.freeAgents = g.freeAgents.filter((p) => !retiring.includes(p));
  for (const player of g.juniorPlayers ?? []) age(player, { kind: "prospect" });
  g.juniorPlayers = (g.juniorPlayers ?? []).filter((p) => p.age <= 20);
  // Undrafted and overage players keep the open market supplied. Drafted players
  // now develop separately inside each club's prospect pipeline.
  const positions: Position[] = ["LW", "C", "RW", "D", "D", "G"];
  for (let i = 0; i < 240; i++) {
    const p = createPlayer(
      r,
      `entrant-${g.year}-${i}`,
      positions[i % positions.length],
      // Undrafted depth shares the junior talent scale. The top draft picks
      // should not be outnumbered by NHL-ready unsigned teenagers each year.
      53,
    );
    // The unsigned pool includes older junior and college graduates.
    p.age = r.int(20, 25);
    assignPotential(p);
    p.years = 0;
    p.salary = 0;
    p.contractRemainingValue = 0;
    g.freeAgents.push(p);
  }
  g.news.unshift(
    tx(
      g,
      `${g.year}: 240 новых игроков; ${g.retired.filter((x) => x.year === g.year).length} завершили карьеру.`,
      `${g.year}: 240 new players; ${g.retired.filter((x) => x.year === g.year).length} retired.`,
    ),
  );
}
