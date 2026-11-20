import type { Game, Team, TrainingSession } from "./types";
import { nationalName, seeded } from "./names";
import { tx } from "./text";

export type StaffRole =
  | "head-coach"
  | "offense-coach"
  | "defense-coach"
  | "goalie-coach"
  | "skills-coach"
  | "conditioning-coach"
  | "physio"
  | "doctor"
  | "head-scout";

export interface StaffMember {
  id: string;
  name: string;
  nation: string;
  role: StaffRole;
  /** 35–96: quality of the specialist. */
  rating: number;
  age?: number;
  /** $M per season (outside the player salary cap). */
  salary: number;
  years: number;
  /** Real person (opening head coaches); others are generated. */
  real?: boolean;
  /** Short specialty tag shown on the card. */
  trait: { ru: string; en: string };
}

export const STAFF_ROLES: StaffRole[] = [
  "head-coach",
  "offense-coach",
  "defense-coach",
  "goalie-coach",
  "skills-coach",
  "conditioning-coach",
  "physio",
  "doctor",
  "head-scout",
];

export const STAFF_ROLE_LABEL: Record<StaffRole, { ru: string; en: string }> = {
  "head-coach": { ru: "Главный тренер", en: "Head coach" },
  "offense-coach": { ru: "Тренер нападения", en: "Offense coach" },
  "defense-coach": { ru: "Тренер защиты", en: "Defense coach" },
  "goalie-coach": { ru: "Тренер вратарей", en: "Goalie coach" },
  "skills-coach": { ru: "Тренер по технике", en: "Skills coach" },
  "conditioning-coach": { ru: "Тренер по ОФП", en: "Strength & conditioning" },
  physio: { ru: "Физиотерапевт", en: "Physiotherapist" },
  doctor: { ru: "Клубный врач", en: "Team doctor" },
  "head-scout": { ru: "Главный скаут", en: "Head scout" },
};

export const STAFF_EFFECT: Record<StaffRole, { ru: string; en: string }> = {
  "head-coach": { ru: "Тактика и командная игра на тренировках", en: "Tactical and teamwork sessions" },
  "offense-coach": { ru: "Бросок, точность, владение шайбой", en: "Shooting, accuracy, puck control" },
  "defense-coach": { ru: "Позиция в защите, блоки, силовая борьба", en: "Defensive position, blocking, checking" },
  "goalie-coach": { ru: "Реакция, позиция и контроль отскоков вратарей", en: "Goalie reflexes, positioning, rebounds" },
  "skills-coach": { ru: "Катание, передачи и техника", en: "Skating, passing and hands" },
  "conditioning-coach": { ru: "Выносливость, сила и меньше усталости после ОФП", en: "Stamina, strength, lighter conditioning load" },
  physio: { ru: "Быстрее снимает усталость", en: "Faster fatigue recovery" },
  doctor: { ru: "Травмированные возвращаются быстрее", en: "Injured players return sooner" },
  "head-scout": { ru: "Точнее отчёты и больше интереса у проспектов", en: "Sharper reports, more prospect interest" },
};

/** Staff budget per club, $M per season (separate from the player cap). */
export const STAFF_BUDGET = 16;

/**
 * Opening head coaches. Names are public; ratings are game estimates. The
 * snapshot reflects the latest staff list known to the game data and can be
 * outdated by in-season changes.
 */
const REAL_HEAD_COACHES: Record<string, [name: string, nation: string, rating: number]> = {
  BOS: ["Marco Sturm", "GER", 74], BUF: ["Lindy Ruff", "CAN", 75], DET: ["Todd McLellan", "CAN", 79],
  FLA: ["Paul Maurice", "CAN", 90], MTL: ["Martin St. Louis", "CAN", 80], OTT: ["Travis Green", "CAN", 77],
  TBL: ["Jon Cooper", "CAN", 92], TOR: ["Craig Berube", "CAN", 84], CAR: ["Rod Brind'Amour", "CAN", 91],
  CBJ: ["Dean Evason", "CAN", 78], NJD: ["Sheldon Keefe", "CAN", 80], NYI: ["Patrick Roy", "CAN", 79],
  NYR: ["Mike Sullivan", "USA", 86], PHI: ["Rick Tocchet", "CAN", 84], PIT: ["Dan Muse", "USA", 72],
  WSH: ["Spencer Carbery", "CAN", 85], CHI: ["Jeff Blashill", "USA", 73], COL: ["Jared Bednar", "CAN", 88],
  DAL: ["Glen Gulutzan", "CAN", 80], MIN: ["John Hynes", "USA", 79], NSH: ["Andrew Brunette", "CAN", 76],
  STL: ["Jim Montgomery", "USA", 85], UTA: ["André Tourigny", "CAN", 78], WPG: ["Scott Arniel", "USA", 81],
  ANA: ["Joel Quenneville", "USA", 83], CGY: ["Ryan Huska", "CAN", 77], EDM: ["Kris Knoblauch", "CAN", 84],
  LAK: ["D.J. Smith", "CAN", 74], SJS: ["Ryan Warsofsky", "USA", 72], SEA: ["Lane Lambert", "CAN", 74],
  VAN: ["Adam Foote", "CAN", 73], VGK: ["Bruce Cassidy", "CAN", 87],
};

const TRAITS: Record<StaffRole, { ru: string; en: string }[]> = {
  "head-coach": [{ ru: "Строгая система", en: "Structured system" }, { ru: "Мотиватор", en: "Motivator" }, { ru: "Работа с молодёжью", en: "Player developer" }, { ru: "Атакующий стиль", en: "Up-tempo style" }],
  "offense-coach": [{ ru: "Большинство", en: "Power-play guru" }, { ru: "Игра у ворот", en: "Net-front work" }, { ru: "Креатив", en: "Creativity" }],
  "defense-coach": [{ ru: "Меньшинство", en: "Penalty-kill expert" }, { ru: "Выход из зоны", en: "Breakouts" }, { ru: "Жёсткая опека", en: "Shutdown play" }],
  "goalie-coach": [{ ru: "Техника баттерфляй", en: "Butterfly technique" }, { ru: "Чтение игры", en: "Reads the play" }, { ru: "Психология", en: "Mental game" }],
  "skills-coach": [{ ru: "Катание", en: "Power skating" }, { ru: "Руки", en: "Puck skills" }, { ru: "Бросок", en: "Shot mechanics" }],
  "conditioning-coach": [{ ru: "Спортивная наука", en: "Sports science" }, { ru: "Силовая", en: "Strength" }, { ru: "Выносливость", en: "Endurance" }],
  physio: [{ ru: "Мануальная терапия", en: "Manual therapy" }, { ru: "Восстановление", en: "Recovery" }, { ru: "Профилактика", en: "Prevention" }],
  doctor: [{ ru: "Ортопедия", en: "Orthopedics" }, { ru: "Реабилитация", en: "Rehabilitation" }, { ru: "Спортивная медицина", en: "Sports medicine" }],
  "head-scout": [{ ru: "Северная Америка", en: "North America" }, { ru: "Европа", en: "Europe" }, { ru: "Аналитика", en: "Analytics" }, { ru: "Психология игроков", en: "Character reads" }],
};

const STAFF_NATIONS = ["CAN", "CAN", "CAN", "USA", "USA", "SWE", "FIN", "CZE", "RUS", "SUI", "GER"];

export function staffSalary(role: StaffRole, rating: number) {
  const q = Math.max(0, rating - 40) / 56;
  const base = role === "head-coach" ? 1.2 + q * q * 5 : role === "head-scout" ? 0.3 + q * q * 1.4 : 0.2 + q * q * 1.1;
  return Math.round(base * 100) / 100;
}

function generated(role: StaffRole, seed: string, ratingRange: [number, number]): StaffMember {
  const h = seeded(seed);
  const nation = STAFF_NATIONS[h % STAFF_NATIONS.length];
  const rating = ratingRange[0] + (seeded(`${seed}:r`) % (ratingRange[1] - ratingRange[0] + 1));
  return {
    id: `staff-${seeded(`${seed}:id`).toString(36)}`,
    name: nationalName(nation, `${seed}:staff`),
    nation,
    role,
    rating,
    age: 34 + (seeded(`${seed}:a`) % 30),
    salary: staffSalary(role, rating),
    years: 1 + (seeded(`${seed}:y`) % 3),
    trait: TRAITS[role][seeded(`${seed}:t`) % TRAITS[role].length],
  };
}

function openingStaff(team: Team, seed: number) {
  const staff: Partial<Record<StaffRole, StaffMember>> = {};
  for (const role of STAFF_ROLES) {
    const key = `${seed}:${team.id}:${role}`;
    if (role === "head-coach" && REAL_HEAD_COACHES[team.id]) {
      const [name, nation, rating] = REAL_HEAD_COACHES[team.id];
      staff[role] = {
        id: `staff-hc-${team.id.toLowerCase()}`,
        name,
        nation,
        role,
        rating,
        salary: staffSalary(role, rating),
        years: 1 + (seeded(key) % 4),
        real: true,
        trait: TRAITS[role][seeded(`${key}:t`) % TRAITS[role].length],
      };
    } else staff[role] = generated(role, key, [52, 78]);
  }
  return staff;
}

function marketFor(g: Game) {
  return STAFF_ROLES.flatMap((role) =>
    [0, 1, 2, 3].map((i) =>
      generated(role, `${g.seed}:${g.year}:market:${role}:${i}`, i === 0 ? [80, 95] : i === 1 ? [68, 84] : [48, 74]),
    ),
  );
}

/** Creates staff for all clubs and refreshes the market once per season. */
export function ensureStaff(g: Game) {
  for (const team of g.teams) team.staff ??= openingStaff(team, g.seed);
  if (g.staffYear === g.year && g.staffMarket) return;
  const firstSeason = g.staffYear === undefined;
  g.staffYear = g.year;
  if (!firstSeason) {
    for (const team of g.teams) {
      for (const role of STAFF_ROLES) {
        const member = team.staff?.[role];
        if (!member) continue;
        member.years -= 1;
        if (member.age) member.age += 1;
        if (member.years > 0) continue;
        if (team.id === g.user) {
          delete team.staff![role];
          g.news.unshift(
            tx(g, `Контракт истёк: ${member.name} (${STAFF_ROLE_LABEL[role].ru}) покинул клуб.`, `Contract expired: ${member.name} (${STAFF_ROLE_LABEL[role].en}) left the club.`),
          );
        } else {
          // AI clubs re-sign or bring in a new (generated) specialist.
          team.staff![role] =
            seeded(`${g.year}:${team.id}:${role}:keep`) % 3
              ? { ...member, years: 2 }
              : generated(role, `${g.seed}:${g.year}:${team.id}:${role}`, [50, 86]);
        }
      }
    }
  }
  g.staffMarket = marketFor(g);
}

export function staffPayroll(team: Team) {
  return Object.values(team.staff ?? {}).reduce((sum, m) => sum + (m?.salary ?? 0), 0);
}

export function staffRating(team: Team | undefined, role: StaffRole) {
  return team?.staff?.[role]?.rating ?? 45;
}

export function hireStaff(g: Game, candidateId: string) {
  ensureStaff(g);
  const team = g.teams.find((t) => t.id === g.user)!;
  const candidate = g.staffMarket!.find((m) => m.id === candidateId);
  if (!candidate) throw Error(tx(g, "Специалист недоступен", "Specialist unavailable"));
  const current = team.staff?.[candidate.role];
  const budget = staffPayroll(team) - (current?.salary ?? 0) + candidate.salary;
  if (budget > STAFF_BUDGET + 1e-9)
    throw Error(tx(g, `Бюджет штаба превышен: $${budget.toFixed(2)}M из $${STAFF_BUDGET}M`, `Staff budget exceeded: $${budget.toFixed(2)}M of $${STAFF_BUDGET}M`));
  team.staff ??= {};
  team.staff[candidate.role] = { ...candidate, years: Math.max(2, candidate.years) };
  g.staffMarket = g.staffMarket!.filter((m) => m.id !== candidateId);
  if (current) g.staffMarket.push({ ...current, years: 1 });
  g.news.unshift(
    tx(g, `Нанят ${candidate.name} — ${STAFF_ROLE_LABEL[candidate.role].ru.toLowerCase()}.`, `${candidate.name} hired as ${STAFF_ROLE_LABEL[candidate.role].en.toLowerCase()}.`),
  );
}

export function fireStaff(g: Game, role: StaffRole) {
  const team = g.teams.find((t) => t.id === g.user)!;
  const member = team.staff?.[role];
  if (!member) return;
  delete team.staff![role];
  g.staffMarket ??= [];
  g.staffMarket.push({ ...member, years: 1 });
  g.news.unshift(tx(g, `${member.name} уволен.`, `${member.name} was dismissed.`));
}

// ---------------------------------------------------------------- effects

/** Extra fatigue removed per training day by the physiotherapist. */
export function physioRecovery(team: Team) {
  return Math.max(0, Math.round((staffRating(team, "physio") - 50) / 11));
}

/** Whether the doctor heals an extra day of injury on this training tick. */
export function doctorExtraHeal(team: Team, tick: number) {
  const r = staffRating(team, "doctor");
  if (r < 60) return false;
  return tick % Math.max(2, Math.round((112 - r) / 10)) === 0;
}

const COACH_FOR: Partial<Record<TrainingSession, StaffRole>> = {
  tactical: "head-coach",
  teamwork: "head-coach",
  offense: "offense-coach",
  defense: "defense-coach",
  goalie: "goalie-coach",
  skills: "skills-coach",
  conditioning: "conditioning-coach",
};

/** Training boost of the coach running a session: extra attributes and gain. */
export function coachBoost(team: Team, session: TrainingSession) {
  const role = COACH_FOR[session];
  const r = role ? staffRating(team, role) : 50;
  return { extraKeys: r >= 70 ? 1 : 0, extraGain: r >= 86 ? 1 : 0 };
}

/** Confidence bonus of a scouting report. */
export function scoutAccuracy(team: Team | undefined) {
  return Math.round((staffRating(team, "head-scout") - 55) / 6);
}

/** Interest bonus with prospects and free agents (−4 … +8). */
export function scoutPersuasion(team: Team | undefined) {
  if (!team?.staff) return 0;
  return Math.round((staffRating(team, "head-scout") - 60) / 4.5);
}

/** Recovery boost the physio gives when the conditioning coach is strong. */
export function conditioningRelief(team: Team) {
  return staffRating(team, "conditioning-coach") >= 75 ? 1 : 0;
}
