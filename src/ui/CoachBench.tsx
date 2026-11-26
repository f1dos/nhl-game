import ScoutFilm from "./ScoutFilm";
import { useState } from "react";
import { scoutBrief } from "../engine/coaching";
import type { Team, Result } from "../engine/types";

type Translate = (ru: string, en: string) => string;
export const stamp = (s: number) =>
  Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

export function OpponentBrief({
  opponent,
  marked,
  change,
  tr,
}: {
  opponent: Team;
  marked?: string;
  change: (id?: string) => void;
  tr: Translate;
}) {
  const brief = scoutBrief(opponent);
  if (!brief) return null;
  const { target, games, examples } = brief;
  return (
    <section className="coach-report">
      <h3>{tr("Доклад скаута", "Opponent scouting")}</h3>
      <p>
        <strong>{target.name}</strong> ·{" "}
        {examples.length
          ? tr(
              "Лидер доступных форвардов по сумме xG за последние матчи",
              "Leads available forwards in recent xG",
            ) +
            " · " +
            games
          : tr(
              "Предварительная оценка по точности броска. Матчевых примеров пока нет.",
              "Initial assessment from shooting accuracy. No recorded shot samples yet.",
            )}
      </p>
      {examples.map((e, i) => (
        <details key={i}>
          <summary>
            {stamp(e.time)} · {e.opponent} ·{" "}
            {e.goal ? tr("гол", "goal") : tr("бросок", "shot")} ·{" "}
            {e.xg.toFixed(2)} xG
          </summary>
          <p>
            {tr("На льду", "On ice")} ·{" "}
            {(e.teammates ?? [])
              .map((id) => opponent.players.find((p) => p.id === id)?.name)
              .filter(Boolean)
              .join(", ")}
          </p>
          {e.film && <ScoutFilm frames={e.film} ru={tr("ru", "en") === "ru"} />}
        </details>
      ))}
      <p>
        {tr(
          "Ближний защитник закроет адресата на пятаке. Дальняя штанга останется второму защитнику.",
          "The first defender shadows the target in the slot. The other defender has to cover the back post.",
        )}
      </p>
      <button
        aria-pressed={marked === target.id}
        onClick={() => change(marked === target.id ? undefined : target.id)}
      >
        {marked === target.id
          ? tr("Отменить персональную опеку", "Cancel marking assignment")
          : tr("Назначить опеку на этот матч", "Mark for this game")}
      </button>
    </section>
  );
}
export function MatchupReport({
  result,
  tr,
}: {
  result: Result;
  tr: Translate;
}) {
  const [expanded, expand] = useState(false);
  const rows = [...(result.matchups ?? [])].sort(
    (a, b) => b.seconds - a.seconds,
  );
  const scout = result.scoutTarget,
    shots = scout
      ? result.events.filter(
          (e) =>
            e.playerId === scout.id && (e.type === "shot" || e.type === "goal"),
        )
      : [];
  return (
    <section className="coach-report">
      <h3>{tr("Разбор штаба", "Coaching review")}</h3>
      {scout && (
        <p>
          <b>{scout.name}</b> ·{" "}
          {scout.marked
            ? tr("персональная опека", "marked")
            : tr("зонная защита", "zonal coverage")}{" "}
          · {tr("броски сегодня", "shots tonight")} {shots.length} ·{" "}
          {shots.reduce((n, e) => n + (e.xg ?? 0), 0).toFixed(2)} xG
          {scout.games > 0 && (
            <>
              {" "}
              · {tr("до игры за матч", "previous shots/game")}{" "}
              {(scout.priorShots / scout.games).toFixed(1)} ({scout.games})
            </>
          )}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <p>
            {tr(
              "Сочетания 5×5. Время совместно на льду, броски и голы в порядке хозяева — гости.",
              "Five-on-five matchups. Shared ice time, shots and goals in home–away order.",
            )}
          </p>
          <table>
            <thead>
              <tr>
                {[
                  result.home,
                  result.away,
                  tr("Время", "Time"),
                  tr("Броски", "Shots"),
                  tr("Голы", "Goals"),
                ].map((v, i) => (
                  <th key={i}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, expanded ? rows.length : 3).map((r) => (
                <tr key={r.home + "-" + r.away}>
                  <td>{r.home + 1}</td>
                  <td>{r.away + 1}</td>
                  <td>{stamp(r.seconds)}</td>
                  <td>{r.shots.join("–")}</td>
                  <td>{r.goals.join("–")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 3 && (
            <button onClick={() => expand(!expanded)}>
              {expanded
                ? tr("Свернуть", "Collapse")
                : tr("Все сочетания", "All matchups")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
