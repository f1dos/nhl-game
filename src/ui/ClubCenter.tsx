import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Flame,
  Shield,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import type {
  FranchiseStrategy,
  Game,
  Player,
  Team,
} from "../engine/types";
import { effectiveOverall, likelyStrategy } from "../engine/franchiseWorld";
import { standings } from "../engine/season";
import { teamOverall } from "../engine/database";
import { averageRating } from "../engine/matchRatings";
import { Crest, Rating, RatingBadge } from "./components";
import { ClubLink, PlayerLink } from "./links";
import { PlayerPortrait } from "./PlayerCard";

const STRATEGY: Record<FranchiseStrategy, [string, string]> = {
  "draft-lottery": ["Перестройка через драфт", "Rebuild through the draft"],
  "wild-card-hunt": ["Борьба за wild card", "Wild card hunt"],
  "playoff-breakthrough": ["Прорыв в плей-офф", "Playoff breakthrough"],
  "stanley-cup": ["Претендент на Кубок", "Stanley Cup contender"],
};
const PRIORITY: Record<string, [string, string]> = {
  critical: ["критично", "critical"],
  high: ["высокий", "high"],
  medium: ["средний", "medium"],
};

export default function ClubCenter({
  game,
  initialClub,
  onSelectClub,
  onPlayer,
  onTrade,
}: {
  game: Game;
  initialClub?: string;
  onSelectClub?: (id: string) => void;
  onPlayer: (player: Player) => void;
  onTrade: () => void;
}) {
  const ru = game.language === "ru";
  const tr = (a: string, b: string) => (ru ? a : b);
  const [localSelected, setLocalSelected] = useState(initialClub ?? game.user);
  const selected = onSelectClub ? (initialClub ?? game.user) : localSelected;
  const select = (id: string) =>
    onSelectClub ? onSelectClub(id) : setLocalSelected(id);
  const [tab, setTab] = useState<"nhl" | "ahl">("nhl");
  const team = game.teams.find((club) => club.id === selected) ?? game.teams[0];
  const players = tab === "nhl" ? team.players : (team.farm ?? []);
  const needs = game.teamNeeds?.[team.id] ?? [];
  const league = standings(game.teams);
  const conference = standings(
    game.teams.filter((club) => club.conference === team.conference),
  );
  const division = standings(
    game.teams.filter((club) => club.division === team.division),
  );
  const rank = (list: Team[]) => list.findIndex((c) => c.id === team.id) + 1;
  const strategy: FranchiseStrategy =
    team.id === game.user && game.franchiseStrategy
      ? game.franchiseStrategy
      : (team.aiProfile?.strategy ?? likelyStrategy(team));
  const payroll = team.players.reduce((sum, p) => sum + p.salary, 0);
  const capSpace = game.rules.cap - payroll;
  const byId = new Map(
    [...team.players, ...(team.farm ?? [])].map((p) => [p.id, p]),
  );
  const stars = [...team.players]
    .sort((a, b) => effectiveOverall(b) - effectiveOverall(a))
    .slice(0, 5);
  const scorers = [...team.players]
    .filter((p) => p.pos !== "G")
    .sort(
      (a, b) =>
        b.stats.g + b.stats.a - (a.stats.g + a.stats.a) || b.stats.g - a.stats.g,
    )
    .slice(0, 5);
  const fixtures = game.schedule.filter((f) =>
    [f.home, f.away].includes(team.id),
  );
  const recent = fixtures.filter((f) => f.result).slice(-6).reverse();
  const upcoming = fixtures.filter((f) => !f.result).slice(0, 3);
  const rivalries = (game.rivalries ?? [])
    .filter((r) => r.teamA === team.id || r.teamB === team.id)
    .sort((a, b) => b.heat - a.heat);
  const fans = game.fans?.[team.id];
  const ai = team.aiProfile;
  const avgAge =
    team.players.reduce((n, p) => n + p.age, 0) /
    Math.max(1, team.players.length);
  const expiring = team.players.filter((p) => p.years <= 1);
  const topContracts = [...team.players]
    .sort((a, b) => b.salary - a.salary)
    .slice(0, 4);
  const farmProspects = [...(team.farm ?? [])]
    .sort((a, b) => b.potential - a.potential)
    .slice(0, 4);
  const captain = team.captainId ? byId.get(team.captainId) : undefined;
  const record = team.record;
  const diff = record.gf - record.ga;

  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p ? (
      <PlayerLink player={p}>
        <span className="cc-line-num">#{p.number}</span>
        {p.name.split(" ").slice(-1)[0]}
      </PlayerLink>
    ) : (
      <span className="muted">—</span>
    );
  };

  return (
    <div className="club-center" style={{ "--club": team.color } as React.CSSProperties}>
      <div className="page-intro cc-intro">
        <div>
          <span className="eyebrow">NHL CLUB DIRECTORY</span>
          <h1>{tr("Профили клубов", "Club profiles")}</h1>
          <p>
            {tr(
              "Стратегия, потребности, звенья, финансы и фарм каждой организации.",
              "Strategy, needs, lines, finances and farm of every organization.",
            )}
          </p>
        </div>
        <select
          aria-label={tr("Выбор клуба", "Select club")}
          value={team.id}
          onChange={(event) => select(event.target.value)}
        >
          {[...game.teams]
            .sort((a, b) => a.city.localeCompare(b.city))
            .map((club) => (
              <option key={club.id} value={club.id}>
                {club.city} {club.name}
              </option>
            ))}
        </select>
      </div>
      <nav className="cc-crest-strip" aria-label={tr("Клубы лиги", "League clubs")}>
        {[...game.teams]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((club) => (
            <button
              key={club.id}
              className={club.id === team.id ? "active" : ""}
              aria-label={`${club.city} ${club.name}`}
              aria-pressed={club.id === team.id}
              title={`${club.city} ${club.name}`}
              onClick={() => select(club.id)}
            >
              <Crest team={club} size={30} />
            </button>
          ))}
      </nav>

      {/* ---------------- Hero ---------------- */}
      <section className="cc-hero">
        <div className="cc-hero-bg" aria-hidden="true">
          <Crest team={team} size={380} />
        </div>
        <Crest team={team} size={118} />
        <div className="cc-hero-name">
          <small>
            {team.conference === "East"
              ? tr("ВОСТОЧНАЯ КОНФЕРЕНЦИЯ", "EASTERN CONFERENCE")
              : tr("ЗАПАДНАЯ КОНФЕРЕНЦИЯ", "WESTERN CONFERENCE")}{" "}
            · {team.division.toUpperCase()}
          </small>
          <h2>
            {team.city} <b>{team.name}</b>
          </h2>
          <div className="cc-hero-tags">
            <span className="cc-colour" aria-hidden="true">
              <i />
              <i />
            </span>
            <span>
              <Shield size={13} /> {STRATEGY[strategy][ru ? 0 : 1]}
            </span>
            {captain && (
              <span>
                C · <PlayerLink player={captain} />
              </span>
            )}
            {team.id === game.user && (
              <span className="cc-you">{tr("ВАШ КЛУБ", "YOUR CLUB")}</span>
            )}
          </div>
        </div>
        <div className="cc-hero-record">
          <div>
            <b>
              {record.w}-{record.l}-{record.otl}
            </b>
            <small>W-L-OT</small>
          </div>
          <div>
            <b>{record.pts}</b>
            <small>PTS</small>
          </div>
          <div>
            <b>{teamOverall(team)}</b>
            <small>OVR</small>
          </div>
          <div>
            <b>#{rank(league)}</b>
            <small>{tr("В ЛИГЕ", "LEAGUE")}</small>
          </div>
        </div>
        {team.id !== game.user && (
          <button className="primary cc-trade" onClick={onTrade}>
            {tr("Начать переговоры", "Open trade talks")} <ArrowRight size={16} />
          </button>
        )}
      </section>

      {/* ---------------- Key numbers ---------------- */}
      <div className="cc-facts">
        <span>
          <small>{tr("ДИВИЗИОН", "DIVISION")}</small>
          <b>#{rank(division)}</b>
          <em>{team.division}</em>
        </span>
        <span>
          <small>{tr("КОНФЕРЕНЦИЯ", "CONFERENCE")}</small>
          <b>#{rank(conference)}</b>
          <em>/ {conference.length}</em>
        </span>
        <span>
          <small>{tr("РАЗНИЦА ШАЙБ", "GOAL DIFF")}</small>
          <b className={diff >= 0 ? "up" : "down"}>
            {diff >= 0 ? "+" : ""}
            {diff}
          </b>
          <em>
            {record.gf} GF · {record.ga} GA
          </em>
        </span>
        <span>
          <small>{tr("СИЛА ЛИГИ", "POWER RANK")}</small>
          <b>#{team.strengthRank ?? "—"}</b>
          <em>{tr("предсезонный рейтинг", "preseason model")}</em>
        </span>
        <span>
          <small>{tr("ФОРМА", "FORM")}</small>
          <div className="form">
            {record.form.length ? (
              record.form.slice(-5).map((f, i) => (
                <i key={i} className={f}>
                  {f}
                </i>
              ))
            ) : (
              <em>—</em>
            )}
          </div>
        </span>
        <span>
          <small>{tr("СРЕДНИЙ ВОЗРАСТ", "AVERAGE AGE")}</small>
          <b>{avgAge.toFixed(1)}</b>
          <em>
            {team.players.length} NHL · {team.farm?.length ?? 0} AHL
          </em>
        </span>
      </div>

      <div className="cc-grid">
        <div className="cc-main">
          {/* ---------------- Key players ---------------- */}
          <section className="cc-card">
            <h3>
              <Users size={14} /> {tr("КЛЮЧЕВЫЕ ИГРОКИ", "KEY PLAYERS")}
            </h3>
            <div className="cc-stars">
              {stars.map((p) => (
                <button
                  key={p.id}
                  className="cc-star"
                  onClick={() => onPlayer(p)}
                  aria-label={p.name}
                >
                  <PlayerPortrait player={p} color={team.color} size={74} />
                  <span>
                    <small>
                      {p.pos} · {p.age}
                    </small>
                    <b>{p.name}</b>
                    <em>
                      {p.pos === "G"
                        ? `${p.stats.wins} W`
                        : `${p.stats.g + p.stats.a} PTS`}{" "}
                      · ${p.salary.toFixed(1)}M
                    </em>
                  </span>
                  <Rating value={effectiveOverall(p)} />
                </button>
              ))}
            </div>
          </section>

          {/* ---------------- Lines ---------------- */}
          <section className="cc-card">
            <h3>
              <Shield size={14} /> {tr("ЗВЕНЬЯ", "LINES")}
            </h3>
            <div className="cc-lines">
              {team.lines.map((line, index) => (
                <div key={`f${index}`} className="cc-line">
                  <span className="cc-line-tag">F{index + 1}</span>
                  {line.map((id) => (
                    <span key={id} className="cc-line-player">
                      {nameOf(id)}
                    </span>
                  ))}
                </div>
              ))}
              {team.defense.map((pair, index) => (
                <div key={`d${index}`} className="cc-line defense">
                  <span className="cc-line-tag">D{index + 1}</span>
                  {pair.map((id) => (
                    <span key={id} className="cc-line-player">
                      {nameOf(id)}
                    </span>
                  ))}
                </div>
              ))}
              <div className="cc-line goalie">
                <span className="cc-line-tag">G</span>
                <span className="cc-line-player">{nameOf(team.goalie)}</span>
              </div>
            </div>
          </section>

          {/* ---------------- Roster ---------------- */}
          <section className="cc-card cc-roster">
            <div className="tabs">
              <button
                className={tab === "nhl" ? "active" : ""}
                onClick={() => setTab("nhl")}
              >
                {tr("Основной состав NHL", "NHL roster")}
              </button>
              <button
                className={tab === "ahl" ? "active" : ""}
                onClick={() => setTab("ahl")}
              >
                {tr("Фарм / AHL", "Farm / AHL")}
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{tr("ИГРОК", "PLAYER")}</th>
                    <th>POS</th>
                    <th>{tr("ВОЗРАСТ", "AGE")}</th>
                    <th>OVR</th>
                    <th>POT</th>
                    <th>GP</th>
                    <th>PTS</th>
                    <th>{tr("ОЦЕНКА", "AV RAT")}</th>
                    <th>{tr("КОНТРАКТ", "CONTRACT")}</th>
                    <th>{tr("МОРАЛЬ", "MORALE")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...players]
                    .sort((a, b) => effectiveOverall(b) - effectiveOverall(a))
                    .map((player) => (
                      <tr key={player.id}>
                        <td className="muted">{player.number}</td>
                        <td>
                          <PlayerLink player={player}>
                            <strong>{player.name}</strong>
                          </PlayerLink>
                          <small>
                            {player.nation}
                            {player.injury > 0 ? " · ✚" : ""}
                          </small>
                        </td>
                        <td>
                          <span className="position">{player.pos}</span>
                        </td>
                        <td>{player.age}</td>
                        <td>
                          <Rating value={effectiveOverall(player)} />
                        </td>
                        <td>{player.potential}</td>
                        <td>{player.stats.gp}</td>
                        <td>{player.stats.g + player.stats.a}</td>
                        <td>
                          <RatingBadge value={averageRating(player.stats)} />
                        </td>
                        <td>
                          ${player.salary.toFixed(2)}M · {player.years}
                          {tr("г", "y")}
                        </td>
                        <td>
                          <span
                            className={`cc-morale ${player.morale >= 70 ? "good" : player.morale < 45 ? "poor" : "fair"}`}
                          >
                            {player.morale}%
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="cc-side">
          {/* ---------------- Results ---------------- */}
          <section className="cc-card">
            <h3>
              <CalendarDays size={14} /> {tr("РЕЗУЛЬТАТЫ", "RESULTS")}
            </h3>
            {recent.length ? (
              <ul className="cc-results">
                {recent.map((fixture) => {
                  const home = fixture.home === team.id;
                  const r = fixture.result!;
                  const own = r.goals[home ? 0 : 1];
                  const other = r.goals[home ? 1 : 0];
                  return (
                    <li key={fixture.id}>
                      <span className={`pc-wl ${own > other ? "w" : "l"}`}>
                        {own > other ? tr("В", "W") : tr("П", "L")}
                      </span>
                      <small>{home ? tr("Д", "H") : tr("Г", "A")}</small>
                      <ClubLink
                        id={home ? fixture.away : fixture.home}
                        crest={20}
                      />
                      <b>
                        {own}:{other}
                        {r.so ? " SO" : r.ot ? " OT" : ""}
                      </b>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">
                {tr("Сезон ещё не начался.", "The season has not started yet.")}
              </p>
            )}
            {upcoming.length > 0 && (
              <>
                <h4>{tr("Далее", "Next up")}</h4>
                <ul className="cc-results upcoming">
                  {upcoming.map((fixture) => (
                    <li key={fixture.id}>
                      <small>
                        {fixture.home === team.id ? tr("Д", "H") : tr("Г", "A")}
                      </small>
                      <ClubLink
                        id={fixture.home === team.id ? fixture.away : fixture.home}
                        crest={20}
                      />
                      <em>
                        {tr("тур", "round")} {fixture.round + 1}
                      </em>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* ---------------- Strategy & GM ---------------- */}
          <section className="cc-card">
            <h3>
              <Shield size={14} /> {tr("ПРОФИЛЬ УПРАВЛЕНИЯ", "FRONT OFFICE")}
            </h3>
            <p className="cc-strategy">
              <b>{STRATEGY[strategy][ru ? 0 : 1]}</b>
              <small>
                {team.id === game.user
                  ? tr("Ваша стратегия на сезон", "Your season strategy")
                  : tr("Курс генерального менеджера (ИИ)", "AI general manager course")}
              </small>
            </p>
            {ai && (
              <div className="cc-bars">
                {(
                  [
                    [tr("Агрессивность", "Aggression"), ai.aggression],
                    [tr("Терпение", "Patience"), ai.patience],
                    [tr("Риск", "Risk"), ai.risk],
                    [tr("Ставка на молодёжь", "Youth preference"), ai.youthPreference],
                    [tr("Аналитика", "Analytics"), ai.analytics],
                    [tr("Финансовая осторожность", "Financial caution"), ai.financialCaution],
                    [tr("Готовность отдать будущее", "Future asset willingness"), ai.futureAssetWillingness],
                  ] as [string, number][]
                ).map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <i>
                      <em style={{ width: `${value}%` }} />
                    </i>
                    <b>{value}</b>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ---------------- Needs ---------------- */}
          <section className="cc-card">
            <h3>{tr("ПОТРЕБНОСТИ КЛУБА", "CLUB NEEDS")}</h3>
            {needs.length ? (
              needs.map((need) => (
                <p key={need.position} className={`cc-need ${need.priority}`}>
                  <span className="position">{need.position}</span>
                  <span>
                    <b>{PRIORITY[need.priority]?.[ru ? 0 : 1] ?? need.priority}</b>
                    <small>{need.reason}</small>
                  </span>
                  <em>${need.budget.toFixed(1)}M</em>
                </p>
              ))
            ) : (
              <p className="muted">
                {tr("Явных дыр в составе нет.", "No obvious roster holes.")}
              </p>
            )}
          </section>

          {/* ---------------- Finances ---------------- */}
          <section className="cc-card">
            <h3>
              <Wallet size={14} /> {tr("ФИНАНСЫ И ПОТОЛОК", "FINANCES & CAP")}
            </h3>
            <div className="cc-cap">
              <div>
                <b>${payroll.toFixed(1)}M</b>
                <small>{tr("ведомость", "payroll")}</small>
              </div>
              <div>
                <b className={capSpace >= 0 ? "up" : "down"}>
                  ${capSpace.toFixed(1)}M
                </b>
                <small>{tr("свободно", "cap space")}</small>
              </div>
            </div>
            <i className="cc-cap-bar">
              <em
                style={{
                  width: `${Math.min(100, (payroll / game.rules.cap) * 100)}%`,
                }}
              />
            </i>
            <ul className="cc-list">
              {topContracts.map((p) => (
                <li key={p.id}>
                  <PlayerLink player={p} />
                  <span>
                    ${p.salary.toFixed(2)}M · {p.years}
                    {tr("г", "y")}
                  </span>
                </li>
              ))}
            </ul>
            <small className="cc-note">
              {expiring.length}{" "}
              {tr("контрактов истекают в этом сезоне", "contracts expire this season")}
              {fans
                ? ` · ${tr("болельщики", "fans")} ${(fans.supporters / 1000).toFixed(0)}k · ${tr("посещаемость", "attendance")} ${fans.attendance.toFixed(0)}%`
                : ""}
            </small>
          </section>

          {/* ---------------- Farm ---------------- */}
          <section className="cc-card">
            <h3>
              <Building2 size={14} /> {tr("ФАРМ-КЛУБ", "FARM CLUB")}
            </h3>
            <p className="cc-farm">
              {team.ahlLogoUrl && (
                <img
                  src={team.ahlLogoUrl}
                  alt=""
                  onError={(event) => (event.currentTarget.style.display = "none")}
                />
              )}
              <span>
                <b>{team.ahlAffiliate ?? tr("Фарм-клуб AHL", "AHL affiliate")}</b>
                <small>
                  AHL · {team.farm?.length ?? 0} {tr("игроков", "players")}
                </small>
              </span>
            </p>
            <ul className="cc-list">
              {farmProspects.map((p) => (
                <li key={p.id}>
                  <PlayerLink player={p} />
                  <span>
                    {p.pos} · {p.age} · {p.ovr}/{p.potential}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* ---------------- Rivalries ---------------- */}
          {rivalries.length > 0 && (
            <section className="cc-card">
              <h3>
                <Flame size={14} /> {tr("ПРИНЦИПИАЛЬНЫЕ СОПЕРНИКИ", "RIVALRIES")}
              </h3>
              <ul className="cc-rivals">
                {rivalries.map((rivalry) => {
                  const other =
                    rivalry.teamA === team.id ? rivalry.teamB : rivalry.teamA;
                  return (
                    <li key={rivalry.id}>
                      <ClubLink id={other} crest={24} label="name" />
                      <small>{rivalry.label}</small>
                      <span className="cc-heat">
                        <i style={{ width: `${rivalry.heat}%` }} />
                      </span>
                      <em>
                        {rivalry.seasonWins[team.id] ?? 0}-
                        {rivalry.seasonLosses[team.id] ?? 0}
                      </em>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ---------------- Top scorers ---------------- */}
          <section className="cc-card">
            <h3>
              <Trophy size={14} /> {tr("БОМБАРДИРЫ КЛУБА", "TEAM SCORING")}
            </h3>
            <ul className="cc-list">
              {scorers.map((p) => (
                <li key={p.id}>
                  <PlayerLink player={p} />
                  <span>
                    {p.stats.g} G · {p.stats.a} A ·{" "}
                    <b>{p.stats.g + p.stats.a}</b>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
