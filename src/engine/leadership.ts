/**
 * Captaincy: how the dressing room ranks captain candidates, how it reacts
 * to the leadership group the manager names, and the letter a stripped
 * captain writes afterwards.
 *
 * Everything is deterministic (game state + FNV hashing, no Math.random).
 * Text stored in the save is written in the career language; the preview
 * structures carry both languages so the UI can render either.
 */
import { pushEvent } from "./management";
import { clamp } from "./random";
import { hashText, pickBy, type L } from "./dialogueText";
import { tx } from "./text";
import type { Game, ManagementEvent, Player, Team } from "./types";

/** Captains at the start of the 2026-27 season (career-start incumbents). */
export const REAL_WORLD_CAPTAINS: Record<string, string> = {
  ANA: "Radko Gudas",
  BUF: "Rasmus Dahlin",
  CGY: "Mikael Backlund",
  CAR: "Jordan Staal",
  CHI: "Nick Foligno",
  COL: "Gabriel Landeskog",
  CBJ: "Boone Jenner",
  DAL: "Jamie Benn",
  DET: "Dylan Larkin",
  EDM: "Connor McDavid",
  FLA: "Aleksander Barkov",
  LAK: "Anze Kopitar",
  MIN: "Jared Spurgeon",
  MTL: "Nick Suzuki",
  NSH: "Roman Josi",
  NJD: "Nico Hischier",
  NYI: "Anders Lee",
  OTT: "Brady Tkachuk",
  PHI: "Sean Couturier",
  PIT: "Sidney Crosby",
  SEA: "Jordan Eberle",
  STL: "Brayden Schenn",
  TBL: "Victor Hedman",
  TOR: "Auston Matthews",
  VAN: "Quinn Hughes",
  VGK: "Mark Stone",
  WSH: "Alex Ovechkin",
  WPG: "Adam Lowry",
  UTA: "Clayton Keller",
};

export function leadershipScore(player: Player) {
  const a = player.attributes;
  const ageFit =
    player.age >= 27 && player.age <= 35 ? 8 : player.age >= 24 ? 3 : -4;
  return Math.round(
    (a.leadership ?? 60) * 0.34 +
      (a.teamwork ?? 60) * 0.18 +
      (a.composure ?? 60) * 0.16 +
      (a.consistency ?? 60) * 0.12 +
      player.ovr * 0.2 +
      ageFit,
  );
}

const userTeam = (g: Game) => g.teams.find((team) => team.id === g.user)!;

// --- tenure ----------------------------------------------------------------

/**
 * Seasons an original-roster player is assumed to have spent at the club.
 * The roster data has no arrival dates, so this is a conservative estimate
 * from age; the club's real-world captain is treated as a long-time member.
 */
function estimatedTenure(player: Player, team?: Team) {
  if (team && REAL_WORLD_CAPTAINS[team.id] === player.name)
    return clamp(player.age - 19, 1, 12);
  return clamp(player.age - 22, 1, 6);
}

/**
 * Records when each user-club player joined. Players on the roster when the
 * map is first built get an estimated arrival year; anyone who appears later
 * joined during the career.
 */
export function syncClubTenure(g: Game) {
  const team = userTeam(g);
  if (!team) return;
  if (!g.clubTenure) {
    g.clubTenure = Object.fromEntries(
      team.players.map((player) => [
        player.id,
        g.year - estimatedTenure(player, team),
      ]),
    );
    return;
  }
  for (const player of team.players)
    if (g.clubTenure[player.id] === undefined) g.clubTenure[player.id] = g.year;
}

/** Full seasons the player has spent with the user's club. */
export function clubTenure(g: Game, player: Player) {
  const since = g.clubTenure?.[player.id];
  if (since !== undefined) return Math.max(0, g.year - since);
  return g.clubTenure ? 0 : estimatedTenure(player, userTeam(g));
}

// --- candidates ------------------------------------------------------------

export type CandidateFactorKey =
  | "leadership"
  | "experience"
  | "tenure"
  | "status"
  | "morale"
  | "popularity"
  | "incumbent";

export type CandidateFlag =
  | "young"
  | "newcomer"
  | "depth"
  | "unhappy"
  | "low-leadership"
  | "trade-request";

export interface CaptainCandidate {
  player: Player;
  /** Dressing-room standing, 0–100. */
  standing: number;
  leadership: number;
  tenure: number;
  ovrRank: number;
  popularity: number;
  role?: "C" | "A";
  factors: Record<CandidateFactorKey, number>;
  flags: CandidateFlag[];
}

const FACTOR_WEIGHTS: Record<CandidateFactorKey, number> = {
  leadership: 0.3,
  experience: 0.13,
  tenure: 0.12,
  status: 0.16,
  morale: 0.06,
  popularity: 0.1,
  incumbent: 0.13,
};

export const FACTOR_LABELS: Record<CandidateFactorKey, L> = {
  leadership: { ru: "Лидерство", en: "Leadership" },
  experience: { ru: "Опыт", en: "Experience" },
  tenure: { ru: "Стаж в клубе", en: "Club tenure" },
  status: { ru: "Статус в составе", en: "Squad status" },
  morale: { ru: "Мораль", en: "Morale" },
  popularity: { ru: "Авторитет", en: "Popularity" },
  incumbent: { ru: "Текущая роль", en: "Current role" },
};

export const FLAG_LABELS: Record<CandidateFlag, L> = {
  young: { ru: "слишком молод", en: "too young" },
  newcomer: { ru: "новичок в клубе", en: "new to the club" },
  depth: { ru: "игрок глубины", en: "depth player" },
  unhappy: { ru: "недоволен", en: "unhappy" },
  "low-leadership": { ru: "слабый лидер", en: "weak leader" },
  "trade-request": { ru: "просит обмен", en: "wants a trade" },
};

function experienceScore(age: number) {
  if (age <= 20) return 5;
  if (age <= 27) return 15 + (age - 21) * 10;
  if (age <= 34) return 90;
  if (age <= 36) return 80;
  return 70;
}

/** The current leadership group, falling back to the real-world captain. */
export function incumbentGroup(g: Game, team = userTeam(g)) {
  const onRoster = (id?: string) =>
    !!id && team.players.some((player) => player.id === id);
  const real = team.players.find(
    (player) => player.name === REAL_WORLD_CAPTAINS[team.id],
  )?.id;
  const captainId = onRoster(team.captainId)
    ? team.captainId
    : !team.captainId && !g.leadershipLog?.length && onRoster(real)
      ? real
      : undefined;
  const alternateIds = (team.alternateCaptainIds ?? []).filter(
    (id) => onRoster(id) && id !== captainId,
  );
  return { captainId, alternateIds };
}

/** Goalies cannot wear a letter in the NHL. */
export const canWearLetter = (player: Player) => player.pos !== "G";

export function captainCandidates(g: Game): CaptainCandidate[] {
  const team = userTeam(g);
  const incumbent = incumbentGroup(g, team);
  const byOvr = [...team.players].sort((a, b) => b.ovr - a.ovr);
  return team.players
    .filter(canWearLetter)
    .map((player) => {
      const leadership = leadershipScore(player);
      const tenure = clubTenure(g, player);
      const ovrRank = byOvr.findIndex((item) => item.id === player.id) + 1;
      const tenureN = Math.min(100, tenure * 10);
      const experience = experienceScore(player.age);
      const popularity = Math.round(
        clamp(
          (player.attributes.teamwork ?? 60) * 0.5 +
            tenureN * 0.2 +
            experience * 0.15 +
            player.morale * 0.15,
          0,
          100,
        ),
      );
      const role =
        incumbent.captainId === player.id
          ? ("C" as const)
          : incumbent.alternateIds.includes(player.id)
            ? ("A" as const)
            : undefined;
      const factors: Record<CandidateFactorKey, number> = {
        leadership: Math.round(clamp((leadership - 45) * 2.2, 0, 100)),
        experience,
        tenure: tenureN,
        status: Math.round(clamp(100 - (ovrRank - 1) * 5.5, 0, 100)),
        morale: Math.round(player.morale),
        popularity,
        incumbent: role === "C" ? 100 : role === "A" ? 60 : 0,
      };
      const standing = Math.round(
        (Object.keys(factors) as CandidateFactorKey[]).reduce(
          (sum, key) => sum + factors[key] * FACTOR_WEIGHTS[key],
          0,
        ),
      );
      const flags: CandidateFlag[] = [];
      if (player.age <= 22) flags.push("young");
      if (tenure === 0) flags.push("newcomer");
      if (ovrRank > 16) flags.push("depth");
      if (player.morale < 40) flags.push("unhappy");
      if (leadership < 60) flags.push("low-leadership");
      if (player.tradeRequest) flags.push("trade-request");
      return {
        player,
        standing,
        leadership,
        tenure,
        ovrRank,
        popularity,
        role,
        factors,
        flags,
      };
    })
    .sort(
      (a, b) =>
        b.standing - a.standing || a.player.id.localeCompare(b.player.id),
    );
}

/** The dressing room's own picks: captain first, then two alternates. */
export function roomPreferredGroup(candidates: CaptainCandidate[]) {
  return candidates.slice(0, 3).map((candidate) => candidate.player.id);
}

// --- evaluation ------------------------------------------------------------

export type LeadershipVerdict =
  | "united"
  | "approved"
  | "doubts"
  | "upset"
  | "revolt";

export const VERDICT_LABELS: Record<LeadershipVerdict, L> = {
  united: { ru: "Раздевалка едина", en: "Room united" },
  approved: { ru: "Одобрено", en: "Approved" },
  doubts: { ru: "Есть сомнения", en: "Some doubts" },
  upset: { ru: "Команда расстроена", en: "Team upset" },
  revolt: { ru: "Бунт в раздевалке", en: "Dressing-room revolt" },
};

export interface LeadershipEffect {
  player: Player;
  moraleDelta: number;
  relationshipDelta: number;
  reason: "snubbed" | "stripped" | "demoted" | "appointed";
}

export interface LeadershipEvaluation {
  approval: number;
  verdict: LeadershipVerdict;
  /** Short reasons the room gives for its verdict, worst first. */
  reasons: L[];
  squadMoraleDelta: number;
  motivationDelta: number;
  relationshipDelta: number;
  confidenceDelta: number;
  effects: LeadershipEffect[];
  stripped?: { player: Player; demotedTo?: "A" };
  /** The group differs from the one already in place. */
  changed: boolean;
  preferred: string[];
}

function verdictFor(approval: number): LeadershipVerdict {
  if (approval >= 80) return "united";
  if (approval >= 64) return "approved";
  if (approval >= 48) return "doubts";
  if (approval >= 30) return "upset";
  return "revolt";
}

const sameGroup = (
  a: { captainId?: string; alternateIds: string[] },
  captainId: string,
  alternateIds: string[],
) =>
  a.captainId === captainId &&
  a.alternateIds.length === alternateIds.length &&
  alternateIds.every((id) => a.alternateIds.includes(id));

/** Predicts the room's reaction to a leadership group without changing it. */
export function evaluateLeadershipChoice(
  g: Game,
  captainId: string,
  alternateIds: string[],
): LeadershipEvaluation {
  const candidates = captainCandidates(g);
  const byId = new Map(candidates.map((item) => [item.player.id, item]));
  const captain = byId.get(captainId);
  if (!captain) throw Error("Captain must be a skater on the user roster");
  const alternates = alternateIds
    .map((id) => byId.get(id))
    .filter((item): item is CaptainCandidate => !!item);
  const preferred = roomPreferredGroup(candidates);
  const incumbent = incumbentGroup(g);
  const reasons: L[] = [];

  const top = candidates[0];
  const capGap = Math.max(0, top.standing - captain.standing);
  const bestAlts = candidates
    .filter((item) => item.player.id !== captainId)
    .slice(0, 2)
    .reduce((sum, item) => sum + item.standing, 0);
  const chosenAlts = alternates.reduce((sum, item) => sum + item.standing, 0);
  const altGap = Math.max(0, (bestAlts - chosenAlts) / 2);
  let approval = 92 - capGap * 1.6 - altGap * 0.7;

  if (capGap >= 10)
    reasons.push({
      ru: `${top.player.name} пользуется куда большим уважением, чем ${captain.player.name}.`,
      en: `${top.player.name} carries far more respect in the room than ${captain.player.name}.`,
    });
  const flagPenalty: Record<CandidateFlag, number> = {
    young: 8,
    newcomer: 10,
    depth: 12,
    unhappy: 6,
    "low-leadership": 8,
    "trade-request": 15,
  };
  const flagReason: Record<CandidateFlag, L> = {
    young: {
      ru: `${captain.player.name} всего ${captain.player.age}. Ветераны не готовы слушать новичка.`,
      en: `${captain.player.name} is ${captain.player.age}. The veterans won't take orders from a kid.`,
    },
    newcomer: {
      ru: `${captain.player.name} только пришёл в клуб и ещё не заработал авторитет.`,
      en: `${captain.player.name} just arrived and hasn't earned the room yet.`,
    },
    depth: {
      ru: `${captain.player.name} не гарантирует себе место в составе. Капитан должен играть.`,
      en: `${captain.player.name} isn't a lineup regular. A captain has to be on the ice.`,
    },
    unhappy: {
      ru: `${captain.player.name} сам недоволен своим положением.`,
      en: `${captain.player.name} is unhappy with his own situation.`,
    },
    "low-leadership": {
      ru: `${captain.player.name} не лидер по характеру.`,
      en: `${captain.player.name} isn't a natural leader.`,
    },
    "trade-request": {
      ru: `${captain.player.name} просит обмен. Капитан не может хотеть уйти.`,
      en: `${captain.player.name} has asked for a trade. A captain can't want out.`,
    },
  };
  for (const flag of captain.flags) {
    approval -= flagPenalty[flag];
    reasons.push(flagReason[flag]);
  }

  const previous = incumbent.captainId
    ? byId.get(incumbent.captainId)
    : undefined;
  let stripped: LeadershipEvaluation["stripped"];
  if (previous && previous.player.id !== captainId) {
    const demoted = alternateIds.includes(previous.player.id);
    const penalty = clamp((previous.standing - 45) * 0.5, 0, 22);
    approval -= demoted ? penalty / 2 : penalty;
    stripped = { player: previous.player, demotedTo: demoted ? "A" : undefined };
    if (penalty >= 6)
      reasons.push(
        demoted
          ? {
              ru: `${previous.player.name} лишён капитанской нашивки. Буква «A» его не утешит.`,
              en: `${previous.player.name} loses the C. An "A" won't make up for it.`,
            }
          : {
              ru: `${previous.player.name} лишён капитанства и выведен из лидерской группы.`,
              en: `${previous.player.name} is stripped of the C and dropped from the group.`,
            },
      );
  }
  const changed = !sameGroup(incumbent, captainId, alternateIds);
  const changesThisSeason = (g.leadershipLog ?? []).filter(
    (entry) => entry.year === g.year,
  ).length;
  if (changed && changesThisSeason > 0) {
    approval -= 6;
    reasons.push({
      ru: "Уже вторая смена лидеров за сезон. Это выглядит как метания.",
      en: "Another leadership change this season. It looks like indecision.",
    });
  }
  if (altGap >= 10)
    reasons.push({
      ru: "Ассистенты выбраны в обход более уважаемых игроков.",
      en: "The alternates skip over more respected players.",
    });

  approval = Math.round(clamp(approval, 0, 100));
  const verdict = verdictFor(approval);
  if (!reasons.length)
    reasons.push(
      captainId === preferred[0]
        ? {
            ru: `${captain.player.name} и есть выбор раздевалки.`,
            en: `${captain.player.name} is exactly who the room wanted.`,
          }
        : {
            ru: "Решение понятно игрокам. Серьёзных возражений нет.",
            en: "The players understand the choice. No real objections.",
          },
    );

  const squadMoraleDelta =
    approval >= 80
      ? 2
      : approval >= 64
        ? 1
        : approval >= 48
          ? -1
          : -Math.min(10, Math.round((60 - approval) / 5));
  const motivationDelta =
    approval >= 80 ? 1 : approval >= 48 ? 0 : -Math.round((60 - approval) / 8);
  const relationshipDelta =
    approval >= 80
      ? 1
      : approval >= 48
        ? 0
        : -Math.max(1, Math.round((50 - approval) / 8));
  const confidenceDelta = approval < 30 ? -5 : approval < 48 ? -2 : 0;

  const chosen = new Set([captainId, ...alternateIds]);
  const effects: LeadershipEffect[] = [];
  if (stripped)
    effects.push({
      player: stripped.player,
      moraleDelta: stripped.demotedTo ? -4 : -8,
      relationshipDelta: stripped.demotedTo ? -5 : -10,
      reason: stripped.demotedTo ? "demoted" : "stripped",
    });
  for (const candidate of candidates.slice(0, 4)) {
    if (chosen.has(candidate.player.id)) continue;
    if (candidate.player.id === stripped?.player.id) continue;
    const gap = candidate.standing - captain.standing;
    const altFloor = Math.min(...alternates.map((item) => item.standing));
    if (gap < 8 && candidate.standing - altFloor < 10) continue;
    const severity = Math.max(gap, candidate.standing - altFloor);
    effects.push({
      player: candidate.player,
      moraleDelta: -Math.min(8, Math.max(2, Math.round(severity / 4))),
      relationshipDelta: -Math.min(10, Math.max(2, Math.round(severity / 3))),
      reason: "snubbed",
    });
  }
  for (const id of chosen) {
    const item = byId.get(id)!;
    if (item.player.id === stripped?.player.id) continue;
    const isNew =
      id === captainId
        ? incumbent.captainId !== id
        : !incumbent.alternateIds.includes(id) && incumbent.captainId !== id;
    if (isNew)
      effects.push({
        player: item.player,
        moraleDelta: id === captainId ? 4 : 2,
        relationshipDelta: id === captainId ? 4 : 2,
        reason: "appointed",
      });
  }
  return {
    approval,
    verdict,
    reasons,
    squadMoraleDelta,
    motivationDelta,
    relationshipDelta,
    confidenceDelta,
    effects,
    stripped,
    changed,
    preferred,
  };
}

// --- applying --------------------------------------------------------------

export interface LeadershipChangeResult {
  applied: boolean;
  evaluation?: LeadershipEvaluation;
  letterEventId?: string;
}

/**
 * Names the leadership group and applies the room's reaction once. Saving
 * the same group again changes nothing.
 */
export function applyLeadershipChoice(
  g: Game,
  captainId: string,
  alternateIds: string[],
): LeadershipChangeResult {
  syncClubTenure(g);
  const team = userTeam(g);
  const group = [captainId, ...alternateIds];
  if (alternateIds.length !== 2 || new Set(group).size !== 3)
    throw Error("Pick one captain and two different alternates");
  for (const id of group) {
    const player = team.players.find((item) => item.id === id);
    if (!player || !canWearLetter(player))
      throw Error("Every letter must go to a skater on the roster");
  }
  const evaluation = evaluateLeadershipChoice(g, captainId, alternateIds);
  const alreadySet =
    team.captainId === captainId &&
    sameGroup(
      { captainId: team.captainId, alternateIds: team.alternateCaptainIds ?? [] },
      captainId,
      alternateIds,
    );
  if (alreadySet) {
    g.leadershipSeason = g.year;
    return { applied: false, evaluation };
  }

  const appointedNewCaptain = evaluation.effects.some(
    (effect) => effect.reason === "appointed" && effect.player.id === captainId,
  );
  for (const player of team.players) {
    player.morale = clamp(player.morale + evaluation.squadMoraleDelta, 0, 100);
    player.motivation = clamp(
      (player.motivation ?? 50) + evaluation.motivationDelta,
      0,
      100,
    );
    player.relationship = clamp(
      (player.relationship ?? 50) + evaluation.relationshipDelta,
      0,
      100,
    );
  }
  for (const effect of evaluation.effects) {
    effect.player.morale = clamp(
      effect.player.morale + effect.moraleDelta,
      0,
      100,
    );
    effect.player.relationship = clamp(
      (effect.player.relationship ?? 50) + effect.relationshipDelta,
      0,
      100,
    );
  }
  if (g.managerEmployment && evaluation.confidenceDelta)
    g.managerEmployment.confidence = clamp(
      g.managerEmployment.confidence + evaluation.confidenceDelta,
      0,
      100,
    );

  const previousCaptainId = incumbentGroup(g, team).captainId;
  team.captainId = captainId;
  team.alternateCaptainIds = [...alternateIds];
  g.leadershipSeason = g.year;
  g.leadershipConsequenceSeason = g.year;
  const date = g.calendar?.date ?? `${g.year}-09-15`;
  for (const event of g.events ?? [])
    if (event.action === "leadership" && !event.replies) {
      event.read = true;
      event.resolved = true;
    }

  const captain = team.players.find((player) => player.id === captainId)!;
  const name = captain.name;
  g.news.unshift(
    evaluation.verdict === "revolt" || evaluation.verdict === "upset"
      ? tx(
          g,
          `${name} — новый капитан ${team.id}. В раздевалке недовольны решением.`,
          `${name} is the new ${team.id} captain. The room is not happy about it.`,
        )
      : appointedNewCaptain
        ? tx(
            g,
            `${name} назначен капитаном ${team.city} ${team.name}.`,
            `${name} named captain of the ${team.city} ${team.name}.`,
          )
        : tx(
            g,
            `${team.id} обновили лидерскую группу. Капитан — ${name}.`,
            `${team.id} reshuffle the leadership group. ${name} keeps the C.`,
          ),
  );

  let letterEventId: string | undefined;
  const stripped = evaluation.stripped?.player;
  if (
    stripped &&
    stripped.id === previousCaptainId &&
    !(g.leadershipLog ?? []).some(
      (entry) => entry.year === g.year && entry.previousCaptainId === stripped.id,
    )
  )
    letterEventId = sendCaptaincyLetter(g, stripped, captain, evaluation);

  (g.leadershipLog ??= []).unshift({
    date,
    year: g.year,
    captainId,
    alternateIds: [...alternateIds],
    previousCaptainId: stripped?.id,
    approval: evaluation.approval,
    verdict: evaluation.verdict,
    letterEventId,
  });
  g.leadershipLog = g.leadershipLog.slice(0, 30);
  return { applied: true, evaluation, letterEventId };
}

// --- the stripped captain's letter ------------------------------------------

export type CaptaincyReply = "explain" | "apologise" | "stand-firm";

function sendCaptaincyLetter(
  g: Game,
  former: Player,
  captain: Player,
  evaluation: LeadershipEvaluation,
) {
  const date = g.calendar?.date ?? `${g.year}-09-15`;
  const demoted = evaluation.stripped?.demotedTo === "A";
  const bad = evaluation.approval < 48;
  const opener = pickBy(
    [
      {
        ru: "Тренер, я узнал обо всём вместе с остальными.",
        en: "Coach, I found out with everyone else.",
      },
      {
        ru: "Тренер, мне нужно услышать это от вас лично.",
        en: "Coach, I need to hear this from you directly.",
      },
      {
        ru: "Тренер, буду говорить прямо.",
        en: "Coach, I'll be straight with you.",
      },
    ] as const,
    `letter:${g.seed}:${former.id}:${date}`,
  );
  const core = demoted
    ? {
        ru: `Я носил «C», а теперь у меня «A», и капитан — ${captain.name}.`,
        en: `I wore the C. Now I have an A and ${captain.name} is captain.`,
      }
    : {
        ru: `Я носил «C», а теперь я вне лидерской группы. Капитан — ${captain.name}.`,
        en: `I wore the C. Now I'm out of the leadership group and ${captain.name} is captain.`,
      };
  const room = bad
    ? {
        ru: "Ребята в шоке, и они спрашивают меня, что произошло. Я не знаю, что им ответить.",
        en: "The guys are stunned and they're asking me what happened. I don't know what to tell them.",
      }
    : {
        ru: "Я приму любое решение, но хочу знать, в чём я ошибся.",
        en: "I'll live with it, but I want to know what I did wrong.",
      };
  const ask = { ru: "Почему?", en: "Why?" };
  const body = [opener, core, room, ask].map((part) => tx(g, part.ru, part.en));
  const replies: { id: CaptaincyReply; label: L; detail: L }[] = [
    {
      id: "explain",
      label: { ru: "Объяснить решение", en: "Explain the decision" },
      detail: {
        ru: "Спокойно разобрать причины. Сработает, если выбор защитим.",
        en: "Walk him through the reasons. Works if the choice holds up.",
      },
    },
    {
      id: "apologise",
      label: {
        ru: "Извиниться и пообещать роль",
        en: "Apologise, promise a role",
      },
      detail: {
        ru: "Смягчит его, но новый капитан почувствует, что его подрывают.",
        en: "Softens him, but the new captain will feel undermined.",
      },
    },
    {
      id: "stand-firm",
      label: { ru: "Стоять на своём", en: "Stand firm" },
      detail: {
        ru: "Решение окончательное. Он может попросить обмен.",
        en: "The decision is final. He may ask for a trade.",
      },
    },
  ];
  const before = new Set((g.events ?? []).map((event) => event.id));
  pushEvent(g, {
    date,
    category: "organization",
    priority: "high",
    kind: "captaincy-letter",
    title: tx(
      g,
      `Письмо от ${former.name}: «Почему?»`,
      `Letter from ${former.name}: "Why?"`,
    ),
    body: body.join(" "),
    playerId: former.id,
    teamId: g.user,
    action: "leadership",
    requiresResponse: true,
    responseDue: date,
    approval: evaluation.approval,
    replies: replies.map((reply) => ({
      id: reply.id,
      label: tx(g, reply.label.ru, reply.label.en),
      detail: tx(g, reply.detail.ru, reply.detail.en),
    })),
  });
  return g.events!.find((event) => !before.has(event.id))?.id;
}

/** Answers an inbox message that offers reply options. Effects apply once. */
export function answerEvent(g: Game, eventId: string, replyId: string) {
  const event = g.events?.find((item) => item.id === eventId);
  if (!event?.replies || event.replyId) return undefined;
  if (!event.replies.some((reply) => reply.id === replyId)) return undefined;
  if (event.kind === "captaincy-letter")
    return answerCaptaincyLetter(g, event, replyId as CaptaincyReply);
  event.replyId = replyId;
  event.read = true;
  event.resolved = true;
  return event.replyOutcome;
}

function answerCaptaincyLetter(
  g: Game,
  event: ManagementEvent,
  reply: CaptaincyReply,
) {
  const team = userTeam(g);
  const player = team.players.find((item) => item.id === event.playerId);
  event.replyId = reply;
  event.read = true;
  event.resolved = true;
  if (!player) {
    event.replyOutcome = tx(
      g,
      "Игрок уже покинул клуб.",
      "The player has already left the club.",
    );
    return event.replyOutcome;
  }
  const approval = event.approval ?? 50;
  let morale = 0;
  let relationship = 0;
  let outcome: L;
  if (reply === "explain") {
    if (approval >= 48) {
      morale = 3;
      relationship = 4;
      outcome = {
        ru: `${player.name} не согласен, но принял объяснение. «Ладно. Я буду помогать».`,
        en: `${player.name} doesn't agree but accepts it. "Fine. I'll help where I can."`,
      };
    } else {
      morale = -2;
      relationship = -3;
      outcome = {
        ru: `${player.name} не верит объяснению. «Вы сами в это не верите».`,
        en: `${player.name} doesn't buy it. "You don't believe that yourself."`,
      };
    }
  } else if (reply === "apologise") {
    morale = 5;
    relationship = 6;
    const captain = team.players.find((item) => item.id === team.captainId);
    if (captain && captain.id !== player.id)
      captain.relationship = clamp((captain.relationship ?? 50) - 3, 0, 100);
    outcome =
      captain && captain.id !== player.id
        ? {
            ru: `${player.name} оценил извинение. ${captain.name} узнал о разговоре и чувствует, что его авторитет подрывают.`,
            en: `${player.name} appreciates the apology. ${captain.name} heard about it and feels undermined.`,
          }
        : {
            ru: `${player.name} оценил извинение.`,
            en: `${player.name} appreciates the apology.`,
          };
  } else {
    morale = -5;
    relationship = -7;
    outcome = {
      ru: `${player.name}: «Понял. Больше вопросов нет».`,
      en: `${player.name}: "Understood. No more questions."`,
    };
  }
  player.morale = clamp(player.morale + morale, 0, 100);
  player.relationship = clamp((player.relationship ?? 50) + relationship, 0, 100);
  if (
    reply === "stand-firm" &&
    !player.tradeRequest &&
    ((player.relationship ?? 50) < 40 || player.morale < 35 || approval < 30)
  ) {
    player.tradeRequest = { year: g.year, reason: "captaincy" };
    outcome = {
      ru: `${outcome.ru} Агент ${player.name} сообщил, что игрок просит обмен.`,
      en: `${outcome.en} ${player.name}'s agent says he wants a trade.`,
    };
    g.news.unshift(
      tx(
        g,
        `${player.name} попросил обмен после потери капитанства.`,
        `${player.name} requests a trade after losing the captaincy.`,
      ),
    );
  }
  event.replyOutcome = tx(g, outcome.ru, outcome.en);
  event.replyEffects = { morale, relationship };
  return event.replyOutcome;
}
