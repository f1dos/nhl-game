import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Game, Team } from "../engine/types";
import { SpatialMatch } from "../engine/spatialMatch";
import { advanceDay } from "../engine/management";
import { swapLineupPlayer } from "../engine/roster";
import {
  ensureSpecialTeams,
  SPECIAL_TEAM_LABELS,
  SPECIAL_TEAM_STYLES,
  setSpecialTeamPlayer,
} from "../engine/tactics";
import type { SpecialTeamsSituation } from "../engine/types";
import { Crest } from "./components";
import TacticalCenter from "./TacticalCenter";
const Arena = lazy(() => import("./MatchArena3D"));

export default function SpatialMatchCenter({
  game,
  home,
  away,
  edit,
  onComplete,
}: {
  game: Game;
  home: Team;
  away: Team;
  edit: (fn: (g: Game) => void) => void;
  onComplete: () => void;
}) {
  const [match] = useState(
    () => new SpatialMatch(home, away, game.seed, game.phase === "playoffs"),
  );
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"match" | "tactics">("match");
  const [speed, setSpeed] = useState(8);
  const [, redraw] = useState(0);
  const committed = useRef(false);
  const managed = match.teams.find((t) => t.id === game.user)!;
  const side = match.teams.indexOf(managed);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      for (let n = 0; n < speed; n++) match.step();
      if (match.done || match.intermission) setRunning(false);
      redraw((n) => n + 1);
    }, 100);
    return () => clearInterval(timer);
  }, [match, running, speed]);
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
        throw Error("Календарь изменился во время матча");
      const preseason = current.preseasonFixtures?.some(
        (f) => f.date === current.calendar?.date && !f.result,
      );
      if (!preseason)
        match.teams.forEach((team) => {
          const index = current.teams.findIndex((t) => t.id === team.id);
          current.teams[index] = structuredClone(team);
        });
      current.seed = match.rng.seed;
      advanceDay(current, structuredClone(match.result));
      saved = true;
    });
    if (saved) {
      committed.current = true;
      onComplete();
    }
  };
  const seconds = Math.floor(match.time % 1200);
  return (
    <div className="live-match-center">
      <section className="live-scoreboard">
        <div className="score-club"><Crest team={away} size={52}/><b>
          {away.city} {away.name}
        </b></div>
        <div>
          <small>
            {match.done
              ? "FINAL"
              : `${match.time >= 3600 ? "OT" : `ПЕРИОД ${Math.floor(match.time / 1200) + 1}`} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
          </small>
          <strong>
            {match.result.goals[1]} : {match.result.goals[0]}
          </strong>
        </div>
        <div className="score-club"><b>
          {home.city} {home.name}
        </b><Crest team={home} size={52}/></div>
      </section>
      <nav className="spatial-tabs" role="tablist" aria-label="Матч и тактика"><button role="tab" aria-selected={tab==="match"} onClick={()=>setTab("match")}>Трансляция</button><button role="tab" aria-selected={tab==="tactics"} onClick={()=>{setRunning(false);setTab("tactics");}}>Тактика</button></nav>
      <div className={tab === "match" ? "live-match-layout spatial-broadcast" : "spatial-tactics"}>
        {tab === "tactics" && <TacticalCenter team={managed} change={fn=>update(()=>fn(managed))}/>}
        <section className="live-ice-panel" style={{display:tab==="match"?undefined:"none"}}>
          <header>
            <b>МАТЧ В РЕАЛЬНОМ ВРЕМЕНИ</b>
            <div>
              <button
                disabled={match.done}
                onClick={() => {
                  match.resume();
                  setRunning(!running);
                }}
              >
                {running
                  ? "Пауза"
                  : match.intermission
                    ? "Следующий период"
                    : "Продолжить"}
              </button>
              <select
                aria-label="Скорость матча"
                value={speed}
                onChange={(e) => setSpeed(+e.target.value)}
              >
                {[1, 4, 8, 32, 128].map((n) => (
                  <option key={n} value={n}>
                    ×{n}
                  </option>
                ))}
              </select>
              {match.done && (
                <button onClick={finish}>Завершить и перейти к прессе</button>
              )}
            </div>
          </header>
          <Suspense fallback={<p>Загрузка арены…</p>}>
            <Arena
              home={home}
              away={away}
              running={running}
              spatial={match.frame}
            />
          </Suspense>
          <p style={{ padding: 12 }}>
            Броски {match.result.shots[1]} : {match.result.shots[0]} ·{" "}
            {match.intermission
              ? "ПЕРЕРЫВ — измените план перед следующим периодом"
              : running
                ? "LIVE"
                : "ПАУЗА"}
          </p>
        </section>
        <section className="live-feed" style={{display:tab==="match"?undefined:"none"}}>
          <header>События матча</header>
          {match.result.events
            .slice(-30)
            .reverse()
            .map((e, i) => (
              <div key={`${e.time}-${i}`}>
                <time>{Math.floor(e.time / 60)}′</time>
                <span>
                  <b>{e.player}</b>
                  <small>{e.text}</small>
                </span>
              </div>
            ))}
        </section>
        <aside className="live-bench" style={{display:tab==="tactics"?undefined:"none"}}>
          <div className="live-tactics">
            <h3>Тренерский пульт</h3>
            <label>Форчек<select value={managed.tactics.forecheck} onChange={e=>update(()=>{managed.tactics.forecheck=e.target.value as typeof managed.tactics.forecheck;})}>{["1-2-2","2-1-2","1-3-1"].map(v=><option key={v}>{v}</option>)}</select></label>
            <p>Звенья и план применяются со следующей смены.</p>
            {(["pace", "shooting", "physical"] as const).map((key) => (
              <label key={key}>
                {key === "pace"
                  ? "Темп"
                  : key === "shooting"
                    ? "Броски"
                    : "Жёсткость"}
                <input
                  type="range"
                  min="20"
                  max="90"
                  value={managed.tactics[key]}
                  onChange={(e) =>
                    update(() => {
                      managed.tactics[key] = +e.target.value;
                    })
                  }
                />
              </label>
            ))}
            <button
              onClick={() =>
                update(() => {
                  match.pullGoalie[side] = !match.pullGoalie[side];
                })
              }
            >
              {match.pullGoalie[side] ? "Вернуть вратаря" : "Снять вратаря"}
            </button>
          </div>
          <div className="live-line-editor">
            <label>
              Форчек
              <select
                value={managed.tactics.forecheck}
                onChange={(e) =>
                  update(() => {
                    managed.tactics.forecheck = e.target
                      .value as typeof managed.tactics.forecheck;
                  })
                }
              >
                {["1-2-2", "2-1-2", "1-3-1"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Вратарь
              <select
                value={managed.goalie}
                onChange={(e) =>
                  update(() => {
                    managed.goalie = e.target.value;
                  })
                }
              >
                {managed.players
                  .filter((p) => p.pos === "G" && !p.injury)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            {(["lines", "defense"] as const).map((group) =>
              managed[group].map((line, row) => (
                <section key={`${group}-${row}`}>
                  <b>
                    {group === "lines" ? "Звено" : "Пара"} {row + 1}
                  </b>
                  {line.map((id, slot) => (
                    <select
                      key={slot}
                      value={id}
                      onChange={(e) =>
                        update(() =>
                          swapLineupPlayer(
                            managed,
                            group,
                            row,
                            slot,
                            e.target.value,
                          ),
                        )
                      }
                    >
                      {managed.players
                        .filter(
                          (p) =>
                            !p.injury &&
                            (group === "defense"
                              ? p.pos === "D"
                              : !["D", "G"].includes(p.pos)),
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.ovr}
                          </option>
                        ))}
                    </select>
                  ))}
                </section>
              )),
            )}
            <h3>Спецбригады</h3>
            {(Object.keys(SPECIAL_TEAM_LABELS) as SpecialTeamsSituation[]).map(
              (situation) => {
                const unit = ensureSpecialTeams(managed)[situation]!;
                return (
                  <section key={situation}>
                    <b>{SPECIAL_TEAM_LABELS[situation]}</b>
                    <select
                      value={unit.style}
                      onChange={(e) =>
                        update(() => {
                          unit.style = e.target.value as typeof unit.style;
                        })
                      }
                    >
                      {SPECIAL_TEAM_STYLES[situation].map((style) => (
                        <option key={style}>{style}</option>
                      ))}
                    </select>
                    {unit.players.map((id, slot) => (
                      <select
                        key={slot}
                        value={id}
                        onChange={(e) =>
                          update(() =>
                            setSpecialTeamPlayer(
                              managed,
                              situation,
                              slot,
                              e.target.value,
                            ),
                          )
                        }
                      >
                        {managed.players
                          .filter(
                            (p) =>
                              !p.injury &&
                              p.pos !== "G" &&
                              (p.id === id || !unit.players.includes(p.id)),
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    ))}
                  </section>
                );
              },
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
