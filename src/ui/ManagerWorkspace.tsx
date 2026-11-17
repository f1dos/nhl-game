import type { Game, Player, TrainingSession } from "../engine/types";
import {
  ensureTrainingSchedule,
  readiness,
  trainingLoad,
} from "../engine/training";
import { autoLines } from "../engine/database";
import { Panel } from "./components";

const sessions: TrainingSession[] = [
  "rest",
  "recovery",
  "teamwork",
  "tactical",
  "offense",
  "defense",
  "skills",
  "goalie",
  "conditioning",
];
const sessionNames: Record<TrainingSession, string> = {
  rest: "Полный отдых",
  recovery: "Восстановление",
  teamwork: "Командная игра",
  tactical: "Тактическая подготовка",
  offense: "Атака",
  defense: "Оборона",
  skills: "Индивидуальная техника",
  goalie: "Вратарская группа",
  conditioning: "Физическая подготовка",
};
const days = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

export function TrainingCenter({
  game,
  edit,
}: {
  game: Game;
  edit: (fn: (game: Game) => void) => void;
}) {
  const ru = game.language === "ru";
  const team = game.teams.find((club) => club.id === game.user)!;
  const schedule = ensureTrainingSchedule(team);
  const load = trainingLoad(team);
  const ready = readiness(team);
  const updateSession = (
    day: number,
    period: "morning" | "afternoon",
    value: TrainingSession,
  ) =>
    edit((current) => {
      const currentTeam = current.teams.find(
        (club) => club.id === current.user,
      )!;
      ensureTrainingSchedule(currentTeam).days[day][period] = value;
    });
  return (
    <div className="training-hub">
      <div className="page-intro">
        <div>
          <span className="eyebrow">PERFORMANCE DEPARTMENT</span>
          <h1>Недельный план тренировок</h1>
          <p>
            Балансируйте развитие, тактику, физическую нагрузку, отдых и
            восстановление между матчами.
          </p>
        </div>
        <div
          className={`training-load load-${load > 75 ? "high" : load < 40 ? "low" : "normal"}`}
        >
          <small>НАГРУЗКА НЕДЕЛИ</small>
          <b>{load}%</b>
          <span>
            {load > 75
              ? "Высокий риск усталости"
              : load < 40
                ? "Низкая интенсивность"
                : "Сбалансировано"}
          </span>
        </div>
      </div>
      <section className="training-summary">
        <div>
          <small>ГОТОВНОСТЬ СОСТАВА</small>
          <b>{ready.condition}%</b>
          <progress max="100" value={ready.condition} />
        </div>
        <div>
          <small>УСТАВШИЕ</small>
          <b>{ready.tired.length}</b>
          <span>игроков с усталостью 25+</span>
        </div>
        <div>
          <small>ТРАВМИРОВАННЫЕ</small>
          <b>{ready.injured.length}</b>
          <span>не участвуют в развитии</span>
        </div>
        <label>
          <small>ОБЩАЯ ИНТЕНСИВНОСТЬ</small>
          <select
            aria-label="Training intensity"
            value={schedule.intensity}
            onChange={(event) =>
              edit((current) => {
                ensureTrainingSchedule(
                  current.teams.find((club) => club.id === current.user)!,
                ).intensity = event.target.value as typeof schedule.intensity;
              })
            }
          >
            <option value="low">Низкая</option>
            <option value="normal">Нормальная</option>
            <option value="high">Высокая</option>
          </select>
        </label>
      </section>
      <Panel title="РАСПИСАНИЕ ПЕРВОЙ КОМАНДЫ">
        <div className="training-week">
          {schedule.days.map((day, index) => (
            <section
              key={days[index]}
              className={
                index === (team.trainingTicks ?? 0) % 7
                  ? "current-training-day"
                  : ""
              }
            >
              <header>
                <b>{days[index]}</b>
                <small>
                  {index === (team.trainingTicks ?? 0) % 7 ? "СЕГОДНЯ" : ""}
                </small>
              </header>
              <label>
                <span>УТРО</span>
                <select
                  aria-label={`Training ${index} morning`}
                  value={day.morning}
                  onChange={(event) =>
                    updateSession(
                      index,
                      "morning",
                      event.target.value as TrainingSession,
                    )
                  }
                >
                  {sessions.map((session) => (
                    <option key={session} value={session}>
                      {sessionNames[session]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>ДЕНЬ</span>
                <select
                  aria-label={`Training ${index} afternoon`}
                  value={day.afternoon}
                  onChange={(event) =>
                    updateSession(
                      index,
                      "afternoon",
                      event.target.value as TrainingSession,
                    )
                  }
                >
                  {sessions.map((session) => (
                    <option key={session} value={session}>
                      {sessionNames[session]}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className={`day-load ${[day.morning, day.afternoon].some((session) => ["rest", "recovery"].includes(session)) ? "recovery" : "work"}`}
              >
                {[day.morning, day.afternoon].every(
                  (session) => session === "rest",
                )
                  ? "ОТДЫХ"
                  : "ТРЕНИРОВКА"}
              </div>
            </section>
          ))}
        </div>
      </Panel>
      <div className="training-detail-grid">
        <Panel title="БАЛАНС ПРОГРАММЫ">
          <div className="training-balance">
            {sessions.map((session) => {
              const count = schedule.days
                .flatMap((day) => [day.morning, day.afternoon])
                .filter((value) => value === session).length;
              return (
                <div key={session}>
                  <span>{sessionNames[session]}</span>
                  <progress max="6" value={count} />
                  <b>{count}</b>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="РЕКОМЕНДАЦИЯ ШТАБА">
          <div className="about-text">
            <p>
              {ready.tired.length >= 4
                ? "В составе накопилась усталость: добавьте восстановительную сессию и один полный выходной."
                : load > 75
                  ? "Нагрузка чрезмерна. Высокая интенсивность перед матчем повысит усталость и риск травм."
                  : "Текущий план оставляет место для развития и восстановления. Перед серией матчей снизьте интенсивность."}
            </p>
            <p>
              Молодые игроки развиваются быстрее при сочетании профильных
              занятий, высокой мотивации и достаточного отдыха. Травмированные
              проходят только медицинское восстановление.
            </p>
          </div>
        </Panel>
      </div>
      <Panel title="ИНДИВИДУАЛЬНЫЙ ПРОГРЕСС">
        <div className="development-list">
          {team.players
            .filter((player) => player.age < 29)
            .sort((a, b) => b.potential - a.potential)
            .slice(0, 10)
            .map((player) => (
              <div key={player.id}>
                <strong>{player.name}</strong>
                <span>
                  {player.pos} · {player.age}
                </span>
                <span>
                  {player.ovr} / {player.potential} OVR
                </span>
                <span>
                  {Math.round(100 - player.fatigue)}%{" "}
                  {ru ? "готовность" : "condition"}
                </span>
                <progress max="100" value={player.ovr} />
              </div>
            ))}
        </div>
      </Panel>
    </div>
  );
}

export function ManagerWorkspace({
  game,
  edit,
  go,
  onPlayer,
}: {
  game: Game;
  edit: (fn: (game: Game) => void) => void;
  go: (page: string) => void;
  onPlayer: (player: Player) => void;
}) {
  const team = game.teams.find((club) => club.id === game.user)!;
  const state = readiness(team);
  const ru = game.language === "ru";
  return (
    <section className="manager-workspace">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">
            {ru ? "РЕШЕНИЯ ПЕРЕД МАТЧЕМ" : "PRE-MATCH DECISIONS"}
          </span>
          <h2>{ru ? "Повестка менеджера" : "Manager briefing"}</h2>
        </div>
        <span className="readiness-score">
          {state.condition}%
          <small>{ru ? "физическая готовность" : "physical condition"}</small>
        </span>
      </div>
      <div className="decision-grid">
        <div>
          <h3>{ru ? "Доступность состава" : "Lineup availability"}</h3>
          <p>
            {state.injured.length}{" "}
            {ru ? "травмированных в звеньях" : "injured in lineup"} ·{" "}
            {state.tired.length} {ru ? "уставших" : "tired"}
          </p>
          {state.injured.slice(0, 3).map((player) => (
            <button
              className="text-button"
              key={player.id}
              onClick={() => onPlayer(player)}
            >
              {player.name} · {player.injury} {ru ? "шагов" : "steps"}
            </button>
          ))}
          <button
            onClick={() =>
              edit((current) =>
                autoLines(
                  current.teams.find((club) => club.id === current.user)!,
                ),
              )
            }
          >
            {ru ? "Подобрать звенья" : "Select best lineup"}
          </button>
        </div>
        <div>
          <h3>{ru ? "Контрактные решения" : "Contract decisions"}</h3>
          <p>
            {state.expiring.length}{" "}
            {ru
              ? "соглашений заканчиваются в этом сезоне"
              : "deals expire this season"}
          </p>
          <button onClick={() => go("contracts")}>
            {ru ? "Перейти к переговорам" : "Open negotiations"}
          </button>
        </div>
        <div>
          <h3>{ru ? "План подготовки" : "Preparation plan"}</h3>
          <p>
            {ru
              ? "Соберите недельный микроцикл из двух сессий в день."
              : "Build a weekly cycle with two sessions per day."}
          </p>
          <button onClick={() => go("development")}>
            {ru ? "Открыть недельный план" : "Open weekly plan"}
          </button>
        </div>
      </div>
    </section>
  );
}
