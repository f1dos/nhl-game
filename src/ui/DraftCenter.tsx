import { useMemo, useState } from "react";
import {
  CalendarClock,
  Eye,
  EyeOff,
  HeartHandshake,
  MessageCircle,
  Radar,
  Ruler,
  ShieldX,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import {
  advanceDraftToUser,
  ensureDraft,
  INTERVIEW_TOPIC_LABEL,
  INTERVIEW_TOPICS,
  interviewProspect,
  makeUserDraftPick,
  prospectInterest,
  scoutProspect,
  SCOUTING_REGIONS,
  setScoutingRegion,
  toggleShortlist,
  traitLabel,
  type InterviewTopic,
} from "../engine/draft";
import type { DraftProspect, Game, Player, ScoutingReport } from "../engine/types";
import { Panel } from "./components";
import { ClubLink, PlayerLink } from "./links";
import { PotentialCell, PotentialLegend, PotentialView } from "./Potential";
import { reportPotential } from "../engine/potential";
import { flagOf, NATION_LABEL } from "../engine/names";
import { staffRating } from "../engine/staff";
import { ATTRIBUTE_NAMES } from "./PlayerCard";
import Select from "./Select";

type Translate = (ru: string, en: string) => string;

const REGION_META: Record<string, { ru: string; en: string; flags: string }> = {
  "North America": { ru: "Северная Америка", en: "North America", flags: "🇨🇦 🇺🇸" },
  Nordic: { ru: "Скандинавия", en: "Nordic", flags: "🇸🇪 🇫🇮 🇳🇴 🇩🇰" },
  "Central Europe": { ru: "Центральная Европа", en: "Central Europe", flags: "🇨🇿 🇸🇰 🇨🇭 🇩🇪" },
  Russia: { ru: "Россия и СНГ", en: "Russia & CIS", flags: "🇷🇺 🇧🇾 🇰🇿" },
};
const regionLabel = (region: string, tr: Translate) =>
  REGION_META[region] ? tr(REGION_META[region].ru, REGION_META[region].en) : region;

const SKATER_KEYS = ["shooting", "accuracy", "passing", "puckControl", "speed", "offensivePosition", "defensivePosition", "checking", "strength", "decisions", "skating", "stamina"];
const GOALIE_KEYS = ["reflexes", "goaliePosition", "glove", "reboundControl", "composure", "stamina"];

function attributeName(key: string, tr: Translate) {
  const pair = ATTRIBUTE_NAMES[key];
  return pair ? tr(pair[0], pair[1]) : key;
}

function InterestMeter({ game, prospect, tr }: { game: Game; prospect: DraftProspect; tr: Translate }) {
  const { interest, refused, dream, known } = prospectInterest(game, prospect);
  // Before a meeting the staff only has a rough read; refusals stay hidden.
  if (!known && refused)
    return <span className="interest-pill unknown" title={tr("Нужна встреча", "Meet him to find out")}>?</span>;
  if (refused)
    return (
      <span className="interest-pill refused" title={tr("Не будет играть за ваш клуб", "Won't play for your club")}>
        <ShieldX size={13} /> {tr("Отказ", "No")}
      </span>
    );
  const level = interest >= 75 ? "high" : interest >= 45 ? "mid" : "low";
  return (
    <span className={`interest-pill ${level} ${known ? "" : "rough"}`} title={known ? tr("После встречи", "After the meeting") : tr("Оценка скаутов", "Scouts' read")}>
      {dream ? <Sparkles size={12} /> : <HeartHandshake size={12} />}
      {known ? interest : `~${Math.round(interest / 10) * 10}`}
    </span>
  );
}

export default function DraftCenter({
  game,
  edit,
  tr,
  onStaff,
}: {
  game: Game;
  edit: (fn: (game: Game) => void) => void;
  tr: Translate;
  onStaff?: () => void;
}) {
  const [position, setPosition] = useState("ALL");
  const [region, setRegion] = useState("ALL");
  const [query, setQuery] = useState("");
  const [board, setBoard] = useState<"class" | "shortlist" | "interviews" | "pipeline">("class");
  const [open, setOpen] = useState<string>();
  const [error, setError] = useState("");
  const draft = game.draft;
  const team = game.teams.find((t) => t.id === game.user)!;
  const run = (fn: (g: Game) => void) => {
    setError("");
    try {
      edit(fn);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const players = useMemo(() => {
    if (!draft) return [];
    return draft.prospects
      .filter((prospect) => !prospect.draftedBy)
      .filter((prospect) => position === "ALL" || prospect.player.pos === position)
      .filter((prospect) => region === "ALL" || prospect.region === region)
      .filter((prospect) => board !== "shortlist" || draft.shortlist.includes(prospect.player.id))
      .filter((prospect) => board !== "interviews" || !!draft.interviews?.[prospect.player.id])
      .filter((prospect) =>
        `${prospect.player.name} ${prospect.club ?? ""} ${prospect.league ?? ""}`.toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) => {
        const ra = draft.reports[a.player.id];
        const rb = draft.reports[b.player.id];
        return rb.estimatedPotential - ra.estimatedPotential || rb.estimatedOvr - ra.estimatedOvr || a.player.name.localeCompare(b.player.name);
      });
  }, [draft, position, region, query, board]);

  if (!draft)
    return (
      <div className="draft-empty">
        <span>2027</span>
        <h1>{tr("Создать драфт-класс", "Create draft class")}</h1>
        <p>{tr("В этом сохранении ещё нет драфт-класса. Создайте его, чтобы продолжить.", "This save has no draft class yet. Create one to continue.")}</p>
        <button className="primary" onClick={() => edit(ensureDraft)}>
          {tr("Обновить карьеру", "Upgrade career")}
        </button>
      </div>
    );

  const current = draft.picks[draft.currentPick];
  const myPicks = draft.picks.filter((pick) => pick.team === game.user);
  const selected = myPicks.filter((pick) => pick.prospectId);
  const pipeline = team.prospects ?? [];
  const today = game.calendar?.date ?? `${game.year}-09-15`;
  const draftDay = `${draft.year}-06-26`;
  const daysLeft = Math.max(0, Math.round((Date.parse(draftDay) - Date.parse(today)) / 86_400_000));
  const scout = team.staff?.["head-scout"];
  const realCount = draft.prospects.filter((p) => p.source === "real").length;
  const openProspect = open ? draft.prospects.find((p) => p.player.id === open) : undefined;

  return (
    <div className="draft-center-v2">
      <div className="draft-hero">
        <div>
          <span className="eyebrow">NHL ENTRY DRAFT · {draft.year}</span>
          <h1>{tr("Центр драфта и скаутинга", "Draft & scouting center")}</h1>
          <p>
            {draft.status === "scouting"
              ? tr(
                  `Реальные юниоры OHL, WHL, USHL, SHL и Liiga плюс проспекты из Европы и России. Изучайте, следите, встречайтесь с игроками до драфта.`,
                  `Real OHL, WHL, USHL, SHL and Liiga juniors plus prospects from Europe and Russia. Scout, follow and meet them before draft night.`,
                )
              : draft.status === "draft"
                ? tr("Драфт идёт в реальном порядке. ИИ-клубы выбирают по ценности и потребностям.", "The draft follows the live order. AI clubs pick for value and need.")
                : tr("Драфт завершён. Выбранные игроки добавлены в системы клубов.", "The draft is complete. Selected players joined club pipelines.")}
          </p>
          <div className="draft-hero-tags">
            <span>
              <CalendarClock size={14} /> {draft.status === "scouting" ? tr(`${daysLeft} дн. до драфта`, `${daysLeft} days to the draft`) : draftDay}
            </span>
            <span>
              <Radar size={14} /> {realCount} {tr("реальных игроков", "real players")} · {draft.prospects.length - realCount} {tr("сгенерированных", "generated")}
            </span>
          </div>
        </div>
        <div className={`draft-status ${draft.status}`}>
          <small>{tr("СТАТУС", "STATUS")}</small>
          <b>{draft.status === "scouting" ? tr("СКАУТИНГ", "SCOUTING") : draft.status === "draft" ? tr("ДРАФТ ИДЁТ", "DRAFT LIVE") : tr("ЗАВЕРШЁН", "COMPLETE")}</b>
          <span>{draft.status === "draft" ? `${draft.currentPick + 1} / ${draft.picks.length}` : `${draft.prospects.length} ${tr("игроков", "players")}`}</span>
        </div>
      </div>

      <div className="draft-metrics">
        <div>
          <small>{tr("РЕСУРС СКАУТОВ", "SCOUTING CAPACITY")}</small>
          <b>{draft.scoutingPoints}</b>
          <span>{tr("отчётов доступно", "reports available")}</span>
        </div>
        <div>
          <small>{tr("ВСТРЕЧИ", "INTERVIEWS")}</small>
          <b>{draft.interviewsLeft ?? 0}</b>
          <span>{tr("бесед до драфта", "meetings left")}</span>
        </div>
        <div>
          <small>{tr("СЛЕЖУ", "FOLLOWING")}</small>
          <b>{draft.shortlist.length}</b>
          <span>{tr("скауты смотрят их матчи", "scouts watch their games")}</span>
        </div>
        <button className="draft-scout-card" onClick={onStaff}>
          <small>{tr("ГЛАВНЫЙ СКАУТ", "HEAD SCOUT")}</small>
          <b>{scout ? staffRating(team, "head-scout") : "—"}</b>
          <span>{scout ? scout.name : tr("Вакансия — наймите", "Vacant — hire one")}</span>
        </button>
      </div>

      {draft.status === "scouting" && (
        <div className="region-cards">
          {SCOUTING_REGIONS.map((item) => {
            const count = draft.prospects.filter((p) => p.region === item).length;
            return (
              <button key={item} className={draft.assignment === item ? "active" : ""} onClick={() => run((g) => setScoutingRegion(g, item))}>
                <span className="region-flags">{REGION_META[item]?.flags}</span>
                <b>{regionLabel(item, tr)}</b>
                <small>
                  {count} {tr("игроков", "players")}
                  {draft.assignment === item ? ` · ${tr("задание скаутов", "scouts assigned")}` : ""}
                </small>
              </button>
            );
          })}
        </div>
      )}

      {draft.status === "draft" && current && (
        <section className="on-clock">
          <div>
            <span>{tr("СЕЙЧАС ВЫБИРАЕТ", "ON THE CLOCK")}</span>
            <b>
              <ClubLink id={current.team} crest={24} />
            </b>
            <small>
              {tr("Раунд", "Round")} {current.round} · #{current.overall}
            </small>
          </div>
          {current.team === game.user ? (
            <strong>{tr("ВАШ ВЫБОР", "YOUR PICK")}</strong>
          ) : (
            <button onClick={() => run(advanceDraftToUser)}>{tr("До моего выбора", "Sim to my pick")}</button>
          )}
        </section>
      )}

      {error && <div className="staff-error" role="alert">{error}</div>}

      <div className="draft-tabs tabs">
        {(
          [
            ["class", tr("Драфт-класс", "Draft class")],
            ["shortlist", `${tr("Слежу", "Following")} · ${draft.shortlist.length}`],
            ["interviews", `${tr("Беседы", "Interviews")} · ${Object.keys(draft.interviews ?? {}).length}`],
            ["pipeline", `${tr("Система клуба", "Club pipeline")} · ${pipeline.length}`],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className={board === key ? "active" : ""} onClick={() => setBoard(key)}>
            {label}
          </button>
        ))}
      </div>

      {board === "pipeline" ? (
        <Pipeline players={pipeline} game={game} tr={tr} />
      ) : (
        <Panel
          title={tr("РЕЙТИНГ ПЕРСПЕКТИВНЫХ ИГРОКОВ", "PROSPECT RANKING")}
          extra={
            <div className="draft-filters">
              <input value={query} placeholder={tr("Игрок, клуб или лига…", "Player, club or league…")} onChange={(event) => setQuery(event.target.value)} />
              <Select value={position} onChange={(e) => setPosition(e.target.value)} aria-label="Position">
                <option value="ALL">{tr("Все позиции", "All positions")}</option>
                {["LW", "C", "RW", "D", "G"].map((pos) => (
                  <option key={pos}>{pos}</option>
                ))}
              </Select>
              <Select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
                <option value="ALL">{tr("Все регионы", "All regions")}</option>
                {SCOUTING_REGIONS.map((item) => (
                  <option key={item} value={item}>
                    {regionLabel(item, tr)}
                  </option>
                ))}
              </Select>
            </div>
          }
        >
          <ProspectTable
            game={game}
            prospects={players}
            reports={draft.reports}
            shortlist={draft.shortlist}
            scoutingPoints={draft.scoutingPoints}
            canScout={draft.status === "scouting"}
            canPick={draft.status === "draft" && current?.team === game.user}
            tr={tr}
            onOpen={setOpen}
            onScout={(id) => run((g) => scoutProspect(g, id))}
            onShortlist={(id) => run((g) => toggleShortlist(g, id))}
            onPick={(id) => run((g) => makeUserDraftPick(g, id))}
          />
        </Panel>
      )}

      {selected.length > 0 && (
        <Panel title={tr("ВЫБОРЫ ВАШЕГО КЛУБА", "YOUR CLUB'S PICKS")}>
          <div className="draft-pick-history">
            {selected.map((pick) => {
              const prospect = draft.prospects.find((p) => p.player.id === pick.prospectId)!;
              return (
                <div key={pick.overall}>
                  <b>#{pick.overall}</b>
                  <span>
                    <PlayerLink player={prospect.player} />
                  </span>
                  <small>
                    {flagOf(prospect.player.nation)} {prospect.player.pos} · {prospect.player.nation} · {tr("раунд", "round")} {pick.round}
                  </small>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {openProspect && (
        <ProspectProfile
          game={game}
          prospect={openProspect}
          report={draft.reports[openProspect.player.id]}
          tr={tr}
          following={draft.shortlist.includes(openProspect.player.id)}
          canScout={draft.status === "scouting" && draft.scoutingPoints > 0}
          canPick={draft.status === "draft" && current?.team === game.user && !openProspect.draftedBy}
          onClose={() => setOpen(undefined)}
          onScout={() => run((g) => scoutProspect(g, openProspect.player.id))}
          onFollow={() => run((g) => toggleShortlist(g, openProspect.player.id))}
          onAsk={(topic) => run((g) => interviewProspect(g, openProspect.player.id, topic))}
          onPick={() => {
            run((g) => makeUserDraftPick(g, openProspect.player.id));
            setOpen(undefined);
          }}
        />
      )}
    </div>
  );
}

function ProspectTable({
  game,
  prospects,
  reports,
  shortlist,
  scoutingPoints,
  canScout,
  canPick,
  tr,
  onOpen,
  onScout,
  onShortlist,
  onPick,
}: {
  game: Game;
  prospects: DraftProspect[];
  reports: Record<string, ScoutingReport>;
  shortlist: string[];
  scoutingPoints: number;
  canScout: boolean;
  canPick: boolean;
  tr: Translate;
  onOpen: (id: string) => void;
  onScout: (id: string) => void;
  onShortlist: (id: string) => void;
  onPick: (id: string) => void;
}) {
  if (!prospects.length)
    return (
      <div className="draft-empty small">
        <h2>{tr("Пока никого", "Nobody here yet")}</h2>
        <p>{tr("Добавляйте игроков в слежку звёздочкой и проводите беседы в их профиле.", "Follow prospects with the star and hold interviews from their profile.")}</p>
      </div>
    );
  return (
    <div className="table-scroll draft-table-wrap">
      <table className="draft-table v2">
        <thead>
          <tr>
            <th>#</th>
            <th>{tr("ИГРОК", "PLAYER")}</th>
            <th>POS</th>
            <th>{tr("ЛИГА / КЛУБ", "LEAGUE / CLUB")}</th>
            <th>{tr("РОСТ/ВЕС", "HT/WT")}</th>
            <th>OVR</th>
            <th>POT</th>
            <th>{tr("ИЗУЧЕН", "SCOUTED")}</th>
            <th>{tr("ИНТЕРЕС", "INTEREST")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {prospects.slice(0, 120).map((prospect, index) => {
            const player = prospect.player;
            const report = reports[player.id];
            const saved = shortlist.includes(player.id);
            return (
              <tr key={player.id} className={saved ? "followed" : ""}>
                <td className="draft-rank">{index + 1}</td>
                <td>
                  <div className="prospect-cell">
                    <button className={`follow-star ${saved ? "on" : ""}`} aria-label={saved ? tr("Не следить", "Unfollow") : tr("Следить", "Follow")} onClick={() => onShortlist(player.id)}>
                      <Star size={15} />
                    </button>
                    <button className="prospect-name" onClick={() => onOpen(player.id)}>
                      <span className="prospect-flag" title={NATION_LABEL[player.nation]?.en ?? player.nation}>
                        {flagOf(player.nation)}
                      </span>
                      <span>
                        <b>{player.name}</b>
                        <small>
                          {player.age} · {player.nation}
                          {prospect.source === "real" ? <em className="real-tag">{tr("реальный", "real")}</em> : null}
                        </small>
                      </span>
                    </button>
                  </div>
                </td>
                <td>
                  <span className="position-pill">{player.pos}</span>
                </td>
                <td>
                  <span className="league-cell">
                    <em>{prospect.league ?? "—"}</em>
                    <small>{prospect.club ?? player.currentClub ?? ""}</small>
                  </span>
                </td>
                <td className="muted">{prospect.heightCm ? `${prospect.heightCm} / ${prospect.weightKg}` : "—"}</td>
                <td className="scouted-value">{report.estimatedOvr}</td>
                <td className="potential-range">
                  <PotentialView value={reportPotential(report)} />
                </td>
                <td>
                  <div className="confidence">
                    <i>
                      <em style={{ width: `${report.confidence}%` }} />
                    </i>
                    <b>{report.confidence}%</b>
                  </div>
                </td>
                <td>
                  <InterestMeter game={game} prospect={prospect} tr={tr} />
                </td>
                <td className="draft-actions">
                  {canPick ? (
                    <button className="primary compact" onClick={() => onPick(player.id)}>
                      {tr("Выбрать", "Draft")}
                    </button>
                  ) : canScout ? (
                    <button disabled={!scoutingPoints || report.confidence >= 100} onClick={() => onScout(player.id)}>
                      {tr("Изучить", "Scout")}
                    </button>
                  ) : null}
                  <button className="ghost-icon" aria-label={tr("Профиль", "Profile")} onClick={() => onOpen(player.id)}>
                    <MessageCircle size={15} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <PotentialLegend ru={tr("ru", "en") === "ru"} />
    </div>
  );
}

function ProspectProfile({
  game,
  prospect,
  report,
  tr,
  following,
  canScout,
  canPick,
  onClose,
  onScout,
  onFollow,
  onAsk,
  onPick,
}: {
  game: Game;
  prospect: DraftProspect;
  report: ScoutingReport;
  tr: Translate;
  following: boolean;
  canScout: boolean;
  canPick: boolean;
  onClose: () => void;
  onScout: () => void;
  onFollow: () => void;
  onAsk: (topic: InterviewTopic) => void;
  onPick: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "talk">("overview");
  const p = prospect.player;
  const ru = tr("ru", "en") === "ru";
  const meeting = game.draft?.interviews?.[p.id];
  const interest = prospectInterest(game, prospect);
  const keys = p.pos === "G" ? GOALIE_KEYS : SKATER_KEYS;
  const ranked = keys
    .filter((k) => p.attributes[k] !== undefined)
    .map((k) => ({ k, v: p.attributes[k] }))
    .sort((a, b) => b.v - a.v);
  const knows = report.confidence >= 35;
  const strengths = ranked.slice(0, 3);
  const weaknesses = ranked.slice(-2).reverse();
  const home = prospect.hometown;
  const nation = NATION_LABEL[p.nation];
  const left = game.draft?.interviewsLeft ?? 0;
  const canTalk = game.draft?.status === "scouting" && (meeting ? meeting.asked.length < 3 : left > 0);
  return (
    <div className="scout-profile-overlay" role="presentation" onClick={onClose}>
      <section className="prospect-profile" role="dialog" aria-modal="true" aria-label={p.name} onClick={(e) => e.stopPropagation()}>
        <button className="scout-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <header className="prospect-head">
          <div className="prospect-avatar">
            <span>{flagOf(p.nation)}</span>
            <b>{p.pos}</b>
          </div>
          <div>
            <span className="eyebrow">
              {prospect.league ?? "—"} · {prospect.club ?? p.currentClub ?? "—"}
              {prospect.source === "real" ? ` · ${tr("реальный игрок", "real player")}` : ""}
            </span>
            <h2>{p.name}</h2>
            <p>
              {p.age} {tr("лет", "yrs")} · {nation ? (ru ? nation.ru : nation.en) : p.nation}
              {home ? ` · ${home.city}${home.region && home.region !== home.city ? `, ${home.region}` : ""}${prospect.hometownModeled ? "*" : ""}` : ""}
            </p>
          </div>
          <div className="prospect-head-actions">
            <button className={`follow-toggle ${following ? "on" : ""}`} onClick={onFollow}>
              {following ? <EyeOff size={15} /> : <Eye size={15} />} {following ? tr("Не следить", "Unfollow") : tr("Следить", "Follow")}
            </button>
            {canScout && (
              <button onClick={onScout}>
                <Radar size={15} /> {tr("Изучить", "Scout")}
              </button>
            )}
            {canPick && (
              <button className="primary" onClick={onPick}>
                {tr("Выбрать на драфте", "Draft him")}
              </button>
            )}
          </div>
        </header>
        <div className="prospect-tabs">
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>
            {tr("Скаут-отчёт", "Scouting report")}
          </button>
          <button className={tab === "talk" ? "active" : ""} onClick={() => setTab("talk")}>
            <MessageCircle size={14} /> {tr("Беседа", "Interview")}
            {meeting ? ` · ${meeting.asked.length}/3` : ""}
          </button>
        </div>
        {tab === "overview" ? (
          <div className="prospect-body">
            <div className="prospect-ratings">
              <div>
                <small>OVR</small>
                <b>{report.estimatedOvr}</b>
              </div>
              <div>
                <small>POT</small>
                <PotentialView value={reportPotential(report)} />
              </div>
              <div>
                <small>{tr("ИЗУЧЕН", "SCOUTED")}</small>
                <b>{report.confidence}%</b>
              </div>
              <div>
                <small>{tr("ИНТЕРЕС", "INTEREST")}</small>
                <InterestMeter game={game} prospect={prospect} tr={tr} />
              </div>
            </div>
            <div className="prospect-facts">
              <span>
                <Ruler size={14} /> {prospect.heightCm ?? "—"} {tr("см", "cm")} · {prospect.weightKg ?? "—"} {tr("кг", "kg")}
              </span>
              <span>{tr("Хват", "Shoots")}: {prospect.shoots ?? "—"}</span>
              <span>{tr("Амплуа", "Type")}: {p.archetype ?? "—"}</span>
              {prospect.stats && (
                <span>
                  2026/27: {prospect.stats.gp} GP · {prospect.stats.g} G · {prospect.stats.a} A · {prospect.stats.g + prospect.stats.a} PTS
                </span>
              )}
            </div>
            <div className="prospect-report">
              <div>
                <h4>{tr("Сильные стороны", "Strengths")}</h4>
                {knows ? (
                  strengths.map(({ k }) => <span key={k} className="good">{attributeName(k, tr)}</span>)
                ) : (
                  <p className="muted">{tr("Нужно больше просмотров (35%+).", "Needs more scouting (35%+).")}</p>
                )}
              </div>
              <div>
                <h4>{tr("Над чем работать", "Needs work")}</h4>
                {report.confidence >= 55 ? (
                  weaknesses.map(({ k }) => <span key={k} className="bad">{attributeName(k, tr)}</span>)
                ) : (
                  <p className="muted">{tr("Откроется при уверенности 55%+.", "Unlocks at 55%+ confidence.")}</p>
                )}
              </div>
              <div>
                <h4>{tr("Характер и убеждения", "Character")}</h4>
                {meeting?.revealed.length ? (
                  meeting.revealed.map((t) => <span key={t}>{ru ? traitLabel(t).ru : traitLabel(t).en}</span>)
                ) : (
                  <p className="muted">{tr("Узнайте на личной встрече.", "Find out in a meeting.")}</p>
                )}
              </div>
            </div>
            {prospect.hometownModeled && (
              <p className="note">
                {tr(
                  "* Имя, клуб, лига и возраст — из официальных фидов лиг. Родной город, рост/вес и (для OHL/WHL/USHL) гражданство — игровая модель: в фидах этих данных нет.",
                  "* Name, club, league and age come from official league feeds. Hometown, measurements and (for OHL/WHL/USHL) citizenship are modeled: the feeds don't include them.",
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="prospect-body talk">
            <div className="talk-status">
              <span>
                {tr("Интерес к", "Interest in")} {game.teams.find((t) => t.id === game.user)?.name}:
              </span>
              {meeting ? (
                <div className={`talk-meter ${meeting.refused ? "refused" : ""}`}>
                  <i>
                    <em style={{ width: `${meeting.interest}%` }} />
                  </i>
                  <b>{meeting.refused ? tr("Отказ", "Refuses") : meeting.interest}</b>
                </div>
              ) : (
                <small className="muted">
                  {tr("Скауты оценивают", "Scouts estimate")} ~{Math.round(interest.interest / 10) * 10} · {tr("осталось встреч", "meetings left")}: {left}
                </small>
              )}
            </div>
            <div className="talk-log">
              {(meeting?.transcript ?? []).map((line, i) => (
                <div key={i} className={`talk-line ${line.speaker} ${line.mood ?? ""}`}>
                  <small>{line.speaker === "manager" ? tr("Вы", "You") : p.name.split(" ")[0]}</small>
                  <p>{ru ? line.ru : line.en}</p>
                </div>
              ))}
              {!meeting && (
                <p className="muted talk-hint">
                  {tr(
                    "Встреча займёт один слот из лимита до драфта. У вас будет три вопроса — выбирайте их с умом: кто-то мечтает о вашем клубе, а кто-то вырос в городе принципиального соперника.",
                    "A meeting uses one of your pre-draft slots. You get three questions — choose wisely: some kids dream of your club, others grew up in a rival's town.",
                  )}
                </p>
              )}
            </div>
            <div className="talk-topics">
              {INTERVIEW_TOPICS.map((topic) => (
                <button key={topic} disabled={!canTalk || !!meeting?.asked.includes(topic)} onClick={() => onAsk(topic)}>
                  {ru ? INTERVIEW_TOPIC_LABEL[topic].ru : INTERVIEW_TOPIC_LABEL[topic].en}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Pipeline({ players, game, tr }: { players: Player[]; game: Game; tr: Translate }) {
  if (!players.length)
    return (
      <div className="draft-empty small">
        <h2>{tr("Система пока пуста", "Pipeline is empty")}</h2>
        <p>{tr("Ваши выборы на драфте появятся здесь и будут развиваться между сезонами.", "Your draft picks will appear here and develop between seasons.")}</p>
      </div>
    );
  return (
    <Panel title={tr("ПРОСПЕКТЫ С ПРАВАМИ КЛУБА", "CLUB-OWNED PROSPECTS")}>
      <div className="pipeline-grid">
        {[...players]
          .sort((a, b) => b.potential - a.potential || b.ovr - a.ovr)
          .map((player) => (
            <article key={player.id}>
              <span className="position-pill">{player.pos}</span>
              <small>
                {flagOf(player.nation)} {player.nation} · {player.age}
              </small>
              <h3>
                <PlayerLink player={player} />
              </h3>
              <p>{player.archetype}</p>
              <div>
                <b>
                  {player.ovr}
                  <small>OVR</small>
                </b>
                <b className="pipeline-pot">
                  <PotentialCell player={player} game={game} compact />
                  <small>POT</small>
                </b>
              </div>
              <progress max="100" value={player.ovr} />
            </article>
          ))}
      </div>
    </Panel>
  );
}
