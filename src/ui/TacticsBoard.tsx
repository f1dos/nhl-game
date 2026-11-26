import { useState, type DragEvent } from "react";
import type { Player, Team, SpecialTeamsSituation } from "../engine/types";
import { swapLineupPlayer } from "../engine/roster";
import {
  ensureSpecialTeams,
  SPECIAL_TEAM_LABELS,
  SPECIAL_TEAM_STYLES,
  setSpecialTeamPlayer,
} from "../engine/tactics";
import Select from "./Select";
const styleNames: Record<string, string> = {
  umbrella: "Зонтик · розыгрыш через вершину",
  overload: "Перегруз сильного фланга",
  "net-front": "Экран на пятаке",
  diamond: "Ромб",
  box: "Квадрат",
  wedge: "Клин",
  triangle: "Треугольник",
  aggressive: "Агрессивное давление",
  possession: "Позиционный розыгрыш",
  "protect-lead": "Удержание преимущества",
};

// Slots follow the roster order: forwards first, then defenders.
type Spots = number[][];
const shapes: Record<string, Record<number, Spots>> = {
  umbrella: {4:[[50,17],[23,36],[77,36],[50,57]],5:[[31,17],[68,17],[23,42],[77,42],[50,57]],6:[[30,17],[70,17],[50,31],[19,45],[81,45],[50,60]]},
  overload: {4:[[28,17],[22,37],[53,27],[40,59]],5:[[27,17],[22,37],[53,28],[32,60],[73,51]],6:[[27,16],[20,37],[52,31],[75,21],[32,60],[77,52]]},
  "net-front": {4:[[50,15],[26,28],[57,40],[73,58]],5:[[50,15],[22,32],[78,32],[32,53],[68,53]],6:[[50,15],[20,32],[80,32],[50,40],[29,59],[71,59]]},
  possession: {3:[[22,27],[76,38],[45,57]],4:[[21,26],[74,21],[68,47],[31,55]],5:[[22,25],[74,21],[50,38],[22,55],[77,55]],6:[[20,27],[48,17],[80,27],[50,39],[26,58],[74,58]]},
  box: {4:[[30,40],[70,40],[31,66],[69,66]],5:[[26,38],[74,38],[50,52],[28,68],[72,68]]},
  diamond: {3:[[50,41],[29,62],[71,62]],4:[[50,35],[23,53],[77,53],[50,69]],5:[[50,32],[22,48],[78,48],[35,68],[65,68]]},
  triangle: {3:[[24,47],[74,47],[50,68]]},
  wedge: {3:[[50,38],[35,64],[66,64]]},
  aggressive: {3:[[23,29],[64,43],[45,64]],4:[[23,29],[63,35],[34,55],[69,67]],5:[[23,27],[66,34],[48,45],[26,63],[72,66]]},
  "protect-lead": {3:[[50,50],[28,68],[72,68]],4:[[35,48],[65,48],[27,69],[73,69]],5:[[50,42],[23,53],[77,53],[34,69],[66,69]]},
};
export function unitSpots(style: string, count: number): Spots {
  return shapes[style]?.[count] ?? (shapes.possession[count] ?? []);
}

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
  const spots = unit ? unitSpots(unit.style, unit.players.length) : [[23,30],[50,23],[77,30],[32,61],[68,61]];
  const zone = !unit || situation === "3v3" ? "full"
    : Number(situation[0]) > Number(situation[2]) ? "attack" : "defend";
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
        <Select
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
        </Select>
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
          <Select
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
          </Select>
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
            {zone === "full" ? <>
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
            </> : <g transform={zone === "defend" ? "translate(0 100) scale(1 -1)" : undefined}>
              <path d="M4 12H96" stroke="#c55665" strokeWidth=".6"/>
              <path d="M2 71H98" stroke="#5b96b6" strokeWidth="1.4"/>
              <path d="M44 12V8H56V12 M44 12a6 6 0 0 0 12 0" fill="none" stroke="#c55665" strokeWidth=".65"/>
              {[26,74].map(x=><g key={x}><circle cx={x} cy={38} r={13} fill="none" stroke="#c55665" strokeWidth=".5"/><circle cx={x} cy={38} r={1} fill="#c55665"/></g>)}
            </g>}
            {unit && <polyline points={spots.map(([x,y]) => x+","+y).join(" ")} fill="none" stroke="#216778" strokeWidth=".65" strokeDasharray="2 1.1" opacity=".75" />}
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
