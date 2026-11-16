import { useState, type DragEvent } from "react";
import type { Player, Team, SpecialTeamsSituation } from "../engine/types";
import { swapLineupPlayer } from "../engine/roster";
import {
  ensureSpecialTeams,
  SPECIAL_TEAM_LABELS,
  SPECIAL_TEAM_STYLES,
  setSpecialTeamPlayer,
} from "../engine/tactics";
const styleNames: Record<string, string> = {
  umbrella: "Зонт",
  overload: "Перегруз фланга",
  "net-front": "Трафик перед воротами",
  diamond: "Ромб",
  box: "Квадрат",
  wedge: "Клин",
  triangle: "Треугольник",
  aggressive: "Агрессивное давление",
  possession: "Контроль шайбы",
  "protect-lead": "Удержание преимущества",
};

export default function TacticsBoard({
  team,
  change,
  specialOnly = false,
  onPlayer,
}: {
  team: Team;
  change: (fn: (team: Team) => void) => void;
  specialOnly?: boolean;
  onPlayer?: (player: Player) => void;
}) {
  const [line, setLine] = useState(0);
  const [pair, setPair] = useState(0);
  const [situation, setSituation] = useState(specialOnly ? "5v4" : "5v5");
  const [selected, setSelected] = useState<number | null>(null);
  const unit =
    situation === "5v5"
      ? undefined
      : ensureSpecialTeams(team)[situation as SpecialTeamsSituation];
  const ids = unit
    ? [...unit.players, ...(situation === "6v5" ? [] : [team.goalie])]
    : [...team.lines[line], ...team.defense[pair], team.goalie];
  const spots =
    unit?.players.length === 3
      ? [
          [30, 35],
          [70, 35],
          [50, 64],
        ]
      : unit?.players.length === 4
        ? [
            [30, 30],
            [70, 30],
            [30, 62],
            [70, 62],
          ]
        : unit?.players.length === 6
          ? [
              [23, 25],
              [50, 18],
              [77, 25],
              [23, 52],
              [77, 52],
              [50, 70],
            ]
          : [
              [23, 30],
              [50, 23],
              [77, 30],
              [32, 61],
              [68, 61],
              [50, 86],
            ];
  const slot = selected ?? 0;
  const goalie = ids[slot] === team.goalie && slot === ids.length - 1;
  const candidates = team.players.filter(
    (p) =>
      !p.injury &&
      (goalie
        ? p.pos === "G"
        : unit
          ? p.pos !== "G" &&
            (!unit.players.includes(p.id) || p.id === ids[slot])
          : slot < 3
            ? !["D", "G"].includes(p.pos)
            : p.pos === "D"),
  );
  const placePlayer = (target: number, playerId: string) =>
    change((t) => {
      const targetGoalie =
        target === ids.length - 1 && ids[target] === team.goalie;
      if (targetGoalie) t.goalie = playerId;
      else if (unit) {
        const currentUnit =
          ensureSpecialTeams(t)[situation as SpecialTeamsSituation]!;
        const occupied = currentUnit.players.indexOf(playerId);
        if (occupied >= 0 && occupied !== target)
          [currentUnit.players[target], currentUnit.players[occupied]] = [
            currentUnit.players[occupied],
            currentUnit.players[target],
          ];
        else
          setSpecialTeamPlayer(
            t,
            situation as SpecialTeamsSituation,
            target,
            playerId,
          );
      } else
        swapLineupPlayer(
          t,
          target < 3 ? "lines" : "defense",
          target < 3 ? line : pair,
          target < 3 ? target : target - 3,
          playerId,
        );
    });
  const dropAt = (event: DragEvent, target: number) => {
    event.preventDefault();
    const playerId = event.dataTransfer.getData("application/x-player-id");
    if (playerId) placePlayer(target, playerId);
    setSelected(target);
  };
  return (
    <section className="tactics-board-shell">
      <header>
        <div>
          <small>ТРЕНЕРСКАЯ ДОСКА</small>
          <h2>Сочетания на льду</h2>
        </div>
        <select
          aria-label="Формат игры"
          value={situation}
          onChange={(e) => {
            setSituation(e.target.value);
            setSelected(null);
          }}
        >
          {!specialOnly && <option value="5v5">Равные составы · 5 на 5</option>}
          {Object.entries(SPECIAL_TEAM_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </header>
      {!unit && (
        <div className="board-unit-tabs">
          <span>Нападение</span>
          {[0, 1, 2, 3].map((n) => (
            <button
              key={n}
              aria-pressed={line === n}
              onClick={() => {
                setLine(n);
                setSelected(null);
              }}
            >
              Звено {n + 1}
            </button>
          ))}
          <span>Защита</span>
          {[0, 1, 2].map((n) => (
            <button
              key={n}
              aria-pressed={pair === n}
              onClick={() => {
                setPair(n);
                setSelected(null);
              }}
            >
              Пара {n + 1}
            </button>
          ))}
        </div>
      )}
      {unit && (
        <label>
          Схема спецбригады{" "}
          <select
            value={unit.style}
            onChange={(e) =>
              change((t) => {
                ensureSpecialTeams(t)[
                  situation as SpecialTeamsSituation
                ]!.style = e.target.value as typeof unit.style;
              })
            }
          >
            {SPECIAL_TEAM_STYLES[situation as SpecialTeamsSituation].map(
              (style) => (
                <option key={style} value={style}>
                  {styleNames[style]}
                </option>
              ),
            )}
          </select>
        </label>
      )}
      <div className="board-workspace">
        <div className="tactics-ice">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <rect
              x="1"
              y="1"
              width="98"
              height="98"
              rx="17"
              fill="#cfe1e8"
              stroke="#7694a3"
            />
            <path
              d="M2 50H98 M8 15H92 M8 85H92"
              stroke="#c55665"
              strokeWidth=".5"
            />
            <path d="M2 36H98 M2 66H98" stroke="#5b96b6" strokeWidth="1" />
            <circle cx="50" cy="50" r="10" fill="none" stroke="#5b96b6" />
            {[25, 75].flatMap((x) =>
              [23, 77].map((y) => (
                <circle
                  key={`${x}-${y}`}
                  cx={x}
                  cy={y}
                  r="9"
                  fill="none"
                  stroke="#c55665"
                  strokeWidth=".4"
                />
              )),
            )}
            <path
              d="M44 6H56V10H44Z M44 90H56V94H44Z"
              fill="none"
              stroke="#c55665"
            />
          </svg>
          {ids.map((id, index) => {
            const p = team.players.find((p) => p.id === id);
            const spot = p?.pos === "G" ? [50, 86] : (spots[index] ?? [50, 50]);
            return (
              <button
                draggable
                key={`${index}-${id}`}
                className={`ice-nameplate ${selected === index ? "selected" : ""}`}
                style={{ left: `${spot[0]}%`, top: `${spot[1]}%` }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-player-id", id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => dropAt(event, index)}
                onClick={() => {
                  setSelected(index);
                  if (p) onPlayer?.(p);
                }}
              >
                <small>
                  {p?.pos} · {p?.ovr}
                </small>
                <strong>{p?.name ?? "Выберите игрока"}</strong>
                <span>Готовность {Math.round(100 - (p?.fatigue ?? 0))}%</span>
              </button>
            );
          })}
        </div>
        <aside className="board-roster">
          <h3>
            {selected === null ? "Выберите позицию на льду" : "Замена игрока"}
          </h3>
          <p>
            Перетащите игрока на позицию или нажмите на фамилию. Занятые игроки
            меняются местами.
          </p>
          {selected !== null &&
            candidates.map((p) => (
              <button
                draggable
                key={p.id}
                className={p.id === ids[slot] ? "selected" : ""}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-player-id", p.id);
                }}
                onClick={() => placePlayer(slot, p.id)}
              >
                <b>{p.name}</b>
                <span>
                  {p.pos} · {p.ovr} OVR · {Math.round(100 - p.fatigue)}%
                </span>
              </button>
            ))}
        </aside>
      </div>
    </section>
  );
}
