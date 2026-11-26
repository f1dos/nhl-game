import { useState, type ReactNode, type CSSProperties } from "react";
import { GitBranch, ListOrdered, Trophy } from "lucide-react";
import { seedConference, standings } from "../engine/season";
import type { Game, Series, Team } from "../engine/types";
import { ClubLink } from "./links";
import marks from "../assets/scoreboard-crests.json";
const clubMarks: Record<string,string> = marks;
function LeagueCrest({team,size}:{team:Team;size:number}) { return <img className="league-crest" width={size} height={size} alt="" src={clubMarks[team.id] ?? team.logoUrl}/>; }


type Translate = (ru: string, en: string) => string;
const divisionNames: Record<string, string> = {
  Atlantic: "Атлантический",
  Metropolitan: "Столичный",
  Central: "Центральный",
  Pacific: "Тихоокеанский",
};
const divisionCode: Record<string, string> = {
  Atlantic: "A",
  Metropolitan: "M",
  Central: "C",
  Pacific: "P",
};
const confName = (conf: string, t: Translate) =>
  conf === "East" ? t("Восток", "East") : t("Запад", "West");

function playoffSeeds(g: Game) {
  const labels = new Map<string, string>();
  for (const [side, conf] of ["East", "West"].entries()) {
    const clubs = g.teams.filter((t) => t.conference === conf);
    const pairs =
      g.bracket[0]?.slice(side * 4, side * 4 + 4) ?? seedConference(clubs);
    for (const [i, s] of pairs.entries()) {
      const division = clubs.find((t) => t.id === s.a)?.division ?? "";
      const prefix = divisionCode[division] ?? division;
      labels.set(s.a, prefix + (i % 2 === 0 ? "1" : "2"));
      labels.set(s.b, i % 2 === 0 ? (i === 0 ? "WC2" : "WC1") : prefix + "3");
    }
  }
  return labels;
}

export default function LeagueStandings({
  game: g,
  rankings,
  compact = false,
}: {
  game: Game;
  rankings?: ReactNode;
  compact?: boolean;
}) {
  const own = g.teams.find((t) => t.id === g.user)!;
  const t: Translate = (ru, en) => (g.language === "ru" ? ru : en);
  const [view, setView] = useState<"standings" | "bracket">("standings");
  const [scope, setScope] = useState("conference");
  const [conf, setConf] = useState(own.conference);
  const seeds = playoffSeeds(g);
  const complete = !!g.bracket[0]?.length;
  const started = complete || g.teams.some((team) => team.record.gp > 0);
  const labels = (club: Team) => {
    if (!started) return "—";
    const code = seeds.get(club.id);
    if (!code)
      return complete
        ? t("Вне плей-офф", "Missed playoffs")
        : t("Вне зоны", "Outside field");
    if (code.startsWith("WC"))
      return t("Уайлд-кард", "Wild card") + " " + code.slice(-1);
    return (complete ? t("Вышел", "Qualified") : t("Топ-3", "Top three")) + " · " + code;
  };
  const year = g.year + "/" + String(g.year + 1).slice(-2);
  const conference = standings(
    g.teams.filter((team) => team.conference === conf),
  );
  const groups =
    scope === "division"
      ? [...new Set(conference.map((c) => c.division))]
          .sort()
          .map((d) => ({
            title: t(divisionNames[d], d),
            clubs: conference.filter((c) => c.division === d),
          }))
      : [
          {
            title:
              scope === "league"
                ? t("Общая таблица", "League standings")
                : confName(conf, t),
            clubs: scope === "league" ? standings(g.teams) : conference,
          },
        ];
  return (
    <section className={"league-hub" + (compact ? " compact" : "")}>
      {!compact && (
        <header
          className="league-mast"
          style={{ "--club": own.color } as CSSProperties}
        >
          <img className="league-watermark" src={clubMarks[own.id]} alt="" />
          <div>
            <small>NHL · {year}</small>
            <h1>{t("Лига и плей-офф", "League & playoffs")}</h1>
          </div>
          <div className="league-own">
            <LeagueCrest team={own} size={46} />
            <div>
              <small>{t("Ваш клуб", "Your club")}</small>
              <strong>
                {own.city} {own.name}
              </strong>
              <span>
                {started
                  ? "#" +
                    (standings(
                      g.teams.filter((c) => c.conference === own.conference),
                    ).indexOf(own) +
                      1) +
                    " · " +
                    confName(own.conference, t) +
                    " · " +
                    labels(own)
                  : confName(own.conference, t)}
              </span>
            </div>
          </div>
        </header>
      )}
      <div className="league-views">
        {(
          [
            ["standings", ListOrdered, t("Таблица", "Standings")],
            ["bracket", GitBranch, t("Сетка плей-офф", "Playoff bracket")],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            aria-pressed={view === id}
            onClick={() => setView(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      {view === "standings" ? (
        <>
          <div className="league-tools">
            <div className="league-switch">
              {[
                ["conference", t("Конференции", "Conferences")],
                ["division", t("Дивизионы", "Divisions")],
                ["league", t("Вся лига", "Entire league")],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={scope === id}
                  onClick={() => setScope(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {scope !== "league" && (
              <div className="league-switch">
                {["East", "West"].map((id) => (
                  <button
                    key={id}
                    aria-pressed={conf === id}
                    onClick={() => setConf(id)}
                  >
                    {confName(id, t)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {groups.map(({ title, clubs }) => (
            <section className="league-section" key={title}>
              <header>
                <h2>{title}</h2>
                <span>
                  {complete
                    ? t("Итоги регулярного сезона", "Final standings")
                    : t("Регулярный сезон", "Regular season")}
                </span>
              </header>
              <div className="league-scroll">
                <table className="league-table">
                  <thead>
                    <tr>
                      {[
                        "#",
                        t("Клуб", "Club"),
                        t("И", "GP"),
                        t("В", "W"),
                        t("П", "L"),
                        t("ПО", "OTL"),
                        t("О", "PTS"),
                        t("ЗШ", "GF"),
                        t("ПШ", "GA"),
                        "+/−",
                        t("Последние 5", "Last five"),
                        complete
                          ? t("Плей-офф", "Playoffs")
                          : t("Текущая зона", "Current position"),
                      ].map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clubs.map((club, i) => {
                      const r = club.record;
                      const diff = r.gf - r.ga;
                      return (
                        <tr
                          key={club.id}
                          className={club.id === g.user ? "league-mine" : ""}
                        >
                          <td>{i + 1}</td>
                          <td>
                            <ClubLink team={club} className="league-club-link"><LeagueCrest team={club} size={27}/>{club.city} {club.name}</ClubLink>
                          </td>
                          <td>{r.gp}</td>
                          <td>{r.w}</td>
                          <td>{r.l}</td>
                          <td>{r.otl}</td>
                          <td className="league-points"><span>{r.pts}</span><i aria-hidden="true" style={{width: Math.min(100, r.pts/Math.max(1,clubs[0].record.pts)*100)*.34+"px"}}/></td>
                          <td>{r.gf}</td>
                          <td>{r.ga}</td>
                          <td>
                            {diff > 0 ? "+" : ""}
                            {diff}
                          </td>
                          <td>
                            <div className="league-form">
                              {r.form.map((f, i) => (
                                <b key={i} data-form={f}>
                                  {f === "W"
                                    ? t("В", "W")
                                    : f === "L"
                                      ? t("П", "L")
                                      : t("ОТ", "OT")}
                                </b>
                              ))}
                            </div>
                          </td>
                          <td>
                            <span
                              className="league-berth"
                              data-zone={
                                !started || !seeds.has(club.id)
                                  ? "out"
                                  : seeds.get(club.id)!.startsWith("WC")
                                    ? "wc"
                                    : "in"
                              }
                            >
                              {labels(club)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {!compact && rankings && (
            <details className="league-power">
              <summary>
                {t("Рейтинг силы команд", "Team power rankings")}
              </summary>
              {rankings}
            </details>
          )}
        </>
      ) : (
        <CupTree game={g} seeds={seeds} conf={conf} setConf={setConf} t={t} />
      )}
    </section>
  );
}

function CupTree({
  game: g,
  seeds,
  conf,
  setConf,
  t,
}: {
  game: Game;
  seeds: Map<string, string>;
  conf: string;
  setConf: (s: string) => void;
  t: Translate;
}) {
  const names = [
    t("Первый раунд", "First round"),
    t("Второй раунд", "Second round"),
    t("Финал конференции", "Conference final"),
    t("Финал Кубка", "Cup final"),
  ];
  const [detail, setDetail] = useState<string>();
  const selected = g.bracket.flat().find((s) => s.a + "/" + s.b === detail);
  const club = (id: string) => g.teams.find((c) => c.id === id)!;
  const seriesAt = (round: number, i: number) =>
    g.bracket[round]?.[i + (round < 3 && conf === "West" ? 4 >> round : 0)];
  const contender = (round: number, i: number) => {
    const s = seriesAt(round - 1, i);
    return s?.winner
      ? club(s.winner).name
      : s
        ? club(s.a).name + " / " + club(s.b).name
        : t("Победитель серии", "Series winner");
  };
  const champion = g.bracket[3]?.[0]?.winner;
  return (
    <section className="cup-board">
      <header>
        <div>
          <small>{t("Серии до четырёх побед", "Best-of-seven series")}</small>
          <h2>
            <Trophy size={22} />
            {t("Кубок Стэнли", "Stanley Cup")}
          </h2>
        </div>
        {champion && <div className="cup-titleholder"><LeagueCrest team={club(champion)} size={40}/><div><small>{t("Обладатель Кубка","Cup champion")}</small><strong>{club(champion).city} {club(champion).name}</strong></div></div>}
        <div className="league-switch">
          {["East", "West"].map((id) => (
            <button
              key={id}
              aria-pressed={conf === id}
              onClick={() => {
                setConf(id);
                setDetail(undefined);
              }}
            >
              {confName(id, t)}
            </button>
          ))}
        </div>
      </header>
      {!g.bracket[0]?.length ? (
        <p>
          {t(
            "Пары первого раунда появятся после последнего тура регулярного сезона.",
            "First-round matchups are set after the final regular-season games.",
          )}
        </p>
      ) : (
        <>
          <div className="cup-scroll">
            <div className="cup-tree">
              {names.map((name, r) => (
                <div className={"cup-col round-" + r} key={r}>
                  <h3>{r===3 && <Trophy size={14}/>} {name}</h3>
                  <div className="cup-slots">
                    {Array.from(
                      { length: r === 0 ? 4 : r === 1 ? 2 : 1 },
                      (_, i) => {
                        const s = seriesAt(r, i);
                        const pending =
                          r === 3
                            ? [
                                g.bracket[2]?.[0]?.winner ? club(g.bracket[2][0].winner!).name : t("Чемпион Востока", "Eastern champion"),
                                g.bracket[2]?.[1]?.winner ? club(g.bracket[2][1].winner!).name : t("Чемпион Запада", "Western champion"),
                              ]
                            : [contender(r, i * 2), contender(r, i * 2 + 1)];
                        const own = s && (s.a === g.user || s.b === g.user);
                        const status = s?.winner
                          ? t("Итог серии", "Final")
                          : s?.games.length
                            ? t("Серия идёт", "In progress")
                            : s
                              ? t("До первой игры", "Upcoming")
                              : t("Ожидание", "Pending");
                        return (
                          <div className="cup-slot" key={i}>
                            <button
                              disabled={!s}
                              className={
                                "cup-pair" +
                                (own ? " mine" : "") +
                                (s?.winner && r === 3 ? " champion" : "")
                              }
                              aria-expanded={
                                s ? detail === s.a + "/" + s.b : undefined
                              }
                              onClick={() =>
                                s &&
                                setDetail(
                                  detail === s.a + "/" + s.b
                                    ? undefined
                                    : s.a + "/" + s.b,
                                )
                              }
                            >
                              <small>
                                {status}
                                {own && <em>{t("Ваш клуб", "Your club")}</em>}
                              </small>
                              {s
                                ? [s.a, s.b].map((id, j) => (
                                    <span
                                      className="cup-team"
                                      data-won={s.winner === id}
                                      key={id}
                                    >
                                      <LeagueCrest team={club(id)} size={25} />
                                      <strong>{club(id).name}</strong>
                                      <i>{seeds.get(id)}</i>
                                      <span className="series-track" aria-hidden="true">{[1,2,3,4].map(win=><i key={win} data-filled={win<=s.wins[j]}/>)}</span>
                                      <b>{s.wins[j]}</b>
                                    </span>
                                  ))
                                : pending.map((p, j) => (
                                    <span className="cup-pending" key={j}>
                                      {p}
                                    </span>
                                  ))}
                            </button>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {selected && <SeriesDetails series={selected} club={club} t={t} />}
        </>
      )}
    </section>
  );
}

function SeriesDetails({
  series: s,
  club,
  t,
}: {
  series: Series;
  club: (id: string) => Team;
  t: Translate;
}) {
  return (
    <section className="cup-details">
      <h3>
        {club(s.a).city} {club(s.a).name} <b>{s.wins.join(" : ")}</b>{" "}
        {club(s.b).city} {club(s.b).name}
      </h3>
      {s.winner && (
        <p>
          {t("Победитель серии", "Series winner")} · {club(s.winner).city}{" "}
          {club(s.winner).name}
        </p>
      )}
      {s.games.length ? (
        <ol>
          {s.games.map((m, i) => (
            <li key={i}>
              <small>
                {t("Игра", "Game")} {i + 1}
              </small>
              <span>
                {m.home} <b>{m.goals.join(" : ")}</b> {m.away}
                {m.ot ? " OT" : ""}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p>{t("Серия ещё не началась.", "The series has not started yet.")}</p>
      )}
    </section>
  );
}
