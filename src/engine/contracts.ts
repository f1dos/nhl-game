import type { Game, Player, Team, Position } from "./types";
import { autoLines } from "./database";
export const CONTRACT_RULES = {
  minimumSalary: 0.8,
  maxYears: 7,
  maxRoster: 30,
};
export const salaryTotal = (t: Team) =>
  t.players.reduce((n, p) => n + p.salary, 0);
export function askingSalary(p: Player) {
  return (
    Math.round(
      Math.max(0.8, 0.8 + Math.pow(Math.max(0, p.ovr - 60) / 15, 2)) * 100,
    ) / 100
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
  if (salaryTotal(t) - (owned?.salary || 0) + salary > g.rules.cap + 1e-8)
    throw Error("Salary cap exceeded");
  if (salary < askingSalary(p))
    throw Error(`Counteroffer: $${askingSalary(p).toFixed(2)}M`);
  // Renewals take effect immediately in this foundation model.
  p.salary = Math.round(salary * 100) / 100;
  p.years = years;
  p.contractSource = "generated";
  p.contractExpiryYear = g.year + years;
  p.contractStatus = p.age < 27 ? "RFA" : "UFA";
  p.contractRemainingValue = Math.round(p.salary * years * 100) / 100;
  if (free) {
    g.freeAgents = g.freeAgents!.filter((x) => x.id !== p.id);
    t.players.push(p);
  }
  (g.contractHistory ??= []).push({
    year: g.year,
    team: teamId,
    player: p.name,
    years,
    salary: p.salary,
  });
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
    g.freeAgents.push(...t.farm.filter((p) => p.years === 0));
    t.farm = t.farm.filter((p) => p.years > 0);
  }
  // Deterministic minimum-roster assistance applies to every team at rollover.
  for (const t of g.teams) {
    for (const [unit, count] of Object.entries({ F: 12, D: 6, G: 2 })) {
      const matches = (p: Player) =>
        unit === "F" ? p.pos !== "D" && p.pos !== "G" : p.pos === unit;
      while (t.players.filter(matches).length < count) {
        const candidates = g.freeAgents
          .filter(matches)
          .sort(
            (a, b) =>
              askingSalary(a) - askingSalary(b) ||
              b.ovr - a.ovr ||
              a.id.localeCompare(b.id),
          );
        const p = candidates.find(
          (p) =>
            salaryTotal(t) + askingSalary(p) <= g.rules.cap &&
            askingSalary(p) <= g.rules.cap * 0.2,
        );
        if (!p)
          throw Error(
            `Cannot fill ${t.id} ${unit} under salary cap; renew contracts or increase demo cap before rollover`,
          );
        signContract(g, t.id, p.id, 1, askingSalary(p));
      }
    }
    autoLines(t);
  }
}
