import type { IceTimePreset, Player, Team } from "../engine/types";
import {
  DEFAULT_SHIFT_SECONDS,
  MAX_SHARE,
  applyIceTimePreset,
  forecastIceTime,
  lineWithDoubleShift,
  normalizeShares,
  resolveIceTime,
  setDoubleShift,
  setIceTimeWeight,
} from "../engine/iceTime";

const PRESETS = ["balanced", "top", "roll", "short"] as const;

/** Minutes as m:ss. */
const clock = (minutes: number) => {
  const total = Math.round(minutes * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const surname = (p?: Player) => p?.name.split(" ").slice(-1)[0] ?? "—";

export default function IceTimePanel({
  team,
  change,
  language,
  onPlayer,
}: {
  team: Team;
  change: (fn: (team: Team) => void) => void;
  language?: string;
  onPlayer?: (player: Player) => void;
}) {
  const ru = language !== "en";
  const tr = (a: string, b: string) => (ru ? a : b);
  const plan = resolveIceTime(team);
  const forecast = forecastIceTime(team, plan);
  const byId = (id: string) => team.players.find((p) => p.id === id);
  const forwardShares = normalizeShares(plan.forwards);
  const defenseShares = normalizeShares(plan.defense);
  const shift = team.tactics.shiftSeconds ?? DEFAULT_SHIFT_SECONDS;
  const presetText: Record<
    Exclude<IceTimePreset, "custom">,
    [string, string, string, string]
  > = {
    balanced: [
      "Сбалансированно",
      "Balanced",
      "Первое звено чуть чаще, четвёртое реже.",
      "Top line a bit more, fourth line less.",
    ],
    top: [
      "Ставка на первое звено",
      "Ride the top line",
      "Лидеры играют больше, но устают к концу матча.",
      "Stars play more but fade late in games.",
    ],
    roll: [
      "Четыре звена",
      "Roll four lines",
      "Ровная нагрузка, свежие ноги в третьем периоде.",
      "Even workload, fresh legs in the third.",
    ],
    short: [
      "Короткая скамейка",
      "Shorten the bench",
      "Три звена и две пары; четвёртое звено сидит.",
      "Three lines and two pairs; the 4th line sits.",
    ],
  };
  const doubleCandidates = team.lines
    .slice(0, 3)
    .flat()
    .map(byId)
    .filter((p): p is Player => !!p && !p.injury);
  const warnings = [...forecast.values()]
    .filter((row) => row.overload || row.tired)
    .sort((a, b) => b.minutes - a.minutes);
  const rows = [...forecast.values()].sort((a, b) => b.minutes - a.minutes);

  const unitRow = (
    group: "forwards" | "defense",
    index: number,
    ids: string[],
    share: number,
  ) => {
    const label =
      group === "forwards"
        ? tr(`${index + 1}-е звено`, `Line ${index + 1}`)
        : tr(`${index + 1}-я пара`, `Pair ${index + 1}`);
    const weight = plan[group][index];
    return (
      <div className="icetime-unit" key={`${group}${index}`}>
        <div className="icetime-unit-head">
          <b>{label}</b>
          <output>{Math.round(share)}%</output>
        </div>
        <input
          type="range"
          min={0}
          max={MAX_SHARE}
          value={weight}
          aria-label={label}
          onChange={(e) =>
            change((t) => setIceTimeWeight(t, group, index, +e.target.value))
          }
        />
        <div className="icetime-players">
          {ids.map((id) => {
            const p = byId(id);
            const row = forecast.get(id);
            const doubled = group === "forwards" && index === 3 && id === plan.doubleShift;
            return (
              <button
                key={id}
                className={
                  row?.overload ? "overload" : row?.tired ? "tired" : undefined
                }
                onClick={() => p && onPlayer?.(p)}
                title={p?.name}
              >
                <span>
                  {surname(p)}
                  {doubled ? " ×2" : ""}
                </span>
                <small>{row ? clock(row.minutes) : "—"}</small>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="tactical-plan icetime-panel">
      <header>
        <h2>{tr("Игровое время", "Ice time")}</h2>
        <p>
          {tr(
            "Доля игры в равных составах для каждого звена и пары. Большинство и меньшинство играют спецбригады.",
            "Even-strength share for each line and pair. Power play and penalty kill time goes to special teams.",
          )}
        </p>
      </header>
      <div className="icetime-presets">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            aria-pressed={plan.preset === preset}
            onClick={() => change((t) => applyIceTimePreset(t, preset))}
          >
            <b>{tr(presetText[preset][0], presetText[preset][1])}</b>
            <span>{tr(presetText[preset][2], presetText[preset][3])}</span>
          </button>
        ))}
      </div>
      {plan.preset === "custom" && (
        <p className="icetime-custom">
          {tr("Своя схема — выберите шаблон, чтобы сбросить.", "Custom split — pick a preset to reset.")}
        </p>
      )}
      <div className="icetime-groups">
        <div>
          <h3>{tr("Нападающие", "Forwards")}</h3>
          {team.lines.map((_, i) =>
            unitRow("forwards", i, lineWithDoubleShift(team, i, plan), forwardShares[i]),
          )}
        </div>
        <div>
          <h3>{tr("Защитники", "Defense")}</h3>
          {team.defense.map((pair, i) =>
            unitRow("defense", i, pair, defenseShares[i]),
          )}
          <label className="icetime-option">
            <div>
              <b>{tr("Длина смены", "Shift length")}</b>
              <output>
                {shift} {tr("сек", "sec")}
              </output>
            </div>
            <input
              type="range"
              min={25}
              max={60}
              value={shift}
              aria-label={tr("Длина смены", "Shift length")}
              onChange={(e) =>
                change((t) => {
                  t.tactics.shiftSeconds = +e.target.value;
                })
              }
            />
            <small>
              {tr(
                "Длинные смены сильнее утомляют тех, кто играет много.",
                "Long shifts wear heavy-minute players down faster.",
              )}
            </small>
          </label>
          <label className="icetime-option">
            <div>
              <b>{tr("Двойная смена", "Double-shift")}</b>
            </div>
            <select
              aria-label={tr("Двойная смена", "Double-shift")}
              value={plan.doubleShift ?? ""}
              onChange={(e) =>
                change((t) => setDoubleShift(t, e.target.value || undefined))
              }
            >
              <option value="">{tr("Никто", "Nobody")}</option>
              {doubleCandidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.pos} · {p.ovr}
                </option>
              ))}
            </select>
            <small>
              {tr(
                "Игрок выходит и со своим звеном, и вместо партнёра по позиции в четвёртом.",
                "Plays with his line and also takes a same-position slot on the 4th line.",
              )}
            </small>
          </label>
        </div>
      </div>
      {warnings.length > 0 && (
        <ul className="icetime-warnings">
          {warnings.map((row) => {
            const p = byId(row.id);
            return (
              <li key={row.id} className={row.overload ? "overload" : "tired"}>
                <b>{p?.name}</b> · {clock(row.minutes)} ·{" "}
                {row.overload
                  ? tr(
                      "перегрузка: к третьему периоду теряет скорость и точность.",
                      "overloaded: loses speed and accuracy by the third period.",
                    )
                  : tr(
                      `уже уставший (${Math.round(p?.fatigue ?? 0)}), а минут много.`,
                      `already tired (${Math.round(p?.fatigue ?? 0)}) and playing big minutes.`,
                    )}
              </li>
            );
          })}
        </ul>
      )}
      <details className="icetime-table">
        <summary>
          {tr("Прогноз времени на льду за матч", "Expected ice time per game")}
        </summary>
        <table>
          <thead>
            <tr>
              <th>{tr("Игрок", "Player")}</th>
              <th>{tr("Поз.", "Pos")}</th>
              <th>5×5</th>
              <th>{tr("Бол.", "PP")}</th>
              <th>{tr("Мен.", "PK")}</th>
              <th>{tr("Всего", "Total")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const p = byId(row.id);
              return (
                <tr key={row.id} className={row.overload ? "overload" : undefined}>
                  <td>{p?.name}</td>
                  <td>{p?.pos}</td>
                  <td>{clock(row.even)}</td>
                  <td>{row.powerPlay ? clock(row.powerPlay) : "—"}</td>
                  <td>{row.penaltyKill ? clock(row.penaltyKill) : "—"}</td>
                  <td>
                    <b>{clock(row.minutes)}</b>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </section>
  );
}
