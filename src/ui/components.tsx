import type { ReactNode } from "react";
import {useState} from 'react';
import type { Team, Player } from "../engine/types";
export function Crest({ team, size = 44 }: { team: Team; size?: number }) {
  return (
    <span
      className="crest"
      style={
        {
          "--club": team.color,
          width: size,
          height: size,
        } as React.CSSProperties
      }
    >
      <span>{team.id}</span>
    </span>
  );
}
export function Panel({
  title,
  extra,
  children,
  className = "",
}: {
  title: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-title">
        <h3>{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}
export function Rating({ value }: { value: number }) {
  return (
    <span
      className={`rating ${value >= 80 ? "high" : value < 70 ? "low" : ""}`}
    >
      {value}
    </span>
  );
}
export function PlayerTable({
  players,
  onSelect,
  lang,
}: {
  players: Player[];
  onSelect: (p: Player) => void;
  lang: string;
}) {
  const ru = lang === "ru";
  const [sort,setSort]=useState('default');
  const [available,setAvailable]=useState(false);
  const ordered=players.filter(p=>!available||p.injury===0).slice().sort((a,b)=>sort==='rating'?b.ovr-a.ovr:sort==='points'?b.stats.g+b.stats.a-a.stats.g-a.stats.a:sort==='age'?a.age-b.age:sort==='salary'?b.salary-a.salary:sort==='condition'?a.fatigue-b.fatigue:0);
  return (
    <div className="table-scroll">
      <div className="roster-tools"><label>{ru?'Сортировка':'Sort'} <select aria-label="Player sort" value={sort} onChange={e=>setSort(e.target.value)}>{[['default',ru?'Исходный порядок':'Default'],['rating','OVR ↓'],['points','PTS ↓'],['age',ru?'Возраст ↑':'Age ↑'],['salary','AAV ↓'],['condition',ru?'Готовность ↓':'Condition ↓']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><input type="checkbox" checked={available} onChange={e=>setAvailable(e.target.checked)}/>{ru?' Только здоровые':' Healthy only'}</label><span>{ordered.length} {ru?'игроков':'players'}</span></div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>{ru ? "ИГРОК" : "PLAYER"}</th>
            <th>POS</th>
            <th>{ru ? "ВОЗР." : "AGE"}</th>
            <th>OVR</th>
            <th>GP</th>
            <th>G</th>
            <th>A</th>
            <th>PTS</th>
            <th>+/−</th>
            <th>{ru ? "ГОТОВНОСТЬ" : "CONDITION"}</th>
            <th>{ru ? "ЗАРПЛАТА" : "SALARY"}</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((p) => (
            <tr
              key={p.id}
              onClick={() => onSelect(p)}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onSelect(p)}
            >
              <td className="muted">{p.number}</td>
              <td>
                <strong>{p.name}</strong>
                <small>
                  {p.nation}
                  {p.injury > 0 ? " · ✚" : ""}
                </small>
              </td>
              <td>
                <span className="position">{p.pos}</span>
              </td>
              <td>{p.age}</td>
              <td>
                <Rating value={p.ovr} />
              </td>
              <td>{p.stats.gp}</td>
              <td>{p.stats.g}</td>
              <td>{p.stats.a}</td>
              <td className="bright">{p.stats.g + p.stats.a}</td>
              <td>{p.stats.plus}</td>
              <td>
                <span className="condition">
                  <i style={{ width: `${100 - p.fatigue}%` }} />
                </span>
                <small>{Math.round(100 - p.fatigue)}%</small>
              </td>
              <td>${p.salary.toFixed(2)}M</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Rink({ children }: { children?: ReactNode }) {
  return (
    <div className="rink">
      <svg viewBox="0 0 900 420" aria-hidden="true">
        <rect
          x="12"
          y="12"
          width="876"
          height="396"
          rx="130"
          fill="#cbdde3"
          stroke="#7d9da9"
          strokeWidth="4"
        />
        <path
          d="M450 13V407"
          stroke="#cd6d78"
          strokeWidth="3"
          strokeDasharray="8 6"
        />
        <path d="M305 14V406M595 14V406" stroke="#659fbd" strokeWidth="5" />
        <circle
          cx="450"
          cy="210"
          r="61"
          fill="none"
          stroke="#659fbd"
          strokeWidth="3"
        />
        <circle cx="450" cy="210" r="5" fill="#5988a1" />
        {[170, 730].flatMap((x) =>
          [115, 305].map((y) => (
            <g key={`${x}-${y}`}>
              <circle
                cx={x}
                cy={y}
                r="48"
                fill="none"
                stroke="#cd7b82"
                strokeWidth="2"
              />
              <circle cx={x} cy={y} r="4" fill="#cd7b82" />
            </g>
          )),
        )}
        <path d="M83 65V355M817 65V355" stroke="#ca7b83" strokeWidth="2" />
        <path
          d="M83 180a30 30 0 0 1 0 60M817 180a30 30 0 0 0 0 60"
          fill="#9dbed0"
          stroke="#cd7b82"
          strokeWidth="2"
        />
        <path
          d="M83 192H65V228H83M817 192H835V228H817"
          fill="none"
          stroke="#b94f5e"
          strokeWidth="4"
        />
      </svg>
      {children}
    </div>
  );
}
