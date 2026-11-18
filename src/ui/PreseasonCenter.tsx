import { ArrowDown, ArrowUp, Minus, Trophy } from "lucide-react";
import type { Game } from "../engine/types";
import {
  CAMP_PHASES,
  CUP_NAME,
  battleSpots,
  campCountdown,
  campDates,
  campPhase,
  cupStandings,
  setCampOverride,
  type CampCandidate,
  type CampGroup,
  type CupFixture,
} from "../engine/preseason";
import { Panel } from "./components";
import { ClubLink, PlayerLink } from "./links";

type Edit = (fn: (g: Game) => void) => void;

const fmtDate = (date: string, ru: boolean) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(ru ? "ru-RU" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

function Trend({ c }: { c: CampCandidate }) {
  if (!c.rank || !c.previousRank || c.previousRank === c.rank)
    return <Minus size={12} className="trend flat" />;
  return c.previousRank > c.rank ? (
    <ArrowUp size={12} className="trend up" />
  ) : (
    <ArrowDown size={12} className="trend down" />
  );
}

function scoreLine(f: CupFixture) {
  if (!f.goals) return "—";
  return `${f.goals[0]}:${f.goals[1]}${f.so ? " SO" : f.ot ? " OT" : ""}`;
}

export default function PreseasonCenter({
  game,
  edit,
}: {
  game: Game;
  edit: Edit;
}) {
  const ru = game.language === "ru";
  const tr = (a: string, b: string) => (ru ? a : b);
  const state = game.preseason?.year === game.year ? game.preseason : undefined;
  const history = [...(game.preseasonCupHistory ?? [])].reverse();
  const cupName = ru ? CUP_NAME.ru : CUP_NAME.en;

  const intro = (
    <div className="page-intro">
      <div>
        <span className="eyebrow">{tr("ТРЕНИРОВОЧНЫЙ ЛАГЕРЬ", "TRAINING CAMP")}</span>
        <h1>{tr("Предсезонье", "Preseason")}</h1>
        <p>
          {tr(
            "Три недели до открытия сезона: тесты, борьба за последние места, товарищеские матчи и турнир на нейтральной арене. Результаты не идут в таблицу и статистику NHL.",
            "Three weeks before opening night: testing, battles for the last spots, exhibition games and a neutral-site cup. Nothing here counts in the NHL standings or stats.",
          )}
        </p>
      </div>
    </div>
  );

  if (!state)
    return (
      <div className="competition-page">
        {intro}
        <Panel title={tr("ЛАГЕРЬ НЕДОСТУПЕН", "NO CAMP THIS SEASON")}>
          <p className="empty-state">
            {tr(
              "Эта карьера начата до появления тренировочного лагеря. Лагерь и турнир откроются 15 сентября следующего сезона.",
              "This career was saved before training camps existed. Camp and the cup open on September 15 next season.",
            )}
          </p>
        </Panel>
        {history.length > 0 && <CupHistory game={game} />}
      </div>
    );

  const phase = campPhase(game);
  const phaseIndex = CAMP_PHASES.findIndex((p) => p.key === phase);
  const countdown = campCountdown(game);
  const dates = campDates(state.year);
  const table = cupStandings(state.cup);
  const competing = state.candidates.filter((c) => c.status === "competing");
  const userRow = table.findIndex((row) => row.team === game.user) + 1;
  const place = state.cup.winner
    ? state.cup.winner === game.user
      ? 1
      : state.cup.runnerUp === game.user
        ? 2
        : state.cup.third === game.user
          ? 3
          : 4
    : undefined;
  const change = (playerId: string, value: "keep" | "cut" | undefined) =>
    edit((g) => setCampOverride(g, playerId, value));
  const sourceLabel = (c: CampCandidate) =>
    c.source === "nhl" ? "NHL" : c.source === "farm" ? "AHL" : tr("ЮН", "JR");
  const statusLabel = (c: CampCandidate) =>
    c.status === "made"
      ? tr("В составе", "Made team")
      : c.status === "farm"
        ? tr("В AHL", "To AHL")
        : c.status === "junior"
          ? tr("В юниоры", "To junior")
          : tr("Борется", "Competing");

  const battle = (group: CampGroup) => {
    const spots = battleSpots(state, group);
    const rows = [...state.candidates]
      .filter((c) => c.group === group)
      .sort(
        (a, b) =>
          Number(!a.rank) - Number(!b.rank) || a.rank - b.rank || b.score - a.score,
      );
    return (
      <Panel
        title={
          group === "F"
            ? tr("БОРЬБА ЗА МЕСТА · НАПАДАЮЩИЕ", "ROSTER BATTLE · FORWARDS")
            : tr("БОРЬБА ЗА МЕСТА · ЗАЩИТНИКИ", "ROSTER BATTLE · DEFENSE")
        }
        extra={
          <span>
            {tr(`${spots} мест`, `${spots} spot${spots === 1 ? "" : "s"}`)}
          </span>
        }
      >
        <div className="table-scroll">
          <table className="camp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{tr("ИГРОК", "PLAYER")}</th>
                <th>{tr("ОТКУДА", "FROM")}</th>
                <th>OVR</th>
                <th title={tr("Оценка лагеря", "Camp score")}>{tr("ОЦЕНКА", "SCORE")}</th>
                <th>GP</th>
                <th>G-A</th>
                <th>{tr("РЕЙТ.", "RTG")}</th>
                <th>{tr("ТРЕН.", "PRAC")}</th>
                <th>{tr("СТАТУС", "STATUS")}</th>
                <th>{tr("РЕШЕНИЕ", "CALL")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const inLine = c.rank > 0 && c.rank <= spots;
                return (
                  <tr
                    key={c.playerId}
                    className={`${c.status !== "competing" ? `settled ${c.status}` : inLine ? "in-line" : "bubble"}`}
                  >
                    <td className="camp-rank">
                      {c.rank || "—"} <Trend c={c} />
                    </td>
                    <td>
                      <PlayerLink id={c.playerId}>
                        <strong>{c.name}</strong>
                      </PlayerLink>
                      <small>
                        {c.pos} · {c.age} {tr("лет", "yrs")}
                      </small>
                    </td>
                    <td>
                      <span className={`camp-source ${c.source}`}>{sourceLabel(c)}</span>
                    </td>
                    <td>{c.ovr}</td>
                    <td>
                      <b className="camp-score">{c.score.toFixed(1)}</b>
                    </td>
                    <td>{c.games}</td>
                    <td>
                      {c.goals}-{c.assists}
                    </td>
                    <td>{c.games ? (c.ratingSum / c.games).toFixed(1) : "—"}</td>
                    <td className={c.practice >= 0 ? "pos" : "neg"}>
                      {c.practice > 0 ? "+" : ""}
                      {c.practice.toFixed(1)}
                    </td>
                    <td>
                      <span className={`camp-status ${c.status}`}>{statusLabel(c)}</span>
                    </td>
                    <td>
                      {c.status === "competing" && !state.finalCutsDone ? (
                        <div className="camp-override" role="group">
                          {(
                            [
                              [undefined, tr("Штаб", "Staff")],
                              ["keep", tr("Оставить", "Keep")],
                              ["cut", tr("Отчислить", "Cut")],
                            ] as const
                          ).map(([value, label]) => (
                            <button
                              key={label}
                              className={c.override === value ? "active" : ""}
                              onClick={() => change(c.playerId, value)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <small className="muted">—</small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  };

  const fixtureRow = (f: CupFixture) => (
    <div key={f.id} className={`cup-fixture ${[f.home, f.away].includes(game.user) ? "own" : ""}`}>
      <span className="cup-date">{fmtDate(f.date, ru)}</span>
      <span className="cup-stage">
        {f.stage === "final"
          ? tr("Финал", "Final")
          : f.stage === "third"
            ? tr("За 3-е", "3rd place")
            : tr("Группа", "Group")}
      </span>
      <ClubLink id={f.home} label="id" crest={16} />
      <b>{scoreLine(f)}</b>
      <ClubLink id={f.away} label="id" crest={16} />
    </div>
  );

  const exhibitions = (game.preseasonFixtures ?? []).filter((f) => f.kind !== "cup");

  return (
    <div className="competition-page">
      {intro}
      <div className="camp-phases" aria-label={tr("Этапы лагеря", "Camp phases")}>
        {CAMP_PHASES.map((p, index) => (
          <div
            key={p.key}
            className={index < phaseIndex ? "done" : index === phaseIndex ? "current" : ""}
          >
            <i>{index + 1}</i>
            <span>{ru ? p.ru : p.en}</span>
          </div>
        ))}
        <div className="camp-progress">
          <span style={{ width: `${countdown.progress}%` }} />
        </div>
      </div>
      <div className="metrics">
        <div className="metric">
          <small>{tr("ДО СТАРТА СЕЗОНА", "DAYS TO OPENER")}</small>
          <div>
            {Math.max(0, countdown.opener)}
            <span>{fmtDate(dates.opener, ru)}</span>
          </div>
        </div>
        <div className="metric">
          <small>{tr("ОТКРЫТЫХ МЕСТ", "OPEN SPOTS")}</small>
          <div>
            {battleSpots(state, "F") + battleSpots(state, "D")}
            <span>
              {battleSpots(state, "F")} F · {battleSpots(state, "D")} D
            </span>
          </div>
        </div>
        <div className="metric">
          <small>{tr("ЕЩЁ В БОРЬБЕ", "STILL COMPETING")}</small>
          <div>
            {competing.length}
            <span>
              {state.finalCutsDone
                ? tr("сокращения завершены", "cuts complete")
                : state.firstCutsDone
                  ? tr(`финальные: ${fmtDate(dates.finalCuts, ru)}`, `final cuts ${fmtDate(dates.finalCuts, ru)}`)
                  : tr(`первые: ${fmtDate(dates.firstCuts, ru)}`, `first cuts ${fmtDate(dates.firstCuts, ru)}`)}
            </span>
          </div>
        </div>
        <div className="metric">
          <small>{cupName.toUpperCase()}</small>
          <div>
            {place ? `#${place}` : userRow && table[0].gp ? `#${userRow}` : "—"}
            <span>
              {place
                ? tr("итог", "final placing")
                : table[0].gp
                  ? tr("место в группе", "group position")
                  : fmtDate(dates.cupGroup[0], ru)}
            </span>
          </div>
        </div>
      </div>
      <div className="competition-grid">
        <div>
          {battle("F")}
          {battle("D")}
          <p className="note">
            {tr(
              "Оценка лагеря = OVR + потенциал молодых + опыт NHL + тренировки + игра в матчах. Штаб не отправляет в AHL игроков с крупными контрактами и ветеранов 32+, а за один лагерь меняет не больше двух мест в каждой линии. «Оставить» и «Отчислить» действуют на финальных сокращениях.",
              "Camp score = OVR + upside for young players + NHL experience + practice + game performance. The staff will not send big contracts or 32+ veterans to the AHL, and changes at most two jobs per position group. Keep / Cut apply at the final cuts.",
            )}
          </p>
        </div>
        <div>
          <Panel
            title={cupName.toUpperCase()}
            extra={<span>{ru ? state.cup.host.ru : state.cup.host.en}</span>}
            className="cup-panel"
          >
            {state.cup.winner && (
              <div className={`cup-trophy ${state.cup.winner === game.user ? "own" : ""}`}>
                <Trophy size={26} />
                <div>
                  <small>{tr("ОБЛАДАТЕЛЬ КУБКА", "CUP WINNER")}</small>
                  <ClubLink id={state.cup.winner} crest={22} />
                </div>
              </div>
            )}
            <table className="cup-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{tr("КЛУБ", "CLUB")}</th>
                  <th>GP</th>
                  <th>W</th>
                  <th>OTW</th>
                  <th>OTL</th>
                  <th>L</th>
                  <th>{tr("Ш", "GD")}</th>
                  <th>{tr("О", "PTS")}</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row, index) => (
                  <tr key={row.team} className={row.team === game.user ? "you" : ""}>
                    <td>{index + 1}</td>
                    <td>
                      <ClubLink id={row.team} crest={18} label="id" />
                    </td>
                    <td>{row.gp}</td>
                    <td>{row.w}</td>
                    <td>{row.otw}</td>
                    <td>{row.otl}</td>
                    <td>{row.l}</td>
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
            <div className="cup-fixtures">{state.cup.fixtures.map(fixtureRow)}</div>
            {!state.cup.fixtures.some((f) => f.stage === "final") && (
              <p className="note">
                {tr(
                  `Финал и матч за 3-е место — ${fmtDate(dates.cupFinal, ru)}: 1-я команда группы против 2-й, 3-я против 4-й. Очки: 3 за победу в основное время, 2 — в овертайме, 1 — за поражение в овертайме.`,
                  `Final and third-place game on ${fmtDate(dates.cupFinal, ru)}: 1st vs 2nd, 3rd vs 4th. Points: 3 for a regulation win, 2 for an overtime win, 1 for an overtime loss.`,
                )}
              </p>
            )}
          </Panel>
          <Panel title={tr("ТОВАРИЩЕСКИЕ МАТЧИ", "EXHIBITION GAMES")}>
            <div className="cup-fixtures">
              {exhibitions.map((f) => (
                <div key={f.id} className="cup-fixture own">
                  <span className="cup-date">{fmtDate(f.date, ru)}</span>
                  <span className="cup-stage">{f.home === game.user ? tr("Дома", "Home") : tr("В гостях", "Away")}</span>
                  <ClubLink id={f.home} label="id" crest={16} />
                  <b>{f.result ? `${f.result.goals[0]}:${f.result.goals[1]}` : "—"}</b>
                  <ClubLink id={f.away} label="id" crest={16} />
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={tr("РЕШЕНИЯ ШТАБА", "STAFF DECISIONS")}>
            {state.decisions.length ? (
              <ul className="camp-decisions">
                {[...state.decisions].reverse().map((d, i) => (
                  <li key={`${d.playerId}-${i}`} className={d.to}>
                    <span>{fmtDate(d.date, ru)}</span>
                    <PlayerLink id={d.playerId}>
                      <strong>{d.name}</strong>
                    </PlayerLink>
                    <em>
                      {d.to === "nhl" ? "NHL" : d.to === "farm" ? "AHL" : tr("Юниоры", "Junior")}
                    </em>
                    <p>{ru ? d.reason.ru : d.reason.en}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">
                {tr(
                  `Первые сокращения — ${fmtDate(dates.firstCuts, ru)}, финальные — ${fmtDate(dates.finalCuts, ru)}.`,
                  `First cuts on ${fmtDate(dates.firstCuts, ru)}, final cuts on ${fmtDate(dates.finalCuts, ru)}.`,
                )}
              </p>
            )}
          </Panel>
          {history.length > 0 && <CupHistory game={game} />}
        </div>
      </div>
    </div>
  );
}

function CupHistory({ game }: { game: Game }) {
  const ru = game.language === "ru";
  return (
    <Panel title={ru ? "ПРОШЛЫЕ ПОБЕДИТЕЛИ" : "PAST WINNERS"}>
      <table>
        <thead>
          <tr>
            <th>{ru ? "СЕЗОН" : "SEASON"}</th>
            <th>{ru ? "ПОБЕДИТЕЛЬ" : "WINNER"}</th>
            <th>{ru ? "ФИНАЛИСТ" : "RUNNER-UP"}</th>
            <th>{ru ? "АРЕНА" : "HOST"}</th>
          </tr>
        </thead>
        <tbody>
          {[...(game.preseasonCupHistory ?? [])].reverse().map((h) => (
            <tr key={h.year} className={h.winner === game.user ? "you" : ""}>
              <td>{h.year}</td>
              <td>
                <ClubLink id={h.winner} crest={16} label="id" />
              </td>
              <td>
                <ClubLink id={h.runnerUp} crest={16} label="id" />
              </td>
              <td>{ru ? h.host.ru : h.host.en}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
