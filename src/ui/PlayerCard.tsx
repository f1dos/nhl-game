import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  HeartPulse,
  MessageSquare,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import type { Game, Player, Result, Stats, Team } from "../engine/types";
import { averageRating } from "../engine/matchRatings";
import { AWARDS } from "../engine/awards";
import { effectiveOverall } from "../engine/franchiseWorld";
import {
  externalContactEligibility,
  playerConcerns,
} from "../engine/conversations";
import { Crest, RatingBadge } from "./components";
import { ClubLink, playerClub } from "./links";

type Tr = (ru: string, en: string) => string;

/* ------------------------------------------------------------------ */
/* Shared bits (also used by the club page)                            */
/* ------------------------------------------------------------------ */

const NATIONS: Record<string, [string, string]> = {
  CAN: ["Канада", "Canada"],
  USA: ["США", "USA"],
  SWE: ["Швеция", "Sweden"],
  FIN: ["Финляндия", "Finland"],
  RUS: ["Россия", "Russia"],
  CZE: ["Чехия", "Czechia"],
  SVK: ["Словакия", "Slovakia"],
  DEU: ["Германия", "Germany"],
  GER: ["Германия", "Germany"],
  CHE: ["Швейцария", "Switzerland"],
  SWI: ["Швейцария", "Switzerland"],
  LVA: ["Латвия", "Latvia"],
  LAT: ["Латвия", "Latvia"],
  DNK: ["Дания", "Denmark"],
  DEN: ["Дания", "Denmark"],
  NOR: ["Норвегия", "Norway"],
  AUT: ["Австрия", "Austria"],
  SLO: ["Словения", "Slovenia"],
  FRA: ["Франция", "France"],
  BLR: ["Беларусь", "Belarus"],
  BEL: ["Бельгия", "Belgium"],
  AUS: ["Австралия", "Australia"],
  POL: ["Польша", "Poland"],
  ITA: ["Италия", "Italy"],
};

export function nationName(code: string, ru: boolean) {
  const key = code.trim().toUpperCase();
  return NATIONS[key]?.[ru ? 0 : 1] ?? key;
}

/** Headshot with a jersey silhouette fallback when the CDN image fails. */
export function PlayerPortrait({
  player,
  color,
  size = 120,
}: {
  player: Player;
  color?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [player.headshot]);
  return (
    <span
      className={`player-portrait ${player.headshot && !failed ? "photo" : "silhouette"}`}
      style={
        {
          "--club": color ?? "#48a9df",
          width: size,
          height: size,
        } as React.CSSProperties
      }
    >
      {player.headshot && !failed ? (
        <img
          src={player.headshot}
          alt={player.name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="36" r="17" />
          <path d="M16 100c2-24 16-36 34-36s32 12 34 36z" />
        </svg>
      )}
      <b>{player.number}</b>
    </span>
  );
}

/** FM-like colour bands for a 0–99 attribute. */
export function attributeTone(value: number) {
  return value >= 85
    ? "elite"
    : value >= 75
      ? "good"
      : value >= 65
        ? "fair"
        : value >= 55
          ? "weak"
          : "poor";
}

export const ATTRIBUTE_NAMES: Record<string, [string, string]> = {
  shooting: ["Бросок", "Shooting"],
  accuracy: ["Точность", "Accuracy"],
  passing: ["Пас", "Passing"],
  puckControl: ["Владение шайбой", "Puck control"],
  offensivePosition: ["Позиция в атаке", "Offensive positioning"],
  offPuck: ["Игра без шайбы", "Off the puck"],
  faceoffs: ["Вбрасывания", "Faceoffs"],
  defensivePosition: ["Позиция в защите", "Defensive positioning"],
  checking: ["Силовые приёмы", "Checking"],
  blocking: ["Блок бросков", "Shot blocking"],
  firstPass: ["Первый пас", "First pass"],
  penaltyKill: ["Игра в меньшинстве", "Penalty kill"],
  speed: ["Скорость", "Speed"],
  acceleration: ["Ускорение", "Acceleration"],
  skating: ["Катание", "Skating"],
  strength: ["Сила", "Strength"],
  stamina: ["Выносливость", "Stamina"],
  durability: ["Крепость", "Durability"],
  composure: ["Хладнокровие", "Composure"],
  discipline: ["Дисциплина", "Discipline"],
  leadership: ["Лидерство", "Leadership"],
  decisions: ["Решения", "Decisions"],
  consistency: ["Стабильность", "Consistency"],
  teamwork: ["Командная игра", "Teamwork"],
  resilience: ["Стойкость", "Resilience"],
  reflexes: ["Реакция", "Reflexes"],
  goaliePosition: ["Позиционная игра", "Positioning"],
  glove: ["Ловушка", "Glove"],
  reboundControl: ["Контроль отскоков", "Rebound control"],
  stickhandling: ["Игра клюшкой", "Stickhandling"],
};

const SKATER_GROUPS: [string, string, string[]][] = [
  [
    "АТАКА",
    "OFFENSE",
    [
      "shooting",
      "accuracy",
      "passing",
      "puckControl",
      "offensivePosition",
      "offPuck",
      "faceoffs",
    ],
  ],
  [
    "ЗАЩИТА",
    "DEFENSE",
    ["defensivePosition", "checking", "blocking", "firstPass", "penaltyKill"],
  ],
  [
    "КАТАНИЕ И ФИЗИКА",
    "SKATING & PHYSICAL",
    ["speed", "acceleration", "skating", "strength", "stamina", "durability"],
  ],
  [
    "МЕНТАЛЬНЫЕ",
    "MENTAL",
    [
      "composure",
      "discipline",
      "leadership",
      "decisions",
      "consistency",
      "teamwork",
      "resilience",
    ],
  ],
];
const GOALIE_GROUPS: [string, string, string[]][] = [
  [
    "ВРАТАРСКИЕ",
    "GOALTENDING",
    ["reflexes", "goaliePosition", "glove", "reboundControl", "stickhandling"],
  ],
  [
    "МЕНТАЛЬНЫЕ",
    "MENTAL",
    ["composure", "discipline", "decisions", "consistency", "resilience"],
  ],
  [
    "ФИЗИКА",
    "PHYSICAL",
    ["skating", "acceleration", "stamina", "durability"],
  ],
];

interface FormGame {
  result: Result;
  rating: number;
  opponent?: Team;
  home: boolean;
  won: boolean;
  star: number;
}

/** Last rated games of the player, newest first (regular season + playoffs). */
export function recentForm(game: Game, player: Player, limit = 6) {
  const club = playerClub(game, player.id);
  const results: Result[] = [
    ...game.schedule
      .filter((fixture) => fixture.result)
      .sort((a, b) => a.round - b.round)
      .map((fixture) => fixture.result!),
    ...game.bracket.flat().flatMap((series) => series.games),
  ];
  const games: FormGame[] = [];
  for (const result of results) {
    const rating = result.ratings?.[player.id];
    if (rating === undefined) continue;
    const home = club ? result.home === club.id : true;
    const opponentId = home ? result.away : result.home;
    const side = home ? 0 : 1;
    games.push({
      result,
      rating,
      home,
      opponent: game.teams.find((team) => team.id === opponentId),
      won: result.goals[side] > result.goals[1 - side],
      star: (result.stars ?? []).indexOf(player.id) + 1,
    });
  }
  return games.slice(-limit).reverse();
}

function savePct(stats: Stats) {
  return stats.sa ? ((1 - stats.ga / stats.sa) * 100).toFixed(1) : "—";
}
function gaa(stats: Stats) {
  return stats.toi ? ((stats.ga * 60) / stats.toi).toFixed(2) : "—";
}
const signed = (value: number, digits = 0) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;

function Meter({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone?: string;
}) {
  const level =
    tone ?? (value >= 75 ? "good" : value >= 50 ? "fair" : "poor");
  return (
    <div className={`pc-meter ${level}`}>
      <small>{label}</small>
      <b>{detail}</b>
      <i>
        <em style={{ width: `${Math.max(3, Math.min(100, value))}%` }} />
      </i>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Player card                                                         */
/* ------------------------------------------------------------------ */

export default function PlayerCard({
  player: p,
  game,
  tr,
  onClose,
  onConversation,
}: {
  player: Player;
  game: Game;
  tr: Tr;
  onClose: () => void;
  onConversation: () => void;
}) {
  const ru = game.language === "ru";
  const club = playerClub(game, p.id);
  const color = club?.color ?? "#48a9df";
  const onFarm = !!club?.farm?.some((player) => player.id === p.id);
  const external = !!club && club.id !== game.user;
  const contact = externalContactEligibility(game, p.id);
  const groups = p.pos === "G" ? GOALIE_GROUPS : SKATER_GROUPS;
  const previous = p.history.at(-1)?.ovr ?? p.ovr;
  const trend = p.ovr - previous;
  const condition = Math.round(100 - p.fatigue);
  const form = p.performanceForm ?? 0;
  const awards = (game.awards ?? []).filter((award) => award.playerId === p.id);
  const lastGames = recentForm(game, p);
  const avg = averageRating(p.stats);
  const careerPoints =
    p.history.reduce((n, h) => n + h.stats.g + h.stats.a, 0) +
    p.stats.g +
    p.stats.a;
  const careerGames =
    p.history.reduce((n, h) => n + h.stats.gp, 0) + p.stats.gp;
  const isCaptain = club?.captainId === p.id;
  const isAlternate = !!club?.alternateCaptainIds?.includes(p.id);
  const seasons = [
    ...p.history.map((h) => ({ ...h, current: false })),
    { year: game.year, ovr: p.ovr, stats: p.stats, current: true },
  ].reverse();
  const goalie = p.pos === "G";
  const posName: Record<string, [string, string]> = {
    LW: ["Левый нападающий", "Left wing"],
    C: ["Центральный нападающий", "Centre"],
    RW: ["Правый нападающий", "Right wing"],
    D: ["Защитник", "Defenceman"],
    G: ["Вратарь", "Goaltender"],
  };
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="modal-backdrop player-profile-backdrop" onClick={onClose}>
      <section
        className="player-card"
        role="dialog"
        aria-modal="true"
        aria-label={p.name}
        onClick={(event) => event.stopPropagation()}
        style={{ "--club": color } as React.CSSProperties}
      >
        <button
          className="modal-close icon-button"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={22} />
        </button>

        {/* ---------------- Header ---------------- */}
        <header className="pc-hero">
          <div className="pc-hero-stripes" aria-hidden="true" />
          {club && (
            <span className="pc-hero-crest" aria-hidden="true">
              <Crest team={club} size={260} />
            </span>
          )}
          <PlayerPortrait player={p} color={color} size={148} />
          <div className="pc-identity">
            <span className="pc-number">
              #{p.number}
              {isCaptain && <em title={tr("Капитан", "Captain")}>C</em>}
              {isAlternate && <em title={tr("Ассистент", "Alternate")}>A</em>}
            </span>
            <h1>{p.name}</h1>
            <div className="pc-chips">
              <span className="pc-chip pos">
                {p.pos} · {posName[p.pos][ru ? 0 : 1]}
              </span>
              <span className="pc-chip">
                {p.age} {tr("лет", "yrs")}
                {p.birthDate ? ` · ${p.birthDate}` : ""}
              </span>
              <span className="pc-chip nation">
                <i>{p.nation.trim()}</i> {nationName(p.nation, ru)}
              </span>
              {p.archetype && <span className="pc-chip">{p.archetype}</span>}
            </div>
            <div className="pc-club-line">
              {club ? (
                <ClubLink team={club} crest={26} />
              ) : (
                <span>{tr("Свободный агент", "Free agent")}</span>
              )}
              {club && (
                <span className="pc-league">
                  {onFarm ? `AHL · ${club.ahlAffiliate ?? "AHL"}` : "NHL"}
                </span>
              )}
              <span className={`pc-status ${p.injury > 0 ? "out" : "ok"}`}>
                {p.injury > 0 ? (
                  <>
                    <HeartPulse size={13} />{" "}
                    {p.injuryStatus ?? tr("Травма", "Injured")}
                  </>
                ) : (
                  <>
                    <i /> {tr("Готов к игре", "Available")}
                  </>
                )}
              </span>
            </div>
          </div>
          <div className="pc-ratings">
            <div className="pc-dial ovr">
              <b>{effectiveOverall(p)}</b>
              <small>OVR</small>
            </div>
            <div className="pc-dial pot">
              <b>{p.potential}</b>
              <small>POT</small>
            </div>
            <span className={`pc-trend ${trend >= 0 ? "up" : "down"}`}>
              {trend >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {signed(trend)} {tr("за сезон", "this season")}
            </span>
            {p.ratingSource === "nhl-stats-model" && p.ratingRank && (
              <span className="rating-provenance">
                NHL MODEL · #{p.ratingRank} {goalie ? "G" : p.pos === "D" ? "D" : "F"}
              </span>
            )}
          </div>
        </header>

        {/* ---------------- Vital strip ---------------- */}
        <div className="pc-vitals">
          <Meter
            label={tr("МОРАЛЬ", "MORALE")}
            value={p.morale}
            detail={`${p.morale}%`}
          />
          <Meter
            label={tr("ГОТОВНОСТЬ", "CONDITION")}
            value={condition}
            detail={`${condition}%`}
          />
          <Meter
            label={tr("ФОРМА", "FORM")}
            value={50 + form * 10}
            detail={`${signed(form, 1)} · OVR ${signed(p.formAdjustment ?? 0)}`}
            tone={form > 0.3 ? "good" : form < -0.3 ? "poor" : "fair"}
          />
          <div className="pc-vital">
            <small>{tr("КОНТРАКТ", "CONTRACT")}</small>
            <b>${p.salary.toFixed(2)}M</b>
            <span>
              {p.years} {tr("г.", "yr")} ·{" "}
              {p.contractExpiryYear ?? game.year + p.years}{" "}
              {p.contractStatus ?? ""}
            </span>
          </div>
          <div className="pc-vital">
            <small>{tr("СРЕДНЯЯ ОЦЕНКА", "AVG RATING")}</small>
            <RatingBadge value={avg} size="lg" />
          </div>
        </div>

        <div className="pc-body">
          <div className="pc-main">
            {/* ---------------- Attributes ---------------- */}
            <section className="pc-section">
              <h2>{tr("Атрибуты", "Attributes")}</h2>
              <div className="attribute-sections pc-attributes">
                {groups.map(([titleRu, titleEn, keys]) => {
                  const values = keys.map((key) => p.attributes[key] ?? 0);
                  const average = Math.round(
                    values.reduce((n, v) => n + v, 0) / values.length,
                  );
                  return (
                    <section key={titleEn} className="pc-attr-group">
                      <header>
                        <h3>{ru ? titleRu : titleEn}</h3>
                        <span className={`pc-attr-avg ${attributeTone(average)}`}>
                          {average}
                        </span>
                      </header>
                      {keys.map((key) => {
                        const value = p.attributes[key] ?? 0;
                        return (
                          <div key={key} className="pc-attr">
                            <span>
                              {ATTRIBUTE_NAMES[key]?.[ru ? 0 : 1] ?? key}
                            </span>
                            <i>
                              <em
                                className={attributeTone(value)}
                                style={{ width: `${value}%` }}
                              />
                            </i>
                            <b className={attributeTone(value)}>{value}</b>
                          </div>
                        );
                      })}
                    </section>
                  );
                })}
              </div>
            </section>

            {/* ---------------- Season stats & history ---------------- */}
            <section className="pc-section">
              <h2>{tr("Статистика по сезонам", "Season statistics")}</h2>
              <div className="table-scroll">
                <table className="pc-table">
                  <thead>
                    <tr>
                      <th>{tr("СЕЗОН", "SEASON")}</th>
                      <th>OVR</th>
                      <th>GP</th>
                      {goalie ? (
                        <>
                          <th>W</th>
                          <th>SA</th>
                          <th>GA</th>
                          <th>SV%</th>
                          <th>GAA</th>
                        </>
                      ) : (
                        <>
                          <th>G</th>
                          <th>A</th>
                          <th>PTS</th>
                          <th>+/−</th>
                          <th>PIM</th>
                          <th>SOG</th>
                        </>
                      )}
                      <th>{tr("ОЦЕНКА", "AV RAT")}</th>
                      <th>★</th>
                      <th>{tr("НАГРАДЫ", "AWARDS")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasons.map((season) => {
                      const seasonAwards = awards.filter(
                        (award) => award.year === season.year,
                      );
                      const s = season.stats;
                      return (
                        <tr
                          key={`${season.year}-${season.current}`}
                          className={season.current ? "current" : ""}
                        >
                          <td>
                            <strong>
                              {season.year}/{String(season.year + 1).slice(2)}
                            </strong>
                            {season.current && (
                              <small>{tr("текущий", "current")}</small>
                            )}
                          </td>
                          <td>{season.ovr}</td>
                          <td>{s.gp}</td>
                          {goalie ? (
                            <>
                              <td>{s.wins}</td>
                              <td>{s.sa}</td>
                              <td>{s.ga}</td>
                              <td>{savePct(s)}</td>
                              <td>{gaa(s)}</td>
                            </>
                          ) : (
                            <>
                              <td>{s.g}</td>
                              <td>{s.a}</td>
                              <td className="bright">{s.g + s.a}</td>
                              <td>{signed(s.plus)}</td>
                              <td>{s.pim}</td>
                              <td>{s.sog}</td>
                            </>
                          )}
                          <td>
                            <RatingBadge value={averageRating(s)} />
                          </td>
                          <td>{s.stars ?? 0}</td>
                          <td>
                            {seasonAwards.map((award) => (
                              <span
                                key={award.key}
                                className="pc-award-mini"
                                title={AWARDS[award.key][ru ? "ru" : "en"]}
                              >
                                <Trophy size={13} />
                              </span>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="pc-career-line">
                {tr("Карьера в игре", "Career in this save")}: {careerGames} GP ·{" "}
                {careerPoints} PTS
              </p>
            </section>

            {/* ---------------- Development ---------------- */}
            <section className="pc-section">
              <h2>{tr("Развитие", "Development")}</h2>
              <div className="pc-dev">
                <div className="pc-dev-chart" aria-hidden="true">
                  {[...p.history, { year: game.year, ovr: p.ovr }].map(
                    (h, index, all) => (
                      <div
                        key={h.year}
                        className={index === all.length - 1 ? "now" : ""}
                      >
                        <span>{h.ovr}</span>
                        <i
                          style={{
                            height: `${Math.max(6, (h.ovr - 40) * 1.6)}px`,
                          }}
                        />
                        <small>
                          {index === all.length - 1
                            ? tr("Сейчас", "Now")
                            : `${String(h.year).slice(2)}/${String(h.year + 1).slice(2)}`}
                        </small>
                      </div>
                    ),
                  )}
                  <div className="pot-line">
                    <span>POT {p.potential}</span>
                    <i
                      style={{
                        height: `${Math.max(6, (p.potential - 40) * 1.6)}px`,
                      }}
                    />
                    <small>{tr("Потолок", "Ceiling")}</small>
                  </div>
                </div>
                <div className="pc-dev-log">
                  {(p.developmentLog ?? []).length ? (
                    p.developmentLog!.slice(0, 5).map((entry) => (
                      <p key={`${entry.year}-${entry.ovrAfter}-${entry.delta}`}>
                        <b className={entry.delta >= 0 ? "up" : "down"}>
                          {signed(entry.delta)}
                        </b>
                        <span>
                          {entry.year}: {entry.ovrBefore} → {entry.ovrAfter}
                          <small>{entry.reason}</small>
                        </span>
                      </p>
                    ))
                  ) : (
                    <p className="muted">
                      {p.age < 24 && p.ovr < p.potential
                        ? tr(
                            `Запас роста ${p.potential - p.ovr} OVR. Профильные тренировки и игровое время ускоряют развитие.`,
                            `${p.potential - p.ovr} OVR of headroom. Focused training and ice time speed up growth.`,
                          )
                        : tr(
                            "Изменения рейтинга появятся после завершения сезона.",
                            "Rating changes appear after the season ends.",
                          )}
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>

          <aside className="pc-side">
            {/* ---------------- Recent form ---------------- */}
            <section className="pc-box">
              <h3>
                <Activity size={14} /> {tr("ПОСЛЕДНИЕ МАТЧИ", "RECENT FORM")}
              </h3>
              {lastGames.length ? (
                <ol className="pc-form">
                  {lastGames.map((item, index) => (
                    <li key={index}>
                      <span className={`pc-wl ${item.won ? "w" : "l"}`}>
                        {item.won ? tr("В", "W") : tr("П", "L")}
                      </span>
                      {item.opponent ? (
                        <ClubLink team={item.opponent} label="id" crest={20} />
                      ) : (
                        <span>—</span>
                      )}
                      <small>
                        {item.home ? tr("дома", "home") : tr("в гостях", "away")} ·{" "}
                        {item.result.goals.join(":")}
                      </small>
                      {item.star > 0 && (
                        <span className="pc-star" title={`★${item.star}`}>
                          <Star size={11} fill="currentColor" />
                          {item.star}
                        </span>
                      )}
                      <RatingBadge value={item.rating} />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">
                  {tr(
                    "Нет оценённых матчей в этом сезоне.",
                    "No rated games this season yet.",
                  )}
                </p>
              )}
            </section>

            {/* ---------------- Status & contract ---------------- */}
            <section className="pc-box">
              <h3>{tr("СТАТУС И КОНТРАКТ", "STATUS & CONTRACT")}</h3>
              <dl>
                <div>
                  <dt>{tr("Зарплата (AAV)", "Cap hit")}</dt>
                  <dd>${p.salary.toFixed(2)}M</dd>
                </div>
                <div>
                  <dt>{tr("Срок", "Term")}</dt>
                  <dd>
                    {p.years} {tr("г.", p.years === 1 ? "year" : "years")}
                  </dd>
                </div>
                <div>
                  <dt>{tr("Остаток", "Remaining value")}</dt>
                  <dd>
                    $
                    {(p.contractRemainingValue ?? p.salary * p.years).toFixed(2)}
                    M
                  </dd>
                </div>
                <div>
                  <dt>{tr("Истекает", "Expiry")}</dt>
                  <dd>
                    {p.contractExpiryYear ?? game.year + p.years}{" "}
                    {p.contractStatus ?? ""}
                  </dd>
                </div>
                <div>
                  <dt>{tr("Источник", "Source")}</dt>
                  <dd>
                    {p.contractSource === "puckpedia"
                      ? "PuckPedia"
                      : tr("Игровой", "Game")}
                  </dd>
                </div>
                <div>
                  <dt>{tr("Отношения / мотивация", "Relationship / motivation")}</dt>
                  <dd>
                    {p.relationship ?? 50}% / {p.motivation ?? 50}%
                  </dd>
                </div>
              </dl>
            </section>

            {/* ---------------- Injury ---------------- */}
            {(p.injury > 0 || (p.injuryBurden ?? 0) > 0) && (
              <section className={`pc-box pc-injury ${p.injury > 0 ? "active" : ""}`}>
                <h3>
                  <HeartPulse size={14} /> {tr("МЕДИЦИНА", "MEDICAL")}
                </h3>
                {p.injury > 0 ? (
                  <>
                    <strong>
                      {p.injuryReason ?? tr("Травма", "Injury")} ·{" "}
                      {p.injuryStatus ?? "OUT"}
                    </strong>
                    <p>
                      {p.injuryTimeline ?? `${p.injury} ${tr("шагов", "steps")}`}{" "}
                      ·{" "}
                      {tr("возвращение", "return")}:{" "}
                      {p.injuryReturnDate ??
                        tr("по игровой симуляции", "simulation estimate")}
                    </p>
                    {p.injuryReport && <small>{p.injuryReport}</small>}
                  </>
                ) : (
                  <p>
                    {tr("Нагрузка травм в карьере", "Career injury burden")}:{" "}
                    {p.injuryBurden}
                  </p>
                )}
              </section>
            )}

            {/* ---------------- Trophies ---------------- */}
            <section className="pc-box">
              <h3>
                <Trophy size={14} /> {tr("ТРОФЕИ", "TROPHY CABINET")}
              </h3>
              {awards.length ? (
                <div className="pc-trophies">
                  {awards.map((award) => (
                    <span key={`${award.year}-${award.key}`}>
                      <Trophy size={18} />
                      <b>{AWARDS[award.key][ru ? "ru" : "en"]}</b>
                      <small>
                        {award.year}/{String(award.year + 1).slice(2)} ·{" "}
                        {award.line}
                      </small>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  {tr(
                    "Пока без индивидуальных наград лиги.",
                    "No individual league awards yet.",
                  )}
                </p>
              )}
            </section>

            {/* ---------------- Conversation ---------------- */}
            <section className="pc-box pc-talks">
              <h3>
                <MessageSquare size={14} />{" "}
                {tr("РАЗГОВОРЫ С ИГРОКОМ", "PLAYER TALKS")}
              </h3>
              <p className="pc-concerns">
                {tr("Темы", "Concerns")}: {playerConcerns(p).join(", ")}
              </p>
              <button
                className="primary"
                onClick={onConversation}
                disabled={external && !contact.allowed}
              >
                {external && !contact.allowed
                  ? tr("Контакт запрещён клубом", "Contact blocked by club")
                  : external
                    ? tr("Связаться через агента", "Contact through agent")
                    : p.lastConversationRound === game.round
                      ? tr(
                          "Открыть историю разговора",
                          "Open conversation history",
                        )
                      : tr("Начать личную встречу", "Start private meeting")}
                <ArrowUpRight size={16} />
              </button>
              {external && <small>{contact.reason}</small>}
              {(p.conversationHistory ?? []).slice(0, 4).map((entry, index) => (
                <blockquote
                  key={`${entry.year}-${entry.round}-${index}`}
                  className={entry.outcome ?? "neutral"}
                >
                  <small>
                    {entry.year} · {tr("тур", "round")} {entry.round} ·{" "}
                    {entry.topic}
                  </small>
                  {entry.response}
                  <em>
                    {tr("мораль", "morale")} {signed(entry.moraleDelta)} ·{" "}
                    {tr("отношения", "relationship")}{" "}
                    {signed(entry.relationshipDelta)}
                  </em>
                </blockquote>
              ))}
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}
