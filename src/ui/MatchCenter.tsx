import { useEffect, useState } from "react";
import { Pause, Play, Shield, SlidersHorizontal, Users } from "lucide-react";
import type { Game, Player, SpecialTeamsSituation } from "../engine/types";
import { Crest, Panel, Rink } from "./components";
import { swapLineupPlayer } from "../engine/roster";
import {
  ensureSpecialTeams,
  setSpecialTeamPlayer,
  SPECIAL_TEAM_LABELS,
  SPECIAL_TEAM_STYLES,
} from "../engine/tactics";

type Edit = (fn: (game: Game) => void) => void;

export default function MatchCenter({
  game,
  edit,
  onComplete,
}: {
  game: Game;
  edit: Edit;
  onComplete?: () => void;
}) {
  const result = game.last;
  const [cursor, setCursor] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [control, setControl] = useState<"lines" | "tactics" | "special">(
    "lines",
  );
  useEffect(() => {
    setCursor(0);
    setRunning(false);
  }, [result]);
  useEffect(() => {
    if (!running || !result) return;
    const timer = setInterval(
      () =>
        setCursor((current) => {
          if (current >= result.events.length) {
            setRunning(false);
            return current;
          }
          const previousPeriod = Math.floor(
            (result.events[current - 1]?.time ?? 0) / 1200,
          );
          const nextPeriod = Math.floor(
            (result.events[current]?.time ?? 0) / 1200,
          );
          if (current > 0 && nextPeriod > previousPeriod) {
            setRunning(false);
            return current;
          }
          return current + 1;
        }),
      900 / speed,
    );
    return () => clearInterval(timer);
  }, [running, speed, result]);
  const ru = game.language === "ru";
  if (!result)
    return (
      <Panel title={ru ? "Матч-центр" : "Match center"}>
        <div className="empty">
          {ru
            ? "Следующий матч ещё не начался."
            : "The next game has not started."}
        </div>
      </Panel>
    );
  const home = game.teams.find((team) => team.id === result.home)!;
  const away = game.teams.find((team) => team.id === result.away)!;
  const managed = game.teams.find((team) => team.id === game.user)!;
  ensureSpecialTeams(managed);
  const event = result.events[Math.max(0, cursor - 1)];
  const complete = cursor >= result.events.length;
  const score = complete ? result.goals : (event?.score ?? [0, 0]);
  const elapsed = complete ? result.duration : (event?.time ?? 0);
  const period = Math.min(4, Math.floor(elapsed / 1200) + 1);
  const clock = complete
    ? "00:00"
    : `${String(19 - Math.floor((elapsed % 1200) / 60)).padStart(2, "0")}:${String(59 - (elapsed % 60)).padStart(2, "0")}`;
  const visibleEvents = result.events
    .slice(0, cursor)
    .filter((item) => item.type !== "shot")
    .reverse();
  const activeIds = new Set<string>(
    event?.skaters?.[result.home === game.user ? 0 : 1] ?? [],
  );
  const updateLine = (
    group: "lines" | "defense",
    row: number,
    slot: number,
    playerId: string,
  ) =>
    edit((current) => {
      const team = current.teams.find((club) => club.id === current.user)!;
      swapLineupPlayer(team, group, row, slot, playerId);
    });
  const selector = (
    value: string,
    candidates: Player[],
    onChange: (id: string) => void,
    key?: string,
    disabledIds: string[] = [],
  ) => (
    <select
      key={key}
      value={value}
      onChange={(change) => onChange(change.target.value)}
    >
      {candidates
        .filter(
          (player) =>
            player.injury === 0 &&
            (!disabledIds.includes(player.id) || player.id === value),
        )
        .map((player) => (
          <option key={player.id} value={player.id}>
            {player.name} · {player.pos} · {player.ovr}
          </option>
        ))}
    </select>
  );
  return (
    <div className="live-match-center">
      <section className="live-scoreboard">
        <div>
          <Crest team={away} size={60} />
          <span>
            <b>{away.city}</b>
            <small>{away.name}</small>
          </span>
        </div>
        <div>
          <small>{complete ? "FINAL" : `PERIOD ${period} · ${clock}`}</small>
          <strong>
            {score[1]} <i>:</i> {score[0]}
          </strong>
          <em className={running ? "live" : "paused"}>
            {complete ? "ЗАВЕРШЁН" : running ? "LIVE" : "ПАУЗА"}
          </em>
        </div>
        <div>
          <span>
            <b>{home.city}</b>
            <small>{home.name}</small>
          </span>
          <Crest team={home} size={60} />
        </div>
      </section>
      <div className="live-match-layout">
        <section className="live-ice-panel">
          <header>
            <b>МАТЧ В РЕАЛЬНОМ ВРЕМЕНИ</b>
            <div>
              <button onClick={() => setRunning(!running)} disabled={complete}>
                {running ? <Pause size={15} /> : <Play size={15} />}{" "}
                {running ? "Пауза" : cursor ? "Продолжить" : "Начать матч"}
              </button>
              <select
                value={speed}
                onChange={(change) => setSpeed(+change.target.value)}
              >
                <option value={1}>×1</option>
                <option value={2}>×2</option>
                <option value={4}>×4</option>
              </select>
              {complete && onComplete && (
                <button className="primary" onClick={onComplete}>
                  Пресс-конференция
                </button>
              )}
            </div>
          </header>
          <Rink>
            {event && (
              <>
                <span
                  className="ice-player"
                  style={{
                    left: `${event.x}%`,
                    top: `${event.y}%`,
                    background:
                      event.team === home.id ? home.color : away.color,
                  }}
                >
                  {event.team}
                </span>
                <span
                  className="puck"
                  style={{ left: `${event.x + 4}%`, top: `${event.y + 2}%` }}
                />
              </>
            )}
          </Rink>
          <div className="live-shift">
            <span>НА ЛЬДУ</span>
            {managed.players
              .filter((player) => activeIds.has(player.id))
              .map((player) => (
                <b key={player.id}>{player.name}</b>
              ))}
          </div>
        </section>
        <section className="live-feed">
          <header>
            <b>СОБЫТИЯ</b>
            <span>{visibleEvents.length}</span>
          </header>
          {visibleEvents.map((item, index) => (
            <div
              key={`${item.time}-${index}`}
              className={item.type === "goal" ? "goal-event" : ""}
            >
              <time>{Math.floor(item.time / 60)}′</time>
              <span>
                <b>{item.player}</b>
                <small>{item.text.split(" / ")[0]}</small>
              </span>
              <em>
                {item.type === "goal"
                  ? "ГОЛ"
                  : item.type === "penalty"
                    ? "2′"
                    : ""}
              </em>
            </div>
          ))}
          {!visibleEvents.length && (
            <p>Матч начнётся после команды главного тренера.</p>
          )}
        </section>
        <aside className="live-bench">
          <nav>
            <button
              className={control === "lines" ? "active" : ""}
              onClick={() => setControl("lines")}
            >
              <Users size={15} /> Звенья
            </button>
            <button
              className={control === "tactics" ? "active" : ""}
              onClick={() => setControl("tactics")}
            >
              <SlidersHorizontal size={15} /> Тактика
            </button>
            <button
              className={control === "special" ? "active" : ""}
              onClick={() => setControl("special")}
            >
              <Shield size={15} /> Спецбригады
            </button>
          </nav>
          {control === "lines" ? (
            <div className="live-line-editor">
              <small>ИЗМЕНЕНИЯ ПРИМЕНЯЮТСЯ СО СЛЕДУЮЩЕЙ СМЕНЫ</small>
              {managed.lines.map((line, row) => (
                <section key={row}>
                  <b>Звено {row + 1}</b>
                  {line.map((id, slot) =>
                    selector(
                      id,
                      managed.players.filter(
                        (player) => !["D", "G"].includes(player.pos),
                      ),
                      (next) => updateLine("lines", row, slot, next),
                      `f-${row}-${slot}`,
                    ),
                  )}
                </section>
              ))}
              {managed.defense.map((pair, row) => (
                <section key={`d-${row}`}>
                  <b>Пара D{row + 1}</b>
                  {pair.map((id, slot) =>
                    selector(
                      id,
                      managed.players.filter((player) => player.pos === "D"),
                      (next) => updateLine("defense", row, slot, next),
                      `d-${row}-${slot}`,
                    ),
                  )}
                </section>
              ))}
              <section>
                <b>Вратарь</b>
                {selector(
                  managed.goalie,
                  managed.players.filter((player) => player.pos === "G"),
                  (next) =>
                    edit((current) => {
                      current.teams.find(
                        (club) => club.id === current.user,
                      )!.goalie = next;
                    }),
                )}
              </section>
            </div>
          ) : control === "tactics" ? (
            <div className="live-tactics">
              <label>
                Форчек
                <select
                  value={managed.tactics.forecheck}
                  onChange={(change) =>
                    edit((current) => {
                      current.teams.find(
                        (club) => club.id === current.user,
                      )!.tactics.forecheck = change.target
                        .value as typeof managed.tactics.forecheck;
                    })
                  }
                >
                  <option>1-2-2</option>
                  <option>2-1-2</option>
                  <option>1-3-1</option>
                </select>
              </label>
              {(["pace", "physical", "shooting"] as const).map((key) => (
                <label key={key}>
                  {key}
                  <input
                    type="range"
                    min="20"
                    max="90"
                    value={managed.tactics[key]}
                    onChange={(change) =>
                      edit((current) => {
                        current.teams.find(
                          (club) => club.id === current.user,
                        )!.tactics[key] = +change.target.value;
                      })
                    }
                  />
                  <b>{managed.tactics[key]}</b>
                </label>
              ))}
              <p>
                <Shield size={15} /> Поставьте матч на паузу и скорректируйте
                план. Новое сочетание выходит на следующую смену.
              </p>
            </div>
          ) : (
            <div className="live-special-teams">
              <small>ИЗМЕНЕНИЯ СО СЛЕДУЮЩЕГО ВЫХОДА БРИГАДЫ</small>
              {(
                Object.keys(SPECIAL_TEAM_LABELS) as SpecialTeamsSituation[]
              ).map((situation) => {
                const unit = ensureSpecialTeams(managed)[situation]!;
                return (
                  <section key={situation}>
                    <header>
                      <b>{SPECIAL_TEAM_LABELS[situation]}</b>
                      <select
                        aria-label={`${situation} style`}
                        value={unit.style}
                        onChange={(change) =>
                          edit((current) => {
                            ensureSpecialTeams(
                              current.teams.find(
                                (club) => club.id === current.user,
                              )!,
                            )[situation]!.style = change.target
                              .value as typeof unit.style;
                          })
                        }
                      >
                        {SPECIAL_TEAM_STYLES[situation].map((style) => (
                          <option key={style}>{style}</option>
                        ))}
                      </select>
                    </header>
                    {unit.players.map((id, slot) =>
                      selector(
                        id,
                        managed.players.filter((player) => player.pos !== "G"),
                        (next) =>
                          edit((current) =>
                            setSpecialTeamPlayer(
                              current.teams.find(
                                (club) => club.id === current.user,
                              )!,
                              situation,
                              slot,
                              next,
                            ),
                          ),
                        `${situation}-${slot}`,
                        unit.players,
                      ),
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
