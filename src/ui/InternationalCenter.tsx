import { useState } from "react";
import { Medal } from "lucide-react";
import type { Game } from "../engine/types";
import {
  STAGE_LABELS,
  TOURNAMENT_NAMES,
  groupTable,
  medalTable,
  nationInfo,
  nationName,
  type InternationalTournament,
  type MedalColor,
  type TournamentGame,
  type TournamentStage,
} from "../engine/tournaments";
import { Panel } from "./components";
import { PlayerLink } from "./links";

const fmtDate = (date: string, ru: boolean) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(ru ? "ru-RU" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

export function NationBadge({ code, ru, short }: { code: string; ru: boolean; short?: boolean }) {
  const color = nationInfo(code)?.color ?? "#48a9df";
  return (
    <span className="nation-badge" style={{ "--nation": color } as React.CSSProperties}>
      <i>{code}</i>
      {!short && <span>{nationName(code, ru)}</span>}
    </span>
  );
}

export function MedalChip({ medal, ru }: { medal: MedalColor; ru: boolean }) {
  const label = ru
    ? { gold: "Золото", silver: "Серебро", bronze: "Бронза" }[medal]
    : { gold: "Gold", silver: "Silver", bronze: "Bronze" }[medal];
  return (
    <span className={`medal-chip ${medal}`}>
      <Medal size={12} /> {label}
    </span>
  );
}

function score(game: TournamentGame) {
  if (!game.goals) return "—";
  return `${game.goals[0]}:${game.goals[1]}${game.so ? " SO" : game.ot ? " OT" : ""}`;
}

function GameRow({ game, ru, winner }: { game: TournamentGame; ru: boolean; winner?: string }) {
  return (
    <div className="bracket-game">
      {[game.home, game.away].map((code, i) => (
        <div
          key={code}
          className={game.goals ? (winner === code ? "won" : "lost") : ""}
        >
          <NationBadge code={code} ru={ru} short />
          <span>{nationName(code, ru)}</span>
          <b>{game.goals ? game.goals[i] : ""}</b>
        </div>
      ))}
      <small>
        {fmtDate(game.date, ru)}
        {game.goals && (game.so ? " · SO" : game.ot ? " · OT" : "")}
      </small>
    </div>
  );
}

function TournamentView({ game, t }: { game: Game; t: InternationalTournament }) {
  const ru = game.language === "ru";
  const tr = (a: string, b: string) => (ru ? a : b);
  const [nation, setNation] = useState<string>("");
  const name = ru ? TOURNAMENT_NAMES[t.kind].ru : TOURNAMENT_NAMES[t.kind].en;
  const user = game.teams.find((team) => team.id === game.user)!;
  const ownIds = new Set(
    [...user.players, ...(user.farm ?? []), ...(user.prospects ?? [])].map((p) => p.id),
  );
  const called = t.teams.flatMap((team) =>
    team.roster.filter((e) => ownIds.has(e.id)).map((e) => ({ e, code: team.code })),
  );
  const medalOf = (code: string): MedalColor | undefined =>
    !t.medals
      ? undefined
      : code === t.medals.gold
        ? "gold"
        : code === t.medals.silver
          ? "silver"
          : code === t.medals.bronze
            ? "bronze"
            : undefined;
  const winnerOf = (g: TournamentGame) =>
    g.goals ? (g.goals[0] > g.goals[1] ? g.home : g.away) : undefined;
  const played = t.games.filter((g) => g.goals).length;
  const statusText =
    t.status === "complete"
      ? tr("Завершён", "Complete")
      : t.status === "live"
        ? tr("Идёт", "Under way")
        : t.status === "announced"
          ? tr("Составы объявлены", "Rosters announced")
          : tr("Запланирован", "Scheduled");
  const leaders = Object.values(t.stats)
    .filter((line) => line.pos !== "G")
    .sort((a, b) => b.g + b.a - (a.g + a.a) || b.g - a.g || a.id.localeCompare(b.id))
    .slice(0, 10);
  const goalies = Object.values(t.stats)
    .filter((line) => line.pos === "G" && line.sa >= 40)
    .sort((a, b) => (b.sa - b.ga) / b.sa - (a.sa - a.ga) / a.sa)
    .slice(0, 5);
  const selected = t.teams.find((team) => team.code === (nation || t.teams[0]?.code));
  const knockout: TournamentStage[] = t.qfDay ? ["qf", "sf", "final"] : ["sf", "final"];
  return (
    <>
      <div className="tournament-head">
        <div>
          <h2>{name}</h2>
          <p>
            {ru ? t.host.ru : t.host.en} · {fmtDate(t.start, ru)} – {fmtDate(t.end, ru)} · {statusText}
          </p>
        </div>
        <p className="tournament-rule">
          {t.kind === "best-on-best"
            ? tr(
                `Лучшие игроки мира, включая NHL. Лига прерывается на ${game.internationalSeason?.breakDays ?? 12} дней с ${fmtDate(t.start, ru)}.`,
                `Best-on-best, NHL players included. The league pauses for ${game.internationalSeason?.breakDays ?? 12} days from ${fmtDate(t.start, ru)}.`,
              )
            : tr(
                "Едут игроки клубов, не попавших в плей-офф или уже выбывших, плюс AHL и Европа.",
                "Players from clubs that missed or left the playoffs, plus AHL and European depth.",
              )}
        </p>
      </div>
      <div className="metrics">
        <div className="metric">
          <small>{tr("СБОРНЫХ", "NATIONS")}</small>
          <div>{t.teams.length || (t.kind === "best-on-best" ? 8 : 12)}</div>
        </div>
        <div className="metric">
          <small>{tr("ВАШИ ИГРОКИ", "YOUR PLAYERS")}</small>
          <div>
            {called.length}
            <span>{t.status === "scheduled" ? tr(`вызов ${fmtDate(t.announce, ru)}`, `called up ${fmtDate(t.announce, ru)}`) : tr("в сборных", "called up")}</span>
          </div>
        </div>
        <div className="metric">
          <small>{tr("СЫГРАНО МАТЧЕЙ", "GAMES PLAYED")}</small>
          <div>
            {played}
            <span>/ {t.qfDay ? 38 : 16}</span>
          </div>
        </div>
        <div className="metric">
          <small>{tr("ЗОЛОТО", "GOLD")}</small>
          <div>{t.medals ? <NationBadge code={t.medals.gold} ru={ru} /> : "—"}</div>
        </div>
      </div>
      {t.status === "scheduled" ? (
        <Panel title={tr("ДО ТУРНИРА", "COMING UP")}>
          <p className="empty-state">
            {tr(
              `Составы сборных объявят ${fmtDate(t.announce, ru)}. Сборные набираются по гражданству игроков: лучшие по позициям (14 нападающих, 8 защитников, 3 вратаря), недостающих добирают из европейских лиг.`,
              `Rosters will be announced on ${fmtDate(t.announce, ru)}. Teams are picked by nationality: the best at each position (14 forwards, 8 defensemen, 3 goalies), with European-league depth where a nation runs short.`,
            )}
          </p>
        </Panel>
      ) : (
        <div className="competition-grid">
          <div>
            {t.medals && (
              <div className="podium">
                {(["silver", "gold", "bronze"] as MedalColor[]).map((medal) => (
                  <div key={medal} className={`podium-step ${medal}`}>
                    <MedalChip medal={medal} ru={ru} />
                    <NationBadge code={t.medals![medal]} ru={ru} />
                  </div>
                ))}
              </div>
            )}
            <Panel title={tr("ПЛЕЙ-ОФФ", "PLAYOFF BRACKET")}>
              <div className={`bracket cols-${knockout.length}`}>
                {knockout.map((stage) => {
                  const games = t.games.filter((g) => g.stage === stage);
                  const expected = stage === "qf" ? 4 : stage === "sf" ? 2 : 1;
                  return (
                    <div key={stage} className="bracket-col">
                      <h4>{ru ? STAGE_LABELS[stage].ru : STAGE_LABELS[stage].en}</h4>
                      {games.map((g) => (
                        <GameRow key={g.id} game={g} ru={ru} winner={winnerOf(g)} />
                      ))}
                      {Array.from({ length: expected - games.length }, (_, i) => (
                        <div key={i} className="bracket-game pending">
                          <span>{tr("Определится", "TBD")}</span>
                        </div>
                      ))}
                      {stage === "final" &&
                        t.games
                          .filter((g) => g.stage === "bronze")
                          .map((g) => (
                            <div key={g.id}>
                              <h4>{ru ? STAGE_LABELS.bronze.ru : STAGE_LABELS.bronze.en}</h4>
                              <GameRow game={g} ru={ru} winner={winnerOf(g)} />
                            </div>
                          ))}
                    </div>
                  );
                })}
              </div>
            </Panel>
            <div className="group-grid">
              {(["A", "B"] as const).map((group) => (
                <Panel key={group} title={tr(`ГРУППА ${group}`, `GROUP ${group}`)}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{tr("СБОРНАЯ", "NATION")}</th>
                        <th>GP</th>
                        <th title="W-OTW-OTL-L">{tr("В-ВО-ПО-П", "W-OW-OL-L")}</th>
                        <th>{tr("Ш", "GF-GA")}</th>
                        <th>{tr("О", "PTS")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupTable(t, group).map((row, i) => (
                        <tr
                          key={row.code}
                          className={`${nation === row.code ? "selected" : ""} ${i < (t.qfDay ? 4 : 2) ? "qualify" : ""}`}
                          onClick={() => setNation(row.code)}
                        >
                          <td>{i + 1}</td>
                          <td>
                            <NationBadge code={row.code} ru={ru} />
                          </td>
                          <td>{row.gp}</td>
                          <td>
                            {row.w}-{row.otw}-{row.otl}-{row.l}
                          </td>
                          <td>
                            {row.gf}-{row.ga}
                          </td>
                          <td>
                            <b>{row.pts}</b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              ))}
            </div>
            {selected && (
              <Panel
                title={tr("СОСТАВ СБОРНОЙ", "NATIONAL TEAM ROSTER")}
                extra={
                  <select
                    value={selected.code}
                    onChange={(event) => setNation(event.target.value)}
                    aria-label={tr("Сборная", "Nation")}
                  >
                    {t.teams.map((team) => (
                      <option key={team.code} value={team.code}>
                        {nationName(team.code, ru)}
                      </option>
                    ))}
                  </select>
                }
              >
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{tr("ИГРОК", "PLAYER")}</th>
                        <th>POS</th>
                        <th>OVR</th>
                        <th>{tr("КЛУБ", "CLUB")}</th>
                        <th>GP</th>
                        <th>G</th>
                        <th>A</th>
                        <th>PTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.roster.map((e) => {
                        const line = t.stats[e.id];
                        return (
                          <tr key={e.id} className={ownIds.has(e.id) ? "own-row" : ""}>
                            <td>
                              {e.generated ? (
                                <strong>{e.name}</strong>
                              ) : (
                                <PlayerLink id={e.id}>
                                  <strong>{e.name}</strong>
                                </PlayerLink>
                              )}
                            </td>
                            <td>{e.pos}</td>
                            <td>{e.ovr}</td>
                            <td>{e.club}</td>
                            <td>{line?.gp ?? 0}</td>
                            <td>{line?.g ?? 0}</td>
                            <td>{line?.a ?? 0}</td>
                            <td>
                              <b>{(line?.g ?? 0) + (line?.a ?? 0)}</b>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </div>
          <div>
            <Panel
              title={tr(`ВЫЗВАНЫ ИЗ ${game.user}`, `CALLED UP FROM ${game.user}`)}
              extra={<span>{called.length}</span>}
            >
              {called.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>{tr("ИГРОК", "PLAYER")}</th>
                      <th>{tr("СБОРНАЯ", "NATION")}</th>
                      <th>GP</th>
                      <th>PTS</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {called.map(({ e, code }) => {
                      const line = t.stats[e.id];
                      const medal = line ? medalOf(code) : undefined;
                      const hurt = t.injuries.find((injury) => injury.id === e.id);
                      return (
                        <tr key={e.id}>
                          <td>
                            <PlayerLink id={e.id}>
                              <strong>{e.name}</strong>
                            </PlayerLink>
                            <small>{e.pos}</small>
                          </td>
                          <td>
                            <NationBadge code={code} ru={ru} short />
                          </td>
                          <td>{line?.gp ?? 0}</td>
                          <td>{line ? line.g + line.a : 0}</td>
                          <td>
                            {medal && <MedalChip medal={medal} ru={ru} />}
                            {hurt && (
                              <span className="injury-chip">
                                {tr(`травма ${hurt.days} дн.`, `injured ${hurt.days}d`)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="empty-state">
                  {tr("Никто из игроков клуба не вызван.", "None of your players were called up.")}
                </p>
              )}
            </Panel>
            <Panel title={tr("БОМБАРДИРЫ", "SCORING LEADERS")}>
              <table>
                <thead>
                  <tr>
                    <th>{tr("ИГРОК", "PLAYER")}</th>
                    <th></th>
                    <th>GP</th>
                    <th>G</th>
                    <th>A</th>
                    <th>PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.map((line) => (
                    <tr key={line.id} className={ownIds.has(line.id) ? "own-row" : ""}>
                      <td>
                        <PlayerLink id={line.id}>
                          <strong>{line.name}</strong>
                        </PlayerLink>
                        <small>{line.club}</small>
                      </td>
                      <td>
                        <NationBadge code={line.nation} ru={ru} short />
                      </td>
                      <td>{line.gp}</td>
                      <td>{line.g}</td>
                      <td>{line.a}</td>
                      <td>
                        <b>{line.g + line.a}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!leaders.length && (
                <p className="empty-state">{tr("Матчи ещё не сыграны.", "No games played yet.")}</p>
              )}
            </Panel>
            {goalies.length > 0 && (
              <Panel title={tr("ВРАТАРИ", "GOALTENDERS")}>
                <table>
                  <tbody>
                    {goalies.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <PlayerLink id={line.id}>
                            <strong>{line.name}</strong>
                          </PlayerLink>
                        </td>
                        <td>
                          <NationBadge code={line.nation} ru={ru} short />
                        </td>
                        <td>{line.gp} GP</td>
                        <td>
                          <b>{((line.sa - line.ga) / line.sa).toFixed(3).replace(/^0/, "")}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
            {t.injuries.length > 0 && (
              <Panel title={tr("ТРАВМЫ НА ТУРНИРЕ", "TOURNAMENT INJURIES")}>
                <ul className="intl-injuries">
                  {t.injuries.map((injury) => (
                    <li key={`${injury.id}-${injury.date}`}>
                      <NationBadge code={injury.nation} ru={ru} short />
                      <strong>{injury.name}</strong>
                      <span>{injury.club}</span>
                      <em>{tr(`${injury.days} дн.`, `${injury.days}d`)}</em>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function InternationalCenter({ game }: { game: Game }) {
  const ru = game.language === "ru";
  const tr = (a: string, b: string) => (ru ? a : b);
  const season = game.internationalSeason?.year === game.year ? game.internationalSeason : undefined;
  const tournaments = season?.tournaments ?? [];
  const today = game.calendar?.date ?? "";
  const recent = [...tournaments]
    .reverse()
    .find(
      (t) =>
        t.status === "complete" &&
        Date.parse(`${today}T00:00:00Z`) - Date.parse(`${t.end}T00:00:00Z`) <= 45 * 86_400_000,
    );
  const initial =
    tournaments.find((t) => t.status === "live" || t.status === "announced") ??
    recent ??
    tournaments.find((t) => t.status !== "complete") ??
    tournaments[0];
  const [tab, setTab] = useState<string>(initial?.id ?? "history");
  const current = tournaments.find((t) => t.id === tab);
  const history = [...(game.internationalHistory ?? [])].reverse();
  const table = medalTable(game.internationalHistory ?? []);
  return (
    <div className="competition-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{tr("МЕЖДУНАРОДНЫЙ ХОККЕЙ", "INTERNATIONAL HOCKEY")}</span>
          <h1>{tr("Турниры сборных", "International tournaments")}</h1>
          <p>
            {tr(
              "Февральский турнир лучших с паузой в NHL и майский чемпионат мира. Матчи сборных не влияют на таблицу и статистику NHL, но травмы, усталость и настроение игроков возвращаются в клубы.",
              "A February best-on-best event with an NHL break and a World Championship in May. National-team games never touch NHL standings or stats, but injuries, fatigue and morale come back to the clubs.",
            )}
          </p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {tournaments.map((t) => (
          <button
            key={t.id}
            role="tab"
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {ru ? TOURNAMENT_NAMES[t.kind].ru : TOURNAMENT_NAMES[t.kind].en} {t.end.slice(0, 4)}
          </button>
        ))}
        <button
          role="tab"
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          {tr("Медали и история", "Medals & history")}
        </button>
      </div>
      {current ? (
        <TournamentView key={current.id} game={game} t={current} />
      ) : (
        <div className="competition-grid">
          <Panel title={tr("ТАБЛИЦА МЕДАЛЕЙ", "MEDAL TABLE")}>
            {table.length ? (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{tr("СБОРНАЯ", "NATION")}</th>
                    <th>{tr("ЗОЛ", "G")}</th>
                    <th>{tr("СЕР", "S")}</th>
                    <th>{tr("БР", "B")}</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row, i) => (
                    <tr key={row.code}>
                      <td>{i + 1}</td>
                      <td>
                        <NationBadge code={row.code} ru={ru} />
                      </td>
                      <td className="gold-text">{row.gold}</td>
                      <td className="silver-text">{row.silver}</td>
                      <td className="bronze-text">{row.bronze}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-state">
                {tr(
                  "Медалей пока нет: первый турнир пройдёт в феврале.",
                  "No medals yet: the first tournament is in February.",
                )}
              </p>
            )}
          </Panel>
          <Panel title={tr("ИСТОРИЯ ТУРНИРОВ", "TOURNAMENT HISTORY")}>
            {history.length ? (
              <table>
                <thead>
                  <tr>
                    <th>{tr("ГОД", "YEAR")}</th>
                    <th>{tr("ТУРНИР", "EVENT")}</th>
                    <th>{tr("ЗОЛОТО", "GOLD")}</th>
                    <th>{tr("СЕРЕБРО", "SILVER")}</th>
                    <th>{tr("БРОНЗА", "BRONZE")}</th>
                    <th>{tr("БОМБАРДИР", "TOP SCORER")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={`${h.kind}-${h.year}`}>
                      <td>{h.year}</td>
                      <td>
                        {ru ? TOURNAMENT_NAMES[h.kind].ru : TOURNAMENT_NAMES[h.kind].en}
                        <small>{ru ? h.host.ru : h.host.en}</small>
                      </td>
                      <td>
                        <NationBadge code={h.gold} ru={ru} short />
                      </td>
                      <td>
                        <NationBadge code={h.silver} ru={ru} short />
                      </td>
                      <td>
                        <NationBadge code={h.bronze} ru={ru} short />
                      </td>
                      <td>
                        {h.topScorer ? (
                          <>
                            <PlayerLink id={h.topScorer.id}>{h.topScorer.name}</PlayerLink>{" "}
                            <small>
                              {h.topScorer.pts} {tr("очк.", "pts")}
                            </small>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-state">{tr("История появится после первого турнира.", "History starts after the first tournament.")}</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
