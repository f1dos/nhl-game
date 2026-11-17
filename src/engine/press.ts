/**
 * Press conferences: several context-aware questions from fictional
 * journalists before and after a match. Every string is bilingual; answers
 * carry visible consequences for fans, the board, the dressing room and,
 * when a player is named, that player's morale.
 */
import { clamp } from "./random";
import { syncMoraleBonus } from "./franchiseWorld";
import type { Game, Player, PressAppearance, Result, Team } from "./types";
import {
  dialogueLang,
  enPlural,
  hashText,
  pickBy,
  pickManyBy,
  ruPlural,
  say,
  type L,
} from "./dialogueText";

export type PressType = PressAppearance["type"];
export type PressTone = PressAppearance["tone"];

export interface PressJournalist {
  id: string;
  name: L;
  outlet: L;
}

export interface PressAnswer {
  id: string;
  tone: PressTone;
  style: L;
  line: L;
  reaction: L;
  fan: number;
  board: number;
  morale: number;
  playerId?: string;
  playerName?: string;
  playerMorale?: number;
}

export interface PressQuestion {
  id: string;
  topic: string;
  journalist: PressJournalist;
  text: L;
  answers: PressAnswer[];
}

export interface PressConference {
  date: string;
  type: PressType;
  opponentId?: string;
  questions: PressQuestion[];
}

// Fictional reporters and outlets.
export const JOURNALISTS: PressJournalist[] = [
  {
    id: "lindqvist",
    name: { ru: "Мара Линдквист", en: "Mara Lindqvist" },
    outlet: { ru: "«Северный вестник»", en: "The Northern Ledger" },
  },
  {
    id: "okafor",
    name: { ru: "Дейл Окафор", en: "Dale Okafor" },
    outlet: { ru: "радио «Ринк Репорт»", en: "Rink Report Radio" },
  },
  {
    id: "kessler",
    name: { ru: "Софи Кесслер", en: "Sophie Kessler" },
    outlet: { ru: "«Синяя линия»", en: "Blue Line Daily" },
  },
  {
    id: "voronin",
    name: { ru: "Илья Воронин", en: "Ilya Voronin" },
    outlet: { ru: "«Шайба Онлайн»", en: "Puck Online" },
  },
  {
    id: "brannigan",
    name: { ru: "Том Брэнниган", en: "Tom Brannigan" },
    outlet: { ru: "«Овертайм Уикли»", en: "Overtime Weekly" },
  },
  {
    id: "duval",
    name: { ru: "Селин Дюваль", en: "Céline Duval" },
    outlet: { ru: "«Ле Филе Спорт»", en: "Le Filet Sport" },
  },
  {
    id: "hartley",
    name: { ru: "Джесс Хартли", en: "Jess Hartley" },
    outlet: { ru: "подкаст «Площадь вратаря»", en: "The Crease Cast" },
  },
  {
    id: "novak",
    name: { ru: "Петр Новак", en: "Petr Novak" },
    outlet: { ru: "«Хоккей Центральной Европы»", en: "Hockey Central Europe" },
  },
];

export const PRESS_TONE_LABELS: Record<PressTone, L> = {
  protective: { ru: "Защита команды", en: "Protective" },
  balanced: { ru: "Взвешенно", en: "Balanced" },
  ambitious: { ru: "Амбициозно", en: "Ambitious" },
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PressCtx {
  game: Game;
  type: PressType;
  team: Team;
  opp?: Team;
  oppName: string;
  preseason: boolean;
  result?: {
    won: boolean;
    gf: number;
    ga: number;
    ot: boolean;
    so: boolean;
    sf: number;
    sa: number;
    ppg: number;
    ppo: number;
    raw: Result;
  };
  streak: { won: boolean; count: number };
  leagueRank: number;
  confRank: number;
  gp: number;
  rivalry?: { wins: number; losses: number };
  series?: { us: number; them: number };
}

const fullName = (team: Team) => `${team.city} ${team.name}`;

function computeStreak(game: Game, teamId: string) {
  const played = game.schedule
    .filter(
      (fixture) =>
        fixture.result && [fixture.home, fixture.away].includes(teamId),
    )
    .sort((a, b) => b.round - a.round);
  let won: boolean | undefined;
  let count = 0;
  for (const fixture of played) {
    const r = fixture.result!;
    const ours = r.home === teamId ? r.goals[0] : r.goals[1];
    const theirs = r.home === teamId ? r.goals[1] : r.goals[0];
    const w = ours > theirs;
    if (won === undefined) won = w;
    if (w !== won) break;
    count++;
  }
  return { won: !!won, count };
}

const pointsPct = (team: Team) =>
  team.record.gp
    ? team.record.pts / (team.record.gp * 2)
    : (team.strengthRating ?? 70) / 140;

function rankOf(teams: Team[], id: string) {
  return (
    [...teams]
      .sort((a, b) => b.record.pts - a.record.pts || a.record.gp - b.record.gp)
      .findIndex((team) => team.id === id) + 1
  );
}

/** Opponent of the user's current (pre-match) or last (post-match) game. */
export function pressOpponentId(game: Game, type: PressType) {
  if (type === "post-match" && game.last)
    return game.last.home === game.user ? game.last.away : game.last.home;
  const preseason = game.preseasonFixtures?.find(
    (fixture) => fixture.date === game.calendar?.date && !fixture.result,
  );
  if (preseason)
    return preseason.home === game.user ? preseason.away : preseason.home;
  const fixture = game.schedule.find(
    (item) =>
      item.round === game.round &&
      [item.home, item.away].includes(game.user) &&
      !item.result,
  );
  if (fixture) return fixture.home === game.user ? fixture.away : fixture.home;
  if (game.phase === "playoffs") {
    const series = game.bracket[game.playoffRound]?.find(
      (item) => !item.winner && [item.a, item.b].includes(game.user),
    );
    if (series) return series.a === game.user ? series.b : series.a;
  }
  return undefined;
}

function buildContext(
  game: Game,
  type: PressType,
  opponentId?: string,
): PressCtx {
  const team = game.teams.find((club) => club.id === game.user)!;
  const oppId = opponentId ?? pressOpponentId(game, type);
  const opp = game.teams.find((club) => club.id === oppId);
  const preseason =
    type === "pre-match" &&
    !!game.preseasonFixtures?.some(
      (fixture) =>
        fixture.date === game.calendar?.date &&
        [fixture.home, fixture.away].includes(game.user),
    );
  let result: PressCtx["result"];
  const last = game.last;
  if (
    type === "post-match" &&
    last &&
    [last.home, last.away].includes(game.user)
  ) {
    const side = last.home === game.user ? 0 : 1;
    result = {
      won: last.goals[side] > last.goals[1 - side],
      gf: last.goals[side],
      ga: last.goals[1 - side],
      ot: last.ot && !last.so,
      so: last.so,
      sf: last.shots[side] ?? 0,
      sa: last.shots[1 - side] ?? 0,
      ppg: last.pp?.[side] ?? 0,
      ppo: last.ppo?.[side] ?? 0,
      raw: last,
    };
  }
  const rivalryState = opp
    ? game.rivalries?.find(
        (item) =>
          [item.teamA, item.teamB].includes(team.id) &&
          [item.teamA, item.teamB].includes(opp.id),
      )
    : undefined;
  const seriesState =
    game.phase === "playoffs" && opp
      ? game.bracket[game.playoffRound]?.find(
          (item) =>
            [item.a, item.b].includes(team.id) &&
            [item.a, item.b].includes(opp.id),
        )
      : undefined;
  return {
    game,
    type,
    team,
    opp,
    oppName: opp ? fullName(opp) : "",
    preseason,
    result,
    streak: computeStreak(game, team.id),
    leagueRank: rankOf(game.teams, team.id),
    confRank: rankOf(
      game.teams.filter((club) => club.conference === team.conference),
      team.id,
    ),
    gp: team.record.gp,
    rivalry: rivalryState
      ? {
          wins: rivalryState.seasonWins[team.id] ?? 0,
          losses: rivalryState.seasonLosses[team.id] ?? 0,
        }
      : undefined,
    series: seriesState
      ? {
          us:
            seriesState.a === team.id
              ? seriesState.wins[0]
              : seriesState.wins[1],
          them:
            seriesState.a === team.id
              ? seriesState.wins[1]
              : seriesState.wins[0],
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Question generators
// ---------------------------------------------------------------------------

type AnswerDraft = Omit<PressAnswer, "id">;
type Draft = Omit<PressQuestion, "id" | "journalist" | "answers"> & {
  priority: number;
  answers: AnswerDraft[];
};

const a = (
  tone: PressTone,
  style: L,
  line: L,
  reaction: L,
  fan: number,
  board: number,
  morale: number,
  player?: { player: Player; delta: number },
): AnswerDraft => ({
  tone,
  style,
  line,
  reaction,
  fan,
  board,
  morale,
  ...(player
    ? {
        playerId: player.player.id,
        playerName: player.player.name,
        playerMorale: player.delta,
      }
    : {}),
});

const whenL = (ctx: PressCtx): L =>
  ctx.type === "pre-match"
    ? { ru: "Сегодня", en: "Tonight" }
    : { ru: "В следующем матче", en: "Next game" };

function opponentQuestion(ctx: PressCtx): Draft | undefined {
  if (!ctx.opp) return undefined;
  const opp = ctx.oppName;
  const diff = pointsPct(ctx.team) - pointsPct(ctx.opp);
  const text: L =
    diff > 0.06
      ? {
          ru: `Вы фавориты против ${opp}. Нет ли риска недооценить соперника?`,
          en: `You go in as favourites against the ${opp}. Any danger of taking them lightly?`,
        }
      : diff < -0.06
        ? {
            ru: `${opp} на бумаге сильнее. Что может дать вам шанс сегодня?`,
            en: `On paper the ${opp} are the stronger side. What gives you a chance tonight?`,
          }
        : {
            ru: `С ${opp} у вас примерно равные силы. Что решит этот матч?`,
            en: `You and the ${opp} look evenly matched. What decides tonight's game?`,
          };
  return {
    topic: "opponent",
    priority: 1,
    text,
    answers: [
      a(
        "protective",
        { ru: "Снять давление", en: "Take the pressure off" },
        {
          ru: "Мы не думаем о статусах. Ребята должны играть свободно и доверять своей подготовке.",
          en: "We're not thinking about labels. The guys need to play freely and trust their preparation.",
        },
        {
          ru: "Раздевалка оценила спокойствие, но руководство ждало более жёсткого сигнала.",
          en: "The room appreciated the calm, but the board wanted a firmer message.",
        },
        0,
        -1,
        2,
      ),
      a(
        "balanced",
        { ru: "Подчеркнуть план", en: "Stress the game plan" },
        {
          ru: `Мы детально разобрали ${opp}. Решат дисциплина, смены и качество спецбригад.`,
          en: `We've broken down the ${opp} in detail. Discipline, shift length and special teams will decide it.`,
        },
        {
          ru: "Руководство одобрило подготовку, игроки почувствовали дополнительную ответственность.",
          en: "The board approved of the preparation; the players feel the extra responsibility.",
        },
        1,
        1,
        0,
      ),
      a(
        "ambitious",
        { ru: "Потребовать победу", en: "Demand a win" },
        {
          ru: "Сегодня нам нужны два очка. У этой команды нет права прятаться от ожиданий.",
          en: "We need two points tonight. This team has no right to hide from expectations.",
        },
        {
          ru: "Фанаты воодушевлены, но часть раздевалки почувствовала давление.",
          en: "The fans are fired up, but part of the room feels the pressure.",
        },
        2,
        1,
        -1,
      ),
      a(
        "balanced",
        { ru: "Уважить соперника", en: "Respect the opponent" },
        {
          ru: `${opp} накажут нас за любую ошибку. Если потеряем структуру хотя бы на смену — пропустим.`,
          en: `The ${opp} will punish any mistake. Lose our structure for one shift and it's in our net.`,
        },
        {
          ru: "Ответ сочли взвешенным: главным посылом стала дисциплина.",
          en: "A measured answer that put discipline front and centre.",
        },
        -1,
        1,
        1,
      ),
    ],
  };
}

function rivalryQuestion(ctx: PressCtx): Draft | undefined {
  if (!ctx.rivalry || !ctx.opp) return undefined;
  const opp = ctx.oppName;
  const { wins, losses } = ctx.rivalry;
  if (ctx.type === "pre-match")
    return {
      topic: "rivalry",
      priority: 3,
      text: {
        ru: `Сегодня принципиальный матч с ${opp}, в сезоне ${wins}–${losses}. Как настроить команду на такую игру?`,
        en: `It's a rivalry night against the ${opp} — ${wins}-${losses} this season. How do you get the team ready for this one?`,
      },
      answers: [
        a(
          "ambitious",
          { ru: "Разогреть противостояние", en: "Stoke the rivalry" },
          {
            ru: "В таких матчах таблица отходит на второй план. Мы обязаны выиграть борьбу за каждый метр льда.",
            en: "In games like this the standings go out the window. We have to win every inch of ice.",
          },
          {
            ru: "Цитата разлетелась по медиа и разогрела трибуны.",
            en: "The quote spread across the media and fired up the stands.",
          },
          3,
          1,
          -1,
        ),
        a(
          "balanced",
          { ru: "Остудить эмоции", en: "Keep emotions in check" },
          {
            ru: "Эмоции — да, глупые удаления — нет. Побеждает тот, кто сохранит голову холодной.",
            en: "Emotion, yes; dumb penalties, no. The team that keeps a cool head wins.",
          },
          {
            ru: "Руководство оценило зрелость, фанаты хотели больше огня.",
            en: "The board liked the maturity; the fans wanted more fire.",
          },
          0,
          2,
          0,
        ),
        a(
          "protective",
          { ru: "Обычные два очка", en: "Just two points" },
          {
            ru: "Для нас это такие же два очка. Мы не будем играть в чужую игру.",
            en: "It's two points like any other. We won't play their game.",
          },
          {
            ru: "Игроки выдохнули, но часть болельщиков сочла ответ пресным.",
            en: "The players exhaled, but some fans found the answer bland.",
          },
          -1,
          0,
          2,
        ),
      ],
    };
  const won = !!ctx.result?.won;
  return {
    topic: "rivalry",
    priority: 3,
    text: won
      ? {
          ru: `Победа над ${opp}. Насколько она важна для болельщиков?`,
          en: `A win over the ${opp}. How much does that one mean to the fans?`,
        }
      : {
          ru: `Поражение от ${opp}. Болельщики недовольны — что вы им скажете?`,
          en: `A loss to the ${opp}. The fans aren't happy — what do you tell them?`,
        },
    answers: won
      ? [
          a(
            "protective",
            { ru: "Посвятить фанатам", en: "Dedicate it to the fans" },
            {
              ru: "Эта победа — для людей на трибунах. Они гнали нас вперёд весь вечер.",
              en: "This one is for the people in the stands. They pushed us all night.",
            },
            { ru: "Трибуны в восторге.", en: "The fan base loved it." },
            3,
            0,
            1,
          ),
          a(
            "balanced",
            { ru: "Сохранить хладнокровие", en: "Stay level-headed" },
            {
              ru: "Приятная победа, но это всё те же два очка. Завтра работаем дальше.",
              en: "A nice win, but it's still two points. Back to work tomorrow.",
            },
            {
              ru: "Руководство оценило выдержку.",
              en: "The board appreciated the composure.",
            },
            0,
            1,
            1,
          ),
          a(
            "ambitious",
            { ru: "Подколоть соперника", en: "Take a jab" },
            {
              ru: `Кажется, у ${opp} снова будет долгая дорога домой.`,
              en: `Looks like another long bus ride home for the ${opp}.`,
            },
            {
              ru: "Фанаты разошлись цитатой по соцсетям, руководство поморщилось.",
              en: "The fans shared it everywhere; the board winced.",
            },
            3,
            -1,
            0,
          ),
        ]
      : [
          a(
            "ambitious",
            { ru: "Извиниться перед фанатами", en: "Apologise to the fans" },
            {
              ru: "Болельщики заслужили лучшего. Мы перед ними в долгу.",
              en: "The fans deserved better. We owe them one.",
            },
            {
              ru: "Болельщики оценили честность, игроки почувствовали упрёк.",
              en: "The fans valued the honesty; the players felt the rebuke.",
            },
            2,
            0,
            -1,
          ),
          a(
            "protective",
            { ru: "Взять ответственность", en: "Take responsibility" },
            {
              ru: "Это на мне. Я не подготовил команду так, как нужно было.",
              en: "That's on me. I didn't have the team ready the way I should have.",
            },
            {
              ru: "Раздевалка оценила защиту менеджера.",
              en: "The room appreciated the manager taking the hit.",
            },
            0,
            -1,
            2,
          ),
          a(
            "ambitious",
            { ru: "Пообещать реванш", en: "Promise revenge" },
            {
              ru: "Мы запомним этот вечер. До следующей встречи.",
              en: "We'll remember tonight. See you next time.",
            },
            {
              ru: "Следующий матч с этим соперником стал ещё горячее.",
              en: "The next meeting with this rival just got hotter.",
            },
            3,
            0,
            -1,
          ),
        ],
  };
}

function streakQuestion(ctx: PressCtx): Draft | undefined {
  const { won, count } = ctx.streak;
  if (won ? count < 3 : count < 2) return undefined;
  const when = whenL(ctx);
  if (won)
    return {
      topic: "streak",
      priority: 3,
      text: {
        ru: `${count} ${ruPlural(count, "победа", "победы", "побед")} подряд. Не боитесь, что команда поверит в собственную непобедимость?`,
        en: `That's ${count} wins in a row. Worried the team starts believing its own hype?`,
      },
      answers: [
        a(
          "protective",
          { ru: "Отдать должное игрокам", en: "Credit the players" },
          {
            ru: "Это заслуга ребят. Пусть наслаждаются моментом — они его заработали.",
            en: "That's on the players. Let them enjoy it — they've earned it.",
          },
          {
            ru: "Раздевалка расправила плечи.",
            en: "The room stood a little taller.",
          },
          1,
          0,
          2,
        ),
        a(
          "balanced",
          { ru: "Матч за матчем", en: "One game at a time" },
          {
            ru: "Серии нас не интересуют. Каждый матч начинается с нуля на табло.",
            en: "We don't care about streaks. Every game starts at zero on the scoreboard.",
          },
          {
            ru: "Классика жанра, но руководству понравилось.",
            en: "A classic answer, but the board liked it.",
          },
          0,
          1,
          1,
        ),
        a(
          "ambitious",
          { ru: "Хотим большего", en: "We want more" },
          {
            ru: "Серия — это хорошо, но наши цели гораздо выше нескольких побед подряд.",
            en: "A streak is nice, but our goals are a lot bigger than a few wins in a row.",
          },
          {
            ru: "Ожидания фанатов и руководства выросли, давление на игроков тоже.",
            en: "Fan and board expectations went up — and so did the pressure on the players.",
          },
          2,
          2,
          -1,
        ),
      ],
    };
  return {
    topic: "streak",
    priority: 4,
    text: {
      ru: `${count} ${ruPlural(count, "поражение", "поражения", "поражений")} подряд. Ваше положение под угрозой?`,
      en: `${count} straight losses. Is your job under threat?`,
    },
    answers: [
      a(
        "protective",
        { ru: "Принять удар на себя", en: "Take the heat" },
        {
          ru: "Вся ответственность на мне. Игроков в обиду не дам.",
          en: "It's all on me. I won't let anyone throw the players under the bus.",
        },
        {
          ru: "Игроки оценили, руководство насторожилось.",
          en: "The players noticed; the board grew wary.",
        },
        0,
        -1,
        2,
      ),
      a(
        "balanced",
        { ru: "Без паники", en: "No panic" },
        {
          ru: "Мы видим причины и работаем над ними. Паника ещё никому не помогала.",
          en: "We know the reasons and we're working on them. Panic has never helped anyone.",
        },
        {
          ru: "Спокойный тон сбил градус обсуждения.",
          en: "The calm tone cooled the debate down.",
        },
        0,
        1,
        1,
      ),
      a(
        "ambitious",
        { ru: "Пообещать реакцию", en: "Promise a response" },
        {
          ru: `${when.ru} вы увидите другую команду. Это я гарантирую.`,
          en: `${when.en} you'll see a different team. I guarantee it.`,
        },
        {
          ru: "Громкое обещание: теперь его придётся подтвердить.",
          en: "A bold promise — now it has to be backed up.",
        },
        2,
        1,
        -1,
      ),
      a(
        "ambitious",
        { ru: "Пригрозить перестановками", en: "Threaten changes" },
        {
          ru: "Если отношение не изменится, изменится состав.",
          en: "If the attitude doesn't change, the lineup will.",
        },
        {
          ru: "Требовательные фанаты довольны, атмосфера в раздевалке ухудшилась.",
          en: "Demanding fans liked it; the room got tenser.",
        },
        1,
        1,
        -2,
      ),
    ],
  };
}

function injuryQuestion(ctx: PressCtx): Draft | undefined {
  if (ctx.type === "post-match" && ctx.result) {
    const event = ctx.result.raw.events.find(
      (item) =>
        item.type === "injury" && item.team === ctx.team.id && item.playerId,
    );
    const player =
      event && ctx.team.players.find((item) => item.id === event.playerId);
    if (player)
      return {
        topic: "injury",
        priority: 4,
        text: {
          ru: `${player.name} покинул лёд с травмой. Что известно о его состоянии?`,
          en: `${player.name} left the game hurt. Any update on his condition?`,
        },
        answers: [
          a(
            "balanced",
            { ru: "Без прогнозов", en: "No timeline yet" },
            {
              ru: "Его осматривают врачи. Никаких прогнозов до обследования.",
              en: "The doctors are looking at him. No timeline until he's been examined.",
            },
            {
              ru: "Профессиональный ответ без лишних эмоций.",
              en: "A professional answer without drama.",
            },
            0,
            1,
            0,
          ),
          a(
            "protective",
            { ru: "Поддержать игрока", en: "Support the player" },
            {
              ru: `Главное — здоровье ${player.name}. Хоккей подождёт.`,
              en: `${player.name}'s health is all that matters. Hockey can wait.`,
            },
            {
              ru: "Игрок и раздевалка оценили заботу.",
              en: "The player and the room appreciated the care.",
            },
            1,
            0,
            1,
            { player, delta: 4 },
          ),
          a(
            "ambitious",
            { ru: "Обвинить соперника", en: "Blame the opponent" },
            {
              ru: "Это был опасный приём, и лига обязана с ним разобраться.",
              en: "That was a dangerous play, and the league has to deal with it.",
            },
            {
              ru: "Фанаты на вашей стороне, лига и руководство — не в восторге.",
              en: "The fans are behind you; the league and the board less so.",
            },
            3,
            -1,
            1,
          ),
        ],
      };
  }
  const injured = [...ctx.team.players]
    .filter((player) => player.injury > 0)
    .sort((x, y) => y.ovr - x.ovr)[0];
  const top = [...ctx.team.players].sort((x, y) => y.ovr - x.ovr).slice(0, 9);
  if (!injured || !top.includes(injured)) return undefined;
  const name = injured.name;
  return {
    topic: "injury",
    priority: 3,
    text: {
      ru: `${name} по-прежнему в лазарете. Насколько команде его не хватает и когда он вернётся?`,
      en: `${name} is still on the injured list. How much do you miss him, and when is he back?`,
    },
    answers: [
      a(
        "protective",
        { ru: "Не торопить игрока", en: "No rush" },
        {
          ru: `${name} вернётся, когда будет полностью готов. Здоровье важнее двух очков.`,
          en: `${name} returns when he's fully ready. His health matters more than two points.`,
        },
        {
          ru: "Игрок почувствовал поддержку клуба.",
          en: "The player felt the club's support.",
        },
        0,
        0,
        1,
        { player: injured, delta: 4 },
      ),
      a(
        "balanced",
        { ru: "Шанс для других", en: "Next man up" },
        {
          ru: "Такие паузы — шанс для других. Я жду, что кто-то сделает шаг вперёд.",
          en: "Absences are a chance for others. I expect someone to step up.",
        },
        {
          ru: "Игроки глубины восприняли это как сигнал.",
          en: "The depth players took it as a signal.",
        },
        1,
        1,
        0,
      ),
      a(
        "ambitious",
        { ru: "Ждём скорее", en: "We need him back" },
        {
          ru: `Надеюсь увидеть ${name} в составе очень скоро — он нам нужен.`,
          en: `I hope to see ${name} back very soon — we need him.`,
        },
        {
          ru: "Игрок почувствовал давление ускорить возвращение.",
          en: "He felt pressure to rush his return.",
        },
        1,
        0,
        0,
        { player: injured, delta: -2 },
      ),
    ],
  };
}

function starQuestion(ctx: PressCtx): Draft | undefined {
  const skaters = ctx.team.players.filter(
    (player) => player.pos !== "G" && !player.injury,
  );
  if (!skaters.length) return undefined;
  const points = (player: Player) => player.stats.g + player.stats.a;
  const star = [...skaters].sort(
    (x, y) => points(y) - points(x) || y.ovr - x.ovr,
  )[0];
  const name = star.name;
  const form = star.performanceForm ?? 0;
  if (form <= -12)
    return {
      topic: "star-form",
      priority: 3,
      text: {
        ru: `${name} переживает спад. Вы по-прежнему доверяете ему ключевые смены?`,
        en: `${name} is in a slump. Do you still trust him with the big minutes?`,
      },
      answers: [
        a(
          "protective",
          { ru: "Публично поддержать", en: "Back him publicly" },
          {
            ru: `Абсолютно. ${name} — игрок высочайшего уровня, и этот спад закончится.`,
            en: `Absolutely. ${name} is an elite player, and this dip will end.`,
          },
          {
            ru: "Игрок получил заряд уверенности.",
            en: "A real confidence boost for the player.",
          },
          0,
          0,
          1,
          { player: star, delta: 5 },
        ),
        a(
          "ambitious",
          { ru: "Требовать большего", en: "Demand more" },
          {
            ru: `Я жду от ${name} большего. Он и сам это знает.`,
            en: `I expect more from ${name}. He knows that himself.`,
          },
          {
            ru: "Заголовки подхватили критику, игрок задет.",
            en: "The headlines ran with it; the player is stung.",
          },
          1,
          1,
          0,
          { player: star, delta: -4 },
        ),
        a(
          "balanced",
          { ru: "Уйти от ответа", en: "Deflect" },
          {
            ru: "Мы не выделяем отдельных игроков. Побеждаем и проигрываем вместе.",
            en: "We don't single players out. We win and lose together.",
          },
          {
            ru: "Журналисты остались без заголовка.",
            en: "The reporters were left without a headline.",
          },
          -1,
          0,
          1,
        ),
      ],
    };
  if (form >= 12)
    return {
      topic: "star-form",
      priority: 3,
      text: {
        ru: `${name} в лучшей форме сезона. Что делает его сейчас таким опасным?`,
        en: `${name} is in the form of his season. What makes him so dangerous right now?`,
      },
      answers: [
        a(
          "protective",
          { ru: "Восхититься", en: "Praise him" },
          {
            ru: `${name} — особенный. Он видит лёд на ход вперёд.`,
            en: `${name} is special. He sees the ice a play ahead of everyone.`,
          },
          {
            ru: "Игрок доволен, фанаты тоже.",
            en: "The player is pleased — so are the fans.",
          },
          1,
          0,
          0,
          { player: star, delta: 4 },
        ),
        a(
          "balanced",
          { ru: "Отметить партнёров", en: "Credit his linemates" },
          {
            ru: "Его партнёры делают огромную работу, которую не видно в протоколе.",
            en: "His linemates do a ton of work that never shows up on the scoresheet.",
          },
          {
            ru: "Раздевалка оценила, что заметили всех.",
            en: "The room liked that everyone got credit.",
          },
          0,
          1,
          2,
          { player: star, delta: -1 },
        ),
        a(
          "ambitious",
          { ru: "Ещё не предел", en: "There's more to come" },
          {
            ru: "Он может играть ещё лучше. И мы этого от него ждём.",
            en: "He can be even better. And that's what we expect.",
          },
          {
            ru: "Ожидания выросли ещё сильнее.",
            en: "Expectations just went up again.",
          },
          2,
          1,
          -1,
          { player: star, delta: 1 },
        ),
      ],
    };
  if (ctx.type === "post-match") return undefined;
  return {
    topic: "star-form",
    priority: 1,
    text: {
      ru: `От ${name} ждут лидерского сезона. Какую планку вы ему ставите?`,
      en: `Everyone expects a big season from ${name}. Where do you set the bar for him?`,
    },
    answers: [
      a(
        "protective",
        { ru: "Снять давление", en: "Ease the pressure" },
        {
          ru: "Пусть просто играет в свой хоккей. Цифры придут сами.",
          en: "Let him play his game. The numbers will come.",
        },
        {
          ru: "Игрок оценил доверие.",
          en: "The player appreciated the trust.",
        },
        0,
        -1,
        1,
        { player: star, delta: 3 },
      ),
      a(
        "ambitious",
        { ru: "Высокая планка", en: "Set the bar high" },
        {
          ru: `Я жду от ${name} сезона уровня лучших игроков лиги.`,
          en: `I expect ${name} to have a season that puts him among the league's best.`,
        },
        {
          ru: "Фанаты в предвкушении, на игрока легла дополнительная ноша.",
          en: "The fans are excited; the player carries extra weight.",
        },
        2,
        1,
        0,
        { player: star, delta: -1 },
      ),
      a(
        "balanced",
        { ru: "Командный ответ", en: "Team-first answer" },
        {
          ru: "Сезон делает команда, а не один игрок.",
          en: "A season is made by a team, not by one player.",
        },
        {
          ru: "Сдержанный ответ понравился руководству.",
          en: "The board liked the restraint.",
        },
        0,
        1,
        1,
      ),
    ],
  };
}

function goalieQuestion(ctx: PressCtx): Draft | undefined {
  const goalie = ctx.team.players.find(
    (player) => player.id === ctx.team.goalie,
  );
  if (!goalie) return undefined;
  const name = goalie.name;
  if (ctx.type === "post-match" && ctx.result) {
    const { sa, ga, won } = ctx.result;
    if (!sa) return undefined;
    const saves = Math.max(0, sa - ga);
    const pct = saves / sa;
    if (pct >= 0.935 && saves >= 22)
      return {
        topic: "goalie",
        priority: 3,
        text: {
          ru: `${name} отразил ${saves} из ${sa} бросков. Это его матч?`,
          en: `${name} stopped ${saves} of ${sa} shots. Was this his game?`,
        },
        answers: [
          a(
            "protective",
            { ru: "Он нас спас", en: "He saved us" },
            won
              ? {
                  ru: "Он выиграл нам этот матч. Точка.",
                  en: "He won us this game. Period.",
                }
              : {
                  ru: "Он держал нас в игре до конца. Его вины здесь нет.",
                  en: "He kept us in it until the end. None of this is on him.",
                },
            {
              ru: "Вратарь почувствовал признание.",
              en: "The goalie felt recognised.",
            },
            1,
            0,
            0,
            { player: goalie, delta: 5 },
          ),
          a(
            "balanced",
            { ru: "Слишком много бросков", en: "Too many shots against" },
            {
              ru: `Он был великолепен, но ${sa} бросков в створ — это слишком много.`,
              en: `He was outstanding, but ${sa} shots against is far too many.`,
            },
            {
              ru: "Защитники приняли упрёк на свой счёт.",
              en: "The defencemen took that personally.",
            },
            0,
            1,
            -1,
            { player: goalie, delta: 2 },
          ),
          a(
            "ambitious",
            { ru: "Это его работа", en: "That's his job" },
            {
              ru: "Это его работа, и он её сделал.",
              en: "That's his job, and he did it.",
            },
            {
              ru: "Сухо. Вратарь ждал большего признания.",
              en: "Dry. The goalie expected more credit.",
            },
            0,
            1,
            0,
            { player: goalie, delta: -1 },
          ),
        ],
      };
    if (ga >= 5 || pct < 0.86)
      return {
        topic: "goalie",
        priority: 3,
        text: {
          ru: `${name} пропустил ${ga}. Он выйдет в следующем матче?`,
          en: `${name} gave up ${ga}. Does he start next game?`,
        },
        answers: [
          a(
            "protective",
            { ru: "Поддержать вратаря", en: "Back the goalie" },
            {
              ru: "Он вернётся сильнее. Сегодня вина не на нём.",
              en: "He'll bounce back. Tonight wasn't on him.",
            },
            {
              ru: "Вратарь благодарен за поддержку.",
              en: "The goalie is grateful for the backing.",
            },
            0,
            -1,
            1,
            { player: goalie, delta: 4 },
          ),
          a(
            "balanced",
            { ru: "Решение позже", en: "Decide later" },
            {
              ru: "Решение примем после разбора видео.",
              en: "We'll make that call after we review the video.",
            },
            {
              ru: "Вратарь почувствовал, что место под вопросом.",
              en: "The goalie feels his spot is in question.",
            },
            0,
            1,
            0,
            { player: goalie, delta: -2 },
          ),
          a(
            "ambitious",
            { ru: "Публичная критика", en: "Call him out" },
            {
              ru: "Вратарь должен отражать такие броски. Это нужно признать.",
              en: "A goalie has to stop shots like those. We have to say it.",
            },
            {
              ru: "Вратарь задет, раздевалка напряглась.",
              en: "The goalie is hurt and the room is tense.",
            },
            1,
            1,
            -1,
            { player: goalie, delta: -6 },
          ),
        ],
      };
    return undefined;
  }
  const sa = goalie.stats.sa;
  if (goalie.stats.gp < 3 || !sa) return undefined;
  const pct = (sa - goalie.stats.ga) / sa;
  const pctText = pct.toFixed(3).replace(/^0/, "");
  if (pct < 0.895)
    return {
      topic: "goalie",
      priority: 2,
      text: {
        ru: `У ${name} всего ${(pct * 100).toFixed(1).replace(".", ",")}% отражённых бросков. Не пора ли менять вратаря?`,
        en: `${name} is sitting at ${pctText}. Is it time for a change in net?`,
      },
      answers: [
        a(
          "protective",
          { ru: "Полное доверие", en: "Full confidence" },
          {
            ru: `${name} — наш основной вратарь. Точка.`,
            en: `${name} is our starter. Period.`,
          },
          { ru: "Вратарь почувствовал опору.", en: "The goalie feels backed." },
          -1,
          -1,
          1,
          { player: goalie, delta: 5 },
        ),
        a(
          "ambitious",
          { ru: "Конкуренция открыта", en: "The crease is open" },
          {
            ru: "Место в воротах нужно заслуживать каждый матч.",
            en: "The net has to be earned every night.",
          },
          {
            ru: "Конкуренция вратарей обострилась.",
            en: "The goalie battle just heated up.",
          },
          1,
          1,
          0,
          { player: goalie, delta: -4 },
        ),
        a(
          "balanced",
          { ru: "Вопрос к защите", en: "Blame the structure" },
          {
            ru: "Вратаря подставляют. Нам нужно лучше защищаться перед ним.",
            en: "He's being hung out to dry. We have to defend better in front of him.",
          },
          {
            ru: "Защитники приняли сигнал.",
            en: "The defencemen got the message.",
          },
          0,
          1,
          -1,
          { player: goalie, delta: 2 },
        ),
      ],
    };
  if (pct > 0.918)
    return {
      topic: "goalie",
      priority: 2,
      text: {
        ru: `${name} тащит команду: ${(pct * 100).toFixed(1).replace(".", ",")}% отражённых бросков. Он лучший вратарь лиги прямо сейчас?`,
        en: `${name} is carrying you with a ${pctText} save percentage. Is he the best goalie in the league right now?`,
      },
      answers: [
        a(
          "ambitious",
          { ru: "Да, без сомнений", en: "No doubt" },
          {
            ru: "Для меня — да. Он выигрывает нам матчи.",
            en: "For me, yes. He's winning us games.",
          },
          {
            ru: "Вратарь доволен, фанаты подхватили.",
            en: "The goalie is pleased; the fans ran with it.",
          },
          1,
          0,
          0,
          { player: goalie, delta: 4 },
        ),
        a(
          "protective",
          { ru: "Командная заслуга", en: "Team effort" },
          {
            ru: "Он великолепен, но и защита перед ним делает свою работу.",
            en: "He's been great, but the defence in front of him deserves credit too.",
          },
          { ru: "Раздевалка оценила.", en: "The room appreciated it." },
          0,
          1,
          2,
        ),
        a(
          "balanced",
          { ru: "Не перехвалить", en: "Don't overhype" },
          {
            ru: "Пусть продолжает. Сезон длинный.",
            en: "Let him keep it going. It's a long season.",
          },
          { ru: "Спокойно и по делу.", en: "Calm and to the point." },
          0,
          1,
          0,
        ),
      ],
    };
  return undefined;
}

function standingsQuestion(ctx: PressCtx): Draft | undefined {
  if (ctx.gp < 8 || ctx.game.phase !== "regular") return undefined;
  if (ctx.leagueRank <= 4)
    return {
      topic: "standings",
      priority: 2,
      text: {
        ru: `Вы на ${ctx.leagueRank}-м месте в лиге. Это команда-претендент на Кубок?`,
        en: `You're ${ctx.leagueRank}${["st", "nd", "rd"][ctx.leagueRank - 1] ?? "th"} in the league. Is this a Cup contender?`,
      },
      answers: [
        a(
          "ambitious",
          { ru: "Да, мы претенденты", en: "Yes, we're contenders" },
          {
            ru: "Мы строили эту команду, чтобы побеждать сейчас. Да, мы претенденты.",
            en: "We built this team to win now. Yes, we're contenders.",
          },
          {
            ru: "Фанаты и руководство в восторге, давление выросло.",
            en: "Fans and board loved it; the pressure rose.",
          },
          3,
          2,
          -1,
        ),
        a(
          "balanced",
          { ru: "Рано говорить", en: "Too early to say" },
          {
            ru: "Апрель далеко. Пока мы просто делаем свою работу.",
            en: "April is a long way off. For now we're just doing our job.",
          },
          {
            ru: "Спокойный ответ без лишних обещаний.",
            en: "A calm answer with no extra promises.",
          },
          0,
          1,
          1,
        ),
        a(
          "protective",
          { ru: "Остаться скромными", en: "Stay humble" },
          {
            ru: "Таблица сейчас мало что значит. Нам ещё есть что улучшать.",
            en: "The table doesn't mean much yet. We've got plenty to improve.",
          },
          {
            ru: "Игроки оценили, фанаты ждали большего.",
            en: "The players liked it; the fans wanted more.",
          },
          -1,
          0,
          1,
        ),
      ],
    };
  if (ctx.confRank > 8)
    return {
      topic: "standings",
      priority: 3,
      text: {
        ru: `Команда на ${ctx.confRank}-м месте в конференции — за чертой плей-офф. Это провал?`,
        en: `You're ${ctx.confRank}th in the conference, below the playoff line. Is this season a failure?`,
      },
      answers: [
        a(
          "protective",
          { ru: "Сезон не потерян", en: "The season isn't lost" },
          {
            ru: "Впереди много матчей. Мы в борьбе.",
            en: "There's a lot of hockey left. We're in the fight.",
          },
          {
            ru: "Игроки услышали веру штаба.",
            en: "The players heard the staff's belief.",
          },
          1,
          0,
          1,
        ),
        a(
          "balanced",
          { ru: "Признать проблемы", en: "Own the problems" },
          {
            ru: "Мы ниже ожиданий, и я это признаю. Исправлять будем вместе.",
            en: "We're below expectations, and I own that. We'll fix it together.",
          },
          {
            ru: "Честность оценили и фанаты, и руководство.",
            en: "Fans and board both valued the honesty.",
          },
          1,
          1,
          0,
        ),
        a(
          "ambitious",
          { ru: "Гарантировать плей-офф", en: "Guarantee the playoffs" },
          {
            ru: "Мы будем в плей-офф. Запишите это.",
            en: "We will make the playoffs. Write it down.",
          },
          {
            ru: "Громкий заголовок. Теперь его нужно оправдать.",
            en: "A big headline. Now it has to come true.",
          },
          3,
          1,
          -2,
        ),
      ],
    };
  return undefined;
}

function seriesQuestion(ctx: PressCtx): Draft | undefined {
  if (!ctx.series) return undefined;
  const { us, them } = ctx.series;
  return {
    topic: "series",
    priority: 4,
    text: {
      ru: `Счёт в серии ${us}–${them}. Что изменится в следующем матче?`,
      en: `The series stands at ${us}-${them}. What changes next game?`,
    },
    answers: [
      a(
        "protective",
        { ru: "Сохранить курс", en: "Stay the course" },
        {
          ru: "Ничего радикального. Мы верим в то, что делаем.",
          en: "Nothing drastic. We believe in what we're doing.",
        },
        { ru: "Раздевалка спокойна.", en: "The room stays calm." },
        0,
        0,
        2,
      ),
      a(
        "balanced",
        { ru: "Тактические детали", en: "Tactical tweaks" },
        {
          ru: "Мы нашли пару деталей, которые застанут соперника врасплох.",
          en: "We've found a couple of details that will catch them off guard.",
        },
        { ru: "Руководство заинтриговано.", en: "The board is intrigued." },
        1,
        2,
        0,
      ),
      a(
        "ambitious",
        { ru: "Предсказать победу", en: "Predict a series win" },
        { ru: "Мы выиграем эту серию.", en: "We're winning this series." },
        {
          ru: "Заголовок на первых полосах, давление на максимуме.",
          en: "Front-page headline, maximum pressure.",
        },
        3,
        1,
        -1,
      ),
    ],
  };
}

function preseasonQuestion(ctx: PressCtx): Draft | undefined {
  if (!ctx.preseason) return undefined;
  return {
    topic: "preseason",
    priority: 3,
    text: {
      ru: "Это предсезонный матч. На что вы будете смотреть сегодня?",
      en: "It's a preseason game. What are you looking for tonight?",
    },
    answers: [
      a(
        "protective",
        { ru: "Шанс для молодых", en: "A chance for the kids" },
        {
          ru: "Хочу увидеть молодых в деле. Кто-то сегодня может заработать место.",
          en: "I want to see the young guys in action. Someone can earn a spot tonight.",
        },
        { ru: "Молодёжь заряжена.", en: "The youngsters are fired up." },
        1,
        0,
        1,
      ),
      a(
        "balanced",
        { ru: "Отработка систем", en: "Systems work" },
        {
          ru: "Результат вторичен. Мы проверяем системы и спецбригады.",
          en: "The result is secondary. We're testing our systems and special teams.",
        },
        {
          ru: "Руководство довольно подходом.",
          en: "The board likes the approach.",
        },
        0,
        1,
        0,
      ),
      a(
        "ambitious",
        { ru: "Задать тон сезону", en: "Set the tone" },
        {
          ru: "Предсезонка или нет — мы выходим побеждать.",
          en: "Preseason or not, we play to win.",
        },
        { ru: "Фанаты оценили настрой.", en: "The fans liked the attitude." },
        2,
        0,
        -1,
      ),
    ],
  };
}

function messageQuestion(): Draft {
  return {
    topic: "message",
    priority: 0,
    text: {
      ru: "Какой сигнал вы хотите отправить игрокам и болельщикам перед сегодняшним матчем?",
      en: "What message do you want to send the players and fans before tonight's game?",
    },
    answers: [
      a(
        "protective",
        { ru: "Похвалить лидеров", en: "Back the leaders" },
        {
          ru: "Наши ключевые игроки готовы вести команду. Я полностью доверяю им в решающие минуты.",
          en: "Our key players are ready to lead. I trust them completely when it matters.",
        },
        {
          ru: "Первое звено получило заряд уверенности, игроки глубины ждут своего шанса.",
          en: "The top line got a confidence boost; the depth players are waiting for their chance.",
        },
        1,
        -1,
        2,
      ),
      a(
        "balanced",
        { ru: "Говорить о деталях", en: "Focus on details" },
        {
          ru: "Мы выигрываем, когда хорошо делаем простые вещи.",
          en: "We win when we do the simple things well.",
        },
        {
          ru: "Деловой тон понравился руководству.",
          en: "The board liked the businesslike tone.",
        },
        0,
        1,
        1,
      ),
      a(
        "ambitious",
        { ru: "Поднять ставки", en: "Raise the stakes" },
        {
          ru: "От этой команды ждут победы. Мы выходим за результатом и не ищем оправданий.",
          en: "This team is expected to win. We're going out for the result — no excuses.",
        },
        {
          ru: "Фанаты воодушевлены, игроки почувствовали давление.",
          en: "The fans are pumped; the players feel the pressure.",
        },
        2,
        1,
        -1,
      ),
    ],
  };
}

function resultQuestion(ctx: PressCtx): Draft | undefined {
  const r = ctx.result;
  if (!r) return undefined;
  const score = `${r.gf}:${r.ga}`;
  const scoreEn = `${r.gf}-${r.ga}`;
  const extra: L = r.so
    ? { ru: " по буллитам", en: " in a shootout" }
    : r.ot
      ? { ru: " в овертайме", en: " in overtime" }
      : { ru: "", en: "" };
  const margin = Math.abs(r.gf - r.ga);
  const opp = ctx.oppName;
  const text: L = r.won
    ? margin >= 3
      ? {
          ru: `Уверенная победа ${score}. Это лучший матч команды в сезоне?`,
          en: `A convincing ${scoreEn} win. Best game of the season?`,
        }
      : {
          ru: `Победа ${score}${extra.ru}. Это характер или вам повезло?`,
          en: `A ${scoreEn} win${extra.en}. Was that character or luck?`,
        }
    : margin >= 3
      ? {
          ru: `Разгромное поражение ${score}. Как вы объясните это болельщикам?`,
          en: `A ${scoreEn} beating. How do you explain that to the fans?`,
        }
      : {
          ru: `Поражение ${score}${extra.ru}. Чего не хватило?`,
          en: `A ${scoreEn} loss${extra.en}. What was missing?`,
        };
  const answers: AnswerDraft[] = r.won
    ? [
        a(
          "protective",
          { ru: "Похвалить характер", en: "Praise the character" },
          {
            ru: "Команда не развалилась в сложный момент и продолжала играть друг за друга.",
            en: "The team never cracked when it got hard and kept playing for each other.",
          },
          {
            ru: "Командная мораль заметно выросла.",
            en: "Team morale took a clear step up.",
          },
          1,
          0,
          2,
        ),
        a(
          "balanced",
          { ru: "Разобрать детали", en: "Break down the details" },
          {
            ru: "Хорошая победа, но в сменах и первом пасе нам ещё есть что улучшать.",
            en: "A good win, but there's still work to do on our changes and the first pass.",
          },
          {
            ru: "Руководство оценило анализ, игроки ждали больше похвалы.",
            en: "The board liked the analysis; the players hoped for more praise.",
          },
          0,
          2,
          -1,
        ),
        a(
          "ambitious",
          { ru: "Потребовать большего", en: "Demand more" },
          {
            ru: "Стандарт клуба выше. Независимо от счёта мы должны быть требовательнее к себе.",
            en: "This club's standard is higher. Whatever the score, we have to demand more of ourselves.",
          },
          {
            ru: "Руководству понравилась амбиция, но уставшие игроки восприняли её тяжело.",
            en: "The board liked the ambition, but tired players took it hard.",
          },
          2,
          2,
          -1,
        ),
      ]
    : [
        a(
          "protective",
          { ru: "Взять ответственность", en: "Take responsibility" },
          {
            ru: "Все ключевые решения были моими. Игроков критиковать не собираюсь.",
            en: "All the key decisions were mine. I'm not going to criticise the players.",
          },
          {
            ru: "Раздевалка оценила защиту менеджера.",
            en: "The room appreciated the manager's protection.",
          },
          0,
          -1,
          2,
        ),
        a(
          "balanced",
          { ru: "Разобрать детали", en: "Break down the details" },
          {
            ru: "Нам нужно улучшить смены, контроль центра и качество первого паса. Сделаем выводы завтра.",
            en: "We need to clean up our changes, control the middle and the first pass. We'll draw conclusions tomorrow.",
          },
          {
            ru: "Руководство оценило анализ, но публичная критика деталей задела игроков.",
            en: "The board liked the analysis, but the public critique stung the players.",
          },
          1,
          1,
          -1,
        ),
        a(
          "ambitious",
          { ru: "Ответить жёстко", en: "Hit back hard" },
          {
            ru: "Некоторые хоккеисты не выполнили свою работу. Места в составе никому не гарантированы.",
            en: "Some players didn't do their job. Nobody's spot in the lineup is guaranteed.",
          },
          {
            ru: "Заявление понравилось требовательным фанатам, но ухудшило атмосферу.",
            en: "Demanding fans loved it, but the atmosphere took a hit.",
          },
          2,
          1,
          -2,
        ),
        a(
          "balanced",
          { ru: "Отдать должное сопернику", en: "Credit the opponent" },
          {
            ru: `${opp} сегодня были лучше. Это нужно признать.`,
            en: `The ${opp} were better tonight. We have to admit that.`,
          },
          {
            ru: "Спортивно, но часть фанатов ждала злости.",
            en: "Sporting, but some fans wanted anger.",
          },
          -1,
          1,
          1,
        ),
      ];
  if (r.won && r.ppg > 0)
    answers.push(
      a(
        "balanced",
        { ru: "Отметить спецбригады", en: "Credit special teams" },
        {
          ru: `Сегодня всё решили неравные составы — ${r.ppg} ${ruPlural(r.ppg, "гол", "гола", "голов")} в большинстве.`,
          en: `Special teams made the difference tonight — ${r.ppg} power-play ${enPlural(r.ppg, "goal", "goals")}.`,
        },
        {
          ru: "Штаб получил признание, игроки вне спецбригад почувствовали себя недооценёнными.",
          en: "The staff got the credit; players outside the special teams felt overlooked.",
        },
        1,
        1,
        -1,
      ),
    );
  return { topic: "result", priority: 10, text, answers };
}

function heroQuestion(ctx: PressCtx): Draft | undefined {
  const r = ctx.result;
  if (!r) return undefined;
  const ratings = r.raw.ratings ?? {};
  const ours = ctx.team.players.filter(
    (player) => ratings[player.id] !== undefined,
  );
  const starId = r.raw.stars?.find((id) =>
    ctx.team.players.some((p) => p.id === id),
  );
  const hero =
    ctx.team.players.find((player) => player.id === starId) ??
    [...ours].sort((x, y) => ratings[y.id] - ratings[x.id])[0];
  if (!hero || (ratings[hero.id] ?? 7) < 7) return undefined;
  const goals = r.raw.events.filter(
    (event) => event.type === "goal" && event.playerId === hero.id,
  ).length;
  const name = hero.name;
  return {
    topic: "hero",
    priority: 2,
    text:
      goals > 0
        ? {
            ru: `${name} забил ${goals} ${ruPlural(goals, "гол", "гола", "голов")} и стал лучшим у вас сегодня. Он выходит на новый уровень?`,
            en: `${name} scored ${goals === 1 ? "a goal" : `${goals} goals`} and was your best player tonight. Is he reaching a new level?`,
          }
        : {
            ru: `${name} стал лучшим в вашей команде сегодня. Он выходит на новый уровень?`,
            en: `${name} was your best player tonight. Is he taking his game to a new level?`,
          },
    answers: [
      a(
        "ambitious",
        { ru: "Расхвалить", en: "Sing his praises" },
        {
          ru: "Он был фантастическим. Такие игроки выигрывают матчи.",
          en: "He was fantastic. Players like that win you games.",
        },
        { ru: "Игрок окрылён.", en: "The player is walking on air." },
        1,
        0,
        0,
        { player: hero, delta: 5 },
      ),
      a(
        "balanced",
        { ru: "Сдержанная похвала", en: "Measured praise" },
        {
          ru: "Хороший матч. Теперь важно делать это стабильно.",
          en: "A good game. Now he has to do it consistently.",
        },
        {
          ru: "Похвала с задачей на будущее.",
          en: "Praise with a task attached.",
        },
        0,
        1,
        0,
        { player: hero, delta: 2 },
      ),
      a(
        "protective",
        { ru: "Командная работа", en: "It's a team effort" },
        {
          ru: "Он молодец, но сегодня отработали все четыре звена.",
          en: "He was good, but all four lines did their job tonight.",
        },
        {
          ru: "Раздевалка оценила, игрок ждал большего.",
          en: "The room liked it; the player hoped for more.",
        },
        0,
        0,
        2,
        { player: hero, delta: -1 },
      ),
    ],
  };
}

function strugglerQuestion(ctx: PressCtx): Draft | undefined {
  const r = ctx.result;
  if (!r?.raw.ratings) return undefined;
  const ratings = r.raw.ratings;
  const core = [...ctx.team.players]
    .filter((player) => player.pos !== "G" && ratings[player.id] !== undefined)
    .sort((x, y) => y.ovr - x.ovr)
    .slice(0, 8);
  const struggler = [...core].sort((x, y) => ratings[x.id] - ratings[y.id])[0];
  if (!struggler || ratings[struggler.id] > 5.6) return undefined;
  const name = struggler.name;
  return {
    topic: "struggler",
    priority: 2,
    text: {
      ru: `${name} провёл тяжёлый вечер. Что вы ему скажете?`,
      en: `${name} had a rough night. What will you tell him?`,
    },
    answers: [
      a(
        "protective",
        { ru: "Поддержать", en: "Back him" },
        {
          ru: "Один плохой вечер ничего не меняет. Он важен для нас.",
          en: "One bad night changes nothing. He's important to us.",
        },
        {
          ru: "Игрок благодарен за поддержку.",
          en: "The player is grateful for the support.",
        },
        0,
        -1,
        1,
        { player: struggler, delta: 4 },
      ),
      a(
        "balanced",
        { ru: "Обсудим внутри", en: "Keep it in-house" },
        {
          ru: "Это мы обсудим внутри команды.",
          en: "That stays inside the room.",
        },
        { ru: "Корректно и без заголовков.", en: "Correct, and no headlines." },
        0,
        1,
        0,
        { player: struggler, delta: 1 },
      ),
      a(
        "ambitious",
        { ru: "Публичная критика", en: "Call him out" },
        {
          ru: "Он знает, что сегодня был ниже своего уровня. Мне нужно больше.",
          en: "He knows he was below his level tonight. I need more.",
        },
        {
          ru: "Игрок задет, требовательные фанаты довольны.",
          en: "The player is stung; demanding fans approve.",
        },
        1,
        1,
        -1,
        { player: struggler, delta: -5 },
      ),
    ],
  };
}

function specialTeamsQuestion(ctx: PressCtx): Draft | undefined {
  const r = ctx.result;
  if (!r || r.ppo < 2) return undefined;
  return {
    topic: "special-teams",
    priority: r.ppg === 0 ? 2 : 1,
    text: {
      ru: `Большинство: ${r.ppg} из ${r.ppo}. Спецбригады повлияли на исход?`,
      en: `Your power play went ${r.ppg}-for-${r.ppo}. Did special teams decide this one?`,
    },
    answers: [
      a(
        "protective",
        { ru: "Похвалить штаб", en: "Credit the staff" },
        {
          ru: "Тренеры спецбригад делают огромную работу. Результат придёт.",
          en: "The special-teams coaches do a ton of work. The results will come.",
        },
        {
          ru: "Штаб оценил поддержку.",
          en: "The staff appreciated the backing.",
        },
        0,
        0,
        1,
      ),
      a(
        "ambitious",
        { ru: "Требовать реализации", en: "Demand finishing" },
        {
          ru: "В большинстве нужно забивать. Это не обсуждается.",
          en: "You have to score on the power play. End of discussion.",
        },
        {
          ru: "Первая бригада почувствовала давление.",
          en: "The top unit felt the pressure.",
        },
        1,
        1,
        -1,
      ),
      a(
        "balanced",
        { ru: "Не главный фактор", en: "Not the key factor" },
        {
          ru: "Спецбригады — лишь часть игры. Пять на пять важнее.",
          en: "Special teams are only part of it. Five-on-five matters more.",
        },
        { ru: "Нейтральный ответ.", en: "A neutral answer." },
        0,
        1,
        0,
      ),
    ],
  };
}

const PRE_GENERATORS = [
  opponentQuestion,
  rivalryQuestion,
  seriesQuestion,
  streakQuestion,
  injuryQuestion,
  starQuestion,
  goalieQuestion,
  standingsQuestion,
  preseasonQuestion,
];
const POST_GENERATORS = [
  resultQuestion,
  rivalryQuestion,
  seriesQuestion,
  goalieQuestion,
  heroQuestion,
  strugglerQuestion,
  injuryQuestion,
  streakQuestion,
  specialTeamsQuestion,
  starQuestion,
  standingsQuestion,
];

/**
 * Builds the questions for one media availability. Deterministic for the
 * same game state, date and type; effects are not part of the inputs, so
 * answering a question never reshuffles the rest of the conference.
 */
export function buildPressConference(
  game: Game,
  type: PressType,
  date = game.calendar?.date ?? "",
  opponentId?: string,
): PressConference {
  const ctx = buildContext(game, type, opponentId);
  const seed = `${game.seed}:${game.user}:${date}:${type}`;
  const generators = type === "pre-match" ? PRE_GENERATORS : POST_GENERATORS;
  const drafts = generators
    .map((generator) => generator(ctx))
    .filter((draft): draft is Draft => !!draft);
  const seen = new Set<string>();
  const unique = drafts.filter(
    (draft) => !seen.has(draft.topic) && seen.add(draft.topic),
  );
  if (type === "pre-match" && unique.length < 3) unique.push(messageQuestion());
  const count = type === "pre-match" ? 3 : 4;
  const chosen = unique
    .map((draft) => ({
      draft,
      weight: draft.priority * 10 + (hashText(`${seed}:${draft.topic}`) % 9),
    }))
    .sort((x, y) => y.weight - x.weight)
    .slice(0, count)
    .map((entry) => entry.draft);
  // Lead with the result / opponent question when present.
  const lead = type === "pre-match" ? "opponent" : "result";
  chosen.sort((x, y) => Number(y.topic === lead) - Number(x.topic === lead));
  const reporters = pickManyBy(JOURNALISTS, seed, chosen.length);
  return {
    date,
    type,
    opponentId: ctx.opp?.id,
    questions: chosen.map((draft, index) => ({
      id: `${type}:${draft.topic}`,
      topic: draft.topic,
      journalist: reporters[index],
      text: draft.text,
      answers: draft.answers.map((answer, answerIndex) => ({
        ...answer,
        id: `${draft.topic}:${answerIndex}`,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Answering and history
// ---------------------------------------------------------------------------

export function pressAppearances(game: Game, date: string, type: PressType) {
  return (game.pressHistory ?? []).filter(
    (item) => item.date === date && item.type === type,
  );
}

/** True when the conference is over (all questions answered, or a legacy entry). */
export function pressConferenceComplete(
  game: Game,
  conference: PressConference,
) {
  const entries = pressAppearances(game, conference.date, conference.type);
  if (entries.some((entry) => !entry.questionId)) return true;
  return conference.questions.every((question) =>
    entries.some((entry) => entry.questionId === question.id),
  );
}

/** Applies one answer once: fans, board confidence, dressing room and player. */
export function answerPressQuestion(
  game: Game,
  conference: PressConference,
  questionId: string,
  answerId: string,
): PressAppearance | undefined {
  const question = conference.questions.find((item) => item.id === questionId);
  const answer = question?.answers.find((item) => item.id === answerId);
  if (!question || !answer) throw Error("Unknown press question");
  game.pressHistory ??= [];
  if (
    game.pressHistory.some(
      (entry) =>
        entry.date === conference.date &&
        entry.type === conference.type &&
        (entry.questionId === questionId || !entry.questionId),
    )
  )
    return undefined;
  const lang = dialogueLang(game.language);
  const appearance: PressAppearance = {
    date: conference.date,
    type: conference.type,
    tone: answer.tone,
    headline: answer.line[lang],
    fanDelta: answer.fan,
    boardDelta: answer.board,
    moraleDelta: answer.morale,
    questionId,
    journalist: question.journalist.name,
    outlet: question.journalist.outlet,
    question: question.text,
    style: answer.style,
    headlineI18n: answer.line,
    reaction: answer.reaction,
    ...(answer.playerId
      ? {
          playerId: answer.playerId,
          playerMoraleDelta: answer.playerMorale ?? 0,
        }
      : {}),
  };
  game.pressHistory.unshift(appearance);
  game.pressHistory = game.pressHistory.slice(0, 160);
  const fans = game.fans?.[game.user];
  if (fans) {
    fans.happiness = clamp(fans.happiness + answer.fan, 0, 100);
    fans.engagement = clamp(fans.engagement + Math.sign(answer.fan), 0, 100);
    fans.lastChange =
      conference.type === "pre-match"
        ? "Предматчевая пресса"
        : "Послематчевая пресса";
  }
  if (game.managerEmployment)
    game.managerEmployment.confidence = clamp(
      game.managerEmployment.confidence + answer.board,
      0,
      100,
    );
  const team = game.teams.find((club) => club.id === game.user)!;
  for (const player of team.players) {
    let delta = answer.morale;
    if (player.id === answer.playerId) delta += answer.playerMorale ?? 0;
    if (!delta) continue;
    player.morale = clamp(player.morale + delta, 0, 100);
    syncMoraleBonus(player);
  }
  return appearance;
}

/** Text of a stored appearance in the requested language (old saves: Russian). */
export function pressAppearanceText(entry: PressAppearance, language: string) {
  const lang = dialogueLang(language);
  return {
    headline: entry.headlineI18n
      ? say(entry.headlineI18n, lang)
      : entry.headline,
    question: entry.question ? say(entry.question, lang) : "",
    journalist: entry.journalist ? say(entry.journalist, lang) : "",
    outlet: entry.outlet ? say(entry.outlet, lang) : "",
    style: entry.style
      ? say(entry.style, lang)
      : say(PRESS_TONE_LABELS[entry.tone], lang),
    reaction: entry.reaction ? say(entry.reaction, lang) : "",
  };
}

/** Sum of the consequences for one conference (for the closing summary). */
export function pressConferenceTotals(game: Game, conference: PressConference) {
  const entries = pressAppearances(game, conference.date, conference.type);
  const players = new Map<string, number>();
  for (const entry of entries)
    if (entry.playerId)
      players.set(
        entry.playerId,
        (players.get(entry.playerId) ?? 0) + (entry.playerMoraleDelta ?? 0),
      );
  return {
    fan: entries.reduce((sum, entry) => sum + entry.fanDelta, 0),
    board: entries.reduce((sum, entry) => sum + entry.boardDelta, 0),
    morale: entries.reduce((sum, entry) => sum + entry.moraleDelta, 0),
    players: [...players.entries()].map(([id, delta]) => ({
      id,
      name:
        game.teams
          .flatMap((team) => team.players)
          .find((player) => player.id === id)?.name ?? id,
      delta,
    })),
  };
}

export { pickBy as pickPressVariant };
