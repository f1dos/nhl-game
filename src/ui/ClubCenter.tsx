import { useState } from "react";
import { ArrowRight, Building2, Users } from "lucide-react";
import type { Game, Player } from "../engine/types";
import { effectiveOverall, likelyStrategy } from "../engine/franchiseWorld";
import { Crest, Rating } from "./components";

export default function ClubCenter({
  game,
  initialClub,
  onPlayer,
  onTrade,
}: {
  game: Game;
  initialClub?: string;
  onPlayer: (player: Player) => void;
  onTrade: () => void;
}) {
  const [selected, setSelected] = useState(initialClub ?? game.user);
  const [tab, setTab] = useState<"nhl" | "ahl">("nhl");
  const team = game.teams.find((club) => club.id === selected)!;
  const players = tab === "nhl" ? team.players : (team.farm ?? []);
  const needs = game.teamNeeds?.[team.id] ?? [];
  return (
    <div className="club-center">
      <div className="page-intro">
        <div>
          <span className="eyebrow">NHL CLUB DIRECTORY</span>
          <h1>Профили клубов</h1>
          <p>
            Стратегия, потребности, основной состав и фарм каждой организации.
          </p>
        </div>
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {game.teams.map((club) => (
            <option key={club.id} value={club.id}>
              {club.city} {club.name}
            </option>
          ))}
        </select>
      </div>
      <section
        className="club-profile-hero"
        style={{ "--club": team.color } as React.CSSProperties}
      >
        <Crest team={team} size={92} />
        <div>
          <small>
            {team.conference.toUpperCase()} · {team.division.toUpperCase()}
          </small>
          <h2>
            {team.city} {team.name}
          </h2>
          <p>{team.ahlAffiliate ?? "AHL affiliate"}</p>
        </div>
        <div className="club-profile-facts">
          <span>
            <b>#{team.strengthRank ?? "—"}</b> сила лиги
          </span>
          <span>
            <b>{team.record.pts}</b> очков
          </span>
          <span>
            <b>{likelyStrategy(team)}</b> вероятный курс
          </span>
        </div>
        {team.id !== game.user && (
          <button className="primary" onClick={onTrade}>
            Начать переговоры <ArrowRight size={16} />
          </button>
        )}
      </section>
      <div className="club-profile-grid">
        <section>
          <small>ПОТРЕБНОСТИ КЛУБА</small>
          {needs.map((need) => (
            <p key={need.position}>
              <b>
                {need.position} · {need.priority}
              </b>
              <span>{need.reason}</span>
            </p>
          ))}
        </section>
        <section>
          <small>ПРОФИЛЬ УПРАВЛЕНИЯ</small>
          <p>
            <b>{team.aiProfile?.strategy ?? likelyStrategy(team)}</b>
            <span>
              Риск {team.aiProfile?.risk ?? 50} · молодёжь{" "}
              {team.aiProfile?.youthPreference ?? 50} · аналитика{" "}
              {team.aiProfile?.analytics ?? 50}
            </span>
          </p>
        </section>
        <section>
          <small>ОРГАНИЗАЦИЯ</small>
          <p>
            <b>
              <Users size={14} /> {team.players.length} NHL ·{" "}
              {team.farm?.length ?? 0} AHL
            </b>
            <span>
              <Building2 size={13} /> {team.ahlAffiliate ?? "Farm club"}
            </span>
          </p>
        </section>
      </div>
      <div className="tabs">
        <button
          className={tab === "nhl" ? "active" : ""}
          onClick={() => setTab("nhl")}
        >
          Основной состав NHL
        </button>
        <button
          className={tab === "ahl" ? "active" : ""}
          onClick={() => setTab("ahl")}
        >
          Фарм / AHL
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>ИГРОК</th>
              <th>POS</th>
              <th>ВОЗРАСТ</th>
              <th>OVR</th>
              <th>POT</th>
              <th>КОНТРАКТ</th>
              <th>МОРАЛЬ</th>
            </tr>
          </thead>
          <tbody>
            {[...players]
              .sort((a, b) => effectiveOverall(b) - effectiveOverall(a))
              .map((player) => (
                <tr key={player.id}>
                  <td>{player.number}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => onPlayer(player)}
                    >
                      {player.name}
                    </button>
                  </td>
                  <td>{player.pos}</td>
                  <td>{player.age}</td>
                  <td>
                    <Rating value={effectiveOverall(player)} />
                  </td>
                  <td>{player.potential}</td>
                  <td>
                    ${player.salary}M · {player.years}Y
                  </td>
                  <td>{player.morale}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
