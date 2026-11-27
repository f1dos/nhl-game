import type { Game, Player } from "./types";

export function recordContract(g: Game, team: string, p: Player, action: "sign" | "extend") {
  (g.contractHistory ??= []).push({
    year: g.year, date: g.calendar?.date, team, player: p.name, playerId: p.id,
    years: p.years, salary: p.salary, action,
  });
}
