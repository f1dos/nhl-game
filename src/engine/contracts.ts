import {recordContract} from "./contractLedger";
import { capCharge, rosterCharge } from "./cap";
import type { Game, Player, Team, Position } from "./types";
import { autoLines } from "./database";
import { contractStrategyFactor } from "./strategy";
export const CONTRACT_RULES = {
  minimumSalary: 0.8,
  maxYears: 7,
  maxRoster: 30,
};
export const salaryTotal = (t: Team) => rosterCharge(t.players);
export function askingSalary(p: Player, g?: Game, teamId?: string) {
  const base =
    Math.round(
      Math.max(0.8, 0.8 + Math.pow(Math.max(0, p.ovr - 60) / 15, 2)) * 100,
    ) / 100;
  const factor = g && teamId ? contractStrategyFactor(g, teamId, p.age) : 1;
  return (
    Math.round(Math.max(CONTRACT_RULES.minimumSalary, base * factor) * 100) /
    100
  );
}
export function signContract(
  g: Game,
  teamId: string,
  playerId: string,
  years: number,
  salary: number,
) {
  const t = g.teams.find((t) => t.id === teamId);
  if (!t) throw Error("Unknown team");
  const owned = t.players.find((p) => p.id === playerId),
    free = g.freeAgents?.find((p) => p.id === playerId),
    p = owned || free;
  if (!p) throw Error("Player unavailable");
  if (
    !Number.isInteger(years) ||
    years < 1 ||
    years > CONTRACT_RULES.maxYears ||
    !Number.isFinite(salary) ||
    salary < CONTRACT_RULES.minimumSalary ||
    salary > g.rules.cap * 0.2
  )
    throw Error("Invalid contract terms");
  if (owned && owned.years > 1)
    throw Error("Only expiring contracts can be renewed");
  if (!owned && t.players.length >= CONTRACT_RULES.maxRoster)
    throw Error("Roster is full");
  if (
    salaryTotal(t) - (owned ? capCharge(owned) : 0) + capCharge(p, salary) >
    g.rules.cap + 1e-8
  )
    throw Error("Salary cap exceeded");
  const ask = askingSalary(p, g, teamId);
  if (salary < ask) throw Error(`Counteroffer: $${ask.toFixed(2)}M`);
  // Renewals take effect immediately in this foundation model.
  p.salary = Math.round(salary * 100) / 100;
  p.years = years;
  p.contractSource = "generated";
  p.contractExpiryYear = g.year + years;
  p.contractStatus = p.age < 27 ? "RFA" : "UFA";
  p.contractRemainingValue = Math.round(p.salary * years * 100) / 100;
  if (free) {
    p.contractType = "NHL";
    g.freeAgents = g.freeAgents!.filter((x) => x.id !== p.id);
    t.players.push(p);
  }
  recordContract(g,t.id,p,owned ? "extend" : "sign");
  g.news.unshift(`${teamId}: ${p.name} — ${years} yr / $${p.salary}M`);
}
export function expireContracts(g: Game) {
  g.freeAgents ??= [];
  for (const t of g.teams) {
    for (const p of t.players) {
      p.years = Math.max(0, p.years - 1);
      p.contractRemainingValue = Math.round(p.salary * p.years * 100) / 100;
    }
    g.freeAgents.push(...t.players.filter((p) => p.years === 0));
    t.players = t.players.filter((p) => p.years > 0);
    t.farm ??= [];
    for (const p of t.farm) {
      p.years = Math.max(0, p.years - 1);
      p.contractRemainingValue = Math.round(p.salary * p.years * 100) / 100;
    }
    // Retain affiliate depth before exposing excess players to the open market.
    for (const unit of units) {
      const depth = t.farm.filter((p) => group(p) === unit);
      const signed = depth.filter((p) => p.years > 0).length;
      for (const p of depth
        .filter((p) => !p.years)
        .sort(rank)
        .slice(0, Math.max(0, affiliate[unit] - signed))) {
        affiliateContract(p, g.year);
        recordContract(g,t.id,p,"extend");
      }
    }
    g.freeAgents.push(...t.farm.filter((p) => !p.years));
    t.farm = t.farm.filter((p) => p.years > 0);
    registerRoster(t, g.rules.cap);
  }
  // Fill indispensable positions first, reserving enough room for the remaining vacancies.
  const recruitingOrder = [...g.teams].sort(
    (a, b) => a.record.pts - b.record.pts || a.id.localeCompare(b.id),
  );
  let signedThisRound: boolean;
  do {
    signedThisRound = false;
    for (const t of recruitingOrder) {
      for (const unit of units) {
        if (t.players.filter((p) => group(p) === unit).length < minimum[unit]) {
          const vacancies = units.reduce(
            (n, u) =>
              n +
              Math.max(
                0,
                minimum[u] - t.players.filter((p) => group(p) === u).length,
              ),
            0,
          );
          const room =
            g.rules.cap -
            salaryTotal(t) -
            (vacancies - 1) * CONTRACT_RULES.minimumSalary;
          const signed = t
            .farm!.filter(
              (p) =>
                group(p) === unit &&
                p.contractType !== "AHL" &&
                p.salary <= room + 1e-8,
            )
            .sort(rank)[0];
          const free = g.freeAgents
            .filter(
              (p) =>
                group(p) === unit && askingSalary(p, g, t.id) <= room + 1e-8,
            )
            .sort(rank)[0];
          if (signed && (!free || signed.ovr >= free.ovr)) {
            t.farm = t.farm!.filter((p) => p !== signed);
            t.players.push(signed);
          } else if (free)
            signContract(g, t.id, free.id, 2, askingSalary(free, g, t.id));
          else throw Error("Cannot fill " + t.id + " under salary cap");
          signedThisRound = true;
          break;
        }
      }
    }
  } while (signedThisRound);
  // Each free agent considers clubs where his arrival improves a real lineup spot.
  for (const p of [...g.freeAgents].sort(rank)) {
    const u = group(p);
    let best:
      { t: Team; replace?: Player; score: number; offer: number } | undefined;
    for (const t of g.teams) {
      const depth = t.players.filter((x) => group(x) === u).sort(rank);
      const replace = depth.at(-1)!;
      const extra = depth.length < rotation[u] && t.players.length < 23;
      const gain = p.ovr - replace.ovr;
      if ((!extra && gain < 3) || (extra && gain < -3)) continue;
      const offer = askingSalary(p, g, t.id);
      const room =
        g.rules.cap - salaryTotal(t) + (extra ? 0 : capCharge(replace));
      if (offer > room + 1e-8 || offer > g.rules.cap * 0.2) continue;
      const score = gain + (extra ? 5 : 0) + Math.min(2, room / 25);
      if (!best || score > best.score)
        best = { t, score, offer, replace: extra ? undefined : replace };
    }
    if (!best) continue;
    if (best.replace) {
      best.t.players = best.t.players.filter((x) => x !== best.replace);
      best.t.farm!.push(best.replace);
    }
    signContract(g, best.t.id, p.id, p.age < 30 ? 3 : 2, best.offer);
  }
  for (const t of g.teams) {
    for (const u of units) {
      const slots = Math.max(
        0,
        minimum[u] - t.farm!.filter((p) => group(p) === u).length,
      );
      for (const p of g.freeAgents
        .filter((p) => group(p) === u)
        .sort(rank)
        .slice(0, slots)) {
        g.freeAgents.splice(g.freeAgents.indexOf(p), 1);
        affiliateContract(p, g.year);
        recordContract(g,t.id,p,"sign");
        t.farm!.push(p);
      }
    }
    autoLines(t);
  }
}
const units = ["F", "D", "G"] as const;
const minimum = { F: 12, D: 6, G: 2 },
  rotation = { F: 13, D: 7, G: 3 },
  affiliate = { F: 15, D: 8, G: 3 };
const group = (p: Player) => (p.pos === "G" ? "G" : p.pos === "D" ? "D" : "F");
const rank = (a: Player, b: Player) =>
  b.ovr - a.ovr || a.age - b.age || a.id.localeCompare(b.id);
function affiliateContract(p: Player, year: number) {
  p.salary = CONTRACT_RULES.minimumSalary;
  p.years = 2;
  p.contractExpiryYear = year + 2;
  p.contractSource = "generated";
  p.contractRemainingValue = p.salary * p.years;
  p.contractType = p.ovr >= 70 ? "NHL" : "AHL";
}
// Choose a legal active roster from signed players without rewriting contracts.
export function registerRoster(t: Team, cap: number) {
  t.farm ??= [];
  while (salaryTotal(t) > cap + 1e-8) {
    const extras = t.players.filter(
      (p) =>
        t.players.filter((x) => group(x) === group(p)).length >
        minimum[group(p)],
    );
    const option = extras.sort(
      (a, b) => a.ovr - b.ovr || b.salary - a.salary,
    )[0];
    if (option) {
      t.players = t.players.filter((x) => x !== option);
      t.farm.push(option);
      continue;
    }
    const swaps = t.players
      .flatMap((out) =>
        t
          .farm!.filter(
            (p) =>
              group(p) === group(out) &&
              p.contractType !== "AHL" &&
              capCharge(p) < capCharge(out),
          )
          .map((p) => ({ out, p })),
      )
      .sort(
        (a, b) =>
          a.out.ovr - a.p.ovr - (b.out.ovr - b.p.ovr) ||
          b.out.salary - a.out.salary,
      );
    const swap = swaps[0];
    if (!swap) throw Error("Cannot register " + t.id + " under salary cap");
    t.players[t.players.indexOf(swap.out)] = swap.p;
    t.farm[t.farm.indexOf(swap.p)] = swap.out;
  }
}
