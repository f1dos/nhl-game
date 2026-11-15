import { autoLines } from "./database";
import { advance, dateForRound } from "./season";
import { simulateMatch } from "./match";
import { RNG } from "./random";
import { payroll, tradeValue } from "./trades";
import { trainTeam } from "./training";
import { chooseSeasonStrategy, defaultEmployment } from "./strategy";
import {
  addRivalryObjective,
  applyWeeklyMood,
  ensureFranchiseWorld,
} from "./franchiseWorld";
import type {
  AiGeneralManagerProfile,
  DraftAsset,
  FranchiseStrategy,
  Game,
  ManagementEvent,
  ManagementEventCategory,
  Team,
} from "./types";

const DAY = 86_400_000;
function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number) {
  return iso(new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY));
}

function numberFrom(value: string) {
  let n = 2166136261;
  for (const char of value) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return n >>> 0;
}

function trait(team: string, name: string) {
  return 25 + (numberFrom(`${team}:${name}`) % 71);
}

function initialStrategy(team: Team): FranchiseStrategy {
  const core = [...team.players].sort((a, b) => b.ovr - a.ovr).slice(0, 18);
  const rating =
    core.reduce((sum, player) => sum + player.ovr, 0) / core.length;
  const age = core.reduce((sum, player) => sum + player.age, 0) / core.length;
  if (rating >= 82) return "stanley-cup";
  if (rating >= 79) return "playoff-breakthrough";
  if (rating < 76) return "draft-lottery";
  return age < 26 ? "wild-card-hunt" : "playoff-breakthrough";
}

function createProfile(team: Team): AiGeneralManagerProfile {
  return {
    strategy: initialStrategy(team),
    aggression: trait(team.id, "aggression"),
    patience: trait(team.id, "patience"),
    risk: trait(team.id, "risk"),
    youthPreference: trait(team.id, "youth"),
    analytics: trait(team.id, "analytics"),
    financialCaution: trait(team.id, "finance"),
    futureAssetWillingness: trait(team.id, "future"),
  };
}

function initialDraftAssets(g: Game): DraftAsset[] {
  return g.teams.flatMap((team) =>
    [g.year + 1, g.year + 2, g.year + 3].flatMap((year) =>
      Array.from({ length: 7 }, (_, index) => {
        const round = index + 1;
        return {
          id: `${year}-${round}-${team.id}`,
          year,
          round,
          originalTeam: team.id,
          currentTeam: team.id,
          projectedOverall: 16,
          value: Math.round(100 / round),
          history: [],
        };
      }),
    ),
  );
}

export function pushEvent(
  g: Game,
  event: Omit<ManagementEvent, "id" | "read" | "resolved">,
) {
  g.events ??= [];
  const id = `${event.date}-${event.category}-${numberFrom(`${event.title}:${event.body}:${g.events.length}`)}`;
  if (g.events.some((item) => item.id === id)) return;
  g.events.unshift({ ...event, id, read: false, resolved: false });
  g.events = g.events.slice(0, 400);
  g.news.unshift(event.title);
  g.news = g.news.slice(0, 100);
}

function seedOpeningEvents(g: Game) {
  const team = g.teams.find((club) => club.id === g.user)!;
  pushEvent(g, {
    date: g.calendar!.date,
    category: "organization",
    priority: "high",
    title: "Утвердите стратегию франшизы",
    body: "Владелец ждёт выбранное направление развития клуба на сезон.",
    action: "strategy",
    requiresResponse: true,
    responseDue: addDays(g.calendar!.date, 7),
  });
  const injured = team.players.filter((player) => player.injury > 0);
  if (injured.length)
    pushEvent(g, {
      date: g.calendar!.date,
      category: "medical",
      priority: "high",
      title: `Медицинский отчёт: недоступны ${injured.length}`,
      body: `${injured
        .slice(0, 3)
        .map((player) => player.name)
        .join(", ")}. Проверьте состав и варианты замены из AHL.`,
      action: "injuries",
      requiresResponse: true,
      responseDue: addDays(g.calendar!.date, 3),
    });
  const expiring = team.players.filter((player) => player.years <= 1);
  if (expiring.length)
    pushEvent(g, {
      date: g.calendar!.date,
      category: "contract",
      priority: "normal",
      title: `${expiring.length} контрактов требуют планирования`,
      body: "Финансовый отдел подготовил список соглашений, истекающих после сезона.",
      action: "contracts",
      requiresResponse: false,
    });
}

function ensureStrategyEvent(g: Game) {
  if (
    g.strategySeason === g.year ||
    g.events!.some(
      (event) =>
        event.title === "Утвердите стратегию франшизы" && !event.resolved,
    )
  )
    return;
  pushEvent(g, {
    date: g.calendar!.date,
    category: "organization",
    priority: "critical",
    title: "Утвердите стратегию франшизы",
    body: "До продолжения сезона совет директоров требует выбрать уровень спортивных амбиций и принять задачи.",
    action: "strategy",
    requiresResponse: true,
    responseDue: addDays(g.calendar!.date, 7),
  });
}

function seedPreseason(g: Game) {
  if (g.preseasonFixtures) return;
  const team = g.teams.find((club) => club.id === g.user)!;
  const opponents = g.teams.filter(
    (club) => club.id !== g.user && club.conference === team.conference,
  );
  const dates = ["09-20", "09-24", "09-28", "10-02"];
  g.preseasonFixtures = dates.map((suffix, index) => ({
    id: `pre-${g.year}-${index}`,
    date: `${g.year}-${suffix}`,
    home: index % 2 ? opponents[index].id : g.user,
    away: index % 2 ? g.user : opponents[index].id,
  }));
}

export function ensureManagementState(g: Game) {
  const start = `${g.year}-10-07`;
  g.calendar ??= {
    date: g.round === 0 ? `${g.year}-09-15` : iso(dateForRound(g, g.round)),
    seasonStart: start,
    preseasonStart: `${g.year}-09-15`,
    day: Math.max(0, g.round * 2),
    lastProcessedDate:
      g.round === 0
        ? `${g.year}-09-14`
        : addDays(iso(dateForRound(g, g.round)), -1),
  };
  g.calendar.preseasonStart ??= `${g.year}-09-15`;
  seedPreseason(g);
  g.events ??= [];
  const legacyStrategy = g.franchiseStrategy as string | undefined;
  if (
    legacyStrategy &&
    ![
      "draft-lottery",
      "wild-card-hunt",
      "playoff-breakthrough",
      "stanley-cup",
    ].includes(legacyStrategy)
  ) {
    g.franchiseStrategy = undefined;
    g.strategySeason = undefined;
    g.franchiseObjectives = [];
  }
  g.managerEmployment ??= defaultEmployment();
  ensureFranchiseWorld(g);
  g.draftAssets ??= initialDraftAssets(g);
  for (const team of g.teams) team.aiProfile ??= createProfile(team);
  if (!g.events.length) seedOpeningEvents(g);
  ensureStrategyEvent(g);
  return g;
}

export function gameDate(g: Game) {
  ensureManagementState(g);
  return g.calendar!.date;
}

export function fixtureDate(g: Game, round: number) {
  return iso(dateForRound(g, round));
}

function categoryAction(category: ManagementEventCategory) {
  if (category === "medical") return "injuries" as const;
  if (category === "contract") return "contracts" as const;
  if (category === "trade") return "trades" as const;
  if (category === "scouting") return "draft" as const;
  return undefined;
}

function processDeadlines(g: Game, date: string) {
  const dates: Record<string, [ManagementEventCategory, string, string]> = {
    [`${g.year}-12-19`]: [
      "league",
      "Праздничный мораторий на сделки",
      "Торговая активность лиги временно приостановлена.",
    ],
    [`${g.year + 1}-03-05`]: [
      "trade",
      "Trade Deadline — финальный день",
      "Последняя возможность усилить состав или обменять активы перед плей-офф.",
    ],
    [`${g.year + 1}-04-18`]: [
      "league",
      "Финиш регулярного чемпионата",
      "Клубы подводят итоги и готовятся к плей-офф.",
    ],
  };
  const item = dates[date];
  if (!item) return;
  pushEvent(g, {
    date,
    category: item[0],
    priority: item[0] === "trade" ? "critical" : "high",
    title: item[1],
    body: item[2],
    action: categoryAction(item[0]),
    requiresResponse: item[0] === "trade",
    responseDue: item[0] === "trade" ? date : undefined,
  });
}

function adaptAiStrategies(g: Game) {
  if (g.calendar!.day % 14) return;
  for (const team of g.teams) {
    if (team.id === g.user) continue;
    const profile = team.aiProfile!;
    const pointPct = team.record.gp
      ? team.record.pts / (team.record.gp * 2)
      : (team.strengthRating ?? 78) / 100;
    const previous = profile.strategy;
    if (team.record.gp >= 20 && pointPct < 0.42)
      profile.strategy = "draft-lottery";
    else if (team.record.gp >= 20 && pointPct > 0.61)
      profile.strategy = "stanley-cup";
    else if (profile.youthPreference > 72) profile.strategy = "wild-card-hunt";
    else profile.strategy = initialStrategy(team);
    if (previous !== profile.strategy)
      pushEvent(g, {
        date: g.calendar!.date,
        category: "league",
        priority: "normal",
        title: `${team.id} меняет курс: ${profile.strategy}`,
        body: "Руководство скорректировало конкурентное окно после анализа результатов, возраста и активов.",
        teamId: team.id,
      });
  }
}

function aiContractDay(g: Game) {
  if (g.calendar!.day % 11) return;
  const candidates = g.teams
    .filter((team) => team.id !== g.user)
    .flatMap((team) =>
      team.players
        .filter((player) => player.years <= 1 && player.age < 34)
        .map((player) => ({ team, player })),
    )
    .sort((a, b) => b.player.ovr - a.player.ovr);
  const candidate =
    candidates[g.calendar!.day % Math.max(1, candidates.length)];
  if (!candidate) return;
  const { team, player } = candidate;
  const years = player.age < 27 ? 4 : 2;
  const salary = Math.max(
    player.salary,
    Number(((player.ovr - 68) * 0.55).toFixed(2)),
  );
  if (payroll(team.players) - player.salary + salary > g.rules.cap) return;
  player.salary = salary;
  player.years = years;
  player.contractExpiryYear = g.year + years;
  player.contractRemainingValue = salary * years;
  pushEvent(g, {
    date: g.calendar!.date,
    category: "contract",
    priority: player.ovr >= 84 ? "high" : "normal",
    title: `${team.id} продлил контракт с ${player.name}`,
    body: `${years} года, $${salary.toFixed(2)}M за сезон. Решение принято с учётом роли и потолка зарплат.`,
    teamId: team.id,
    playerId: player.id,
  });
}

function legalSwap(
  a: Team,
  b: Team,
  aPlayerId: string,
  bPlayerId: string,
  cap: number,
) {
  const pa = a.players.find((player) => player.id === aPlayerId)!;
  const pb = b.players.find((player) => player.id === bPlayerId)!;
  return (
    payroll(a.players) - pa.salary + pb.salary <= cap &&
    payroll(b.players) - pb.salary + pa.salary <= cap
  );
}

function aiTradeDay(g: Game) {
  if (!g.calendar!.day || g.calendar!.day % 17) return;
  const clubs = g.teams.filter((team) => team.id !== g.user);
  const a = clubs[g.calendar!.day % clubs.length];
  const b = clubs[(g.calendar!.day * 7 + 3) % clubs.length];
  if (!a || !b || a === b) return;
  const aProfile = a.aiProfile!;
  const bProfile = b.aiProfile!;
  const aTargets = [...a.players].filter((player) => player.injury <= 0);
  const pa = aTargets.sort((x, y) =>
    aProfile.strategy === "draft-lottery"
      ? y.age - x.age || y.salary - x.salary
      : tradeValue(x) - tradeValue(y),
  )[0];
  if (!pa) return;
  const pb = [...b.players]
    .filter((player) => player.pos === pa.pos && player.injury <= 0)
    .sort(
      (x, y) =>
        Math.abs(tradeValue(x) - tradeValue(pa)) -
        Math.abs(tradeValue(y) - tradeValue(pa)),
    )[0];
  if (!pb || Math.abs(tradeValue(pa) - tradeValue(pb)) > 18) return;
  if (!legalSwap(a, b, pa.id, pb.id, g.rules.cap)) return;
  const aIndex = a.players.indexOf(pa);
  const bIndex = b.players.indexOf(pb);
  a.players[aIndex] = pb;
  b.players[bIndex] = pa;
  autoLines(a);
  autoLines(b);
  const message = `${a.id} получает ${pb.name}; ${b.id} получает ${pa.name}`;
  (g.transactions ??= []).push({ year: g.year, round: g.round, message });
  pushEvent(g, {
    date: g.calendar!.date,
    category: "trade",
    priority: Math.max(pa.ovr, pb.ovr) >= 84 ? "high" : "normal",
    title: `Сделка между ${a.id} и ${b.id}`,
    body: `${message}. Оба клуба сохранили допустимую зарплатную ведомость.`,
  });
}

function processCurrentDay(g: Game) {
  const date = g.calendar!.date;
  processDeadlines(g, date);
  const preseason = g.preseasonFixtures?.find(
    (fixture) => fixture.date === date && !fixture.result,
  );
  if (preseason) {
    const rng = new RNG(g.seed);
    preseason.result = simulateMatch(
      structuredClone(g.teams.find((team) => team.id === preseason.home)!),
      structuredClone(g.teams.find((team) => team.id === preseason.away)!),
      rng,
      false,
    );
    g.seed = rng.seed;
    g.last = preseason.result;
    pushEvent(g, {
      date,
      category: "game",
      priority: "normal",
      title: `Предсезонный матч: ${preseason.away} @ ${preseason.home}`,
      body: "Результат не влияет на таблицу. Используйте матч для проверки сочетаний и тактики.",
    });
  }
  const hasGames =
    g.phase === "playoffs"
      ? g.calendar!.day % 2 === 0
      : g.phase === "regular" && fixtureDate(g, g.round) === date;
  if (hasGames) {
    const before = g.round;
    advance(g);
    pushEvent(g, {
      date,
      category: "game",
      priority: "normal",
      title: `Игровой день ${before + 1} завершён`,
      body: "Результаты, статистика, форма и состояние игроков обновлены.",
    });
  } else if (g.phase === "regular" && !preseason) {
    for (const team of g.teams) trainTeam(team);
  }
  adaptAiStrategies(g);
  if (g.calendar!.day % 7 === 0) applyWeeklyMood(g);
  aiContractDay(g);
  aiTradeDay(g);
  g.calendar!.lastProcessedDate = date;
}

export function advanceDay(g: Game) {
  ensureManagementState(g);
  processCurrentDay(g);
  g.calendar!.date = addDays(g.calendar!.date, 1);
  g.calendar!.day++;
}

export type ContinueMode = "day" | "next-game" | "next-event" | "week";

export function continueGame(g: Game, mode: ContinueMode) {
  ensureManagementState(g);
  const startingRound = g.round;
  const startingLast = g.last;
  const existing = new Set(g.events!.map((event) => event.id));
  const limit = mode === "day" ? 1 : mode === "week" ? 7 : 45;
  let days = 0;
  while (days < limit && g.phase !== "offseason") {
    advanceDay(g);
    days++;
    const urgent = g.events!.find(
      (event) =>
        !existing.has(event.id) &&
        !event.resolved &&
        event.requiresResponse &&
        (event.priority === "critical" || event.priority === "high"),
    );
    if (urgent) break;
    if (
      mode === "next-game" &&
      (g.round > startingRound || g.last !== startingLast)
    )
      break;
    if (
      mode === "next-event" &&
      g.events!.some((event) => !existing.has(event.id))
    )
      break;
  }
  return days;
}

export function resolveEvent(g: Game, id: string) {
  ensureManagementState(g);
  const event = g.events!.find((item) => item.id === id);
  if (!event) return;
  event.read = true;
  event.resolved = true;
}

export function selectFranchiseStrategy(g: Game, strategy: FranchiseStrategy) {
  ensureManagementState(g);
  chooseSeasonStrategy(g, strategy);
  addRivalryObjective(g);
  const opening = g.events!.find(
    (event) =>
      event.title === "Утвердите стратегию франшизы" && !event.resolved,
  );
  if (opening) {
    opening.read = true;
    opening.resolved = true;
  }
  pushEvent(g, {
    date: g.calendar!.date,
    category: "organization",
    priority: "normal",
    title: `Стратегия клуба утверждена: ${strategy}`,
    body: "Рекомендации, оценка активов и приоритеты развития теперь учитывают выбранный курс.",
  });
}

export interface AdvisorRecommendation {
  id: string;
  priority: "normal" | "high";
  title: string;
  detail: string;
  action: string;
}

export function advisorRecommendations(g: Game): AdvisorRecommendation[] {
  ensureManagementState(g);
  const team = g.teams.find((club) => club.id === g.user)!;
  const salary = payroll(team.players);
  const recommendations: AdvisorRecommendation[] = [];
  if (g.franchiseStrategy === "draft-lottery")
    recommendations.push({
      id: "rebuild-assets",
      priority: "normal",
      title: "Защитите будущие активы",
      detail:
        "Курс на перестройку повышает приоритет молодых игроков и пиков первых трёх раундов.",
      action: "strategy",
    });
  if (g.franchiseStrategy === "stanley-cup")
    recommendations.push({
      id: "competitive-window",
      priority: "normal",
      title: "Конкурентное окно открыто",
      detail:
        "Ищите усиление верхних звеньев, сохраняя достаточно места под потолком к дедлайну.",
      action: "trades",
    });
  const centers = team.players.filter(
    (player) => player.pos === "C" && player.injury <= 0,
  );
  if (
    centers.length < 4 ||
    centers.filter((player) => player.ovr >= 78).length < 2
  )
    recommendations.push({
      id: "center-depth",
      priority: "high",
      title: "Недостаточная глубина в центре",
      detail: `Доступны ${centers.length} здоровых центров; для четырёх звеньев нужен ещё один вариант.`,
      action: "trades",
    });
  const expiring = team.players.filter(
    (player) => player.years <= 1 && player.ovr >= 78,
  );
  if (expiring.length)
    recommendations.push({
      id: "expiring-core",
      priority: "high",
      title: `Риск потери ключевых игроков: ${expiring.length}`,
      detail: `${expiring
        .slice(0, 2)
        .map((player) => player.name)
        .join(", ")} требуют решения по контракту.`,
      action: "contracts",
    });
  if (g.rules.cap - salary < 3)
    recommendations.push({
      id: "cap-risk",
      priority: "high",
      title: "Опасно мало места под потолком",
      detail: `Свободно $${(g.rules.cap - salary).toFixed(2)}M. Любое усиление потребует расчистить ведомость.`,
      action: "finances",
    });
  const ready = (team.farm ?? []).filter(
    (player) => player.ovr >= 73 && player.age <= 24,
  );
  if (ready.length)
    recommendations.push({
      id: "ahl-ready",
      priority: "normal",
      title: `${ready.length} игроков AHL близки к NHL`,
      detail: `${ready
        .slice(0, 2)
        .map((player) => player.name)
        .join(", ")} готовы получить шанс.`,
      action: "organization",
    });
  return recommendations.slice(0, 4);
}
