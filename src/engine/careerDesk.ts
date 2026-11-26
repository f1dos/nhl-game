import { capCharge } from "./cap";
import type { Game, ManagementEvent, Player, Result, Team } from "./types";
import { addDays, pushEvent } from "./management";
import { callUpFromFarm, sendToFarm } from "./roster";
import { calculateTeamNeeds, syncMoraleBonus } from "./franchiseWorld";
import { evaluateTrade, payroll, tradeValue, type TradeAssets } from "./trades";
import { tx } from "./text";

export type ScoutFocus = "release" | "stride" | "pressure";
export interface IceAgreement {
  log?: { date: string; opponent: string; minutes: number; unit?: number }[];
  player: string;
  name: string;
  start: string;
  target: number;
  unit?: number;
  roleGames?: number;
  games: number;
  minutes: number;
  status: "open" | "kept" | "broken" | "departed";
  lastGame?: string;
}
export interface DevelopmentPlan {
  player: string;
  league: "NHL" | "AHL";
  focus: string;
  start: string;
  due: string;
  baseline: number;
  benchmark: string;
  games: number;
  minutes: number;
  opportunities?: number;
  lastGame?: string;
  outcome?: string;
  gain?: number;
}
const own = (g: Game) => g.teams.find((t) => t.id === g.user)!;
export function agreeMinutes(
  g: Game,
  id: string,
  target: number,
  unit?: number,
) {
  const p = own(g).players.find((p) => p.id === id);
  if (
    !p ||
    p.pos === "G" ||
    ![9, 14, 19, 22].includes(target) ||
    (unit !== undefined && ![1, 2].includes(unit)) ||
    g.iceAgreements?.some((a) => a.player === id && a.status === "open")
  )
    return;
  (g.iceAgreements ??= []).push({
    player: id,
    name: p.name,
    start: g.calendar!.date,
    target,
    ...(unit ? { unit, roleGames: 0 } : {}),
    games: 0,
    minutes: 0,
    status: "open",
  });
}
export function focusKey(p: Player, f: ScoutFocus) {
  return p.pos === "G"
    ? {
        release: "reflexes",
        stride: "goaliePosition",
        pressure: "reboundControl",
      }[f]
    : { release: "accuracy", stride: "acceleration", pressure: "decisions" }[f];
}
export function evidenceRange(p: Player, f: ScoutFocus, n: number) {
  if (!n) return undefined;
  const width = [0, 16, 8, 4][Math.min(n, 3)];
  const value = p.attributes[focusKey(p, f)];
  if (!Number.isFinite(value)) return undefined;
  const lo = Math.floor(value / width) * width;
  return [Math.max(1, lo), Math.min(99, lo + width - 1)];
}
export function beginDevelopment(
  g: Game,
  id: string,
  league: "NHL" | "AHL",
  focus: ScoutFocus,
) {
  const t = own(g),
    p = [...t.players, ...(t.farm ?? [])].find((p) => p.id === id);
  if (
    !p ||
    p.age > 25 ||
    g.developmentPlans?.some((a) => a.player === id && !a.outcome)
  )
    return;
  const peer = t.players
    .filter((x) => x.pos === p.pos && x.id !== id)
    .sort((a, b) => Math.abs(a.ovr - p.ovr) - Math.abs(b.ovr - p.ovr))[0];
  if (league === "NHL" && !t.players.includes(p)) callUpFromFarm(g, id);
  if (league === "AHL" && t.players.includes(p)) sendToFarm(g, id);
  const key = focusKey(p, focus),
    start = g.calendar!.date;
  (g.developmentPlans ??= []).push({
    player: id,
    league,
    focus: key,
    baseline: p.attributes[key],
    start,
    due: addDays(start, 30),
    benchmark: peer?.id ?? "",
    games: 0,
    minutes: 0,
  });
}
function report(g: Game, p: Player, body: string, title: string) {
  pushEvent(g, {
    date: g.calendar!.date,
    category: "organization",
    priority: "high",
    action: "roster",
    playerId: p.id,
    title,
    body,
  });
}
export function reviewCareerPlans(
  g: Game,
  result: Result | undefined,
  competitive: boolean,
) {
  const t = own(g),
    date = g.calendar!.date;
  const game =
    competitive && result && [result.home, result.away].includes(g.user)
      ? result
      : undefined;
  for (const a of g.iceAgreements ?? []) {
    if (a.status !== "open") continue;
    const p = [...t.players, ...(t.farm ?? [])].find((p) => p.id === a.player);
    if (!p) {
      a.status = "departed";
      continue;
    }
    if (!game || a.lastGame === date) continue;
    a.lastGame = date;
    (a.log ??= []).push({
      date,
      opponent: game.home === g.user ? game.away : game.home,
      minutes: game.iceMinutes?.[p.id] ?? 0,
      unit: game.startingUnits?.[p.id],
    });
    a.games++;
    a.minutes += game.iceMinutes?.[p.id] ?? 0;
    if (
      a.unit &&
      (game.iceMinutes?.[p.id] ?? 0) > 0 &&
      (game.startingUnits?.[p.id] ?? 99) <= a.unit
    )
      a.roleGames = (a.roleGames ?? 0) + 1;
    if (a.games < 10) continue;
    const avg = a.minutes / a.games;
    a.status =
      avg + 0.01 >= a.target && (!a.unit || (a.roleGames ?? 0) >= 8)
        ? "kept"
        : "broken";
    p.relationship = Math.max(
      0,
      Math.min(100, (p.relationship ?? 50) + (a.status === "kept" ? 4 : -6)),
    );
    p.morale = Math.max(
      0,
      Math.min(100, p.morale + (a.status === "kept" ? 2 : -4)),
    );
    syncMoraleBonus(p);
    const verdict =
      a.status === "kept"
        ? tx(g, "Вы сдержали слово.", "You kept your word.")
        : tx(
            g,
            "Я рассчитывал на другую роль.",
            "I expected a different role.",
          );
    const role = a.unit
      ? tx(
          g,
          ` Выходов из заявленного сочетания или выше: ${a.roleGames ?? 0}/10.`,
          ` Games dressed in the agreed unit or higher: ${a.roleGames ?? 0}/10.`,
        )
      : "";
    report(
      g,
      p,
      tx(
        g,
        `Мы договаривались на ${a.target} мин. За десять матчей у меня в среднем ${avg.toFixed(1)}.${role} ${verdict}`,
        `We agreed on ${a.target} minutes. My ten-game average was ${avg.toFixed(1)}.${role} ${verdict}`,
      ),
      p.name +
        " · " +
        tx(g, "Наш разговор об игровом времени", "Our ice-time agreement"),
    );
  }
  for (const a of g.developmentPlans ?? []) {
    if (a.outcome) continue;
    const p = [...t.players, ...(t.farm ?? [])].find((x) => x.id === a.player);
    if (!p) {
      a.outcome = "departed";
      continue;
    }
    if (game && a.lastGame !== date) {
      a.lastGame = date;
      a.opportunities = (a.opportunities ?? 0) + 1;
      // Farm games use the affiliate workload model, never NHL player statistics.
      const minutes = t.players.includes(p)
        ? (game.iceMinutes?.[p.id] ?? 0)
        : a.league === "AHL" && !p.injury
          ? p.pos === "G"
            ? a.opportunities % 3 === 0
              ? 0
              : 60
            : 19
          : 0;
      if (minutes > 0) {
        a.games++;
        a.minutes += minutes;
      }
    }
    if (date < a.due) continue;
    const gain = Math.min(
      2,
      Math.floor(a.minutes / (p.pos === "G" ? 220 : 85)),
      Math.max(0, p.potential - p.ovr),
      99 - p.attributes[a.focus],
    );
    p.attributes[a.focus] += Math.max(0, gain);
    a.gain = gain;
    const peer = t.players.find((x) => x.id === a.benchmark);
    a.outcome = peer && p.ovr + 1 >= peer.ovr ? "compete" : "develop";
    const comparison = peer
      ? ` · ${peer.name} ${peer.ovr} OVR / ${p.name} ${p.ovr} OVR`
      : "";
    const verdict =
      a.outcome === "compete"
        ? tx(g, "Готов конкурировать за место", "Ready to compete for the spot")
        : tx(g, "Продолжить развитие", "Continue development");
    report(
      g,
      p,
      `${verdict} · ${a.league} · ${a.games} GP · ${a.minutes.toFixed(0)} min · ${a.focus} ${a.baseline} → ${p.attributes[a.focus]}${comparison}`,
      p.name +
        " · " +
        tx(g, "Месячная оценка развития", "Monthly development review"),
    );
  }
}
export function marketBrief(g: Game, t: Team) {
  const need = calculateTeamNeeds(g, t)[0],
    age =
      t.players.reduce((n, p) => n + p.age, 0) / Math.max(1, t.players.length);
  const youth = age >= 28 || (t.record.gp >= 10 && t.record.pts < t.record.gp);
  return { need, age, youth, space: g.rules.cap - payroll(t.players) };
}
export function counterOffer(
  g: Game,
  id: string,
  give: string[],
  take: string[],
  assets: TradeAssets,
  path: "either" | "player" | "pick" = "either",
) {
  const club = g.teams.find((t) => t.id === id);
  if (
    !club ||
    (!take.length && !assets.takePicks?.length) ||
    evaluateTrade(g, id, give, take, assets).accepted
  )
    return;
  const { need, youth } = marketBrief(g, club);
  const candidates = [...own(g).players, ...(own(g).farm ?? [])].filter(
    (p) => !give.includes(p.id),
  );
  const fit = (p: Player) =>
    (p.pos === need.position ? 24 : 0) +
    (youth ? Math.max(0, 28 - p.age) * 2 : p.ovr * 0.15) -
    tradeValue(p) * 0.18;
  if (path !== "pick")
    for (const p of candidates.sort((a, b) => fit(b) - fit(a))) {
      if (evaluateTrade(g, id, [...give, p.id], take, assets).accepted)
        return { player: p.id, name: p.name };
    }
  if (path === "player") return;
  const picks = (g.draftAssets ?? [])
    .filter(
      (p) => p.currentTeam === g.user && !assets.givePicks?.includes(p.id),
    )
    .sort((a, b) => a.value - b.value);
  for (const p of picks)
    if (
      evaluateTrade(g, id, give, take, {
        ...assets,
        givePicks: [...(assets.givePicks ?? []), p.id],
      }).accepted
    )
      return { pick: p.id, name: `${p.year} · R${p.round}` };
}
export function projectedPayroll(
  t: Team,
  add: Player | undefined,
  remove: string,
  extend: string,
  aav: number,
  years = 2,
  activate?:string,
) {
  const list = t.players.filter((p) => p.id !== remove);
  if (add && !list.some((p) => p.id === add.id)) list.push(add);
  return {
    today: list.reduce((sum, p) => sum + (p.id===activate?(p.id===extend?aav:p.salary):capCharge(p,p.id === extend ? aav : p.salary)), 0),
    summer: list.reduce(
      (n, p) =>
        n +
        (p.id === extend ? (years > 1 ? aav : 0) : p.years > 1 ? p.salary : 0),
      0,
    ),
  };
}
export function deadlineGroup(
  e: ManagementEvent,
  today: string,
  matchToday = false,
) {
  if (e.resolved) return 3;
  if (
    matchToday &&
    (e.requiresResponse || e.priority === "high") &&
    (e.action === "leadership" ||
      e.action === "tactics" ||
      e.action === "injuries" ||
      e.action === "preseason")
  )
    return 0;
  if ((e.responseDue && e.responseDue <= today) || e.priority === "critical")
    return 0;
  if (e.responseDue && e.responseDue <= addDays(today, 7)) return 1;
  return 2;
}
export const canDelegate = (e: ManagementEvent) =>
  !e.resolved &&
  !e.requiresResponse &&
  !e.responseDue &&
  !e.replies?.length &&
  (e.priority === "low" || e.priority === "normal") &&
  ["league", "game", "scouting"].includes(e.category);
export function delegateReport(g: Game, id: string) {
  const e = g.events?.find((e) => e.id === id);
  if (e && canDelegate(e)) {
    e.assistantReviewed = true;
    e.read = true;
    e.resolved = true;
  }
}
