import { useMemo, useState } from "react";
import type { Game, Player } from "../engine/types";
import { Panel, Rating } from "./components";
import { normalizeExternalRating } from "../engine/franchiseWorld";
import { formatPotential, scoutedPotential } from "../engine/potential";
import { PotentialLegend, PotentialView } from "./Potential";
import { flagOf, normalizeNation } from "../engine/names";
import {
  SCOUT_LEAGUE_PLAYERS,
  SCOUT_LEAGUE_META,
  type ScoutLeague,
  type ScoutEntry,
} from "../data/scouting-leagues-2026-27";
import Select from "./Select";

const leagues: ScoutLeague[] = ["OHL", "WHL", "USHL", "SHL", "Liiga"];
const leagueCountry: Record<ScoutLeague, string> = {
  OHL: "Canada / USA",
  WHL: "Canada / USA",
  USHL: "USA",
  SHL: "Sweden",
  Liiga: "Finland",
};
const leagueMeta: Record<ScoutLeague, { flag: string; ru: string; en: string; nation: string }> = {
  OHL: { flag: "🇨🇦", ru: "Хоккейная лига Онтарио", en: "Ontario Hockey League", nation: "CAN" },
  WHL: { flag: "🇨🇦", ru: "Западная хоккейная лига", en: "Western Hockey League", nation: "CAN" },
  USHL: { flag: "🇺🇸", ru: "Хоккейная лига США", en: "United States Hockey League", nation: "USA" },
  SHL: { flag: "🇸🇪", ru: "Шведская хоккейная лига", en: "Swedish Hockey League", nation: "SWE" },
  Liiga: { flag: "🇫🇮", ru: "Финская Liiga", en: "Finnish Liiga", nation: "FIN" },
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
  // Feeds without citizenship ("INT", "—") stay unknown instead of guessed.
  const nationOf = (p: ViewPlayer) => normalizeNation(p.nation, "—");
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
              className={`league-${key.toLowerCase()} ${league === key ? "active" : ""}`}
              onClick={() => {
                setLeague(key);
                setTeam("ALL");
                setSearch("");
                setPosition("ALL");
                setSelected(null);
              }}
            >
              <span className="league-flag" aria-hidden>
                {leagueMeta[key].flag}
              </span>
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
          <b>
            {leagueMeta[league].flag} {league}
          </b>
          <span>
            {ru ? leagueMeta[league].ru : leagueMeta[league].en} · {leagueCountry[league]}
          </span>
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
          <small>{ru ? "В ДРАФТ-КЛАССЕ" : "IN DRAFT CLASS"}</small>
          <b>{entries.filter((p) => draftNames.has(normalize(p.name))).length}</b>
          <span>{ru ? "игроков на драфт" : "draft prospects"}</span>
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
          <Select
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
          </Select>
          <Select
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
          </Select>
          <Select
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
          </Select>
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
                  <th>{ru ? "СТАТИСТИКА" : "STATS"}</th>
                  <th>OVR*</th>
                  <th>POT*</th>
                  <th>{ru ? "ДАННЫЕ" : "DATA"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 650).map((p) => (
                  <tr key={p.id} className={draftNames.has(normalize(p.name)) ? "draft-row" : ""}>
                    <td className="muted">{p.number || "—"}</td>
                    <td>
                      <button
                        className="scout-player-link"
                        onClick={() =>
                          p.gamePlayer ? onPlayer(p.gamePlayer) : setSelected(p)
                        }
                      >
                        <span className="scout-flag" aria-hidden>
                          {flagOf(nationOf(p))}
                        </span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {nationOf(p)}
                            {draftNames.has(normalize(p.name)) && (
                              <em className="draft-badge">DRAFT {game.draft?.year}</em>
                            )}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td className="club-col">{p.club}</td>
                    <td>
                      <span className="position-pill">{p.pos}</span>
                    </td>
                    <td>{p.age || "—"}</td>
                    <td className="stat-col">
                      {p.games !== undefined ? (
                        <>
                          <b>{(p.goals ?? 0) + (p.assists ?? 0)}</b>
                          <small>
                            {p.games} GP · {p.goals ?? 0}G {p.assists ?? 0}A
                          </small>
                        </>
                      ) : (
                        <small className="muted">—</small>
                      )}
                    </td>
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
                ? "Данные скаутинга по этой лиге не загружены."
                : "No scouting data for this league yet."}
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
              {flagOf(nationOf(selected))} {selected.pos} · {nationOf(selected)} ·{" "}
              {selected.age} {ru ? "лет" : "years"}
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
                ? "Реальный игрок, рейтинги расчётные. Напрямую вызвать его в NHL нельзя."
                : "Identity from a real league database. Ratings are modeled. View-only, not directly callable to NHL."}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
