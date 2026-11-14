import { useMemo, useState } from "react";
import {
  AlertTriangle,
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
  resolveEvent,
  selectFranchiseStrategy,
} from "../engine/management";
import type {
  FranchiseStrategy,
  Game,
  ManagementEvent,
  Player,
} from "../engine/types";
import { readiness } from "../engine/training";
import { autoLines } from "../engine/database";
import { Panel } from "./components";

type Edit = (fn: (game: Game) => void) => void;

const strategyCopy: Record<
  FranchiseStrategy,
  { ru: string; en: string; ruText: string; enText: string }
> = {
  "win-now": {
    ru: "Победа сейчас",
    en: "Win Now",
    ruText: "Результат сегодня, опыт и усиление перед плей-офф.",
    enText: "Prioritize immediate results, experience and deadline additions.",
  },
  balanced: {
    ru: "Баланс",
    en: "Balanced",
    ruText: "Сохранять конкурентоспособность без потери будущих активов.",
    enText: "Stay competitive without sacrificing the future.",
  },
  rebuild: {
    ru: "Перестройка",
    en: "Rebuild",
    ruText: "Молодёжь, драфт-пики и расчистка долгосрочной ведомости.",
    enText: "Youth, draft capital and long-term cap flexibility.",
  },
  "youth-development": {
    ru: "Развитие молодёжи",
    en: "Youth Development",
    ruText: "Игровое время и развитие проспектов важнее быстрых побед.",
    enText: "Prospect ice time and development outweigh short-term wins.",
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
}: {
  event: ManagementEvent;
  ru: boolean;
  go: (page: string) => void;
  edit: Edit;
}) {
  return (
    <div className={`agenda-row ${event.priority}`}>
      <span className="agenda-priority">
        {event.priority === "critical" || event.priority === "high" ? (
          <AlertTriangle size={17} />
        ) : (
          <Mail size={17} />
        )}
      </span>
      <div>
        <small>
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
          <button onClick={() => go(event.action!)}>
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
  const ru = game.language === "ru";
  const assets = game.draftAssets!.filter(
    (asset) => asset.currentTeam === game.user,
  );
  const team = game.teams.find((club) => club.id === game.user)!;
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
              ? "Выбор влияет на рекомендации, оценку активов и поведение организации."
              : "Your choice shapes recommendations, asset values and organizational behavior."}
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
              className={active ? "active" : ""}
              onClick={() => edit((g) => selectFranchiseStrategy(g, strategy))}
            >
              <span>{active ? <Check size={18} /> : <Target size={18} />}</span>
              <strong>{ru ? copy.ru : copy.en}</strong>
              <p>{ru ? copy.ruText : copy.enText}</p>
              <small>
                {active
                  ? ru
                    ? "ТЕКУЩИЙ КУРС"
                    : "CURRENT DIRECTION"
                  : ru
                    ? "ВЫБРАТЬ"
                    : "SELECT"}
              </small>
            </button>
          );
        })}
      </div>
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
            {game.franchiseStrategy === "rebuild"
              ? ru
                ? "Топ-10 пик"
                : "Top-10 pick"
              : ru
                ? "Плей-офф"
                : "Playoffs"}
          </strong>
          <span>{ru ? "оценка в конце сезона" : "reviewed at season end"}</span>
        </div>
      </div>
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
  const start = addDays(game.calendar!.date, -3);
  const days = Array.from({ length: 21 }, (_, index) => addDays(start, index));
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            {ru ? "ЕДИНЫЙ ИСТОЧНИК ИГРОВОГО ВРЕМЕНИ" : "THE WORLD CLOCK"}
          </span>
          <h1>{ru ? "Календарь клуба" : "Club Calendar"}</h1>
          <p>
            {ru
              ? "Матчи, тренировки, дедлайны, переговоры и решения — по дням."
              : "Games, training, deadlines, negotiations and decisions — day by day."}
          </p>
        </div>
        <span className="season-tag">
          {new Date(`${game.calendar!.date}T00:00:00Z`).toLocaleDateString(
            ru ? "ru-RU" : "en-GB",
            { day: "numeric", month: "long" },
          )}
          <small>{ru ? "ТЕКУЩАЯ ДАТА" : "CURRENT DATE"}</small>
        </span>
      </div>
      <div className="calendar-grid">
        {days.map((date) => {
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
          const current = date === game.calendar!.date;
          return (
            <div
              key={date}
              className={
                current ? "current" : date < game.calendar!.date ? "past" : ""
              }
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
              {fixture && (
                <p className="calendar-game">
                  <CalendarDays size={13} />{" "}
                  {fixture.home === game.user ? "vs" : "@"}{" "}
                  {fixture.home === game.user ? fixture.away : fixture.home}
                </p>
              )}
              {!fixture && !events.length && (
                <p className="calendar-rest">
                  {ru ? "Тренировка / отдых" : "Training / rest"}
                </p>
              )}
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
          ? "Календарь матчей остаётся конфигурируемой симуляцией 82 игр; он не обозначается как официальный календарь NHL."
          : "The 82-game match calendar remains a configurable simulation and is not presented as the official NHL schedule."}
      </p>
    </>
  );
}

export function DecisionInbox({
  game,
  edit,
  go,
}: {
  game: Game;
  edit: Edit;
  go: (page: string) => void;
}) {
  ensureManagementState(game);
  const ru = game.language === "ru";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const events = useMemo(
    () =>
      game.events!.filter(
        (event) =>
          (filter === "all" ||
            (filter === "open" && !event.resolved) ||
            event.category === filter) &&
          `${event.title} ${event.body}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [game.events, filter, query],
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
      <div className="inbox-toolbar">
        <div className="tabs">
          {["all", "open", "trade", "contract", "medical"].map((item) => (
            <button
              key={item}
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              {item === "all"
                ? ru
                  ? "Все"
                  : "All"
                : item === "open"
                  ? ru
                    ? "Требуют решения"
                    : "Needs action"
                  : categoryNames[item]?.[ru ? 0 : 1]}
            </button>
          ))}
        </div>
        <label>
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ru ? "Поиск сообщений…" : "Search messages…"}
          />
        </label>
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
