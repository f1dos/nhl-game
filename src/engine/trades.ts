import type { Game, Player, Team } from "./types";
import { autoLines } from "./database";
export const payroll = (players: Player[]) =>
  players.reduce((s, p) => s + p.salary, 0);
export function tradeValue(p: Player) {
  return Math.max(
    1,
    (p.ovr - 40) * 2 +
      Math.max(0, p.potential - p.ovr) * (p.age < 26 ? 1.8 : 0.3) -
      Math.max(0, p.age - 30) * 3 -
      p.salary * 2 +
      p.years,
  );
}
function legal(players: Player[]) {
  return (
    players.length >= 20 &&
    players.length <= 30 &&
    players.filter((p) => p.pos !== "D" && p.pos !== "G").length >= 12 &&
    players.filter((p) => p.pos === "D").length >= 6 &&
    players.filter((p) => p.pos === "G").length >= 2
  );
}
export function evaluateTrade(
  g: Game,
  other: string,
  give: string[],
  take: string[],
) {
  const a = g.teams.find((t) => t.id === g.user)!,
    b = g.teams.find((t) => t.id === other);
  const reject = (reason: string) => ({ accepted: false, reason, ratio: 0 });
  if (!b || a === b)
    return reject("Выберите другой клуб / Select another club");
  if (
    !give.length ||
    !take.length ||
    new Set([...give, ...take]).size !== give.length + take.length
  )
    return reject("Некорректные активы / Invalid assets");
  if (
    give.some((id) => !a.players.some((p) => p.id === id)) ||
    take.some((id) => !b.players.some((p) => p.id === id))
  )
    return reject(
      "Игрок больше не принадлежит клубу / Player ownership changed",
    );
  const outgoing = a.players.filter((p) => give.includes(p.id)),
    incoming = b.players.filter((p) => take.includes(p.id));
  const nextA = [...a.players.filter((p) => !give.includes(p.id)), ...incoming],
    nextB = [...b.players.filter((p) => !take.includes(p.id)), ...outgoing];
  if (!legal(nextA) || !legal(nextB))
    return reject("Недостаточно игроков по позициям / Invalid roster balance");
  if (payroll(nextA) > g.rules.cap || payroll(nextB) > g.rules.cap)
    return reject("Превышен потолок зарплат / Salary cap exceeded");
  const value = (ps: Player[], t: Team) =>
    ps.reduce(
      (n, p) =>
        n +
        tradeValue(p) * (t.record.pts > t.record.gp && p.ovr >= 80 ? 1.15 : 1),
      0,
    );
  const ratio = value(outgoing, b) / value(incoming, b);
  return {
    accepted: ratio >= 1.08,
    reason:
      ratio >= 1.08
        ? "Клуб согласен / Club accepts"
        : "Клуб требует больше ценности / Club wants more value",
    ratio,
  };
}
export function executeTrade(
  g: Game,
  other: string,
  give: string[],
  take: string[],
) {
  const evaluation = evaluateTrade(g, other, give, take);
  if (!evaluation.accepted) throw Error(evaluation.reason);
  const a = g.teams.find((t) => t.id === g.user)!,
    b = g.teams.find((t) => t.id === other)!;
  const outgoing = a.players.filter((p) => give.includes(p.id)),
    incoming = b.players.filter((p) => take.includes(p.id));
  a.players = [...a.players.filter((p) => !give.includes(p.id)), ...incoming];
  b.players = [...b.players.filter((p) => !take.includes(p.id)), ...outgoing];
  autoLines(a);
  autoLines(b);
  const message = `${a.id} → ${b.id}: ${outgoing.map((p) => p.name).join(", ")}; ${b.id} → ${a.id}: ${incoming.map((p) => p.name).join(", ")}`;
  (g.transactions ??= []).push({ year: g.year, round: g.round, message });
  g.news.unshift(message);
}
