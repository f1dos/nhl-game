import { useEffect, useState } from "react";
import type { ScoutFrame } from "../engine/coaching";

export default function ScoutFilm({
  frames,
  ru,
}: {
  frames: ScoutFrame[];
  ru: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (index >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex(index + 1), 500);
    return () => clearTimeout(timer);
  }, [playing, index, frames.length]);
  const frame = frames[index];
  return (
    <div className="scout-film">
      <svg
        viewBox="-32 -15 64 30"
        role="img"
        aria-label={ru ? "Расстановка в эпизоде" : "Recorded positions"}
      >
        <rect x="-30.5" y="-13" width="61" height="26" rx="8" fill="#e4eff3" />
        {[-9, 0, 9].map((x) => (
          <line
            key={x}
            x1={x}
            x2={x}
            y1="-13"
            y2="13"
            stroke={x ? "#6185a3" : "#b76670"}
            strokeWidth=".25"
          />
        ))}
        {[frame.home, frame.away].map((unit, s) =>
          unit.map(([x, z, number], i) => (
            <g key={s + "-" + i}>
              <circle cx={x} cy={z} r="1.05" fill={s ? "#853c43" : "#214e71"} />
              <text
                x={x}
                y={z + 0.42}
                textAnchor="middle"
                fill="white"
                fontSize="1.25"
              >
                {number}
              </text>
            </g>
          )),
        )}
        <circle cx={frame.puck[0]} cy={frame.puck[1]} r=".55" fill="#090909" />
      </svg>
      <button
        onClick={() => {
          if (index === frames.length - 1) setIndex(0);
          setPlaying(!playing);
        }}
      >
        {playing
          ? ru
            ? "Пауза"
            : "Pause"
          : ru
            ? "Показать розыгрыш"
            : "Play sequence"}
      </button>
    </div>
  );
}
