import { useState } from "react";
import { Activity, ClipboardList, GitCompareArrows, Play } from "lucide-react";
import type { SpatialMatch } from "../engine/spatialMatch";
import type { AttackPlan, Forecheck } from "../engine/coaching";
import { stamp } from "./CoachBench";

type T = (ru: string, en: string) => string;
export function planNames(t: T) {
  return {
    auto: t("По профилю", "Natural game"),
    wide: t("Широкий вход", "Wide entry"),
    slot: t("Давление на пятак", "Crash the net"),
    high: t("Третий выше", "High forward"),
  };
}
export default function BenchDesk({
  match: m,
  side,
  tr: t,
  refresh,
  review,
  pauseDraw,
  setPauseDraw,
}: {
  match: SpatialMatch;
  side: number;
  tr: T;
  refresh: () => void;
  review: (i: number) => void;
  pauseDraw: boolean;
  setPauseDraw: (b: boolean) => void;
}) {
  const [tab, setTab] = useState(0),
    [line, choose] = useState(0),
    [filter, setFilter] = useState(-1),
    [period, setPeriod] = useState(0),
    [vis, setVis] = useState(0);
  const club = m.teams[side],
    foe = m.teams[1 - side],
    on = m.deployedLine(side),
    names = planNames(t),
    plan = m.attackPlan(side, line);
  const players = (club.lines[line] ?? [])
    .map((id) => club.players.find((p) => p.id === id))
    .filter((p) => !!p);
  const set = (f: () => void) => {
    f();
    refresh();
  };
  const journal = m.shifts.filter((s) => s.side === side);
  const press =
    m.pendingOrders[side].get(line) ??
    m.orders[side].get(line)?.order ??
    club.tactics.forecheck;
  const trios = (team: typeof club, n: number) =>
    team.lines[n]
      ?.map((id) =>
        team.players
          .find((p) => p.id === id)
          ?.name.split(" ")
          .at(-1),
      )
      .join(" · ");
  const lineup = (
    <div className="cd-units">
      {club.lines.map((_, i) => (
        <button key={i} aria-pressed={line === i} onClick={() => choose(i)}>
          L{i + 1}
          {on === i && <i title={t("На льду", "On ice")} />}
        </button>
      ))}
    </div>
  );
  const applied = m.orders[side].get(line);
  const lineHistory = journal.filter((s) => s.line === line);
  const comparisons = applied
    ? [
        lineHistory.filter((s) => s.start < applied.at - 0.001).slice(-5),
        lineHistory.filter((s) => s.start >= applied.at - 0.001).slice(0, 5),
      ]
    : [];
  const roles = {
    screen: t("Игра на пятаке", "Net front"),
    pass: t("Организатор", "Playmaker"),
    finish: t("Завершение", "Finisher"),
  };
  const plans = Object.keys(names) as AttackPlan[];
  const details = {
    auto: t(
      "Маршруты определяет профиль тройки.",
      "Routes follow the unit’s natural strengths.",
    ),
    wide: t(
      "Два края открываются у бортов. Пас в свободный фланг получает приоритет.",
      "Both wings stretch the ice. Prefer an open outside lane.",
    ),
    slot: t(
      "Первый партнёр идёт под ворота, второй открывается между кругами.",
      "One forward screens, the second offers a pass between the circles.",
    ),
    high: t(
      "Один форвард остаётся над шайбой для обратного паса и подстраховки.",
      "One forward stays above the puck as an outlet and cover.",
    ),
  };
  const rows = journal
    .filter(
      (s) =>
        (filter < 0 || s.line === filter) &&
        (!period || Math.min(4, 1 + Math.floor(s.start / 1200)) === period),
    )
    .slice()
    .reverse();
  return (
    <section className="club-desk">
      <header>
        <strong>{club.id}</strong>
        <div>
          <small>{t("ТРЕНЕРСКИЙ ШТАБ", "COACHING STAFF")} · 5×5</small>
          <h3>{t("Скамейка команды", "Team bench")}</h3>
        </div>
        <time>{stamp(m.time)}</time>
      </header>
      <nav>
        {[Activity, ClipboardList, GitCompareArrows].map((Icon, i) => (
          <button key={i} aria-pressed={tab === i} onClick={() => setTab(i)}>
            <Icon size={15} />
            {
              [
                t("План игры", "Game plan"),
                t("Журнал смен", "Shift log"),
                t("Сочетания", "Matchups"),
              ][i]
            }
          </button>
        ))}
      </nav>
      {tab === 0 && (
        <article>
          {lineup}
          <div className="cd-players">
            {players.map((p) => {
              const role = m.roleFor(side, line, p.id);
              return (
                <div key={p.id}>
                  <small>
                    {p.pos} · {role && roles[role]}
                  </small>
                  <b>{p.name.split(" ").at(-1)}</b>
                  <small>
                    {t("Свежесть", "Freshness")} {Math.round(100 - p.fatigue)}%
                  </small>
                  <meter min={0} max={100} value={100 - p.fatigue} />
                </div>
              );
            })}
          </div>
          <h4>
            {t("Игра с шайбой", "In possession")}{" "}
            <small>
              {
                {
                  cycle: t("Силовой цикл", "Cycle"),
                  skill: t("Комбинационное", "Skill"),
                  balanced: t("Универсальное", "Balanced"),
                }[m.style(side, line)]
              }
            </small>
          </h4>
          <div className="cd-options">
            {plans.map((k) => (
              <button
                key={k}
                aria-pressed={plan === k}
                onClick={() => set(() => m.setLinePlan(side,line,k))}
              >
                {names[k]}
              </button>
            ))}
          </div>
          <div className="cd-route">
            <svg viewBox="0 0 140 76" aria-hidden="true">
              <rect
                x="2"
                y="2"
                width="136"
                height="72"
                rx="17"
                fill="#173844"
                stroke="#63848d"
              />
              <path d="M50 3v70m67-68v66" stroke="#50727e" />
              <circle cx="96" cy="23" r="11" fill="none" stroke="#496776" />
              <circle cx="96" cy="53" r="11" fill="none" stroke="#496776" />
              <path d="M118 32h4q5 6 0 12h-4z" fill="none" stroke="#e7ac93" />
              {(plan === "wide"
                ? [
                    [96, 10],
                    [78, 65],
                  ]
                : plan === "slot"
                  ? [
                      [112, 37],
                      [93, 46],
                    ]
                  : plan === "high"
                    ? [
                        [62, 32],
                        [103, 52],
                      ]
                    : [
                        [84, 19],
                        [103, 51],
                      ]
              ).map(([x, y]) => (
                <g key={x}>
                  <path
                    d={`M42 40 Q 58 ${y} ${x} ${y}`}
                    fill="none"
                    stroke="#82cabc"
                    strokeDasharray="3 3"
                  />
                  <circle cx={x} cy={y} r="4" fill="#a1e7d6" />
                </g>
              ))}
              <circle cx="42" cy="40" r="4" fill="#ffc775" />
            </svg>
            <p>{details[plan]}</p>
          </div>

          <h4>{t("Без шайбы", "Out of possession")}</h4>
          <div className="cd-options">
            {(["1-2-2", "2-1-2", "1-3-1"] as Forecheck[]).map((k) => (
              <button
                aria-pressed={press === k}
                key={k}
                onClick={() => set(() => m.orderLine(side, line, k))}
              >
                {k}
              </button>
            ))}
          </div>
          <p>
            {press === "2-1-2"
              ? t(
                  "Двое давят глубоко. За первым пасом остаётся больше пространства.",
                  "Two chase deep, leaving room behind the first pass.",
                )
              : press === "1-3-1"
                ? t(
                    "Тройка перекрывает среднюю зону, один встречает шайбу.",
                    "Three close the neutral zone behind one forechecker.",
                  )
                : t(
                    "Один встречает, два перекрывают первый пас.",
                    "One pressures, two cover the first outlet.",
                  )}{" "}
            {m.pendingOrders[side].has(line) && (
              <b>{t("Со следующего выхода.", "Queued for next shift.")}</b>
            )}
          </p>
          {applied && (
            <div className="cd-compare">
              <small>
                {t("Форчек с", "Forecheck since")} {stamp(applied.at)} ·{" "}
                {applied.order}
              </small>
              {comparisons.map((rows, i) => (
                <p key={i}>
                  {i ? t("После", "After") : t("До", "Before")} · {rows.length}{" "}
                  {t("смен", "shifts")} ·{" "}
                  {t("возвраты / выходы соперника", "regains / opponent exits")}{" "}
                  {rows.reduce((n, s) => n + s.recoveries, 0)} /{" "}
                  {rows.reduce((n, s) => n + s.exitsAgainst, 0)}
                </p>
              ))}
            </div>
          )}
        </article>
      )}
      {tab === 1 && (
        <article>
          <div className="cd-filter">
            <select
              aria-label={t("Фильтр звеньев", "Line filter")}
              value={filter}
              onChange={(e) => setFilter(+e.target.value)}
            >
              <option value={-1}>{t("Все звенья", "All lines")}</option>
              {club.lines.map((_, i) => (
                <option value={i} key={i}>
                  L{i + 1}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Период", "Period")}
              value={period}
              onChange={(e) => setPeriod(+e.target.value)}
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <option key={i} value={i}>
                  {i === 0
                    ? t("Весь матч", "Entire game")
                    : i === 4
                      ? "OT"
                      : t("Период ", "Period ") + i}
                </option>
              ))}
            </select>
          </div>
          <div className="cd-stats">
            {[
              [t("Смены", "Shifts"), rows.length],
              [
                t("Броски", "Shots"),
                rows.reduce((a, s) => a + s.shots, 0) +
                  " : " +
                  rows.reduce((a, s) => a + s.against, 0),
              ],
              ["xG", rows.reduce((a, s) => a + s.xg, 0).toFixed(2)],
            ].map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          {!rows.length && (
            <p>
              {t(
                "Смены появятся после выхода пятёрок на лёд.",
                "Shifts appear when the even-strength units take the ice.",
              )}
            </p>
          )}
          <div className="cd-scroll">
            {rows.map((s) => (
              <details key={s.start + "-" + s.line}>
                <summary>
                  <b>L{s.line + 1}</b>
                  <time>
                    {stamp(s.start)} – {stamp(s.end)}
                  </time>
                  <small>
                    {Math.round(s.end - s.start)} {t("с", "s")}
                  </small>
                  <strong>
                    {s.shots} : {s.against}
                  </strong>
                </summary>
                <p>
                  {s.forecheck} · {names[s.plan ?? "auto"]} · {s.xg.toFixed(2)}{" "}
                  xG
                  <br />
                  {t("Возвраты шайбы", "Regains")} {s.recoveries} ·{" "}
                  {t("Выходы соперника", "Opponent exits")} {s.exitsAgainst}
                  {s.opponentLine != null &&
                    s.opponentLine >= 0 &&
                    " · " + foe.id + " L" + (s.opponentLine + 1)}
                </p>
                {s.events
                  .filter((i) => m.clips.has(i))
                  .map((i) => (
                    <button key={i} onClick={() => review(i)}>
                      <Play size={12} />
                      {stamp(m.result.events[i].time)} ·{" "}
                      {m.result.events[i].player}
                    </button>
                  ))}
              </details>
            ))}
          </div>
        </article>
      )}
      {tab === 2 && (
        <article>
          <h4>
            {foe.id} · {t("Тройки соперника", "Opposing lines")}
          </h4>
          <div className="cd-units">
            {foe.lines.map((_, i) => (
              <button
                key={i}
                aria-pressed={vis === i}
                onClick={() => setVis(i)}
              >
                L{i + 1}
              </button>
            ))}
          </div>
          <p>{trios(foe, vis)}</p>
          <h4>
            {club.id} · {t("Ответное звено", "Counter line")}
          </h4>
          {lineup}
          <p>{trios(club, line)}</p>
          {side === 0 ? (
            <>
              <div className="cd-options">
                <button
                  aria-pressed={m.counterLines.get(vis) === line}
                  onClick={() => set(() => m.counterLines.set(vis, line))}
                >
                  {t("Назначить пару", "Assign matchup")} L{line + 1} / L
                  {vis + 1}
                </button>
                <button
                  disabled={!m.counterLines.has(vis)}
                  onClick={() => set(() => m.counterLines.delete(vis))}
                >
                  {t("Автовыбор", "Automatic")}
                </button>
                <button
                  disabled={
                    !m.canMatchHomeLine ||
                    players.length !== 3 ||
                    players.some((p) => p.injury)
                  }
                  onClick={() =>
                    set(() => {
                      m.selectHomeLine(line);
                    })
                  }
                >
                  {t("Выпустить сейчас", "Deploy now")}
                </button>
              </div>
              <p>
                {t(
                  "При вбрасывании 5×5. После своего проброса смена закрыта. Уставшее звено пропустит назначение.",
                  "At eligible even-strength draws. Home icing locks the lineup. Exhausted lines skip the assignment.",
                )}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={pauseDraw}
                  onChange={(e) => setPauseDraw(e.target.checked)}
                />
                {t("Пауза перед выбором звена", "Pause for last change")}
              </label>
            </>
          ) : (
            <p>
              {t("Право последней смены у хозяев.", "Home has last change.")}
            </p>
          )}
          {(m.result.matchups ?? [])
            .filter((r) =>
              side === 0
                ? r.home === line && r.away === vis
                : r.away === line && r.home === vis,
            )
            .map((r) => (
              <p key={r.home + "-" + r.away}>
                {t("Вместе на льду", "Time matched")} {stamp(r.seconds)} ·{" "}
                {t("Броски", "Shots")} {r.shots[side]} : {r.shots[1 - side]}
              </p>
            ))}
        </article>
      )}
    </section>
  );
}
