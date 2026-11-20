import { useState } from "react";
import { BadgeCheck, HeartPulse, Search, Stethoscope, Target, UserMinus, Dumbbell, Shield, Crosshair, Sparkles, Users } from "lucide-react";
import type { Game } from "../engine/types";
import {
  ensureStaff,
  fireStaff,
  hireStaff,
  STAFF_BUDGET,
  STAFF_EFFECT,
  STAFF_ROLE_LABEL,
  STAFF_ROLES,
  staffPayroll,
  type StaffMember,
  type StaffRole,
} from "../engine/staff";
import { flagOf } from "../engine/names";

type Edit = (fn: (game: Game) => void) => void;

const ROLE_ICON: Record<StaffRole, typeof Users> = {
  "head-coach": Users,
  "offense-coach": Crosshair,
  "defense-coach": Shield,
  "goalie-coach": Target,
  "skills-coach": Sparkles,
  "conditioning-coach": Dumbbell,
  physio: HeartPulse,
  doctor: Stethoscope,
  "head-scout": Search,
};

const tier = (rating: number) =>
  rating >= 86 ? "elite" : rating >= 74 ? "strong" : rating >= 60 ? "solid" : "weak";

function Stars({ rating }: { rating: number }) {
  const value = Math.max(0.5, Math.min(5, Math.round(((rating - 40) / 11) * 2) / 2));
  return (
    <span className="staff-stars" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={value >= i ? "full" : value >= i - 0.5 ? "half" : ""}>★</i>
      ))}
    </span>
  );
}

function boostText(m: StaffMember, ru: boolean) {
  const r = m.rating;
  switch (m.role) {
    case "physio":
      return ru ? `+${Math.max(0, Math.round((r - 50) / 11))} к восстановлению в день` : `+${Math.max(0, Math.round((r - 50) / 11))} recovery per day`;
    case "doctor":
      return r < 60 ? (ru ? "Без ускорения лечения" : "No faster healing") : ru ? `Лечение быстрее ~${Math.round(100 / Math.max(2, Math.round((112 - r) / 10)))}%` : `Heals ~${Math.round(100 / Math.max(2, Math.round((112 - r) / 10)))}% faster`;
    case "head-scout":
      return ru ? `Точность +${Math.max(0, Math.round((r - 55) / 6))} · интерес ${Math.round((r - 60) / 4.5) >= 0 ? "+" : ""}${Math.round((r - 60) / 4.5)}` : `Accuracy +${Math.max(0, Math.round((r - 55) / 6))} · interest ${Math.round((r - 60) / 4.5) >= 0 ? "+" : ""}${Math.round((r - 60) / 4.5)}`;
    default:
      return r >= 86 ? (ru ? "Двойной прирост + доп. навык" : "Double gains + extra skill") : r >= 70 ? (ru ? "Доп. навык на занятиях" : "Extra skill per session") : ru ? "Обычные занятия" : "Standard sessions";
  }
}

function StaffCard({ member, ru, action }: { member: StaffMember; ru: boolean; action?: React.ReactNode }) {
  return (
    <article className={`staff-card ${tier(member.rating)}`}>
      <div className="staff-avatar" aria-hidden>
        {member.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
      </div>
      <div className="staff-main">
        <b>
          {member.name}
          {member.real && (
            <BadgeCheck size={14} className="staff-real" aria-label={ru ? "Реальный специалист" : "Real person"} />
          )}
        </b>
        <small>
          {flagOf(member.nation)} {member.nation}
          {member.age ? ` · ${member.age} ${ru ? "лет" : "yrs"}` : ""} · {ru ? member.trait.ru : member.trait.en}
        </small>
        <span className="staff-boost">{boostText(member, ru)}</span>
      </div>
      <div className="staff-side">
        <strong className="staff-rating">{member.rating}</strong>
        <Stars rating={member.rating} />
        <small>
          ${member.salary.toFixed(2)}M × {member.years}
          {ru ? " г." : "y"}
        </small>
        {action}
      </div>
    </article>
  );
}

export default function StaffCenter({ game, edit }: { game: Game; edit: Edit }) {
  ensureStaff(game);
  const ru = game.language === "ru";
  const team = game.teams.find((t) => t.id === game.user)!;
  const [role, setRole] = useState<StaffRole>("head-coach");
  const [error, setError] = useState("");
  const payroll = staffPayroll(team);
  const current = team.staff?.[role];
  const market = (game.staffMarket ?? []).filter((m) => m.role === role).sort((a, b) => b.rating - a.rating);
  const run = (fn: (g: Game) => void) => {
    setError("");
    try {
      edit(fn);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const avg = Math.round(
    STAFF_ROLES.reduce((sum, r) => sum + (team.staff?.[r]?.rating ?? 40), 0) / STAFF_ROLES.length,
  );
  return (
    <div className="staff-center">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{ru ? "ХОККЕЙНЫЕ ОПЕРАЦИИ · ПЕРСОНАЛ" : "HOCKEY OPERATIONS · STAFF"}</span>
          <h1>{ru ? "Штаб и персонал" : "Staff & hiring"}</h1>
          <p>
            {ru
              ? "Сильные специалисты дают бусты: тренеры ускоряют рост навыков, физиотерапевт — восстановление, врач — возвращение после травм, скаут — точность отчётов и интерес проспектов."
              : "Strong specialists give boosts: coaches speed up skill growth, the physio recovery, the doctor returns from injury, the scout report accuracy and prospect interest."}
          </p>
        </div>
      </div>
      <div className="staff-metrics">
        <div>
          <small>{ru ? "БЮДЖЕТ ШТАБА" : "STAFF BUDGET"}</small>
          <b>${payroll.toFixed(2)}M</b>
          <span>
            {ru ? "из" : "of"} ${STAFF_BUDGET}M · {ru ? "вне потолка зарплат" : "outside the cap"}
          </span>
          <i className="staff-meter">
            <em style={{ width: `${Math.min(100, (payroll / STAFF_BUDGET) * 100)}%` }} />
          </i>
        </div>
        <div>
          <small>{ru ? "СРЕДНИЙ УРОВЕНЬ" : "AVERAGE QUALITY"}</small>
          <b>{avg}</b>
          <Stars rating={avg} />
        </div>
        <div>
          <small>{ru ? "ВАКАНСИИ" : "VACANCIES"}</small>
          <b>{STAFF_ROLES.filter((r) => !team.staff?.[r]).length}</b>
          <span>{ru ? "незанятых должностей" : "open positions"}</span>
        </div>
      </div>
      <div className="staff-layout">
        <nav className="staff-roles" aria-label={ru ? "Должности" : "Roles"}>
          {STAFF_ROLES.map((r) => {
            const Icon = ROLE_ICON[r];
            const m = team.staff?.[r];
            return (
              <button key={r} className={`${role === r ? "active" : ""} ${m ? tier(m.rating) : "vacant"}`} onClick={() => setRole(r)}>
                <Icon size={17} />
                <span>
                  <b>{ru ? STAFF_ROLE_LABEL[r].ru : STAFF_ROLE_LABEL[r].en}</b>
                  <small>{m ? m.name : ru ? "Вакансия" : "Vacant"}</small>
                </span>
                <em>{m?.rating ?? "—"}</em>
              </button>
            );
          })}
        </nav>
        <section className="staff-detail">
          <header>
            <div>
              <span className="eyebrow">{ru ? "ДОЛЖНОСТЬ" : "ROLE"}</span>
              <h2>{ru ? STAFF_ROLE_LABEL[role].ru : STAFF_ROLE_LABEL[role].en}</h2>
              <p>{ru ? STAFF_EFFECT[role].ru : STAFF_EFFECT[role].en}</p>
            </div>
          </header>
          <h3>{ru ? "Сейчас в клубе" : "Current"}</h3>
          {current ? (
            <StaffCard
              member={current}
              ru={ru}
              action={
                <button className="staff-fire" onClick={() => run((g) => fireStaff(g, role))}>
                  <UserMinus size={14} /> {ru ? "Уволить" : "Dismiss"}
                </button>
              }
            />
          ) : (
            <div className="staff-vacant">{ru ? "Должность свободна — наймите специалиста ниже." : "Position open — hire a specialist below."}</div>
          )}
          <h3>
            {ru ? "Рынок специалистов" : "Available specialists"} · {game.year}/{String(game.year + 1).slice(2)}
          </h3>
          {error && <div className="staff-error" role="alert">{error}</div>}
          <div className="staff-market">
            {market.length ? (
              market.map((m) => {
                const after = payroll - (current?.salary ?? 0) + m.salary;
                return (
                  <StaffCard
                    key={m.id}
                    member={m}
                    ru={ru}
                    action={
                      <button className="primary compact" disabled={after > STAFF_BUDGET + 1e-9} onClick={() => run((g) => hireStaff(g, m.id))}>
                        {ru ? "Нанять" : "Hire"}
                      </button>
                    }
                  />
                );
              })
            ) : (
              <div className="staff-vacant">{ru ? "Кандидатов нет до следующего сезона." : "No candidates until next season."}</div>
            )}
          </div>
          <p className="note">
            {ru
              ? "Главные тренеры на старте — реальные специалисты (рейтинги — игровая оценка, состав штабов может устареть). Остальной персонал и все новые кандидаты сгенерированы игрой; рынок обновляется каждый сезон."
              : "Opening head coaches are real people (ratings are game estimates; staffs may be outdated). Other staff and all new candidates are generated; the market refreshes every season."}
          </p>
        </section>
      </div>
    </div>
  );
}
