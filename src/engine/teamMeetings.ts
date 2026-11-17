/**
 * Team meetings: the manager picks a topic and a tone, the squad reacts by
 * group (leaders, veterans, young players, unhappy players).
 *
 * The outcome depends on the situation (form, streak, next opponent,
 * discipline, a struggling player, season start), on whether the tone fits
 * the topic, and on how often the manager has called the room together
 * lately. Deterministic: state + FNV hashing, no Math.random.
 */
import { addDays, fixtureDate } from "./management";
import { clamp } from "./random";
import { pickBy, type L } from "./dialogueText";
import { leadershipScore } from "./leadership";
import { tx } from "./text";
import type {
  Game,
  MeetingGroup,
  MeetingReaction,
  Player,
  TeamMeetingRecord,
  TeamMeetingTone,
  TeamMeetingTopic,
} from "./types";

export const MEETING_COOLDOWN_DAYS = 4;
/** Meetings inside this window weaken the next one. */
export const MEETING_MEMORY_DAYS = 21;

export const MEETING_TOPICS: TeamMeetingTopic[] = [
  "praise",
  "demand-more",
  "losing-streak",
  "big-game",
  "discipline",
  "back-player",
  "expectations",
];
export const MEETING_TONES: TeamMeetingTone[] = [
  "supportive",
  "calm",
  "demanding",
  "furious",
];
export const MEETING_GROUPS: MeetingGroup[] = [
  "leaders",
  "veterans",
  "young",
  "unhappy",
];

export const TOPIC_LABELS: Record<TeamMeetingTopic, { title: L; detail: L }> = {
  praise: {
    title: { ru: "Похвалить за серию", en: "Praise the run" },
    detail: {
      ru: "Отметить хорошую игру и закрепить то, что работает.",
      en: "Recognise good form and lock in what works.",
    },
  },
  "demand-more": {
    title: { ru: "Потребовать большего", en: "Demand more" },
    detail: {
      ru: "Команда играет ниже своего уровня. Сказать это вслух.",
      en: "The team is playing below its level. Say it out loud.",
    },
  },
  "losing-streak": {
    title: { ru: "Серия поражений", en: "Losing streak" },
    detail: {
      ru: "Разобрать серию и найти выход вместе с игроками.",
      en: "Break down the streak and find a way out with the players.",
    },
  },
  "big-game": {
    title: { ru: "Настрой на важный матч", en: "Rally for a big game" },
    detail: {
      ru: "Плей-офф, дерби или лидер лиги следующим соперником.",
      en: "Playoffs, a rival or a top team up next.",
    },
  },
  discipline: {
    title: { ru: "Дисциплина и удаления", en: "Discipline and penalties" },
    detail: {
      ru: "Слишком много лишних удалений. Обозначить границы.",
      en: "Too many needless penalties. Draw the line.",
    },
  },
  "back-player": {
    title: { ru: "Поддержать игрока", en: "Back a player" },
    detail: {
      ru: "Публично встать за игрока или вратаря в спаде.",
      en: "Stand behind a struggling skater or goalie in front of everyone.",
    },
  },
  expectations: {
    title: { ru: "Задачи на сезон", en: "Set expectations" },
    detail: {
      ru: "Объяснить цели клуба и что ждут от каждого.",
      en: "Explain the club's targets and what each player owes.",
    },
  },
};

export const TONE_LABELS: Record<TeamMeetingTone, { title: L; detail: L }> = {
  supportive: {
    title: { ru: "Поддержка", en: "Supportive" },
    detail: { ru: "Снять давление.", en: "Take the pressure off." },
  },
  calm: {
    title: { ru: "Спокойно", en: "Calm" },
    detail: { ru: "Факты и план.", en: "Facts and a plan." },
  },
  demanding: {
    title: { ru: "Требовательно", en: "Demanding" },
    detail: { ru: "Стандарт выше комфорта.", en: "Standards over comfort." },
  },
  furious: {
    title: { ru: "Разнос", en: "Furious" },
    detail: { ru: "Хлопнуть дверью. Рискованно.", en: "Slam the door. Risky." },
  },
};

export const GROUP_LABELS: Record<MeetingGroup, L> = {
  leaders: { ru: "Лидеры", en: "Leaders" },
  veterans: { ru: "Ветераны", en: "Veterans" },
  young: { ru: "Молодые", en: "Young players" },
  unhappy: { ru: "Недовольные", en: "Unhappy players" },
};

export const REACTION_LABELS: Record<MeetingReaction, L> = {
  inspired: { ru: "Заряжены", en: "Fired up" },
  positive: { ru: "Приняли", en: "On board" },
  indifferent: { ru: "Равнодушны", en: "Indifferent" },
  unconvinced: { ru: "Не убеждены", en: "Unconvinced" },
  angry: { ru: "Злы", en: "Angry" },
};

// --- context ---------------------------------------------------------------

function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

const userTeam = (g: Game) => g.teams.find((team) => team.id === g.user)!;
const meetingDate = (g: Game) => g.calendar?.date ?? `${g.year}-09-15`;

export interface StrugglingPlayer {
  player: Player;
  why: "form" | "goalie" | "morale";
}

export interface MeetingContext {
  date: string;
  gamesPlayed: number;
  last5: string[];
  wins5: number;
  losses5: number;
  streak?: { kind: "W" | "L"; n: number };
  averageMorale: number;
  bigGame?: { opponent: string; reason: "playoffs" | "rival" | "contender" };
  pimPerGame: number;
  leaguePimPerGame: number;
  seasonStart: boolean;
  struggling: StrugglingPlayer[];
  lastMeeting?: TeamMeetingRecord;
  daysSinceLast?: number;
  recentMeetings: number;
  cooldownUntil?: string;
  onCooldown: boolean;
}

function currentStreak(g: Game, form: string[]) {
  let n = 0;
  const lastResult = form.at(-1);
  if (!lastResult) return undefined;
  const kind = lastResult === "W" ? ("W" as const) : ("L" as const);
  for (let i = form.length - 1; i >= 0; i--) {
    if ((form[i] === "W") !== (kind === "W")) break;
    n++;
  }
  const tracked = g.inboxState?.streak;
  if (tracked?.kind === kind && tracked.n > n) n = tracked.n;
  return { kind, n };
}

function saves(player: Player) {
  return player.stats.sa ? 1 - player.stats.ga / player.stats.sa : 1;
}

export function meetingContext(g: Game): MeetingContext {
  const team = userTeam(g);
  const date = meetingDate(g);
  const last5 = team.record.form.slice(-5);
  const averageMorale =
    team.players.reduce((sum, player) => sum + player.morale, 0) /
    Math.max(1, team.players.length);
  const pim = (club: typeof team) =>
    club.players.reduce((sum, player) => sum + player.stats.pim, 0) /
    Math.max(1, club.record.gp);
  const leaguePimPerGame =
    g.teams.reduce((sum, club) => sum + pim(club), 0) /
    Math.max(1, g.teams.length);

  let bigGame: MeetingContext["bigGame"];
  if (g.phase === "playoffs") {
    const series = g.bracket[g.playoffRound]?.find(
      (item) => !item.winner && [item.a, item.b].includes(team.id),
    );
    if (series)
      bigGame = {
        opponent: series.a === team.id ? series.b : series.a,
        reason: "playoffs",
      };
  } else if (g.phase === "regular") {
    const next = g.schedule.find(
      (fixture) =>
        !fixture.result &&
        fixture.round >= g.round &&
        [fixture.home, fixture.away].includes(team.id),
    );
    if (next && daysBetween(date, fixtureDate(g, next.round)) <= 3) {
      const opponent = next.home === team.id ? next.away : next.home;
      const rival = (g.rivalries ?? []).some(
        (rivalry) =>
          rivalry.heat >= 60 &&
          [rivalry.teamA, rivalry.teamB].includes(team.id) &&
          [rivalry.teamA, rivalry.teamB].includes(opponent),
      );
      const standings = [...g.teams].sort(
        (a, b) => b.record.pts - a.record.pts,
      );
      const club = g.teams.find((item) => item.id === opponent);
      const contender =
        team.record.gp >= 10
          ? standings.findIndex((item) => item.id === opponent) < 5
          : (club?.strengthRank ?? 99) <= 5;
      if (rival || contender)
        bigGame = { opponent, reason: rival ? "rival" : "contender" };
    }
  }

  const struggling: StrugglingPlayer[] = [];
  for (const player of team.players) {
    if (player.pos === "G") {
      if (player.stats.sa >= 120 && saves(player) < 0.895)
        struggling.push({ player, why: "goalie" });
      else if (player.morale < 40) struggling.push({ player, why: "morale" });
    } else if ((player.performanceForm ?? 0) <= -10)
      struggling.push({ player, why: "form" });
    else if (player.morale < 40) struggling.push({ player, why: "morale" });
  }
  struggling.sort(
    (a, b) =>
      (a.player.performanceForm ?? 0) - (b.player.performanceForm ?? 0) ||
      a.player.morale - b.player.morale,
  );

  const meetings = g.teamMeetings ?? [];
  const lastMeeting = meetings[0];
  const daysSinceLast = lastMeeting
    ? daysBetween(lastMeeting.date, date)
    : undefined;
  const recentMeetings = meetings.filter((meeting) => {
    const age = daysBetween(meeting.date, date);
    return age >= 0 && age < MEETING_MEMORY_DAYS;
  }).length;
  const cooldownUntil = lastMeeting
    ? addDays(lastMeeting.date, MEETING_COOLDOWN_DAYS)
    : undefined;
  return {
    date,
    gamesPlayed: team.record.gp,
    last5,
    wins5: last5.filter((result) => result === "W").length,
    losses5: last5.filter((result) => result !== "W").length,
    streak: currentStreak(g, last5),
    averageMorale,
    bigGame,
    pimPerGame: pim(team),
    leaguePimPerGame,
    seasonStart:
      g.phase === "regular" &&
      (!g.calendar || date < g.calendar.seasonStart || team.record.gp <= 5),
    struggling,
    lastMeeting,
    daysSinceLast,
    recentMeetings,
    cooldownUntil,
    onCooldown: !!cooldownUntil && date < cooldownUntil,
  };
}

// --- situation and tone fit -----------------------------------------------

export interface TopicFit {
  /** −5 (wrong moment) … +5 (exactly what the room needs). */
  score: number;
  note: L;
}

/** How well a topic fits the current situation (the assistant's read). */
export function topicFit(
  g: Game,
  ctx: MeetingContext,
  topic: TeamMeetingTopic,
  targetPlayerId?: string,
): TopicFit {
  const lStreak = ctx.streak?.kind === "L" ? ctx.streak.n : 0;
  const wStreak = ctx.streak?.kind === "W" ? ctx.streak.n : 0;
  const goodRun = ctx.wins5 >= 4 || wStreak >= 3;
  const badRun = ctx.losses5 >= 3;
  switch (topic) {
    case "praise":
      if (goodRun)
        return {
          score: 5,
          note: { ru: "Команда в хорошей форме.", en: "The team is in form." },
        };
      if (badRun)
        return {
          score: -5,
          note: {
            ru: "Хвалить после поражений — значит не видеть проблем.",
            en: "Praise after defeats looks out of touch.",
          },
        };
      return {
        score: ctx.wins5 >= 3 ? 1 : -1,
        note: {
          ru: "Хвалить пока особо не за что.",
          en: "Not much to praise yet.",
        },
      };
    case "demand-more":
      if (wStreak >= 3)
        return {
          score: -4,
          note: {
            ru: "Команда выигрывает. Требования прозвучат странно.",
            en: "The team is winning. Demands will sound odd.",
          },
        };
      if (lStreak >= 5)
        return {
          score: 1,
          note: {
            ru: "Игроки и так знают, что играют плохо.",
            en: "The players already know they're playing badly.",
          },
        };
      if (ctx.losses5 >= 2 && ctx.gamesPlayed >= 3)
        return {
          score: 4,
          note: {
            ru: "Результаты ниже уровня состава.",
            en: "Results are below what this roster can do.",
          },
        };
      return {
        score: -1,
        note: { ru: "Повод так себе.", en: "A thin reason." },
      };
    case "losing-streak":
      if (lStreak >= 3)
        return {
          score: 5,
          note: {
            ru: `${lStreak} поражений подряд. Поговорить нужно.`,
            en: `${lStreak} straight losses. This needs addressing.`,
          },
        };
      if (lStreak === 2)
        return {
          score: 1,
          note: {
            ru: "Два поражения — это ещё не серия.",
            en: "Two losses aren't a streak yet.",
          },
        };
      return {
        score: -4,
        note: {
          ru: "Никакой серии поражений нет.",
          en: "There is no losing streak.",
        },
      };
    case "big-game":
      if (ctx.bigGame?.reason === "playoffs")
        return {
          score: 5,
          note: {
            ru: `Серия плей-офф против ${ctx.bigGame.opponent}.`,
            en: `Playoff series against ${ctx.bigGame.opponent}.`,
          },
        };
      if (ctx.bigGame)
        return {
          score: 4,
          note: {
            ru: `Следующий соперник — ${ctx.bigGame.opponent}.`,
            en: `${ctx.bigGame.opponent} up next.`,
          },
        };
      return {
        score: -3,
        note: {
          ru: "Ближайший матч рядовой.",
          en: "The next game is a routine one.",
        },
      };
    case "discipline": {
      if (ctx.gamesPlayed < 5)
        return {
          score: -3,
          note: {
            ru: "Слишком мало матчей, чтобы говорить об удалениях.",
            en: "Too few games to talk about penalties.",
          },
        };
      const ratio = ctx.pimPerGame / Math.max(0.1, ctx.leaguePimPerGame);
      if (ratio >= 1.15)
        return {
          score: 4,
          note: {
            ru: `${ctx.pimPerGame.toFixed(1)} штрафных минут за матч при ${ctx.leaguePimPerGame.toFixed(1)} в среднем по лиге.`,
            en: `${ctx.pimPerGame.toFixed(1)} PIM per game against a league average of ${ctx.leaguePimPerGame.toFixed(1)}.`,
          },
        };
      if (ratio >= 1)
        return {
          score: 1,
          note: {
            ru: "Удалений чуть больше среднего.",
            en: "Slightly more penalties than average.",
          },
        };
      return {
        score: -3,
        note: {
          ru: "Команда одна из самых дисциплинированных.",
          en: "The team is among the most disciplined.",
        },
      };
    }
    case "back-player": {
      const target = ctx.struggling.find(
        (item) => item.player.id === targetPlayerId,
      );
      if (target)
        return {
          score: 4,
          note: {
            ru: `${target.player.name} в спаде и нуждается в поддержке.`,
            en: `${target.player.name} is struggling and needs backing.`,
          },
        };
      const player = userTeam(g).players.find(
        (item) => item.id === targetPlayerId,
      );
      return {
        score: player ? -1 : -3,
        note: player
          ? {
              ru: `${player.name} не в кризисе. Поддержка выглядит лишней.`,
              en: `${player.name} isn't in a slump. The backing looks unnecessary.`,
            }
          : { ru: "Выберите игрока.", en: "Pick a player." },
      };
    }
    case "expectations":
      if (ctx.seasonStart)
        return {
          score: 4,
          note: {
            ru: "Начало сезона — время обозначить задачи.",
            en: "Season start is the time to set targets.",
          },
        };
      return {
        score: ctx.gamesPlayed > 60 ? -3 : -2,
        note: {
          ru: "Задачи давно известны. Повторять их поздно.",
          en: "The targets are known. It's late to repeat them.",
        },
      };
  }
}

const TONE_FIT: Record<TeamMeetingTopic, Record<TeamMeetingTone, number>> = {
  praise: { supportive: 2, calm: 2, demanding: 0, furious: -4 },
  "demand-more": { supportive: -1, calm: 1, demanding: 3, furious: 1 },
  "losing-streak": { supportive: 3, calm: 2, demanding: 0, furious: -2 },
  "big-game": { supportive: 1, calm: 2, demanding: 2, furious: 0 },
  discipline: { supportive: -2, calm: 2, demanding: 3, furious: 1 },
  "back-player": { supportive: 3, calm: 2, demanding: -2, furious: -4 },
  expectations: { supportive: 1, calm: 3, demanding: 2, furious: -3 },
};

const GROUP_TONE: Record<MeetingGroup, Record<TeamMeetingTone, number>> = {
  leaders: { supportive: 0, calm: 1, demanding: 1, furious: -1 },
  veterans: { supportive: 0, calm: 1, demanding: 0, furious: -2 },
  young: { supportive: 2, calm: 1, demanding: -1, furious: -3 },
  unhappy: { supportive: 2, calm: 0, demanding: -2, furious: -3 },
};

export function toneFit(
  ctx: MeetingContext,
  topic: TeamMeetingTopic,
  tone: TeamMeetingTone,
) {
  let fit = TONE_FIT[topic][tone];
  // A furious outburst during a long slide breaks a fragile room.
  if (
    tone === "furious" &&
    ctx.streak?.kind === "L" &&
    ctx.streak.n >= 5 &&
    ctx.averageMorale < 55
  )
    fit -= 2;
  return fit;
}

// --- groups ----------------------------------------------------------------

export function playerMeetingGroup(
  g: Game,
  player: Player,
): MeetingGroup | undefined {
  const team = userTeam(g);
  if (player.morale < 45) return "unhappy";
  if (
    team.captainId === player.id ||
    team.alternateCaptainIds?.includes(player.id) ||
    (leadershipScore(player) >= 76 && player.age >= 26)
  )
    return "leaders";
  if (player.age >= 30) return "veterans";
  if (player.age <= 23) return "young";
  return undefined;
}

export function reactionFor(score: number): MeetingReaction {
  if (score >= 5) return "inspired";
  if (score >= 2) return "positive";
  if (score > -2) return "indifferent";
  if (score > -5) return "unconvinced";
  return "angry";
}

const REACTION_LINES: Record<MeetingGroup, Record<MeetingReaction, L[]>> = {
  leaders: {
    inspired: [
      {
        ru: "Капитан первым встал: «Всё слышали? Работаем».",
        en: 'The captain is first on his feet: "You heard him. Let\'s go."',
      },
      {
        ru: "Лидеры сами продолжили разговор после вашего ухода.",
        en: "The leaders kept the talk going after you left.",
      },
    ],
    positive: [
      {
        ru: "Лидеры кивают. Посыл понятен.",
        en: "The leaders nod. Message received.",
      },
      {
        ru: "Капитан пообещал донести это до каждого.",
        en: "The captain promises to take it to every player.",
      },
    ],
    indifferent: [
      {
        ru: "Лидеры выслушали и промолчали.",
        en: "The leaders listened and said nothing.",
      },
      {
        ru: "Капитан пожал плечами: «Посмотрим на льду».",
        en: 'The captain shrugs: "We\'ll see on the ice."',
      },
    ],
    unconvinced: [
      {
        ru: "Капитан после собрания попросил пару минут наедине. Он не согласен.",
        en: "The captain asks for a word afterwards. He doesn't agree.",
      },
      {
        ru: "Лидеры переглянулись. Это было не то, что нужно.",
        en: "The leaders exchange looks. That wasn't what the room needed.",
      },
    ],
    angry: [
      {
        ru: "Капитан резко ответил при всех. В раздевалке повисла тишина.",
        en: "The captain snaps back in front of everyone. The room goes silent.",
      },
      {
        ru: "Лидеры считают, что вы потеряли контроль над ситуацией.",
        en: "The leaders think you've lost the plot.",
      },
    ],
  },
  veterans: {
    inspired: [
      {
        ru: "Ветераны давно не видели вас таким. Им понравилось.",
        en: "The veterans haven't seen you like this in a while. They liked it.",
      },
      {
        ru: "Старшие игроки задержались на льду после тренировки.",
        en: "The older guys stayed out after practice.",
      },
    ],
    positive: [
      {
        ru: "Ветераны согласны: по делу.",
        en: "The veterans agree. Fair points.",
      },
      {
        ru: "Опытные игроки одобрили спокойный разбор.",
        en: "The experienced players approve of the straight talk.",
      },
    ],
    indifferent: [
      {
        ru: "Ветераны слышали такое сотни раз.",
        en: "The veterans have heard this a hundred times.",
      },
      {
        ru: "Старшие игроки смотрели в телефоны.",
        en: "The older players were checking their phones.",
      },
    ],
    unconvinced: [
      {
        ru: "Ветераны считают, что собрание было лишним.",
        en: "The veterans think the meeting was unnecessary.",
      },
      {
        ru: "Опытные игроки недовольны тоном.",
        en: "The experienced players didn't like the tone.",
      },
    ],
    angry: [
      {
        ru: "Ветераны не позволят разговаривать с собой как с юниорами.",
        en: "The veterans won't be spoken to like juniors.",
      },
      {
        ru: "Один из ветеранов вышел, не дождавшись конца.",
        en: "One of the veterans walked out before the end.",
      },
    ],
  },
  young: {
    inspired: [
      {
        ru: "Молодые горят желанием доказать, что вы в них не ошиблись.",
        en: "The young players can't wait to prove you right.",
      },
      {
        ru: "Новички переписали ваши слова себе в заметки.",
        en: "The rookies wrote your words down.",
      },
    ],
    positive: [
      {
        ru: "Молодые игроки почувствовали доверие.",
        en: "The young players feel trusted.",
      },
      {
        ru: "Молодёжь собралась и слушала внимательно.",
        en: "The kids sat up and listened.",
      },
    ],
    indifferent: [
      {
        ru: "Молодые не поняли, что от них хотят.",
        en: "The young players aren't sure what you want from them.",
      },
      {
        ru: "Молодёжь не поняла, к кому это было обращено.",
        en: "The kids didn't know who that was aimed at.",
      },
    ],
    unconvinced: [
      {
        ru: "Молодые зажались. На тренировке боялись ошибиться.",
        en: "The young players tightened up. Practice was nervous.",
      },
      {
        ru: "Новички приняли критику на свой счёт.",
        en: "The rookies took it personally.",
      },
    ],
    angry: [
      {
        ru: "Двое молодых после собрания звонили агентам.",
        en: "Two of the kids called their agents after the meeting.",
      },
      {
        ru: "Молодёжь напугана. Уверенности стало меньше.",
        en: "The young players are rattled. Confidence is down.",
      },
    ],
  },
  unhappy: {
    inspired: [
      {
        ru: "Даже недовольные признали: это было честно.",
        en: "Even the unhappy players admit that was fair.",
      },
      {
        ru: "Игроки на скамейке почувствовали, что о них помнят.",
        en: "The guys out of the lineup feel remembered.",
      },
    ],
    positive: [
      {
        ru: "Недовольные немного оттаяли.",
        en: "The unhappy players have softened a little.",
      },
      {
        ru: "Обиженные игроки готовы дать вам шанс.",
        en: "The disgruntled players will give you a chance.",
      },
    ],
    indifferent: [
      {
        ru: "Недовольные остались при своём мнении.",
        en: "The unhappy players haven't changed their minds.",
      },
      {
        ru: "Обиженные игроки слушали вполуха.",
        en: "The disgruntled players half-listened.",
      },
    ],
    unconvinced: [
      {
        ru: "Недовольные увидели в этом очередные пустые слова.",
        en: "The unhappy players heard more empty words.",
      },
      {
        ru: "Обиженные шептались в углу всё собрание.",
        en: "The disgruntled players whispered in the corner the whole time.",
      },
    ],
    angry: [
      {
        ru: "Недовольные теперь открыто против вас.",
        en: "The unhappy players are now openly against you.",
      },
      {
        ru: "После собрания один из недовольных заговорил об обмене.",
        en: "One of the unhappy players brought up a trade afterwards.",
      },
    ],
  },
};

const OUTCOME_LINES: Record<TeamMeetingRecord["outcome"], L[]> = {
  positive: [
    {
      ru: "Собрание сработало. В раздевалке стало громче.",
      en: "The meeting worked. The room is louder.",
    },
    {
      ru: "Команда вышла с собрания с понятной задачей.",
      en: "The team left with a clear job to do.",
    },
  ],
  neutral: [
    {
      ru: "Собрание прошло без последствий.",
      en: "The meeting came and went.",
    },
    {
      ru: "Игроки выслушали и разошлись.",
      en: "The players listened and left.",
    },
  ],
  negative: [
    {
      ru: "Собрание обернулось против вас.",
      en: "The meeting backfired.",
    },
    {
      ru: "Раздевалка вышла злее, чем зашла.",
      en: "The room left angrier than it came in.",
    },
  ],
};

// --- holding a meeting ------------------------------------------------------

export interface MeetingChoice {
  topic: TeamMeetingTopic;
  tone: TeamMeetingTone;
  targetPlayerId?: string;
}

export interface MeetingResult {
  record: TeamMeetingRecord;
  notes: L[];
  situation: number;
  toneScore: number;
  repetition: number;
}

/** Repetition factor for positive effects: 1 for a fresh meeting. */
export function repetitionFactor(ctx: MeetingContext, topic: TeamMeetingTopic) {
  const sameTopicRecently =
    ctx.lastMeeting &&
    (ctx.lastMeeting.topic ?? ctx.lastMeeting.reason) === topic &&
    (ctx.daysSinceLast ?? 99) < 30;
  return (
    1 / (1 + 0.6 * ctx.recentMeetings) / (sameTopicRecently ? 1.5 : 1)
  );
}

export function canHoldMeeting(g: Game) {
  const ctx = meetingContext(g);
  return !ctx.onCooldown && g.phase !== "offseason";
}

/** Holds a team meeting and applies its effects. Throws on cooldown. */
export function holdTeamMeeting(g: Game, choice: MeetingChoice): MeetingResult {
  const ctx = meetingContext(g);
  if (ctx.onCooldown)
    throw Error(`Meeting cooldown until ${ctx.cooldownUntil}`);
  if (g.phase === "offseason") throw Error("No meetings in the offseason");
  const team = userTeam(g);
  const { topic, tone } = choice;
  const target =
    topic === "back-player"
      ? team.players.find((player) => player.id === choice.targetPlayerId)
      : undefined;
  if (topic === "back-player" && !target)
    throw Error("Pick a player to back");

  const fit = topicFit(g, ctx, topic, target?.id);
  const toneScore = toneFit(ctx, topic, tone);
  const raw = fit.score + toneScore;
  const repetition = repetitionFactor(ctx, topic);
  // Repetition dulls the good and sharpens the bad.
  const base =
    raw > 0 ? raw * repetition : raw - Math.min(3, ctx.recentMeetings);
  const notes: L[] = [fit.note];
  if (toneScore <= -2)
    notes.push({
      ru: "Тон не подошёл к теме.",
      en: "The tone didn't suit the topic.",
    });
  else if (toneScore >= 3)
    notes.push({
      ru: "Тон попал точно в цель.",
      en: "The tone was spot on.",
    });
  if (ctx.recentMeetings >= 1)
    notes.push({
      ru: `Уже ${ctx.recentMeetings + 1}-е собрание за три недели. Слова теряют вес.`,
      en: `Meeting number ${ctx.recentMeetings + 1} in three weeks. The words carry less weight.`,
    });

  const seed = `${g.seed}:${ctx.date}:${topic}:${tone}:${target?.id ?? ""}`;
  const groupScore = (group: MeetingGroup) => {
    let score = base + GROUP_TONE[group][tone];
    if (group === "leaders") score += fit.score >= 3 ? 1 : fit.score <= -3 ? -1 : 0;
    if (group === "unhappy" && target && target.morale < 45) score += 2;
    if (group === "veterans" && topic === "demand-more" && fit.score < 0)
      score -= 1;
    return score;
  };
  const members = new Map<MeetingGroup, Player[]>();
  for (const player of team.players) {
    const group = playerMeetingGroup(g, player);
    if (group) members.set(group, [...(members.get(group) ?? []), player]);
  }
  const reactions: NonNullable<TeamMeetingRecord["reactions"]> = [];
  for (const group of MEETING_GROUPS) {
    const players = members.get(group);
    if (!players?.length) continue;
    const reaction = reactionFor(groupScore(group));
    const line = pickBy(REACTION_LINES[group][reaction], `${seed}:${group}`);
    reactions.push({
      group,
      reaction,
      count: players.length,
      ru: line.ru,
      en: line.en,
    });
  }

  let moraleTotal = 0;
  let motivationTotal = 0;
  for (const player of team.players) {
    const group = playerMeetingGroup(g, player);
    const score = group ? groupScore(group) : base;
    let morale = clamp(Math.round(score * 0.7), -6, 5);
    let motivation = clamp(Math.round(score * 1.1), -8, 8);
    if (target && player.id === target.id) {
      const backing = { supportive: 5, calm: 3, demanding: -3, furious: -6 }[
        tone
      ];
      morale += backing;
      motivation += Math.round(backing / 2);
      player.relationship = clamp(
        (player.relationship ?? 50) + backing,
        0,
        100,
      );
    }
    player.morale = clamp(player.morale + morale, 0, 100);
    player.motivation = clamp((player.motivation ?? 50) + motivation, 0, 100);
    moraleTotal += morale;
    motivationTotal += motivation;
  }
  const captain = team.players.find((player) => player.id === team.captainId);
  if (captain)
    captain.relationship = clamp(
      (captain.relationship ?? 50) + Math.sign(Math.round(base)) * 2,
      0,
      100,
    );

  const outcome: TeamMeetingRecord["outcome"] =
    base >= 2 ? "positive" : base <= -2 ? "negative" : "neutral";
  const summary = pickBy(OUTCOME_LINES[outcome], seed);
  const size = Math.max(1, team.players.length);
  const record: TeamMeetingRecord = {
    date: ctx.date,
    reason: topic,
    topic,
    tone,
    leaderId: captain?.id ?? "",
    ...(target ? { targetPlayerId: target.id } : {}),
    outcome,
    score: Math.round(base * 10) / 10,
    message: tx(g, summary.ru, summary.en),
    messageI18n: summary,
    reactions,
    moraleDelta: Math.round((moraleTotal / size) * 10) / 10,
    motivationDelta: Math.round((motivationTotal / size) * 10) / 10,
  };
  (g.teamMeetings ??= []).unshift(record);
  g.teamMeetings = g.teamMeetings.slice(0, 40);
  if (outcome !== "neutral")
    g.news.unshift(
      outcome === "positive"
        ? tx(
            g,
            `Командное собрание в ${team.id}: игроки поддержали тренера.`,
            `${team.id} team meeting: the players back the coach.`,
          )
        : tx(
            g,
            `Командное собрание в ${team.id} прошло напряжённо.`,
            `Tense team meeting in ${team.id}.`,
          ),
    );
  return {
    record,
    notes,
    situation: fit.score,
    toneScore,
    repetition,
  };
}
