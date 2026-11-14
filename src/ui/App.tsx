import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  Workflow,
  CalendarDays,
  Trophy,
  BarChart3,
  Mail,
  Wallet,
  History,
  Settings,
  ChevronRight,
  ArrowUpRight,
  Play,
  Save,
  Download,
  Upload,
  Plus,
  ArrowLeft,
  Activity,
  Snowflake,
  X,
} from "lucide-react";
import { useGame } from "../store";
import { newGame, autoLines, teamOverall } from "../engine/database";
import { advance, nextSeason, standings, dateForRound } from "../engine/season";
import { listGames, exportGame, validateSave, saveGame } from "../engine/saves";
import type { Game, Team, Player } from "../engine/types";
import { Crest, Panel, Rating, PlayerTable, Rink } from "./components";
import MatchCenter from "./MatchCenter";
const nav = [
  ["overview", "Обзор клуба", "Club overview", LayoutDashboard],
  ["inbox", "Входящие", "Inbox", Mail],
  ["roster", "Состав", "Roster", Users],
  ["tactics", "Тактика и звенья", "Tactics & lines", Workflow],
  ["schedule", "Календарь", "Schedule", CalendarDays],
  ["match", "Матч-центр", "Match center", Activity],
  ["league", "Таблица лиги", "League table", Trophy],
  ["stats", "Статистика", "Statistics", BarChart3],
  ["finances", "Финансы", "Finances", Wallet],
  ["history", "Карьера", "Career history", History],
  ["settings", "Сохранения", "Save manager", Settings],
] as const;
export default function App() {
  const { game: g, edit, setGame, error, clearError } = useGame();
  const [page, setPage] = useState("overview"),
    [creating, setCreating] = useState(false),
    [selected, setSelected] = useState("TOR"),
    [search, setSearch] = useState(""),
    [profile, setProfile] = useState<Player | null>(null),
    [saved, setSaved] = useState<Game[]>([]),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all"),
    [seed, setSeed] = useState(260027),
    [language, setLanguage] = useState<"ru" | "en">("ru");
  const [database] = useState(() => newGame());
  const ru = (g?.language || language) === "ru";
  const tr = (a: string, b: string) => (ru ? a : b);
  useEffect(() => {
    listGames()
      .then((xs) => {
        setSaved(xs);
        const last = xs.find(
          (x) => x.id === localStorage.getItem("nhlm26-last"),
        );
        if (last) setGame(validateSave(last));
      })
      .catch((e) => setNotice(e.message))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  const go = (p: string) => {
    setPage(p);
    setSearch("");
    setFilter("all");
  };
  const play = () => {
    edit(advance);
    setPage("match");
  };
  async function finish() {
    if (!g) return;
    setBusy(true);
    const copy = structuredClone(g);
    try {
      while (String(copy.phase) !== "offseason") {
        for (let i = 0; i < 4 && String(copy.phase) !== "offseason"; i++)
          advance(copy);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      setGame(copy);
      go("league");
      setNotice(tr("Сезон завершён", "Season complete"));
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 30e6) throw Error("File exceeds 30 MB");
      const imported = validateSave(JSON.parse(await file.text()));
      imported.id = `career-${Date.now()}`;
      setGame(imported);
      setCreating(false);
      go("overview");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  const notifySave = async () => {
    if (!g) return;
    try {
      await saveGame(g);
      setNotice(tr("Карьера сохранена", "Career saved"));
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  if (!ready)
    return (
      <div className="loading">
        <Snowflake size={40} />
        <h2>NHL MANAGER 26</h2>
      </div>
    );
  if (!g || creating) {
    const team = database.teams.find((t) => t.id === selected)!;
    return (
      <div className="new-career">
        <div className="start-top">
          <Brand />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as "ru" | "en")}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="start-heading">
          <div>
            <div className="eyebrow">YOUR CLUB. YOUR LEGACY.</div>
            <h1>
              {tr(
                "Большая игра начинается с вас.",
                "Greatness starts with you.",
              )}
            </h1>
            <p>
              {tr(
                "32 клуба. 82 матча. Одна мечта. Выберите свою команду.",
                "32 clubs. 82 games. One dream. Choose your team.",
              )}
            </p>
          </div>
          {g && (
            <button onClick={() => setCreating(false)}>
              <ArrowLeft size={16} />
              {tr("Вернуться", "Back")}
            </button>
          )}
        </div>
        <div className="career-layout">
          <div>
            <div className="tabs">
              {["all", "East", "West"].map((f) => (
                <button
                  key={f}
                  className={filter === f ? "active" : ""}
                  onClick={() => setFilter(f)}
                >
                  {f === "all"
                    ? tr("Все команды", "All teams")
                    : f === "East"
                      ? tr("Восток", "Eastern")
                      : tr("Запад", "Western")}
                </button>
              ))}
            </div>
            <div className="club-grid">
              {database.teams
                .filter((t) => filter === "all" || t.conference === filter)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelected(t.id)}
                    className={`club-card ${selected === t.id ? "selected" : ""}`}
                  >
                    <Crest team={t} />
                    <span>
                      <small>{t.city}</small>
                      <strong>{t.name}</strong>
                    </span>
                    <Rating value={teamOverall(t)} />
                  </button>
                ))}
            </div>
          </div>
          <aside
            className="club-preview"
            style={{ "--club": team.color } as React.CSSProperties}
          >
            <Crest team={team} size={110} />
            <small>{team.city.toUpperCase()}</small>
            <h2>{team.name}</h2>
            <p>
              {team.conference === "East" ? "EASTERN" : "WESTERN"} CONFERENCE ·{" "}
              {team.division.toUpperCase()}
            </p>
            <div className="preview-metrics">
              <div>
                <b>{teamOverall(team)}</b>
                <small>{tr("РЕЙТИНГ", "OVERALL")}</small>
              </div>
              <div>
                <b>{team.players.length}</b>
                <small>{tr("ИГРОКОВ", "PLAYERS")}</small>
              </div>
            </div>
            <label>
              SEED
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(+e.target.value)}
              />
            </label>
            <button
              className="primary"
              onClick={() => {
                const career = newGame(selected, seed);
                career.language = language;
                setGame(career);
                setCreating(false);
                go("overview");
              }}
            >
              {tr("Начать карьеру", "Start career")}
              <ArrowUpRight size={18} />
            </button>
            <p className="note">
              {tr(
                "База v0.1: все хоккеисты, контракты и рейтинги вымышлены. Названия клубов используются для идентификации.",
                "Database v0.1: all players, contracts and ratings are fictional. Club names are used for identification.",
              )}
            </p>
          </aside>
        </div>
        {saved.length > 0 && (
          <div className="continue-row">
            <span>{tr("Сохранённые карьеры", "Saved careers")}</span>
            {saved.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setGame(s);
                  setCreating(false);
                }}
              >
                {s.user} · {s.year}/{String(s.year + 1).slice(2)} · {s.round}/82
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  const team = g.teams.find((t) => t.id === g.user)!;
  const sorted = standings(g.teams);
  const conference = standings(
    g.teams.filter((t) => t.conference === team.conference),
  );
  const fixture = g.schedule.find(
    (f) => f.round === g.round && [f.home, f.away].includes(g.user),
  );
  const opponent = fixture
    ? g.teams.find(
        (t) => t.id === (fixture.home === g.user ? fixture.away : fixture.home),
      )
    : undefined;
  const title = nav.find((n) => n[0] === page)!;
  const salary = team.players.reduce((n, p) => n + p.salary, 0);
  const roster = team.players.filter(
    (p) =>
      (filter === "all" || p.pos === filter) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const leader = [...team.players].sort(
    (a, b) => b.stats.g + b.stats.a - a.stats.g - a.stats.a,
  )[0];
  const teamTable = (teams: Team[], compact = false) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>{tr("КОМАНДА", "TEAM")}</th>
            <th>GP</th>
            <th>W</th>
            <th>L</th>
            <th>OT</th>
            <th>PTS</th>
            {!compact && (
              <>
                <th>GF</th>
                <th>GA</th>
                <th>DIFF</th>
                <th>{tr("ФОРМА", "FORM")}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.id} className={t.id === g.user ? "my-team" : ""}>
              <td className="muted">{i + 1}</td>
              <td>
                <div className="team-cell">
                  <Crest team={t} size={28} />
                  <strong>{compact ? t.id : `${t.city} ${t.name}`}</strong>
                  {t.id === g.user && <span className="you">YOU</span>}
                </div>
              </td>
              <td>{t.record.gp}</td>
              <td>{t.record.w}</td>
              <td>{t.record.l}</td>
              <td>{t.record.otl}</td>
              <td className="bright">{t.record.pts}</td>
              {!compact && (
                <>
                  <td>{t.record.gf}</td>
                  <td>{t.record.ga}</td>
                  <td>{t.record.gf - t.record.ga}</td>
                  <td>
                    <div className="form">
                      {t.record.form.map((f, j) => (
                        <i key={j} className={f}>
                          {f}
                        </i>
                      ))}
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const scheduleRows = (count = 82) =>
    g.schedule
      .filter((f) => [f.home, f.away].includes(g.user))
      .slice(
        count === 82 ? 0 : Math.max(0, g.round - 1),
        count === 82 ? 82 : g.round + count - 1,
      )
      .map((f) => {
        const opp = g.teams.find(
          (t) => t.id === (f.home === g.user ? f.away : f.home),
        )!;
        return (
          <div key={f.id} className="fixture-row">
            <time>
              {dateForRound(g, f.round).toLocaleDateString(
                ru ? "ru-RU" : "en-GB",
                { day: "2-digit", month: "short" },
              )}
            </time>
            <span className="venue">{f.home === g.user ? "H" : "A"}</span>
            <Crest team={opp} size={28} />
            <strong>
              {opp.city} {opp.name}
            </strong>
            {f.result ? (
              <b>
                {f.result.goals[f.home === g.user ? 0 : 1]} –{" "}
                {f.result.goals[f.home === g.user ? 1 : 0]}{" "}
                {f.result.so ? "SO" : f.result.ot ? "OT" : ""}
              </b>
            ) : (
              <span className="muted">
                {f.round === g.round ? tr("СЛЕДУЮЩИЙ", "UP NEXT") : "19:00"}
              </span>
            )}
          </div>
        );
      });
  let content: ReactNode;
  if (page === "overview")
    content = (
      <>
        <div className="page-intro">
          <div>
            <span className="eyebrow">
              {tr("КАБИНЕТ ГЕНЕРАЛЬНОГО МЕНЕДЖЕРА", "GENERAL MANAGER’S OFFICE")}
            </span>
            <h1>
              {tr(
                "Новый день. Новые возможности.",
                "A new day. A new opportunity.",
              )}
            </h1>
            <p>
              {tr(
                "Всё, что нужно знать о вашей команде сегодня.",
                "Everything you need to know about your club today.",
              )}
            </p>
          </div>
          <span className="season-tag">
            {g.year} / {String(g.year + 1).slice(2)}
            <small>
              {g.phase === "regular"
                ? tr("РЕГУЛЯРНЫЙ СЕЗОН", "REGULAR SEASON")
                : g.phase === "playoffs"
                  ? "PLAYOFFS"
                  : tr("МЕЖСЕЗОНЬЕ", "OFFSEASON")}
            </small>
          </span>
        </div>
        <div className="metrics">
          <Metric
            label={tr("МЕСТО В КОНФЕРЕНЦИИ", "CONFERENCE POSITION")}
            value={`${conference.findIndex((t) => t.id === g.user) + 1}`}
            suffix="/ 16"
            detail={
              team.conference === "East"
                ? tr("Восточная конференция", "Eastern conference")
                : tr("Западная конференция", "Western conference")
            }
          />
          <Metric
            label={tr("ОЧКИ", "POINTS")}
            value={team.record.pts}
            suffix={`${team.record.gp} GP`}
            detail={`${team.record.w} W · ${team.record.l} L · ${team.record.otl} OT`}
          />
          <Metric
            label={tr("РАЗНИЦА ШАЙБ", "GOAL DIFFERENTIAL")}
            value={`${team.record.gf - team.record.ga >= 0 ? "+" : ""}${team.record.gf - team.record.ga}`}
            detail={`${team.record.gf} GF / ${team.record.ga} GA`}
          />
          <Metric
            label={tr("МЕСТО ПОД ПОТОЛКОМ", "CAP SPACE")}
            value={`$${(g.rules.cap - salary).toFixed(1)}`}
            suffix="M"
            detail={`${tr("Потолок", "Cap")} $${g.rules.cap.toFixed(1)}M · ${tr("демо-правила", "demo rules")}`}
          />
        </div>
        <div className="overview-grid">
          <div className="main-column">
            <section className="next-game">
              <div className="panel-title">
                <h3>{tr("СЛЕДУЮЩИЙ МАТЧ", "NEXT MATCH")}</h3>
                <span className="live-dot">
                  {tr("ГОТОВЫ К ИГРЕ", "READY TO PLAY")}
                </span>
              </div>
              <div className="next-content">
                <div>
                  <Crest team={team} size={80} />
                  <h2>
                    {team.city}
                    <small>{team.name}</small>
                  </h2>
                </div>
                <div className="versus">
                  <span>
                    {fixture
                      ? dateForRound(g).toLocaleDateString(
                          ru ? "ru-RU" : "en-GB",
                          { day: "numeric", month: "long" },
                        )
                      : g.phase === "offseason"
                        ? tr("Сезон завершён", "Season complete")
                        : "PLAYOFFS"}
                  </span>
                  <b>VS</b>
                  <small>
                    {fixture
                      ? fixture.home === g.user
                        ? tr("ДОМАШНЯЯ ПЛОЩАДКА", "HOME ICE")
                        : tr("ВЫЕЗДНОЙ МАТЧ", "AWAY GAME")
                      : tr("Борьба за Кубок", "The road to the Cup")}
                  </small>
                </div>
                <div>
                  {opponent ? (
                    <>
                      <Crest team={opponent} size={80} />
                      <h2>
                        {opponent.city}
                        <small>{opponent.name}</small>
                      </h2>
                    </>
                  ) : (
                    <Trophy size={74} color="#baa775" />
                  )}
                </div>
              </div>
              <div className="next-bottom">
                <span>
                  <i className="status-dot" />
                  {tr("Состав готов", "Lineup ready")} · {teamOverall(team)} OVR
                </span>
                <button onClick={() => go("tactics")}>
                  {tr("Подготовить команду", "Prepare team")}
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </section>
            <Panel
              title={tr("КАЛЕНДАРЬ КОМАНДЫ", "TEAM SCHEDULE")}
              extra={
                <button className="text-button" onClick={() => go("schedule")}>
                  {tr("Весь календарь", "Full schedule")}
                  <ChevronRight size={14} />
                </button>
              }
            >
              {scheduleRows(5)}
            </Panel>
            <Panel title={tr("ИЗ КАБИНЕТА ТРЕНЕРА", "FROM THE COACH’S OFFICE")}>
              <div className="coach-note">
                <span className="avatar">AC</span>
                <div>
                  <strong>
                    {tr(
                      "Сыгранность начинается со звеньев",
                      "Chemistry starts with your lines",
                    )}
                  </strong>
                  <p>
                    {tr(
                      "Первые два звена получают больше игрового времени. Сильный пас и командная игра повышают качество моментов. Проверьте готовность вратаря перед матчем.",
                      "Your top two lines get more ice time. Passing and teamwork improve chance quality. Check your goalie’s condition before the game.",
                    )}
                  </p>
                  <button className="text-button" onClick={() => go("tactics")}>
                    {tr("Перейти к тактике", "Review tactics")}
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            </Panel>
          </div>
          <div className="side-column">
            <Panel
              title={tr("ТУРНИРНАЯ ТАБЛИЦА", "STANDINGS")}
              extra={
                <button
                  className="icon-button"
                  aria-label="League"
                  onClick={() => go("league")}
                >
                  <ArrowUpRight size={16} />
                </button>
              }
            >
              <div className="subheading">
                {team.division.toUpperCase()} DIVISION
              </div>
              {teamTable(
                standings(g.teams.filter((t) => t.division === team.division)),
                true,
              )}
            </Panel>
            <Panel title={tr("В ЦЕНТРЕ ВНИМАНИЯ", "PLAYER SPOTLIGHT")}>
              <button className="spotlight" onClick={() => setProfile(leader)}>
                <span
                  className="jersey"
                  style={{ "--club": team.color } as React.CSSProperties}
                >
                  {leader.number}
                </span>
                <div>
                  <small>
                    {leader.pos} · {leader.nation}
                  </small>
                  <h3>{leader.name}</h3>
                  <span>
                    {leader.stats.g} G <i>·</i> {leader.stats.a} A <i>·</i>{" "}
                    {leader.stats.g + leader.stats.a} PTS
                  </span>
                </div>
                <Rating value={leader.ovr} />
              </button>
            </Panel>
          </div>
        </div>
      </>
    );
  else if (page === "roster")
    content = (
      <>
        <PageTitle
          title={tr("Состав команды", "Team roster")}
          sub={`${team.city} ${team.name} · ${team.players.length} ${tr("игрока", "players")}`}
        />
        <div className="toolbar">
          <div className="tabs">
            {["all", "LW", "C", "RW", "D", "G"].map((p) => (
              <button
                className={filter === p ? "active" : ""}
                key={p}
                onClick={() => setFilter(p)}
              >
                {p === "all" ? tr("Все игроки", "All players") : p}
              </button>
            ))}
          </div>
          <input
            placeholder={tr("Найти игрока…", "Search players…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Panel
          title={tr("ОСНОВНОЙ СОСТАВ И РЕЗЕРВ", "FIRST TEAM & RESERVES")}
          extra={
            <span className="tag">
              {tr("ВЫМЫШЛЕННАЯ БАЗА", "FICTIONAL DATABASE")}
            </span>
          }
        >
          <PlayerTable
            players={roster}
            onSelect={setProfile}
            lang={g.language}
          />
        </Panel>
      </>
    );
  else if (page === "tactics")
    content = (
      <TacticsView
        game={g}
        team={team}
        edit={edit}
        tr={tr}
        onSelect={setProfile}
      />
    );
  else if (page === "match")
    content = (
      <>
        <PageTitle
          title={tr("Матч-центр", "Match center")}
          sub={tr("Каждое решение имеет значение.", "Every decision matters.")}
        />
        <MatchCenter game={g} />
      </>
    );
  else if (page === "schedule")
    content = (
      <>
        <PageTitle
          title={tr("Календарь сезона", "Season schedule")}
          sub={tr(
            "82 матча · 41 дома / 41 в гостях · синтетический календарь",
            "82 games · 41 home / 41 away · synthetic schedule",
          )}
        />
        <Panel
          title={`${g.year} / ${g.year + 1}`}
          extra={<span>{team.record.gp} / 82</span>}
        >
          {scheduleRows()}
        </Panel>
      </>
    );
  else if (page === "league")
    content = (
      <>
        <PageTitle
          title={tr("Лига и плей-офф", "League & playoffs")}
          sub={tr(
            "Три лидера каждого дивизиона + две wild card в конференции",
            "Top three per division + two wild cards per conference",
          )}
        />
        <div className="tabs">
          {["all", "East", "West"].map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? tr("Вся лига", "Entire league")
                : f === "East"
                  ? tr("Восток", "East")
                  : tr("Запад", "West")}
            </button>
          ))}
        </div>
        <Panel title={tr("РЕГУЛЯРНЫЙ ЧЕМПИОНАТ", "REGULAR SEASON")}>
          {teamTable(
            filter === "all"
              ? sorted
              : standings(g.teams.filter((t) => t.conference === filter)),
          )}
        </Panel>
        {g.bracket.length > 0 && (
          <Panel
            title={tr(
              "КУБОК СТЭНЛИ · СЕРИИ ДО 4 ПОБЕД",
              "STANLEY CUP · BEST OF SEVEN",
            )}
          >
            <div className="bracket">
              {g.bracket.map((round, i) => (
                <div key={i}>
                  <h4>
                    {
                      [
                        tr("Первый раунд", "First round"),
                        tr("Второй раунд", "Second round"),
                        tr("Финалы конференций", "Conference finals"),
                        tr("Финал Кубка", "Stanley Cup final"),
                      ][i]
                    }
                  </h4>
                  {round.map((s) => (
                    <div className="series" key={s.a}>
                      <span className={s.winner === s.a ? "winner" : ""}>
                        {s.a}
                        <b>{s.wins[0]}</b>
                      </span>
                      <span className={s.winner === s.b ? "winner" : ""}>
                        {s.b}
                        <b>{s.wins[1]}</b>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </>
    );
  else if (page === "stats") {
    const players = g.teams
      .flatMap((t) => t.players)
      .filter((p) => p.pos !== "G")
      .sort(
        (a, b) =>
          b.stats.g + b.stats.a - a.stats.g - a.stats.a ||
          b.stats.g - a.stats.g,
      );
    content = (
      <>
        <PageTitle
          title={tr("Лидеры лиги", "League leaders")}
          sub={
            g.phase === "regular"
              ? tr("Статистика регулярного сезона", "Regular season statistics")
              : tr(
                  "Статистика плей-офф · регулярный сезон в профиле игрока",
                  "Playoff statistics · regular season in player profiles",
                )
          }
        />
        <Panel title={tr("БОМБАРДИРЫ · TOP 50", "SCORING · TOP 50")}>
          <PlayerTable
            players={players.slice(0, 50)}
            onSelect={setProfile}
            lang={g.language}
          />
        </Panel>
        <Panel title={tr("ВРАТАРИ", "GOALTENDERS")}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{tr("ИГРОК", "PLAYER")}</th>
                  <th>GP</th>
                  <th>W</th>
                  <th>SA</th>
                  <th>GA</th>
                  <th>SV%</th>
                  <th>GAA</th>
                </tr>
              </thead>
              <tbody>
                {g.teams
                  .flatMap((t) => t.players)
                  .filter((p) => p.pos === "G")
                  .sort((a, b) => b.stats.wins - a.stats.wins)
                  .slice(0, 32)
                  .map((p) => (
                    <tr key={p.id} onClick={() => setProfile(p)}>
                      <td>{p.name}</td>
                      <td>{p.stats.gp}</td>
                      <td>{p.stats.wins}</td>
                      <td>{p.stats.sa}</td>
                      <td>{p.stats.ga}</td>
                      <td>
                        {p.stats.sa
                          ? ((1 - p.stats.ga / p.stats.sa) * 100).toFixed(1)
                          : "—"}
                      </td>
                      <td>
                        {p.stats.toi
                          ? ((p.stats.ga * 60) / p.stats.toi).toFixed(2)
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </>
    );
  } else if (page === "finances")
    content = (
      <>
        <PageTitle
          title={tr("Финансы клуба", "Club finances")}
          sub={tr(
            "Демонстрационные контракты · миллионы долларов США",
            "Demonstration contracts · USD millions",
          )}
        />
        <div className="metrics">
          <Metric
            label={tr("ЗАРПЛАТНАЯ ВЕДОМОСТЬ", "PAYROLL")}
            value={`$${salary.toFixed(2)}M`}
          />
          <Metric
            label={tr("ПОТОЛОК ЗАРПЛАТ", "SALARY CAP")}
            value={`$${g.rules.cap}M`}
          />
          <Metric
            label={tr("СВОБОДНО", "AVAILABLE")}
            value={`$${(g.rules.cap - salary).toFixed(2)}M`}
          />
        </div>
        <Panel
          title={tr("КОНТРАКТЫ", "CONTRACTS")}
          extra={
            <label>
              {tr("Демо-потолок, $M", "Demo cap, $M")}{" "}
              <input
                className="cap-input"
                type="number"
                min={salary}
                max="300"
                value={g.rules.cap}
                onChange={(e) =>
                  edit((x) => {
                    x.rules.cap = Math.max(
                      salary,
                      Math.min(300, +e.target.value),
                    );
                  })
                }
              />
            </label>
          }
        >
          <table>
            <thead>
              <tr>
                <th>{tr("ИГРОК", "PLAYER")}</th>
                <th>POS</th>
                <th>AAV</th>
                <th>{tr("ЛЕТ", "YEARS")}</th>
                <th>{tr("ОБЩАЯ СУММА", "TOTAL")}</th>
              </tr>
            </thead>
            <tbody>
              {[...team.players]
                .sort((a, b) => b.salary - a.salary)
                .map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.pos}</td>
                    <td>${p.salary.toFixed(2)}M</td>
                    <td>{p.years}</td>
                    <td>${(p.salary * p.years).toFixed(2)}M</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Panel>
        <p className="note">
          {tr(
            "В первой версии контракты продлеваются автоматически. Переговоры, обмены, удержание зарплаты и полная CBA-модель пока не реализованы.",
            "In this release contracts renew automatically. Negotiations, trades, salary retention and a full CBA model are not implemented yet.",
          )}
        </p>
      </>
    );
  else if (page === "inbox")
    content = (
      <>
        <PageTitle
          title={tr("Входящие", "Inbox")}
          sub={tr(
            "Результаты и события вашей карьеры",
            "Results and events from your career",
          )}
        />
        <Panel title={tr("НОВОСТИ КЛУБА", "CLUB NEWS")}>
          {g.news.map((n, i) => (
            <div className="news-item" key={i}>
              <span className="news-icon">
                {i === 0 ? <Activity size={18} /> : <Mail size={18} />}
              </span>
              <div>
                <small>
                  NHL MANAGER · {g.year}/{String(g.year + 1).slice(2)}
                </small>
                <p>{n}</p>
              </div>
              {i === 0 && <span className="tag">NEW</span>}
            </div>
          ))}
        </Panel>
      </>
    );
  else if (page === "history")
    content = (
      <>
        <PageTitle
          title={tr("Ваша история", "Your legacy")}
          sub={`${team.city} ${team.name}`}
        />
        <Panel title={tr("ЗАЛ СЛАВЫ КАРЬЕРЫ", "CAREER RECORD")}>
          {!g.history.length ? (
            <div className="empty">
              <Trophy size={42} />
              <h3>
                {tr(
                  "Первая глава ещё пишется",
                  "The first chapter is still being written",
                )}
              </h3>
              <p>
                {tr(
                  "Завершите сезон, чтобы увидеть чемпиона и свой результат.",
                  "Finish a season to see the champion and your record.",
                )}
              </p>
            </div>
          ) : (
            g.history.map((h) => (
              <div className="fixture-row" key={h.year}>
                <b>
                  {h.year}/{h.year + 1}
                </b>
                <Trophy size={22} />
                <strong>{h.champion}</strong>
                <span>
                  {h.points} PTS · {g.user}
                </span>
              </div>
            ))
          )}
        </Panel>
      </>
    );
  else
    content = (
      <>
        <PageTitle
          title={tr("Сохранения и настройки", "Saves & settings")}
          sub={tr(
            "Автосохранение после каждого действия · IndexedDB",
            "Autosave after each action · IndexedDB",
          )}
        />
        <Panel title={tr("ТЕКУЩАЯ КАРЬЕРА", "CURRENT CAREER")}>
          <div className="settings-actions">
            <button onClick={notifySave}>
              <Save size={17} />
              {tr("Сохранить", "Save")}
            </button>
            <button onClick={() => exportGame(g)}>
              <Download size={17} />
              {tr("Экспорт JSON", "Export JSON")}
            </button>
            <label className="button">
              <Upload size={17} />
              {tr("Импорт JSON", "Import JSON")}
              <input
                hidden
                type="file"
                accept=".json"
                onChange={(e) => importFile(e.target.files?.[0])}
              />
            </label>
            <button
              onClick={() => {
                setCreating(true);
                setLanguage(g.language);
              }}
            >
              <Plus size={17} />
              {tr("Новая карьера", "New career")}
            </button>
            <select
              value={g.language}
              onChange={(e) =>
                edit((x) => {
                  x.language = e.target.value as "ru" | "en";
                })
              }
            >
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="settings-actions">
            <button
              onClick={() =>
                listGames()
                  .then(setSaved)
                  .catch((e) => setNotice(e.message))
              }
            >
              {tr("Показать сохранения", "List saves")}
            </button>
            {saved.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setGame(validateSave(s));
                  go("overview");
                }}
              >
                {s.user} · {s.year} · {s.round}/82
              </button>
            ))}
          </div>
        </Panel>
        {window.location.protocol !== "file:" && (
          <Panel title={tr("СКАЧАТЬ ПРОЕКТ", "DOWNLOAD PROJECT")}>
            <div className="settings-actions">
              <a
                className="button"
                href="/downloads/NHL-Manager-26.html"
                download
              >
                NHL-Manager-26.html
              </a>
              <a
                className="button"
                href="/downloads/nhl-manager-26-source.zip"
                download
              >
                {tr("Исходники + тесты ZIP", "Source + tests ZIP")}
              </a>
              <a className="button" href="/downloads/README.md" download>
                README
              </a>
            </div>
          </Panel>
        )}
        <Panel title={tr("ОБ ЭТОЙ ВЕРСИИ", "ABOUT THIS VERSION")}>
          <div className="about-text">
            <p>
              {tr(
                "v0.1 · Играбельная основа. 32 клуба, 768 вымышленных игроков, 30 характеристик, 82 игры, плей-офф и многосезонная карьера.",
                "v0.1 · Playable foundation. 32 clubs, 768 fictional players, 30 attributes, 82 games, playoffs and multiple seasons.",
              )}
            </p>
            <p>
              {tr(
                "Это не официальная игра NHL. Реальные составы 2026/27 не импортированы. Логотипы и фотографии NHL не используются. Правила и календарь упрощены; финансовые значения не являются проверенными данными NHL.",
                "This is not an official NHL game. No real 2026/27 rosters are imported. No NHL logos or photos are used. Rules and schedule are simplified; finances are not verified NHL data.",
              )}
            </p>
          </div>
        </Panel>
      </>
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        <div className="club-identity">
          <Crest team={team} size={42} />
          <div>
            <strong>{team.city}</strong>
            <small>{team.name}</small>
          </div>
          <span className="status-dot" />
        </div>
        <div className="nav-label">
          {tr("УПРАВЛЕНИЕ КЛУБОМ", "CLUB MANAGEMENT")}
        </div>
        <nav>
          {nav.map(([key, r, e, Icon], i) => (
            <div key={key}>
              {i === 6 && (
                <div className="nav-label">
                  {tr("ХОККЕЙНЫЙ МИР", "HOCKEY WORLD")}
                </div>
              )}
              <button
                className={page === key ? "active" : ""}
                onClick={() => go(key)}
              >
                <Icon size={17} />
                <span>{ru ? r : e}</span>
                {key === "inbox" && <em>{g.news.length}</em>}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="manager-avatar">GM</div>
          <div>
            <strong>{tr("Генеральный менеджер", "General manager")}</strong>
            <small>
              {tr("Карьера · локальное сохранение", "Career · local save")}
            </small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            {team.id}
            <ChevronRight size={14} />
            <span>{ru ? title[1] : title[2]}</span>
          </div>
          <div className="top-actions">
            <span className="game-date">
              <CalendarDays size={15} />
              {g.phase === "regular"
                ? dateForRound(g).toLocaleDateString(ru ? "ru-RU" : "en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : g.phase === "playoffs"
                  ? "PLAYOFFS"
                  : tr("Межсезонье", "Offseason")}
            </span>
            <button
              className="icon-button"
              aria-label="Save"
              onClick={notifySave}
            >
              <Save size={18} />
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                g.phase === "offseason"
                  ? (edit(nextSeason), go("overview"))
                  : play()
              }
            >
              {g.phase === "offseason"
                ? tr("Новый сезон", "New season")
                : tr("Следующий матч", "Next match")}
              <ChevronRight size={18} />
            </button>
          </div>
        </header>
        <div className="content">
          {content}
          <footer>
            <span>
              <i className="status-dot" />{" "}
              {tr("Вымышленная база данных", "Fictional database")} · v0.1
            </span>
            <span>
              SEED {g.seed} · {g.year}/{String(g.year + 1).slice(2)}
            </span>
            {g.phase !== "offseason" && (
              <button disabled={busy} className="text-button" onClick={finish}>
                {busy
                  ? tr("Симуляция…", "Simulating…")
                  : tr(
                      "Симулировать до конца сезона",
                      "Simulate to season end",
                    )}
                <Play size={12} />
              </button>
            )}
          </footer>
        </div>
      </main>
      {(notice || error) && (
        <div className="toast" role="status">
          {error || notice}
          <button
            aria-label="Close"
            onClick={() => {
              setNotice("");
              clearError();
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {profile && (
        <PlayerProfile
          player={
            g.teams
              .flatMap((t) => t.players)
              .find((p) => p.id === profile.id) || profile
          }
          tr={tr}
          onClose={() => setProfile(null)}
        />
      )}
      {busy && (
        <div className="busy-overlay">
          <Activity className="pulse" size={40} />
          <h2>{tr("Лига продолжает жить", "The league keeps moving")}</h2>
          <p>
            {tr(
              "Рассчитываем матчи, статистику и серии плей-офф…",
              "Simulating games, statistics and playoff series…",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-shield">NHL</span>
      <div>
        MANAGER <b>26</b>
        <small>BUILD YOUR LEGACY</small>
      </div>
    </div>
  );
}
function PageTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="page-intro">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  suffix,
  detail,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  detail?: string;
}) {
  return (
    <div className="metric">
      <small>{label}</small>
      <div>
        {value}
        <span>{suffix}</span>
      </div>
      <p>{detail}</p>
    </div>
  );
}
function TacticsView({
  game,
  team,
  edit,
  tr,
  onSelect,
}: {
  game: Game;
  team: Team;
  edit: (f: (g: Game) => void) => void;
  tr: (a: string, b: string) => string;
  onSelect: (p: Player) => void;
}) {
  const [drag, setDrag] = useState("");
  function replace(old: string, id: string) {
    edit((g) => {
      const t = g.teams.find((t) => t.id === g.user)!;
      const p = t.players.find((p) => p.id === id),
        q = t.players.find((p) => p.id === old);
      if (!p || !q || p.pos !== q.pos) return;
      t.lines = t.lines.map((l) =>
        l.map((x) => (x === old ? id : x === id ? old : x)),
      );
      t.defense = t.defense.map((l) =>
        l.map((x) => (x === old ? id : x === id ? old : x)),
      );
      if (t.goalie === old) t.goalie = id;
    });
  }
  const slot = (id: string) => {
    const p = team.players.find((p) => p.id === id)!;
    return (
      <div
        key={id}
        className="line-player"
        draggable
        onDragStart={() => setDrag(id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => replace(id, drag)}
      >
        <div>
          <span className="position">{p.pos}</span>
          <button className="text-button" onClick={() => onSelect(p)}>
            #{p.number}
          </button>
          <Rating value={p.ovr} />
        </div>
        <select
          aria-label={`${p.pos} lineup`}
          value={p.id}
          onChange={(e) => replace(id, e.target.value)}
        >
          {team.players
            .filter((x) => x.pos === p.pos)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
        <small>
          {tr("Готовность", "Condition")} {Math.round(100 - p.fatigue)}%{" "}
          {p.injury ? " · ✚" : ""}
        </small>
      </div>
    );
  };
  return (
    <>
      <PageTitle
        title={tr("Тактический центр", "Tactics center")}
        sub={tr(
          "Перетаскивайте игроков одной позиции или используйте списки.",
          "Drag players of the same position or use the selectors.",
        )}
      />
      <div className="tactics-grid">
        <div>
          <Panel
            title={tr("АТАКУЮЩИЕ ЗВЕНЬЯ", "FORWARD LINES")}
            extra={
              <button
                className="text-button"
                onClick={() =>
                  edit((g) => autoLines(g.teams.find((t) => t.id === g.user)!))
                }
              >
                {tr("Автоподбор", "Auto select")}
              </button>
            }
          >
            {team.lines.map((line, i) => (
              <div className="line-row" key={i}>
                <span className="line-index">
                  0{i + 1}
                  <small>{[30, 30, 20, 20][i]}%</small>
                </span>
                {line.map(slot)}
              </div>
            ))}
          </Panel>
          <Panel title={tr("ПАРЫ ЗАЩИТНИКОВ", "DEFENSIVE PAIRS")}>
            {team.defense.map((line, i) => (
              <div className="line-row defense" key={i}>
                <span className="line-index">0{i + 1}</span>
                {line.map(slot)}
              </div>
            ))}
          </Panel>
          <Panel title={tr("СТАРТОВЫЙ ВРАТАРЬ", "STARTING GOALIE")}>
            <div className="line-row goalie">{slot(team.goalie)}</div>
          </Panel>
        </div>
        <div>
          <Panel title={tr("ПЛАН НА ИГРУ", "GAME PLAN")}>
            <Rink>
              <span className="ice-word">{team.tactics.forecheck}</span>
            </Rink>
            <div className="tactic-controls">
              <label>
                FORECHECK
                <select
                  value={team.tactics.forecheck}
                  onChange={(e) =>
                    edit((g) => {
                      g.teams.find((t) => t.id === g.user)!.tactics.forecheck =
                        e.target.value as typeof team.tactics.forecheck;
                    })
                  }
                >
                  <option>1-2-2</option>
                  <option>2-1-2</option>
                  <option>1-3-1</option>
                </select>
              </label>
              {(["pace", "physical", "shooting"] as const).map((key, i) => (
                <label key={key}>
                  {
                    [
                      tr("ТЕМП", "PACE"),
                      tr("СИЛОВАЯ ИГРА", "PHYSICALITY"),
                      tr("ЧАСТОТА БРОСКОВ", "SHOT FREQUENCY"),
                    ][i]
                  }
                  <b>{team.tactics[key]}</b>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={team.tactics[key]}
                    onChange={(e) =>
                      edit((g) => {
                        g.teams.find((t) => t.id === g.user)!.tactics[key] =
                          +e.target.value;
                      })
                    }
                  />
                </label>
              ))}
              <p className="note">
                {tr(
                  "2-1-2 повышает контроль шайбы и риск контратак. 1-3-1 снижает качество моментов соперника. Высокая интенсивность увеличивает риск удалений.",
                  "2-1-2 improves possession but exposes counterattacks. 1-3-1 reduces opponent chance quality. Physical play increases penalty risk.",
                )}
              </p>
            </div>
          </Panel>
          <Panel title={tr("ПОМОЩНИК ТРЕНЕРА", "ASSISTANT COACH")}>
            <div className="about-text">
              <p>
                {team.players.some((p) => p.injury)
                  ? tr(
                      "Есть травмированные игроки. Автоподбор отдаст предпочтение здоровым хоккеистам.",
                      "There are injured players. Auto select prioritizes healthy skaters.",
                    )
                  : tr(
                      "Все игроки здоровы. Проверьте баланс первых двух звеньев: они проводят на льду 60% времени.",
                      "Everyone is healthy. Balance the top two lines: they receive 60% of ice time.",
                    )}
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
function PlayerProfile({
  player: p,
  tr,
  onClose,
}: {
  player: Player;
  tr: (a: string, b: string) => string;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label={p.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close icon-button"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={22} />
        </button>
        <div className="profile-top">
          <span className="jersey">{p.number}</span>
          <div>
            <span className="eyebrow">
              {p.pos} · {p.nation} · {p.age} {tr("ЛЕТ", "YEARS OLD")}
            </span>
            <h1>{p.name}</h1>
            <p>
              ${p.salary.toFixed(2)}M / {tr("год", "year")} · {p.years}{" "}
              {tr("лет контракта", "contract years")}
            </p>
          </div>
          <Rating value={p.ovr} />
        </div>
        <div className="profile-summary">
          {[
            ["GP", p.stats.gp],
            ["G", p.stats.g],
            ["A", p.stats.a],
            ["PTS", p.stats.g + p.stats.a],
            ["PIM", p.stats.pim],
            ["TOI", p.stats.toi.toFixed(0)],
          ].map(([l, v]) => (
            <div key={l}>
              <small>{l}</small>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div className="attribute-grid">
          {Object.entries(p.attributes).map(([k, v]) => (
            <div key={k}>
              <span>{k.replace(/([A-Z])/g, " $1")}</span>
              <i>
                <em style={{ width: `${v}%` }} />
              </i>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <p className="note">
          {tr("Потенциал", "Potential")}: {p.potential} ·{" "}
          {tr("Мораль", "Morale")}: {p.morale} · {tr("Усталость", "Fatigue")}:{" "}
          {Math.round(p.fatigue)}% ·{" "}
          {tr("Травма, игровых дней", "Injury, game days")}: {p.injury}
        </p>
        {p.history.length > 0 && (
          <>
            <h3>
              {tr("История регулярных сезонов", "Regular season history")}
            </h3>
            <table>
              <thead>
                <tr>
                  <th>SEASON</th>
                  <th>OVR</th>
                  <th>GP</th>
                  <th>G</th>
                  <th>A</th>
                  <th>PTS</th>
                </tr>
              </thead>
              <tbody>
                {p.history.map((h) => (
                  <tr key={h.year}>
                    <td>
                      {h.year}/{h.year + 1}
                    </td>
                    <td>{h.ovr}</td>
                    <td>{h.stats.gp}</td>
                    <td>{h.stats.g}</td>
                    <td>{h.stats.a}</td>
                    <td>{h.stats.g + h.stats.a}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
