import { nextClubFixture } from "../engine/careerMatch";
import { autoLines } from "../engine/database";
import { useState } from "react";
import type { Game, Player, ManagementEvent } from "../engine/types";
import {
  focusKey,
  agreeMinutes,
  beginDevelopment,
  projectedPayroll,
  evidenceRange,
  deadlineGroup,
  canDelegate,
  delegateReport,
  type ScoutFocus,
} from "../engine/careerDesk";
import { salaryTotal } from "../engine/contracts";
import { forecastIceTime } from "../engine/iceTime";
type Edit = (fn: (g: Game) => void) => void;
type Props = { game: Game; edit: Edit };
const club = (g: Game) => g.teams.find((x) => x.id === g.user)!;
const focuses: ScoutFocus[] = ["release", "stride", "pressure"];
function focusName(p: Player, k: ScoutFocus, ru: boolean) {
  const labels =
    p.pos === "G"
      ? [
          ["Реакция", "Reflexes"],
          ["Перемещение", "Movement"],
          ["Контроль отскока", "Rebounds"],
        ]
      : [
          ["Бросок", "Release"],
          ["Первый шаг", "First stride"],
          ["Решение под давлением", "Decision under pressure"],
        ];
  return labels[focuses.indexOf(k)][ru ? 0 : 1];
}
export function IceAgreementPanel({
  game,
  edit,
  player: p,
}: Props & { player: Player }) {
  const [target, set] = useState(19),
    [unit, setUnit] = useState(0),
    ru = game.language === "ru";
  const records = game.iceAgreements?.filter((a) => a.player === p.id) ?? [];
  const rostered = club(game).players.some((x) => x.id === p.id);
  if (p.pos === "G" || (!rostered && !records.length)) return null;
  const tr = (r: string, e: string) => (ru ? r : e);
  const forecast = forecastIceTime(club(game)).get(p.id)?.minutes ?? 0;
  const options = [9, 14, 19, 22];
  const closest = options.reduce((a, b) =>
    Math.abs(b - forecast) < Math.abs(a - forecast) ? b : a,
  );
  const active = records.find((a) => a.status === "open");
  const stateName = {
    open: tr("В работе", "Active"),
    kept: tr("Выполнено", "Kept"),
    broken: tr("Нарушено", "Broken"),
    departed: tr("Покинул клуб", "Left club"),
  };
  return (
    <section className="career-decision desk-card agreement">
      <header>
        <small>
          {tr("Личная встреча", "Player meeting")} / {p.name}
        </small>
        <h3>{tr("Обещание игрового времени", "Ice-time agreement")}</h3>
      </header>
      <div className="desk-pair">
        <div>
          <small>{tr("Прогноз по составу", "Lineup projection")}</small>
          <strong>
            {forecast.toFixed(1)} <em>min</em>
          </strong>
        </div>
        <div>
          <small>{tr("Цель на матч", "Target per game")}</small>
          <strong>
            {active?.target ?? target} <em>min</em>
          </strong>
        </div>
      </div>
      {active ? (
        <>
          <p>
            {tr("Сыграно", "Reviewed")} {active.games}/10 ·{" "}
            {active.unit &&
              (p.pos === "D" ? "D" : "L") +
                active.unit +
                " · " +
                (active.roleGames ?? 0) +
                "/8 · "}
            {tr("Нужно в среднем до конца", "Required average from here")}{" "}
            {Math.max(
              0,
              (active.target * 10 - active.minutes) / (10 - active.games),
            ).toFixed(1)}{" "}
            min
          </p>
          <progress value={active.games} max={10} />
          {active.log?.length ? (
            <div className="desk-games">
              {active.log.map((v) => (
                <span key={v.date} title={v.date}>
                  <b>{v.minutes.toFixed(1)}</b>
                  {v.opponent}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        rostered && (
          <>
            <label>
              {tr(
                "Среднее за следующие 10 матчей клуба",
                "Average for next 10 club games",
              )}
            </label>
            <div className="desk-switch">
              {options.map((n) => (
                <button
                  key={n}
                  aria-pressed={n === target}
                  onClick={() => set(n)}
                >
                  {n} min
                </button>
              ))}
            </div>
            <p className="desk-insight">
              {target > forecast + 1
                ? tr(
                    "Для такого обещания придётся увеличить роль игрока.",
                    "This commitment requires a larger role.",
                  )
                : tr(
                    "Текущая расстановка позволяет рассчитывать на эти минуты.",
                    "The current lineup supports this target.",
                  )}{" "}
              {target !== closest && (
                <button onClick={() => set(closest)}>
                  {tr("Ближайшая цель", "Closest target")} · {closest} min
                </button>
              )}
            </p>
            <label>
              {tr("Роль минимум в 8 матчах", "Deployment in at least 8 games")}{" "}
              <select value={unit} onChange={(e) => setUnit(+e.target.value)}>
                <option value={0}>{tr("Только минуты", "Minutes only")}</option>
                {[1, 2].map((n) => (
                  <option key={n} value={n}>
                    {p.pos === "D" ? "D" : "L"}
                    {n}
                    {n === 2 ? tr(" или выше", " or higher") : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="desk-primary"
              onClick={() =>
                edit((g) => agreeMinutes(g, p.id, target, unit || undefined))
              }
            >
              {tr("Дать слово игроку", "Make commitment")}
            </button>
          </>
        )
      )}
      {records
        .filter((a) => a !== active)
        .slice(-4)
        .reverse()
        .map((a) => (
          <details key={a.start}>
            <summary>
              {a.start} · {stateName[a.status]}
            </summary>
            <p>
              {a.minutes.toFixed(1)} min / {a.games} GP · {tr("Цель", "Target")}{" "}
              {a.target} min
            </p>
          </details>
        ))}
    </section>
  );
}
export function Observations({
  p,
  counts = {},
  ru,
  observe,
  available,
}: {
  p: Player;
  counts?: Partial<Record<ScoutFocus, number>>;
  ru: boolean;
  observe: (k: ScoutFocus) => void;
  available: boolean;
}) {
  return (
    <section className="career-decision desk-card scout-dossier">
      <header>
        <small>
          {p.name} · {p.pos}
        </small>
        <h3>{ru ? "Задание на следующий просмотр" : "Next scouting visit"}</h3>
      </header>
      <small>
        {ru
          ? "Один просмотр расходует одно задание скаута и уточняет выбранное качество."
          : "Each visit spends one assignment and narrows the selected estimate."}
      </small>
      {focuses.map((k) => {
        const n = counts[k] ?? 0,
          r = evidenceRange(p, k, n);
        return (
          <div className="career-row" key={k}>
            <div>
              <b>{focusName(p, k, ru)}</b>
              <small>
                {
                  (p.pos === "G"
                    ? ru
                      ? [
                          "Выход один на один",
                          "Смещение от штанги к штанге",
                          "Куда уходит шайба после сейва",
                        ]
                      : [
                          "Breakaway response",
                          "Post-to-post recovery",
                          "Direction of second chances",
                        ]
                    : ru
                      ? [
                          "Время от приёма до выпуска шайбы",
                          "Разгон на первых трёх шагах",
                          "Выход из-под прессинга у борта",
                        ]
                      : [
                          "Catch-to-release timing",
                          "Acceleration over three strides",
                          "Puck exit under board pressure",
                        ])[focuses.indexOf(k)]
                }
              </small>
            </div>
            <span>
              <i className="scout-range">
                {r && (
                  <i
                    style={{ left: r[0] + "%", width: r[1] - r[0] + 1 + "%" }}
                  />
                )}
              </i>
              {r
                ? r.join("–") + " · " + n + "/3"
                : ru
                  ? "Нет наблюдений"
                  : "Unobserved"}
            </span>
            <button disabled={!available || n >= 3} onClick={() => observe(k)}>
              {ru ? "Посмотреть" : "Observe"}
            </button>
          </div>
        );
      })}
    </section>
  );
}
export function DevelopmentDesk({ game: g, edit }: Props) {
  const t = club(g),
    ru = g.language === "ru",
    eligible = [...(t.farm ?? []), ...t.players].filter((p) => p.age <= 25);
  const [id, choose] = useState(""),
    [focus, setFocus] = useState<ScoutFocus>("stride"),
    [error, setError] = useState("");
  const p = eligible.find((p) => p.id === id) ?? eligible[0];
  if (!p) return null;
  const plan = g.developmentPlans?.filter((a) => a.player === p.id).at(-1);
  const nhl = t.players.includes(p),
    forecastTeam = nhl ? t : { ...t, players: [...t.players, p] };
  if (!nhl) autoLines(forecastTeam);
  const forecast = forecastIceTime(forecastTeam).get(p.id);
  const peer = t.players
    .filter((x) => x.pos === p.pos && x.id !== p.id)
    .sort((a, b) => Math.abs(a.ovr - p.ovr) - Math.abs(b.ovr - p.ovr))[0];
  function start(league: "NHL" | "AHL") {
    edit((game) => {
      try {
        beginDevelopment(game, p.id, league, focus);
        setError("");
      } catch (e) {
        setError(String((e as Error).message));
      }
    });
  }
  return (
    <section className="career-decision desk-card dev-plan">
      <header>
        <small>
          {p.name} · {p.pos} · {p.age}
        </small>
        <h3>
          {ru
            ? "Индивидуальный план на 30 дней"
            : "30-day development assignment"}
        </h3>
      </header>
      <select
        aria-label={ru ? "Выбор проспекта" : "Development prospect"}
        value={p.id}
        onChange={(e) => {
          choose(e.target.value);
          setError("");
        }}
      >
        {eligible.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name} · {x.pos} · {x.age}
          </option>
        ))}
      </select>
      <div className="desk-pair">
        <div>
          <small>NHL · {ru ? "Прогноз в основе" : "Projected usage"}</small>
          <strong>
            {p.pos === "G"
              ? forecastTeam.goalie === p.id
                ? "G1"
                : "G2"
              : (forecast?.minutes ?? 0).toFixed(1) + " min"}
          </strong>
          <span>
            {peer
              ? peer.name + " · " + peer.ovr + " OVR"
              : ru
                ? "Место свободно"
                : "No positional rival"}
          </span>
        </div>
        <div>
          <small>AHL · {ru ? "План нагрузки" : "Projected usage"}</small>
          <strong>{p.pos === "G" ? "2 / 3" : "19 min"}</strong>
          <span>
            {p.pos === "G"
              ? ru
                ? "Стартов по плану"
                : "Planned starts"
              : ru
                ? "Ведущее звено и большинство"
                : "Top unit and power play"}
          </span>
        </div>
      </div>
      <p className="desk-insight">
        {ru ? "Рекомендация тренера" : "Coach recommendation"} ·{" "}
        <b>{peer && p.ovr + 2 < peer.ovr ? "AHL" : "NHL"}</b> · {p.name} {p.ovr}{" "}
        OVR{peer && " / " + peer.name + " " + peer.ovr}
      </p>
      {plan && (
        <progress
          aria-label={ru ? "Дни плана" : "Plan days"}
          max={30}
          value={Math.max(
            0,
            Math.min(
              30,
              (Date.parse(g.calendar?.date ?? plan.start) -
                Date.parse(plan.start)) /
                86400000,
            ),
          )}
        />
      )}
      {plan && (
        <div className="dev-review">
          <div>
            <small>{ru ? "Период работы" : "Review window"}</small>
            <b>
              {plan.start} → {plan.due}
            </b>
          </div>
          <div>
            <small>
              {focusName(
                p,
                focuses.find((f) => focusKey(p, f) === plan.focus) ?? "stride",
                ru,
              )}
            </small>
            <b>
              {plan.baseline} → {p.attributes[plan.focus]}
            </b>
          </div>
          <div>
            <small>
              {plan.league} · {ru ? "Практика" : "Workload"}
            </small>
            <b>
              {plan.games} GP · {plan.minutes.toFixed(0)} min
            </b>
          </div>
          {plan.outcome && (
            <strong>
              {plan.outcome === "compete"
                ? ru
                  ? "Готов конкурировать за место"
                  : "Ready to compete"
                : ru
                  ? "Продолжить развитие"
                  : "Continue development"}
            </strong>
          )}
        </div>
      )}
      {(!plan || plan.outcome) && (
        <>
          <select
            aria-label={ru ? "Цель развития" : "Development focus"}
            value={focus}
            onChange={(e) => setFocus(e.target.value as ScoutFocus)}
          >
            {focuses.map((k) => (
              <option value={k} key={k}>
                {focusName(p, k, ru)}
              </option>
            ))}
          </select>
          <button
            disabled={!nhl && p.contractType === "AHL"}
            onClick={() => start("NHL")}
          >
            {ru ? "План NHL" : "NHL assignment"}
          </button>
          <button onClick={() => start("AHL")}>
            {ru ? "План AHL" : "AHL assignment"}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function CapStudio({ game: g }: { game: Game }) {
  const t = club(g),
    ru = g.language === "ru";
  const [source, sourceSet] = useState("farm"),
    [inId, setIn] = useState(""),
    [out, setOut] = useState(""),
    [ext, setExt] = useState(""),
    [aav, setAav] = useState(2),
    [years, setYears] = useState(2),
    [returnId, setReturn] = useState("");
  const returning = t.players.find((p) => p.id === returnId && p.injury > 0);
  const pool =
    source === "farm"
      ? (t.farm ?? [])
      : (g.teams.find((x) => x.id === source)?.players ?? []);
  const add = pool.find((x) => x.id === inId),
    next = projectedPayroll(t, add, out, ext, aav, years,returnId),
    base = projectedPayroll(t, undefined, "", "", 0);
  const [bookmark, save] = useState<typeof next>();
  const options = (ps: Player[]) =>
    ps.map((p) => (
      <option key={p.id} value={p.id}>
        {p.name} · {p.pos} · ${p.salary.toFixed(2)}M
      </option>
    ));
  return (
    <section className="career-decision desk-card cap-studio">
      <header>
        <small>
          {t.id} · {g.year}/{String(g.year + 1).slice(-2)}
        </small>
        <h3>{ru ? "Лаборатория потолка зарплат" : "Salary cap studio"}</h3>
      </header>
      <div className="desk-pair">
        {(["today", "summer"] as const).map((k) => (
          <div key={k}>
            <small>
              {k === "today"
                ? ru
                  ? "Запас сегодня"
                  : "Room today"
                : ru
                  ? "Запас летом"
                  : "Summer room"}
            </small>
            <strong className={next[k] > g.rules.cap ? "desk-negative" : ""}>
              ${(g.rules.cap - next[k]).toFixed(2)}
              <em>M</em>
            </strong>
            <progress
              max={g.rules.cap}
              value={Math.min(g.rules.cap, next[k])}
            />
            <span>
              {ru ? "Лимит" : "Cap"} ${g.rules.cap}M
            </span>
          </div>
        ))}
      </div>
      <div className="career-fields">
        <label>
          {ru ? "Откуда приходит игрок" : "Incoming source"}
          <select
            value={source}
            onChange={(e) => {
              sourceSet(e.target.value);
              setIn("");
            }}
          >
            <option value="farm">AHL</option>
            {g.teams
              .filter((x) => x !== t)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id}
                </option>
              ))}
          </select>
        </label>
        <label>
          {ru ? "Вызов или приобретение" : "Recall or acquisition"}
          <select value={inId} onChange={(e) => setIn(e.target.value)}>
            <option value="">—</option>
            {options(pool)}
          </select>
        </label>
        <label>
          {ru ? "Уходит или отправлен в фарм" : "Trade out or assign down"}
          <select
            value={out}
            onChange={(e) => {
              setOut(e.target.value);
              if (ext === e.target.value) setExt("");
            }}
          >
            <option value="">—</option>
            {options(t.players)}
          </select>
        </label>
        <label>
          {ru ? "Продление истекающего контракта" : "Extend expiring contract"}
          <select value={ext} onChange={(e) => setExt(e.target.value)}>
            <option value="">—</option>
            {options(t.players.filter((p) => p.years <= 1 && p.id !== out))}
          </select>
        </label>
        {ext && (
          <label>
            {ru ? "Срок продления" : "Extension term"}
            <select value={years} onChange={(e) => setYears(+e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option value={n} key={n}>
                  {n}
                </option>
              ))}
            </select>
            AAV · $M
            <input
              type="number"
              min=".8"
              step=".1"
              value={aav}
              onChange={(e) => setAav(Math.max(0.8, Number(e.target.value)))}
            />
          </label>
        )}
      </div>
      <div className="desk-actions">
        <button onClick={() => save({ ...next })}>
          {ru ? "Зафиксировать для сравнения" : "Pin projection"}
        </button>
        <button
          onClick={() => {
            sourceSet("farm");
            setIn("");
            setOut("");
            setExt("");
            setReturn("");
            setAav(2);
            setYears(2);
          }}
        >
          {ru ? "Сбросить сценарий" : "Reset projection"}
        </button>
      </div>
      {bookmark && (
        <p className="desk-insight">
          {ru
            ? "Изменение расходов с момента фиксации"
            : "Change in spending since pinning"}{" "}
          ·{" "}
          {(["today", "summer"] as const).map((k) => (
            <span key={k}>
              {k === "today"
                ? ru
                  ? "Сейчас"
                  : "Today"
                : ru
                  ? "Лето"
                  : "Summer"}{" "}
              {next[k] >= bookmark[k] ? "+" : ""}
              {(next[k] - bookmark[k]).toFixed(2)}M　
            </span>
          ))}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th></th>
            <th>{ru ? "Ведомость сейчас" : "Current payroll"}</th>
            <th>{ru ? "После решения" : "Projected"}</th>
            <th>{ru ? "Под потолком" : "Room"}</th>
          </tr>
        </thead>
        <tbody>
          {(["today", "summer"] as const).map((k) => (
            <tr key={k}>
              <th>
                {k === "today"
                  ? ru
                    ? "Сегодня"
                    : "Today"
                  : ru
                    ? "Следующее лето"
                    : "Next summer"}
              </th>
              <td>{base[k].toFixed(2)}</td>
              <td>{next[k].toFixed(2)}</td>
              <td>{(g.rules.cap - next[k]).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small>
        {ru
          ? "Миллионы долларов, при текущем потолке. Летом учитываются подписанные обязательства."
          : "USD millions at the current cap. Summer includes signed commitments."}
      </small>
      {t.players.some((p) => p.injury > 0) && (
        <details>
          <summary>
            {ru ? "Возвращение из лазарета" : "Activate an injured player"}
          </summary>
          <label>
            {ru ? "Возвращается в состав" : "Returning player"}{" "}
            <select
              value={returnId}
              onChange={(e) => setReturn(e.target.value)}
            >
              <option value="">—</option>
              {options(t.players.filter((p) => p.injury > 0))}
            </select>
          </label>
          {returning && (
            <>
              <p>
                {returning.name} · ${returning.salary.toFixed(2)}M ·{" "}
                {returning.injuryStatus==="LTIR"?(ru?"При возвращении льгота LTIR снимается.":"LTIR relief ends on activation."):ru
                  ? "Уже учтён под потолком. Варианты освобождения места на его позиции"
                  : "Already counts against the cap. Positional options to free a spot"}
              </p>
              {t.players
                .filter(
                  (x) =>
                    x.id !== returnId && x.pos === returning.pos && !x.injury,
                )
                .sort((a, b) => a.ovr - b.ovr)
                .slice(0, 4)
                .map((x) => (
                  <button
                    key={x.id}
                    onClick={() => {
                      setOut(x.id);
                      if (ext === x.id) setExt("");
                    }}
                  >
                    {x.name} · +${x.salary.toFixed(2)}M
                  </button>
                ))}
            </>
          )}
        </details>
      )}
    </section>
  );
}
export function InboxWork({
  game: g,
  edit,
  event: e,
}: Props & { event: ManagementEvent }) {
  const [compare, show] = useState(false),
    t = club(g),
    ru = g.language === "ru",
    p = t.players.find((p) => p.id === e.playerId);
  const group = deadlineGroup(
    e,
    g.calendar!.date,
    e.requiresResponse || e.priority === "high"
      ? nextClubFixture(g)?.date === g.calendar!.date
      : false,
  );
  const roleFit = (x: Player) =>
    x.ovr + (x.archetype && x.archetype === p?.archetype ? 5 : 0);
  const peers = p
    ? [...t.players, ...(t.farm ?? [])]
        .filter((x) => x.id !== p.id && !x.injury && x.pos === p.pos)
        .sort((a, b) => roleFit(b) - roleFit(a))
        .slice(0, 5)
    : [];
  return (
    <div className="career-task">
      <small>
        {
          [
            ru ? "К решению сегодня" : "Due today",
            ru ? "Ближайшие решения" : "Upcoming decisions",
            ru ? "Сводка" : "Briefing",
            ru ? "Закрыто" : "Closed",
          ][group]
        }{" "}
        {e.responseDue && " · " + e.responseDue}
      </small>
      {canDelegate(e) && (
        <button onClick={() => edit((game) => delegateReport(game, e.id))}>
          {ru ? "Поручить разбор помощнику" : "Delegate report"}
        </button>
      )}
      {e.assistantReviewed && (
        <small>{ru ? "Разобрал помощник" : "Reviewed by assistant"}</small>
      )}
      {e.category === "medical" && p && (
        <>
          <button aria-expanded={compare} onClick={() => show(!compare)}>
            {ru ? "Сравнить замены" : "Compare replacements"} · {p.pos}
          </button>
          {compare && (
            <div>
              <p>
                {p.name} · {p.archetype} · {p.ovr} OVR
              </p>
              {peers.map((x) => (
                <p key={x.id}>
                  {x.name} · {x.archetype} · {x.ovr} OVR ·{" "}
                  {t.players.includes(x)
                    ? "NHL"
                    : x.contractType === "AHL"
                      ? "AHL"
                      : salaryTotal(t) + x.salary > g.rules.cap
                        ? ru
                          ? "Выше потолка"
                          : "Over cap"
                        : ru
                          ? "Доступен вызов"
                          : "Recall option"}
                </p>
              ))}
              {!peers.length && (
                <p>
                  {ru
                    ? "Нет здоровых кандидатов этой позиции"
                    : "No healthy positional replacements"}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
