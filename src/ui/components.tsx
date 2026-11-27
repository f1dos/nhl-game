import { portraitUrl } from "./portrait";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Team, Player } from "../engine/types";
import { effectiveOverall } from "../engine/franchiseWorld";
import { averageRating, ratingTone } from "../engine/matchRatings";
import { ClubLink, playerClub, useEntityLinks } from "./links";
import { RequestBadge } from "./PlayerRequests";
import { PotentialCell, PotentialLegend, potentialSortValue } from "./Potential";
import Select from "./Select";
export function Crest({ team, size = 44 }: { team: Team; size?: number }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const official = Boolean(team.logoUrl && !logoFailed);
  return (
    <span
      className={`crest ${official ? "official" : ""}`}
      style={
        {
          "--club": team.color,
          width: size,
          height: size,
        } as React.CSSProperties
      }
    >
      {official ? (
        <img
          src={team.logoUrl}
          alt={`${team.city} ${team.name}`}
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span style={{ fontSize: Math.max(7, Math.round(size * 0.34)) }}>
          {team.id}
        </span>
      )}
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
/** FM-style match rating chip: 7.4 on green / amber / red. */
export function RatingBadge({
  value,
  size = "md",
}: {
  value?: number;
  size?: "md" | "lg";
}) {
  if (value === undefined) return <span className="match-rating none">—</span>;
  return (
    <span className={`match-rating ${ratingTone(value)} ${size}`}>
      {value.toFixed(1)}
    </span>
  );
}
export function SeasonRating({ player }: { player: Player }) {
  return <RatingBadge value={averageRating(player.stats)} />;
}
export function PlayerTable({
  players,
  onSelect,
  lang,
  onAssign,
  showClub,
}: {
  players: Player[];
  onSelect: (p: Player) => void;
  lang: string;
  onAssign?: (playerId: string) => void;
  /** Adds the player's club (crest link) under the name. */
  showClub?: boolean;
}) {
  const links = useEntityLinks();
  const ru = lang === "ru";
  const [sort, setSort] = useState("default");
  const [available, setAvailable] = useState(false);
  const ordered = players
    .filter((p) => !available || p.injury === 0)
    .slice()
    .sort((a, b) =>
      sort === "rating"
        ? b.ovr - a.ovr
        : sort === "potential"
          ? potentialSortValue(links?.game, b) -
            potentialSortValue(links?.game, a)
        : sort === "points"
          ? b.stats.g + b.stats.a - a.stats.g - a.stats.a
          : sort === "form"
            ? (averageRating(b.stats) ?? 0) - (averageRating(a.stats) ?? 0)
          : sort === "age"
            ? a.age - b.age
            : sort === "salary"
              ? b.salary - a.salary
              : sort === "condition"
                ? a.fatigue - b.fatigue
                : 0,
    );
  return (
    <div className="table-scroll">
      <div className="roster-tools">
        <label>
          {ru ? "Сортировка" : "Sort"}{" "}
          <Select
            aria-label="Player sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {[
              ["default", ru ? "Исходный порядок" : "Default"],
              ["rating", "OVR ↓"],
              ["potential", "POT ↓"],
              ["points", "PTS ↓"],
              ["form", ru ? "Оценка ↓" : "Av rating ↓"],
              ["age", ru ? "Возраст ↑" : "Age ↑"],
              ["salary", "AAV ↓"],
              ["condition", ru ? "Готовность ↓" : "Condition ↓"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
          {ru ? " Только здоровые" : " Healthy only"}
        </label>
        <span>
          {ordered.length} {ru ? "игроков" : "players"}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>{ru ? "ИГРОК" : "PLAYER"}</th>
            <th>POS</th>
            <th>{ru ? "ВОЗР." : "AGE"}</th>
            <th>OVR</th>
            <th title={ru ? "Потолок по оценке штаба" : "Staff estimate of ceiling"}>
              POT
            </th>
            <th>GP</th>
            <th>G</th>
            <th>A</th>
            <th>PTS</th>
            <th>+/−</th>
            <th title={ru ? "Средняя оценка за матч" : "Average match rating"}>
              {ru ? "ОЦЕНКА" : "AV RAT"}
            </th>
            <th>{ru ? "ГОТОВНОСТЬ" : "CONDITION"}</th>
            <th>{ru ? "ЗАРПЛАТА" : "SALARY"}</th>
            {onAssign && <th>{ru ? "ДЕЙСТВИЕ" : "ACTION"}</th>}
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
                {portraitUrl(p) && (
                  <img className="player-mini-photo" src={portraitUrl(p)} alt="" />
                )}
                <strong>{p.name}</strong>
                {links && <RequestBadge game={links.game} playerId={p.id} />}
                <small>
                  {showClub && links && playerClub(links.game, p.id) && (
                    <>
                      <ClubLink
                        team={playerClub(links.game, p.id)}
                        crest={14}
                        label="id"
                      />{" "}
                      ·{" "}
                    </>
                  )}
                  {p.nation}
                  {p.injury > 0 ? " · ✚" : ""}
                </small>
              </td>
              <td>
                <span className="position">{p.pos}</span>
              </td>
              <td>{p.age}</td>
              <td>
                <Rating value={effectiveOverall(p)} />
              </td>
              <td>
                <PotentialCell player={p} compact />
              </td>
              <td>{p.stats.gp}</td>
              <td>{p.stats.g}</td>
              <td>{p.stats.a}</td>
              <td className="bright">{p.stats.g + p.stats.a}</td>
              <td>{p.stats.plus}</td>
              <td>
                <SeasonRating player={p} />
              </td>
              <td>
                <span className="condition">
                  <i style={{ width: `${100 - p.fatigue}%` }} />
                </span>
                <small>{Math.round(100 - p.fatigue)}%</small>
              </td>
              <td>${p.salary.toFixed(2)}M</td>
              {onAssign && (
                <td>
                  <button
                    className="roster-assign-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssign(p.id);
                    }}
                  >
                    {ru ? "В AHL" : "To AHL"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <PotentialLegend ru={ru} />
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
