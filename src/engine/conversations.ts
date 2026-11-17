import { clamp } from "./random";
import type { ConversationLine, Game, Player, Team } from "./types";
import { syncMoraleBonus } from "./franchiseWorld";
import {
  dialogueLang,
  enPlural,
  hashText,
  joinL,
  pickBy,
  ruPlural,
  say,
  type DialogueLang,
  type L,
} from "./dialogueText";
import {
  FOLLOW_UP_LABELS,
  FOLLOW_UP_REPLIES,
  MANAGER_OPENINGS,
  OUTCOME_NOTES,
  OUTCOME_SUMMARIES,
  PERSONA_TAILS,
  REPLY_CORES,
  REPLY_LEADS,
  followUpManagerLines,
  render,
  type ConversationCtx,
  type ConversationMood,
  type FollowUpKind,
  type Persona,
} from "./conversationLines";

export type { ConversationMood, FollowUpKind } from "./conversationLines";

export type ConversationTopic =
  | "role"
  | "form"
  | "contract"
  | "development"
  | "ice-time"
  | "morale"
  | "injury"
  | "future";
export type ConversationTone =
  "supportive" | "calm" | "direct" | "demanding" | "challenge" | "promise";

export const CONVERSATION_TOPICS: Record<ConversationTopic, L> = {
  role: { ru: "Роль в команде", en: "Team role" },
  form: { ru: "Текущая форма", en: "Current form" },
  contract: { ru: "Контракт", en: "Contract" },
  development: { ru: "Развитие", en: "Development" },
  "ice-time": { ru: "Игровое время", en: "Ice time" },
  morale: { ru: "Настроение", en: "Morale" },
  injury: { ru: "Травма и восстановление", en: "Injury recovery" },
  future: { ru: "Будущее в клубе", en: "Future with the club" },
};

export const CONVERSATION_TONES: Record<ConversationTone, L> = {
  supportive: { ru: "Поддержать", en: "Supportive" },
  calm: { ru: "Спокойно объяснить", en: "Calm" },
  direct: { ru: "Сказать прямо", en: "Direct" },
  demanding: { ru: "Потребовать результата", en: "Demanding" },
  challenge: { ru: "Бросить вызов", en: "Challenge" },
  promise: { ru: "Дать обещание", en: "Make a promise" },
};

export const CONVERSATION_MOODS: Record<ConversationMood, L> = {
  positive: { ru: "Воодушевлён", en: "Encouraged" },
  neutral: { ru: "Сдержан", en: "Guarded" },
  negative: { ru: "Раздражён", en: "Frustrated" },
};

/** Maximum exchanges (manager line + player reply) in one meeting. */
export const MAX_EXCHANGES = 4;

export interface ConversationTurn {
  speaker: "manager" | "player";
  text: L;
  mood?: ConversationMood;
  /** Tone / follow-up label shown above a manager bubble. */
  label?: L;
}

export interface ConversationState {
  playerId: string;
  topic: ConversationTopic;
  tone: ConversationTone;
  year: number;
  round: number;
  turns: ConversationTurn[];
  score: number;
  mood: ConversationMood;
  exchanges: number;
  used: FollowUpKind[];
  modifiers: { morale: number; relationship: number; motivation: number };
  finished: boolean;
  promise?: boolean;
  target?: boolean;
  ultimatum?: boolean;
}

export interface FollowUpOption {
  kind: FollowUpKind;
  label: L;
  hint: L;
  line: L;
  closes: boolean;
}

export interface ConversationEffects {
  outcome: ConversationMood;
  moraleDelta: number;
  relationshipDelta: number;
  motivationDelta: number;
}

export interface ConversationResult extends ConversationEffects {
  /** Opening manager line in the game's language (kept for old callers). */
  managerLine: string;
  /** Player's final reply in the game's language (kept for old callers). */
  response: string;
  managerLineI18n: L;
  responseI18n: L;
  summary: L;
  transcript: ConversationTurn[];
  exchanges: number;
}

// ---------------------------------------------------------------------------
// Player context
// ---------------------------------------------------------------------------

const FORWARD_SLOTS: { slot: L; slotIn: L; toi: number }[] = [
  {
    slot: { ru: "первое звено", en: "the first line" },
    slotIn: { ru: "в первом звене", en: "on the first line" },
    toi: 19,
  },
  {
    slot: { ru: "второе звено", en: "the second line" },
    slotIn: { ru: "во втором звене", en: "on the second line" },
    toi: 16.5,
  },
  {
    slot: { ru: "третье звено", en: "the third line" },
    slotIn: { ru: "в третьем звене", en: "on the third line" },
    toi: 13.5,
  },
  {
    slot: { ru: "четвёртое звено", en: "the fourth line" },
    slotIn: { ru: "в четвёртом звене", en: "on the fourth line" },
    toi: 10,
  },
];
const DEFENSE_SLOTS: { slot: L; slotIn: L; toi: number }[] = [
  {
    slot: { ru: "первая пара", en: "the top pair" },
    slotIn: { ru: "в первой паре", en: "on the top pair" },
    toi: 22.5,
  },
  {
    slot: { ru: "вторая пара", en: "the second pair" },
    slotIn: { ru: "во второй паре", en: "on the second pair" },
    toi: 19,
  },
  {
    slot: { ru: "третья пара", en: "the third pair" },
    slotIn: { ru: "в третьей паре", en: "on the third pair" },
    toi: 15.5,
  },
];

const allTeamPlayers = (team: Team) => [
  ...team.players,
  ...(team.farm ?? []),
  ...(team.prospects ?? []),
];

function findPlayer(game: Game, playerId: string) {
  for (const team of game.teams) {
    const player = allTeamPlayers(team).find((item) => item.id === playerId);
    if (player) return { player, team };
  }
  return undefined;
}

const clock = (minutes: number) => {
  const whole = Math.floor(minutes);
  const seconds = Math.round((minutes - whole) * 60);
  return `${whole}:${String(seconds === 60 ? 59 : seconds).padStart(2, "0")}`;
};

const ruGames = (n: number) =>
  `${n} ${ruPlural(n, "матче", "матчах", "матчах")}`;

export function conversationContext(
  player: Player,
  team?: Team,
): ConversationCtx {
  const goalie = player.pos === "G";
  const defense = player.pos === "D";
  const lineIndex =
    team?.lines.findIndex((line) => line.includes(player.id)) ?? -1;
  const pairIndex =
    team?.defense.findIndex((pair) => pair.includes(player.id)) ?? -1;
  const starter = team?.goalie === player.id;
  const onFarm = !!team?.farm?.some((item) => item.id === player.id);
  let slot: L = { ru: "резерв", en: "a reserve role" };
  let slotIn: L = onFarm
    ? { ru: "в фарм-клубе", en: "in the AHL" }
    : { ru: "в резерве", en: "in reserve" };
  let expectedToi = 0;
  if (goalie) {
    slot = starter
      ? { ru: "место основного вратаря", en: "the starting job" }
      : { ru: "роль сменщика", en: "the backup role" };
    slotIn = starter
      ? { ru: "в роли основного вратаря", en: "as the starter" }
      : { ru: "в роли сменщика", en: "as the backup" };
  } else if (lineIndex >= 0 && FORWARD_SLOTS[lineIndex]) {
    ({ slot, slotIn, toi: expectedToi } = FORWARD_SLOTS[lineIndex]);
  } else if (pairIndex >= 0 && DEFENSE_SLOTS[pairIndex]) {
    ({ slot, slotIn, toi: expectedToi } = DEFENSE_SLOTS[pairIndex]);
  }
  const rank = team
    ? [...team.players]
        .sort((a, b) => b.ovr - a.ovr)
        .findIndex((p) => p.id === player.id)
    : -1;
  const star = player.ovr >= 88 || (rank >= 0 && rank < 3);
  const depth =
    !star &&
    (onFarm ||
      (goalie
        ? !starter
        : lineIndex === 3 ||
          pairIndex === 2 ||
          (lineIndex < 0 && pairIndex < 0)));
  const last = player.history?.length
    ? player.history[player.history.length - 1]
    : undefined;
  const stats = player.stats.gp ? player.stats : undefined;
  const source = stats ?? (last?.stats.gp ? last.stats : undefined);
  const lastSeason = !stats && !!source;
  let usage: L;
  let stat: L;
  if (goalie) {
    const gp = source?.gp ?? 0;
    usage = gp
      ? {
          ru: `${gp} ${ruPlural(gp, "матч", "матча", "матчей")} в воротах${lastSeason ? " в прошлом сезоне" : ""}`,
          en: `${gp} ${enPlural(gp, "game", "games")} in net${lastSeason ? " last season" : ""}`,
        }
      : {
          ru: `пока ни одного матча ${slotIn.ru}`,
          en: `no games yet ${slotIn.en}`,
        };
    const sa = source?.sa ?? 0;
    const pct = sa ? (sa - (source?.ga ?? 0)) / sa : 0;
    stat = sa
      ? {
          ru: `${(pct * 100).toFixed(1).replace(".", ",")}% отражённых бросков${lastSeason ? " в прошлом сезоне" : ""}`,
          en: `a ${pct.toFixed(3).replace(/^0/, "")} save percentage${lastSeason ? " last season" : ""}`,
        }
      : {
          ru: "пока ни одного матча в сезоне",
          en: "no games played yet this season",
        };
  } else {
    const gp = source?.gp ?? 0;
    const toi = gp ? (source!.toi || 0) / gp : 0;
    usage =
      gp && toi > 0
        ? {
            ru: `${clock(toi)} за матч ${slotIn.ru}${lastSeason ? " в прошлом сезоне" : ""}`,
            en: `${clock(toi)} a night ${slotIn.en}${lastSeason ? " last season" : ""}`,
          }
        : expectedToi
          ? {
              ru: `около ${clock(expectedToi)} за матч ${slotIn.ru}`,
              en: `around ${clock(expectedToi)} a night ${slotIn.en}`,
            }
          : {
              ru: `место ${slotIn.ru} без гарантированных смен`,
              en: `a spot ${slotIn.en} with no guaranteed shifts`,
            };
    const pts = (source?.g ?? 0) + (source?.a ?? 0);
    stat = gp
      ? lastSeason
        ? {
            ru: `${pts} ${ruPlural(pts, "очко", "очка", "очков")} в прошлом сезоне`,
            en: `${pts} ${enPlural(pts, "point", "points")} last season`,
          }
        : {
            ru: `${pts} ${ruPlural(pts, "очко", "очка", "очков")} в ${ruGames(gp)}`,
            en: `${pts} ${enPlural(pts, "point", "points")} in ${gp} ${enPlural(gp, "game", "games")}`,
          }
      : {
          ru: "пока ни одного матча в сезоне",
          en: "no games played yet this season",
        };
  }
  const years = player.years;
  const contract: L =
    years <= 1
      ? { ru: "последний год контракта", en: "one year left on the deal" }
      : {
          ru: `ещё ${years} ${ruPlural(years, "год", "года", "лет")} по контракту`,
          en: `${years} years left on the deal`,
        };
  const games = Math.max(1, player.injury);
  return {
    name: player.name,
    first: player.name.split(" ")[0],
    goalie,
    defense,
    age: player.age,
    veteran: player.age >= 31,
    young: player.age <= 23,
    star,
    depth,
    injured: player.injury > 0,
    expiring: years <= 1,
    usage,
    slot,
    slotIn,
    stat,
    contract,
    injuryLine: {
      ru: `ещё примерно ${games} ${ruPlural(games, "игра", "игры", "игр")}`,
      en: `about ${games} more ${enPlural(games, "game", "games")}`,
    },
    salary: player.salary.toFixed(player.salary % 1 ? 2 : 0).replace(/0$/, ""),
    noGames: !source,
  };
}

function personaOf(
  ctx: ConversationCtx,
  topic: ConversationTopic,
): Persona | undefined {
  if (ctx.goalie) return "goalie";
  if (ctx.expiring && topic !== "contract") return "expiring";
  if (ctx.star) return "star";
  if (ctx.veteran) return "veteran";
  if (ctx.young) return "young";
  if (ctx.depth) return "depth";
  return undefined;
}

// ---------------------------------------------------------------------------
// Opening lines and options
// ---------------------------------------------------------------------------

const seedFor = (
  game: Game | undefined,
  player: Player | undefined,
  ...parts: (string | number)[]
) =>
  [
    game?.seed ?? 0,
    player?.id ?? "-",
    game?.year ?? 0,
    game?.round ?? 0,
    ...parts,
  ].join(":");

function openingLine(
  topic: ConversationTopic,
  tone: ConversationTone,
  player?: Player,
  game?: Game,
): L {
  const variants = MANAGER_OPENINGS[topic][tone];
  if (!player) return render(variants[0], placeholderCtx);
  const team = game ? findPlayer(game, player.id)?.team : undefined;
  const ctx = conversationContext(player, team);
  return render(
    pickBy(variants, seedFor(game, player, "open", topic, tone)),
    ctx,
  );
}

const placeholderCtx: ConversationCtx = {
  name: "",
  first: "",
  goalie: false,
  defense: false,
  age: 27,
  veteran: false,
  young: false,
  star: false,
  depth: false,
  injured: false,
  expiring: false,
  usage: { ru: "", en: "" },
  slot: { ru: "", en: "" },
  slotIn: { ru: "", en: "" },
  stat: { ru: "", en: "" },
  contract: { ru: "", en: "" },
  injuryLine: { ru: "", en: "" },
  salary: "",
  noGames: true,
};

/**
 * Tone choices for the opening line. With a player and game the line is the
 * player-specific variant; `line` is in the game's language (Russian when no
 * game is passed, matching the original API).
 */
export function conversationOptions(
  topic: ConversationTopic,
  player?: Player,
  game?: Game,
) {
  const lang = game ? dialogueLang(game.language) : "ru";
  return (Object.keys(CONVERSATION_TONES) as ConversationTone[]).map((tone) => {
    const text = openingLine(topic, tone, player, game);
    return { tone, line: text[lang], text, label: CONVERSATION_TONES[tone] };
  });
}

const CONCERNS = {
  morale: { ru: "низкая мораль", en: "low morale" },
  form: { ru: "плохая форма", en: "poor form" },
  contract: { ru: "истекающий контракт", en: "expiring contract" },
  injury: { ru: "восстановление после травмы", en: "injury recovery" },
  fatigue: { ru: "высокая нагрузка", en: "heavy workload" },
  relationship: {
    ru: "напряжённые отношения с руководством",
    en: "strained relationship with management",
  },
  none: { ru: "серьёзных проблем нет", en: "no major concerns" },
} satisfies Record<string, L>;

export function playerConcerns(player: Player, language: string = "ru") {
  const lang = dialogueLang(language);
  const concerns: L[] = [];
  if (player.morale < 55) concerns.push(CONCERNS.morale);
  if ((player.performanceForm ?? 0) < -15) concerns.push(CONCERNS.form);
  if (player.years <= 1) concerns.push(CONCERNS.contract);
  if (player.injury > 0) concerns.push(CONCERNS.injury);
  if (player.fatigue >= 25) concerns.push(CONCERNS.fatigue);
  if ((player.relationship ?? 50) < 40) concerns.push(CONCERNS.relationship);
  return (concerns.length ? concerns : [CONCERNS.none]).map(
    (item) => item[lang],
  );
}

/** Suggested opening topic for the player's current situation. */
export function suggestedTopic(player: Player): ConversationTopic {
  if (player.injury > 0) return "injury";
  if (player.years <= 1) return "contract";
  if (player.morale < 45) return "morale";
  if ((player.performanceForm ?? 0) < 0) return "form";
  return "role";
}

export function externalContactEligibility(game: Game, playerId: string) {
  const owner = game.teams.find((team) =>
    [...team.players, ...(team.farm ?? [])].some(
      (player) => player.id === playerId,
    ),
  );
  if (!owner) {
    const freeAgent = game.freeAgents?.some((player) => player.id === playerId);
    if (freeAgent)
      return {
        allowed: true,
        reason:
          "Свободный агент доступен для официальных переговоров через агента",
      };
    if (game.internationalMarket?.some((item) => item.player.id === playerId))
      return {
        allowed: false,
        reason:
          "Сначала завершите скаутинг и установите контакт через международный рынок",
      };
    if (game.juniorPlayers?.some((player) => player.id === playerId))
      return {
        allowed: false,
        reason: "Прямой контакт ограничен юниорскими правами и правилами лиги",
      };
    return {
      allowed: false,
      reason: "Организация и статус прав игрока не установлены",
    };
  }
  if (owner.id === game.user)
    return { allowed: true, reason: "Игрок вашей организации" };
  const player = [...owner.players, ...(owner.farm ?? [])].find(
    (item) => item.id === playerId,
  )!;
  const rank = [...owner.players]
    .sort((a, b) => b.ovr - a.ovr)
    .findIndex((item) => item.id === playerId);
  if (rank >= 0 && rank < 5)
    return {
      allowed: false,
      reason: "Клуб запретил контакт с ключевым игроком",
    };
  if (player.years > 1 && player.morale >= 60)
    return {
      allowed: false,
      reason: "У игрока долгосрочный контракт и нет интереса к переходу",
    };
  return {
    allowed: true,
    reason: "Допустим только официальный запрос через клуб и агента",
  };
}

// ---------------------------------------------------------------------------
// Dialogue flow
// ---------------------------------------------------------------------------

const moodFor = (score: number): ConversationMood =>
  score >= 58 ? "positive" : score >= 42 ? "neutral" : "negative";

function openingFit(
  player: Player,
  ctx: ConversationCtx,
  topic: ConversationTopic,
  tone: ConversationTone,
) {
  const relationship = player.relationship ?? 50;
  const resilience = player.attributes.resilience ?? 70;
  const composure = player.attributes.composure ?? 70;
  const form = player.performanceForm ?? 0;
  let fit = 0;
  if (tone === "supportive") fit = player.morale < 70 || player.injury ? 17 : 6;
  if (tone === "calm") fit = composure < 65 ? 11 : 8;
  if (tone === "direct") fit = composure >= 72 ? 12 : -4;
  if (tone === "demanding") fit = resilience >= 72 ? 8 : -10;
  if (tone === "challenge") fit = resilience >= 78 ? 16 : -12;
  if (tone === "promise") fit = relationship >= 65 ? 14 : -15;
  if (topic === "form") fit += form < 0 ? 8 : -2;
  if (topic === "contract") fit += player.years <= 1 ? 9 : -5;
  if (topic === "development") fit += player.age <= 25 ? 8 : -2;
  if (topic === "injury") fit += player.injury > 0 ? 10 : -4;
  if (topic === "morale") fit += player.morale < 60 ? 8 : -3;
  if (topic === "ice-time") fit += player.fatigue < 20 ? 3 : -4;
  // Personality: veterans respect straight talk, young players respond to
  // support, stars bristle at being told off, depth players value promises.
  if (ctx.veteran) {
    if (tone === "direct" || tone === "demanding") fit += 3;
    if (topic === "development") fit -= 4;
  }
  if (ctx.young && (tone === "supportive" || tone === "calm")) fit += 3;
  if (ctx.star && (tone === "direct" || tone === "demanding")) fit -= 3;
  if (ctx.depth && tone === "promise") fit += 4;
  if (player.morale < 45 && (tone === "demanding" || tone === "challenge"))
    fit -= 5;
  if (form > 15 && tone === "challenge") fit += 4;
  return relationship + fit;
}

function playerReply(
  game: Game,
  player: Player,
  ctx: ConversationCtx,
  topic: ConversationTopic,
  mood: ConversationMood,
  seed: string,
): L {
  const lead =
    hashText(`${seed}:lead`) % 4 !== 0
      ? pickBy(REPLY_LEADS[mood], `${seed}:lead-pick`)
      : undefined;
  const core = render(pickBy(REPLY_CORES[topic][mood], `${seed}:core`), ctx);
  const persona = personaOf(ctx, topic);
  const tail =
    persona && hashText(`${seed}:tail`) % 3 !== 1
      ? PERSONA_TAILS[persona][mood]
      : undefined;
  return joinL(lead, core, tail);
}

/**
 * Starts a meeting: the manager's opening line and the player's first reply.
 * Pure — nothing on the game changes until {@link concludeConversation}.
 */
export function openConversation(
  game: Game,
  playerId: string,
  topic: ConversationTopic,
  tone: ConversationTone,
): ConversationState {
  const found = findPlayer(game, playerId);
  if (!found) throw Error("Player unavailable");
  const { player, team } = found;
  if (player.lastConversationRound === game.round)
    throw Error("С этим игроком уже говорили в текущем туре");
  const ctx = conversationContext(player, team);
  const score = openingFit(player, ctx, topic, tone);
  const mood = moodFor(score);
  const managerText = openingLine(topic, tone, player, game);
  const reply = playerReply(
    game,
    player,
    ctx,
    topic,
    mood,
    seedFor(game, player, "reply", topic, tone),
  );
  return {
    playerId,
    topic,
    tone,
    year: game.year,
    round: game.round,
    turns: [
      {
        speaker: "manager",
        text: managerText,
        label: CONVERSATION_TONES[tone],
      },
      { speaker: "player", text: reply, mood },
    ],
    score,
    mood,
    exchanges: 1,
    used: [],
    modifiers: { morale: 0, relationship: 0, motivation: 0 },
    finished: false,
  };
}

const CONTINUING: FollowUpKind[] = [
  "listen",
  "reassure",
  "raise-bar",
  "hold-line",
];

/** Follow-up choices that fit the player's last reply and mood. */
export function conversationFollowUps(
  game: Game,
  state: ConversationState,
): FollowUpOption[] {
  if (state.finished) return [];
  const found = findPlayer(game, state.playerId);
  if (!found) return [];
  const last = state.exchanges >= MAX_EXCHANGES - 1;
  const fresh = (kind: FollowUpKind) => !state.used.includes(kind);
  let kinds: FollowUpKind[];
  if (state.mood === "positive")
    kinds = last
      ? ["target", "promise", "wrap-up"]
      : ["raise-bar", "target", "promise", "wrap-up"];
  else if (state.mood === "neutral")
    kinds = last
      ? ["compromise", "target", "promise", "wrap-up"]
      : ["listen", "hold-line", "compromise", "target"];
  else
    kinds = last
      ? ["compromise", "promise", "ultimatum", "wrap-up"]
      : fresh("listen")
        ? ["listen", "reassure", "ultimatum", "wrap-up"]
        : ["reassure", "hold-line", "ultimatum", "wrap-up"];
  kinds = kinds.filter((kind) => kind === "wrap-up" || fresh(kind));
  if (!kinds.includes("wrap-up") && kinds.length < 3) kinds.push("wrap-up");
  const ctx = conversationContext(found.player, found.team);
  return kinds.slice(0, 4).map((kind) => ({
    kind,
    label: FOLLOW_UP_LABELS[kind].label,
    hint: FOLLOW_UP_LABELS[kind].hint,
    line: render(
      pickBy(
        followUpManagerLines(kind, state.topic, state.mood),
        seedFor(
          game,
          found.player,
          "follow",
          state.topic,
          kind,
          state.exchanges,
        ),
      ),
      ctx,
    ),
    closes: last || !CONTINUING.includes(kind),
  }));
}

function followUpImpact(
  kind: FollowUpKind,
  mood: ConversationMood,
  player: Player,
  ctx: ConversationCtx,
) {
  const resilience = player.attributes.resilience ?? 70;
  const composure = player.attributes.composure ?? 70;
  const relationship = player.relationship ?? 50;
  const impact = { fit: 0, morale: 0, relationship: 0, motivation: 0 };
  switch (kind) {
    case "listen":
      impact.fit = mood === "negative" ? 12 : mood === "neutral" ? 7 : 2;
      impact.relationship = 2;
      break;
    case "reassure":
      impact.fit =
        mood === "negative"
          ? player.morale < 55
            ? 11
            : 6
          : mood === "neutral"
            ? 4
            : 1;
      if (ctx.star && composure >= 75) impact.fit -= 3;
      impact.morale = 2;
      break;
    case "target":
      impact.fit =
        mood === "positive"
          ? 6
          : mood === "neutral"
            ? (player.motivation ?? 50) >= 50
              ? 4
              : -3
            : -5;
      impact.motivation = 4;
      break;
    case "promise":
      impact.fit =
        mood === "negative"
          ? relationship >= 60
            ? 6
            : -2
          : relationship >= 55 || ctx.depth
            ? 10
            : 3;
      impact.morale = 3;
      impact.relationship = 1;
      break;
    case "raise-bar":
      impact.fit = resilience >= 75 || ctx.veteran || ctx.star ? 6 : -4;
      impact.motivation = 5;
      break;
    case "hold-line":
      impact.fit = (resilience >= 72 ? 3 : -6) - (mood === "negative" ? 4 : 0);
      impact.relationship = -2;
      impact.motivation = 2;
      break;
    case "compromise":
      impact.fit = mood === "negative" ? 6 : mood === "neutral" ? 5 : 2;
      impact.relationship = 1;
      break;
    case "ultimatum":
      impact.fit = resilience >= 80 ? -2 : -12;
      impact.relationship = -6;
      impact.morale = -3;
      impact.motivation = resilience >= 78 ? 6 : -4;
      break;
    case "wrap-up":
      impact.fit = mood === "positive" ? 1 : mood === "neutral" ? 0 : -2;
      break;
  }
  return impact;
}

/** Applies a manager follow-up and the player's answer. Pure. */
export function continueConversation(
  game: Game,
  state: ConversationState,
  kind: FollowUpKind,
): ConversationState {
  if (state.finished) return state;
  const option = conversationFollowUps(game, state).find(
    (item) => item.kind === kind,
  );
  if (!option) throw Error(`Follow-up ${kind} is not available`);
  const found = findPlayer(game, state.playerId)!;
  const ctx = conversationContext(found.player, found.team);
  const impact = followUpImpact(kind, state.mood, found.player, ctx);
  const score = state.score + impact.fit;
  const mood = moodFor(score);
  const seed = seedFor(
    game,
    found.player,
    "answer",
    state.topic,
    kind,
    state.exchanges,
  );
  let reply = render(pickBy(FOLLOW_UP_REPLIES[kind][mood], seed), ctx);
  const persona = personaOf(ctx, state.topic);
  if (persona && !option.closes && hashText(`${seed}:tail`) % 4 === 0)
    reply = joinL(reply, PERSONA_TAILS[persona][mood]);
  return {
    ...state,
    turns: [
      ...state.turns,
      { speaker: "manager", text: option.line, label: option.label },
      { speaker: "player", text: reply, mood },
    ],
    score,
    mood,
    exchanges: state.exchanges + 1,
    used: [...state.used, kind],
    modifiers: {
      morale: state.modifiers.morale + impact.morale,
      relationship: state.modifiers.relationship + impact.relationship,
      motivation: state.modifiers.motivation + impact.motivation,
    },
    finished: option.closes,
    promise: state.promise || kind === "promise",
    target: state.target || kind === "target",
    ultimatum: state.ultimatum || kind === "ultimatum",
  };
}

/** The effects the meeting would have if it ended now. */
export function conversationEffects(
  state: ConversationState,
  abrupt = false,
): ConversationEffects {
  const outcome = state.mood;
  const warm =
    state.tone === "supportive" ||
    state.tone === "promise" ||
    state.used.includes("promise") ||
    state.used.includes("reassure");
  const driven =
    state.tone === "challenge" ||
    state.tone === "demanding" ||
    state.used.includes("target") ||
    state.used.includes("raise-bar");
  const baseMorale =
    outcome === "positive" ? (warm ? 6 : 3) : outcome === "neutral" ? 0 : -6;
  const baseRelationship =
    outcome === "positive" ? 4 : outcome === "neutral" ? 1 : -7;
  const baseMotivation =
    outcome === "positive" ? (driven ? 9 : 5) : outcome === "neutral" ? 1 : -8;
  return {
    outcome,
    moraleDelta: clamp(baseMorale + state.modifiers.morale, -12, 12),
    relationshipDelta: clamp(
      baseRelationship + state.modifiers.relationship - (abrupt ? 2 : 0),
      -12,
      10,
    ),
    motivationDelta: clamp(
      baseMotivation + state.modifiers.motivation,
      -12,
      14,
    ),
  };
}

function outcomeSummary(
  game: Game,
  state: ConversationState,
  abrupt: boolean,
): L {
  const base = pickBy(
    OUTCOME_SUMMARIES[state.mood],
    `${game.seed}:${state.playerId}:${state.year}:${state.round}:summary`,
  );
  return joinL(
    base,
    state.promise && OUTCOME_NOTES.promise,
    state.target && !state.promise && OUTCOME_NOTES.target,
    state.ultimatum && OUTCOME_NOTES.ultimatum,
    abrupt && OUTCOME_NOTES.abrupt,
  );
}

/**
 * Ends the meeting and applies morale, relationship and motivation once.
 * Throws if this player already had a meeting in the current round.
 */
export function concludeConversation(
  game: Game,
  state: ConversationState,
  options: { abrupt?: boolean } = {},
): ConversationResult {
  const found = findPlayer(game, state.playerId);
  if (!found) throw Error("Player unavailable");
  const { player } = found;
  if (player.lastConversationRound === game.round)
    throw Error("С этим игроком уже говорили в текущем туре");
  const abrupt = !!options.abrupt && !state.finished && state.exchanges > 1;
  const effects = conversationEffects(state, abrupt);
  const summary = outcomeSummary(game, state, abrupt);
  const lang = dialogueLang(game.language);
  const managerLineI18n = state.turns[0].text;
  const responseI18n = [...state.turns]
    .reverse()
    .find((turn) => turn.speaker === "player")!.text;
  player.morale = clamp(player.morale + effects.moraleDelta, 20, 100);
  player.relationship = clamp(
    (player.relationship ?? 50) + effects.relationshipDelta,
    0,
    100,
  );
  player.motivation = clamp(
    (player.motivation ?? 50) + effects.motivationDelta,
    0,
    100,
  );
  syncMoraleBonus(player);
  player.lastConversationRound = game.round;
  const transcript: ConversationLine[] = state.turns.map((turn) => ({
    speaker: turn.speaker,
    ru: turn.text.ru,
    en: turn.text.en,
    ...(turn.mood ? { mood: turn.mood } : {}),
  }));
  (player.conversationHistory ??= []).unshift({
    year: game.year,
    round: game.round,
    topic: state.topic,
    tone: state.tone,
    managerLine: managerLineI18n[lang],
    response: responseI18n[lang],
    managerLineI18n,
    responseI18n,
    summary,
    transcript,
    exchanges: state.exchanges,
    outcome: effects.outcome,
    moraleDelta: effects.moraleDelta,
    relationshipDelta: effects.relationshipDelta,
    motivationDelta: effects.motivationDelta,
  });
  // Full transcripts are kept for the most recent meetings only.
  player.conversationHistory = player.conversationHistory
    .slice(0, 30)
    .map((entry, index) =>
      index < 6 ? entry : { ...entry, transcript: undefined },
    );
  game.news.unshift(`${player.name}: ${responseI18n[lang]}`);
  return {
    ...effects,
    managerLine: managerLineI18n[lang],
    response: responseI18n[lang],
    managerLineI18n,
    responseI18n,
    summary,
    transcript: state.turns,
    exchanges: state.exchanges,
  };
}

/** One-shot meeting (opening exchange only), kept for existing callers. */
export function talkToPlayer(
  game: Game,
  playerId: string,
  topic: ConversationTopic,
  tone: ConversationTone,
) {
  return concludeConversation(
    game,
    openConversation(game, playerId, topic, tone),
  );
}

// ---------------------------------------------------------------------------
// History rendering (handles saves written before the bilingual format)
// ---------------------------------------------------------------------------

type HistoryEntry = NonNullable<Player["conversationHistory"]>[number];

export function conversationEntryText(entry: HistoryEntry, language: string) {
  const lang: DialogueLang = dialogueLang(language);
  const topic = CONVERSATION_TOPICS[entry.topic as ConversationTopic];
  const tone = CONVERSATION_TONES[entry.tone as ConversationTone];
  return {
    topic: topic ? topic[lang] : entry.topic,
    tone: tone ? tone[lang] : entry.tone,
    managerLine: entry.managerLineI18n
      ? say(entry.managerLineI18n, lang)
      : (entry.managerLine ?? ""),
    response: entry.responseI18n
      ? say(entry.responseI18n, lang)
      : entry.response,
    summary: entry.summary ? say(entry.summary, lang) : "",
    transcript: (entry.transcript ?? []).map((line) => ({
      speaker: line.speaker,
      text: line[lang] || line.ru || line.en,
      mood: line.mood,
    })),
  };
}

export const conversationMoodLabel = (
  mood: ConversationMood,
  language: string,
) => CONVERSATION_MOODS[mood][dialogueLang(language)];
