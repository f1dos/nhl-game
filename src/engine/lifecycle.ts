import type { Game, Player, Position } from "./types";
import { RNG, clamp } from "./random";
import { overall } from "./ratings";
import { createPlayer } from "./database";
import { emptyStats } from "./types";
import { prepareAnnualDevelopment } from "./performance";
export function ageWorld(g: Game, r: RNG) {
  g.freeAgents ??= [];
  g.retired ??= [];
  const age = (p: Player) => {
    const before = p.ovr;
    const season = prepareAnnualDevelopment(p);
    p.age++;
    const curve =
      p.age < 26
        ? Math.min(Math.max(0, p.potential - p.ovr), r.int(0, 3))
        : p.age > 31
          ? -r.int(0, 2)
          : r.int(-1, 1);
    const growth = clamp(curve + season.modifier, -4, 4);
    for (const key of Object.keys(p.attributes))
      p.attributes[key] = clamp(p.attributes[key] + growth, 30, 99);
    p.ovr = overall(p.pos, p.attributes, p.archetype);
    (p.developmentLog ??= []).unshift({
      year: g.year,
      delta: p.ovr - before,
      reason: season.reason,
      ovrBefore: before,
      ovrAfter: p.ovr,
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
  for (const t of g.teams) {
    t.players.forEach(age);
    const retiring = t.players.filter(retired);
    g.retired.push(...retiring.map((player) => ({ year: g.year, player })));
    t.players = t.players.filter((p) => !retiring.includes(p));
    t.farm ??= [];
    t.farm.forEach(age);
    const farmRetiring = t.farm.filter(retired);
    g.retired.push(...farmRetiring.map((player) => ({ year: g.year, player })));
    t.farm = t.farm.filter((p) => !farmRetiring.includes(p));
    t.prospects ??= [];
    t.prospects.forEach(age);
    const promoted: Player[] = [];
    for (const p of [...t.prospects].sort((a, b) => b.ovr - a.ovr)) {
      const payroll = t.players.reduce((n, x) => n + x.salary, 0);
      if (
        (p.age >= 21 || p.ovr >= 74) &&
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
  g.freeAgents.forEach(age);
  const retiring = g.freeAgents.filter(retired);
  g.retired.push(...retiring.map((player) => ({ year: g.year, player })));
  g.freeAgents = g.freeAgents.filter((p) => !retiring.includes(p));
  // Undrafted and overage players keep the open market supplied. Drafted players
  // now develop separately inside each club's prospect pipeline.
  const positions: Position[] = ["LW", "C", "RW", "D", "D", "G"];
  for (let i = 0; i < 240; i++) {
    const p = createPlayer(
      r,
      `entrant-${g.year}-${i}`,
      positions[i % positions.length],
      66,
    );
    p.age = r.int(18, 21);
    p.years = 0;
    p.salary = 0;
    p.contractRemainingValue = 0;
    g.freeAgents.push(p);
  }
  g.news.unshift(
    `${g.year}: 240 новых игроков; ${g.retired.filter((x) => x.year === g.year).length} завершили карьеру.`,
  );
}
