import { useState, type DragEvent } from "react";
import {
  CalendarDays,
  ClipboardList,
  Dumbbell,
  Gauge,
  GripVertical,
  HeartPulse,
  Lightbulb,
  Moon,
  Shield,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  Target,
  TriangleAlert,
  Users,
  WandSparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  Game,
  Player,
  Team,
  TrainingDayPlan,
  TrainingSchedule,
  TrainingSession,
} from "../engine/types";
import {
  balancedWeek,
  ensureTrainingSchedule,
  readiness,
  recoveryValue,
  skillFocus,
  trainingLoad,
} from "../engine/training";
import { addDays, fixtureDate, gameDate } from "../engine/management";
import { Panel, Rating } from "./components";
import { ClubLink, PlayerLink } from "./links";
import { ATTRIBUTE_NAMES } from "./PlayerCard";

type Period = "morning" | "afternoon";
type Intensity = TrainingSchedule["intensity"];

interface SessionInfo {
  ru: string;
  en: string;
  shortRu: string;
  shortEn: string;
  Icon: LucideIcon;
  color: string;
  group: "recovery" | "team" | "technical" | "physical";
}

export const SESSIONS: Record<TrainingSession, SessionInfo> = {
  rest: {
    ru: "Полный отдых",
    en: "Full rest",
    shortRu: "Отдых",
    shortEn: "Rest",
    Icon: Moon,
    color: "#7c8a99",
    group: "recovery",
  },
  recovery: {
    ru: "Восстановление",
    en: "Recovery",
    shortRu: "Восст.",
    shortEn: "Recovery",
    Icon: HeartPulse,
    color: "#3fbfa7",
    group: "recovery",
  },
  teamwork: {
    ru: "Командная игра",
    en: "Teamwork",
    shortRu: "Команда",
    shortEn: "Teamwork",
    Icon: Users,
    color: "#4aa8e0",
    group: "team",
  },
  tactical: {
    ru: "Тактическая подготовка",
    en: "Tactical",
    shortRu: "Тактика",
    shortEn: "Tactics",
    Icon: ClipboardList,
    color: "#7d8cf0",
    group: "team",
  },
  offense: {
    ru: "Атака",
    en: "Attacking",
    shortRu: "Атака",
    shortEn: "Attack",
    Icon: Target,
    color: "#f08a4b",
    group: "technical",
  },
  defense: {
    ru: "Оборона",
    en: "Defending",
    shortRu: "Оборона",
    shortEn: "Defence",
    Icon: Shield,
    color: "#5c93c9",
    group: "technical",
  },
  skills: {
    ru: "Индивидуальная техника",
    en: "Individual skills",
    shortRu: "Техника",
    shortEn: "Skills",
    Icon: Sparkles,
    color: "#e2c14a",
    group: "technical",
  },
  goalie: {
    ru: "Вратарская группа",
    en: "Goalkeeping",
    shortRu: "Вратари",
    shortEn: "Goalies",
    Icon: ShieldCheck,
    color: "#b07ae6",
    group: "technical",
  },
  conditioning: {
    ru: "Физическая подготовка",
    en: "Conditioning",
    shortRu: "Физика",
    shortEn: "Fitness",
    Icon: Dumbbell,
    color: "#e5596b",
    group: "physical",
  },
};
const ORDER = Object.keys(SESSIONS) as TrainingSession[];
const GROUPS: [SessionInfo["group"], string, string, string][] = [
  ["recovery", "Восстановление", "Recovery", "#3fbfa7"],
  ["team", "Команда и тактика", "Team & tactics", "#6f9cf0"],
  ["technical", "Техника", "Technical", "#f0a24b"],
  ["physical", "Физика", "Physical", "#e5596b"],
];

/** 0 (rest) … 4 (very demanding), derived from the engine's recovery table. */
export function sessionLoad(session: TrainingSession) {
  const value = recoveryValue[session];
  return value >= 8 ? 0 : value >= 7 ? 1 : value >= 3 ? 2 : value >= 1 ? 3 : 4;
}
const intensityShift = (intensity: Intensity) =>
  intensity === "low" ? 4 : intensity === "high" ? -4 : 0;
/** Fatigue change of one day of the plan (negative = players recover). */
export function dayFatigue(day: TrainingDayPlan, intensity: Intensity) {
  return -(
    recoveryValue[day.morning] +
    recoveryValue[day.afternoon] +
    intensityShift(intensity)
  );
}
/** 0–100 strain of a day for the workload bar. */
function dayStrain(day: TrainingDayPlan, intensity: Intensity) {
  return Math.max(
    0,
    Math.min(100, Math.round(((dayFatigue(day, intensity) + 20) / 24) * 100)),
  );
}

interface CalendarDay {
  index: number;
  offset: number;
  date: string;
  opponent?: string;
  home?: boolean;
  preseason?: boolean;
  developmentDay: boolean;
}

/** The plan's seven slots laid out on the real calendar, starting today. */
function calendarDays(game: Game, team: Team): CalendarDay[] {
  const today = gameDate(game);
  const ticks = team.trainingTicks ?? 0;
  const userFixtures = game.schedule
    .filter((f) => !f.result && [f.home, f.away].includes(game.user))
    .slice(0, 6)
    .map((f) => ({ fixture: f, date: fixtureDate(game, f.round) }));
  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(today, offset);
    const regular =
      game.phase === "regular"
        ? userFixtures.find((item) => item.date === date)?.fixture
        : undefined;
    const pre = game.preseasonFixtures?.find(
      (f) => f.date === date && !f.result && [f.home, f.away].includes(game.user),
    );
    const match = regular ?? pre;
    return {
      index: (ticks + offset) % 7,
      offset,
      date,
      opponent: match
        ? match.home === game.user
          ? match.away
          : match.home
        : undefined,
      home: match ? match.home === game.user : undefined,
      preseason: !!pre && !regular,
      // trainTeam develops players on every sixth training tick.
      developmentDay: (ticks + offset + 1) % 6 === 0,
    };
  });
}

type Preset = "balanced" | "game-week" | "recovery" | "development" | "tactical";

function presetPlan(preset: Preset, days: CalendarDay[]): TrainingSchedule {
  if (preset === "balanced") return structuredClone(balancedWeek);
  const plan: TrainingDayPlan[] = Array.from({ length: 7 }, () => ({
    morning: "rest" as TrainingSession,
    afternoon: "rest" as TrainingSession,
  }));
  const byOffset = [...days].sort((a, b) => a.offset - b.offset);
  const rotations: Record<Exclude<Preset, "balanced" | "game-week">, TrainingDayPlan[]> = {
    recovery: [
      { morning: "recovery", afternoon: "rest" },
      { morning: "recovery", afternoon: "teamwork" },
      { morning: "rest", afternoon: "rest" },
      { morning: "tactical", afternoon: "recovery" },
      { morning: "recovery", afternoon: "goalie" },
      { morning: "teamwork", afternoon: "recovery" },
      { morning: "rest", afternoon: "rest" },
    ],
    development: [
      { morning: "skills", afternoon: "offense" },
      { morning: "defense", afternoon: "skills" },
      { morning: "recovery", afternoon: "goalie" },
      { morning: "offense", afternoon: "conditioning" },
      { morning: "skills", afternoon: "defense" },
      { morning: "recovery", afternoon: "teamwork" },
      { morning: "rest", afternoon: "rest" },
    ],
    tactical: [
      { morning: "tactical", afternoon: "teamwork" },
      { morning: "tactical", afternoon: "defense" },
      { morning: "recovery", afternoon: "tactical" },
      { morning: "teamwork", afternoon: "offense" },
      { morning: "tactical", afternoon: "goalie" },
      { morning: "recovery", afternoon: "teamwork" },
      { morning: "rest", afternoon: "rest" },
    ],
  };
  if (preset !== "game-week") {
    byOffset.forEach((day, i) => (plan[day.index] = { ...rotations[preset][i] }));
    return {
      intensity:
        preset === "recovery" ? "low" : preset === "development" ? "high" : "normal",
      days: plan,
    };
  }
  // Game week: build around the real fixtures of the next seven days.
  const work: TrainingDayPlan[] = [
    { morning: "offense", afternoon: "skills" },
    { morning: "defense", afternoon: "goalie" },
    { morning: "conditioning", afternoon: "teamwork" },
    { morning: "skills", afternoon: "defense" },
  ];
  let w = 0;
  byOffset.forEach((day, i) => {
    const prev = byOffset[i - 1];
    const next = byOffset[i + 1];
    if (day.opponent) plan[day.index] = { morning: "tactical", afternoon: "rest" };
    else if (prev?.opponent)
      plan[day.index] = { morning: "recovery", afternoon: "recovery" };
    else if (next?.opponent)
      plan[day.index] = { morning: "tactical", afternoon: "teamwork" };
    else plan[day.index] = { ...work[w++ % work.length] };
  });
  if (!byOffset.some((d) => !d.opponent && plan[d.index].morning === "rest")) {
    const free = byOffset.find(
      (d) => !d.opponent && !byOffset[d.offset + 1]?.opponent && d.offset > 0,
    );
    if (free) plan[free.index] = { morning: "rest", afternoon: "rest" };
  }
  return { intensity: "normal", days: plan };
}

const PRESETS: [Preset, string, string, string, string, LucideIcon][] = [
  ["game-week", "Матчевая неделя", "Game week", "Подводка к ближайшим матчам", "Built around upcoming fixtures", CalendarDays],
  ["balanced", "Сбалансированный", "Balanced", "Стандарт штаба", "Staff default", Gauge],
  ["recovery", "Неделя восстановления", "Recovery week", "Снять усталость", "Clear fatigue", HeartPulse],
  ["development", "Фокус на развитии", "Development focus", "Техника и рост молодёжи", "Skills and youth growth", Sprout],
  ["tactical", "Тактический сбор", "Tactical camp", "Система и сыгранность", "System and cohesion", ClipboardList],
];

interface Advice {
  tone: "warn" | "info" | "good";
  text: string;
  action?: string;
  apply?: (schedule: TrainingSchedule) => void;
}

export function TrainingCenter({
  game,
  edit,
}: {
  game: Game;
  edit: (fn: (game: Game) => void) => void;
}) {
  const ru = game.language === "ru";
  const tr = (a: string, b: string) => (ru ? a : b);
  const team = game.teams.find((club) => club.id === game.user)!;
  const schedule = ensureTrainingSchedule(team);
  const load = trainingLoad(team);
  const ready = readiness(team);
  const days = calendarDays(game, team);
  const [dragOver, setDragOver] = useState<string>();
  const [armed, setArmed] = useState<TrainingSession>();

  const change = (fn: (schedule: TrainingSchedule) => void) =>
    edit((current) =>
      fn(
        ensureTrainingSchedule(
          current.teams.find((club) => club.id === current.user)!,
        ),
      ),
    );
  const setSession = (day: number, period: Period, value: TrainingSession) =>
    change((s) => {
      s.days[day][period] = value;
    });

  const onDrop = (event: DragEvent, day: number, period: Period) => {
    event.preventDefault();
    setDragOver(undefined);
    const data = event.dataTransfer.getData("text/plain");
    if (data.startsWith("session:"))
      setSession(day, period, data.slice(8) as TrainingSession);
    else if (data.startsWith("slot:")) {
      const [, fromDay, fromPeriod] = data.split(":");
      const from = { day: +fromDay, period: fromPeriod as Period };
      if (from.day === day && from.period === period) return;
      change((s) => {
        const a = s.days[from.day][from.period];
        s.days[from.day][from.period] = s.days[day][period];
        s.days[day][period] = a;
      });
    }
  };

  // ---- Program balance -------------------------------------------------
  const all = schedule.days.flatMap((d) => [d.morning, d.afternoon]);
  const counts = Object.fromEntries(
    ORDER.map((s) => [s, all.filter((x) => x === s).length]),
  ) as Record<TrainingSession, number>;
  const focus = new Map<string, number>();
  for (const session of all)
    for (const key of skillFocus[session] ?? [])
      focus.set(key, (focus.get(key) ?? 0) + 1);
  const focusList = [...focus.entries()].sort((a, b) => b[1] - a[1]);

  // ---- Players most affected ------------------------------------------
  const lineup = new Set([
    ...team.lines.flat(),
    ...team.defense.flat(),
    team.goalie,
  ]);
  const tiredList = [...team.players]
    .filter((p) => p.fatigue >= 12 || p.injury > 0)
    .sort((a, b) => b.injury - a.injury || b.fatigue - a.fatigue)
    .slice(0, 7);
  const developing = [...team.players]
    .filter((p) => p.age < 31 && p.ovr < p.potential)
    .sort(
      (a, b) =>
        a.age - b.age || b.potential - b.ovr - (a.potential - a.ovr),
    )
    .slice(0, 7);
  // Fill the watch list with the youngest players when few are still growing.
  for (const p of [...team.players].sort((a, b) => a.age - b.age))
    if (developing.length < 6 && !developing.includes(p)) developing.push(p);
  const nextDevelopment = days.find((d) => d.developmentDay);
  const devSessions = nextDevelopment
    ? [
        schedule.days[nextDevelopment.index].morning,
        schedule.days[nextDevelopment.index].afternoon,
      ]
    : [];
  const devFocus = (p: Player) => {
    const keys = devSessions.flatMap((s) => skillFocus[s] ?? []);
    const goalieKeys = ["reflexes", "goaliePosition", "reboundControl", "stamina", "durability"];
    return [
      ...new Set(
        p.pos === "G"
          ? keys.filter((k) => goalieKeys.includes(k))
          : keys.filter((k) => !["reflexes", "goaliePosition", "reboundControl"].includes(k)),
      ),
    ].slice(0, 3);
  };

  // ---- Staff recommendations ------------------------------------------
  const dateLabel = (date: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString(ru ? "ru-RU" : "en-GB", {
      timeZone: "UTC",
      ...opts,
    });
  const dayName = (d: CalendarDay) =>
    d.offset === 0
      ? tr("сегодня", "today")
      : d.offset === 1
        ? tr("завтра", "tomorrow")
        : dateLabel(d.date, { weekday: "long" });
  const advice: Advice[] = [];
  const hardest = [...days]
    .slice(0, 4)
    .sort(
      (a, b) =>
        dayStrain(schedule.days[b.index], schedule.intensity) -
        dayStrain(schedule.days[a.index], schedule.intensity),
    )[0];
  if (ready.tired.length >= 4 || load > 75) {
    const target = hardest;
    const plan = schedule.days[target.index];
    const heavy: Period =
      recoveryValue[plan.morning] <= recoveryValue[plan.afternoon]
        ? "morning"
        : "afternoon";
    advice.push({
      tone: "warn",
      text: tr(
        `${ready.tired.length} игроков звеньев устали, нагрузка недели ${load}%. Замените «${SESSIONS[plan[heavy]].ru}» (${dayName(target)}) на восстановление.`,
        `${ready.tired.length} lineup players are tired and weekly load is ${load}%. Swap “${SESSIONS[plan[heavy]].en}” (${dayName(target)}) for recovery.`,
      ),
      action: tr("Добавить восстановление", "Add recovery"),
      apply: (s) => {
        s.days[target.index][heavy] = "recovery";
      },
    });
  }
  if (schedule.intensity === "high" && ready.condition < 85)
    advice.push({
      tone: "warn",
      text: tr(
        `Готовность состава ${ready.condition}% при высокой интенсивности — растёт риск травм.`,
        `Squad condition is ${ready.condition}% on high intensity — injury risk is rising.`,
      ),
      action: tr("Нормальная интенсивность", "Set normal intensity"),
      apply: (s) => {
        s.intensity = "normal";
      },
    });
  const matchDays = days.filter((d) => d.opponent);
  for (const day of matchDays.slice(0, 2)) {
    const plan = schedule.days[day.index];
    if (sessionLoad(plan.morning) + sessionLoad(plan.afternoon) > 3)
      advice.push({
        tone: "warn",
        text: tr(
          `Матч против ${day.opponent} ${dayName(day)}, а в плане тяжёлые занятия. Оставьте лёгкую тактику и отдых.`,
          `Game vs ${day.opponent} ${dayName(day)} but the plan is demanding. Keep it to light tactics and rest.`,
        ),
        action: tr("Облегчить игровой день", "Lighten game day"),
        apply: (s) => {
          s.days[day.index] = { morning: "tactical", afternoon: "rest" };
        },
      });
  }
  if (!schedule.days.some((d) => d.morning === "rest" && d.afternoon === "rest")) {
    const free = [...days].reverse().find((d) => !d.opponent);
    if (free)
      advice.push({
        tone: "info",
        text: tr(
          "В неделе нет полного выходного — моральный и физический ресурс восстанавливается хуже.",
          "There is no full day off this week — players recover physically and mentally worse.",
        ),
        action: tr(`Выходной: ${dayName(free)}`, `Day off: ${dayName(free)}`),
        apply: (s) => {
          s.days[free.index] = { morning: "rest", afternoon: "rest" };
        },
      });
  }
  if (nextDevelopment && devSessions.every((s) => !skillFocus[s]) && !nextDevelopment.opponent)
    advice.push({
      tone: "info",
      text: tr(
        `Ближайший день прогресса (${dayName(nextDevelopment)}) пройдёт без профильных занятий — молодые игроки не получат прибавку атрибутов.`,
        `The next development day (${dayName(nextDevelopment)}) has no focused sessions — young players will not gain attributes.`,
      ),
      action: tr("Поставить технику", "Schedule skills"),
      apply: (s) => {
        s.days[nextDevelopment.index] = { morning: "skills", afternoon: "offense" };
      },
    });
  if (counts.goalie === 0) {
    const free = days.find((d) => !d.opponent && d.offset > 0) ?? days[0];
    advice.push({
      tone: "info",
      text: tr(
        "Нет ни одной вратарской сессии: вратари не развивают реакцию и позицию.",
        "No goalkeeping session: goalies are not developing reflexes and positioning.",
      ),
      action: tr("Добавить вратарей", "Add goalie session"),
      apply: (s) => {
        s.days[free.index].afternoon = "goalie";
      },
    });
  }
  if (load < 40 && ready.condition >= 92 && schedule.intensity !== "high")
    advice.push({
      tone: "info",
      text: tr(
        "Команда свежая, а нагрузка низкая — можно поднять интенсивность ради развития.",
        "The squad is fresh and load is low — you can raise intensity for development.",
      ),
      action: tr("Высокая интенсивность", "High intensity"),
      apply: (s) => {
        s.intensity = "high";
      },
    });
  if (!advice.length)
    advice.push({
      tone: "good",
      text: tr(
        "План сбалансирован: нагрузка, восстановление и развитие в норме. Перед плотной серией матчей снизьте интенсивность.",
        "The plan is balanced: load, recovery and development are fine. Lower intensity before a dense run of games.",
      ),
    });

  const loadTone = load > 75 ? "high" : load < 40 ? "low" : "normal";

  return (
    <div className="training-hub tc">
      <div className="page-intro tc-intro">
        <div>
          <span className="eyebrow">PERFORMANCE DEPARTMENT</span>
          <h1>{tr("Недельный план тренировок", "Weekly training plan")}</h1>
          <p>
            {tr(
              "Перетаскивайте занятия из библиотеки или меняйте их кликом. План повторяется каждые 7 дней.",
              "Drag sessions from the library or click a slot to change it. The plan repeats every 7 days.",
            )}
          </p>
        </div>
        <div className={`tc-load load-${loadTone}`}>
          <svg viewBox="0 0 120 70" aria-hidden="true">
            <path d="M10 62a50 50 0 0 1 100 0" className="track" />
            <path
              d="M10 62a50 50 0 0 1 100 0"
              className="value"
              style={{ strokeDasharray: `${(load / 100) * 157} 157` }}
            />
          </svg>
          <b>{load}%</b>
          <small>{tr("НАГРУЗКА НЕДЕЛИ", "WEEKLY LOAD")}</small>
          <span>
            {load > 75
              ? tr("Высокий риск усталости", "High fatigue risk")
              : load < 40
                ? tr("Низкая интенсивность", "Low intensity")
                : tr("Сбалансировано", "Balanced")}
          </span>
        </div>
      </div>

      <section className="tc-strip">
        <div>
          <small>{tr("ГОТОВНОСТЬ СОСТАВА", "SQUAD CONDITION")}</small>
          <b>{ready.condition}%</b>
          <i className="tc-bar">
            <em
              className={ready.condition >= 85 ? "good" : ready.condition >= 72 ? "fair" : "poor"}
              style={{ width: `${ready.condition}%` }}
            />
          </i>
        </div>
        <div>
          <small>{tr("УСТАВШИЕ", "TIRED")}</small>
          <b className={ready.tired.length >= 4 ? "warn" : ""}>{ready.tired.length}</b>
          <span>{tr("в звеньях, усталость 25+", "in lineup, fatigue 25+")}</span>
        </div>
        <div>
          <small>{tr("ТРАВМИРОВАННЫЕ", "INJURED")}</small>
          <b className={ready.injured.length ? "warn" : ""}>{ready.injured.length}</b>
          <span>{tr("только медицинская программа", "medical programme only")}</span>
        </div>
        <div>
          <small>{tr("ДЕНЬ ПРОГРЕССА", "DEVELOPMENT DAY")}</small>
          <b>{nextDevelopment ? dateLabel(nextDevelopment.date, { day: "numeric", month: "short" }) : "—"}</b>
          <span>{tr("каждый 6-й тренировочный день", "every 6th training day")}</span>
        </div>
        <div className="tc-intensity">
          <small>{tr("ОБЩАЯ ИНТЕНСИВНОСТЬ", "OVERALL INTENSITY")}</small>
          <div role="radiogroup" aria-label="Training intensity">
            {(["low", "normal", "high"] as Intensity[]).map((value) => (
              <button
                key={value}
                role="radio"
                aria-checked={schedule.intensity === value}
                className={`lvl-${value} ${schedule.intensity === value ? "active" : ""}`}
                onClick={() =>
                  change((s) => {
                    s.intensity = value;
                  })
                }
              >
                {value === "low"
                  ? tr("Низкая", "Low")
                  : value === "normal"
                    ? tr("Норма", "Normal")
                    : tr("Высокая", "High")}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="tc-presets">
        <span className="tc-presets-label">
          <WandSparkles size={14} /> {tr("ШАБЛОНЫ", "PRESETS")}
        </span>
        {PRESETS.map(([key, nameRu, nameEn, aboutRu, aboutEn, Icon]) => (
          <button
            key={key}
            className="tc-preset"
            onClick={() =>
              change((s) => {
                const next = presetPlan(key, days);
                s.intensity = next.intensity;
                s.days = next.days;
              })
            }
          >
            <Icon size={16} />
            <span>
              <b>{ru ? nameRu : nameEn}</b>
              <small>{ru ? aboutRu : aboutEn}</small>
            </span>
          </button>
        ))}
      </div>

      <Panel
        className="tc-calendar-panel"
        title={tr("РАСПИСАНИЕ ПЕРВОЙ КОМАНДЫ", "FIRST-TEAM SCHEDULE")}
        extra={
          <span className="tc-hint">
            {armed
              ? tr(
                  `Выбрано: ${SESSIONS[armed].ru} — нажмите на слот`,
                  `Selected: ${SESSIONS[armed].en} — tap a slot`,
                )
              : tr("Перетащите или выберите занятие", "Drag or pick a session")}
          </span>
        }
      >
        <div className="tc-library" aria-label={tr("Библиотека занятий", "Session library")}>
          {ORDER.map((session) => {
            const info = SESSIONS[session];
            return (
              <button
                key={session}
                draggable
                className={`tc-chip ${armed === session ? "armed" : ""}`}
                style={{ "--s": info.color } as React.CSSProperties}
                aria-pressed={armed === session}
                title={`${ru ? info.ru : info.en} · ${tr("нагрузка", "load")} ${sessionLoad(session)}/4`}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", `session:${session}`);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => setArmed(armed === session ? undefined : session)}
              >
                <info.Icon size={14} />
                {ru ? info.shortRu : info.shortEn}
              </button>
            );
          })}
        </div>
        <div className="tc-week">
          {days.map((day) => {
            const plan = schedule.days[day.index];
            const strain = dayStrain(plan, schedule.intensity);
            const fatigue = dayFatigue(plan, schedule.intensity);
            return (
              <section
                key={day.index}
                className={`tc-day ${day.offset === 0 ? "current-training-day" : ""} ${day.opponent ? "match" : ""}`}
              >
                <header>
                  <div>
                    <b>{dateLabel(day.date, { weekday: "short" })}</b>
                    <small>{dateLabel(day.date, { day: "numeric", month: "short" })}</small>
                  </div>
                  {day.offset === 0 && (
                    <span className="tc-today">{tr("СЕГОДНЯ", "TODAY")}</span>
                  )}
                  {day.developmentDay && (
                    <span
                      className="tc-dev"
                      title={tr("День прогресса атрибутов", "Attribute development day")}
                    >
                      <Star size={11} fill="currentColor" />
                    </span>
                  )}
                </header>
                {day.opponent ? (
                  <div className="tc-match">
                    <Zap size={12} />
                    <span>
                      {day.home ? "vs" : "@"}{" "}
                      <ClubLink id={day.opponent} crest={18} label="id" />
                    </span>
                    {day.preseason && <small>{tr("товарищ.", "pre")}</small>}
                  </div>
                ) : (
                  <div className="tc-match empty">{tr("Без матча", "No game")}</div>
                )}
                {(["morning", "afternoon"] as Period[]).map((period) => {
                  const session = plan[period];
                  const info = SESSIONS[session];
                  const slotKey = `${day.index}:${period}`;
                  return (
                    <div
                      key={period}
                      className={`tc-slot ${dragOver === slotKey ? "over" : ""} ${armed ? "armed" : ""}`}
                      style={{ "--s": info.color } as React.CSSProperties}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOver(slotKey);
                      }}
                      onDragLeave={() => setDragOver(undefined)}
                      onDrop={(event) => onDrop(event, day.index, period)}
                    >
                      <span className="tc-period">
                        {period === "morning" ? tr("УТРО", "AM") : tr("ДЕНЬ", "PM")}
                      </span>
                      <span
                        className="tc-grip"
                        draggable
                        aria-hidden="true"
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", `slot:${day.index}:${period}`);
                          event.dataTransfer.effectAllowed = "move";
                          const card = (event.currentTarget as HTMLElement).parentElement;
                          if (card) event.dataTransfer.setDragImage(card, 20, 20);
                        }}
                      >
                        <GripVertical size={13} />
                      </span>
                      <info.Icon size={18} className="tc-icon" />
                      <b>{ru ? info.shortRu : info.shortEn}</b>
                      <span className="tc-dots" aria-label={`${tr("нагрузка", "load")} ${sessionLoad(session)}/4`}>
                        {[1, 2, 3, 4].map((n) => (
                          <i key={n} className={n <= sessionLoad(session) ? "on" : ""} />
                        ))}
                      </span>
                      {armed ? (
                        <button
                          className="tc-apply"
                          aria-label={`${tr("Поставить", "Place")} ${ru ? SESSIONS[armed].ru : SESSIONS[armed].en}`}
                          onClick={() => setSession(day.index, period, armed)}
                        />
                      ) : null}
                      <select
                        aria-label={`Training ${day.index} ${period}`}
                        value={session}
                        onChange={(event) =>
                          setSession(day.index, period, event.target.value as TrainingSession)
                        }
                      >
                        {ORDER.map((option) => (
                          <option key={option} value={option}>
                            {ru ? SESSIONS[option].ru : SESSIONS[option].en}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                <footer className={`tc-workload ${strain > 66 ? "high" : strain > 40 ? "mid" : "low"}`}>
                  <i>
                    <em style={{ width: `${Math.max(4, strain)}%` }} />
                  </i>
                  <span>
                    {strain > 66
                      ? tr("Высокая", "Heavy")
                      : strain > 40
                        ? tr("Средняя", "Medium")
                        : tr("Лёгкая", "Light")}
                    <small>
                      {tr("усталость", "fatigue")} {fatigue > 0 ? "+" : ""}
                      {fatigue}
                    </small>
                  </span>
                </footer>
              </section>
            );
          })}
        </div>
      </Panel>

      <div className="tc-grid">
        <Panel title={tr("БАЛАНС ПРОГРАММЫ", "PROGRAMME BALANCE")}>
          <div className="tc-balance">
            <div className="tc-stack" role="img" aria-label={tr("Распределение 14 занятий", "Split of 14 sessions")}>
              {ORDER.filter((s) => counts[s]).map((s) => (
                <i
                  key={s}
                  style={{ flex: counts[s], background: SESSIONS[s].color }}
                  title={`${ru ? SESSIONS[s].ru : SESSIONS[s].en}: ${counts[s]}`}
                />
              ))}
            </div>
            <div className="tc-groups">
              {GROUPS.map(([group, nameRu, nameEn, color]) => {
                const n = ORDER.filter((s) => SESSIONS[s].group === group).reduce(
                  (sum, s) => sum + counts[s],
                  0,
                );
                return (
                  <span key={group} style={{ "--s": color } as React.CSSProperties}>
                    <i />
                    {ru ? nameRu : nameEn}
                    <b>{Math.round((n / 14) * 100)}%</b>
                  </span>
                );
              })}
            </div>
            <div className="tc-rows">
              {ORDER.map((session) => (
                <div key={session} style={{ "--s": SESSIONS[session].color } as React.CSSProperties}>
                  {(() => {
                    const Icon = SESSIONS[session].Icon;
                    return <Icon size={13} />;
                  })()}
                  <span>{ru ? SESSIONS[session].ru : SESSIONS[session].en}</span>
                  <i>
                    <em style={{ width: `${(counts[session] / 6) * 100}%` }} />
                  </i>
                  <b>{counts[session]}</b>
                </div>
              ))}
            </div>
            {focusList.length > 0 && (
              <div className="tc-focus">
                <small>{tr("РАЗВИВАЕМЫЕ АТРИБУТЫ", "ATTRIBUTES IN FOCUS")}</small>
                <div>
                  {focusList.slice(0, 10).map(([key, n]) => (
                    <span key={key} className={n >= 3 ? "hot" : ""}>
                      {ATTRIBUTE_NAMES[key]?.[ru ? 0 : 1] ?? key}
                      <b>×{n}</b>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>
        <Panel title={tr("РЕКОМЕНДАЦИИ ШТАБА", "STAFF RECOMMENDATIONS")}>
          <ul className="tc-advice">
            {advice.map((item, index) => (
              <li key={index} className={item.tone}>
                {item.tone === "warn" ? (
                  <TriangleAlert size={16} />
                ) : (
                  <Lightbulb size={16} />
                )}
                <p>{item.text}</p>
                {item.apply && (
                  <button onClick={() => change(item.apply!)}>{item.action}</button>
                )}
              </li>
            ))}
          </ul>
          <p className="tc-footnote">
            {tr(
              "Молодые игроки (до 31 года, ниже потенциала) прибавляют в атрибутах в день прогресса — от профильных занятий этого дня. Высокая интенсивность и мотивация 70+ удваивают прибавку.",
              "Players under 31 below their potential gain attributes on development days from that day's focused sessions. High intensity plus motivation 70+ doubles the gain.",
            )}
          </p>
        </Panel>
      </div>

      <div className="tc-grid">
        <Panel title={tr("НАГРУЗКА И УСТАЛОСТЬ", "FATIGUE WATCH")}>
          {tiredList.length ? (
            <ul className="tc-players">
              {tiredList.map((p) => (
                <li key={p.id}>
                  <span className="position">{p.pos}</span>
                  <PlayerLink player={p} className="tc-name" />
                  {lineup.has(p.id) ? (
                    <small className="tc-tag">{tr("в звеньях", "lineup")}</small>
                  ) : (
                    <small className="tc-tag muted">{tr("резерв", "reserve")}</small>
                  )}
                  {p.injury > 0 ? (
                    <span className="tc-injury">
                      <HeartPulse size={12} /> {p.injuryReturnDate ?? `${p.injury} ${tr("дн.", "d")}`}
                    </span>
                  ) : (
                    <span className="tc-cond">
                      <i>
                        <em
                          className={p.fatigue >= 25 ? "poor" : "fair"}
                          style={{ width: `${100 - p.fatigue}%` }}
                        />
                      </i>
                      {Math.round(100 - p.fatigue)}%
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="tc-empty">
              {tr("Все игроки свежие — усталость под контролем.", "Everyone is fresh — fatigue is under control.")}
            </p>
          )}
        </Panel>
        <Panel title={tr("ИНДИВИДУАЛЬНЫЙ ПРОГРЕСС", "DEVELOPMENT WATCH")}>
          <ul className="tc-players">
            {developing.map((p) => {
              const growing = p.age < 31 && p.ovr < p.potential;
              const keys = growing ? devFocus(p) : [];
              const doubled =
                schedule.intensity === "high" && (p.motivation ?? 50) >= 70;
              return (
                <li key={p.id}>
                  <span className="position">{p.pos}</span>
                  <PlayerLink player={p} className="tc-name" />
                  <small className="tc-tag">
                    {p.age} {tr("л.", "y")}
                  </small>
                  <span className="tc-growth">
                    <Rating value={p.ovr} />
                    <i>
                      <em style={{ width: `${(p.ovr / p.potential) * 100}%` }} />
                    </i>
                    <b>{p.potential}</b>
                  </span>
                  <small className="tc-keys">
                    {!growing
                      ? tr("достиг потолка потенциала", "at potential ceiling")
                      : keys.length
                      ? keys.map((k) => ATTRIBUTE_NAMES[k]?.[ru ? 0 : 1] ?? k).join(" · ")
                      : tr("нет фокуса в день прогресса", "no focus on development day")}
                    {doubled && keys.length ? " · ×2" : ""}
                  </small>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
