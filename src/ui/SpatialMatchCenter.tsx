import BenchDesk from "./BenchDesk";
import { stamp } from "./CoachBench";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ListOrdered,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  ScrollText,
  SkipForward,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Game, Team } from "../engine/types";
import { RINK } from "../engine/rink";
import type { SpatialFrame } from "../engine/spatialMatch";
import { englishDynamic } from "../i18n/englishMatch";
import { createClubMatch, applyClubMatch } from "../engine/careerMatch";
import { advanceDay } from "../engine/management";
import broadcastCrests from "../assets/scoreboard-crests.json";
const clubMarks: Record<string,string> = broadcastCrests;
import TacticalCenter from "./TacticalCenter";
import { CAMERA_MODES, type CameraMode } from "./cameraModes";
import Select from "./Select";
const Arena = lazy(() => import("./MatchArena3D"));

type Drawer = "lines" | "bench" | "stats" | "events" | null;
interface Toast {
  id: number;
  kind: "goal" | "penalty" | "info";
  title: string;
  sub: string;
  color: string;
  until: number;
}
const SPEEDS = [1, 2, 4, 8, 32];

const clock = (time: number) => {
  const left = time >= 3600 ? Math.max(0, 3900 - time) : 1200 - (time % 1200 || (time ? 1200 : 0));
  const s = Math.max(0, Math.round(left));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
function periodMark(time: number) {
  const period = Math.floor(time / 1200);
  return period >= 3 ? "OT" : <>{period+1}<sup>{["ST","ND","RD"][period]}</sup></>;
}

/** Bird's-eye radar of the rink, like the 2D pitch in football-manager games. */
function MiniRink({ frame, teams }: { frame: SpatialFrame; teams: Team[] }) {
  const X = (x: number) => 120 + (x / 30.5) * 116;
  const Y = (z: number) => 52 + (z / 13.2) * 48;
  return (
    <svg className="bw-radar" viewBox="0 0 240 104" aria-hidden="true">
      <rect x="4" y="4" width="232" height="96" rx="30" className="bw-radar-ice" />
      <line x1="120" y1="4" x2="120" y2="100" stroke="#d64251" strokeWidth="2" />
      {[-RINK.blueLine, RINK.blueLine].map((x) => (
        <line key={x} x1={X(x)} y1="4" x2={X(x)} y2="100" stroke="#3f7fd1" strokeWidth="2" />
      ))}
      {[-26.9, 26.9].map((x) => (
        <line key={x} x1={X(x)} y1="10" x2={X(x)} y2="94" stroke="#d64251" strokeWidth="1" />
      ))}
      <circle cx="120" cy="52" r="15" fill="none" stroke="#3f7fd1" strokeWidth="1" />
      {frame.bodies.map((b) => (
        <circle
          key={b.id}
          cx={X(b.x)}
          cy={Y(b.z)}
          r={b.goalie ? 4.4 : 3.6}
          fill={b.side === 0 ? teams[0].color : "#eef3f7"}
          stroke={b.side === 0 ? "#0b1016" : teams[1].color}
          strokeWidth={b.id === frame.carrierId ? 2.4 : 1.2}
        />
      ))}
      <circle cx={X(frame.puck.x)} cy={Y(frame.puck.z)} r="2.2" fill="#111" stroke="#f1c958" strokeWidth="0.8" />
    </svg>
  );
}

/**
 * The live match as a TV broadcast in its own full-screen window: the 3D arena
 * fills the screen and every control sits on top as broadcast-style panels.
 */
export default function SpatialMatchCenter({
  game,
  home,
  away,
  edit,
  onComplete,
  finishLabel,
  eliminationRules = game.phase === "playoffs",
}: {
  game: Game;
  home: Team;
  away: Team;
  edit: (fn: (g: Game) => void) => void;
  onComplete: () => void;
  /** Text of the button shown after the final siren. */
  finishLabel?: string;
  eliminationRules?: boolean;
}) {
  const ru = game.language !== "en";
  const tr = (a: string, b: string) => (ru ? a : b);
  const [match] = useState(
    () =>
      createClubMatch(home, away, game.seed, eliminationRules, true),
  );
  const [running, setRunning] = useState(false);
  const [skipBoundary,setSkipBoundary]=useState<number|null>(null);
  const [speed, setSpeed] = useState(1);
  const [camera, setCamera] = useState<CameraMode>("broadcast");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pauseDraw,setPauseDraw]=useState(false);
  const [reviewId,setReviewId]=useState<number|null>(null);
  const [reviewIndex,setReviewIndex]=useState(0);
  const [reviewPlaying,setReviewPlaying]=useState(false);
  const clip=reviewId===null ? undefined : match.clips.get(reviewId);
  const review=(id:number)=>{
    if(!match.clips.has(id))return;
    setRunning(false);setReviewId(id);setReviewIndex(0);setReviewPlaying(true);setDrawer(null);
  };
  const closeReview=()=>{setReviewId(null);setReviewPlaying(false);};
  useEffect(()=>{
    if(!clip || !reviewPlaying)return;
    if(reviewIndex>=clip.length-1){setReviewPlaying(false);return;}
    const timer=setTimeout(()=>setReviewIndex(reviewIndex+1),Math.max(50,(clip[reviewIndex+1].tick-clip[reviewIndex].tick)*100));
    return ()=>clearTimeout(timer);
  },[clip,reviewIndex,reviewPlaying]);
  const [fullscreen, setFullscreen] = useState(false);
  const [, redraw] = useState(0);
  const committed = useRef(false);
  const seenEvents = useRef(match.result.events.length);
  const toastId = useRef(0);
  const shell = useRef<HTMLDivElement>(null);
  const managed = match.teams.find((t) => t.id === game.user) ?? match.teams[0];
  const side = match.teams.indexOf(managed);
  const teams = match.teams;

  const announce = () => {
    const events = match.result.events;
    const fresh = events.slice(seenEvents.current);
    seenEvents.current = events.length;
    const now = performance.now();
    const next: Toast[] = [];
    for (const e of fresh) {
      const team = teams.find((t) => t.id === e.team);
      const player = team?.players.find((p) => p.id === e.playerId);
      if (e.type === "goal")
        next.push({
          id: ++toastId.current,
          kind: "goal",
          title: tr("ГОЛ!", "GOAL!"),
          sub: `${player ? `#${player.number} ` : ""}${e.player} · ${team?.id ?? ""} · ${e.score[1]}:${e.score[0]}`,
          color: team?.color ?? "#f1c958",
          until: now + 6500,
        });
      else if (e.type === "offside")
        next.push({id: ++toastId.current, kind: "info", title: tr("Вне игры", "Offside"),
          sub: tr("Вбрасывание в средней зоне", "Neutral-zone faceoff") + " · " + e.team,
          color: team?.color ?? "#91b5ce", until: now + 3500});
      else if (e.type === "penalty")
        next.push({
          id: ++toastId.current,
          kind: "penalty",
          title: tr("УДАЛЕНИЕ · 2:00", "PENALTY · 2:00"),
          sub: `${player ? `#${player.number} ` : ""}${e.player} · ${team?.id ?? ""}`,
          color: team?.color ?? "#e6c35c",
          until: now + 4500,
        });
    }
    setToasts((list) => {
      const kept = list.filter((t) => t.until >= now);
      return next.length || kept.length !== list.length ? [...kept, ...next].slice(-3) : list;
    });
  };

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      for (let n = 0; n < speed; n++) {
        // Celebrations, whistles and faceoffs play at natural speed unless the
        // manager chose a fast simulation.
        if (n > 0 && match.stopped) break;
        match.step();
        if(pauseDraw && match.canMatchHomeLine && side===0){
          setRunning(false);setPauseDraw(false);setDrawer("bench");break;
        }
        if (match.done || match.intermission) break;
      }
      if (match.done || match.intermission) setRunning(false);
      announce();
      redraw((n) => n + 1);
    }, 100);
    return () => clearInterval(timer);
  }, [running, speed, match, pauseDraw, side]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName) && e.code === "Space") return;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if(reviewId!==null){if(e.key==="Escape")closeReview();return;}
      if (e.code === "Space" && skipBoundary===null) {
        e.preventDefault();
        if (!match.done) {
          match.resume();
          setRunning((r) => !r);
        }
      } else if (e.key === "Escape") setDrawer(null);
      else if (["1", "2", "3", "4", "5"].includes(e.key)) setCamera(CAMERA_MODES[+e.key - 1].value);
    };
    window.addEventListener("keydown", onKey);
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [match,reviewId,skipBoundary]);

  useEffect(()=>{
    if(skipBoundary===null) return;
    let timer: ReturnType<typeof setTimeout>;
    const batch=()=>{
      for(let i=0;i<160 && !match.done && !match.intermission && match.time<skipBoundary;i++) match.step();
      seenEvents.current=match.result.events.length;
      redraw(n=>n+1);
      if(match.done || match.intermission || match.time>=skipBoundary) setSkipBoundary(null);
      else timer=setTimeout(batch,0);
    };
    timer=setTimeout(batch,0);
    return ()=>clearTimeout(timer);
  },[match,skipBoundary]);

  const update = (fn: () => void) => {
    fn();
    match.setPlan(managed);
    redraw((n) => n + 1);
  };
  const finish = () => {
    if (!match.done || committed.current) return;
    let saved = false;
    edit((current) => {
      if (
        current.calendar?.date !== game.calendar?.date ||
        current.round !== game.round
      )
        throw Error(tr("Календарь изменился во время матча", "The calendar changed during the match"));
      const preseason = current.preseasonFixtures?.some(
        (f) => f.date === current.calendar?.date && !f.result,
      );
      advanceDay(current, applyClubMatch(current, match, !!preseason));
      saved = true;
    });
    if (saved) {
      committed.current = true;
      if (document.fullscreenElement) void document.exitFullscreen();
      onComplete();
    }
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shell.current?.requestFullscreen?.().catch(() => undefined);
  };
  const toggle = () => {
    if (match.done || skipBoundary!==null) return;
    match.resume();
    setRunning(!running);
  };

  const result = match.result;
  const reviewFrame=clip?.[reviewIndex];
  const frame:SpatialFrame=reviewFrame ? {...match.frame,...reviewFrame,tick:-(reviewIndex+1)} : match.frame;
  const power = frame.penaltyBox.length
    ? (() => {
        const p = [...frame.penaltyBox].sort((a, b) => a.until - b.until)[0];
        const left = Math.max(0, Math.round(p.until - match.time));
        return `${tr("БОЛ.", "PP")} ${teams[1 - p.side].id} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      })()
    : "";
  const manpower = [0, 1].map((s) => frame.bodies.filter((b) => b.side === s && !b.goalie).length);
  const stat = (type: string, s: number) => result.events.filter((e) => e.type === type && e.team === teams[s].id).length;
  const effective = match.stopped ? 1 : speed;
  const period = Math.min(3, Math.floor(match.time / 1200) + 1);
  const nextPeriod = Math.floor(match.time / 1200) + 1;

  return (
    <div className="broadcast-window" ref={shell} role="dialog" aria-modal="true" aria-labelledby="bw-title">
      <h1 id="bw-title" className="bw-sr-only">
        {tr("МАТЧ В РЕАЛЬНОМ ВРЕМЕНИ", "LIVE MATCH")}: {away.id} — {home.id}
      </h1>
      <div className="bw-stage">
        <Suspense fallback={<p className="bw-loading">{tr("Загрузка арены…", "Loading arena…")}</p>}>
          <Arena
            home={home}
            away={away}
            running={reviewFrame ? reviewPlaying : running || match.done || match.intermission}
            playback={reviewFrame ? 1 : effective}
            spatial={frame}
            reviewMode={!!reviewFrame}
            camera={reviewFrame ? "overhead" : camera}
            height="100%"
            language={ru ? "ru" : "en"}
            scoreboard={{
              home: (reviewFrame?.score ?? result.goals)[0],
              away: (reviewFrame?.score ?? result.goals)[1],
              clock: clock(reviewFrame?.at ?? match.time),
              period: match.time >= 3600 ? "OT" : `P${period}`,
            }}
          />
        </Suspense>
      </div>

      {clip && <section className="coach-replay" aria-label={tr("Разбор эпизода","Shift review")}>
        <b>{tr("Разбор сверху","Overhead review")} · {stamp(clip[reviewIndex].at)}</b>
        <input type="range" aria-label={tr("Кадр повтора","Replay frame")} min={0} max={clip.length-1} value={reviewIndex} onChange={e=>{setReviewPlaying(false);setReviewIndex(+e.target.value)}}/>
        <button onClick={()=>{if(reviewIndex===clip.length-1)setReviewIndex(0);setReviewPlaying(!reviewPlaying)}}>{reviewPlaying?tr("Пауза повтора","Pause replay"):tr("Смотреть","Play replay")}</button>
        <button onClick={closeReview}>{tr("Вернуться к матчу","Back to match")}</button>
      </section>}
      <div className="score-stack" hidden={!!clip}>
      <div className="match-strip">
        <div className="match-strip-main" aria-label={tr("Табло матча", "Match scoreboard")}>
          <div className="strip-time">
            <strong>{match.done ? (result.so ? "SO" : result.ot ? "OT" : tr("Итог","Final")) : clock(match.time)}</strong>
            <span className={match.done ? "is-final" : undefined}>{match.done ? tr("ФИНАЛ","FINAL") : periodMark(match.time)}</span>
          </div>
          {[1,0].map(side => <div key={side} className={side ? "strip-side visiting" : "strip-side hosting"}>
            <img className="strip-mark" src={clubMarks[teams[side].id] ?? teams[side].logoUrl} alt="" /><b>{teams[side].id}</b>
            <strong aria-label={teams[side].id+" "+result.goals[side]}>{result.goals[side]}</strong>
          </div>)}
          <div className="strip-shots"><b>{result.shots[1]}</b><small title={tr("Броски в створ","Shots on goal")}>SOG</small><b>{result.shots[0]}</b></div>
        </div>
        <div className="strip-notes">
          {(manpower[0] !== 5 || manpower[1] !== 5) && <span title={tr("Составы на льду","Skaters on the ice")}>{manpower[1]} × {manpower[0]}</span>}
          {power && <b>{power}</b>}
          {frame.delayedOffside !== undefined && <b>{tr("Отложенное вне игры","Delayed offside")} · {teams[frame.delayedOffside].id}</b>}
        </div>
      </div>
      {/* Penalty box: who is serving and how long is left */}
      {!!frame.penaltyBox.length && (
        <div className="bw-box" aria-label={tr("Штрафной бокс", "Penalty box")}>
          {frame.penaltyBox.map((p) => {
            const player = teams[p.side].players.find((x) => x.id === p.id);
            const left = Math.max(0, Math.round(p.until - match.time));
            return (
              <div key={p.id} style={{ ["--team" as string]: teams[p.side].color }}>
                <span>
                  {tr("Бокс", "Box")} · {teams[p.side].id} #{player?.number} {player?.name}
                </span>
                <small>
                  {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
                </small>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Top right: camera and window controls */}
      <div className="bw-top" style={clip?{display:"none"}:undefined}>
        <div className="bw-chips" role="radiogroup" aria-label={tr("Камера", "Camera")}>
          {CAMERA_MODES.map((c, i) => (
            <button key={c.value} role="radio" aria-checked={camera === c.value} className={camera === c.value ? "on" : ""} onClick={() => setCamera(c.value)} title={`${ru ? c.ru : c.en} (${i + 1})`}>
              {ru ? c.ru : c.en}
            </button>
          ))}
        </div>
        <button className="bw-icon" onClick={toggleFullscreen} title={tr("Во весь экран", "Full screen")} aria-label={tr("Во весь экран", "Full screen")}>
          {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
      </div>

      {/* Lower-third plaques */}
      <div className="bw-toasts" style={clip?{display:"none"}:undefined}>
        {toasts.map((t) => (
          <div key={t.id} className={`bw-toast ${t.kind}`} style={{ ["--team" as string]: t.color }}>
            <b>{t.title}</b>
            <span>{t.sub}</span>
          </div>
        ))}
      </div>

      {/* Period break and final siren */}
      {!clip && (match.intermission || match.done) && (
        <div className="bw-center-card">
          <span className="eyebrow">{match.done ? tr("ФИНАЛЬНАЯ СИРЕНА", "FINAL SIREN") : tr("ПЕРЕРЫВ", "INTERMISSION")}</span>
          <h2>
            {away.id} {result.goals[1]} : {result.goals[0]} {home.id}
            {match.done && (result.so ? " SO" : result.ot ? " OT" : "")}
          </h2>
          <p>
            {match.done
              ? tr(`Броски ${result.shots[1]} — ${result.shots[0]}`, `Shots ${result.shots[1]} — ${result.shots[0]}`)
              : match.time >= 3600
                ? tr("Впереди овертайм. Проверьте звенья 3×3.", "Overtime is next. Check your 3-on-3 units.")
                : tr(`Закончился ${nextPeriod - 1}-й период. Поправьте звенья и тактику.`, `End of period ${nextPeriod - 1}. Adjust lines and tactics.`)}
          </p>
          <div>
            {match.done ? (
              <button className="primary" onClick={finish}>
                {finishLabel ?? tr("К пресс-конференции", "To the press conference")}
              </button>
            ) : (
              <>
                <button onClick={() => setDrawer("lines")}>{tr("Звенья и тактика", "Lines & tactics")}</button>
                <button className="primary" onClick={toggle}>
                  {match.time >= 3600 ? tr("Начать овертайм", "Start overtime") : tr(`Начать ${nextPeriod}-й период`, `Start period ${nextPeriod}`)}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Radar, bottom left */}
      <div className="bw-radar-card" style={clip?{display:"none"}:undefined}>
        <MiniRink frame={frame} teams={teams} />
      </div>

      {/* Control bar */}
      <div className="match-controls" style={clip?{display:"none"}:undefined}>
        <div className="transport-panel">
          <button className="bw-play transport-toggle" onClick={toggle} disabled={match.done}
            aria-label={running ? tr("Пауза", "Pause") : tr("Играть", "Play")} title={tr("Пробел", "Space")}>
            {running ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <span className="transport-state" data-live={running && !match.stopped}>
            <i aria-hidden="true" />{match.done ? tr("Финал","Final") : !running ? tr("Пауза","Paused") : match.stopped ? tr("Свисток","Stoppage") : tr("В эфире","Live")}
          </span>
          <button className="period-skip" disabled={match.done || !!clip || skipBoundary!==null} onClick={()=>{
            setRunning(false);
            match.resume();
            const end = (Math.floor(match.time/1200)+1)*1200;
            setToasts([]);setPauseDraw(false);setSkipBoundary(end);
          }}><SkipForward size={14} aria-hidden="true"/>{skipBoundary!==null ? tr("Симуляция…","Simulating…") : tr("До конца периода","Sim to period end")}</button>
          <label className="transport-speed">
            <select aria-label={tr("Скорость матча","Match speed")} value={speed} onChange={e=>setSpeed(Number(e.target.value))}>
              {SPEEDS.map(n=><option key={n} value={n}>{n}×</option>)}
            </select>
            <ChevronDown aria-hidden="true" size={13}/>
          </label>
        </div>
        <div className="match-tools">
          {(
            [
              ["lines", <ListOrdered key="l" size={16} />, tr("Звенья", "Lines")],
              ["bench", <SlidersHorizontal key="b" size={16} />, tr("Пульт", "Bench")],
              ["stats", <BarChart3 key="s" size={16} />, tr("Статистика", "Stats")],
              ["events", <ScrollText key="e" size={16} />, tr("События", "Events")],
            ] as const
          ).map(([key, icon, label]) => (
            <button key={key} aria-label={label} title={label} aria-pressed={drawer === key} className={drawer === key ? "on" : ""} onClick={() => setDrawer(drawer === key ? null : key)}>
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Interaction panels */}
      {drawer && (
        <aside className="bw-drawer" aria-label={tr("Панель матча", "Match panel")}>
          <header>
            <b>
              {drawer === "lines" ? tr("Звенья, тактика и спецбригады", "Lines, tactics & special teams") : drawer === "bench" ? tr("Тренерский пульт", "Bench controls") : drawer === "stats" ? tr("Статистика матча", "Match stats") : tr("События матча", "Match events")}
            </b>
            <button className="bw-icon" onClick={() => setDrawer(null)} aria-label={tr("Закрыть", "Close")}>
              <X size={16} />
            </button>
          </header>
          <div className="bw-drawer-body">
            {drawer === "lines" && (
              <>
                <p className="bw-hint">{tr("Изменения вступают в силу со следующей смены.", "Changes apply from the next shift.")}</p>
                <TacticalCenter team={managed} change={(fn) => update(() => fn(managed))} />
              </>
            )}
            {drawer === "bench" && (
              <div className="bw-bench">
                <BenchDesk match={match} side={side} tr={tr} review={review} refresh={()=>redraw(n=>n+1)}
                  pauseDraw={pauseDraw} setPauseDraw={setPauseDraw}/>
                <details className="bench-team"><summary>{tr("Командные настройки","Team settings")}</summary>
                <label>
                  {tr("Форчек", "Forecheck")}
                  <Select value={managed.tactics.forecheck} onChange={(e) => update(() => { managed.tactics.forecheck = e.target.value as typeof managed.tactics.forecheck; })}>
                    {["1-2-2", "2-1-2", "1-3-1"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </Select>
                </label>
                {(["pace", "shooting", "physical"] as const).map((key) => (
                  <label key={key}>
                    {key === "pace" ? tr("Темп", "Pace") : key === "shooting" ? tr("Броски", "Shooting") : tr("Жёсткость", "Physicality")}
                    <input type="range" min="20" max="90" value={managed.tactics[key]} onChange={(e) => update(() => { managed.tactics[key] = +e.target.value; })} />
                    <output>{managed.tactics[key]}</output>
                  </label>
                ))}
                <label>
                  {tr("Вратарь", "Goalie")}
                  <Select value={managed.goalie} onChange={(e) => update(() => { managed.goalie = e.target.value; })}>
                    {managed.players
                      .filter((p) => p.pos === "G" && !p.injury)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </Select>
                </label>
                <button className={match.pullGoalie[side] ? "primary" : ""} onClick={() => update(() => { match.pullGoalie[side] = !match.pullGoalie[side]; })}>
                  {match.pullGoalie[side] ? tr("Вернуть вратаря", "Put the goalie back") : tr("Снять вратаря (6×5)", "Pull the goalie (6-on-5)")}
                </button>
                </details>
              </div>
            )}
            {drawer === "stats" && (
              <table className="bw-stats">
                <thead>
                  <tr>
                    <th>{away.id}</th>
                    <th />
                    <th>{home.id}</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      [tr("Голы", "Goals"), result.goals[1], result.goals[0]],
                      [tr("Броски в створ", "Shots on goal"), result.shots[1], result.shots[0]],
                      ["xG", result.xg[1].toFixed(2), result.xg[0].toFixed(2)],
                      [tr("Реализация большинства", "Power play"), `${result.pp[1]}/${result.ppo[1]}`, `${result.pp[0]}/${result.ppo[0]}`],
                      [tr("Выигранные вбрасывания", "Faceoffs won"), stat("faceoff", 1), stat("faceoff", 0)],
                      [tr("Вне игры", "Offsides"), stat("offside", 1), stat("offside", 0)],
                      [tr("Отборы", "Takeaways"), stat("turnover", 1), stat("turnover", 0)],
                      [tr("Удаления", "Penalties"), stat("penalty", 1), stat("penalty", 0)],
                    ] as const
                  ).map(([label, a, b]) => (
                    <tr key={label}>
                      <td>{a}</td>
                      <th>{label}</th>
                      <td>{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {drawer === "events" && (
              <ol className="bw-events">
                {result.events.map((e,index)=>({e,index}))
                  .filter(({e}) => e.type !== "faceoff")
                  .reverse()
                  .map(({e,index}) => (
                    <li key={index} className={e.type}>
                      <time>{Math.floor(e.time / 60)}′</time>
                      <span>
                        <b>{e.player}</b>
                        <small>
                          {e.team} · {ru ? e.text : englishDynamic(e.text)}
                        </small>
                      </span>
                      {match.clips.has(index) && <button onClick={()=>review(index)}>{tr("Разобрать","Review")}</button>}
                    </li>
                  ))}
              </ol>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
