import type { Game, Player, Team } from "./types";
import { autoLines } from "./database";
import { rivalryBetween } from "./franchiseWorld";
export interface TradeAssets {
  givePicks?: string[];
  takePicks?: string[];
}
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
  assets: TradeAssets = {},
) {
  const a = g.teams.find((t) => t.id === g.user)!,
    b = g.teams.find((t) => t.id === other);
  const reject = (reason: string) => ({
    accepted: false,
    reason,
    ratio: 0,
    threshold: 1.08,
    rivalry: undefined as string | undefined,
  });
  if (!b || a === b)
    return reject("Выберите другой клуб / Select another club");
  if (
    (!give.length && !assets.givePicks?.length) ||
    (!take.length && !assets.takePicks?.length) ||
    new Set([...give, ...take]).size !== give.length + take.length
  )
    return reject("Некорректные активы / Invalid assets");
  const givePicks =
    g.draftAssets?.filter((pick) => assets.givePicks?.includes(pick.id)) ?? [];
  const takePicks =
    g.draftAssets?.filter((pick) => assets.takePicks?.includes(pick.id)) ?? [];
  if (
    givePicks.length !== (assets.givePicks?.length ?? 0) ||
    takePicks.length !== (assets.takePicks?.length ?? 0) ||
    givePicks.some((pick) => pick.currentTeam !== g.user) ||
    takePicks.some((pick) => pick.currentTeam !== other)
  )
    return reject(
      "Права на драфт-пик изменились / Draft-pick ownership changed",
    );
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
  const outgoingValue =
    value(outgoing, b) + givePicks.reduce((sum, pick) => sum + pick.value, 0);
  const incomingValue =
    value(incoming, b) + takePicks.reduce((sum, pick) => sum + pick.value, 0);
  const ratio = outgoingValue / Math.max(1, incomingValue);
  const rivalry = rivalryBetween(g, g.user, other);
  const threshold = 1.08 + (rivalry?.heat ?? 0) / 500;
  return {
    accepted: ratio >= threshold,
    reason:
      ratio >= threshold
        ? "Клуб согласен / Club accepts"
        : rivalry
          ? `Из-за принципиального соперничества ${rivalry.label} клуб требует серьёзную переплату / Rival club demands a premium`
          : "Клуб требует больше ценности / Club wants more value",
    ratio,
    threshold,
    rivalry: rivalry?.label,
  };
}
export function executeTrade(
  g: Game,
  other: string,
  give: string[],
  take: string[],
  assets: TradeAssets = {},
) {
  const evaluation = evaluateTrade(g, other, give, take, assets);
  if (!evaluation.accepted) throw Error(evaluation.reason);
  const a = g.teams.find((t) => t.id === g.user)!,
    b = g.teams.find((t) => t.id === other)!;
  const outgoing = a.players.filter((p) => give.includes(p.id)),
    incoming = b.players.filter((p) => take.includes(p.id));
  a.players = [...a.players.filter((p) => !give.includes(p.id)), ...incoming];
  b.players = [...b.players.filter((p) => !take.includes(p.id)), ...outgoing];
  const givePicks =
    g.draftAssets?.filter((pick) => assets.givePicks?.includes(pick.id)) ?? [];
  const takePicks =
    g.draftAssets?.filter((pick) => assets.takePicks?.includes(pick.id)) ?? [];
  givePicks.forEach((pick) => (pick.currentTeam = other));
  takePicks.forEach((pick) => (pick.currentTeam = g.user));
  autoLines(a);
  autoLines(b);
  const describe = (players: Player[], picks: typeof givePicks) =>
    [
      ...players.map((player) => player.name),
      ...picks.map(
        (pick) => `${pick.year} R${pick.round} (${pick.originalTeam})`,
      ),
    ].join(", ");
  const message = `${a.id} → ${b.id}: ${describe(outgoing, givePicks)}; ${b.id} → ${a.id}: ${describe(incoming, takePicks)}`;
  (g.transactions ??= []).push({ year: g.year, round: g.round, message });
  g.news.unshift(message);
}
