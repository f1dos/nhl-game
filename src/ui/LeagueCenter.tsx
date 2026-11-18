import { useMemo, useState } from "react";
import type { Game, Player } from "../engine/types";
import { Panel, Rating } from "./components";
import { normalizeExternalRating } from "../engine/franchiseWorld";
import { formatPotential, scoutedPotential } from "../engine/potential";
import { PotentialLegend, PotentialView } from "./Potential";
import {
  SCOUT_LEAGUE_PLAYERS,
  SCOUT_LEAGUE_META,
  type ScoutLeague,
  type ScoutEntry,
} from "../data/scouting-leagues-2026-27";

const leagues: ScoutLeague[] = ["OHL", "WHL", "USHL", "SHL", "Liiga"];
const leagueCountry: Record<ScoutLeague, string> = {
  OHL: "Canada / USA",
  WHL: "Canada / USA",
  USHL: "USA",
  SHL: "Sweden",
  Liiga: "Finland",
};
type ViewPlayer = ScoutEntry & { gamePlayer?: Player };
/** Outside players are only lightly scouted: wide ranges for teenagers. */
const scouted = (p: ViewPlayer) =>
  scoutedPotential(
    (p.gamePlayer ?? { ...p, attributes: {} }) as Player,
    35,
  );
const normalize = (v: string) =>
  v
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export default function LeagueCenter({
  game,
  onPlayer,
}: {
  game: Game;
  onPlayer: (p: Player) => void;
}) {
  const ru = game.language === "ru";
  const [league, setLeague] = useState<ScoutLeague>("OHL");
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("ALL");
  const [position, setPosition] = useState("ALL");
  const [sort, setSort] = useState<"ovr" | "potential" | "age" | "name">(
    "potential",
  );
  const [selected, setSelected] = useState<ScoutEntry | null>(null);
  const draftNames = new Set(
    (game.draft?.prospects ?? []).map((p) => normalize(p.player.name)),
  );
  const entries: ViewPlayer[] = useMemo(
    () =>
      (league === "OHL"
        ? (game.juniorPlayers ?? [])
            .filter((p) => p.league === "OHL")
            .map((p) => ({
              id: p.id,
              name: p.name,
              club: p.currentClub ?? "—",
              pos: p.pos,
              nation: p.nation,
              age: p.age,
              number: p.number,
              ovr: p.ovr,
              potential: p.potential,
              model: "game" as const,
              gamePlayer: p,
            }))
        : SCOUT_LEAGUE_PLAYERS[league]
      ).map((entry) =>
        "gamePlayer" in entry
          ? entry
          : {
              ...entry,
              ...normalizeExternalRating(
                league,
                entry.age,
                entry.ovr,
                entry.potential,
                { id: entry.id, pos: entry.pos },
              ),
            },
      ),
    [game.juniorPlayers, league],
  );
  const clubs = [...new Set(entries.map((p) => p.club))].sort();
  const filtered = entries
    .filter(
      (p) =>
        (team === "ALL" || p.club === team) &&
        (position === "ALL" || p.pos === position) &&
        (!search ||
          normalize(p.name + " " + p.club).includes(normalize(search))),
    )
    .sort((a, b) =>
      sort === "ovr"
        ? b.ovr - a.ovr
        : sort === "potential"
          ? scouted(b).mid - scouted(a).mid || b.ovr - a.ovr
          : sort === "age"
            ? a.age - b.age
            : a.name.localeCompare(b.name),
    );

  return (
    <div className="scout-leagues">
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            {ru ? "МИРОВОЙ ХОККЕЙ" : "WORLD HOCKEY"}
          </span>
          <h1>
            {ru ? "Юниорские и европейские лиги" : "Junior & European leagues"}
          </h1>
          <p>
            {ru
              ? "Реальные игроки и клубы сезона 2026/27. Рейтинги OVR/POT — расчётные игровые оценки, не официальная статистика."
              : "Real 2026/27 player identities and clubs. OVR/POT are estimated game ratings, not official statistics."}
          </p>
        </div>
      </div>
      <div
        className="scout-league-tabs"
        role="tablist"
        aria-label="Scouting leagues"
      >
        {leagues.map((key) => {
          const count =
            key === "OHL"
              ? (game.juniorPlayers ?? []).filter((p) => p.league === "OHL")
                  .length
              : SCOUT_LEAGUE_PLAYERS[key].length;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={league === key}
              className={league === key ? "active" : ""}
              onClick={() => {
                setLeague(key);
                setTeam("ALL");
                setSearch("");
                setPosition("ALL");
                setSelected(null);
              }}
            >
              <strong>{key}</strong>
              <small>
                {count.toLocaleString()} {ru ? "игроков" : "players"}
              </small>
            </button>
          );
        })}
      </div>
      <div className="scout-league-summary">
        <div>
          <small>{ru ? "ЛИГА" : "LEAGUE"}</small>
          <b>{league}</b>
          <span>{leagueCountry[league]}</span>
        </div>
        <div>
          <small>{ru ? "ИГРОКИ" : "PLAYERS"}</small>
          <b>{entries.length}</b>
        </div>
        <div>
          <small>{ru ? "КЛУБЫ" : "CLUBS"}</small>
          <b>{clubs.length}</b>
        </div>
        <div>
          <small>{ru ? "СЕЗОН / ИСТОЧНИК" : "SEASON / SOURCE"}</small>
          <b>2026/27</b>
          <span>
            {league === "OHL"
              ? "HockeyTech"
              : SCOUT_LEAGUE_META.sources[league] || "—"}
          </span>
        </div>
      </div>
      <Panel title={ru ? "БАЗА ХОККЕИСТОВ" : "PLAYER DATABASE"}>
        <div className="scout-league-filters">
          <input
            aria-label="League player search"
            placeholder={ru ? "Имя или клуб…" : "Name or club…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="League team"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            <option value="ALL">{ru ? "Все клубы" : "All clubs"}</option>
            {clubs.map((club) => (
              <option key={club} value={club}>
                {club}
              </option>
            ))}
          </select>
          <select
            aria-label="League position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            <option value="ALL">{ru ? "Все позиции" : "All positions"}</option>
            {["LW", "C", "RW", "D", "G"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            aria-label="League sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="potential">
              {ru ? "Потенциал ↓" : "Potential ↓"}
            </option>
            <option value="ovr">OVR ↓</option>
            <option value="age">{ru ? "Возраст ↑" : "Age ↑"}</option>
            <option value="name">{ru ? "Имя A–Я" : "Name A–Z"}</option>
          </select>
        </div>
        {entries.length ? (
          <div className="table-scroll">
            <table className="scout-league-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{ru ? "ИГРОК" : "PLAYER"}</th>
                  <th>{ru ? "КЛУБ" : "CLUB"}</th>
                  <th>POS</th>
                  <th>{ru ? "ВОЗРАСТ" : "AGE"}</th>
                  <th>OVR*</th>
                  <th>POT*</th>
                  <th>{ru ? "ДАННЫЕ" : "DATA"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 650).map((p) => (
                  <tr key={p.id}>
                    <td className="muted">{p.number || "—"}</td>
                    <td>
                      <button
                        className="scout-player-link"
                        onClick={() =>
                          p.gamePlayer ? onPlayer(p.gamePlayer) : setSelected(p)
                        }
                      >
                        <strong>{p.name}</strong>
                        <small>
                          {p.nation}
                          {draftNames.has(normalize(p.name)) ? " · DRAFT" : ""}
                        </small>
                      </button>
                    </td>
                    <td>{p.club}</td>
                    <td>
                      <span className="position-pill">{p.pos}</span>
                    </td>
                    <td>{p.age || "—"}</td>
                    <td>
                      <Rating value={p.ovr} />
                    </td>
                    <td>
                      <PotentialView value={scouted(p)} compact />
                    </td>
                    <td>
                      <small>
                        {p.model === "stats"
                          ? ru
                            ? "Статистическая модель"
                            : "Stats model"
                          : p.model === "game"
                            ? ru
                              ? "Игровая модель"
                              : "Game model"
                            : ru
                              ? "Предварительная оценка"
                              : "Provisional estimate"}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty compact-empty">
            <h3>
              {ru
                ? "Нет подтверждённого снимка лиги"
                : "No verified league snapshot"}
            </h3>
            <p>
              {ru
                ? "Вымышленные имена не подставляются. Синхронизируйте официальные данные через npm run sync:scouting."
                : "No fictional names are substituted. Sync official data using npm run sync:scouting."}
            </p>
          </div>
        )}
        <PotentialLegend ru={ru} />
        <p className="note">
          {ru
            ? "* OVR и потенциал рассчитаны для игры и не являются официальными оценками. При отсутствии индивидуальной статистики используется предварительная оценка с учётом уровня лиги, возраста и позиции."
            : "* OVR and potential are game estimates, not official ratings. Where individual stats are unavailable, a provisional age/position/league-tier model is used."}
        </p>
      </Panel>
      {selected && (
        <div
          className="scout-profile-overlay"
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <section
            className="scout-profile"
            role="dialog"
            aria-modal="true"
            aria-label={selected.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="scout-close"
              onClick={() => setSelected(null)}
              aria-label="Close"
            >
              ×
            </button>
            <span className="eyebrow">
              {league} · {selected.club}
            </span>
            <h2>{selected.name}</h2>
            <p>
              {selected.pos} · {selected.nation} · {selected.age}{" "}
              {ru ? "лет" : "years"}
            </p>
            <div className="scout-profile-ratings">
              <div>
                <small>OVR*</small>
                <b>{selected.ovr}</b>
              </div>
              <div>
                <small>POT*</small>
                <b>{formatPotential(scouted(selected))}</b>
              </div>
            </div>
            {selected.games !== undefined && (
              <p>
                {selected.games} GP · {selected.goals ?? 0} G ·{" "}
                {selected.assists ?? 0} A
              </p>
            )}
            <p className="note">
              {ru
                ? "Источник личности: реальная база лиги. Игровые рейтинги расчётные. Игрок пока доступен для просмотра и аналитики, не для прямого вызова в NHL."
                : "Identity from a real league database. Ratings are modeled. View-only, not directly callable to NHL."}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
