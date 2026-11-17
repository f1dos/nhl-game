import type { Game, Player } from "../engine/types";
import { dateForRound } from "../engine/season";
import { Panel } from "./components";
import { PlayerLink } from "./links";

export default function InjuryCenter({
  game,
  onPlayer,
}: {
  game: Game;
  onPlayer: (p: Player) => void;
}) {
  const ru = game.language === "ru";
  const team = game.teams.find((t) => t.id === game.user)!;
  const injured = [...team.players, ...(team.farm ?? [])]
    .filter((p) => p.injury > 0)
    .sort((a, b) => b.injury - a.injury);
  const leagueTotal = game.teams
    .flatMap((t) => [...t.players, ...(t.farm ?? [])])
    .filter((p) => p.injury > 0).length;
  const expected = (p: Player) =>
    p.injuryReturnDate ??
    dateForRound(game, game.round + p.injury)
      .toISOString()
      .slice(0, 10);
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">MEDICAL CENTER</span>
          <h1>{ru ? "Лазарет" : "Injury reserve"}</h1>
          <p>
            {ru
              ? "Травмированные автоматически исключены из звеньев до медицинского допуска."
              : "Injured players are automatically unavailable until medically cleared."}
          </p>
        </div>
      </div>
      <div className="metrics">
        <div className="metric">
          <small>{ru ? "В КЛУБЕ" : "CLUB INJURIES"}</small>
          <b>{injured.length}</b>
        </div>
        <div className="metric">
          <small>{ru ? "В ЛИГЕ" : "LEAGUE INJURIES"}</small>
          <b>{leagueTotal}</b>
        </div>
        <div className="metric">
          <small>{ru ? "РЕАЛЬНЫЙ СНИМОК" : "VERIFIED SNAPSHOT"}</small>
          <b>{injured.filter((p) => p.injurySource === "puckpedia").length}</b>
        </div>
      </div>
      <Panel title={ru ? "МЕДИЦИНСКИЙ ОТЧЁТ" : "MEDICAL REPORT"}>
        {injured.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>PLAYER</th>
                  <th>STATUS</th>
                  <th>{ru ? "ТРАВМА" : "INJURY"}</th>
                  <th>{ru ? "СРОК" : "TIMELINE"}</th>
                  <th>{ru ? "ВОЗВРАЩЕНИЕ" : "EXPECTED RETURN"}</th>
                  <th>{ru ? "ИСТОЧНИК" : "SOURCE"}</th>
                </tr>
              </thead>
              <tbody>
                {injured.map((p) => (
                  <tr key={p.id} onClick={() => onPlayer(p)}>
                    <td>
                      <PlayerLink player={p}>
                        <strong>{p.name}</strong>
                      </PlayerLink>
                    </td>
                    <td>{p.injuryStatus ?? "OUT"}</td>
                    <td>{p.injuryReason ?? "Undisclosed"}</td>
                    <td>{p.injuryTimeline ?? `${p.injury} steps`}</td>
                    <td>
                      {expected(p)} · {p.injury}{" "}
                      {ru ? "игровых шагов" : "game steps"}
                    </td>
                    <td>
                      <span
                        className={
                          p.injurySource === "puckpedia"
                            ? "source-badge verified"
                            : "source-badge"
                        }
                      >
                        {p.injurySource === "puckpedia" ? "PUCKPEDIA" : "SIM"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty compact-empty">
            <h3>{ru ? "Лазарет пуст" : "No injuries"}</h3>
            <p>{ru ? "Все игроки доступны." : "Every player is available."}</p>
          </div>
        )}
      </Panel>
      {injured.some((p) => p.injurySource === "puckpedia") && (
        <p className="note">
          {ru
            ? "Реальные даты являются оценкой PuckPedia на момент снимка и могут измениться после нового медицинского отчёта. Игровой срок переводится в шаги симуляции из расчёта два календарных дня на тур."
            : "Real dates are PuckPedia estimates at snapshot time and may change. The game converts them into simulation steps at two calendar days per round."}
        </p>
      )}
    </>
  );
}
