import { callUpFromFarm, sendToFarm } from "../engine/roster";
import { salaryTotal } from "../engine/contracts";
import type { Game, Player } from "../engine/types";
import { Panel, Rating } from "./components";

export default function FarmCenter({
  game,
  edit,
  onPlayer,
}: {
  game: Game;
  edit: (fn: (game: Game) => void) => void;
  onPlayer: (player: Player) => void;
}) {
  const ru = game.language === "ru";
  const tr = (a: string, b: string) => (ru ? a : b);
  const team = game.teams.find((t) => t.id === game.user)!;
  const farm = team.farm ?? [];
  const prospects = team.prospects ?? [];
  const forwards = team.players.filter(
    (p) => p.pos !== "D" && p.pos !== "G",
  ).length;
  const defense = team.players.filter((p) => p.pos === "D").length;
  const goalies = team.players.filter((p) => p.pos === "G").length;
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">HOCKEY OPERATIONS</span>
          <h1>{tr("Система клуба", "Club organization")}</h1>
          <p>
            {tr(
              "Управляйте активным составом, резервом и правами на проспектов.",
              "Manage the active roster, organizational reserve and prospect rights.",
            )}
          </p>
        </div>
      </div>
      <div className="organization-metrics">
        <div>
          <small>{tr("АКТИВНЫЙ СОСТАВ", "ACTIVE ROSTER")}</small>
          <b>{team.players.length}</b>
          <span>
            {forwards} F · {defense} D · {goalies} G
          </span>
        </div>
        <div>
          <small>
            {tr("ОРГАНИЗАЦИОННЫЙ РЕЗЕРВ", "ORGANIZATIONAL RESERVE")}
          </small>
          <b>{farm.length}</b>
          <span>{tr("доступны для вызова", "available for recall")}</span>
        </div>
        <div>
          <small>{tr("ПРОСПЕКТЫ", "PROSPECT RIGHTS")}</small>
          <b>{prospects.length}</b>
          <span>
            {tr("развиваются вне состава", "developing outside roster")}
          </span>
        </div>
        <div>
          <small>{tr("ЗАРПЛАТНАЯ ВЕДОМОСТЬ", "ACTIVE PAYROLL")}</small>
          <b>${salaryTotal(team).toFixed(1)}M</b>
          <span>
            ${(game.rules.cap - salaryTotal(team)).toFixed(1)}M{" "}
            {tr("свободно", "space")}
          </span>
        </div>
      </div>
      <Panel title={tr("АКТИВНЫЙ СОСТАВ", "ACTIVE ROSTER")}>
        <RosterRows
          players={team.players}
          action={tr("В резерв", "Assign")}
          onAction={(id) => edit((g) => sendToFarm(g, id))}
          onPlayer={onPlayer}
        />
      </Panel>
      <Panel
        title={tr(
          "ФАРМ И ОРГАНИЗАЦИОННЫЙ РЕЗЕРВ",
          "FARM & ORGANIZATIONAL RESERVE",
        )}
      >
        {farm.length ? (
          <RosterRows
            players={farm}
            action={tr("Вызвать", "Recall")}
            onAction={(id) => edit((g) => callUpFromFarm(g, id))}
            onPlayer={onPlayer}
          />
        ) : (
          <div className="empty compact-empty">
            <h3>{tr("Резерв пуст", "Reserve is empty")}</h3>
            <p>
              {tr(
                "В текущем наборе данных все доступные игроки находятся в активном составе.",
                "Every available player in the current dataset is on the active roster.",
              )}
            </p>
          </div>
        )}
      </Panel>
      <p className="note">
        {tr(
          "Резерв использует дополнительные записи текущего состава NHL API и пока не является подтверждённым составом конкретного клуба AHL. Правила отказов и двусторонние контракты ещё не моделируются.",
          "The reserve uses additional entries from the current NHL API roster and is not yet a verified AHL affiliate roster. Waivers and two-way contracts are not modeled yet.",
        )}
      </p>
    </>
  );
}

function RosterRows({
  players,
  action,
  onAction,
  onPlayer,
}: {
  players: Player[];
  action: string;
  onAction: (id: string) => void;
  onPlayer: (p: Player) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="organization-table">
        <thead>
          <tr>
            <th>#</th>
            <th>PLAYER</th>
            <th>POS</th>
            <th>AGE</th>
            <th>OVR</th>
            <th>POT</th>
            <th>AAV</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {[...players]
            .sort((a, b) => b.ovr - a.ovr)
            .map((player) => (
              <tr key={player.id}>
                <td>{player.number}</td>
                <td>
                  <button
                    className="identity-cell"
                    onClick={() => onPlayer(player)}
                  >
                    {player.headshot && <img src={player.headshot} alt="" />}
                    <span>
                      <b>{player.name}</b>
                      <small>
                        {player.nation} · {player.archetype}
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <span className="position-pill">{player.pos}</span>
                </td>
                <td>{player.age}</td>
                <td>
                  <Rating value={player.ovr} />
                </td>
                <td>{player.potential}</td>
                <td>${player.salary.toFixed(2)}M</td>
                <td>
                  <button onClick={() => onAction(player.id)}>{action}</button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
