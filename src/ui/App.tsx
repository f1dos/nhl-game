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
  Search,
  Building2,
  Newspaper,
  Target,
  X,
} from "lucide-react";
import { useGame } from "../store";
import {
  newGame,
  autoLines,
  teamOverall,
  applyOfficialIdentitySnapshot,
  applyOfficialRatingsSnapshot,
  applyOfficialContractSnapshot,
  applyOfficialInjurySnapshot,
  applyMinorLeagueSnapshot,
} from "../engine/database";
import {
  externalContactEligibility,
  playerConcerns,
} from "../engine/conversations";
import { nextSeason, standings, dateForRound } from "../engine/season";
import { listGames, exportGame, validateSave, saveGame } from "../engine/saves";
import type { Game, Team, Player } from "../engine/types";
import { Crest, Panel, Rating, PlayerTable, Rink } from "./components";
import MatchdayHub from "./MatchdayHub";
import TradeCenter from "./TradeCenter";
import ContractCenter from "./ContractCenter";
import { TrainingCenter } from "./ManagerWorkspace";
import { lineChemistry, tacticalAssessment } from "../engine/tactics";
import { ensureDraft } from "../engine/draft";
import DraftCenter from "./DraftCenter";
import FarmCenter from "./FarmCenter";
import { sendToFarm } from "../engine/roster";
import LeagueCenter from "./LeagueCenter";
import InjuryCenter from "./InjuryCenter";
import PlayerConversation from "./PlayerConversation";
import ClubCenter from "./ClubCenter";
import PressCenter from "./PressCenter";
import {
  effectiveOverall,
  ensureFranchiseWorld,
} from "../engine/franchiseWorld";
import {
  DailyCalendar,
  DailyHeadquarters,
  DecisionInbox,
  StrategyCenter,
} from "./ManagementRevolution";
import {
  continueGame,
  advanceDay,
  ensureManagementState,
  gameDate,
  isUserMatchday,
  type ContinueMode,
} from "../engine/management";
const nav = [
  {
    key: "overview",
    ru: "Обзор клуба",
    en: "Club overview",
    Icon: LayoutDashboard,
    groupRu: "РАБОЧИЙ СТОЛ",
    groupEn: "WORKSPACE",
  },
  {
    key: "inbox",
    ru: "Входящие",
    en: "Inbox",
    Icon: Mail,
    groupRu: "РАБОЧИЙ СТОЛ",
    groupEn: "WORKSPACE",
  },
  {
    key: "clubs",
    ru: "Клубы NHL",
    en: "NHL clubs",
    Icon: Building2,
    groupRu: "РАБОЧИЙ СТОЛ",
    groupEn: "WORKSPACE",
  },
  {
    key: "press",
    ru: "Пресс-центр",
    en: "Press room",
    Icon: Newspaper,
    groupRu: "РАБОЧИЙ СТОЛ",
    groupEn: "WORKSPACE",
  },
  {
    key: "roster",
    ru: "Состав",
    en: "Roster",
    Icon: Users,
    groupRu: "КОМАНДА",
    groupEn: "TEAM",
  },
  {
    key: "tactics",
    ru: "Тактика и звенья",
    en: "Tactics & lines",
    Icon: Workflow,
    groupRu: "КОМАНДА",
    groupEn: "TEAM",
  },
  {
    key: "development",
    ru: "Развитие",
    en: "Development",
    Icon: Activity,
    groupRu: "КОМАНДА",
    groupEn: "TEAM",
  },
  {
    key: "leagues",
    ru: "Юниоры и лиги",
    en: "Junior & European leagues",
    Icon: Search,
    groupRu: "СКАУТИНГ",
    groupEn: "SCOUTING",
  },
  {
    key: "injuries",
    ru: "Лазарет",
    en: "Injury reserve",
    Icon: Activity,
    groupRu: "КОМАНДА",
    groupEn: "TEAM",
  },
  {
    key: "strategy",
    ru: "Стратегия клуба",
    en: "Franchise strategy",
    Icon: Target,
    groupRu: "УПРАВЛЕНИЕ",
    groupEn: "MANAGEMENT",
  },
  {
    key: "contracts",
    ru: "Контракты и рынок",
    en: "Contracts & market",
    Icon: Wallet,
    groupRu: "УПРАВЛЕНИЕ",
    groupEn: "MANAGEMENT",
  },
  {
    key: "trades",
    ru: "Обмены",
    en: "Trade Center",
    Icon: Users,
    groupRu: "УПРАВЛЕНИЕ",
    groupEn: "MANAGEMENT",
  },
  {
    key: "draft",
    ru: "Скаутинг и драфт",
    en: "Scouting & draft",
    Icon: Search,
    groupRu: "УПРАВЛЕНИЕ",
    groupEn: "MANAGEMENT",
  },
  {
    key: "finances",
    ru: "Финансы",
    en: "Finances",
    Icon: BarChart3,
    groupRu: "УПРАВЛЕНИЕ",
    groupEn: "MANAGEMENT",
  },
  {
    key: "schedule",
    ru: "Календарь",
    en: "Schedule",
    Icon: CalendarDays,
    groupRu: "СОРЕВНОВАНИЯ",
    groupEn: "COMPETITION",
  },
  {
    key: "match",
    ru: "Матч-центр",
    en: "Match center",
    Icon: Activity,
    groupRu: "СОРЕВНОВАНИЯ",
    groupEn: "COMPETITION",
  },
  {
    key: "league",
    ru: "Таблица лиги",
    en: "League table",
    Icon: Trophy,
    groupRu: "СОРЕВНОВАНИЯ",
    groupEn: "COMPETITION",
  },
  {
    key: "stats",
    ru: "Статистика",
    en: "Statistics",
    Icon: BarChart3,
    groupRu: "СОРЕВНОВАНИЯ",
    groupEn: "COMPETITION",
  },
  {
    key: "history",
    ru: "История карьеры",
    en: "Career history",
    Icon: History,
    groupRu: "СОРЕВНОВАНИЯ",
    groupEn: "COMPETITION",
  },
  {
    key: "settings",
    ru: "Сохранения",
    en: "Save manager",
    Icon: Settings,
    groupRu: "СИСТЕМА",
    groupEn: "SYSTEM",
  },
] as const;
export default function App() {
  const { game: g, edit, setGame, error, clearError } = useGame();
  const [page, setPage] = useState("overview"),
    [creating, setCreating] = useState(false),
    [selected, setSelected] = useState("TOR"),
    [search, setSearch] = useState(""),
    [profile, setProfile] = useState<Player | null>(null),
    [conversation, setConversation] = useState<Player | null>(null),
    [saved, setSaved] = useState<Game[]>([]),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all"),
    [seed, setSeed] = useState(260027),
    [language, setLanguage] = useState<"ru" | "en">("ru"),
    [continueMode, setContinueMode] = useState<ContinueMode>("day"),
    [standingsOpen, setStandingsOpen] = useState(false),
    [selectedClub, setSelectedClub] = useState<string>();
  const [database] = useState(() => newGame());
  const ru = (g?.language || language) === "ru";
  const tr = (a: string, b: string) => (ru ? a : b);
  useEffect(() => {
    listGames()
      .then((xs) => {
        setSaved(xs);
        const last = xs.find(
          (x) => x.id === (localStorage.getItem("nhlm27-last") ?? localStorage.getItem("nhlm26-last")),
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
    if (g?.managerEmployment?.status === "fired") {
      setPage("strategy");
      setNotice(
        tr(
          "Совет директоров расторг контракт: эта карьера завершена",
          "The board terminated your contract: this career is over",
        ),
      );
      return;
    }
    if (g && g.phase === "regular" && g.strategySeason !== g.year) {
      setPage("strategy");
      setNotice(
        tr(
          "Сначала утвердите стратегию франшизы на сезон",
          "Choose the franchise strategy for this season first",
        ),
      );
      return;
    }
    if (g && isUserMatchday(g)) {
      setPage("match");
      return;
    }
    let reachedMatchday = false;
    edit((game) => {
      continueGame(game, continueMode);
      reachedMatchday = isUserMatchday(game);
    });
    if (reachedMatchday) setPage("match");
    else
      setNotice(
        tr(
          "Время продвинуто до следующей точки календаря",
          "Time advanced to the next calendar checkpoint",
        ),
      );
  };
  async function finish() {
    if (!g) return;
    if (g.strategySeason !== g.year) {
      go("strategy");
      setNotice(
        tr(
          "Сначала утвердите стратегию франшизы на сезон",
          "Choose the franchise strategy for this season first",
        ),
      );
      return;
    }
    setBusy(true);
    const copy = structuredClone(g);
    try {
      while (String(copy.phase) !== "offseason") {
        for (let i = 0; i < 4 && String(copy.phase) !== "offseason"; i++)
          continueGame(copy, "week");
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
        <h2>NHL MANAGER 27</h2>
      </div>
    );
  if (!g || creating) {
    const team = database.teams.find((t) => t.id === selected)!;
    return (
      <div className="new-career">
        <div className="start-top">
          <Brand />
          <select
            aria-label="Language"
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
                <b>#{team.strengthRank ?? "—"}</b>
                <small>{tr("СИЛА В ЛИГЕ", "LEAGUE STRENGTH")}</small>
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
                ensureDraft(career);
                ensureManagementState(career);
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
                "Составы и статистика: NHL API. Контракты: публичный снимок PuckPedia 2026/27 с явной пометкой несовпавших записей.",
                "Rosters and statistics: NHL API. Contracts: public PuckPedia 2026/27 snapshot with unmatched records clearly marked.",
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
  ensureManagementState(g);
  ensureFranchiseWorld(g);
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
  const title = nav.find((n) => n.key === page)!;
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
                  <button
                    className="team-link"
                    onClick={() => {
                      setSelectedClub(t.id);
                      go("clubs");
                    }}
                  >
                    <strong>{compact ? t.id : `${t.city} ${t.name}`}</strong>
                  </button>
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
  if (page === "development") content = <TrainingCenter game={g} edit={edit} />;
  else if (page === "leagues")
    content = <LeagueCenter game={g} onPlayer={setProfile} />;
  else if (page === "injuries")
    content = <InjuryCenter game={g} onPlayer={setProfile} />;
  else if (page === "contracts")
    content = <ContractCenter game={g} edit={edit} />;
  else if (page === "trades") content = <TradeCenter game={g} edit={edit} />;
  else if (page === "clubs")
    content = (
      <ClubCenter
        game={g}
        initialClub={selectedClub}
        onPlayer={setProfile}
        onTrade={() => go("trades")}
      />
    );
  else if (page === "press") content = <PressCenter game={g} edit={edit} />;
  else if (page === "draft")
    content = <DraftCenter game={g} edit={edit} tr={tr} />;
  else if (page === "overview")
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
        <DailyHeadquarters game={g} edit={edit} go={go} onPlayer={setProfile} />
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
          sub={`${team.city} ${team.name} · NHL ${team.players.length} + AHL ${(team.farm ?? []).length}`}
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
          title={tr("ОСНОВНОЙ СОСТАВ NHL", "NHL FIRST TEAM")}
          extra={<span className="tag">NHL · {team.players.length}</span>}
        >
          <PlayerTable
            players={roster}
            onSelect={setProfile}
            lang={g.language}
            onAssign={(id) => edit((world) => sendToFarm(world, id))}
          />
        </Panel>
        <FarmCenter game={g} edit={edit} onPlayer={setProfile} />
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
      <MatchdayHub game={g} edit={edit} onExit={() => go("overview")} />
    );
  else if (page === "schedule") content = <DailyCalendar game={g} />;
  else if (page === "strategy")
    content = <StrategyCenter game={g} edit={edit} />;
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
        {g.teams.some((club) => club.strengthRating) && (
          <Panel
            title={tr(
              g.year === 2026
                ? "РЕЙТИНГ СИЛЫ · NHL 2026/27"
                : `РЕЙТИНГ СИЛЫ · ${g.year}/${String(g.year + 1).slice(2)}`,
              g.year === 2026
                ? "POWER RANKING · NHL 2026/27"
                : `POWER RANKING · ${g.year}/${String(g.year + 1).slice(2)}`,
            )}
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{tr("КОМАНДА", "TEAM")}</th>
                    <th>OVR</th>
                    {g.year === 2026 && (
                      <>
                        <th>{tr("РЕАЛЬНЫЙ P%", "REAL PCT")}</th>
                        <th>{tr("РАЗНИЦА", "DIFF")}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {[...g.teams]
                    .sort(
                      (a, b) => (a.strengthRank ?? 99) - (b.strengthRank ?? 99),
                    )
                    .map((club) => (
                      <tr
                        key={club.id}
                        className={club.id === g.user ? "my-team" : ""}
                      >
                        <td className="muted">{club.strengthRank}</td>
                        <td>
                          <div className="team-cell">
                            <Crest team={club} size={28} />
                            <strong>
                              {club.city} {club.name}
                            </strong>
                          </div>
                        </td>
                        <td>
                          <Rating value={teamOverall(club)} />
                        </td>
                        {g.year === 2026 && (
                          <>
                            <td>
                              {club.realWorldForm
                                ? `${(club.realWorldForm.pointPct * 100).toFixed(1)}%`
                                : "—"}
                            </td>
                            <td>
                              {club.realWorldForm
                                ? `${club.realWorldForm.goalDifferential >= 0 ? "+" : ""}${club.realWorldForm.goalDifferential}`
                                : "—"}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="note">
              {g.year === 2026
                ? tr(
                    "Стартовый рейтинг основан на снимке официальной статистики NHL. Таблица карьеры ниже рассчитывается только игровым движком.",
                    "The starting rating uses an official NHL statistics snapshot. Career standings below are generated only by the game engine.",
                  )
                : tr(
                    "После первого сезона рейтинг силы динамически учитывает ядро состава и результаты предыдущего года.",
                    "After season one, power ratings dynamically combine roster core strength and the previous year's results.",
                  )}
            </p>
          </Panel>
        )}
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
    const ratingLeaders = g.teams
      .flatMap((club) =>
        [...club.players, ...(club.farm ?? [])].map((player) => ({
          player,
          club,
        })),
      )
      .sort(
        (a, b) =>
          b.player.ovr - a.player.ovr ||
          (a.player.ratingRank ?? 999) - (b.player.ratingRank ?? 999),
      );
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
        <Panel
          title={tr("РЕЙТИНГ ИГРОКОВ · TOP 50", "PLAYER RATINGS · TOP 50")}
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{tr("ИГРОК", "PLAYER")}</th>
                  <th>{tr("КЛУБ", "CLUB")}</th>
                  <th>POS</th>
                  <th>{tr("ВОЗР.", "AGE")}</th>
                  <th>OVR</th>
                  <th>POT</th>
                </tr>
              </thead>
              <tbody>
                {ratingLeaders.slice(0, 50).map(({ player, club }, index) => (
                  <tr key={player.id} onClick={() => setProfile(player)}>
                    <td className="muted">{index + 1}</td>
                    <td>
                      <strong>{player.name}</strong>
                      <small>
                        {player.ratingSource === "nhl-stats-model"
                          ? "NHL STATS MODEL"
                          : "GAME GENERATED"}
                      </small>
                    </td>
                    <td>
                      <div className="team-cell">
                        <Crest team={club} size={25} />
                        <b>{club.id}</b>
                      </div>
                    </td>
                    <td>
                      <span className="position">{player.pos}</span>
                    </td>
                    <td>{player.age}</td>
                    <td>
                      <Rating value={player.ovr} />
                    </td>
                    <td>{player.potential}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
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
            "Проверенные AAV и оставшиеся обязательства · миллионы долларов США",
            "Verified AAV and remaining commitments · USD millions",
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
                <th>{tr("ОСТАТОК", "REMAINING")}</th>
                <th>{tr("ИСТЕКАЕТ", "EXPIRY")}</th>
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
                    <td>
                      $
                      {(p.contractRemainingValue ?? p.salary * p.years).toFixed(
                        2,
                      )}
                      M
                    </td>
                    <td>
                      {p.contractExpiryYear ?? g.year + p.years}{" "}
                      {p.contractStatus ?? ""}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Panel>
        <p className="note">
          {tr(
            "Продлевайте соглашения и подписывайте свободных агентов в разделе «Контракты и рынок». Удержание зарплаты и полная CBA-модель пока не реализованы.",
            "Renew deals and sign free agents in Contracts & market. Salary retention and a full CBA model are not implemented yet.",
          )}
        </p>
      </>
    );
  else if (page === "inbox")
    content = <DecisionInbox game={g} edit={edit} go={go} />;
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
              aria-label="Language"
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
            {(!g.dataSource || g.dataSource.kind === "fictional") && (
              <button
                onClick={() => {
                  edit(applyOfficialIdentitySnapshot);
                  setNotice(
                    tr(
                      "Личности и эмблемы обновлены",
                      "Identities and crests updated",
                    ),
                  );
                }}
              >
                {tr(
                  "Подключить составы NHL 2026/27",
                  "Apply NHL 2026/27 identities",
                )}
              </button>
            )}
            {g.dataSource?.kind === "official-identities-demo-ratings" &&
              g.year === 2026 && (
                <button
                  onClick={() => {
                    edit(applyOfficialRatingsSnapshot);
                    setNotice(
                      tr(
                        "Рейтинги игроков и команд обновлены",
                        "Player and team ratings updated",
                      ),
                    );
                  }}
                >
                  {tr(
                    "Обновить реальные рейтинги",
                    "Apply statistics-based ratings",
                  )}
                </button>
              )}
            {!g.dataSource?.contractSource && g.year === 2026 && (
              <button
                onClick={() => {
                  edit(applyOfficialContractSnapshot);
                  setNotice(
                    tr(
                      "Контракты PuckPedia обновлены",
                      "PuckPedia contracts applied",
                    ),
                  );
                }}
              >
                {tr(
                  "Подключить проверенные контракты",
                  "Apply verified contracts",
                )}
              </button>
            )}
            {!g.dataSource?.injurySource && g.year === 2026 && (
              <button
                onClick={() => {
                  edit(applyOfficialInjurySnapshot);
                  setNotice(tr("Лазарет NHL обновлён", "NHL injuries applied"));
                }}
              >
                {tr("Обновить реальный лазарет", "Apply real injury list")}
              </button>
            )}
            {!g.dataSource?.minorsSource && g.year === 2026 && (
              <button
                onClick={() => {
                  edit(applyMinorLeagueSnapshot);
                  setNotice(
                    tr("Составы AHL/OHL подключены", "AHL/OHL rosters applied"),
                  );
                }}
              >
                {tr("Подключить составы AHL/OHL", "Apply AHL/OHL rosters")}
              </button>
            )}
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
                href="/downloads/NHL-Manager-27.html"
                download
              >
                NHL-Manager-27.html
              </a>
              <a
                className="button"
                href="/downloads/nhl-manager-27-source.zip"
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
                "v0.5.1-dev · отдельные встречи с игроками, сезонная стратегия, задачи владельца, доверие и риск увольнения.",
                "v0.5.1-dev · dedicated player meetings, seasonal strategy, board objectives, confidence and dismissal risk.",
              )}
            </p>
            <p>
              {tr(
                "Это не официальная и не лицензированная игра NHL. Составы и статистика получены из публичных NHL API; контракты — из публичных таблиц PuckPedia. OVR является нашей производной моделью, а динамика формы и развития — игровой симуляцией.",
                "This is not an official or licensed NHL game. Rosters and statistics use public NHL APIs; contracts use public PuckPedia tables. OVR is our derived model, while form and development changes are game simulation.",
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
        <nav>
          {nav.map(
            ({ key, ru: labelRu, en: labelEn, Icon, groupRu, groupEn }, i) => (
              <div key={key}>
                {(i === 0 || nav[i - 1].groupRu !== groupRu) && (
                  <div className="nav-label">{ru ? groupRu : groupEn}</div>
                )}
                <button
                  className={page === key ? "active" : ""}
                  onClick={() => go(key)}
                >
                  <Icon size={17} />
                  <span>{ru ? labelRu : labelEn}</span>
                  {key === "inbox" && (
                    <em>
                      {g.events?.filter(
                        (event) => !event.read && !event.resolved,
                      ).length ?? g.news.length}
                    </em>
                  )}
                </button>
              </div>
            ),
          )}
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
            <span>{ru ? title.ru : title.en}</span>
          </div>
          <div className="top-actions">
            <span className="top-club-record">
              <b>
                {team.record.w}-{team.record.l}-{team.record.otl}
              </b>
              <small>
                {team.record.pts} PTS ·{" "}
                {team.record.gf - team.record.ga >= 0 ? "+" : ""}
                {team.record.gf - team.record.ga}
              </small>
            </span>
            <button
              className="standings-quick"
              onClick={() => setStandingsOpen(true)}
            >
              <Trophy size={15} />
              <span>{tr("Таблица", "Standings")}</span>
              <b>#{sorted.findIndex((club) => club.id === g.user) + 1}</b>
            </button>
            <span className="game-date">
              <CalendarDays size={15} />
              {g.phase === "regular"
                ? new Date(`${gameDate(g)}T00:00:00Z`).toLocaleDateString(
                    ru ? "ru-RU" : "en-GB",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    },
                  )
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
            {g.phase !== "offseason" && (
              <select
                className="continue-select"
                aria-label={tr("Режим продолжения", "Continue mode")}
                value={continueMode}
                onChange={(event) =>
                  setContinueMode(event.target.value as ContinueMode)
                }
              >
                <option value="day">{tr("1 день", "1 day")}</option>
                <option value="next-game">
                  {tr("До матча", "To next game")}
                </option>
                <option value="next-event">
                  {tr("До события", "To next event")}
                </option>
                <option value="week">{tr("7 дней", "7 days")}</option>
              </select>
            )}
            {g.phase === "offseason" &&
              (g.freeAgentOffers ?? []).some(
                (offer) => offer.status === "pending",
              ) && (
                <button
                  className="text-button"
                  onClick={() => edit((world) => advanceDay(world))}
                >
                  {tr("Следующий день", "Next day")} <ChevronRight size={14} />
                </button>
              )}
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                if (g.managerEmployment?.status === "fired") {
                  go("strategy");
                  setNotice(
                    tr(
                      "Вы уволены советом директоров — карьера завершена",
                      "You were dismissed by the board — career over",
                    ),
                  );
                } else if (g.phase === "offseason") {
                  if (
                    (g.freeAgentOffers ?? []).some(
                      (offer) => offer.status === "pending",
                    )
                  ) {
                    go("contracts");
                    setNotice(
                      tr(
                        "Сначала дождитесь ответа по отправленным контрактам или отзовите предложения.",
                        "Resolve pending contract offers or withdraw them before starting the next season.",
                      ),
                    );
                    return;
                  }
                  edit(nextSeason);
                  go("overview");
                } else play();
              }}
            >
              {g.phase === "offseason"
                ? tr("Новый сезон", "New season")
                : tr("Продолжить", "Continue")}
              <ChevronRight size={18} />
            </button>
          </div>
        </header>
        <div className="content">
          {content}
          <footer>
            <span>
              <i className="status-dot" />{" "}
              {g.dataSource?.kind === "official-identities-modeled-ratings"
                ? tr(
                    "NHL API · статистическая модель OVR",
                    "NHL API · statistics-based OVR",
                  )
                : g.dataSource?.kind === "official-identities-demo-ratings"
                  ? tr(
                      "NHL API: личности · старые демо-рейтинги",
                      "NHL API identities · legacy demo ratings",
                    )
                  : tr("Вымышленная база данных", "Fictional database")}{" "}
              · v0.5.1-dev
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
      {standingsOpen && (
        <div
          className="standings-drawer-backdrop"
          onClick={() => setStandingsOpen(false)}
        >
          <aside
            className="standings-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">NHL REGULAR SEASON</span>
                <h2>{tr("Турнирная таблица", "League standings")}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close standings"
                onClick={() => setStandingsOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            {teamTable(sorted, false)}
            <button
              className="primary"
              onClick={() => {
                setStandingsOpen(false);
                go("league");
              }}
            >
              {tr("Открыть полный центр лиги", "Open league center")}
            </button>
          </aside>
        </div>
      )}
      {profile && (
        <PlayerProfile
          player={
            g.teams
              .flatMap((t) => [
                ...t.players,
                ...(t.farm ?? []),
                ...(t.prospects ?? []),
              ])
              .find((p) => p.id === profile.id) || profile
          }
          game={g}
          tr={tr}
          onClose={() => setProfile(null)}
          onConversation={() => {
            setConversation(profile);
            setProfile(null);
          }}
        />
      )}
      {conversation && (
        <PlayerConversation
          player={
            g.teams
              .flatMap((team) => [
                ...team.players,
                ...(team.farm ?? []),
                ...(team.prospects ?? []),
              ])
              .find((player) => player.id === conversation.id) ?? conversation
          }
          game={g}
          edit={edit}
          onClose={() => setConversation(null)}
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
      <span className="brand-logo brand-logo-mark" aria-label="Hockey mark" role="img">
        <Snowflake size={26} strokeWidth={2.4} />
      </span>
      <div className="brand-copy">
        <span>
          NHL MANAGER <b>27</b>
        </span>
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
  const assessment = tacticalAssessment(team.tactics);
  const chemistry = (ids: string[]) =>
    lineChemistry(
      ids.map((id) => team.players.find((p) => p.id === id)!).filter(Boolean),
    );
  function replace(old: string, id: string) {
    edit((g) => {
      const t = g.teams.find((t) => t.id === g.user)!;
      const p = t.players.find((p) => p.id === id),
        q = t.players.find((p) => p.id === old);
      const group = (player: Player) =>
        player.pos === "D" ? "D" : player.pos === "G" ? "G" : "F";
      if (!p || !q || group(p) !== group(q)) return;
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
    const group = p.pos === "D" ? "D" : p.pos === "G" ? "G" : "F";
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
          <Rating value={effectiveOverall(p)} />
        </div>
        <select
          aria-label={`${group} lineup`}
          value={p.id}
          onChange={(e) => replace(id, e.target.value)}
        >
          {team.players
            .filter((x) =>
              group === "F" ? x.pos !== "D" && x.pos !== "G" : x.pos === group,
            )
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
          "Перетаскивайте игроков одной игровой группы или используйте списки.",
          "Drag players within the same unit group or use the selectors.",
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
                  <b
                    className={`chemistry ${chemistry(line) >= 80 ? "elite" : chemistry(line) < 65 ? "warning" : ""}`}
                  >
                    {chemistry(line)}
                  </b>
                </span>
                {line.map(slot)}
              </div>
            ))}
          </Panel>
          <Panel title={tr("ПАРЫ ЗАЩИТНИКОВ", "DEFENSIVE PAIRS")}>
            {team.defense.map((line, i) => (
              <div className="line-row defense" key={i}>
                <span className="line-index">
                  0{i + 1}
                  <b
                    className={`chemistry ${chemistry(line) >= 80 ? "elite" : chemistry(line) < 65 ? "warning" : ""}`}
                  >
                    {chemistry(line)}
                  </b>
                </span>
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
              <div className="tactic-analysis">
                {(
                  [
                    [tr("Владение", "Possession"), assessment.possession],
                    [
                      tr("Объём моментов", "Chance volume"),
                      assessment.chanceVolume,
                    ],
                    [
                      tr("Стабильность защиты", "Defensive stability"),
                      assessment.defensiveStability,
                    ],
                    [
                      tr("Риск удалений", "Penalty risk"),
                      assessment.penaltyRisk,
                    ],
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
  game,
  tr,
  onClose,
  onConversation,
}: {
  player: Player;
  game: Game;
  tr: (a: string, b: string) => string;
  onClose: () => void;
  onConversation: () => void;
}) {
  const skaterCategories: [string, string[]][] = [
    [
      tr("АТАКА", "OFFENSE"),
      [
        "shooting",
        "accuracy",
        "passing",
        "puckControl",
        "offensivePosition",
        "offPuck",
        "faceoffs",
      ],
    ],
    [
      tr("ЗАЩИТА", "DEFENSE"),
      ["defensivePosition", "checking", "blocking", "firstPass", "penaltyKill"],
    ],
    [
      tr("КАТАНИЕ И ФИЗИКА", "SKATING & PHYSICAL"),
      ["speed", "acceleration", "skating", "strength", "stamina", "durability"],
    ],
    [
      tr("МЕНТАЛЬНЫЕ", "MENTAL"),
      [
        "composure",
        "discipline",
        "leadership",
        "decisions",
        "consistency",
        "teamwork",
        "resilience",
      ],
    ],
  ];
  const goalieCategories: [string, string[]][] = [
    [
      tr("МЕНТАЛЬНЫЕ", "MENTAL"),
      ["composure", "discipline", "decisions", "consistency", "resilience"],
    ],
    [
      tr("ВРАТАРСКИЕ", "GOALTENDING"),
      [
        "reflexes",
        "goaliePosition",
        "glove",
        "reboundControl",
        "stickhandling",
      ],
    ],
  ];
  const visibleCategories = p.pos === "G" ? goalieCategories : skaterCategories;
  const career =
    p.history.reduce((n, h) => n + h.stats.g + h.stats.a, 0) +
    p.stats.g +
    p.stats.a;
  const previous = p.history.at(-1)?.ovr ?? p.ovr;
  const owner = game.teams.find((team) =>
    [...team.players, ...(team.farm ?? [])].some(
      (player) => player.id === p.id,
    ),
  );
  const external = owner && owner.id !== game.user;
  const contact = externalContactEligibility(game, p.id);
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
        <div className="profile-hero">
          <div className={`profile-number ${p.headshot ? "has-photo" : ""}`}>
            {p.headshot ? (
              <img src={p.headshot} alt={p.name} />
            ) : (
              <>
                <span>{p.number}</span>
                <small>{p.pos}</small>
              </>
            )}
          </div>
          <div>
            <span className="eyebrow">
              {p.pos} · {p.nation} · {p.age} {tr("ЛЕТ", "YEARS OLD")}
            </span>
            <h1>{p.name}</h1>
            <p>
              {p.archetype || tr("Универсальный игрок", "Utility player")} ·{" "}
              {p.injury
                ? tr(
                    `Лазарет: ${p.injuryReason ?? "травма"} · ${p.injuryReturnDate ?? `${p.injury} шагов`}`,
                    `Injury reserve: ${p.injuryReason ?? "injury"} · ${p.injuryReturnDate ?? `${p.injury} steps`}`,
                  )
                : tr("Готов к игре", "Available")}
            </p>
          </div>
          <div className="profile-ratings">
            <div>
              <b>{effectiveOverall(p)}</b>
              <small>OVR</small>
            </div>
            <div>
              <b>{p.potential}</b>
              <small>POT</small>
            </div>
            <span className={p.ovr >= previous ? "up" : "down"}>
              {p.ovr >= previous ? "↗" : "↘"} {Math.abs(p.ovr - previous)}
            </span>
            {p.ratingSource === "nhl-stats-model" && p.ratingRank && (
              <span className="rating-provenance">
                NHL MODEL · #{p.ratingRank}{" "}
                {p.pos === "G" ? "G" : p.pos === "D" ? "D" : "F"}
              </span>
            )}
          </div>
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
        <div className="profile-body">
          <div className="attribute-sections">
            {visibleCategories.map(([title, keys]) => (
              <section key={title}>
                <h3>{title}</h3>
                <div className="attribute-grid">
                  {keys.map((k) => {
                    const v = p.attributes[k];
                    return (
                      <div key={k}>
                        <span>{k.replace(/([A-Z])/g, " $1")}</span>
                        <i>
                          <em
                            className={
                              v >= 80 ? "strong" : v < 65 ? "weak" : ""
                            }
                            style={{ width: `${v}%` }}
                          />
                        </i>
                        <b>{v}</b>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <aside className="profile-facts">
            <h3>{tr("СТАТУС И КОНТРАКТ", "STATUS & CONTRACT")}</h3>
            <dl>
              <div>
                <dt>{tr("Зарплата", "Cap hit")}</dt>
                <dd>${p.salary.toFixed(2)}M</dd>
              </div>
              <div>
                <dt>{tr("Срок", "Term")}</dt>
                <dd>
                  {p.years} {tr("лет", "years")}
                </dd>
              </div>
              <div>
                <dt>{tr("Остаток", "Remaining value")}</dt>
                <dd>
                  ${(p.contractRemainingValue ?? p.salary * p.years).toFixed(2)}
                  M
                </dd>
              </div>
              <div>
                <dt>{tr("Истекает", "Expiry")}</dt>
                <dd>
                  {p.contractExpiryYear ?? game.year + p.years}{" "}
                  {p.contractStatus ?? ""}
                </dd>
              </div>
              <div>
                <dt>{tr("Источник", "Source")}</dt>
                <dd>
                  {p.contractSource === "puckpedia"
                    ? "PuckPedia"
                    : tr("Игровой", "Game")}
                </dd>
              </div>
              <div>
                <dt>{tr("Мораль", "Morale")}</dt>
                <dd>{p.morale}%</dd>
              </div>
              <div>
                <dt>{tr("Форма", "Form")}</dt>
                <dd>
                  {(p.performanceForm ?? 0) >= 0 ? "+" : ""}
                  {(p.performanceForm ?? 0).toFixed(1)} · OVR{" "}
                  {(p.formAdjustment ?? 0) >= 0 ? "+" : ""}
                  {p.formAdjustment ?? 0}
                </dd>
              </div>
              <div>
                <dt>{tr("Готовность", "Condition")}</dt>
                <dd>{Math.round(100 - p.fatigue)}%</dd>
              </div>
              {p.injury > 0 && (
                <>
                  <div>
                    <dt>{tr("Статус травмы", "Injury status")}</dt>
                    <dd>
                      {p.injuryStatus ?? "OUT"} ·{" "}
                      {p.injuryTimeline ?? `${p.injury} steps`}
                    </dd>
                  </div>
                  <div>
                    <dt>{tr("Ожидаемое возвращение", "Expected return")}</dt>
                    <dd>
                      {p.injuryReturnDate ??
                        tr("по игровой симуляции", "simulation estimate")}
                    </dd>
                  </div>
                </>
              )}
              <div>
                <dt>{tr("Очки за карьеру", "Career points")}</dt>
                <dd>{career}</dd>
              </div>
            </dl>
            <h3>{tr("ОЦЕНКА РОЛИ", "ROLE FIT")}</h3>
            <p>{p.archetype || "—"}</p>
            <progress max="100" value={p.ovr} />
            <small>
              {tr(
                "Рейтинг рассчитан с весами позиции и архетипа.",
                "Rating uses position and archetype weights.",
              )}
            </small>
          </aside>
        </div>
        <section className="conversation-panel">
          <div>
            <span className="eyebrow">
              {tr("РАЗГОВОР С ИГРОКОМ", "PLAYER CONVERSATION")}
            </span>
            <h3>{tr("Обсудить ситуацию", "Discuss the situation")}</h3>
            <p>
              {tr("Темы", "Concerns")}: {playerConcerns(p).join(", ")} ·{" "}
              {tr("отношения", "relationship")} {p.relationship ?? 50}% ·{" "}
              {tr("мотивация", "motivation")} {p.motivation ?? 50}%
            </p>
          </div>
          <button
            onClick={onConversation}
            disabled={external && !contact.allowed}
          >
            {external && !contact.allowed
              ? tr("Контакт запрещён клубом", "Contact blocked by club")
              : external
                ? tr("Связаться через агента", "Contact through agent")
                : p.lastConversationRound === game.round
                  ? tr("Открыть историю разговора", "Open conversation history")
                  : tr("Начать личную встречу", "Start private meeting")}
            <ArrowUpRight size={16} />
          </button>
          {external && <small>{contact.reason}</small>}
          {p.conversationHistory?.[0] && (
            <blockquote>{p.conversationHistory[0].response}</blockquote>
          )}
        </section>
        {(p.developmentLog?.length ?? 0) > 0 && (
          <section>
            <h3>{tr("Почему изменился рейтинг", "Why the rating changed")}</h3>
            {p.developmentLog!.slice(0, 4).map((entry) => (
              <p key={`${entry.year}-${entry.ovrAfter}`}>
                {entry.year}: {entry.ovrBefore} → {entry.ovrAfter} (
                {entry.delta >= 0 ? "+" : ""}
                {entry.delta}) · {entry.reason}
              </p>
            ))}
          </section>
        )}
        {p.history.length > 0 && (
          <>
            <h3>
              {tr("История регулярных сезонов", "Regular season history")}
            </h3>
            <div className="development-chart">
              {p.history.map((h) => (
                <div key={h.year}>
                  <i style={{ height: `${Math.max(8, h.ovr - 40) * 2}px` }} />
                  <span>{h.ovr}</span>
                  <small>{h.year}</small>
                </div>
              ))}
              <div>
                <i
                  className="current"
                  style={{ height: `${Math.max(8, p.ovr - 40) * 2}px` }}
                />
                <span>{p.ovr}</span>
                <small>{tr("Сейчас", "Now")}</small>
              </div>
            </div>
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
