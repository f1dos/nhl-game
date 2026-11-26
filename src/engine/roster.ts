import { capCharge } from "./cap";
import { tx } from "./text";
import { autoLines } from "./database";
import { salaryTotal } from "./contracts";
import type { Game, Player, Team } from "./types";

const unit = (player: Player) =>
  player.pos === "D" ? "D" : player.pos === "G" ? "G" : "F";

const legalActiveRoster = (players: Player[]) =>
  players.length >= 20 &&
  players.length <= 30 &&
  players.filter((p) => unit(p) === "F").length >= 12 &&
  players.filter((p) => unit(p) === "D").length >= 6 &&
  players.filter((p) => unit(p) === "G").length >= 2;

export function sendToFarm(g: Game, playerId: string) {
  const team = g.teams.find((t) => t.id === g.user)!;
  const player = team.players.find((p) => p.id === playerId);
  if (!player) throw Error("Player is not on the active roster");
  const next = team.players.filter((p) => p.id !== playerId);
  if (!legalActiveRoster(next))
    throw Error(
      "Active roster must retain 12 forwards, 6 defensemen and 2 goalies",
    );
  team.players = next;
  team.farm ??= [];
  team.farm.push(player);
  autoLines(team);
  const message = `${team.id}: ${player.name} assigned to organizational reserve.`;
  (g.transactions ??= []).push({ year: g.year, round: g.round, message });
  g.news.unshift(message);
}

export function callUpFromFarm(g: Game, playerId: string) {
  const team = g.teams.find((t) => t.id === g.user)!;
  const player = team.farm?.find((p) => p.id === playerId);
  if (!player) throw Error("Player is not in organizational reserve");
  if (player.contractType === "AHL")
    throw Error(
      tx(
        g,
        "Игрок имеет только контракт AHL — сначала подпишите NHL/ELC соглашение",
        "The player only has an AHL contract — sign an NHL/ELC deal first",
      ),
    );
  if (team.players.length >= 30) throw Error("Active roster is full");
  if (salaryTotal(team) + capCharge(player) > g.rules.cap + 1e-8)
    throw Error("Call-up would exceed the salary cap");
  team.farm = team.farm!.filter((p) => p.id !== playerId);
  team.players.push(player);
  autoLines(team);
  const message = `${team.id}: ${player.name} recalled to the active roster.`;
  (g.transactions ??= []).push({ year: g.year, round: g.round, message });
  g.news.unshift(message);
}

export function swapLineupPlayer(
  team: Team,
  group: "lines" | "defense",
  row: number,
  slot: number,
  playerId: string,
) {
  const units = team[group];
  const previous = units[row]?.[slot];
  if (!previous || previous === playerId) return;
  const player = team.players.find((item) => item.id === playerId);
  const correctGroup =
    group === "defense"
      ? player?.pos === "D"
      : player && player.pos !== "D" && player.pos !== "G";
  if (!correctGroup || player?.injury)
    throw Error("Player is unavailable for this lineup slot");
  let existing: [number, number] | undefined;
  units.forEach((unitPlayers, unitIndex) =>
    unitPlayers.forEach((id, slotIndex) => {
      if (id === playerId) existing = [unitIndex, slotIndex];
    }),
  );
  units[row][slot] = playerId;
  if (existing) units[existing[0]][existing[1]] = previous;
  const active = [...team.lines.flat(), ...team.defense.flat(), team.goalie];
  if (new Set(active).size !== active.length) {
    units[row][slot] = previous;
    if (existing) units[existing[0]][existing[1]] = playerId;
    throw Error("Each player can occupy only one active lineup slot");
  }
}
