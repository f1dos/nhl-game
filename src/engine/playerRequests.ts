/**
 * Player requests — Football-Manager-style letters from your own players.
 *
 * Players write when something in the real game state bothers (or pleases)
 * them: low ice time for their rating, a demotion, being scratched, a
 * teammate taking their spot, a heavy veteran workload, being sent down,
 * wanting a contender, a new contract, a mentor, more starts in net…
 *
 * Each request is an inbox letter in the player's voice (bilingual at the
 * source, worded by persona and temperament) with three replies:
 * accept / promise, explain / negotiate, refuse. Promises are tracked with a
 * deadline and checked against the game state; a broken promise hurts morale
 * and trust and may turn into a public trade demand. Trade requests put the
 * player on the trade list until he is moved or withdraws the request.
 *
 * Deterministic: triggers read game state, tie-breaks and "luck" use FNV
 * hashing of the seed, date and player — never Math.random.
 */
import { addDays, pushEvent } from "./management";
import { clamp } from "./random";
import { syncMoraleBonus } from "./franchiseWorld";
import { hashText, pickBy, ruPlural, type L } from "./dialogueText";
import type { ConversationTopic } from "./conversations";
import type { Game, ManagementEvent, Player, Team } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const REQUEST_TYPES = [
  "ice-time",
  "trade",
  "contract",
  "stay-nhl",
  "call-up",
  "role",
  "scratched",
  "rest",
  "mentor",
  "teammate",
  "goalie-starts",
  "thanks",
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export type ReplyKind = "accept" | "explain" | "refuse";
export const PROMISE_KINDS = [
  "line",
  "dress",
  "starts",
  "rest",
  "toi-max",
  "callup",
  "stay",
  "contract",
  "trade",
] as const;
export type PromiseKind = (typeof PROMISE_KINDS)[number];
export type RequestStatus =
  "open" | "accepted" | "explained" | "refused" | "expired";
export type PromiseStatus = "active" | "kept" | "broken" | "void";
type Group = "F" | "D" | "G";

export interface RequestContext {
  group: Group;
  /** Unit index the player wants (0 = first line / top pair). */
  unit?: number;
  /** Unit index he played in before a change. */
  fromUnit?: number;
  /** Unit index he plays in now (9 = scratched, 10 = AHL). */
  nowUnit?: number;
  toi?: number;
  rivalId?: string;
  rivalName?: string;
  mentorId?: string;
  mentorName?: string;
  /** Trade request reason. */
  reason?: "unhappy" | "contender" | "blocked" | "public";
  /** Mentor request without a mentor: asks for games instead. */
  devTime?: boolean;
}

export interface PlayerRequest {
  id: string;
  type: RequestType;
  playerId: string;
  playerName: string;
  date: string;
  season: number;
  due: string;
  eventId?: string;
  title: L;
  letter: L;
  context: RequestContext;
  status: RequestStatus;
  reply?: ReplyKind;
  replyDate?: string;
  /** Explain/negotiate worked. */
  persuaded?: boolean;
  reaction?: L;
  promiseId?: string;
  effects?: { morale: number; relationship: number; motivation: number };
}

export interface PlayerPromise {
  id: string;
  requestId: string;
  playerId: string;
  playerName: string;
  kind: PromiseKind;
  /** Unit index, game count or minutes depending on the kind. */
  target: number;
  group: Group;
  made: string;
  deadline: string;
  season: number;
  status: PromiseStatus;
  resolved?: string;
  baseline: { gp: number; toi: number; userGames: number; years: number };
  /** Games counted towards "dress" promises. */
  progress?: number;
}

export interface ListedPlayer {
  playerId: string;
  since: string;
  requestId: string;
  public: boolean;
}

export interface PlayerRequestState {
  requests: PlayerRequest[];
  promises: PlayerPromise[];
  listed: ListedPlayer[];
  mentors: { playerId: string; mentorId: string; since: string }[];
  cooldowns: Record<string, string>;
  userGames?: number;
  /** Role codes per player for the most recent user games (oldest first). */
  roleLog?: Record<string, string>[];
  /** NHL roster ids at the previous daily check. */
  nhl?: string[];
  /** Player id → date he was sent to the AHL. */
  sentDown?: Record<string, string>;
  /** Player id → consecutive days with morale under 40. */
  lowMorale?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** New player letters per day and per rolling week. */
export const REQUESTS_PER_DAY = 1;
export const REQUESTS_PER_WEEK = 3;
/** Days before the same player writes again. */
export const PLAYER_COOLDOWN = 30;
/** Days before another letter of the same type. */
export const TYPE_COOLDOWN = 12;
/** Days to answer a letter before it counts as ignored. */
export const REPLY_WINDOW = 7;

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export function ensureRequestState(g: Game): PlayerRequestState {
  g.playerRequests ??= {
    requests: [],
    promises: [],
    listed: [],
    mentors: [],
    cooldowns: {},
  };
  const s = g.playerRequests;
  s.requests ??= [];
  s.promises ??= [];
  s.listed ??= [];
  s.mentors ??= [];
  s.cooldowns ??= {};
  return s;
}

const userTeam = (g: Game) => g.teams.find((team) => team.id === g.user)!;
const orgPlayers = (team: Team) => [...team.players, ...(team.farm ?? [])];
const groupOf = (player: Player): Group =>
  player.pos === "G" ? "G" : player.pos === "D" ? "D" : "F";
const lang = (g: Game) => (g.language === "ru" ? "ru" : "en");

function findOrgPlayer(g: Game, id: string) {
  const team = userTeam(g);
  return orgPlayers(team).find((player) => player.id === id);
}

export function isListedByRequest(g: Game, playerId: string) {
  return !!g.playerRequests?.listed?.some((item) => item.playerId === playerId);
}

export function listingFor(g: Game, playerId: string) {
  return g.playerRequests?.listed?.find((item) => item.playerId === playerId);
}

export function requestForEvent(g: Game, eventId: string) {
  return g.playerRequests?.requests?.find((item) => item.eventId === eventId);
}

export function promisesFor(g: Game, playerId: string) {
  return (g.playerRequests?.promises ?? []).filter(
    (item) => item.playerId === playerId,
  );
}

export function activePromises(g: Game) {
  return (g.playerRequests?.promises ?? []).filter(
    (item) => item.status === "active",
  );
}

function userGameCount(g: Game, team: Team) {
  const playoffGames = g.bracket
    .flat()
    .filter((series) => [series.a, series.b].includes(team.id))
    .reduce((sum, series) => sum + series.games.length, 0);
  return team.record.gp + playoffGames;
}

/** Role code: F1–F4, D1–D3, G1/G2, X (healthy scratch), I (injured), A (AHL). */
function roleCode(team: Team, player: Player) {
  if (team.farm?.some((item) => item.id === player.id)) return "A";
  if (player.pos === "G") return team.goalie === player.id ? "G1" : "G2";
  const line = team.lines.findIndex((unit) => unit.includes(player.id));
  if (line >= 0) return `F${line + 1}`;
  const pair = team.defense.findIndex((unit) => unit.includes(player.id));
  if (pair >= 0) return `D${pair + 1}`;
  return player.injury > 0 ? "I" : "X";
}

/** Unit index from a role code (0-based); 9 = scratched, 10 = AHL. */
function unitIndex(code: string | undefined) {
  if (!code) return 8;
  if (code === "A") return 10;
  if (code === "X" || code === "I") return 9;
  return Number(code.slice(1)) - 1;
}

const topTier = (code: string | undefined) =>
  !!code && ["F1", "F2", "D1", "D2", "G1"].includes(code);
const lowTier = (code: string | undefined) =>
  !!code && ["F3", "F4", "D3", "G2", "X"].includes(code);
const dressed = (code: string | undefined) =>
  !!code && !["X", "I", "A", "G2"].includes(code);

function ready(s: PlayerRequestState, key: string, days: number, date: string) {
  const last = s.cooldowns[key];
  return !last || addDays(last, days) <= date;
}

// ---------------------------------------------------------------------------
// Text building blocks
// ---------------------------------------------------------------------------

const t = (ru: string, en: string): L => ({ ru, en });

const UNITS: Record<Group, { name: L; in: L }[]> = {
  F: [
    { name: t("первое звено", "the first line"), in: t("в первом звене", "on the first line") },
    { name: t("второе звено", "the second line"), in: t("во втором звене", "on the second line") },
    { name: t("третье звено", "the third line"), in: t("в третьем звене", "on the third line") },
    { name: t("четвёртое звено", "the fourth line"), in: t("в четвёртом звене", "on the fourth line") },
  ],
  D: [
    { name: t("первая пара", "the top pair"), in: t("в первой паре", "on the top pair") },
    { name: t("вторая пара", "the second pair"), in: t("во второй паре", "on the second pair") },
    { name: t("третья пара", "the third pair"), in: t("в третьей паре", "on the third pair") },
  ],
  G: [
    { name: t("место основного", "the starting job"), in: t("в роли основного", "as the starter") },
    { name: t("роль сменщика", "the backup role"), in: t("в роли сменщика", "as the backup") },
  ],
};

function unitText(group: Group, index: number | undefined): { name: L; in: L } {
  if (index === 9)
    return { name: t("трибуна", "the press box"), in: t("на трибуне", "in the press box") };
  if (index === 10)
    return { name: t("фарм-клуб", "the farm"), in: t("в AHL", "in the AHL") };
  const list = UNITS[group];
  return list[clamp(index ?? 0, 0, list.length - 1)];
}

const clock = (minutes: number) => {
  const whole = Math.floor(minutes);
  const seconds = Math.min(59, Math.round((minutes - whole) * 60));
  return `${whole}:${String(seconds).padStart(2, "0")}`;
};

type Persona = "young" | "veteran" | "star" | "regular";
interface Voice {
  persona: Persona;
  blunt: boolean;
}

function voiceOf(player: Player, team: Team): Voice {
  const rank = [...team.players]
    .sort((a, b) => b.ovr - a.ovr)
    .findIndex((item) => item.id === player.id);
  const persona: Persona =
    player.age <= 22
      ? "young"
      : player.age >= 32
        ? "veteran"
        : player.ovr >= 84 || (rank >= 0 && rank < 3)
          ? "star"
          : "regular";
  return { persona, blunt: (player.attributes.composure ?? 70) < 62 };
}

const GREETINGS: Record<Persona | "blunt", L[]> = {
  young: [
    t("Тренер, можно напишу прямо?", "Coach, can I be straight with you?"),
    t("Извините, что пишу напрямую, но для меня это важно.", "Sorry to message you directly, but this matters to me."),
    t("Добрый день. Долго думал, писать или нет.", "Hi. I went back and forth on whether to send this."),
  ],
  veteran: [
    t("Буду краток.", "I'll keep this short."),
    t("Я в лиге давно и не люблю ходить вокруг да около.", "I've been in this league too long to dance around things."),
    t("Хочу обсудить одну вещь, пока она не стала проблемой.", "Want to raise something before it turns into a problem."),
  ],
  star: [
    t("Нам нужно кое-что обсудить.", "We need to talk about something."),
    t("Хочу, чтобы вы услышали это от меня, а не от агента.", "I wanted you to hear this from me, not from my agent."),
  ],
  regular: [
    t("Есть минута?", "Got a minute?"),
    t("Хотел поговорить с вами лично.", "Wanted to bring this to you personally."),
    t("Не хочу раздувать, но промолчать тоже не могу.", "Not trying to make a fuss, but I can't keep quiet either."),
  ],
  blunt: [
    t("Скажу как есть.", "I'll just say it."),
    t("Без предисловий.", "No small talk."),
  ],
};

const CLOSINGS: Record<Persona | "blunt", L[]> = {
  young: [
    t("Спасибо, что выслушали.", "Thanks for hearing me out."),
    t("Я готов работать — просто дайте шанс.", "I'm ready to work — just give me the chance."),
  ],
  veteran: [
    t("Решать вам, но вы знаете мою позицию.", "Your call, but now you know where I stand."),
    t("Надеюсь на честный разговор.", "I'd appreciate an honest answer."),
  ],
  star: [
    t("Жду вашего ответа.", "I'd like an answer."),
    t("Надеюсь, мы на одной волне.", "Hope we're on the same page."),
  ],
  regular: [
    t("Буду ждать ответа.", "Let me know."),
    t("Спасибо.", "Thanks."),
  ],
  blunt: [
    t("Не тяните с ответом.", "Don't sit on this."),
    t("Жду ответа на этой неделе.", "I want an answer this week."),
  ],
};

interface LetterCtx {
  name: string;
  age: number;
  toi: string;
  stat: L;
  now: { name: L; in: L };
  want: { name: L; in: L };
  prev: { name: L; in: L };
  rival: string;
  mentor: string;
  starter: string;
  played: number;
  teamGp: number;
}

type Core = { only?: Persona[]; blunt?: boolean; goalie?: boolean; text: (c: LetterCtx) => L };

const CORES: Record<string, Core[]> = {
  "ice-time": [
    { text: (c) => t(`Я провожу на льду ${c.toi} за матч. Это меньше, чем у ребят, которых я переигрываю. Хочу больше смен — в идеале ${c.want.in.ru}.`, `I'm getting ${c.toi} a night. That's less than guys I'm outplaying. I want more shifts — ideally ${c.want.in.en}.`) },
    { only: ["young"], text: (c) => t(`Понимаю, что я молодой, но за ${c.toi} в игре себя не покажешь. Дайте попробовать ${c.want.in.ru}.`, `I know I'm young, but you can't show much in ${c.toi} a night. Let me try ${c.want.in.en}.`) },
    { only: ["veteran", "star"], text: (c) => t(`${c.toi} за матч — не та роль, ради которой я здесь. Я могу тащить больше, и вы это знаете.`, `${c.toi} a night isn't the role I'm here for. I can carry more than that, and you know it.`) },
    { blunt: true, text: (c) => t(`С ${c.toi} за игру я не могу помочь команде. Либо больше смен, либо объясните, что я делаю не так.`, `I can't help this team on ${c.toi} a night. Either give me more shifts or tell me what I'm doing wrong.`) },
  ],
  "trade:unhappy": [
    { text: () => t("Мне здесь плохо, и это длится не первую неделю. Думаю, будет лучше для всех, если вы найдёте мне новый клуб.", "I'm not happy here and it's been weeks now. I think it's best for everyone if you find me a new club.") },
    { blunt: true, text: () => t("Хватит. Я хочу уйти. Прошу выставить меня на обмен.", "I'm done. I want out. Put me on the trade market.") },
    { only: ["veteran"], text: () => t("Я многое отдал этому клубу, но сейчас это не работает. Прошу рассмотреть обмен.", "I've given this club a lot, but it isn't working anymore. I'm asking you to look at a trade.") },
  ],
  "trade:contender": [
    { text: (c) => t(`Мне ${c.age}, и окон осталось немного. Команда перестраивается, я понимаю, но я хочу бороться за Кубок. Прошу обменять меня в контендера.`, `I'm ${c.age} and I don't have many windows left. I get that we're rebuilding, but I want a real shot at the Cup. Please move me to a contender.`) },
    { text: () => t("Я хочу играть весной, а не смотреть плей-офф по телевизору. Если позвонит команда, которая идёт за Кубком, — выслушайте их.", "I want to play in the spring, not watch the playoffs on TV. If a contender calls, I'd like you to listen.") },
  ],
  "trade:blocked": [
    { text: (c) => t(`${c.rival} играет на моём месте, и ничего не меняется. Я уже говорил об этом. Пора искать клуб, где я буду нужен.`, `${c.rival} has my spot and nothing is changing. I've raised it before. It's time I found a club that needs me.`) },
    { text: (c) => t(`Я не вижу здесь своего места. Раз ставка на ${c.rival}, отпустите меня туда, где мне дадут играть.`, `I don't see a place for me here. If you're backing ${c.rival}, let me go somewhere I'll actually play.`) },
  ],
  "trade:public": [
    { text: () => t("Вы не оставили мне выбора. Сегодня мой агент говорит с прессой: я требую обмена.", "You left me no choice. My agent is talking to the press today: I want a trade.") },
    { blunt: true, text: () => t("Я больше не верю обещаниям. Агент уже звонит журналистам — меня здесь не будет.", "I'm done with promises. My agent is already calling reporters — I won't be here much longer.") },
  ],
  contract: [
    { text: (c) => t(`У меня ${c.stat.ru}, и я хочу остаться. Давайте обсудим новый контракт, пока идёт сезон.`, `I've got ${c.stat.en} and I want to stay. Let's talk about an extension while the season's on.`) },
    { only: ["young"], text: () => t("Мне здесь нравится, и я чувствую, что расту. Хочу знать, что клуб видит меня в своих планах. Обсудим продление?", "I like it here and I feel like I'm growing. I'd like to know the club sees me in its plans. Can we talk extension?") },
    { only: ["veteran"], text: () => t("Я в хорошей форме и хочу закончить карьеру здесь. Но мне нужна ясность по контракту до конца сезона.", "I'm in good shape and I'd like to finish my career here. But I need clarity on a contract before the season ends.") },
    { only: ["star"], text: (c) => t(`${c.stat.ru} — я делаю свою работу. Агент готов к переговорам. На рынок я не хочу, но и ждать вечно не буду.`, `${c.stat.en} — I'm doing my job. My agent is ready to talk. I don't want to hit the market, but I won't wait forever.`) },
  ],
  "stay-nhl": [
    { text: (c) => t(`Слышал, что ${c.rival} может подняться из AHL. Я не хочу обратно в фарм — я доказал, что могу играть здесь.`, `I hear ${c.rival} might get called up. I don't want to go back to the farm — I've shown I can play here.`) },
    { only: ["young"], text: (c) => t(`Пожалуйста, не отправляйте меня вниз. Знаю, что ${c.rival} здорово играет в AHL, но я работаю каждый день и стану лучше.`, `Please don't send me down. I know ${c.rival} is playing well in the AHL, but I'm working every day and I'll get better.`) },
  ],
  "call-up": [
    { text: () => t("Меня отправили в AHL, и я не понимаю почему. Я сильнее нескольких ребят в составе. Дайте мне вернуться.", "You sent me to the AHL and I don't get why. I'm better than a few guys in the lineup. Give me a way back.") },
    { only: ["veteran", "star"], text: () => t("В моём возрасте фарм — это не развитие, это сигнал. Если вы на меня не рассчитываете, скажите прямо. Если рассчитываете — верните наверх.", "At my age the farm isn't development, it's a message. If you're not counting on me, say so. If you are, bring me back up.") },
    { only: ["young"], text: () => t("Я буду работать в AHL, но хочу понимать, что нужно сделать, чтобы вернуться. Я готов.", "I'll put the work in down here, but I want to know what it takes to get back up. I'm ready.") },
  ],
  role: [
    { text: (c) => t(`Ещё недавно я играл ${c.prev.in.ru}, теперь — ${c.now.in.ru}. Мне никто ничего не объяснил. Хочу вернуть своё место.`, `Not long ago I was ${c.prev.in.en}, now I'm ${c.now.in.en}. Nobody explained a thing. I want my spot back.`) },
    { only: ["veteran"], text: (c) => t(`Меня опустили — теперь я ${c.now.in.ru}. Я не новичок и приму решение, но скажите честно: это временно или это моя новая роль?`, `You've dropped me — I'm ${c.now.in.en} now. I'm not a rookie and I'll live with it, but be honest: is this temporary or my new role?`) },
    { blunt: true, text: (c) => t(`Играя ${c.now.in.ru}, я не принесу пользы. Верните меня туда, где я влияю на игру.`, `I can't help this team ${c.now.in.en}. Put me back where I can drive the game.`) },
    { goalie: true, text: () => t("Я потерял место в воротах, и мне никто ничего не сказал. Хочу вернуть статус основного.", "I've lost the net and nobody's said a word to me. I want the starting job back.") },
  ],
  scratched: [
    { text: () => t("Третий матч подряд я смотрю игру с трибуны, хотя здоров. Так я теряю ритм. Мне нужно играть.", "That's three straight games in the press box and I'm healthy. I'm losing my rhythm. I need to play.") },
    { only: ["veteran"], text: () => t("Сидеть в запасе — тоже часть работы, я понимаю. Но три матча подряд — уже перебор.", "Sitting out is part of the job, I get it. But three in a row is too much.") },
    { only: ["young"], text: () => t("Я выкладываюсь на тренировках, но уже три игры не попадаю в состав. Скажите, над чем работать, — и дайте сыграть.", "I'm working hard in practice, but I've been scratched three games running. Tell me what to work on — and let me play.") },
  ],
  rest: [
    { text: (c) => t(`Мне ${c.age}, и ${c.toi} за матч даются тяжело. Ноги не восстанавливаются. Дайте один матч отдыха, иначе к плей-офф от меня ничего не останется.`, `I'm ${c.age} and ${c.toi} a night is getting heavy. My legs aren't bouncing back. Give me a game off or I'll have nothing left for the playoffs.`) },
    { text: () => t("Не люблю жаловаться, но тело подаёт сигналы. Немного разгрузки сейчас — и я буду свежим, когда это важнее всего.", "I'm not one to complain, but my body is telling me something. A bit of rest now and I'll be fresh when it matters most.") },
  ],
  mentor: [
    { text: (c) => t(`Хочу расти быстрее. Может ${c.mentor} позаниматься со мной — после тренировок, на видео? Мне есть чему у него поучиться.`, `I want to develop faster. Could ${c.mentor} work with me — after practice, on video? There's a lot I could learn from him.`) },
    { text: (c) => t(`Я многого не понимаю в игре без шайбы. ${c.mentor} читает игру лучше всех в команде — буду благодарен, если попросите его взять меня под крыло.`, `There's a lot I don't get about playing without the puck. ${c.mentor} reads the game better than anyone here — I'd appreciate it if you asked him to take me under his wing.`) },
  ],
  "mentor:dev": [
    { text: () => t("Мне нужна игровая практика. На трибуне я не прогрессирую. Дайте регулярные смены, пусть даже в нижнем звене.", "I need games. I'm not getting any better in the press box. Give me regular shifts, even on the bottom line.") },
    { text: () => t("Я чувствую, что застрял. Тренировки — это хорошо, но мне нужны матчи, чтобы расти.", "I feel stuck. Practice is fine, but I need games to grow.") },
  ],
  teammate: [
    { text: (c) => t(`${c.rival} занял моё место — я играл ${c.prev.in.ru}. При всём уважении, я играю лучше. Почему решение не в мою пользу?`, `${c.rival} has taken my spot ${c.prev.in.en}. With respect — I'm playing better than him. Why didn't the call go my way?`) },
    { blunt: true, text: (c) => t(`Не понимаю, что ${c.rival} сделал, чтобы получить мою роль. Объясните мне.`, `I don't understand what ${c.rival} did to earn my role. Explain it to me.`) },
    { only: ["veteran"], text: (c) => t(`Я не против конкуренции, но ${c.rival} получил моё место без борьбы. Хочу честный шанс его вернуть.`, `I don't mind competition, but ${c.rival} got my spot without earning it. I want a fair shot at taking it back.`) },
  ],
  "goalie-starts": [
    { text: (c) => t(`Я сыграл ${c.played} из ${c.teamGp} матчей команды. Я готов к большему — дайте пару стартов, и я докажу.`, `I've played ${c.played} of our ${c.teamGp} games. I'm ready for more — give me a couple of starts and I'll prove it.`) },
    { text: () => t("Вратарь без игр теряет остроту. Мне нужны старты — хотя бы два в ближайшие недели.", "A goalie who doesn't play goes stale. I need starts — two in the next couple of weeks, at least.") },
  ],
  thanks: [
    { text: (c) => t(`Спасибо за место ${c.now.in.ru}. Я ради этого работал — не подведу.`, `Thanks for the spot ${c.now.in.en}. It's what I've been working for — I won't let you down.`) },
    { only: ["young"], text: (c) => t(`Честно, не ожидал! Играть ${c.now.in.ru} — это мечта. Сделаю всё, чтобы там остаться.`, `Didn't see that coming, honestly! Playing ${c.now.in.en} is a dream. I'll do everything to stay there.`) },
    { only: ["veteran", "star"], text: () => t("Ценю, что вы снова доверили мне большую роль. Я знаю, что с ней делать.", "Appreciate you trusting me with a bigger role again. I know what to do with it.") },
  ],
};

function coreKey(type: RequestType, context: RequestContext) {
  if (type === "trade") return `trade:${context.reason ?? "unhappy"}`;
  if (type === "mentor" && context.devTime) return "mentor:dev";
  return type;
}

function pickCore(list: Core[], voice: Voice, goalie: boolean, seed: string) {
  const fits = list.filter(
    (core) =>
      (core.goalie === undefined ? true : core.goalie === goalie) &&
      (!core.only || core.only.includes(voice.persona)) &&
      (!core.blunt || voice.blunt),
  );
  // Prefer a persona/temperament-specific line when one exists.
  const specific = fits.filter((core) => core.only || core.blunt || core.goalie);
  const pool =
    specific.length && hashText(`${seed}:specific`) % 3 !== 0 ? specific : fits;
  const generic = pool.filter((core) => !core.goalie || goalie);
  return pickBy(generic.length ? generic : list, `${seed}:core`);
}

function statLine(player: Player): L {
  const s = player.stats;
  if (player.pos === "G") {
    const pct = s.sa ? (s.sa - s.ga) / s.sa : 0.9;
    return t(
      `${(pct * 100).toFixed(1).replace(".", ",")}% отражённых бросков`,
      `a ${pct.toFixed(3).replace(/^0/, "")} save percentage`,
    );
  }
  const pts = s.g + s.a;
  return t(
    `${pts} ${ruPlural(pts, "очко", "очка", "очков")} в ${s.gp} ${ruPlural(s.gp, "матче", "матчах", "матчах")}`,
    `${pts} ${pts === 1 ? "point" : "points"} in ${s.gp} ${s.gp === 1 ? "game" : "games"}`,
  );
}

const TITLES: Record<string, (name: string, c: RequestContext) => L> = {
  "ice-time": (n) => t(`${n} просит больше игрового времени`, `${n} asks for more ice time`),
  "trade:unhappy": (n) => t(`${n} просит обмен`, `${n} requests a trade`),
  "trade:contender": (n) => t(`${n} хочет перейти в контендера`, `${n} wants a move to a contender`),
  "trade:blocked": (n) => t(`${n} просит обмен из-за конкуренции`, `${n} requests a trade over his role`),
  "trade:public": (n) => t(`${n} публично требует обмена`, `${n} goes public with a trade demand`),
  contract: (n) => t(`${n} хочет обсудить продление`, `${n} wants to talk about an extension`),
  "stay-nhl": (n) => t(`${n} просит не отправлять его в AHL`, `${n} asks to stay in the NHL`),
  "call-up": (n) => t(`${n} хочет вернуться в NHL`, `${n} wants back in the NHL`),
  role: (n) => t(`${n} недоволен понижением`, `${n} unhappy about his demotion`),
  scratched: (n) => t(`${n} устал сидеть на трибуне`, `${n} tired of being scratched`),
  rest: (n) => t(`${n} просит разгрузить его`, `${n} asks for a lighter load`),
  mentor: (n) => t(`${n} просит наставника`, `${n} asks for a mentor`),
  "mentor:dev": (n) => t(`${n} просит игровую практику`, `${n} asks for regular games`),
  teammate: (n, c) => t(`${n} недоволен, что его место занял ${c.rivalName}`, `${n} upset that ${c.rivalName} took his spot`),
  "goalie-starts": (n) => t(`${n} просит больше стартов`, `${n} wants more starts`),
  thanks: (n) => t(`${n} благодарит за доверие`, `${n} thanks you for the promotion`),
};

function letterContext(
  g: Game,
  player: Player,
  team: Team,
  context: RequestContext,
): LetterCtx {
  const gp = player.stats.gp;
  const toi = gp ? player.stats.toi / gp : 0;
  const starter = team.players.find((item) => item.id === team.goalie);
  return {
    name: player.name,
    age: player.age,
    toi: clock(context.toi ?? toi),
    stat: statLine(player),
    now: unitText(context.group, context.nowUnit),
    want: unitText(context.group, context.unit),
    prev: unitText(context.group, context.fromUnit),
    rival: context.rivalName ?? "",
    mentor: context.mentorName ?? "",
    starter: starter?.name ?? "",
    played: gp,
    teamGp: team.record.gp,
  };
}

function composeLetter(
  g: Game,
  player: Player,
  team: Team,
  type: RequestType,
  context: RequestContext,
  seed: string,
): L {
  const voice = voiceOf(player, team);
  const key = coreKey(type, context);
  const core = pickCore(CORES[key], voice, player.pos === "G", seed);
  const c = letterContext(g, player, team, context);
  const greetPool =
    voice.blunt && hashText(`${seed}:bg`) % 2 === 0
      ? GREETINGS.blunt
      : GREETINGS[voice.persona];
  const closePool =
    voice.blunt && type !== "thanks" && hashText(`${seed}:bc`) % 2 === 0
      ? CLOSINGS.blunt
      : CLOSINGS[voice.persona];
  const terse = type === "thanks" || context.reason === "public";
  const greet =
    terse || hashText(`${seed}:g`) % 4 === 3
      ? undefined
      : pickBy(greetPool, `${seed}:greet`);
  const close =
    terse || hashText(`${seed}:c`) % 3 === 2
      ? undefined
      : pickBy(closePool, `${seed}:close`);
  const body = core.text(c);
  return {
    ru: [greet?.ru, body.ru, close?.ru].filter(Boolean).join(" "),
    en: [greet?.en, body.en, close?.en].filter(Boolean).join(" "),
  };
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

export interface PromiseSpec {
  kind: PromiseKind;
  target: number;
  days: number;
}

export interface ReplyOption {
  kind: ReplyKind;
  label: L;
  /** What the manager says. */
  line: L;
  /** Consequence summary shown under the button. */
  hint: L;
  promise?: PromiseSpec;
}

export function promiseLabel(
  kind: PromiseKind,
  target: number,
  group: Group,
  days?: number,
): L {
  const within = days
    ? t(` в течение ${days} ${ruPlural(days, "дня", "дней", "дней")}`, ` within ${days} days`)
    : t("", "");
  const unit = unitText(group, target);
  switch (kind) {
    case "line":
      return group === "G"
        ? t(`вернуть место основного${within.ru}`, `starting job back${within.en}`)
        : t(`место ${unit.in.ru}${within.ru}`, `a spot ${unit.in.en}${within.en}`);
    case "dress":
      return t(
        `${target} ${ruPlural(target, "матч", "матча", "матчей")} в составе${within.ru}`,
        `dress for ${target} ${target === 1 ? "game" : "games"}${within.en}`,
      );
    case "starts":
      return t(
        `${target} ${ruPlural(target, "старт", "старта", "стартов")}${within.ru}`,
        `${target} ${target === 1 ? "start" : "starts"}${within.en}`,
      );
    case "rest":
      return t(`один матч отдыха${within.ru}`, `one night off${within.en}`);
    case "toi-max":
      return t(
        `не больше ${clock(target)} за матч${within.ru}`,
        `no more than ${clock(target)} a night${within.en}`,
      );
    case "callup":
      return t(`вызов в NHL${within.ru}`, `a call-up${within.en}`);
    case "stay":
      return t(`остаться в NHL${within.ru}`, `stay in the NHL${within.en}`);
    case "contract":
      return t(`предложение по контракту${within.ru}`, `a contract offer${within.en}`);
    case "trade":
      return t(`обмен${within.ru}`, `a trade${within.en}`);
  }
}

function persuasionScore(g: Game, request: PlayerRequest, player: Player) {
  const team = userTeam(g);
  const voice = voiceOf(player, team);
  const relationship = player.relationship ?? 50;
  const composure = player.attributes.composure ?? 70;
  let score =
    relationship +
    (composure - 65) * 0.4 +
    (voice.persona === "veteran" ? 6 : 0) -
    (voice.blunt ? 6 : 0) -
    (player.morale < 35 ? 8 : 0);
  if (request.type === "trade") score -= request.context.reason === "public" ? 30 : 14;
  if (request.type === "contract") score -= player.years <= 1 && player.ovr >= 82 ? 6 : 0;
  score += (hashText(`${g.seed}:${request.id}:persuade`) % 15) - 7;
  return score;
}

const PERSUADE_AT = 50;

export function requestReplies(g: Game, request: PlayerRequest): ReplyOption[] {
  const c = request.context;
  const group = c.group;
  const name = request.playerName.split(" ").slice(-1)[0];
  const player = findOrgPlayer(g, request.playerId);
  const relationship = player?.relationship ?? 50;
  const trustHint = t(
    `Сработает, если он вам доверяет (отношения ${relationship}%).`,
    `Works if he trusts you (relationship ${relationship}%).`,
  );
  const refuseHint = t("Мораль и отношения упадут.", "Morale and relationship will drop.");
  const promise = (spec: PromiseSpec): L => {
    const label = promiseLabel(spec.kind, spec.target, group, spec.days);
    return t(
      `Обещание: ${label.ru}. Нарушите — потеряете его доверие.`,
      `Promise: ${label.en}. Break it and you lose him.`,
    );
  };
  const prevIn = unitText(group, c.fromUnit).in;
  const wantIn = unitText(group, c.unit).in;
  const starter = (() => {
    const team = userTeam(g);
    return team.players.find((item) => item.id === team.goalie)?.name ?? "";
  })();
  switch (request.type) {
    case "ice-time": {
      const spec = { kind: "line" as const, target: c.unit ?? 1, days: 10 };
      return [
        { kind: "accept", label: t(`Пообещать место ${wantIn.ru}`, `Promise a spot ${wantIn.en}`), line: t(`Справедливо. В ближайшие 10 дней ты сыграешь ${wantIn.ru}.`, `Fair point. Within 10 days you'll be playing ${wantIn.en}.`), hint: promise(spec), promise: spec },
        { kind: "explain", label: t("Объяснить решение", "Explain the decision"), line: t("Твоё время зависит от игры без шайбы. Подтяни её — и смены придут.", "Your minutes depend on your play away from the puck. Tighten that up and the shifts will come."), hint: trustHint },
        { kind: "refuse", label: t("Отказать", "Turn him down"), line: t("Состав решаю я. Пока ничего не меняется.", "I set the lineup. Nothing changes for now."), hint: refuseHint },
      ];
    }
    case "trade": {
      const spec = { kind: "trade" as const, target: 0, days: 40 };
      return [
        { kind: "accept", label: t("Выставить на обмен", "Put him on the trade list"), line: t("Хорошо. Я выставлю тебя на рынок и поищу вариант в ближайшие недели.", "All right. I'll put you on the market and look for a deal over the next few weeks."), hint: t(`Игрок попадёт в список на обмен. ${promise(spec).ru}`, `He goes on the trade list. ${promise(spec).en}`), promise: spec },
        { kind: "explain", label: t("Уговорить остаться", "Persuade him to stay"), line: t("Ты важен для нас. Дай мне месяц — я исправлю то, что тебя не устраивает.", "You matter to this team. Give me a month and I'll fix what's bothering you."), hint: trustHint },
        { kind: "refuse", label: t("Отказать в обмене", "Refuse the request"), line: t("У тебя контракт. Ты остаёшься, и я жду полной отдачи.", "You're under contract. You're staying, and I expect your best."), hint: t("Риск публичного требования обмена.", "Risk of a public trade demand.") },
      ];
    }
    case "contract": {
      const spec = { kind: "contract" as const, target: 0, days: 21 };
      return [
        { kind: "accept", label: t("Пообещать предложение", "Promise an offer"), line: t("Договорились. В течение трёх недель у тебя будет предложение.", "Deal. You'll have an offer within three weeks."), hint: promise(spec), promise: spec },
        { kind: "explain", label: t("Отложить до лета", "Wait until summer"), line: t("Вернёмся к этому после сезона — сейчас фокус на игре.", "Let's revisit this after the season — right now the focus is hockey."), hint: trustHint },
        { kind: "refuse", label: t("Не продлевать", "No extension"), line: t("Сейчас клуб не готов к продлению.", "The club isn't ready to extend you right now."), hint: refuseHint },
      ];
    }
    case "stay-nhl": {
      const spec = { kind: "stay" as const, target: 0, days: 30 };
      return [
        { kind: "accept", label: t("Гарантировать место", "Guarantee his spot"), line: t("Ты остаёшься в NHL. Минимум месяц тебя никто не тронет.", "You're staying up. Nobody's moving you for at least a month."), hint: promise(spec), promise: spec },
        { kind: "explain", label: t("Объяснить конкуренцию", "Explain the competition"), line: t("Место надо заслуживать каждый день. Играй — и вопросов не будет.", "You earn your spot every day. Play well and there's no question."), hint: trustHint },
        { kind: "refuse", label: t("Ничего не обещать", "Make no promises"), line: t("Я буду делать то, что лучше для команды.", "I'll do what's best for the team."), hint: refuseHint },
      ];
    }
    case "call-up": {
      const spec = { kind: "callup" as const, target: 0, days: 14 };
      return [
        { kind: "accept", label: t("Пообещать вызов", "Promise a call-up"), line: t("Две недели в AHL — и ты вернёшься наверх.", "Two weeks down there and you're back up."), hint: promise(spec), promise: spec },
        { kind: "explain", label: t("Сказать, что улучшить", "Tell him what to fix"), line: t("Мне нужно увидеть больше в обороне. Покажи это в AHL — и дверь открыта.", "I need to see more in your own end. Show me that in the AHL and the door's open."), hint: trustHint },
        { kind: "refuse", label: t("Оставить в AHL", "Keep him in the AHL"), line: t("Сейчас ты нужен в AHL. Это надолго.", "Right now you're needed in the AHL. That won't change soon."), hint: refuseHint },
      ];
    }
    case "role": {
      const spec: PromiseSpec =
        group === "G"
          ? { kind: "starts", target: 2, days: 10 }
          : { kind: "line", target: c.fromUnit ?? 1, days: 10 };
      return [
        { kind: "accept", label: group === "G" ? t("Пообещать старты", "Promise starts") : t("Вернуть роль", "Promise his role back"), line: group === "G" ? t("Это временно. Два старта в ближайшие 10 дней — твои.", "It's temporary. Two starts in the next 10 days are yours.") : t(`Это временно. В ближайшие 10 дней ты вернёшься ${prevIn.ru}.`, `It's temporary. Within 10 days you're back ${prevIn.en}.`), hint: promise(spec), promise: spec },
        { kind: "explain", label: t("Объяснить решение", "Explain the decision"), line: t("Это решение по игре, не по тебе. Отвечай на льду.", "It's a hockey decision, not a personal one. Answer on the ice."), hint: trustHint },
        { kind: "refuse", label: t("Это его роль теперь", "That's his role now"), line: t("Это твоя роль сейчас. Привыкай.", "That's your role now. Get used to it."), hint: refuseHint },
      ];
    }
    case "scratched": {
      const spec = { kind: "dress" as const, target: 2, days: 12 };
      return [
        { kind: "accept", label: t("Пообещать игры", "Promise him games"), line: t("Ты сыграешь минимум в двух ближайших матчах.", "You'll dress for at least two of the next games."), hint: promise(spec), promise: spec },
        { kind: "explain", label: t("Попросить подождать", "Ask him to stay ready"), line: t("Состав сейчас выигрывает. Будь готов — шанс придёт.", "The lineup is winning right now. Stay ready — your chance will come."), hint: trustHint },
        { kind: "refuse", label: t("Не обсуждать состав", "Lineup isn't up for debate"), line: t("Решения по составу не обсуждаются.", "Lineup decisions aren't up for debate."), hint: refuseHint },
      ];
    }
    case "rest": {
      const rest = { kind: "rest" as const, target: 1, days: 10 };
      const cap = Math.max(10, Math.round(((c.toi ?? 20) - 2) * 2) / 2);
      const trim = { kind: "toi-max" as const, target: cap, days: 10 };
      return [
        { kind: "accept", label: t("Дать матч отдыха", "Give him a night off"), line: t("Пропустишь одну игру в ближайшие 10 дней. Восстанавливайся.", "You'll sit one game in the next 10 days. Recover."), hint: promise(rest), promise: rest },
        { kind: "explain", label: t("Срезать минуты", "Trim his minutes"), line: t("Отдыхать не будешь, но время я тебе урежу.", "No night off, but I'll cut your minutes."), hint: promise(trim), promise: trim },
        { kind: "refuse", label: t("Он нужен каждый вечер", "Need him every night"), line: t("Ты нужен на льду каждый вечер.", "I need you out there every night."), hint: t("Мораль упадёт, нагрузка останется.", "Morale drops and the load stays."), },
      ];
    }
    case "mentor": {
      if (c.devTime) {
        const spec = { kind: "dress" as const, target: 3, days: 14 };
        return [
          { kind: "accept", label: t("Пообещать матчи", "Promise him games"), line: t("Справедливо. В ближайшие две недели ты сыграешь минимум три матча.", "Fair. You'll play at least three games in the next two weeks."), hint: promise(spec), promise: spec },
          { kind: "explain", label: t("Объяснить план развития", "Explain the plan"), line: t("Твоё время придёт. Сейчас — тренировки и видео с тренерами.", "Your time will come. For now it's practice and video with the coaches."), hint: trustHint },
          { kind: "refuse", label: t("Отказать", "Turn him down"), line: t("Матчи надо заслужить.", "You have to earn games."), hint: refuseHint },
        ];
      }
      return [
        { kind: "accept", label: t(`Назначить наставником ${c.mentorName}`, `Pair him with ${c.mentorName}`), line: t(`Хорошая идея. Сегодня же поговорю с ${c.mentorName}.`, `Good idea. I'll talk to ${c.mentorName} today.`), hint: t("Мотивация растёт, пока наставник в составе.", "Motivation grows while the mentor is on the roster.") },
        { kind: "explain", label: t("Сначала тренеры", "Coaches first"), line: t("Сначала поработай с тренерами по развитию — потом вернёмся к этому.", "Work with the development coaches first — we'll come back to it."), hint: trustHint },
        { kind: "refuse", label: t("Пусть справляется сам", "Let him figure it out"), line: t("У ветеранов и так хватает забот. Справляйся сам.", "The veterans have enough on their plate. Figure it out yourself."), hint: refuseHint },
      ];
    }
    case "teammate": {
      const spec = { kind: "line" as const, target: c.fromUnit ?? 1, days: 10 };
      return [
        { kind: "accept", label: t("Пообещать место обратно", "Promise the spot back"), line: t(`Справедливо. В течение 10 дней ты вернёшься ${prevIn.ru}.`, `Fair enough. Within 10 days you're back ${prevIn.en}.`), hint: promise(spec), promise: spec },
        { kind: "explain", label: t(`Защитить выбор ${c.rivalName?.split(" ").slice(-1)[0] ?? ""}`, `Back ${c.rivalName?.split(" ").slice(-1)[0] ?? "him"}`), line: t(`${c.rivalName} заслужил шанс. Дави на него на каждой тренировке.`, `${c.rivalName} earned the chance. Push him every practice.`), hint: trustHint },
        { kind: "refuse", label: t("Не обсуждать звенья", "Lines aren't negotiable"), line: t("Я не согласовываю звенья с игроками.", "I don't clear my lines with the players."), hint: refuseHint },
      ];
    }
    case "goalie-starts": {
      const spec = { kind: "starts" as const, target: 2, days: 14 };
      return [
        { kind: "accept", label: t("Пообещать два старта", "Promise two starts"), line: t("Два старта в ближайшие две недели — твои.", "Two starts in the next two weeks are yours."), hint: promise(spec), promise: spec },
        { kind: "explain", label: t("Объяснить иерархию", "Explain the pecking order"), line: t("У нас ясная иерархия в воротах. Будь готов, когда понадобишься.", "We have a clear pecking order in net. Be ready when you're needed."), hint: trustHint },
        { kind: "refuse", label: t(`Основной — ${starter.split(" ").slice(-1)[0]}`, `${starter.split(" ").slice(-1)[0]} starts`), line: t(`Основной вратарь — ${starter}. Это не изменится.`, `${starter} is the starter. That won't change.`), hint: refuseHint },
      ];
    }
    case "thanks":
      return [
        { kind: "accept", label: t("Ты это заслужил", "You earned it"), line: t("Ты это заслужил. Продолжай в том же духе.", "You earned it. Keep it going."), hint: t("Мораль +", "Morale +") },
        { kind: "explain", label: t("Поднять планку", "Raise the bar"), line: t(`Это только начало, ${name}. Теперь от тебя ждут большего.`, `This is only the start, ${name}. Now we expect more.`), hint: t("Мотивация +", "Motivation +") },
      ];
  }
}

const REACTIONS = {
  accept: [
    t("Спасибо. Ловлю на слове.", "Thanks. I'm holding you to that."),
    t("Это всё, что я хотел услышать.", "That's all I wanted to hear."),
    t("Хорошо. Посмотрим, как будет на деле.", "Good. We'll see how it plays out."),
  ],
  explainGood: [
    t("Ладно, понял. Поработаю над этим.", "Fine, I get it. I'll work on it."),
    t("Хорошо, подожду. Но не бесконечно.", "Okay, I'll wait. But not forever."),
    t("Честно. Уважаю.", "That's fair. I respect it."),
  ],
  explainBad: [
    t("Это не ответ.", "That's not an answer."),
    t("Я слышал это уже не раз.", "I've heard that before."),
    t("Красиво сказано. Только ничего не меняется.", "Nice words. Nothing changes, though."),
  ],
  refuse: [
    t("Понятно. Я запомню.", "Got it. I'll remember this."),
    t("Значит, так. Ладно.", "So that's how it is. Fine."),
    t("Не такого ответа я ждал.", "Not the answer I was hoping for."),
  ],
  refuseYoung: [
    t("Ясно… Буду работать дальше.", "Okay… I'll keep working."),
  ],
  tradeAccept: [
    t("Спасибо, что не держите. До последнего дня здесь я буду профессионалом.", "Thanks for not holding me back. I'll stay professional until my last day here."),
  ],
  tradeStay: [
    t("Ладно. Месяц. Но если ничего не изменится, я вернусь к этому разговору.", "Fine. A month. But if nothing changes, we're having this talk again."),
  ],
  thanks: [
    t("Понял, тренер!", "You got it, coach!"),
    t("Не подведу.", "I won't let you down."),
  ],
  mentor: [
    t("Спасибо! Завтра приду на лёд пораньше.", "Thanks! I'll be on the ice early tomorrow."),
  ],
};

function applyDelta(
  player: Player,
  delta: { morale: number; relationship: number; motivation: number },
) {
  player.morale = clamp(player.morale + delta.morale, 0, 100);
  player.relationship = clamp((player.relationship ?? 50) + delta.relationship, 0, 100);
  player.motivation = clamp((player.motivation ?? 50) + delta.motivation, 0, 100);
  syncMoraleBonus(player);
}

function addPromise(
  g: Game,
  request: PlayerRequest,
  player: Player,
  spec: PromiseSpec,
) {
  const s = ensureRequestState(g);
  const date = g.calendar!.date;
  const promise: PlayerPromise = {
    id: `promise-${request.id}`,
    requestId: request.id,
    playerId: player.id,
    playerName: player.name,
    kind: spec.kind,
    target: spec.target,
    group: request.context.group,
    made: date,
    deadline: addDays(date, spec.days),
    season: g.year,
    status: "active",
    baseline: {
      gp: player.stats.gp,
      toi: player.stats.toi,
      userGames: userGameCount(g, userTeam(g)),
      years: player.years,
    },
    progress: 0,
  };
  s.promises.unshift(promise);
  s.promises = s.promises.slice(0, 60);
  return promise;
}

function list(g: Game, player: Player, request: PlayerRequest, isPublic: boolean) {
  const s = ensureRequestState(g);
  const existing = s.listed.find((item) => item.playerId === player.id);
  if (existing) {
    existing.public ||= isPublic;
    return;
  }
  s.listed.push({
    playerId: player.id,
    since: g.calendar!.date,
    requestId: request.id,
    public: isPublic,
  });
}

function closeEvent(g: Game, request: PlayerRequest) {
  const event = g.events?.find((item) => item.id === request.eventId);
  if (event) {
    event.read = true;
    event.resolved = true;
  }
}

/**
 * Answers a player's letter. Effects apply exactly once; a second reply
 * throws. Returns the updated request.
 */
export function replyToRequest(g: Game, requestId: string, kind: ReplyKind) {
  const s = ensureRequestState(g);
  const request = s.requests.find((item) => item.id === requestId);
  if (!request) throw Error("Request not found");
  if (request.status !== "open")
    throw Error(g.language === "ru" ? "На это письмо уже ответили" : "This letter has already been answered");
  const option = requestReplies(g, request).find((item) => item.kind === kind);
  if (!option) throw Error(`Reply ${kind} is not available`);
  const player = findOrgPlayer(g, request.playerId);
  if (!player) throw Error("Player unavailable");
  const team = userTeam(g);
  const voice = voiceOf(player, team);
  const date = g.calendar!.date;
  const seed = `${g.seed}:${request.id}:${kind}`;
  let delta = { morale: 0, relationship: 0, motivation: 0 };
  let reaction: L;
  if (request.type === "thanks") {
    delta = kind === "accept" ? { morale: 4, relationship: 3, motivation: 2 } : { morale: 1, relationship: 1, motivation: 6 };
    reaction = pickBy(REACTIONS.thanks, seed);
  } else if (kind === "accept") {
    delta = request.type === "trade" ? { morale: 4, relationship: 2, motivation: 0 } : { morale: 8, relationship: 5, motivation: 3 };
    reaction = request.type === "trade" ? REACTIONS.tradeAccept[0] : request.type === "mentor" && !request.context.devTime ? REACTIONS.mentor[0] : pickBy(REACTIONS.accept, seed);
    if (option.promise) request.promiseId = addPromise(g, request, player, option.promise).id;
    if (request.type === "trade") list(g, player, request, false);
    if (request.type === "mentor" && !request.context.devTime && request.context.mentorId) {
      s.mentors = s.mentors.filter((item) => item.playerId !== player.id);
      s.mentors.push({ playerId: player.id, mentorId: request.context.mentorId, since: date });
      delta.motivation += 5;
      const mentor = findOrgPlayer(g, request.context.mentorId);
      if (mentor) applyDelta(mentor, { morale: 2, relationship: 1, motivation: 0 });
    }
  } else if (kind === "explain" && option.promise) {
    // Rest request: "trim minutes" is a softer promise.
    delta = { morale: 3, relationship: 2, motivation: 1 };
    reaction = pickBy(REACTIONS.explainGood, seed);
    request.promiseId = addPromise(g, request, player, option.promise).id;
  } else if (kind === "explain") {
    const persuaded = persuasionScore(g, request, player) >= PERSUADE_AT;
    request.persuaded = persuaded;
    delta = persuaded ? { morale: 2, relationship: 3, motivation: 2 } : { morale: -4, relationship: -4, motivation: -2 };
    reaction = persuaded
      ? request.type === "trade"
        ? REACTIONS.tradeStay[0]
        : pickBy(REACTIONS.explainGood, seed)
      : pickBy(REACTIONS.explainBad, seed);
  } else {
    const hard = voice.persona === "veteran" || voice.persona === "star";
    delta =
      voice.persona === "young"
        ? { morale: -6, relationship: -5, motivation: -2 }
        : { morale: hard ? -10 : -8, relationship: request.type === "trade" ? -10 : -8, motivation: voice.blunt ? -6 : -4 };
    reaction = voice.persona === "young" ? REACTIONS.refuseYoung[0] : pickBy(REACTIONS.refuse, seed);
  }
  applyDelta(player, delta);
  request.status = kind === "accept" ? "accepted" : kind === "explain" ? "explained" : "refused";
  request.reply = kind;
  request.replyDate = date;
  request.reaction = reaction;
  request.effects = delta;
  closeEvent(g, request);
  return request;
}

/** Conversation topic for "Talk to him" on a request. */
export function talkTopicFor(type: RequestType): ConversationTopic {
  switch (type) {
    case "ice-time":
    case "scratched":
    case "goalie-starts":
      return "ice-time";
    case "trade":
      return "future";
    case "contract":
      return "contract";
    case "rest":
      return "injury";
    case "mentor":
      return "development";
    case "thanks":
      return "morale";
    default:
      return "role";
  }
}

export const REQUEST_TYPE_LABELS: Record<RequestType, L> = {
  "ice-time": t("Игровое время", "Ice time"),
  trade: t("Обмен", "Trade"),
  contract: t("Контракт", "Contract"),
  "stay-nhl": t("Место в NHL", "NHL spot"),
  "call-up": t("Вызов из AHL", "Call-up"),
  role: t("Роль", "Role"),
  scratched: t("Трибуна", "Scratched"),
  rest: t("Нагрузка", "Workload"),
  mentor: t("Развитие", "Development"),
  teammate: t("Конкуренция", "Competition"),
  "goalie-starts": t("Старты", "Starts"),
  thanks: t("Благодарность", "Thanks"),
};

// ---------------------------------------------------------------------------
// Promise progress
// ---------------------------------------------------------------------------

export interface PromiseProgress {
  text: L;
  daysLeft: number;
}

export function promiseProgress(g: Game, promise: PlayerPromise): PromiseProgress {
  const player = findOrgPlayer(g, promise.playerId);
  const date = g.calendar?.date ?? promise.made;
  const daysLeft = Math.max(
    0,
    Math.round((Date.parse(promise.deadline) - Date.parse(date)) / 86_400_000),
  );
  if (!player) return { text: t("Игрок покинул клуб", "Player left the club"), daysLeft };
  const team = userTeam(g);
  const gpDelta = player.stats.gp - promise.baseline.gp;
  const gamesDelta = userGameCount(g, team) - promise.baseline.userGames;
  const now = unitText(promise.group, unitIndex(roleCode(team, player)));
  switch (promise.kind) {
    case "line":
      return { text: t(`Сейчас: ${now.name.ru}`, `Now: ${now.name.en}`), daysLeft };
    case "dress":
      return { text: t(`Сыграно: ${promise.progress ?? 0} из ${promise.target}`, `Dressed: ${promise.progress ?? 0} of ${promise.target}`), daysLeft };
    case "starts":
      return { text: t(`Стартов: ${Math.max(0, gpDelta)} из ${promise.target}`, `Starts: ${Math.max(0, gpDelta)} of ${promise.target}`), daysLeft };
    case "rest":
      return { text: t(`Пропущено матчей: ${Math.max(0, gamesDelta - gpDelta)}`, `Games rested: ${Math.max(0, gamesDelta - gpDelta)}`), daysLeft };
    case "toi-max": {
      const avg = gpDelta > 0 ? (player.stats.toi - promise.baseline.toi) / gpDelta : 0;
      return { text: t(`Среднее: ${gpDelta ? clock(avg) : "—"}`, `Average: ${gpDelta ? clock(avg) : "—"}`), daysLeft };
    }
    case "callup":
    case "stay":
      return { text: team.farm?.some((item) => item.id === player.id) ? t("Сейчас в AHL", "Currently in the AHL") : t("Сейчас в NHL", "Currently in the NHL"), daysLeft };
    case "contract":
      return { text: t(`Лет по контракту: ${player.years}`, `Years left: ${player.years}`), daysLeft };
    case "trade":
      return { text: t("В списке на обмен", "On the trade list"), daysLeft };
  }
}

// ---------------------------------------------------------------------------
// Daily processing
// ---------------------------------------------------------------------------

type Tr = (ru: string, en: string) => string;

interface Candidate {
  type: RequestType;
  player: Player;
  context: RequestContext;
  /** Higher fires first. */
  weight: number;
  /** Bypasses the per-player cooldown and weekly cap (escalations). */
  escalation?: boolean;
}

function priorityFor(type: RequestType, context: RequestContext): ManagementEvent["priority"] {
  if (type === "thanks") return "normal";
  if (type === "trade" && context.reason === "public") return "critical";
  if (type === "mentor" || type === "rest" || type === "contract") return "high";
  return "high";
}

function actionFor(type: RequestType): ManagementEvent["action"] {
  switch (type) {
    case "trade":
      return "trades";
    case "contract":
      return "contracts";
    case "call-up":
    case "stay-nhl":
    case "mentor":
      return "roster";
    case "thanks":
      return undefined;
    default:
      return "tactics";
  }
}

type NewEvent = Omit<ManagementEvent, "id" | "read" | "resolved" | "title" | "body" | "i18n">;
/** Pushes an inbox event in the career language with a bilingual copy. */
function pushL(g: Game, event: NewEvent & { title: L; body: L }) {
  const l = lang(g);
  pushEvent(g, {
    ...event,
    title: event.title[l],
    body: event.body[l],
    i18n: { title: event.title, body: event.body },
  });
}

function createRequest(g: Game, team: Team, candidate: Candidate) {
  const s = ensureRequestState(g);
  const date = g.calendar!.date;
  const { type, player, context } = candidate;
  const id = `req-${date}-${player.id}-${type}`;
  if (s.requests.some((item) => item.id === id)) return undefined;
  const seed = `${g.seed}:${id}`;
  const letter = composeLetter(g, player, team, type, context, seed);
  const title = TITLES[coreKey(type, context)](player.name, context);
  const due = addDays(date, REPLY_WINDOW);
  const request: PlayerRequest = {
    id,
    type,
    playerId: player.id,
    playerName: player.name,
    date,
    season: g.year,
    due,
    title,
    letter,
    context,
    status: "open",
  };
  const l = lang(g);
  const quoteL = t(`«${letter.ru}» — ${player.name}`, `“${letter.en}” — ${player.name}`);
  const before = g.events?.length ?? 0;
  pushL(g, {
    date,
    category: type === "contract" ? "contract" : type === "trade" ? "trade" : "organization",
    priority: priorityFor(type, context),
    title,
    body: quoteL,
    action: actionFor(type),
    teamId: g.user,
    playerId: player.id,
    requiresResponse: type !== "thanks",
    responseDue: type !== "thanks" ? due : undefined,
  });
  if ((g.events?.length ?? 0) > before || g.events?.[0]?.title === title[l])
    request.eventId = g.events![0].id;
  s.requests.unshift(request);
  s.requests = s.requests.slice(0, 80);
  s.cooldowns[`player:${player.id}`] = date;
  s.cooldowns[`type:${type}`] = date;
  s.cooldowns[`${type}:${player.id}`] = date;
  if (type === "trade" && context.reason === "public") list(g, player, request, true);
  return request;
}

function hasOpenIssue(s: PlayerRequestState, playerId: string) {
  return (
    s.requests.some((item) => item.playerId === playerId && item.status === "open") ||
    s.promises.some((item) => item.playerId === playerId && item.status === "active")
  );
}

function inSeason(g: Game) {
  return (
    g.phase === "playoffs" ||
    (g.phase === "regular" && g.calendar!.date >= g.calendar!.seasonStart)
  );
}

/** Updates role logs / counters; returns true when a user game was just played. */
function track(g: Game, team: Team, s: PlayerRequestState) {
  const date = g.calendar!.date;
  // Sent-down detection (daily).
  const nhlNow = team.players.map((player) => player.id);
  s.sentDown ??= {};
  for (const id of s.nhl ?? [])
    if (!nhlNow.includes(id) && team.farm?.some((player) => player.id === id))
      s.sentDown[id] = date;
  for (const id of Object.keys(s.sentDown))
    if (nhlNow.includes(id) || addDays(s.sentDown[id], 40) < date) delete s.sentDown[id];
  s.nhl = nhlNow;
  // Long unhappiness.
  s.lowMorale ??= {};
  for (const player of orgPlayers(team)) {
    if (player.morale < 40) s.lowMorale[player.id] = (s.lowMorale[player.id] ?? 0) + 1;
    else delete s.lowMorale[player.id];
  }
  for (const id of Object.keys(s.lowMorale))
    if (!orgPlayers(team).some((player) => player.id === id)) delete s.lowMorale[id];
  // Role log per user game.
  const games = userGameCount(g, team);
  const previous = s.userGames;
  s.userGames = games;
  if (previous !== undefined && games < previous) {
    s.roleLog = [];
    return false;
  }
  if (previous === undefined || games === previous) return false;
  const roles: Record<string, string> = {};
  for (const player of orgPlayers(team)) roles[player.id] = roleCode(team, player);
  s.roleLog = [...(s.roleLog ?? []), roles].slice(-5);
  return true;
}

function groupPlayers(team: Team, group: Group) {
  return team.players.filter((player) => groupOf(player) === group);
}

function collectCandidates(g: Game, team: Team, s: PlayerRequestState, gameDay: boolean) {
  const out: Candidate[] = [];
  const date = g.calendar!.date;
  const log = s.roleLog ?? [];
  const at = (id: string, back: number) => log[log.length - back]?.[id];
  const healthy = (player: Player) => player.injury <= 0;
  const regular = g.phase === "regular";

  if (gameDay && log.length >= 4) {
    for (const player of orgPlayers(team)) {
      if (!healthy(player)) continue;
      const group = groupOf(player);
      const r1 = at(player.id, 1), r2 = at(player.id, 2), r3 = at(player.id, 3), r4 = at(player.id, 4);
      // Promotion → thanks.
      if (lowTier(r4) && (lowTier(r3) || r3 === "A") && topTier(r2) && r2 === r1 && (r1 === "F1" || r1 === "D1" || r1 === "G1" || r1 === "F2")) {
        out.push({ type: "thanks", player, context: { group, nowUnit: unitIndex(r1) }, weight: 1 });
      }
      // Demotion → role / teammate.
      if (topTier(r4) && topTier(r3) && lowTier(r2) && lowTier(r1) && r1 !== "X") {
        const fromUnit = unitIndex(r3);
        const rival = groupPlayers(team, group).find(
          (other) =>
            other.id !== player.id &&
            lowTier(at(other.id, 3) ?? "A") &&
            at(other.id, 1) === r3 &&
            (other.ovr < player.ovr || (other.age + 3 <= player.age && other.ovr <= player.ovr + 1)),
        );
        if (rival && group !== "G")
          out.push({ type: "teammate", player, context: { group, fromUnit, nowUnit: unitIndex(r1), rivalId: rival.id, rivalName: rival.name }, weight: 6 });
        else
          out.push({ type: "role", player, context: { group, fromUnit, nowUnit: unitIndex(r1) }, weight: 5 });
      }
      // Healthy scratch three games running.
      if (group !== "G" && r1 === "X" && r2 === "X" && r3 === "X") {
        const weakest = groupPlayers(team, group)
          .filter((other) => dressed(at(other.id, 1)))
          .sort((a, b) => a.ovr - b.ovr)[0];
        if (weakest && player.ovr >= weakest.ovr - 1) {
          const young = player.age <= 21 && player.potential - player.ovr >= 8;
          out.push(young
            ? { type: "mentor", player, context: { group, devTime: true, nowUnit: 9 }, weight: 4 }
            : { type: "scratched", player, context: { group, nowUnit: 9 }, weight: 5 });
        }
      }
    }
  }

  if (gameDay && inSeason(g) && team.record.gp >= 8) {
    // Ice time vs rating.
    for (const group of ["F", "D"] as const) {
      const pool = groupPlayers(team, group).filter((p) => healthy(p) && p.stats.gp >= 5);
      const byOvr = [...pool].sort((a, b) => b.ovr - a.ovr);
      const byToi = [...pool].sort((a, b) => b.stats.toi / b.stats.gp - a.stats.toi / a.stats.gp);
      const per = group === "F" ? 3 : 2;
      byOvr.forEach((player, rank) => {
        const toiRank = byToi.indexOf(player);
        const avg = player.stats.toi / player.stats.gp;
        const expected = group === "F" ? [18, 15.5, 13][Math.floor(rank / per)] : [22, 19][Math.floor(rank / per)];
        if (expected === undefined) return;
        if (toiRank >= rank + per && avg < expected - 2.5 && player.morale < 72)
          out.push({ type: "ice-time", player, context: { group, unit: Math.floor(rank / per), nowUnit: unitIndex(at(player.id, 1)), toi: avg }, weight: 4 + (expected - avg) / 2 });
      });
    }
    // Backup goalie wants starts.
    const goalies = groupPlayers(team, "G").filter(healthy);
    const starter = goalies.find((goalie) => goalie.id === team.goalie);
    for (const backup of goalies) {
      if (!starter || backup.id === starter.id) continue;
      if (team.record.gp >= 15 && backup.ovr >= starter.ovr - 3 && backup.stats.gp <= team.record.gp * 0.2 && backup.morale < 80)
        out.push({ type: "goalie-starts", player: backup, context: { group: "G", nowUnit: 1 }, weight: 3 });
    }
    // Veteran workload.
    for (const player of team.players) {
      if (player.age < 32 || !healthy(player) || player.stats.gp < 20 || player.pos === "G") continue;
      const avg = player.stats.toi / player.stats.gp;
      const heavy = player.pos === "D" ? 22.5 : 19;
      if (avg >= heavy || player.fatigue >= 30)
        out.push({ type: "rest", player, context: { group: groupOf(player), toi: avg, nowUnit: unitIndex(at(player.id, 1)) }, weight: 2 + Math.max(0, avg - heavy) });
    }
  }

  if (regular && date >= `${g.year}-12-01` && g.calendar!.day % 7 === 4) {
    // Extension talks after a good first half.
    for (const player of team.players) {
      if (player.years > 1 || player.stats.gp < 20 || player.age >= 36) continue;
      const s2 = player.stats;
      const good = player.pos === "G"
        ? s2.sa > 0 && (s2.sa - s2.ga) / s2.sa >= 0.912
        : (s2.g + s2.a) / s2.gp >= (player.pos === "D" ? 0.45 : 0.7) || (player.performanceForm ?? 0) > 12;
      if (good && player.morale >= 45)
        out.push({ type: "contract", player, context: { group: groupOf(player) }, weight: 3 });
    }
  }

  if (regular && g.calendar!.day % 7 === 2) {
    // Trade requests.
    const pct = team.record.gp ? team.record.pts / (team.record.gp * 2) : 0.5;
    const rebuilding = g.franchiseStrategy === "draft-lottery" || (team.record.gp >= 25 && pct < 0.45);
    for (const player of orgPlayers(team)) {
      if (isListedByRequest(g, player.id)) continue;
      const group = groupOf(player);
      if ((s.lowMorale?.[player.id] ?? 0) >= 21 && (player.relationship ?? 50) < 50) {
        out.push({ type: "trade", player, context: { group, reason: "unhappy" }, weight: 7 });
        continue;
      }
      if (rebuilding && player.age >= 30 && player.ovr >= 80 && player.years <= 2 && team.record.gp >= 15)
        out.push({ type: "trade", player, context: { group, reason: "contender" }, weight: 4 });
      // Blocked: an earlier role complaint went nowhere.
      const grievance = s.requests.find(
        (item) =>
          item.playerId === player.id &&
          ["role", "teammate", "ice-time", "scratched"].includes(item.type) &&
          (item.status === "refused" || item.status === "expired" || (item.status === "explained" && !item.persuaded)) &&
          addDays(item.date, 60) >= date && addDays(item.date, 14) <= date,
      );
      if (grievance && player.age >= 23 && !topTier(at(player.id, 1)) && player.morale < 60) {
        const rivalName = grievance.context.rivalName ?? groupPlayers(team, group).filter((other) => other.id !== player.id && other.age < player.age && topTier(at(other.id, 1))).sort((a, b) => a.age - b.age)[0]?.name;
        if (rivalName)
          out.push({ type: "trade", player, context: { group, reason: "blocked", rivalName }, weight: 6 });
      }
    }
    // Escalation: refused trade request turns public.
    for (const request of s.requests) {
      if (request.type !== "trade" || request.context.reason === "public") continue;
      const failed = request.status === "refused" || request.status === "expired" || (request.status === "explained" && !request.persuaded);
      if (!failed || isListedByRequest(g, request.playerId)) continue;
      if (addDays(request.replyDate ?? request.due, 21) > date || addDays(request.date, 90) < date) continue;
      const player = findOrgPlayer(g, request.playerId);
      if (!player || player.morale >= 45) continue;
      if (s.requests.some((item) => item.playerId === player.id && item.type === "trade" && item.context.reason === "public" && item.season === g.year)) continue;
      out.push({ type: "trade", player, context: { group: groupOf(player), reason: "public" }, weight: 10, escalation: true });
    }
  }

  if (regular && g.calendar!.day % 5 === 1) {
    // Sent down — wants back up.
    for (const [id, when] of Object.entries(s.sentDown ?? {})) {
      if (addDays(when, 3) > date) continue;
      const player = team.farm?.find((item) => item.id === id);
      if (!player || !healthy(player) || player.age < 20 || player.contractType === "AHL") continue;
      const group = groupOf(player);
      const weakest = groupPlayers(team, group).sort((a, b) => a.ovr - b.ovr)[0];
      if (weakest && player.ovr >= weakest.ovr - 1)
        out.push({ type: "call-up", player, context: { group, nowUnit: 10 }, weight: 4 });
    }
    // Bubble player afraid of being sent down.
    for (const group of ["F", "D"] as const) {
      const prospect = (team.farm ?? [])
        .filter((item) => groupOf(item) === group && item.age <= 23 && healthy(item) && item.contractType !== "AHL")
        .sort((a, b) => b.ovr - a.ovr)[0];
      if (!prospect) continue;
      const bubble = groupPlayers(team, group)
        .filter((item) => healthy(item) && item.age <= 26 && !topTier(at(item.id, 1)))
        .sort((a, b) => a.ovr - b.ovr)[0];
      if (bubble && prospect.ovr >= bubble.ovr + 1)
        out.push({ type: "stay-nhl", player: bubble, context: { group, rivalId: prospect.id, rivalName: prospect.name, nowUnit: unitIndex(at(bubble.id, 1)) }, weight: 3 });
    }
  }

  if (regular && g.calendar!.day % 9 === 5) {
    // Young player asks for a mentor.
    for (const player of orgPlayers(team)) {
      if (player.age > 21 || player.potential - player.ovr < 8 || !healthy(player)) continue;
      if (s.mentors.some((item) => item.playerId === player.id)) continue;
      const group = groupOf(player);
      const mentor = groupPlayers(team, group)
        .filter((other) => other.age >= 30 && other.id !== player.id && other.morale >= 50)
        .sort((a, b) => b.ovr - a.ovr)[0];
      if (mentor)
        out.push({ type: "mentor", player, context: { group, mentorId: mentor.id, mentorName: mentor.name }, weight: 2 });
    }
  }
  return out;
}

function pickRequest(g: Game, team: Team, s: PlayerRequestState, candidates: Candidate[]) {
  const date = g.calendar!.date;
  const weekAgo = addDays(date, -7);
  // Complaints and thanks have separate daily slots.
  const todayFor = (thanks: boolean) =>
    s.requests.filter(
      (item) => item.date === date && (item.type === "thanks") === thanks,
    ).length;
  let sent: PlayerRequest | undefined;
  const thisWeek = s.requests.filter((item) => item.date > weekAgo && item.type !== "thanks").length;
  // Respect the general inbox: no letter on a day with two important messages.
  const busy = (g.events ?? []).filter(
    (event) => event.date === date && event.teamId === g.user && ["high", "critical"].includes(event.priority),
  ).length;
  const inbox = g.inboxState?.cooldowns ?? {};
  const inboxReady = (key: string, days: number) => !inbox[key] || addDays(inbox[key], days) <= date;
  const sorted = [...candidates].sort(
    (a, b) =>
      b.weight - a.weight ||
      hashText(`${g.seed}:${date}:${a.player.id}`) - hashText(`${g.seed}:${date}:${b.player.id}`),
  );
  for (const candidate of sorted) {
    const { type, player } = candidate;
    const important = type !== "thanks";
    if (todayFor(!important) >= REQUESTS_PER_DAY) continue;
    if (important && busy >= 2 && !candidate.escalation) continue;
    if (!candidate.escalation) {
      if (important && thisWeek >= REQUESTS_PER_WEEK) continue;
      if (hasOpenIssue(s, player.id)) continue;
      if (!ready(s, `player:${player.id}`, type === "thanks" ? 14 : PLAYER_COOLDOWN, date)) continue;
      if (!ready(s, `type:${type}`, type === "thanks" ? 10 : TYPE_COOLDOWN, date)) continue;
      if (!ready(s, `${type}:${player.id}`, ["contract", "thanks", "scratched", "mentor"].includes(type) ? 60 : 45, date)) continue;
    } else if (s.requests.some((item) => item.playerId === player.id && item.status === "open")) continue;
    // Do not double up with the assistant's own messages about the same thing.
    if (type === "ice-time" && !inboxReady(`icetime:${player.id}`, 21)) continue;
    if (type === "contract" && !inboxReady(`contract:${player.id}`, 21)) continue;
    const request = createRequest(g, team, candidate);
    if (!request) continue;
    if (g.inboxState) {
      if (type === "ice-time") g.inboxState.cooldowns[`icetime:${player.id}`] = date;
      if (type === "contract") g.inboxState.cooldowns[`contract:${player.id}`] = date;
    }
    sent ??= request;
  }
  return sent;
}

function resolvePromise(g: Game, promise: PlayerPromise, status: "kept" | "broken" | "void", t2: Tr) {
  const s = ensureRequestState(g);
  const date = g.calendar!.date;
  promise.status = status;
  promise.resolved = date;
  if (status === "void") return;
  const player = findOrgPlayer(g, promise.playerId);
  const label = promiseLabel(promise.kind, promise.target, promise.group);
  const l = lang(g);
  if (status === "kept") {
    if (player) applyDelta(player, { morale: 6, relationship: 8, motivation: 4 });
    if (promise.kind === "trade") {
      s.listed = s.listed.filter((item) => item.playerId !== promise.playerId);
      return;
    }
    const line = pickBy(
      [
        t("Вы сдержали слово. Это много значит.", "You kept your word. That means a lot."),
        t("Спасибо, что не забыли. Я это ценю.", "Thanks for following through. I appreciate it."),
      ],
      `${g.seed}:${promise.id}:kept`,
    );
    pushL(g, {
      date,
      category: "organization",
      priority: "normal",
      title: t(`${promise.playerName}: обещание выполнено`, `${promise.playerName}: promise kept`),
      body: t(`«${line.ru}» Выполнено: ${label.ru}. Отношения +8.`, `“${line.en}” Delivered: ${label.en}. Relationship +8.`),
      teamId: g.user,
      playerId: promise.playerId,
    });
    return;
  }
  // Broken.
  if (!player) return;
  applyDelta(player, { morale: -15, relationship: -20, motivation: -8 });
  const alreadyPublic =
    !!listingFor(g, player.id)?.public ||
    s.requests.some(
      (item) =>
        item.playerId === player.id &&
        item.type === "trade" &&
        item.context.reason === "public" &&
        item.season === g.year,
    );
  const goPublic =
    !alreadyPublic &&
    (promise.kind === "trade" || (player.relationship ?? 50) < 25);
  const words = pickBy(
    [
      t(`Вы обещали: ${label.ru}. Ничего не произошло. Больше я на слово не верю.`, `You promised ${label.en}. It never happened. I won't take your word again.`),
      t(`Обещание — ${label.ru} — так и осталось словами. Я разочарован.`, `You said ${label.en}. It stayed just words. I'm disappointed.`),
    ],
    `${g.seed}:${promise.id}:broken`,
  );
  pushL(g, {
    date,
    category: "organization",
    priority: "high",
    title: t(`${player.name}: обещание нарушено`, `${player.name}: promise broken`),
    body: t(
      `«${words.ru}» Мораль −15, отношения −20.${goPublic ? " Игрок готов требовать обмена публично." : ""}`,
      `“${words.en}” Morale −15, relationship −20.${goPublic ? " He is ready to demand a trade in public." : ""}`,
    ),
    action: "roster",
    teamId: g.user,
    playerId: player.id,
  });
  if (goPublic) {
    const request = createRequest(g, userTeam(g), {
      type: "trade",
      player,
      context: { group: groupOf(player), reason: "public" },
      weight: 10,
      escalation: true,
    });
    if (request) {
      // The dressing room hears about it.
      for (const mate of userTeam(g).players)
        if (mate.id !== player.id) {
          mate.morale = clamp(mate.morale - 1, 0, 100);
          syncMoraleBonus(mate);
        }
    }
  }
}

function checkPromises(g: Game, team: Team, s: PlayerRequestState, gameDay: boolean, t2: Tr) {
  const date = g.calendar!.date;
  const games = userGameCount(g, team);
  for (const promise of s.promises) {
    if (promise.status !== "active") continue;
    if (promise.season !== g.year) {
      resolvePromise(g, promise, "void", t2);
      continue;
    }
    const player = findOrgPlayer(g, promise.playerId);
    if (!player) {
      resolvePromise(g, promise, promise.kind === "trade" ? "kept" : "void", t2);
      continue;
    }
    const onFarm = !!team.farm?.some((item) => item.id === player.id);
    const role = roleCode(team, player);
    const gpDelta = player.stats.gp - promise.baseline.gp;
    const gamesDelta = games - promise.baseline.userGames;
    const due = promise.deadline <= date;
    let kept = false;
    let broken = false;
    switch (promise.kind) {
      case "line":
        if (gameDay && promise.made < date) {
          const played = s.roleLog?.at(-1)?.[player.id];
          kept = promise.group === "G" ? played === "G1" : unitIndex(played) <= promise.target;
        }
        break;
      case "dress":
        if (gameDay && promise.made < date && dressed(s.roleLog?.at(-1)?.[player.id])) promise.progress = (promise.progress ?? 0) + 1;
        kept = (promise.progress ?? 0) >= promise.target;
        break;
      case "starts":
        kept = gpDelta >= promise.target;
        break;
      case "rest":
        kept = gamesDelta - gpDelta >= promise.target;
        break;
      case "toi-max":
        if (due) {
          const avg = gpDelta > 0 ? (player.stats.toi - promise.baseline.toi) / gpDelta : 0;
          kept = gpDelta === 0 || avg <= promise.target + 0.25;
          broken = !kept;
        }
        break;
      case "callup":
        kept = !onFarm;
        break;
      case "stay":
        broken = onFarm;
        kept = !onFarm && due;
        break;
      case "contract":
        kept = player.years > Math.max(1, promise.baseline.years);
        break;
      case "trade":
        break;
    }
    if (kept) resolvePromise(g, promise, "kept", t2);
    else if (broken) resolvePromise(g, promise, "broken", t2);
    else if (due) {
      // An injury that kept him out voids game-based promises.
      const gameBased = ["line", "dress", "starts"].includes(promise.kind);
      if (gameBased && player.injury > 0) resolvePromise(g, promise, "void", t2);
      else resolvePromise(g, promise, "broken", t2);
    }
    void role;
  }
}

function expireRequests(g: Game, s: PlayerRequestState) {
  const date = g.calendar!.date;
  for (const request of s.requests) {
    if (request.status !== "open" || request.due >= date) continue;
    request.status = "expired";
    const event = g.events?.find((item) => item.id === request.eventId);
    if (event) event.resolved = true;
    if (request.type === "thanks") continue;
    const player = findOrgPlayer(g, request.playerId);
    if (!player) continue;
    const delta = { morale: -5, relationship: -6, motivation: -2 };
    applyDelta(player, delta);
    request.effects = delta;
    request.reaction = t("Мне даже не ответили.", "I didn't even get an answer.");
  }
}

function updateListings(g: Game, team: Team, s: PlayerRequestState, t2: Tr) {
  const date = g.calendar!.date;
  for (const listing of [...s.listed]) {
    const player = orgPlayers(team).find((item) => item.id === listing.playerId);
    if (!player) {
      s.listed = s.listed.filter((item) => item !== listing);
      continue;
    }
    // A happy player withdraws a private request after three weeks.
    if (!listing.public && addDays(listing.since, 21) <= date && player.morale >= 70 && (player.relationship ?? 50) >= 50) {
      s.listed = s.listed.filter((item) => item !== listing);
      for (const promise of s.promises)
        if (promise.playerId === player.id && promise.kind === "trade" && promise.status === "active")
          resolvePromise(g, promise, "void", t2);
      pushL(g, {
        date,
        category: "trade",
        priority: "normal",
        title: t(`${player.name} отзывает запрос на обмен`, `${player.name} withdraws his trade request`),
        body: t("«Мне здесь снова хорошо. Хочу остаться».", "“Things are good again. I want to stay.”"),
        teamId: g.user,
        playerId: player.id,
      });
    }
  }
  // Rival GMs call about listed players.
  if (g.phase !== "regular" || g.calendar!.day % 6 !== 4) return;
  for (const listing of s.listed) {
    if (!ready(s, `listinq:${listing.playerId}`, 12, date)) continue;
    const player = team.players.find((item) => item.id === listing.playerId);
    if (!player) continue;
    const clubs = g.teams
      .filter((club) => club.id !== g.user)
      .filter((club) => (g.teamNeeds?.[club.id] ?? []).some((need) => groupOf({ pos: need.position } as Player) === groupOf(player)) || club.aiProfile?.strategy === "stanley-cup")
      .sort((a, b) => hashText(`${date}:${a.id}:${player.id}`) - hashText(`${date}:${b.id}:${player.id}`));
    const club = clubs[0];
    if (!club) continue;
    s.cooldowns[`listinq:${listing.playerId}`] = date;
    pushL(g, {
      date,
      category: "trade",
      priority: "normal",
      title: t(`${club.id} интересуется ${player.name}`, `${club.id} enquire about ${player.name}`),
      body: t(
        `${club.city} ${club.name} знают, что ${player.name} просил обмен, и готовы говорить${listing.public ? " — но после публичного скандала рассчитывают на скидку" : ""}. Откройте центр обменов.`,
        `${club.city} ${club.name} know ${player.name} asked to be moved and want to talk${listing.public ? " — after the public demand they expect a discount" : ""}. Open the Trade Center.`,
      ),
      action: "trades",
      teamId: g.user,
      playerId: player.id,
    });
    return;
  }
}

function mentorTick(g: Game, team: Team, s: PlayerRequestState) {
  if (g.calendar!.day % 7 !== 0) return;
  s.mentors = s.mentors.filter((pair) => {
    const young = orgPlayers(team).find((item) => item.id === pair.playerId);
    const mentor = team.players.find((item) => item.id === pair.mentorId);
    if (!young || !mentor) return false;
    young.motivation = clamp((young.motivation ?? 50) + 1, 0, 100);
    young.morale = clamp(young.morale + 1, 0, 100);
    syncMoraleBonus(young);
    return true;
  });
}

/**
 * Daily step: update trackers, check promises, expire unanswered letters,
 * manage the trade list and possibly send one new letter.
 */
export function processPlayerRequests(g: Game) {
  if (!g.calendar || g.phase === "offseason" || g.managerEmployment?.status === "fired")
    return;
  const team = g.teams.find((club) => club.id === g.user);
  if (!team) return;
  const s = ensureRequestState(g);
  const t2: Tr = (ru, en) => (lang(g) === "ru" ? ru : en);
  const gameDay = track(g, team, s);
  expireRequests(g, s);
  checkPromises(g, team, s, gameDay, t2);
  updateListings(g, team, s, t2);
  mentorTick(g, team, s);
  if (!inSeason(g)) return;
  const candidates = collectCandidates(g, team, s, gameDay);
  pickRequest(g, team, s, candidates);
  // Keep cooldowns compact.
  const date = g.calendar.date;
  for (const [key, last] of Object.entries(s.cooldowns))
    if (addDays(last, 200) < date) delete s.cooldowns[key];
}

/** Test/debug hook: force a specific request for a player now. */
export function sendPlayerRequest(
  g: Game,
  playerId: string,
  type: RequestType,
  context: Partial<RequestContext> = {},
) {
  const team = userTeam(g);
  const player = orgPlayers(team).find((item) => item.id === playerId);
  if (!player) throw Error("Player unavailable");
  ensureRequestState(g);
  return createRequest(g, team, {
    type,
    player,
    context: { group: groupOf(player), ...context },
    weight: 0,
    escalation: true,
  });
}
