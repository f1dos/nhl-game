import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Activity,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import {
  addDays,
  advisorRecommendations,
  ensureManagementState,
  fixtureDate,
  isImportantEvent,
  markEventsRead,
  resolveEvent,
  selectFranchiseStrategy,
} from "../engine/management";
import type {
  FranchiseStrategy,
  Game,
  ManagementEvent,
  Player,
  TrainingSession,
} from "../engine/types";
import { ensureTrainingSchedule, readiness } from "../engine/training";
import { autoLines } from "../engine/database";
import { Panel } from "./components";
import {
  localizeObjective,
  refreshObjectives,
  strategyPolicy,
} from "../engine/strategy";
import { likelyStrategy } from "../engine/franchiseWorld";

type Edit = (fn: (game: Game) => void) => void;

const strategyCopy: Record<
  FranchiseStrategy,
  { ru: string; en: string; ruText: string; enText: string }
> = {
  "draft-lottery": {
    ru: "Draft Lottery Team",
    en: "Draft Lottery Team",
    ruText:
      "Осознанная перестройка: высокий пик, молодёжь и финансовая гибкость.",
    enText:
      "A deliberate rebuild built around lottery odds, youth and cap flexibility.",
  },
  "wild-card-hunt": {
    ru: "Wild Card Hunt",
    en: "Wild Card Hunt",
    ruText:
      "Борьба за 7–8 место конференции без продажи главных активов будущего.",
    enText: "Chase 7th–8th in the conference without selling the core future.",
  },
  "playoff-breakthrough": {
    ru: "Playoff Breakthrough",
    en: "Playoff Breakthrough",
    ruText:
      "Команда обязана выйти в плей-офф и впервые пройти стартовый раунд.",
    enText: "Make the playoffs and prove the club can win its opening series.",
  },
  "stanley-cup": {
    ru: "Stanley Cup Contender",
    en: "Stanley Cup Contender",
    ruText: "Конкурентное окно открыто: цель сезона — Кубок Стэнли.",
    enText:
      "The competitive window is open: the Stanley Cup is the season goal.",
  },
};

const categoryNames: Record<string, [string, string]> = {
  game: ["Матчи", "Games"],
  medical: ["Медицина", "Medical"],
  contract: ["Контракты", "Contracts"],
  trade: ["Обмены", "Trades"],
  scouting: ["Скаутинг", "Scouting"],
  organization: ["Организация", "Organization"],
  league: ["Лига", "League"],
};

export function DailyHeadquarters({
  game,
  edit,
  go,
  onPlayer,
}: {
  game: Game;
  edit: Edit;
  go: (page: string) => void;
  onPlayer: (player: Player) => void;
}) {
  ensureManagementState(game);
  const team = game.teams.find((club) => club.id === game.user)!;
  const condition = readiness(team);
  const ru = game.language === "ru";
  const agenda = game
    .events!.filter(
      (event) => !event.resolved && event.date <= game.calendar!.date,
    )
    .sort((a, b) => {
      const score = { critical: 4, high: 3, normal: 2, low: 1 };
      return score[b.priority] - score[a.priority];
    })
    .slice(0, 4);
  const recommendations = advisorRecommendations(game);
  return (
    <>
      <section className="manager-workspace headquarters">
        <div className="workspace-heading">
          <div>
            <span className="eyebrow">
              {ru ? "ЕЖЕДНЕВНАЯ ПОВЕСТКА" : "DAILY AGENDA"}
            </span>
            <h2>
              {ru
                ? "Штаб генерального менеджера"
                : "General Manager Headquarters"}
            </h2>
          </div>
          <span className="readiness-score">
            {agenda.filter((event) => event.requiresResponse).length}
            <small>
              {ru ? "решений требуют ответа" : "decisions need a response"}
            </small>
          </span>
        </div>
        <div className="agenda-list">
          {agenda.length ? (
            agenda.map((event) => (
              <AgendaRow
                key={event.id}
                event={event}
                ru={ru}
                go={go}
                edit={edit}
              />
            ))
          ) : (
            <div className="agenda-empty">
              <ShieldCheck size={24} />
              <span>
                {ru
                  ? "Срочных решений нет — можно продолжать время."
                  : "No urgent decisions — time can continue."}
              </span>
            </div>
          )}
        </div>
        <div className="club-pulse">
          <button
            onClick={() =>
              edit((g) =>
                autoLines(g.teams.find((club) => club.id === g.user)!),
              )
            }
          >
            <strong>{condition.condition}%</strong>
            <span>{ru ? "готовность состава" : "lineup readiness"}</span>
          </button>
          <button onClick={() => go("injuries")}>
            <strong>{condition.injured.length}</strong>
            <span>{ru ? "травмированы" : "injured"}</span>
          </button>
          <button onClick={() => go("contracts")}>
            <strong>{condition.expiring.length}</strong>
            <span>{ru ? "истекают" : "expiring"}</span>
          </button>
          <button onClick={() => go("development")}>
            <strong>{ru ? "План" : "Plan"}</strong>
            <span>{ru ? "Настроить тренировки" : "Set training plan"}</span>
          </button>
          {condition.injured[0] && (
            <button onClick={() => onPlayer(condition.injured[0])}>
              <strong>{condition.injured[0].name}</strong>
              <span>
                {ru ? "открыть медицинский профиль" : "open medical profile"}
              </span>
            </button>
          )}
        </div>
      </section>
      <Panel
        title={ru ? "РЕКОМЕНДАЦИИ ПОМОЩНИКА" : "ASSISTANT GM RECOMMENDATIONS"}
      >
        <div className="advisor-grid">
          {recommendations.length ? (
            recommendations.map((item) => (
              <button key={item.id} onClick={() => go(item.action)}>
                <span className={item.priority}>
                  <Sparkles size={16} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <ArrowUpRight size={16} />
              </button>
            ))
          ) : (
            <p className="workspace-help">
              {ru
                ? "Состав сбалансирован, критических рисков не обнаружено."
                : "The roster is balanced and no critical risks were found."}
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}

function AgendaRow({
  event,
  ru,
  go,
  edit,
  focused = false,
}: {
  event: ManagementEvent;
  ru: boolean;
  go: (page: string) => void;
  edit: Edit;
  focused?: boolean;
}) {
  const unread = !event.read && !event.resolved;
  return (
    <div
      className={`agenda-row ${event.priority}${focused ? " focused" : ""}${unread ? " unread" : ""}`}
      data-event-id={event.id}
    >
      <span className="agenda-priority">
        {event.priority === "critical" || event.priority === "high" ? (
          <AlertTriangle size={17} />
        ) : (
          <Mail size={17} />
        )}
      </span>
      <div>
        <small>
          {focused && (
            <b className="agenda-new">{ru ? "НОВОЕ" : "NEW"}</b>
          )}
          {categoryNames[event.category]?.[ru ? 0 : 1]} · {event.date}
        </small>
        <strong>{event.title}</strong>
        <p>{event.body}</p>
      </div>
      <div className="agenda-actions">
        {event.responseDue && (
          <small>
            <Clock3 size={12} /> {event.responseDue}
          </small>
        )}
        {event.action && (
          <button
            onClick={() => {
              if (unread) edit((g) => markEventsRead(g, [event.id]));
              go(event.action!);
            }}
          >
            {ru ? "Открыть" : "Open"}
            <ArrowUpRight size={14} />
          </button>
        )}
        <button
          className="icon-button"
          aria-label="Resolve"
          onClick={() => edit((g) => resolveEvent(g, event.id))}
        >
          <Check size={16} />
        </button>
      </div>
    </div>
  );
}

export function StrategyCenter({ game, edit }: { game: Game; edit: Edit }) {
  ensureManagementState(game);
  refreshObjectives(game);
  const ru = game.language === "ru";
  const [pendingStrategy, setPendingStrategy] =
    useState<FranchiseStrategy | null>(null);
  const locked = game.strategySeason === game.year;
  const assets = game.draftAssets!.filter(
    (asset) => asset.currentTeam === game.user,
  );
  const team = game.teams.find((club) => club.id === game.user)!;
  const recommended = likelyStrategy(team);
  const fans = game.fans?.[game.user];
  const rivalries = (game.rivalries ?? []).filter((rivalry) =>
    [rivalry.teamA, rivalry.teamB].includes(game.user),
  );
  const needs = game.teamNeeds?.[game.user] ?? [];
  const young = [
    ...team.players,
    ...(team.farm ?? []),
    ...(team.prospects ?? []),
  ].filter((player) => player.age <= 23);
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            {ru ? "ДОЛГОСРОЧНОЕ УПРАВЛЕНИЕ" : "LONG-TERM MANAGEMENT"}
          </span>
          <h1>{ru ? "Стратегия франшизы" : "Franchise Strategy"}</h1>
          <p>
            {ru
              ? locked
                ? "Курс утверждён до конца сезона. Совет директоров оценивает выполнение задач в реальном времени."
                : "Выберите уровень амбиций один раз на сезон. После подтверждения изменить его нельзя."
              : locked
                ? "The direction is locked for the season. The board tracks every objective in real time."
                : "Choose the club's ambition once per season. The decision cannot be changed afterward."}
          </p>
        </div>
      </div>
      <div className="strategy-grid">
        {(Object.keys(strategyCopy) as FranchiseStrategy[]).map((strategy) => {
          const copy = strategyCopy[strategy];
          const active = game.franchiseStrategy === strategy;
          return (
            <button
              key={strategy}
              className={`${active ? "active" : ""} ${recommended === strategy ? "recommended" : ""}`}
              disabled={locked}
              onClick={() => setPendingStrategy(strategy)}
            >
              <span>{active ? <Check size={18} /> : <Target size={18} />}</span>
              <strong>{ru ? copy.ru : copy.en}</strong>
              <p>{ru ? copy.ruText : copy.enText}</p>
              <small>
                {active
                  ? ru
                    ? "ТЕКУЩИЙ КУРС"
                    : "CURRENT DIRECTION"
                  : locked
                    ? ru
                      ? "ЗАКРЫТО ДО СЛЕДУЮЩЕГО СЕЗОНА"
                      : "LOCKED UNTIL NEXT SEASON"
                    : ru
                      ? "ВЫБРАТЬ"
                      : "SELECT"}
              </small>
              {recommended === strategy && !active && (
                <em>
                  {ru ? "РЕКОМЕНДАЦИЯ РУКОВОДСТВА" : "BOARD RECOMMENDATION"}
                </em>
              )}
            </button>
          );
        })}
      </div>
      {pendingStrategy && !locked && (
        <div
          className="strategy-confirm-backdrop"
          onClick={() => setPendingStrategy(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="eyebrow">
              {ru ? "РЕШЕНИЕ НА ВЕСЬ СЕЗОН" : "SEASON-LONG DECISION"}
            </span>
            <h2>
              {ru
                ? strategyCopy[pendingStrategy].ru
                : strategyCopy[pendingStrategy].en}
            </h2>
            <p>
              {ru
                ? strategyCopy[pendingStrategy].ruText
                : strategyCopy[pendingStrategy].enText}
            </p>
            <div className="confirm-policy">
              <p>
                <b>{ru ? "Состав:" : "Roster:"}</b>{" "}
                {strategyPolicy(pendingStrategy, game.language).roster}
              </p>
              <p>
                <b>{ru ? "Финансы:" : "Finance:"}</b>{" "}
                {strategyPolicy(pendingStrategy, game.language).finance}
              </p>
              <p>
                <b>{ru ? "Пики:" : "Picks:"}</b>{" "}
                {strategyPolicy(pendingStrategy, game.language).picks}
              </p>
            </div>
            <strong>
              {ru
                ? "После подтверждения изменить стратегию до следующего сезона нельзя."
                : "Once confirmed, the strategy cannot be changed until next season."}
            </strong>
            <div>
              <button onClick={() => setPendingStrategy(null)}>
                {ru ? "Вернуться и сравнить" : "Back and compare"}
              </button>
              <button
                className="primary"
                onClick={() => {
                  edit((g) => selectFranchiseStrategy(g, pendingStrategy));
                  setPendingStrategy(null);
                }}
              >
                {ru ? "Утвердить стратегию" : "Confirm strategy"}
              </button>
            </div>
          </section>
        </div>
      )}
      <div className="strategy-metrics">
        <div>
          <small>{ru ? "ДРАФТ-АКТИВЫ" : "DRAFT ASSETS"}</small>
          <strong>{assets.length}</strong>
          <span>
            {assets.filter((asset) => asset.round === 1).length}{" "}
            {ru ? "пика 1-го раунда" : "first-round picks"}
          </span>
        </div>
        <div>
          <small>{ru ? "МОЛОДЁЖНЫЙ ПАЙПЛАЙН" : "YOUTH PIPELINE"}</small>
          <strong>{young.length}</strong>
          <span>
            {young.filter((player) => player.potential >= 82).length}{" "}
            {ru ? "с высоким потенциалом" : "high-potential players"}
          </span>
        </div>
        <div>
          <small>{ru ? "ЦЕЛЬ РУКОВОДСТВА" : "BOARD OBJECTIVE"}</small>
          <strong>
            {game.franchiseStrategy
              ? ru
                ? strategyCopy[game.franchiseStrategy].ru
                : strategyCopy[game.franchiseStrategy].en
              : ru
                ? "Не выбрана"
                : "Not selected"}
          </strong>
          <span>{ru ? "оценка в конце сезона" : "reviewed at season end"}</span>
        </div>
      </div>
      {game.franchiseStrategy && (
        <Panel title={ru ? "ПРАВИЛА ВЫБРАННОГО КУРСА" : "STRATEGY POLICY"}>
          <div className="strategy-policy">
            {(
              [
                ["ROSTER", strategyPolicy(game.franchiseStrategy, game.language).roster],
                [
                  ru ? "МОЛОДЁЖЬ" : "YOUTH",
                  strategyPolicy(game.franchiseStrategy, game.language).youth,
                ],
                [
                  ru ? "ФИНАНСЫ" : "FINANCE",
                  strategyPolicy(game.franchiseStrategy, game.language).finance,
                ],
                [
                  ru ? "ДРАФТ-ПИКИ" : "DRAFT PICKS",
                  strategyPolicy(game.franchiseStrategy, game.language).picks,
                ],
              ] as const
            ).map(([label, text]) => (
              <div key={label}>
                <small>{label}</small>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel
        title={
          ru
            ? "ФАНАТЫ, ДЕРБИ И ПОТРЕБНОСТИ КЛУБА"
            : "FANS, RIVALRIES & CLUB NEEDS"
        }
      >
        <div className="franchise-world-grid">
          <div>
            <small>{ru ? "ФАНАТСКАЯ БАЗА" : "FAN BASE"}</small>
            <strong>{fans?.supporters.toLocaleString() ?? "—"}</strong>
            <p>
              {ru ? "Счастье" : "Happiness"} {fans?.happiness ?? 50}% ·{" "}
              {ru ? "вовлечённость" : "engagement"} {fans?.engagement ?? 50}%
            </p>
            <progress max="100" value={fans?.happiness ?? 50} />
            <span>{fans?.lastChange}</span>
          </div>
          <div>
            <small>{ru ? "ГОРЯЧИЕ ПРОТИВОСТОЯНИЯ" : "HOT RIVALRIES"}</small>
            {rivalries.map((rivalry) => {
              const opponentId =
                rivalry.teamA === game.user ? rivalry.teamB : rivalry.teamA;
              const opponent = game.teams.find(
                (club) => club.id === opponentId,
              );
              return (
                <p key={rivalry.id}>
                  <b>
                    {opponent
                      ? `${opponent.city} ${opponent.name}`
                      : opponentId}
                  </b>
                  <br />
                  {rivalry.label} · {ru ? "накал" : "heat"} {rivalry.heat}
                  <br />
                  {rivalry.seasonWins[game.user] ?? 0} W
                </p>
              );
            })}
            {!rivalries.length && (
              <p>
                {ru
                  ? "Принципиальное дерби формируется результатами."
                  : "A rivalry will emerge through results."}
              </p>
            )}
          </div>
          <div>
            <small>
              {ru ? "ПОЗИЦИИ ДЛЯ УСИЛЕНИЯ" : "POSITIONS TO IMPROVE"}
            </small>
            {needs.map((need) => (
              <p key={need.position}>
                <b>
                  {need.position} · {need.priority}
                </b>
                <br />
                {need.reason}
                <br />
                {ru ? "Бюджет" : "Budget"}: ${need.budget}M
              </p>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title={ru ? "ЗАДАЧИ СОВЕТА ДИРЕКТОРОВ" : "BOARD OBJECTIVES"}>
        <div className="board-status">
          <div>
            <small>{ru ? "ДОВЕРИЕ К МЕНЕДЖЕРУ" : "MANAGER CONFIDENCE"}</small>
            <strong>{game.managerEmployment?.confidence ?? 70}%</strong>
          </div>
          <div>
            <small>{ru ? "СТАТУС" : "STATUS"}</small>
            <strong>{game.managerEmployment?.status ?? "secure"}</strong>
          </div>
          <p>
            {ru
              ? "Провал ключевых задач резко снижает доверие. Два проваленных критических сезона или 0% доверия приводят к увольнению."
              : "Missing key objectives sharply reduces confidence. Two failed critical seasons or 0% confidence results in dismissal."}
          </p>
        </div>
        <div className="objective-list">
          {(game.franchiseObjectives ?? []).map((objective) => (
            <div
              key={objective.id}
              className={`${objective.tier} ${objective.completed ? "complete" : ""}`}
            >
              <span>
                {objective.tier === "critical"
                  ? ru
                    ? "КЛЮЧЕВАЯ"
                    : "CRITICAL"
                  : objective.tier === "major"
                    ? ru
                      ? "ВАЖНАЯ"
                      : "MAJOR"
                    : ru
                      ? "ДОПОЛНИТЕЛЬНАЯ"
                      : "SUPPORTING"}
              </span>
              <div>
                <strong>
                  {localizeObjective(objective, game.language).title}
                </strong>
                <p>{localizeObjective(objective, game.language).detail}</p>
              </div>
              <b>
                {objective.progress} / {objective.target}
              </b>
            </div>
          ))}
          {!game.franchiseObjectives?.length && (
            <div className="agenda-empty">
              {ru
                ? "Сначала выберите стратегию — совет директоров сформирует пакет задач."
                : "Choose a strategy to receive the board objective package."}
            </div>
          )}
        </div>
      </Panel>
      <Panel title={ru ? "БУДУЩИЕ ДРАФТ-ПИКИ" : "FUTURE DRAFT PICKS"}>
        <div className="draft-assets">
          {assets.slice(0, 21).map((asset) => (
            <div key={asset.id}>
              <span>{asset.year}</span>
              <strong>
                {ru ? `${asset.round}-й раунд` : `Round ${asset.round}`}
              </strong>
              <small>
                {asset.originalTeam === game.user
                  ? ru
                    ? "собственный"
                    : "own"
                  : `${ru ? "от" : "from"} ${asset.originalTeam}`}
              </small>
              <b>{asset.value}</b>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

export function DailyCalendar({ game }: { game: Game }) {
  ensureManagementState(game);
  const ru = game.language === "ru";
  const current = new Date(`${game.calendar!.date}T00:00:00Z`);
  const monthStart = new Date(
    Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1),
  );
  const gridStart = addDays(
    monthStart.toISOString().slice(0, 10),
    -((monthStart.getUTCDay() + 6) % 7),
  );
  const days = Array.from({ length: 42 }, (_, index) =>
    addDays(gridStart, index),
  );
  const currentMonth = game.calendar!.date.slice(0, 7);
  const team = game.teams.find((club) => club.id === game.user)!;
  const training = ensureTrainingSchedule(team);
  const trainingNames: Record<TrainingSession, { ru: string; en: string }> = {
    rest: { ru: "Отдых", en: "Rest" },
    recovery: { ru: "Восстановление", en: "Recovery" },
    teamwork: { ru: "Командная игра", en: "Teamwork" },
    tactical: { ru: "Тактика", en: "Tactical" },
    offense: { ru: "Атака", en: "Offense" },
    defense: { ru: "Оборона", en: "Defense" },
    skills: { ru: "Техника", en: "Skills" },
    goalie: { ru: "Вратари", en: "Goalies" },
    conditioning: { ru: "Физика", en: "Conditioning" },
  };
  const stage =
    game.calendar!.date < game.calendar!.seasonStart
      ? ru
        ? "ПРЕДСЕЗОННЫЙ ЛАГЕРЬ"
        : "PRESEASON CAMP"
      : ru
        ? "РЕГУЛЯРНЫЙ СЕЗОН"
        : "REGULAR SEASON";
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            {ru ? "ЕДИНЫЙ ИСТОЧНИК ИГРОВОГО ВРЕМЕНИ" : "THE WORLD CLOCK"}
          </span>
          <h1>{ru ? "Календарь менеджера" : "Manager Calendar"}</h1>
          <p>
            {ru
              ? "Каждый день сезона: сборы, пресса, переговоры, дедлайны, тренировки и матчи."
              : "Every day of the season: camp, press, negotiations, deadlines, training and games."}
          </p>
        </div>
        <span className="season-tag">
          {new Date(`${game.calendar!.date}T00:00:00Z`).toLocaleDateString(
            ru ? "ru-RU" : "en-GB",
            { day: "numeric", month: "long" },
          )}
          <small>{stage}</small>
        </span>
      </div>
      <div className="calendar-grid">
        {days.map((date) => {
          const dayOffset = Math.round(
            (Date.parse(`${date}T00:00:00Z`) -
              Date.parse(`${game.calendar!.date}T00:00:00Z`)) /
              86_400_000,
          );
          const trainingIndex =
            ((((team.trainingTicks ?? 0) + dayOffset) % 7) + 7) % 7;
          const trainingDay = training.days[trainingIndex];
          const round = Array.from({ length: 82 }, (_, index) => index).find(
            (index) => fixtureDate(game, index) === date,
          );
          const fixture =
            round === undefined
              ? undefined
              : game.schedule.find(
                  (item) =>
                    item.round === round &&
                    [item.home, item.away].includes(game.user),
                );
          const events = game.events!.filter((event) => event.date === date);
          const preseason = game.preseasonFixtures?.find(
            (item) => item.date === date,
          );
          const isCurrent = date === game.calendar!.date;
          return (
            <div
              key={date}
              className={`${isCurrent ? "current" : date < game.calendar!.date ? "past" : ""} ${date.startsWith(currentMonth) ? "" : "outside"}`}
            >
              <header>
                <span>
                  {new Date(`${date}T00:00:00Z`).toLocaleDateString(
                    ru ? "ru-RU" : "en-GB",
                    { weekday: "short" },
                  )}
                </span>
                <strong>{date.slice(8)}</strong>
              </header>
              {preseason && (
                <p className="calendar-game preseason">
                  <Activity size={13} /> PRE ·{" "}
                  {preseason.home === game.user ? "vs" : "@"}{" "}
                  {preseason.home === game.user
                    ? preseason.away
                    : preseason.home}
                </p>
              )}
              {fixture && (
                <p className="calendar-game">
                  <CalendarDays size={13} />{" "}
                  {fixture.home === game.user ? "vs" : "@"}{" "}
                  {fixture.home === game.user ? fixture.away : fixture.home}
                </p>
              )}
              <div
                className="calendar-training"
                title={ru ? "План тренировки" : "Training plan"}
              >
                <Activity size={12} />
                <span>
                  {ru
                    ? trainingNames[trainingDay.morning].ru
                    : trainingNames[trainingDay.morning].en}
                </span>
                <span>
                  {ru
                    ? trainingNames[trainingDay.afternoon].ru
                    : trainingNames[trainingDay.afternoon].en}
                </span>
                <b>
                  {
                    [trainingDay.morning, trainingDay.afternoon].filter(
                      (session) => session !== "rest",
                    ).length
                  }
                  /2
                </b>
              </div>
              {events.slice(0, 2).map((event) => (
                <p
                  key={event.id}
                  className={`calendar-event ${event.priority}`}
                >
                  {event.title}
                </p>
              ))}
            </div>
          );
        })}
      </div>
      <p className="note">
        {ru
          ? "Кнопка «Продолжить» по умолчанию двигает время на один день и останавливается на важных решениях. Предсезонные результаты не влияют на таблицу."
          : "Continue advances one day by default and stops for important decisions. Preseason results do not affect the standings."}
      </p>
    </>
  );
}

/** Why Continue stopped and which messages caused it. */
export interface InboxFocus {
  ids: string[];
  from: string;
  to: string;
  days: number;
  matchday: boolean;
}

export function DecisionInbox({
  game,
  edit,
  go,
  focus,
  onDismissFocus,
}: {
  game: Game;
  edit: Edit;
  go: (page: string) => void;
  focus?: InboxFocus | null;
  onDismissFocus?: () => void;
}) {
  ensureManagementState(game);
  const ru = game.language === "ru";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(focus ? "important" : "all");
  const focused = useMemo(() => new Set(focus?.ids ?? []), [focus]);
  const counts = useMemo(() => {
    const open = game.events!.filter((event) => !event.resolved);
    return {
      important: open.filter(
        (event) => !event.read && isImportantEvent(game, event),
      ).length,
      open: open.length,
    };
  }, [game]);
  const events = useMemo(() => {
    const list = game.events!.filter(
      (event) =>
        (filter === "all" ||
          (filter === "important" && isImportantEvent(game, event)) ||
          (filter === "open" && !event.resolved) ||
          event.category === filter) &&
        `${event.title} ${event.body}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    // Messages that stopped the simulation first, then unread important ones;
    // otherwise keep the inbox's newest-first order.
    const rank = (event: ManagementEvent) =>
      focused.has(event.id)
        ? 0
        : filter === "important" && !event.read && !event.resolved
          ? 1
          : 2;
    return list
      .map((event, index) => ({ event, index }))
      .sort((a, b) => rank(a.event) - rank(b.event) || a.index - b.index)
      .map(({ event }) => event);
  }, [game, filter, query, focused]);
  const unreadVisible = events.filter(
    (event) => !event.read && !event.resolved,
  );
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            {ru ? "ЦЕНТР РЕШЕНИЙ" : "DECISION CENTER"}
          </span>
          <h1>{ru ? "Входящие" : "Inbox"}</h1>
          <p>
            {ru
              ? "Сообщения со сроками, контекстом и прямыми действиями."
              : "Messages with deadlines, context and direct actions."}
          </p>
        </div>
      </div>
      {focus && focus.ids.length > 0 && (
        <div className="inbox-stop-banner" role="alert">
          <AlertTriangle size={22} />
          <div>
            <strong>
              {ru
                ? `Игра остановлена ${focus.to}: ${focus.ids.length === 1 ? "получено важное сообщение" : `важных сообщений — ${focus.ids.length}`}`
                : `Game paused on ${focus.to}: ${focus.ids.length === 1 ? "an important message arrived" : `${focus.ids.length} important messages arrived`}`}
            </strong>
            <p>
              {ru
                ? `Прошло дней: ${focus.days} (${focus.from} → ${focus.to}). Обычные сообщения не прерывают продолжение — эти требуют вашего внимания. Новые сообщения отмечены сверху.`
                : `${focus.days} ${focus.days === 1 ? "day" : "days"} simulated (${focus.from} → ${focus.to}). Routine messages never interrupt Continue — these need your attention. New items are highlighted at the top.`}
            </p>
          </div>
          <div className="inbox-stop-actions">
            {focus.matchday && (
              <button className="primary" onClick={() => go("match")}>
                {ru ? "К матчу" : "To matchday"}
              </button>
            )}
            <button
              onClick={() => {
                edit((g) => markEventsRead(g, focus.ids));
                onDismissFocus?.();
              }}
            >
              {ru ? "Понятно" : "Got it"}
            </button>
          </div>
        </div>
      )}
      <div className="inbox-toolbar">
        <div className="tabs">
          {["all", "important", "open", "trade", "contract", "medical"].map(
            (item) => (
              <button
                key={item}
                className={filter === item ? "active" : ""}
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
              >
                {item === "all"
                  ? ru
                    ? "Все"
                    : "All"
                  : item === "important"
                    ? ru
                      ? "Только важные"
                      : "Important only"
                    : item === "open"
                      ? ru
                        ? "Требуют решения"
                        : "Needs action"
                      : categoryNames[item]?.[ru ? 0 : 1]}
                {item === "important" && counts.important > 0 && (
                  <em
                    className="tab-count important"
                    aria-label={ru ? "Непрочитанные важные" : "Unread important"}
                  >
                    {counts.important}
                  </em>
                )}
                {item === "open" && counts.open > 0 && (
                  <em className="tab-count">{counts.open}</em>
                )}
              </button>
            ),
          )}
        </div>
        <div className="inbox-toolbar-actions">
          {unreadVisible.length > 0 && (
            <button
              className="text-button"
              onClick={() =>
                edit((g) =>
                  markEventsRead(
                    g,
                    unreadVisible.map((event) => event.id),
                  ),
                )
              }
            >
              <Check size={14} />
              {ru ? "Прочитать все" : "Mark all read"}
            </button>
          )}
          <label>
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={ru ? "Поиск сообщений…" : "Search messages…"}
            />
          </label>
        </div>
      </div>
      <Panel title={`${ru ? "СООБЩЕНИЯ" : "MESSAGES"} · ${events.length}`}>
        <div className="decision-inbox">
          {events.map((event) => (
            <AgendaRow
              key={event.id}
              event={event}
              ru={ru}
              go={go}
              edit={edit}
              focused={focused.has(event.id)}
            />
          ))}
          {!events.length && (
            <div className="agenda-empty">
              <Mail size={24} />
              {ru
                ? "Сообщений по фильтру нет"
                : "No messages match this filter"}
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}
