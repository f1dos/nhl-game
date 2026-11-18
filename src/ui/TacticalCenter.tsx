import { useState } from "react";
import type { Player, Team } from "../engine/types";
import TacticsBoard from "./TacticsBoard";
import IceTimePanel from "./IceTimePanel";

export default function TacticalCenter({
  team,
  change,
  initial = "lines",
  onPlayer,
  language,
}: {
  team: Team;
  change: (fn: (team: Team) => void) => void;
  initial?: "lines" | "special" | "icetime" | "plan";
  onPlayer?: (player: Player) => void;
  language?: string;
}) {
  const [tab, setTab] = useState(initial);
  const controls = [
    [
      "pace",
      "Темп",
      20,
      90,
      50,
      "Быстрый переход в атаку повышает нагрузку на игроков.",
    ],
    [
      "shooting",
      "Частота бросков",
      20,
      90,
      50,
      "Больше завершений; меньше времени на подготовку момента.",
    ],
    [
      "physical",
      "Силовая игра",
      20,
      90,
      50,
      "Агрессивный отбор повышает риск удаления.",
    ],
    [
      "width",
      "Ширина атаки",
      20,
      90,
      50,
      "Широкие позиции открывают фланги, но удлиняют передачи.",
    ],
    [
      "passingRisk",
      "Передачи и риск",
      20,
      90,
      50,
      "Больше передач ускоряет розыгрыш, но оставляет шайбу свободной чаще.",
    ],
  ] as const;
  return (
    <div className="tactical-center">
      <header className="tactical-heading">
        <div>
          <small>COACHING DEPARTMENT</small>
          <h1>Тактика и звенья</h1>
          <p>План команды, сочетания и специальные ситуации на одной доске.</p>
        </div>
        <div className="plan-badge">
          {team.tactics.forecheck}
          <small>ФОРЧЕК</small>
        </div>
      </header>
      <nav className="spatial-tabs" aria-label="Разделы тактического центра">
        {(["lines", "special", "icetime", "plan"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {value === "lines"
              ? "Тактика и звенья"
              : value === "special"
                ? "Спецбригады"
                : value === "icetime"
                  ? "Игровое время"
                  : "Командный план"}
          </button>
        ))}
      </nav>
      {tab === "icetime" && (
        <IceTimePanel
          team={team}
          change={change}
          language={language}
          onPlayer={onPlayer}
        />
      )}
      {(tab === "lines" || tab === "special") && (
        <TacticsBoard
          key={tab}
          team={team}
          change={change}
          specialOnly={tab === "special"}
          onPlayer={onPlayer}
        />
      )}
      <section className="tactical-plan">
        <header>
          <h2>Командные инструкции</h2>
          <p>
            Изменения используются при следующем расчёте; в live-матче — по ходу
            игры и при сменах.
          </p>
        </header>
        <div className="forecheck-cards">
          {(["1-2-2", "2-1-2", "1-3-1"] as const).map((scheme, i) => (
            <button
              key={scheme}
              aria-pressed={team.tactics.forecheck === scheme}
              onClick={() =>
                change((t) => {
                  t.tactics.forecheck = scheme;
                })
              }
            >
              <strong>{scheme}</strong>
              <b>
                {
                  [
                    "Сбалансированный прессинг",
                    "Давление двумя форвардами",
                    "Контроль средней зоны",
                  ][i]
                }
              </b>
              <span>
                {
                  [
                    "Поддержка за шайбой и умеренное давление.",
                    "Ближе к сопернику, больше пространства за первой линией.",
                    "Компактная структура, более осторожный выход в атаку.",
                  ][i]
                }
              </span>
            </button>
          ))}
        </div>
        <div className="instruction-grid">
          {controls.map(([key, label, min, max, fallback, hint]) => (
            <label key={key}>
              <div>
                <b>{label}</b>
                <output>
                  {team.tactics[key] ?? fallback}
                </output>
              </div>
              <input
                aria-label={label}
                type="range"
                min={min}
                max={max}
                value={team.tactics[key] ?? fallback}
                onChange={(e) =>
                  change((t) => {
                    t.tactics[key] = +e.target.value;
                  })
                }
              />
              <small>{hint}</small>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
