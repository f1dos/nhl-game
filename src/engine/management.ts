import { ensurePotentialModel } from "./potential";
import { autoLines } from "./database";
import { advance, dateForRound } from "./season";
import { simulateMatch } from "./match";
import { RNG } from "./random";
import { payroll, tradeValue } from "./trades";
import { processFreeAgentOffers } from "./freeAgency";
import { ensureTrainingSchedule, trainTeam } from "./training";
import { ensureSpecialTeams } from "./tactics";
import {
  chooseSeasonStrategy,
  defaultEmployment,
  STRATEGY_LABELS,
} from "./strategy";
import {
  addRivalryObjective,
  applyWeeklyMood,
  ensureFranchiseWorld,
} from "./franchiseWorld";
import { generateInboxEvents, newImportantEvents } from "./inbox";
import { textFor } from "./text";
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

export function initialStrategy(team: Team): FranchiseStrategy {
  const core = [...team.players].sort((a, b) => b.ovr - a.ovr).slice(0, 18);
  const rating =
    core.reduce((sum, player) => sum + player.ovr, 0) / core.length;
  const age = core.reduce((sum, player) => sum + player.age, 0) / core.length;
  const modeled = team.strengthRating ?? rating;
  if (modeled >= 82 || rating >= 81.5) return "stanley-cup";
  if (modeled >= 79 || rating >= 79) return "playoff-breakthrough";
  if (modeled < 76 || rating < 76) return "draft-lottery";
  return age < 25 && modeled < 77 ? "draft-lottery" : "wild-card-hunt";
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

const STRATEGY_EVENT_TITLES = [
  "Утвердите стратегию франшизы",
  "Approve the franchise strategy",
];
const isStrategyEvent = (event: ManagementEvent) =>
  event.action === "strategy" && STRATEGY_EVENT_TITLES.includes(event.title);

function seedOpeningEvents(g: Game) {
  const t = textFor(g);
  const team = g.teams.find((club) => club.id === g.user)!;
  pushEvent(g, {
    date: g.calendar!.date,
    category: "organization",
    priority: "high",
    title: t("Утвердите стратегию франшизы", "Approve the franchise strategy"),
    body: t(
      "Владелец ждёт выбранное направление развития клуба на сезон.",
      "The owner is waiting for the club's chosen direction for the season.",
    ),
    action: "strategy",
    requiresResponse: true,
    responseDue: addDays(g.calendar!.date, 7),
  });
  pushEvent(g, {
    date: g.calendar!.date,
    category: "organization",
    priority: "normal",
    title: t(
      "Назначьте капитана и двух ассистентов",
      "Name a captain and two alternates",
    ),
    body: t(
      "Тренерский штаб подготовил рейтинг лидеров. Решение повлияет на атмосферу и обсуждение целей сезона.",
      "The coaching staff has ranked the leaders. The decision will shape the room and the discussion of season goals.",
    ),
    action: "leadership",
    requiresResponse: false,
    responseDue: addDays(g.calendar!.date, 10),
  });
  const injured = team.players.filter((player) => player.injury > 0);
  if (injured.length)
    pushEvent(g, {
      date: g.calendar!.date,
      category: "medical",
      priority: "high",
      title: t(
        `Медицинский отчёт: недоступны ${injured.length}`,
        `Medical report: ${injured.length} unavailable`,
      ),
      body: `${injured
        .slice(0, 3)
        .map((player) => player.name)
        .join(", ")}. ${t(
        "Проверьте состав и варианты замены из AHL.",
        "Review the lineup and AHL replacement options.",
      )}`,
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
      title: t(
        `${expiring.length} контрактов требуют планирования`,
        `${expiring.length} contracts require planning`,
      ),
      body: t(
        "Финансовый отдел подготовил список соглашений, истекающих после сезона.",
        "The finance department has listed the contracts expiring after the season.",
      ),
      action: "contracts",
      requiresResponse: false,
    });
}

function ensureStrategyEvent(g: Game) {
  if (
    g.strategySeason === g.year ||
    g.events!.some((event) => isStrategyEvent(event) && !event.resolved)
  )
    return;
  const t = textFor(g);
  pushEvent(g, {
    date: g.calendar!.date,
    category: "organization",
    priority: "critical",
    title: t("Утвердите стратегию франшизы", "Approve the franchise strategy"),
    body: t(
      "До продолжения сезона совет директоров требует выбрать уровень спортивных амбиций и принять задачи.",
      "Before the season continues, the board requires you to set the level of ambition and accept the objectives.",
    ),
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
  ensurePotentialModel(g);
  ensureFranchiseWorld(g);
  g.draftAssets ??= initialDraftAssets(g);
  for (const team of g.teams) {
    team.aiProfile ??= createProfile(team);
    ensureSpecialTeams(team);
    ensureTrainingSchedule(team);
  }
  // Repair careers created by the old youth-preference rule, which could put
  // nearly the entire AI league into Wild Card Hunt.
  const aiTeams = g.teams.filter((team) => team.id !== g.user);
  if (
    aiTeams.length > 0 &&
    aiTeams.filter((team) => team.aiProfile?.strategy === "wild-card-hunt")
      .length >=
      aiTeams.length * 0.8
  )
    aiTeams.forEach((team) => {
      team.aiProfile!.strategy = initialStrategy(team);
    });
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
  const t = textFor(g);
  const dates: Record<string, [ManagementEventCategory, string, string]> = {
    [`${g.year}-12-19`]: [
      "league",
      t("Праздничный мораторий на сделки", "Holiday trade freeze"),
      t(
        "Торговая активность лиги временно приостановлена.",
        "League trading activity is temporarily suspended.",
      ),
    ],
    [`${g.year + 1}-03-05`]: [
      "trade",
      t("Trade Deadline — финальный день", "Trade Deadline — final day"),
      t(
        "Последняя возможность усилить состав или обменять активы перед плей-офф.",
        "Last chance to strengthen the roster or move assets before the playoffs.",
      ),
    ],
    [`${g.year + 1}-04-18`]: [
      "league",
      t("Финиш регулярного чемпионата", "Regular season finish"),
      t(
        "Клубы подводят итоги и готовятся к плей-офф.",
        "Clubs take stock and prepare for the playoffs.",
      ),
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
    const ratingStrategy = initialStrategy(team);
    if (team.record.gp >= 20 && pointPct < 0.42)
      profile.strategy = "draft-lottery";
    else if (team.record.gp >= 20 && pointPct > 0.61)
      profile.strategy = "stanley-cup";
    else profile.strategy = ratingStrategy;
    if (previous !== profile.strategy)
      pushEvent(g, {
        date: g.calendar!.date,
        category: "league",
        priority: "normal",
        title: textFor(g)(
          `${team.id} меняет курс: ${profile.strategy}`,
          `${team.id} changes direction: ${STRATEGY_LABELS[profile.strategy].en}`,
        ),
        body: textFor(g)(
          "Руководство скорректировало конкурентное окно после анализа результатов, возраста и активов.",
          "Management adjusted its competitive window after reviewing results, age and assets.",
        ),
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
    title: textFor(g)(
      `${team.id} продлил контракт с ${player.name}`,
      `${team.id} extended ${player.name}`,
    ),
    body: textFor(g)(
      `${years} года, $${salary.toFixed(2)}M за сезон. Решение принято с учётом роли и потолка зарплат.`,
      `${years} years, $${salary.toFixed(2)}M per season. The decision reflects role and cap considerations.`,
    ),
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
  const t = textFor(g);
  const message = t(
    `${a.id} получает ${pb.name}; ${b.id} получает ${pa.name}`,
    `${a.id} acquire ${pb.name}; ${b.id} acquire ${pa.name}`,
  );
  (g.transactions ??= []).push({ year: g.year, round: g.round, message });
  pushEvent(g, {
    date: g.calendar!.date,
    category: "trade",
    priority: Math.max(pa.ovr, pb.ovr) >= 84 ? "high" : "normal",
    title: t(`Сделка между ${a.id} и ${b.id}`, `Trade between ${a.id} and ${b.id}`),
    body: `${message}. ${t(
      "Оба клуба сохранили допустимую зарплатную ведомость.",
      "Both clubs remain cap compliant.",
    )}`,
  });
}

function processCurrentDay(g: Game, completed?: import("./types").Result) {
  const date = g.calendar!.date;
  processDeadlines(g, date);
  const preseason = g.preseasonFixtures?.find(
    (fixture) => fixture.date === date && !fixture.result,
  );
  if (preseason) {
    const rng = new RNG(g.seed);
    preseason.result =
      completed ??
      simulateMatch(
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
      title: textFor(g)(
        `Предсезонный матч: ${preseason.away} @ ${preseason.home}`,
        `Preseason game: ${preseason.away} @ ${preseason.home}`,
      ),
      body: textFor(g)(
        "Результат не влияет на таблицу. Используйте матч для проверки сочетаний и тактики.",
        "The result does not count in the standings. Use the game to test combinations and tactics.",
      ),
    });
  }
  const hasGames =
    g.phase === "playoffs"
      ? g.calendar!.day % 2 === 0
      : g.phase === "regular" && fixtureDate(g, g.round) === date;
  if (hasGames) {
    const before = g.round;
    advance(g, completed);
    pushEvent(g, {
      date,
      category: "game",
      priority: "normal",
      title: textFor(g)(
        `Игровой день ${before + 1} завершён`,
        `Game day ${before + 1} completed`,
      ),
      body: textFor(g)(
        "Результаты, статистика, форма и состояние игроков обновлены.",
        "Results, statistics, form and player condition have been updated.",
      ),
    });
  } else if (g.phase === "regular" && !preseason) {
    for (const team of g.teams) trainTeam(team);
  }
  for (const offer of processFreeAgentOffers(g)) {
    const player =
      g.teams.flatMap((t) => t.players).find((p) => p.id === offer.playerId) ??
      g.freeAgents?.find((p) => p.id === offer.playerId);
    pushEvent(g, {
      date,
      category: "contract",
      priority:
        offer.status === "countered" || offer.status === "signed-elsewhere"
          ? "high"
          : "normal",
      title: `Free agency: ${player?.name ?? offer.playerId} — ${offer.status}`,
      body:
        offer.status === "countered"
          ? `Agent requests ${offer.counterSalary?.toFixed(2)}M AAV and a ${offer.counterRole} role. Counteroffer valid for seven days.`
          : offer.status === "accepted"
            ? "Your proposed contract has been accepted and registered."
            : offer.status === "signed-elsewhere"
              ? `The player signed with ${offer.competingTeamId ?? "another team"}.`
              : "The agent declined the proposal. Review the contract negotiations.",
      action: "contracts",
      teamId: g.user,
      playerId: offer.playerId,
      requiresResponse: offer.status === "countered",
      responseDue: offer.status === "countered" ? addDays(date, 7) : undefined,
    });
  }
  adaptAiStrategies(g);
  if (g.calendar!.day % 7 === 0) applyWeeklyMood(g);
  aiContractDay(g);
  aiTradeDay(g);
  generateInboxEvents(g);
  g.calendar!.lastProcessedDate = date;
}

export function advanceDay(g: Game, completed?: import("./types").Result) {
  ensureManagementState(g);
  processCurrentDay(g, completed);
  g.calendar!.date = addDays(g.calendar!.date, 1);
  g.calendar!.day++;
}

export function isUserMatchday(g: Game) {
  ensureManagementState(g);
  const date = g.calendar!.date;
  if (
    g.preseasonFixtures?.some(
      (fixture) => fixture.date === date && !fixture.result,
    )
  )
    return true;
  if (
    g.phase === "playoffs" &&
    g.calendar!.day % 2 === 0 &&
    g.bracket[g.playoffRound]?.some(
      (series) => !series.winner && [series.a, series.b].includes(g.user),
    )
  )
    return true;
  return (
    g.phase === "regular" &&
    fixtureDate(g, g.round) === date &&
    g.schedule.some(
      (fixture) =>
        fixture.round === g.round &&
        [fixture.home, fixture.away].includes(g.user),
    )
  );
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
    if (mode === "next-game" && isUserMatchday(g)) break;
    advanceDay(g);
    days++;
    // Important messages (critical, or high-priority for the user's club /
    // needing a response) interrupt the simulation; normal ones never do.
    if (newImportantEvents(g, existing).length) break;
    if (isUserMatchday(g)) break;
    if (
      mode === "next-game" &&
      (isUserMatchday(g) || g.round > startingRound || g.last !== startingLast)
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

export {
  isImportantEvent,
  markEventsRead,
  newImportantEvents,
  unreadImportantCount,
} from "./inbox";

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
    (event) => isStrategyEvent(event) && !event.resolved,
  );
  if (opening) {
    opening.read = true;
    opening.resolved = true;
  }
  pushEvent(g, {
    date: g.calendar!.date,
    category: "organization",
    priority: "normal",
    title: textFor(g)(
      `Стратегия клуба утверждена: ${strategy}`,
      `Club strategy approved: ${STRATEGY_LABELS[strategy].en}`,
    ),
    body: textFor(g)(
      "Рекомендации, оценка активов и приоритеты развития теперь учитывают выбранный курс.",
      "Recommendations, asset valuations and development priorities now follow the chosen direction.",
    ),
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
  const t = textFor(g);
  const recommendations: AdvisorRecommendation[] = [];
  if (g.franchiseStrategy === "draft-lottery")
    recommendations.push({
      id: "rebuild-assets",
      priority: "normal",
      title: t("Защитите будущие активы", "Protect future assets"),
      detail: t(
        "Курс на перестройку повышает приоритет молодых игроков и пиков первых трёх раундов.",
        "The rebuild raises the priority of young players and picks from the first three rounds.",
      ),
      action: "strategy",
    });
  if (g.franchiseStrategy === "stanley-cup")
    recommendations.push({
      id: "competitive-window",
      priority: "normal",
      title: t("Конкурентное окно открыто", "The competitive window is open"),
      detail: t(
        "Ищите усиление верхних звеньев, сохраняя достаточно места под потолком к дедлайну.",
        "Look to upgrade the top lines while keeping enough cap space for the deadline.",
      ),
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
      title: t("Недостаточная глубина в центре", "Not enough depth at center"),
      detail: t(
        `Доступны ${centers.length} здоровых центров; для четырёх звеньев нужен ещё один вариант.`,
        `${centers.length} healthy centers are available; another option is needed for four lines.`,
      ),
      action: "trades",
    });
  const expiring = team.players.filter(
    (player) => player.years <= 1 && player.ovr >= 78,
  );
  if (expiring.length)
    recommendations.push({
      id: "expiring-core",
      priority: "high",
      title: t(
        `Риск потери ключевых игроков: ${expiring.length}`,
        `Risk of losing key players: ${expiring.length}`,
      ),
      detail: `${expiring
        .slice(0, 2)
        .map((player) => player.name)
        .join(", ")} ${t(
        "требуют решения по контракту.",
        expiring.slice(0, 2).length === 1
          ? "needs a contract decision."
          : "need contract decisions.",
      )}`,
      action: "contracts",
    });
  if (g.rules.cap - salary < 3)
    recommendations.push({
      id: "cap-risk",
      priority: "high",
      title: t("Опасно мало места под потолком", "Dangerously low cap space"),
      detail: t(
        `Свободно $${(g.rules.cap - salary).toFixed(2)}M. Любое усиление потребует расчистить ведомость.`,
        `$${(g.rules.cap - salary).toFixed(2)}M available. Any addition will require clearing payroll.`,
      ),
      action: "finances",
    });
  const ready = (team.farm ?? []).filter(
    (player) => player.ovr >= 73 && player.age <= 24,
  );
  if (ready.length)
    recommendations.push({
      id: "ahl-ready",
      priority: "normal",
      title: t(
        `${ready.length} игроков AHL близки к NHL`,
        ready.length === 1
          ? "1 AHL player is close to the NHL"
          : `${ready.length} AHL players are close to the NHL`,
      ),
      detail: `${ready
        .slice(0, 2)
        .map((player) => player.name)
        .join(", ")} ${t(
        "готовы получить шанс.",
        ready.slice(0, 2).length === 1
          ? "is ready for an opportunity."
          : "are ready for an opportunity.",
      )}`,
      action: "organization",
    });
  return recommendations.slice(0, 4);
}
