import type {
  FranchiseObjective,
  FranchiseStrategy,
  Game,
  ManagerEmployment,
  ObjectiveMetric,
  ObjectiveTier,
} from "./types";

export const STRATEGY_LABELS: Record<
  FranchiseStrategy,
  { ru: string; en: string }
> = {
  "draft-lottery": { ru: "Draft Lottery Team", en: "Draft Lottery Team" },
  "wild-card-hunt": { ru: "Wild Card Hunt", en: "Wild Card Hunt" },
  "playoff-breakthrough": {
    ru: "Playoff Breakthrough",
    en: "Playoff Breakthrough",
  },
  "stanley-cup": { ru: "Stanley Cup Contender", en: "Stanley Cup Contender" },
};

export const STRATEGY_POLICIES: Record<
  FranchiseStrategy,
  {
    roster: string;
    youth: string;
    finance: string;
    picks: string;
    veteranContractFactor: number;
    youngContractFactor: number;
  }
> = {
  "draft-lottery": {
    roster:
      "Ветераны доступны для обмена; игровое время получают игроки до 24 лет.",
    youth: "Максимальный приоритет развития и терпение к ошибкам молодёжи.",
    finance:
      "Не брать длинные дорогие контракты; сохранить минимум $8M пространства.",
    picks: "Пики 1–3 раундов защищены и оцениваются выше текущего усиления.",
    veteranContractFactor: 1.12,
    youngContractFactor: 0.95,
  },
  "wild-card-hunt": {
    roster: "Сбалансированный состав без продажи главных будущих активов.",
    youth: "Молодёжь получает шанс, если готова помогать уже сейчас.",
    finance: "Сохранить $4M для точечного усиления по ходу сезона.",
    picks: "Первый раунд защищён; средние пики можно использовать в сделках.",
    veteranContractFactor: 1,
    youngContractFactor: 1,
  },
  "playoff-breakthrough": {
    roster: "Приоритет глубины, спецбригад и игроков с опытом плей-офф.",
    youth: "Развитие продолжается, но место в составе нужно заслужить.",
    finance: "Допустимо использовать почти весь потолок для победы в серии.",
    picks: "Пики после первого раунда доступны ради игрока основного состава.",
    veteranContractFactor: 0.97,
    youngContractFactor: 1.02,
  },
  "stanley-cup": {
    roster:
      "Только готовые к Кубку игроки; слабые позиции усиливаются немедленно.",
    youth: "Проспекты могут стать обменными активами ради звезды или глубины.",
    finance:
      "Использовать весь потолок, но не создавать неконтролируемый долг.",
    picks: "Будущие пики доступны ради игрока, меняющего шансы на Кубок.",
    veteranContractFactor: 0.92,
    youngContractFactor: 1.05,
  },
};

type ObjectiveTemplate = Omit<
  FranchiseObjective,
  "id" | "season" | "progress" | "completed" | "evaluated"
>;

const objective = (
  tier: ObjectiveTier,
  metric: ObjectiveMetric,
  title: string,
  detail: string,
  target: number,
): ObjectiveTemplate => ({ tier, metric, title, detail, target });

function templates(strategy: FranchiseStrategy): ObjectiveTemplate[] {
  if (strategy === "draft-lottery")
    return [
      objective(
        "critical",
        "conference-finish",
        "Не жертвовать перестройкой",
        "Завершить сезон не выше 12-го места конференции и сохранить шанс на высокий пик.",
        12,
      ),
      objective(
        "major",
        "young-nhl-players",
        "Омолодить основу",
        "Дать постоянное место в NHL минимум шести игрокам не старше 24 лет.",
        6,
      ),
      objective(
        "supporting",
        "cap-space",
        "Сохранить финансовую гибкость",
        "Закончить сезон минимум с $8M свободного пространства.",
        8,
      ),
      objective(
        "supporting",
        "premium-draft-picks",
        "Накопить капитал драфта",
        "Сохранить или получить минимум девять пиков первых трёх раундов на три года.",
        9,
      ),
    ];
  if (strategy === "wild-card-hunt")
    return [
      objective(
        "critical",
        "playoff-qualification",
        "Остаться в гонке за Wild Card",
        "Завершить сезон в зоне плей-офф.",
        1,
      ),
      objective(
        "major",
        "conference-finish",
        "Финишировать в первой восьмёрке",
        "Занять 7–8 место конференции или выше.",
        8,
      ),
      objective(
        "supporting",
        "young-nhl-players",
        "Не остановить развитие",
        "Сохранить минимум четырёх молодых игроков в составе NHL.",
        4,
      ),
      objective(
        "supporting",
        "cap-space",
        "Резерв на дедлайн",
        "Сохранить минимум $4M пространства под потолком.",
        4,
      ),
    ];
  if (strategy === "playoff-breakthrough")
    return [
      objective(
        "critical",
        "playoff-round-wins",
        "Пройти первый раунд",
        "Победить минимум в одной серии плей-офф.",
        1,
      ),
      objective(
        "major",
        "playoff-qualification",
        "Уверенно выйти в плей-офф",
        "Попадание в плей-офф обязательно.",
        1,
      ),
      objective(
        "supporting",
        "team-morale",
        "Сохранить раздевалку",
        "Средняя мораль основного состава должна быть не ниже 70.",
        70,
      ),
    ];
  return [
    objective(
      "critical",
      "stanley-cup",
      "Выиграть Кубок Стэнли",
      "Любой другой итог сезона не соответствует конкурентному окну клуба.",
      1,
    ),
    objective(
      "major",
      "playoff-round-wins",
      "Дойти минимум до финала конференции",
      "Победить минимум в двух сериях плей-офф.",
      2,
    ),
    objective(
      "supporting",
      "conference-finish",
      "Домашний лёд",
      "Завершить регулярный сезон в топ-4 конференции.",
      4,
    ),
    objective(
      "supporting",
      "team-morale",
      "Кубковая атмосфера",
      "Средняя мораль состава должна быть не ниже 75.",
      75,
    ),
  ];
}

export function defaultEmployment(): ManagerEmployment {
  return {
    confidence: 70,
    status: "secure",
    seasonsReviewed: 0,
    criticalFailures: 0,
  };
}

export function createSeasonObjectives(
  strategy: FranchiseStrategy,
  season: number,
): FranchiseObjective[] {
  return templates(strategy).map((item, index) => ({
    ...item,
    id: `${season}-${strategy}-${index}`,
    season,
    progress: 0,
    completed: false,
    evaluated: false,
  }));
}

function conferencePosition(g: Game) {
  const user = g.teams.find((team) => team.id === g.user)!;
  const table = g.teams
    .filter((team) => team.conference === user.conference)
    .sort(
      (a, b) =>
        b.record.pts - a.record.pts ||
        b.record.w - a.record.w ||
        b.record.gf - b.record.ga - (a.record.gf - a.record.ga),
    );
  return table.findIndex((team) => team.id === g.user) + 1;
}

export function objectiveProgress(g: Game, metric: ObjectiveMetric) {
  const team = g.teams.find((club) => club.id === g.user)!;
  if (metric === "conference-finish") return conferencePosition(g);
  if (metric === "playoff-qualification")
    return g.bracket[0]?.some((series) => [series.a, series.b].includes(g.user))
      ? 1
      : 0;
  if (metric === "playoff-round-wins")
    return g.bracket.filter((round) =>
      round.some((series) => series.winner === g.user),
    ).length;
  if (metric === "stanley-cup")
    return g.history.some(
      (entry) => entry.year === g.year && entry.champion === g.user,
    )
      ? 1
      : 0;
  if (metric === "young-nhl-players")
    return team.players.filter((player) => player.age <= 24).length;
  if (metric === "cap-space")
    return Math.max(
      0,
      g.rules.cap -
        team.players.reduce((sum, player) => sum + player.salary, 0),
    );
  if (metric === "premium-draft-picks")
    return (g.draftAssets ?? []).filter(
      (asset) => asset.currentTeam === g.user && asset.round <= 3,
    ).length;
  if (metric === "rivalry-wins")
    return (g.rivalries ?? [])
      .filter((rivalry) => [rivalry.teamA, rivalry.teamB].includes(g.user))
      .reduce((sum, rivalry) => sum + (rivalry.seasonWins[g.user] ?? 0), 0);
  return (
    team.players.reduce((sum, player) => sum + player.morale, 0) /
    Math.max(1, team.players.length)
  );
}

function objectiveMet(objective: FranchiseObjective, progress: number) {
  if (objective.metric === "conference-finish") {
    if (objective.title === "Не жертвовать перестройкой")
      return progress >= objective.target;
    return progress <= objective.target;
  }
  return progress >= objective.target;
}

export function refreshObjectives(g: Game, evaluated = false) {
  for (const item of g.franchiseObjectives ?? []) {
    item.progress = Number(objectiveProgress(g, item.metric).toFixed(1));
    item.completed = objectiveMet(item, item.progress);
    if (evaluated) item.evaluated = true;
  }
}

export function chooseSeasonStrategy(g: Game, strategy: FranchiseStrategy) {
  if (g.strategySeason === g.year)
    throw Error("Стратегия на этот сезон уже утверждена");
  g.franchiseStrategy = strategy;
  g.strategySeason = g.year;
  g.franchiseObjectives = createSeasonObjectives(strategy, g.year);
  g.managerEmployment ??= defaultEmployment();
  const team = g.teams.find((club) => club.id === g.user)!;
  team.aiProfile && (team.aiProfile.strategy = strategy);
  if (strategy === "draft-lottery") team.training = "balanced";
  if (strategy === "stanley-cup") team.training = "recovery";
  refreshObjectives(g);
}

export function reviewSeasonStrategy(g: Game) {
  if (!g.franchiseObjectives?.length || g.strategySeason !== g.year) return;
  if (g.franchiseObjectives.every((objective) => objective.evaluated)) return;
  refreshObjectives(g, true);
  const employment = (g.managerEmployment ??= defaultEmployment());
  let delta = 0;
  for (const item of g.franchiseObjectives) {
    const weight =
      item.tier === "critical" ? 35 : item.tier === "major" ? 16 : 7;
    delta += item.completed ? Math.ceil(weight * 0.35) : -weight;
    if (item.tier === "critical" && !item.completed)
      employment.criticalFailures++;
  }
  employment.confidence = Math.max(
    0,
    Math.min(100, employment.confidence + delta),
  );
  employment.seasonsReviewed++;
  employment.lastReview = `${g.year}/${String(g.year + 1).slice(2)}`;
  employment.status =
    employment.confidence <= 0 || employment.criticalFailures >= 2
      ? "fired"
      : employment.confidence < 25
        ? "final-warning"
        : employment.confidence < 50
          ? "under-pressure"
          : "secure";
  g.news.unshift(
    employment.status === "fired"
      ? `Совет директоров уволил генерального менеджера ${g.user}: доверие ${employment.confidence}%.`
      : `Оценка генерального менеджера ${g.user}: ${employment.status}, доверие ${employment.confidence}%.`,
  );
}

export function contractStrategyFactor(g: Game, teamId: string, age: number) {
  if (teamId !== g.user || !g.franchiseStrategy) return 1;
  const policy = STRATEGY_POLICIES[g.franchiseStrategy];
  return age <= 24
    ? policy.youngContractFactor
    : age >= 30
      ? policy.veteranContractFactor
      : 1;
}
