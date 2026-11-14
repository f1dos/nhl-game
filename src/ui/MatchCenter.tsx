import { useEffect, useState } from "react";
import type { Game } from "../engine/types";
import { Crest, Panel, Rink } from "./components";
export default function MatchCenter({ game }: { game: Game }) {
  const r = game.last;
  const [cursor, setCursor] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(5);
  useEffect(() => {
    setCursor(0);
    setPlaying(false);
  }, [r]);
  useEffect(() => {
    if (!playing || !r) return;
    const t = setInterval(
      () =>
        setCursor((n) => {
          if (n >= r.events.length) {
            setPlaying(false);
            return n;
          }
          return n + 1;
        }),
      1200 / speed,
    );
    return () => clearInterval(t);
  }, [playing, speed, r]);
  const ru = game.language === "ru";
  if (!r)
    return (
      <Panel title={ru ? "Матч-центр" : "Match center"}>
        <div className="empty">
          {ru
            ? "Сыграйте первый матч кнопкой «Следующий матч»."
            : "Play your first game with Next match."}
        </div>
      </Panel>
    );
  const home = game.teams.find((t) => t.id === r.home)!,
    away = game.teams.find((t) => t.id === r.away)!;
  const event = r.events[cursor - 1];
  const score = cursor === r.events.length ? r.goals : event?.score || [0, 0];
  const time = event?.time || 0;
  return (
    <>
      <div className="scoreboard">
        <div>
          <Crest team={away} size={72} />
          <h2>
            {away.city}
            <small>{away.name}</small>
          </h2>
        </div>
        <div className="score">
          <small>
            {cursor === r.events.length
              ? "FINAL"
              : time > 3600
                ? "OVERTIME"
                : `PERIOD ${Math.min(3, Math.floor(time / 1200) + 1)}`}{" "}
            · {String(Math.floor(time / 60)).padStart(2, "0")}:
            {String(time % 60).padStart(2, "0")}
          </small>
          <b>
            {score[1]} <em>:</em> {score[0]}
          </b>
          <span>
            {ru ? "ГОСТИ" : "AWAY"} <i>•</i> {ru ? "ДОМА" : "HOME"}
          </span>
        </div>
        <div>
          <h2>
            {home.city}
            <small>{home.name}</small>
          </h2>
          <Crest team={home} size={72} />
        </div>
      </div>
      <div className="match-grid">
        <Panel
          title={ru ? "Повтор ключевых событий" : "Key event replay"}
          extra={<span className="tag">2D MATCH VIEW</span>}
        >
          <Rink>
            <span className="ice-word">
              NHL MANAGER <b>26</b>
            </span>
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
          <div className="replay-controls">
            <button onClick={() => setPlaying(!playing)}>
              {playing ? "Ⅱ" : "▶"} {ru ? "Повтор" : "Replay"}
            </button>
            <select
              aria-label="Replay speed"
              value={speed}
              onChange={(e) => setSpeed(+e.target.value)}
            >
              {[1, 2, 5, 10].map((s) => (
                <option key={s} value={s}>
                  ×{s}
                </option>
              ))}
            </select>
            <input
              aria-label="Match timeline"
              type="range"
              min="0"
              max={r.events.length}
              value={cursor}
              onChange={(e) => {
                setPlaying(false);
                setCursor(+e.target.value);
              }}
            />
            <button
              onClick={() => {
                setCursor(r.events.length);
                setPlaying(false);
              }}
            >
              {ru ? "Результат" : "Result"}
            </button>
          </div>
          <p className="note">
            {ru
              ? "Визуализация рассчитанных событий, не физическая симуляция. Тактика применяется к следующему матчу."
              : "Visualization of simulated events, not a physics simulation. Tactics apply to the next match."}
          </p>
        </Panel>
        <Panel title={ru ? "События матча" : "Match events"}>
          <div className="event-feed">
            {r.events
              .slice(0, cursor)
              .filter((e) => e.type !== "shot")
              .reverse()
              .map((e, i) => (
                <div key={i} className={e.type === "goal" ? "goal-event" : ""}>
                  <time>{Math.floor(e.time / 60)}′</time>
                  <span>
                    <strong>{e.player}</strong>
                    <small>
                      {e.team} · {e.text.split(" / ")[ru ? 0 : 1] || e.text}
                    </small>
                  </span>
                  <b>
                    {e.type === "goal"
                      ? "GOAL"
                      : e.type === "penalty"
                        ? "2′"
                        : ""}
                  </b>
                </div>
              ))}
            {!cursor && (
              <p className="empty">
                {ru ? "Нажмите ▶ для просмотра" : "Press ▶ to watch"}
              </p>
            )}
          </div>
        </Panel>
      </div>
      <Panel title={ru ? "Итоговая статистика" : "Final statistics"}>
        <div className="match-stats">
          {[
            ["SOG", r.shots],
            ["xG", r.xg.map((x) => x.toFixed(2))],
            ["PP", r.pp.map((x, i) => `${x}/${r.ppo[i]}`)],
            [
              "SV%",
              r.shots
                .map((n, i) =>
                  n
                    ? (
                        (1 -
                          (r.goals[i] -
                            (r.so && r.goals[i] > r.goals[1 - i] ? 1 : 0)) /
                            n) *
                        100
                      ).toFixed(1)
                    : "—",
                )
                .reverse(),
            ],
          ].map(([label, v]) => (
            <div key={label as string}>
              <b>{(v as (number | string)[])[1]}</b>
              <span>{label}</span>
              <b>{(v as (number | string)[])[0]}</b>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
