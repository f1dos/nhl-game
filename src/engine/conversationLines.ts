/**
 * Bilingual line bank for one-to-one player meetings. Lines are either plain
 * {ru, en} pairs or small templates that weave in the player's real situation
 * (ice time, line, points, contract, injury timeline).
 */
import type { L } from "./dialogueText";
import type { ConversationTone, ConversationTopic } from "./conversations";

export type ConversationMood = "positive" | "neutral" | "negative";
export type FollowUpKind =
  | "listen"
  | "reassure"
  | "target"
  | "promise"
  | "raise-bar"
  | "hold-line"
  | "compromise"
  | "ultimatum"
  | "wrap-up";
export type Persona =
  "goalie" | "expiring" | "star" | "veteran" | "young" | "depth";

export interface ConversationCtx {
  name: string;
  first: string;
  goalie: boolean;
  defense: boolean;
  age: number;
  veteran: boolean;
  young: boolean;
  star: boolean;
  depth: boolean;
  injured: boolean;
  expiring: boolean;
  /** "17:24 a night on the second line" / "11 games in net". */
  usage: L;
  /** Nominative: "the second line" / "второе звено". */
  slot: L;
  /** Locative: "on the second line" / "во втором звене". */
  slotIn: L;
  /** "12 points in 20 games" / ".912 save percentage". */
  stat: L;
  /** "one year left on the deal" / "последний год контракта". */
  contract: L;
  /** "about 4 more games" / "ещё примерно 4 игры". */
  injuryLine: L;
  salary: string;
  /** No games played this season or last — stat lines would read oddly. */
  noGames: boolean;
}

export type Line = L | ((c: ConversationCtx) => L);
export const render = (line: Line, c: ConversationCtx): L =>
  typeof line === "function" ? line(c) : line;

const lc = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const uc = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// ---------------------------------------------------------------------------
// Manager opening lines: topic × tone, two variants each. Variant 0 keeps the
// original wording so existing saves and tests stay recognisable.
// ---------------------------------------------------------------------------
export const MANAGER_OPENINGS: Record<
  ConversationTopic,
  Record<ConversationTone, Line[]>
> = {
  form: {
    supportive: [
      {
        ru: "Я вижу, что сейчас шайба не идёт в ворота. Мы не потеряли в тебя веру и хотим помочь вернуть уверенность.",
        en: "I can see the puck isn't going in for you right now. We haven't lost faith in you, and we want to help you get your confidence back.",
      },
      (c) =>
        c.noGames
          ? {
              ru: "Сезон только начинается, но я уже вижу, что ты зажат. Я не пришёл ругать — хочу понять, чем мы можем помочь.",
              en: "The season is barely underway, but I can see you're tight. I'm not here to scold you — I want to understand how we can help.",
            }
          : {
              ru: `Давай посмотрим на цифры вместе: ${c.stat.ru}. Я не пришёл ругать — хочу понять, чем мы можем помочь.`,
              en: `Let's look at the numbers together: ${c.stat.en}. I'm not here to scold you — I want to understand how we can help.`,
            },
    ],
    calm: [
      {
        ru: "Давай спокойно разберём последние матчи и поймём, где можно упростить твою игру.",
        en: "Let's calmly go through the last few games and work out where we can simplify your game.",
      },
      (c) => ({
        ru: `Я пересмотрел твои смены — ${c.usage.ru}. Давай вместе найдём, где ты ${c.goalie ? "теряешь позицию" : "теряешь шайбу"}.`,
        en: `I went through your shifts — ${c.usage.en}. Let's find together where you're ${c.goalie ? "losing your angles" : "losing the puck"}.`,
      }),
    ],
    direct: [
      {
        ru: "Твоя текущая форма ниже уровня, которого мы от тебя ожидаем. Нам нужна реакция.",
        en: "Your current form is below the level we expect from you. We need a response.",
      },
      (c) =>
        c.noGames
          ? {
              ru: "Скажу прямо: на сборах ты выглядел ниже своего уровня.",
              en: "I'll be blunt: in camp you've looked below your level.",
            }
          : {
              ru: `Скажу прямо: ${c.stat.ru} — это мало для игрока твоего уровня.`,
              en: `I'll be blunt: ${c.stat.en} isn't enough for a player of your quality.`,
            },
    ],
    demanding: [
      {
        ru: "Команде нужен результат уже сейчас. В следующих матчах ты должен заметно прибавить.",
        en: "The team needs results right now. You have to step it up noticeably in the next few games.",
      },
      (c) => ({
        ru: `Мне нужен прежний ${c.first}. Не через месяц — в ближайших трёх матчах.`,
        en: `I need the old ${c.first} back. Not in a month — in the next three games.`,
      }),
    ],
    challenge: [
      {
        ru: "Докажи, что этот спад — случайность. Я жду от тебя лидерского отрезка.",
        en: "Prove this slump is a fluke. I expect you to lead us through this stretch.",
      },
      {
        ru: "Говорят, ты уже не тот. Докажи всем, что они ошибаются.",
        en: "People are saying you've lost a step. Go prove them wrong.",
      },
    ],
    promise: [
      {
        ru: "Я сохраню тебе место в звене на ближайший отрезок, если ты ответишь качественной игрой.",
        en: "I'll keep your spot in the lineup for the next stretch if you answer with quality hockey.",
      },
      (c) => ({
        ru: `Ты остаёшься ${c.slotIn.ru}, пока я вижу работу. Даю слово.`,
        en: `You stay ${c.slotIn.en} as long as I see the work. You have my word.`,
      }),
    ],
  },
  role: {
    supportive: [
      {
        ru: "Твоя работа не всегда попадает в протокол, но штаб ценит вклад, который ты даёшь команде.",
        en: "Your work doesn't always show up on the scoresheet, but the staff values what you bring to this team.",
      },
      (c) => ({
        ru: `${uc(c.usage.ru)} — это доверие штаба. Твоя работа видна, даже когда её нет в протоколе.`,
        en: `${uc(c.usage.en)} — that's the staff trusting you. Your work is seen even when it isn't on the scoresheet.`,
      }),
    ],
    calm: [
      {
        ru: "Хочу объяснить, какую роль мы видим для тебя и почему она сейчас важна.",
        en: "I want to explain the role we see for you and why it matters right now.",
      },
      (c) => ({
        ru: `Давай сверим картину: сейчас ты ${c.slotIn.ru}, и вот почему мы так решили.`,
        en: `Let's get on the same page: right now you're ${c.slotIn.en}, and here's why we made that call.`,
      }),
    ],
    direct: [
      {
        ru: "На данный момент ты не входишь в ведущую группу. Место придётся вернуть своей игрой.",
        en: "Right now you're not part of the leading group. You'll have to win your place back with your play.",
      },
      (c) => ({
        ru: `Ты ${c.slotIn.ru}, и пока это справедливо. Хочешь выше — выигрывай конкуренцию.`,
        en: `You're ${c.slotIn.en}, and right now that's fair. Want to move up? Win the competition.`,
      }),
    ],
    demanding: [
      {
        ru: "Чтобы получить большую роль, ты должен выигрывать конкуренцию каждый день.",
        en: "To earn a bigger role, you have to win the competition every single day.",
      },
      {
        ru: "Роль не дают за прошлые заслуги. Каждая тренировка — экзамен.",
        en: "Roles aren't handed out for past achievements. Every practice is an exam.",
      },
    ],
    challenge: [
      {
        ru: "У тебя есть качества для следующего шага. Покажи, что ты готов к большей ответственности.",
        en: "You have what it takes for the next step. Show me you're ready for more responsibility.",
      },
      {
        ru: "Я хочу видеть тебя на льду в ключевые минуты. Готов взять это на себя?",
        en: "I want to see you out there in the big moments. Ready to take that on?",
      },
    ],
    promise: [
      {
        ru: "Если сохранишь этот уровень, мы попробуем тебя выше по составу.",
        en: "If you keep this level up, we'll try you higher up the lineup.",
      },
      (c) =>
        c.goalie
          ? {
              ru: "Сохранишь уровень — получишь больше стартов.",
              en: "Keep this up and you'll get more starts.",
            }
          : {
              ru: "Сохранишь уровень — получишь шанс в большинстве.",
              en: "Keep this up and you'll get a look on the power play.",
            },
    ],
  },
  contract: {
    supportive: [
      {
        ru: "Мы ценим тебя как часть клуба и хотим, чтобы переговоры проходили с уважением к обеим сторонам.",
        en: "We value you as part of this club, and we want these talks to be respectful on both sides.",
      },
      (c) => ({
        ru: `У тебя ${c.contract.ru}, и мы не собираемся тянуть до последнего.`,
        en: `You've got ${c.contract.en}, and we don't intend to leave this to the last minute.`,
      }),
    ],
    calm: [
      {
        ru: "Давай честно сверим ожидания по сроку, роли и деньгам до официального предложения.",
        en: "Let's honestly compare expectations on term, role and money before any official offer.",
      },
      (c) => ({
        ru: `Сейчас ты получаешь ${c.salary} млн в год. Давай честно: что для тебя важнее — срок, роль или деньги?`,
        en: `You're earning $${c.salary}M a year right now. Honestly — what matters most to you: term, role or money?`,
      }),
    ],
    direct: [
      {
        ru: "Наш бюджет ограничен. Текущие требования выше той роли, которую мы можем гарантировать.",
        en: "Our budget is limited. Your current demands are above the role we can guarantee.",
      },
      (c) =>
        c.noGames
          ? {
              ru: `Под потолком у нас мало места. За ${c.salary} млн мы ждём от тебя очень многого.`,
              en: `We're tight against the cap. At $${c.salary}M we expect a great deal from you.`,
            }
          : {
              ru: `Под потолком у нас мало места. За ${c.salary} млн мы ждём больше, чем ${c.stat.ru}.`,
              en: `We're tight against the cap. At $${c.salary}M we expect more than ${c.stat.en}.`,
            },
    ],
    demanding: [
      {
        ru: "Если ты хочешь долгосрочный контракт, нам нужна стабильность на льду уже сейчас.",
        en: "If you want a long-term deal, we need consistency on the ice starting now.",
      },
      {
        ru: "Хочешь длинный контракт — дай мне повод его предложить.",
        en: "Want a long-term deal? Give me a reason to offer one.",
      },
    ],
    challenge: [
      {
        ru: "Сильный остаток сезона может изменить твою позицию на переговорах. Всё в твоих руках.",
        en: "A strong finish to the season can change your bargaining position. It's in your hands.",
      },
      {
        ru: "Сыграй так, чтобы мне пришлось переплатить. Я буду только рад.",
        en: "Play so well that I have to overpay you. I'd be glad to.",
      },
    ],
    promise: [
      {
        ru: "Если договоримся по роли, я лично добьюсь от клуба серьёзного предложения.",
        en: "If we agree on the role, I'll personally push the club for a serious offer.",
      },
      {
        ru: "Я хочу, чтобы ты остался. Предложение будет достойным — даю слово.",
        en: "I want you to stay. The offer will be a fair one — you have my word.",
      },
    ],
  },
  development: {
    supportive: [
      {
        ru: "Прогресс идёт не по прямой. Мы видим твою работу и продолжим вкладываться в развитие.",
        en: "Progress doesn't move in a straight line. We see your work and we'll keep investing in your development.",
      },
      (c) =>
        c.young
          ? {
              ru: `Тебе ${c.age} — у тебя всё впереди. Мы видим, как ты растёшь.`,
              en: `You're ${c.age} — everything is still ahead of you. We can see you growing.`,
            }
          : {
              ru: "Даже опытному игроку есть куда расти. Мы поддержим любую твою работу над собой.",
              en: "Even an experienced player can keep growing. We'll back any work you put into your game.",
            },
    ],
    calm: [
      {
        ru: "У нас есть конкретный план по навыкам и нагрузке. Давай пройдём его по пунктам.",
        en: "We have a concrete plan for your skills and workload. Let's go through it point by point.",
      },
      (c) => ({
        ru: c.goalie
          ? "Тренер вратарей подготовил план на месяц: катание в площади, контроль отскоков и чтение бросков. Пройдёмся вместе?"
          : "Штаб подготовил план на месяц: катание, решения с шайбой и физика. Пройдёмся вместе?",
        en: c.goalie
          ? "The goalie coach has a one-month plan: crease movement, rebound control and reading shots. Shall we go through it?"
          : "The staff has a one-month plan: skating, decisions with the puck and strength. Shall we go through it?",
      }),
    ],
    direct: [
      {
        ru: "Темп развития отстаёт от плана. Нужно изменить ежедневную работу.",
        en: "Your development is behind schedule. The daily work has to change.",
      },
      {
        ru: "Показатели тестов стоят на месте. Нужно менять подход к работе.",
        en: "Your testing numbers have flatlined. The approach has to change.",
      },
    ],
    demanding: [
      {
        ru: "Одного потенциала недостаточно. Жду профессионального отношения на каждой тренировке.",
        en: "Potential alone isn't enough. I expect professionalism at every single practice.",
      },
      {
        ru: "Талант у тебя есть. Сейчас мне нужна дисциплина.",
        en: "You've got the talent. What I need from you now is discipline.",
      },
    ],
    challenge: [
      {
        ru: "Следующий уровень уже рядом. Сделай так, чтобы штаб не мог оставить тебя вне состава.",
        en: "The next level is close. Make it impossible for the staff to leave you out of the lineup.",
      },
      {
        ru: "Я верю, что ты можешь стать игроком первых ролей. Удиви меня.",
        en: "I believe you can become a top-of-the-lineup player. Surprise me.",
      },
    ],
    promise: [
      {
        ru: "Выполни план развития — и мы дадим тебе шанс в более сильном звене.",
        en: "Follow the development plan and we'll give you a chance on a stronger unit.",
      },
      {
        ru: "Выполнишь план — получишь больше минут уже в этом сезоне.",
        en: "Hit the plan and you'll get more minutes this season.",
      },
    ],
  },
  "ice-time": {
    supportive: [
      {
        ru: "Я понимаю, что ты хочешь играть больше. Сейчас главное — использовать каждую смену максимально.",
        en: "I understand you want to play more. Right now the key is to get the most out of every shift.",
      },
      (c) => ({
        ru: `Я знаю, что ${c.usage.ru} — меньше, чем ты хочешь. Твоё время придёт.`,
        en: `I know ${c.usage.en} is less than you want. Your time will come.`,
      }),
    ],
    calm: [
      {
        ru: "Твоё время определяется формой, спецбригадами и балансом звеньев. Объясню решение штаба.",
        en: "Your minutes depend on form, special teams and line balance. Let me explain the staff's decision.",
      },
      (c) => ({
        ru: `Объясню, как мы распределяем время: ${c.usage.ru} — это результат формы и баланса звеньев.`,
        en: `Let me explain how we hand out minutes: ${c.usage.en} comes down to form and line balance.`,
      }),
    ],
    direct: [
      {
        ru: "Сейчас другие игроки заслужили больше минут. Ситуацию можно изменить только на льду.",
        en: "Right now other players have earned more minutes. The only place to change that is on the ice.",
      },
      {
        ru: "Скажу прямо: больше минут ты пока не заработал.",
        en: "Bluntly: you haven't earned more minutes yet.",
      },
    ],
    demanding: [
      {
        ru: "Хочешь больше минут — выиграй дуэли, сократи ошибки и заставь тренера доверять тебе.",
        en: "Want more minutes? Win your battles, cut the mistakes and make the coach trust you.",
      },
      (c) =>
        c.goalie
          ? {
              ru: "Меньше лёгких голов — и стартов станет больше.",
              en: "Fewer soft goals and you'll get more starts.",
            }
          : {
              ru: "Меньше потерь, больше выигранной борьбы — и минуты придут.",
              en: "Fewer giveaways, more puck battles won — and the minutes will come.",
            },
    ],
    challenge: [
      {
        ru: "Я дам тебе возможность против сильного соперника. Покажи, что готов к нагрузке.",
        en: "I'll give you a chance against a strong opponent. Show me you can handle the load.",
      },
      (c) =>
        c.goalie
          ? {
              ru: "Следующий матч — твой. Против одной из лучших атак лиги.",
              en: "The next game is yours — against one of the best attacks in the league.",
            }
          : {
              ru: "В следующем матче получишь смены против их первого звена. Покажи, что готов.",
              en: "Next game you'll get shifts against their top line. Show me you're ready.",
            },
    ],
    promise: [
      {
        ru: "При стабильной игре мы увеличим твоё время в ближайших матчах.",
        en: "Play consistently and we'll increase your ice time over the next few games.",
      },
      {
        ru: "Два-три стабильных матча — и у тебя будет больше смен.",
        en: "Two or three steady games and you'll get more shifts.",
      },
    ],
  },
  morale: {
    supportive: [
      {
        ru: "Ты не обязан справляться со всем один. Скажи, что мешает тебе чувствовать себя частью команды.",
        en: "You don't have to carry everything alone. Tell me what's stopping you from feeling part of the team.",
      },
      {
        ru: "Я заметил, что тебе сейчас непросто. Давай поговорим — как человек с человеком.",
        en: "I've noticed things aren't easy for you right now. Let's talk — person to person.",
      },
    ],
    calm: [
      {
        ru: "Я заметил, что ты выглядишь отстранённо. Хочу понять причины без давления.",
        en: "I've noticed you seem distant. I want to understand why, without any pressure.",
      },
      {
        ru: "Без протоколов и без давления: как ты сейчас?",
        en: "No notes, no pressure: how are you doing?",
      },
    ],
    direct: [
      {
        ru: "Твоё настроение начинает влиять на раздевалку. Нам нужно решить проблему.",
        en: "Your mood is starting to affect the dressing room. We need to sort this out.",
      },
      {
        ru: "Твоё настроение видно всем. Это нужно решать сейчас.",
        en: "Everybody can see your mood. We need to deal with it now.",
      },
    ],
    demanding: [
      {
        ru: "Личные сложности не должны разрушать команду. Я жду профессиональной реакции.",
        en: "Personal problems can't be allowed to break the team. I expect a professional response.",
      },
      {
        ru: "Я жду от тебя профессионализма, даже когда тяжело.",
        en: "I expect professionalism from you, even when it's hard.",
      },
    ],
    challenge: [
      {
        ru: "Стань тем, кто меняет атмосферу, а не зависит от неё. Команде это нужно.",
        en: "Be the guy who changes the atmosphere, not the one who depends on it. The team needs that.",
      },
      (c) =>
        c.veteran
          ? {
              ru: "Молодые смотрят на тебя. Покажи им, как выбираться из ямы.",
              en: "The young guys are watching you. Show them how to climb out of a hole.",
            }
          : {
              ru: "Стань тем, кто зажигает раздевалку. Я знаю, что ты можешь.",
              en: "Be the one who lights up the room. I know you can.",
            },
    ],
    promise: [
      {
        ru: "Мы пересмотрим ситуацию вокруг тебя, если ты снова включишься в работу команды.",
        en: "We'll take another look at your situation if you get back into working with the group.",
      },
      {
        ru: "Скажи, что тебя тревожит, и я сделаю всё, что в моих силах.",
        en: "Tell me what's bothering you, and I'll do everything in my power.",
      },
    ],
  },
  injury: {
    supportive: [
      {
        ru: "Не торопись возвращаться раньше времени. Клуб поддержит тебя на каждом этапе восстановления.",
        en: "Don't rush back too early. The club will support you at every stage of your recovery.",
      },
      (c) =>
        c.injured
          ? {
              ru: `По прогнозу врачей — ${c.injuryLine.ru}. Не торопись, мы рядом.`,
              en: `The doctors are forecasting ${c.injuryLine.en}. Don't rush — we're with you.`,
            }
          : {
              ru: "Твоё здоровье — наш приоритет. Если что-то беспокоит, говори сразу.",
              en: "Your health is our priority. If anything is bothering you, tell us right away.",
            },
    ],
    calm: [
      {
        ru: "Медицинский штаб подготовил план. Давай сверим сроки и твоё самочувствие.",
        en: "The medical staff has prepared a plan. Let's go over the timeline and how you're feeling.",
      },
      {
        ru: "Давай сверим график нагрузок. Как ты себя чувствуешь после последних игр?",
        en: "Let's go over your workload. How is your body feeling after the last few games?",
      },
    ],
    direct: [
      {
        ru: "Мы не выпустим тебя без полного допуска, даже если ты считаешь себя готовым.",
        en: "We won't play you without full clearance, even if you think you're ready.",
      },
      {
        ru: "Без допуска врачей на лёд не выйдешь. Это не обсуждается.",
        en: "No medical clearance, no ice. That's not up for discussion.",
      },
    ],
    demanding: [
      {
        ru: "Соблюдай программу восстановления полностью — никаких самовольных ускорений.",
        en: "Follow the recovery program to the letter — no shortcuts on your own.",
      },
      {
        ru: "Каждый пропуск реабилитации отодвигает возвращение. Я слежу.",
        en: "Every skipped rehab session pushes your return back. I'm watching.",
      },
    ],
    challenge: [
      {
        ru: "Используй этот период, чтобы вернуться физически и психологически сильнее.",
        en: "Use this time to come back stronger, physically and mentally.",
      },
      {
        ru: "Вернись сильнее, чем был. Я хочу видеть тебя лучшим после паузы.",
        en: "Come back stronger than you left. I want to see you at your best after the break.",
      },
    ],
    promise: [
      {
        ru: "После допуска мы дадим тебе время спокойно вернуть игровой ритм.",
        en: "Once you're cleared, we'll give you time to get your rhythm back.",
      },
      {
        ru: "После допуска твоё место в составе будет ждать тебя — без борьбы с нуля.",
        en: "Once you're cleared, your spot in the lineup is waiting — no starting from scratch.",
      },
    ],
  },
  future: {
    supportive: [
      {
        ru: "Ты важен для этой организации, и я хочу, чтобы ты понимал своё место в нашем будущем.",
        en: "You matter to this organization, and I want you to understand your place in our future.",
      },
      {
        ru: "Ты — часть того, что мы здесь строим. Хочу, чтобы ты это знал.",
        en: "You're part of what we're building here. I want you to know that.",
      },
    ],
    calm: [
      {
        ru: "Давай открыто поговорим о том, как клуб видит следующие сезоны и твою роль.",
        en: "Let's talk openly about how the club sees the next few seasons and your role in them.",
      },
      {
        ru: "Расскажу, как мы видим следующие два-три сезона и где в этой картине ты.",
        en: "Let me lay out how we see the next two or three seasons — and where you fit in.",
      },
    ],
    direct: [
      {
        ru: "Сейчас мы не можем гарантировать тебе место в долгосрочном ядре команды.",
        en: "Right now we can't guarantee you a place in the team's long-term core.",
      },
      (c) =>
        c.veteran
          ? {
              ru: `В ${c.age} гарантий не бывает. Каждый сезон — новая оценка.`,
              en: `At ${c.age} there are no guarantees. Every season is a fresh evaluation.`,
            }
          : {
              ru: "Ядро команды ещё не определено, и ты пока в него не входишь.",
              en: "The core isn't settled yet, and right now you're not in it.",
            },
    ],
    demanding: [
      {
        ru: "Чтобы остаться частью проекта, ты должен доказать ценность до конца сезона.",
        en: "To stay part of the project, you have to prove your value by the end of the season.",
      },
      {
        ru: "Хочешь остаться — докажи это до конца сезона.",
        en: "Want to stay? Prove it before the season is over.",
      },
    ],
    challenge: [
      {
        ru: "У тебя есть шанс изменить планы клуба. Покажи, что строить команду нужно и вокруг тебя.",
        en: "You have a chance to change the club's plans. Show us we should be building around you too.",
      },
      {
        ru: "Заставь меня строить команду вокруг тебя.",
        en: "Make me build this team around you.",
      },
    ],
    promise: [
      {
        ru: "Если сохранишь уровень и отношение, я не буду искать тебе замену на рынке.",
        en: "Keep up your level and attitude, and I won't go looking for your replacement on the market.",
      },
      {
        ru: "Пока ты держишь уровень, твоё место здесь. Даю слово.",
        en: "As long as you hold your level, your place is here. You have my word.",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Player's first reaction: lead-in + topic core + optional persona tail.
// ---------------------------------------------------------------------------
export const REPLY_LEADS: Record<ConversationMood, L[]> = {
  positive: [
    {
      ru: "Спасибо, что сказали это лично.",
      en: "Thanks for saying it to my face.",
    },
    {
      ru: "Честно, мне нужно было это услышать.",
      en: "Honestly, I needed to hear that.",
    },
    {
      ru: "Ценю, что вы нашли время.",
      en: "I appreciate you making the time.",
    },
    {
      ru: "Хорошо, что мы говорим об этом сейчас, а не в конце сезона.",
      en: "Good that we're talking now and not at the end of the season.",
    },
    { ru: "Понял вас.", en: "Got it." },
  ],
  neutral: [
    { ru: "Хм. Я услышал вас.", en: "Hm. I hear you." },
    { ru: "Ладно.", en: "Okay." },
    {
      ru: "Не буду делать вид, что мне всё понятно.",
      en: "I won't pretend all of that makes sense to me.",
    },
    { ru: "Дайте подумать.", en: "Let me think about that." },
    {
      ru: "Я ожидал немного другого разговора.",
      en: "I expected a slightly different conversation.",
    },
  ],
  negative: [
    { ru: "При всём уважении — нет.", en: "With respect — no." },
    { ru: "Серьёзно?", en: "Seriously?" },
    {
      ru: "Мне не нравится, куда идёт этот разговор.",
      en: "I don't like where this is going.",
    },
    {
      ru: "Мне не нравится, как со мной сейчас разговаривают.",
      en: "I don't like the way I'm being spoken to.",
    },
    { ru: "Честно? Это задевает.", en: "Honestly? That stings." },
  ],
};

export const REPLY_CORES: Record<
  ConversationTopic,
  Record<ConversationMood, Line[]>
> = {
  form: {
    positive: [
      (c) => {
        const finish: L = c.goalie
          ? {
              ru: "нужно просто лучше читать бросок",
              en: "I just need to read the shot a little better",
            }
          : {
              ru: "нужно просто довести моменты до конца",
              en: "I just need to finish my chances",
            };
        return c.noGames
          ? {
              ru: `Сезон только начался, и я чувствую, что игра приходит — ${finish.ru}.`,
              en: `The season's only just started and I can feel my game coming — ${finish.en}.`,
            }
          : {
              ru: `Цифры не врут: ${c.stat.ru}. Но я чувствую, что игра возвращается — ${finish.ru}.`,
              en: `The numbers are what they are: ${c.stat.en}. But I can feel my game coming back — ${finish.en}.`,
            };
      },
      (c) => ({
        ru: `Я пересмотрю свои смены с видеотренером. ${uc(c.usage.ru)} — этого хватает, чтобы влиять на игру, если играть проще.`,
        en: `I'll go through my shifts with the video coach. ${uc(c.usage.en)} is enough to make a difference if I keep it simple.`,
      }),
      {
        ru: "Мне нравится, что мы говорим о деталях, а не паникуем. Я отвечу на льду.",
        en: "I like that we're talking details instead of panicking. I'll answer on the ice.",
      },
    ],
    neutral: [
      (c) =>
        c.noGames
          ? {
              ru: "Форма приходит и уходит. Мне нужно несколько матчей, чтобы войти в ритм.",
              en: "Form comes and goes. I need a few games to find my rhythm.",
            }
          : {
              ru: `Форма приходит и уходит. ${uc(c.stat.ru)} — не катастрофа, но и не то, чего я хочу.`,
              en: `Form comes and goes. ${uc(c.stat.en)} isn't a disaster, but it isn't what I want either.`,
            },
      {
        ru: "Я стараюсь. Просто иногда кажется, что шайба отскакивает не туда, как ни играй.",
        en: "I'm trying. Sometimes it feels like the puck bounces the wrong way no matter what I do.",
      },
      {
        ru: "Если честно, мне сложно понять, что именно вы хотите изменить в моей игре.",
        en: "To be honest, it's hard for me to see exactly what you want me to change.",
      },
    ],
    negative: [
      (c) => ({
        ru: `У меня ${c.usage.ru}, и я должен решать всё один? Посмотрите, в каких условиях я играю.`,
        en: `I'm getting ${c.usage.en} and I'm supposed to fix everything alone? Look at what I'm working with.`,
      }),
      {
        ru: "Давить на меня сейчас — худшее, что можно сделать. Я и так сам себя съедаю.",
        en: "Piling on me right now is the worst thing you can do. I'm already eating myself up.",
      },
      {
        ru: "Каждый игрок проходит через спад. Не помню такого тона, когда я тащил команду.",
        en: "Every player goes through a dip. I don't remember this tone when I was carrying the team.",
      },
    ],
  },
  role: {
    positive: [
      (c) => ({
        ru: `Мне важно понимать, зачем я на льду. Если моя задача — ${c.goalie ? "давать команде шанс каждый вечер" : c.defense ? "закрывать моменты и отдавать первый пас" : c.depth ? "играть в меньшинстве и выигрывать борьбу" : "создавать моменты"}, я сделаю это лучше всех.`,
        en: `I need to know why I'm out there. If my job is to ${c.goalie ? "give us a chance every night" : c.defense ? "shut plays down and make the first pass" : c.depth ? "kill penalties and win battles" : "create chances"}, I'll do it better than anyone.`,
      }),
      (c) => ({
        ru: `Сейчас это ${c.slot.ru}, и я это принимаю. Но я хочу расти, а не просто занимать место.`,
        en: `Right now that's ${c.slot.en}, and I accept it. But I want to grow, not just hold a spot.`,
      }),
      {
        ru: "Спасибо за ясность. Когда понимаешь свою роль, играть намного проще.",
        en: "Thanks for the clarity. When you know your role, the game gets a lot simpler.",
      },
    ],
    neutral: [
      (c) => ({
        ru: `Значит, ${c.slot.ru}. Я рассчитывал на большее, но спорить на словах не буду.`,
        en: `So it's ${c.slot.en}. I was hoping for more, but I won't argue it with words.`,
      }),
      {
        ru: "Роль — это хорошо, но я хочу видеть путь наверх, а не только слова.",
        en: "A role is fine, but I want to see a path upward, not just words.",
      },
      {
        ru: "Хорошо. Только хочу, чтобы критерии были одинаковыми для всех.",
        en: "Fine. I just want the criteria to be the same for everybody.",
      },
    ],
    negative: [
      (c) => ({
        ru: `${uc(c.usage.ru)} — и вы говорите мне о роли? Я заслужил больше доверия.`,
        en: `${uc(c.usage.en)}, and you're talking to me about my role? I've earned more trust than that.`,
      }),
      {
        ru: "Такое ощущение, что вы уже всё решили без меня.",
        en: "It feels like you've already decided everything without me.",
      },
      (c) =>
        c.veteran
          ? {
              ru: `Мне ${c.age}. У меня не так много сезонов, чтобы просиживать их на скамейке.`,
              en: `I'm ${c.age}. I don't have many seasons left to waste on the bench.`,
            }
          : {
              ru: `Мне ${c.age}, и я не хочу тратить лучшие годы на роль статиста.`,
              en: `I'm ${c.age}, and I don't want to waste my best years as an extra.`,
            },
    ],
  },
  contract: {
    positive: [
      (c) => ({
        ru: `У меня ${c.contract.ru}. Хочется закрыть этот вопрос и думать только о хоккее.`,
        en: `I've got ${c.contract.en}. I'd like to settle it and just think about hockey.`,
      }),
      {
        ru: "Мне нравится здесь. Если клуб говорит честно, я тоже не стану затягивать.",
        en: "I like it here. If the club talks straight, I won't drag it out either.",
      },
      {
        ru: "Деньги важны, но роль и уважение важнее. Передам агенту, что разговор был хороший.",
        en: "Money matters, but role and respect matter more. I'll tell my agent this was a good talk.",
      },
    ],
    neutral: [
      (c) => ({
        ru: `Пусть цифры обсуждает агент. У меня ${c.contract.ru}, и я пока не тороплюсь.`,
        en: `Let my agent handle the numbers. I've got ${c.contract.en} and I'm in no rush.`,
      }),
      (c) => ({
        ru: `Я получаю ${c.salary} млн в год и знаю, что говорит рынок. Посмотрим, совпадут ли ожидания.`,
        en: `I'm at $${c.salary}M a year and I know what the market says. We'll see if the expectations meet.`,
      }),
      {
        ru: "Не со всем согласен, но понимаю, что у клуба есть потолок зарплат.",
        en: "I don't agree with all of it, but I know the club lives under a cap.",
      },
    ],
    negative: [
      (c) =>
        c.noGames
          ? {
              ru: "Если клуб так оценивает меня ещё до первого матча, значит, стоит смотреть и другие варианты.",
              en: "If that's how the club values me before I've even played a game, we should be looking at other options.",
            }
          : {
              ru: `Если клуб так оценивает меня после того, как у меня ${c.stat.ru}, значит, стоит смотреть и другие варианты.`,
              en: `If that's how the club values me with ${c.stat.en}, then we should be looking at other options.`,
            },
      {
        ru: "Мой агент не обрадуется. Честно говоря, я тоже.",
        en: "My agent won't be thrilled. Honestly, neither am I.",
      },
      {
        ru: "Похоже, клуб уже планирует будущее без меня. Ладно, рынок рассудит.",
        en: "Sounds like the club is already planning a future without me. Fine — the market will decide.",
      },
    ],
  },
  development: {
    positive: [
      {
        ru: "Я готов оставаться после тренировок. Скажите, над чем работать в первую очередь.",
        en: "I'm ready to stay after practice. Tell me what to work on first.",
      },
      (c) =>
        c.young
          ? {
              ru: `Мне ${c.age}, и я хочу стать игроком первых ролей. Такой план мне подходит.`,
              en: `I'm ${c.age} and I want to be a top-of-the-lineup player. That plan works for me.`,
            }
          : {
              ru: `Даже в ${c.age} можно что-то добавить. Я не собираюсь стоять на месте.`,
              en: `Even at ${c.age} there's something to add. I'm not planning to stand still.`,
            },
      {
        ru: "Конкретика — это то, что мне нужно. Индивидуальная программа плюс видео, и я прибавлю.",
        en: "Specifics are exactly what I need. An individual program plus video, and I'll take a step.",
      },
    ],
    neutral: [
      {
        ru: "Я работаю каждый день. Просто прогресс не всегда виден в протоколе.",
        en: "I work every day. Progress just doesn't always show up on the scoresheet.",
      },
      (c) => ({
        ru: `Сложно развиваться, когда у тебя ${c.usage.ru}.`,
        en: `It's hard to develop on ${c.usage.en}.`,
      }),
      {
        ru: "Хорошо, попробую. Но мне нужна обратная связь чаще, чем раз в месяц.",
        en: "Okay, I'll try. But I need feedback more often than once a month.",
      },
    ],
    negative: [
      {
        ru: "Вы сомневаетесь в моём отношении к работе? Я первым выхожу на лёд.",
        en: "You're questioning my work ethic? I'm the first one on the ice every day.",
      },
      {
        ru: "Развитию нужно игровое время, а не лекции.",
        en: "Development takes ice time, not lectures.",
      },
      (c) =>
        c.veteran
          ? {
              ru: `Мне ${c.age}. Меня не нужно учить играть в хоккей.`,
              en: `I'm ${c.age}. I don't need to be taught how to play hockey.`,
            }
          : {
              ru: "Такое чувство, что на меня уже махнули рукой.",
              en: "It feels like you've already given up on me.",
            },
    ],
  },
  "ice-time": {
    positive: [
      (c) => ({
        ru: `Сейчас у меня ${c.usage.ru}. Я понимаю, что каждую лишнюю минуту надо заработать.`,
        en: `Right now I'm getting ${c.usage.en}. I get that every extra minute has to be earned.`,
      }),
      (c) =>
        c.goalie
          ? {
              ru: "Дайте мне серию матчей подряд — вратарю нужен ритм.",
              en: "Give me a run of starts — a goalie needs rhythm.",
            }
          : {
              ru: "Дайте мне пару смен в большинстве — я покажу, что могу больше.",
              en: "Give me a couple of power-play shifts and I'll show you I can do more.",
            },
      {
        ru: "Честное объяснение — это всё, что мне было нужно. Буду ловить свой шанс.",
        en: "An honest explanation is all I needed. I'll grab my chance.",
      },
    ],
    neutral: [
      (c) => ({
        ru: `${uc(c.usage.ru)} — это немного. Надеюсь, решения действительно принимаются по игре.`,
        en: `${uc(c.usage.en)} isn't a lot. I hope the decisions really are based on play.`,
      }),
      {
        ru: "Понял. Но если через пару недель ничего не изменится, я снова приду.",
        en: "Understood. But if nothing changes in a couple of weeks, I'll be back in here.",
      },
      {
        ru: "Легко говорить «используй каждую смену», когда у тебя их немного.",
        en: '"Make every shift count" is easy to say when you\'re not getting many.',
      },
    ],
    negative: [
      (c) => ({
        ru: `${uc(c.usage.ru)}? Я не для этого подписывал контракт.`,
        en: `${uc(c.usage.en)}? That's not what I signed here for.`,
      }),
      {
        ru: "Другие ошибаются и продолжают играть. Почему для меня стандарт другой?",
        en: "Other guys make mistakes and keep playing. Why is my standard different?",
      },
      {
        ru: "Если роль не изменится, нам придётся вернуться к этому разговору — уже с агентом.",
        en: "If my role doesn't change, we'll be having this conversation again — with my agent.",
      },
    ],
  },
  morale: {
    positive: [
      {
        ru: "Честно, последние недели были тяжёлыми. Приятно, что кто-то это заметил.",
        en: "Honestly, the last few weeks have been heavy. It's good that someone noticed.",
      },
      {
        ru: "Мне помогает, когда со мной говорят прямо. Раздевалка у нас хорошая, я справлюсь.",
        en: "It helps when people are straight with me. We've got a good room — I'll be fine.",
      },
      {
        ru: "Спасибо. Я снова хочу получать удовольствие от хоккея, и это шаг в ту сторону.",
        en: "Thanks. I want to enjoy hockey again, and this is a step in that direction.",
      },
    ],
    neutral: [
      {
        ru: "Всё нормально. Просто много мыслей в голове.",
        en: "I'm fine. Just a lot on my mind.",
      },
      {
        ru: "Не уверен, что готов сейчас всё объяснить. Дайте мне время.",
        en: "Not sure I can explain it all right now. Give me some time.",
      },
      {
        ru: "Есть вещи вне льда, о которых я не хочу говорить. Но я вас услышал.",
        en: "There's stuff away from the rink I'd rather not get into. But I hear you.",
      },
    ],
    negative: [
      {
        ru: "Вы правда думаете, что дело во мне? Посмотрите, как со мной обращаются.",
        en: "You really think the problem is me? Look at how I've been treated.",
      },
      {
        ru: "Мне надоело быть крайним. Что бы ни случилось, смотрят на меня.",
        en: "I'm tired of being the scapegoat. Whatever goes wrong, everyone looks at me.",
      },
      {
        ru: "Если раздевалка страдает — может, стоит спросить, почему я так себя чувствую?",
        en: "If the room is suffering, maybe ask why I feel the way I do?",
      },
    ],
  },
  injury: {
    positive: [
      (c) =>
        c.injured
          ? {
              ru: `Врачи говорят — ${c.injuryLine.ru}. Буду делать всё по плану, без геройства.`,
              en: `The doctors say ${c.injuryLine.en}. I'll follow the plan, no heroics.`,
            }
          : {
              ru: "Тело в порядке, но спасибо, что следите. Нагрузку буду контролировать.",
              en: "My body's fine, but thanks for keeping an eye on it. I'll manage the load.",
            },
      {
        ru: "Спасибо, что не торопите. Я хочу вернуться один раз и надолго.",
        en: "Thanks for not rushing me. I want to come back once, and for good.",
      },
      {
        ru: "Я буду следовать плану врачей и держать вас в курсе каждый день.",
        en: "I'll follow the doctors' plan and keep you posted every day.",
      },
    ],
    neutral: [
      {
        ru: "Я чувствую себя лучше, чем написано в отчётах. Но решать врачам.",
        en: "I feel better than the reports say. But it's the doctors' call.",
      },
      {
        ru: "Сначала хочу ещё раз поговорить с медицинским штабом.",
        en: "I want to talk to the medical staff again first.",
      },
      {
        ru: "Сидеть на трибуне тяжелее, чем кажется. Но я понимаю.",
        en: "Sitting in the press box is harder than it looks. But I understand.",
      },
    ],
    negative: [
      {
        ru: "Мне кажется, клуб не слышит, как я сам оцениваю своё состояние.",
        en: "I feel like the club isn't listening to how I rate my own condition.",
      },
      {
        ru: "Я знаю своё тело лучше любых тестов.",
        en: "I know my body better than any test does.",
      },
      {
        ru: "Каждый день вне состава кто-то занимает моё место. Вы это понимаете?",
        en: "Every day I'm out, someone else is taking my spot. Do you understand that?",
      },
    ],
  },
  future: {
    positive: [
      {
        ru: "Я хочу быть частью того, что здесь строится. Приятно слышать, что это взаимно.",
        en: "I want to be part of what's being built here. Good to hear it's mutual.",
      },
      (c) =>
        c.veteran
          ? {
              ru: `В ${c.age} хочется понимать, где закончишь карьеру. Если здесь — я только рад.`,
              en: `At ${c.age} you want to know where you'll finish your career. If it's here, I'm glad.`,
            }
          : {
              ru: "Я вижу себя здесь надолго. Давайте выигрывать вместе.",
              en: "I see myself here for a long time. Let's win together.",
            },
      {
        ru: "Мне важно доверие. С ним я сыграю лучше, чем вы ожидаете.",
        en: "Trust matters to me. With it, I'll play better than you expect.",
      },
    ],
    neutral: [
      {
        ru: "Будущее — это далеко. Сейчас я думаю о следующем матче.",
        en: "The future is a long way off. Right now I'm thinking about the next game.",
      },
      {
        ru: "Хорошо, что вы говорите открыто. Но гарантий, как я понимаю, нет.",
        en: "Good that you're being open. But there are no guarantees, as I understand it.",
      },
      {
        ru: "Посмотрю, как сложится сезон. Многое зависит от того, куда движется клуб.",
        en: "I'll see how the season goes. A lot depends on where the club is heading.",
      },
    ],
    negative: [
      {
        ru: "Если вы не видите меня в ядре — скажите прямо, и мы обсудим обмен.",
        en: "If you don't see me in the core, say it plainly and we'll talk about a trade.",
      },
      {
        ru: "Я многое отдал этому клубу. Слышать такое неприятно.",
        en: "I've given this club a lot. That's hard to hear.",
      },
      {
        ru: "Звучит так, будто мне уже ищут замену на рынке.",
        en: "Sounds like you're already shopping for my replacement.",
      },
    ],
  },
};

export const PERSONA_TAILS: Record<Persona, Record<ConversationMood, L>> = {
  veteran: {
    positive: {
      ru: "Я многое видел в этой лиге — такие разговоры помогают.",
      en: "I've seen a lot in this league — talks like this help.",
    },
    neutral: {
      ru: "В моём возрасте ценишь прямоту.",
      en: "At my age you value straight talk.",
    },
    negative: {
      ru: "Я не первый год в лиге и знаю, как это работает.",
      en: "I've been around long enough to know how this works.",
    },
  },
  young: {
    positive: {
      ru: "Я буду работать больше всех, обещаю.",
      en: "I'll outwork everybody, I promise.",
    },
    neutral: {
      ru: "Я ещё учусь, но хочу понимать, куда расту.",
      en: "I'm still learning, but I want to know where I'm headed.",
    },
    negative: {
      ru: "Кажется, на молодых давят сильнее, чем на остальных.",
      en: "It feels like the young guys get squeezed harder than everyone else.",
    },
  },
  star: {
    positive: {
      ru: "Команда может рассчитывать на меня в больших матчах.",
      en: "The team can count on me in the big games.",
    },
    neutral: {
      ru: "Я привык, что от меня ждут большего, — это нормально.",
      en: "I'm used to people expecting more from me — that's fine.",
    },
    negative: {
      ru: "Не думаю, что с ведущими игроками стоит говорить таким тоном.",
      en: "I don't think that's the tone to take with your top players.",
    },
  },
  depth: {
    positive: {
      ru: "Я знаю своё место и буду цепляться за каждый шанс.",
      en: "I know where I stand, and I'll fight for every chance.",
    },
    neutral: {
      ru: "Таким, как я, второй шанс дают нечасто.",
      en: "Guys like me don't often get second chances.",
    },
    negative: {
      ru: "Видимо, игроки глубины здесь — расходный материал.",
      en: "I guess depth guys are disposable around here.",
    },
  },
  expiring: {
    positive: {
      ru: "И да — контракт сейчас тоже давит, так что разговор вовремя.",
      en: "And yeah — the contract is on my mind too, so this is good timing.",
    },
    neutral: {
      ru: "Скажу честно: я думаю и о том, что будет летом.",
      en: "Honestly, I'm also thinking about what happens this summer.",
    },
    negative: {
      ru: "С истекающим контрактом такие слова слышишь иначе.",
      en: "On an expiring deal, you hear words like that differently.",
    },
  },
  goalie: {
    positive: {
      ru: "Вратарю важно знать, что ему доверяют.",
      en: "A goalie needs to know he's trusted.",
    },
    neutral: {
      ru: "Вратарская голова — штука хрупкая.",
      en: "A goalie's head is a fragile thing.",
    },
    negative: {
      ru: "Вратаря всегда проще всего сделать виноватым.",
      en: "The goalie is always the easiest one to blame.",
    },
  },
};

// ---------------------------------------------------------------------------
// Manager follow-ups.
// ---------------------------------------------------------------------------
export const FOLLOW_UP_LABELS: Record<FollowUpKind, { label: L; hint: L }> = {
  listen: {
    label: { ru: "Выслушать", en: "Hear him out" },
    hint: {
      ru: "Дать игроку высказаться и спросить, что ему нужно.",
      en: "Let him speak his mind and ask what he needs.",
    },
  },
  reassure: {
    label: { ru: "Успокоить", en: "Reassure" },
    hint: {
      ru: "Снять напряжение и показать, что клуб на его стороне.",
      en: "Take the heat out and show the club is on his side.",
    },
  },
  target: {
    label: { ru: "Поставить цель", en: "Set a target" },
    hint: {
      ru: "Завершить встречу конкретной задачей на ближайшие матчи.",
      en: "Close with a concrete target for the next few games.",
    },
  },
  promise: {
    label: { ru: "Дать обещание", en: "Make a promise" },
    hint: {
      ru: "Сильный жест — но игрок запомнит ваше слово.",
      en: "A strong gesture — but he'll remember your word.",
    },
  },
  "raise-bar": {
    label: { ru: "Поднять планку", en: "Raise the bar" },
    hint: {
      ru: "Потребовать лидерства. Сильные характеры это ценят.",
      en: "Demand leadership. Strong characters respond to it.",
    },
  },
  "hold-line": {
    label: { ru: "Стоять на своём", en: "Hold your ground" },
    hint: {
      ru: "Не уступать. Рискованно, если игрок уже раздражён.",
      en: "Don't give ground. Risky if he's already upset.",
    },
  },
  compromise: {
    label: { ru: "Найти компромисс", en: "Find a compromise" },
    hint: {
      ru: "Встретиться на полпути и назначить срок пересмотра.",
      en: "Meet halfway and set a date to review it.",
    },
  },
  ultimatum: {
    label: { ru: "Ультиматум", en: "Ultimatum" },
    hint: {
      ru: "Жёсткая точка. Может встряхнуть — или сломать отношения.",
      en: "A hard line. It may shake him up — or break the relationship.",
    },
  },
  "wrap-up": {
    label: { ru: "Завершить разговор", en: "Wrap it up" },
    hint: {
      ru: "Закончить встречу без новых обязательств.",
      en: "End the meeting without new commitments.",
    },
  },
};

const TOPIC_TARGETS: Record<ConversationTopic, Line> = {
  form: (c) =>
    c.goalie
      ? {
          ru: "Простая цель: 91% отражённых бросков в ближайших пяти стартах. Остальное придёт.",
          en: "Simple target: a .910 save percentage over your next five starts. The rest will follow.",
        }
      : {
          ru: "Простая цель: восемь бросков в ближайших трёх матчах и чистая игра в своей зоне. Остальное придёт.",
          en: "Simple target: eight shots over the next three games and clean play in our own end. The rest will follow.",
        },
  role: {
    ru: "Задача на месяц: побеждать в борьбе у бортов и не проигрывать свои смены. Сделаешь — поднимешься выше.",
    en: "Your job for the next month: win the battles along the boards and don't lose your shifts. Do that and you move up.",
  },
  contract: {
    ru: "Давай так: до дедлайна обменов показываешь стабильность — и мы садимся с агентом за стол.",
    en: "Here's the deal: show me consistency until the trade deadline, and we sit down with your agent.",
  },
  development: {
    ru: "Две индивидуальные тренировки в неделю и разбор видео после каждой игры. Через месяц оценим.",
    en: "Two individual sessions a week and video after every game. We'll review it in a month.",
  },
  "ice-time": (c) =>
    c.goalie
      ? {
          ru: "Выиграй конкуренцию на тренировках этой недели — и получишь следующий старт.",
          en: "Win the competition in practice this week and the next start is yours.",
        }
      : {
          ru: "Выиграй конкуренцию у того, кто стоит выше, на тренировках этой недели — и получишь его минуты.",
          en: "Beat the guy ahead of you in practice this week and you get his minutes.",
        },
  morale: {
    ru: "Давай договоримся: раз в неделю пять минут разговора со мной или с тренером. Без формальностей.",
    en: "Let's agree on this: five minutes with me or the coach every week. No formalities.",
  },
  injury: {
    ru: "Цель — пройти все тесты к следующей неделе без боли. Тогда сразу обсуждаем возвращение.",
    en: "The goal is to pass every test by next week, pain-free. Then we talk about your return right away.",
  },
  future: {
    ru: "До конца сезона покажи, что ты лидер в раздевалке, и летом обсудим твоё место в ядре.",
    en: "Show me you're a leader in the room until the end of the season, and this summer we'll discuss your place in the core.",
  },
};

const TOPIC_PROMISES: Record<ConversationTopic, Line> = {
  form: (c) => ({
    ru: `Обещаю: ближайшие пять игр ты остаёшься ${c.slotIn.ru}, что бы ни случилось.`,
    en: `I promise you stay ${c.slotIn.en} for the next five games, no matter what.`,
  }),
  role: (c) =>
    c.goalie
      ? {
          ru: "Даю слово: при таком уровне игры ты получишь больше стартов.",
          en: "You have my word: keep this level and you'll get more starts.",
        }
      : {
          ru: "Даю слово: при таком уровне игры ты получишь место во второй бригаде большинства.",
          en: "You have my word: keep this level and you're on the second power-play unit.",
        },
  contract: {
    ru: "Я лично передам владельцу, что хочу видеть тебя здесь и после этого контракта.",
    en: "I'll tell the owner personally that I want you here beyond this contract.",
  },
  development: {
    ru: "Обещаю: следующий шанс выше по составу — твой.",
    en: "I promise the next chance higher up the lineup is yours.",
  },
  "ice-time": {
    ru: "Даю слово: в следующих матчах у тебя будет больше смен.",
    en: "You have my word: more shifts in the coming games.",
  },
  morale: {
    ru: "Обещаю, что мы разберёмся с тем, что тебя тревожит. Моя дверь открыта.",
    en: "I promise we'll sort out whatever is bothering you. My door is open.",
  },
  injury: {
    ru: "Обещаю: пока ты восстанавливаешься, никто не займёт твоё место навсегда.",
    en: "I promise nobody takes your spot for good while you're recovering.",
  },
  future: {
    ru: "Пока я здесь GM, ты не окажешься в списке на обмен.",
    en: "As long as I'm GM here, you won't be on the trade block.",
  },
};

export function followUpManagerLines(
  kind: FollowUpKind,
  topic: ConversationTopic,
  mood: ConversationMood,
): Line[] {
  switch (kind) {
    case "target":
      return [TOPIC_TARGETS[topic]];
    case "promise":
      return [TOPIC_PROMISES[topic]];
    case "listen":
      return [
        {
          ru: "Хорошо. Что тебе нужно от меня и от штаба, чтобы это изменилось?",
          en: "Okay. What do you need from me and the staff to change this?",
        },
        {
          ru: "Расскажи, как ты сам видишь ситуацию. Я слушаю.",
          en: "Tell me how you see it yourself. I'm listening.",
        },
        {
          ru: "Не буду спорить. Объясни, что беспокоит тебя больше всего.",
          en: "I won't argue. Tell me what worries you the most.",
        },
      ];
    case "reassure":
      return [
        {
          ru: "Это не приговор. Ты важен для нас, и один разговор этого не меняет.",
          en: "This isn't a verdict. You matter to us, and one conversation doesn't change that.",
        },
        {
          ru: "Я на твоей стороне. Мы решим это вместе.",
          en: "I'm on your side. We'll solve this together.",
        },
        (c) =>
          c.noGames
            ? {
                ru: "Я помню, что ты делал для команды. Это никуда не делось.",
                en: "I remember what you've done for this team. That hasn't gone anywhere.",
              }
            : {
                ru: `Я помню, что ты делал для команды. ${uc(c.stat.ru)} этого не перечёркивает.`,
                en: `I remember what you've done for this team. ${uc(c.stat.en)} doesn't erase that.`,
              },
      ];
    case "raise-bar":
      return [
        {
          ru: "Мне нравится этот настрой. Но я хочу большего — чтобы ты стал примером для остальных.",
          en: "I like that attitude. But I want more — I want you to set the example for the others.",
        },
        {
          ru: "Тогда поднимем планку: от тебя я жду лидерства, а не просто хорошей игры.",
          en: "Then let's raise the bar: I expect leadership from you, not just good hockey.",
        },
      ];
    case "hold-line":
      return [
        {
          ru: "Я понимаю эмоции, но решение штаба остаётся прежним.",
          en: "I understand the emotion, but the staff's decision stands.",
        },
        {
          ru: "Я не изменю позицию из-за слов. Измени её игрой.",
          en: "I won't change my position because of words. Change it with your play.",
        },
        {
          ru: "Стандарт одинаков для всех, и для тебя тоже.",
          en: "The standard is the same for everyone, you included.",
        },
      ];
    case "compromise":
      return [
        {
          ru: "Давай найдём середину: ты прибавляешь в деталях, а мы пересматриваем ситуацию через две недели.",
          en: "Let's meet in the middle: you sharpen the details, and we review the situation in two weeks.",
        },
        {
          ru: "Предлагаю так: я учту твою позицию, а ты дашь мне две недели полной отдачи.",
          en: "Here's my offer: I'll take your view into account, and you give me two weeks of full effort.",
        },
      ];
    case "ultimatum":
      return [
        {
          ru: "Повторять не буду: либо отношение меняется, либо ты ищешь другую команду.",
          en: "I'll say it once: either your attitude changes, or you start looking for another team.",
        },
        (c) =>
          c.goalie
            ? {
                ru: "Если так продолжится, следующий старт получит другой. Решай сам.",
                en: "If this continues, someone else gets the next start. Your call.",
              }
            : {
                ru: "Если так продолжится — фарм-клуб. Решай сам.",
                en: "If this continues, it's the farm team. Your call.",
              },
      ];
    case "wrap-up":
      return mood === "negative"
        ? [
            {
              ru: "Думаю, на сегодня хватит. Вернёмся к этому, когда оба остынем.",
              en: "I think that's enough for today. We'll pick this up when we've both cooled down.",
            },
            {
              ru: "Давай пока остановимся. Подумай о том, что я сказал.",
              en: "Let's stop here for now. Think about what I said.",
            },
          ]
        : [
            {
              ru: "Отлично. Иди и покажи это на льду.",
              en: "Great. Go show it on the ice.",
            },
            {
              ru: "Рад, что поговорили. Дверь всегда открыта.",
              en: "Glad we talked. My door is always open.",
            },
            {
              ru: "Хорошо. Увидимся на тренировке.",
              en: "Good. See you at practice.",
            },
          ];
  }
}

export const FOLLOW_UP_REPLIES: Record<
  FollowUpKind,
  Record<ConversationMood, Line[]>
> = {
  listen: {
    positive: [
      {
        ru: "Честно? Чуть больше доверия и понятная задача. С остальным я справлюсь.",
        en: "Honestly? A bit more trust and a clear job. I can handle the rest.",
      },
      {
        ru: "Спасибо, что дали сказать. Мне важно знать, что меня видят не только в протоколе.",
        en: "Thanks for letting me talk. I need to know I'm seen beyond the scoresheet.",
      },
    ],
    neutral: [
      (c) =>
        c.goalie
          ? {
              ru: "Мне нужна определённость — кто играет и когда.",
              en: "I need certainty — who starts and when.",
            }
          : {
              ru: "Мне нужна стабильность — одни и те же партнёры хотя бы несколько игр подряд.",
              en: "I need stability — the same linemates for more than a couple of games.",
            },
      {
        ru: "Не знаю. Наверное, просто время и пара удачных матчей.",
        en: "I don't know. Time, probably, and a couple of good games.",
      },
    ],
    negative: [
      {
        ru: "Мне нужно, чтобы слова совпадали с решениями. Пока это не так.",
        en: "I need the words to match the decisions. Right now they don't.",
      },
      {
        ru: "Что мне нужно? Честность. А пока я слышу только общие фразы.",
        en: "What do I need? Honesty. So far I'm only hearing slogans.",
      },
    ],
  },
  reassure: {
    positive: [
      {
        ru: "Ладно... Это важно слышать. Спасибо.",
        en: "Okay... That's important to hear. Thank you.",
      },
      {
        ru: "Хорошо. Мне правда стало легче.",
        en: "All right. That actually takes some weight off.",
      },
    ],
    neutral: [
      {
        ru: "Хотелось бы в это верить. Посмотрим, что будет на деле.",
        en: "I'd like to believe that. We'll see what happens in practice.",
      },
      {
        ru: "Спасибо, но слова — одно, а состав на игру — другое.",
        en: "Thanks, but words are one thing and the game-day lineup is another.",
      },
    ],
    negative: [
      (c) => ({
        ru: c.goalie
          ? "Мне не нужна жалость. Мне нужны матчи."
          : "Мне не нужна жалость. Мне нужно игровое время.",
        en: c.goalie
          ? "I don't need sympathy. I need starts."
          : "I don't need sympathy. I need ice time.",
      }),
      {
        ru: "Красиво звучит. Но я это уже слышал.",
        en: "Sounds nice. I've heard it before.",
      },
    ],
  },
  target: {
    positive: [
      {
        ru: "Договорились. Цель понятная — проверим через пару недель.",
        en: "Deal. Clear target — let's check back in a couple of weeks.",
      },
      {
        ru: "Конкретно и честно. Мне так проще.",
        en: "Concrete and fair. That's easier for me.",
      },
    ],
    neutral: [
      {
        ru: "Хорошо, попробую. Но планка жёсткая.",
        en: "Okay, I'll try. But it's a tough bar.",
      },
      {
        ru: "Принято. Надеюсь, условия будут честными.",
        en: "Noted. I hope the conditions will be fair.",
      },
    ],
    negative: [
      {
        ru: "Опять планки и проверки... Ладно, как скажете.",
        en: "More bars and tests... Fine, whatever you say.",
      },
      {
        ru: "Это не решает проблему, но спорить я не буду.",
        en: "That doesn't fix the problem, but I'm not going to argue.",
      },
    ],
  },
  promise: {
    positive: [
      {
        ru: "Я запомню это. И сделаю так, чтобы вы не пожалели.",
        en: "I'll remember that. And I'll make sure you don't regret it.",
      },
      {
        ru: "Это много для меня значит. Спасибо, правда.",
        en: "That means a lot. Thank you, really.",
      },
    ],
    neutral: [
      {
        ru: "Хорошо. Посмотрим, сдержит ли клуб слово.",
        en: "Okay. We'll see if the club keeps its word.",
      },
      {
        ru: "Обещания — это приятно. Но поверю, когда увижу.",
        en: "Promises are nice. I'll believe it when I see it.",
      },
    ],
    negative: [
      {
        ru: "Мне уже обещали. Ничего не изменилось.",
        en: "I've been promised things before. Nothing changed.",
      },
      {
        ru: "Не надо обещаний. Просто будьте честны.",
        en: "Don't make promises. Just be honest with me.",
      },
    ],
  },
  "raise-bar": {
    positive: [
      {
        ru: "Я готов. Пусть остальные равняются на меня.",
        en: "I'm ready. Let the others follow my lead.",
      },
      (c) =>
        c.young
          ? { ru: "Это вызов? Принимаю.", en: "Is that a challenge? Accepted." }
          : {
              ru: "Лидерство — это ответственность. Я её возьму.",
              en: "Leadership means responsibility. I'll take it.",
            },
    ],
    neutral: [
      {
        ru: "Сначала дайте мне стабильно играть, а потом поговорим о лидерстве.",
        en: "Let me play consistently first, then we'll talk about leadership.",
      },
      {
        ru: "Хм. Я и так стараюсь. Но хорошо.",
        en: "Hm. I'm already trying. But fine.",
      },
    ],
    negative: [
      {
        ru: "Ещё больше давления — именно то, чего мне не хватало.",
        en: "More pressure — exactly what I needed.",
      },
      {
        ru: "Минуту назад вы меня хвалили, а теперь снова требования.",
        en: "A minute ago you were praising me, and now it's demands again.",
      },
    ],
  },
  "hold-line": {
    positive: [
      {
        ru: "Понял. Значит, буду менять ситуацию игрой.",
        en: "Understood. Then I'll change it with my play.",
      },
      {
        ru: "Справедливо. Я не прошу поблажек.",
        en: "Fair enough. I'm not asking for favours.",
      },
    ],
    neutral: [
      {
        ru: "Ладно. Не согласен, но принимаю.",
        en: "Fine. I don't agree, but I accept it.",
      },
      {
        ru: "Вижу, что вас не переубедить. Хорошо.",
        en: "I can see I won't change your mind. Okay.",
      },
    ],
    negative: [
      {
        ru: "Тогда нам больше не о чем говорить.",
        en: "Then there's nothing more to talk about.",
      },
      {
        ru: "Я будто разговариваю со стеной.",
        en: "It's like talking to a wall.",
      },
    ],
  },
  compromise: {
    positive: [
      {
        ru: "Это честно. Две недели — и вернёмся к разговору.",
        en: "That's fair. Two weeks, then we talk again.",
      },
      {
        ru: "Меня устраивает. Спасибо, что пошли навстречу.",
        en: "Works for me. Thanks for meeting me halfway.",
      },
    ],
    neutral: [
      {
        ru: "Ну... Хорошо. Хотя бы есть срок.",
        en: "Well... Okay. At least there's a timeline.",
      },
      {
        ru: "Середина — не то, на что я рассчитывал, но это лучше, чем ничего.",
        en: "Halfway isn't what I hoped for, but it beats nothing.",
      },
    ],
    negative: [
      {
        ru: "Компромисс, в котором уступаю только я?",
        en: "A compromise where I'm the only one giving ground?",
      },
      {
        ru: "Ладно. Но если через две недели всё будет так же — говорить будет агент.",
        en: "Fine. But if nothing has changed in two weeks, my agent does the talking.",
      },
    ],
  },
  ultimatum: {
    positive: [
      {
        ru: "Жёстко. Но, может, мне это и нужно было услышать.",
        en: "Harsh. But maybe that's what I needed to hear.",
      },
      {
        ru: "Понял. Повторять не придётся.",
        en: "Got it. You won't have to say it twice.",
      },
    ],
    neutral: [
      { ru: "...Понял.", en: "...Understood." },
      {
        ru: "Хорошо. Вы сказали — я услышал.",
        en: "Okay. You said it, I heard it.",
      },
    ],
    negative: [
      {
        ru: "Угрозы? Отлично. Тогда я тоже подумаю о своём будущем.",
        en: "Threats? Great. Then I'll start thinking about my future too.",
      },
      (c) =>
        c.goalie
          ? {
              ru: "Отдавайте старт кому хотите. Посмотрим, кому это навредит больше.",
              en: "Give the start to whoever you want. We'll see who it hurts more.",
            }
          : {
              ru: "Можете отправлять в фарм-клуб. Посмотрим, кому это навредит больше.",
              en: "Send me down, then. We'll see who it hurts more.",
            },
    ],
  },
  "wrap-up": {
    positive: [
      {
        ru: "Спасибо, что позвали. Увидимся на льду.",
        en: "Thanks for calling me in. See you on the ice.",
      },
      {
        ru: "Хороший разговор. Пойду работать.",
        en: "Good talk. I'm off to work.",
      },
    ],
    neutral: [
      { ru: "Ладно. Посмотрим.", en: "Okay. We'll see." },
      {
        ru: "Хорошо. Мне нужно время, чтобы всё обдумать.",
        en: "All right. I need some time to think it all over.",
      },
    ],
    negative: [
      {
        ru: "*молча кивает и выходит* Как скажете.",
        en: "*nods without a word and leaves* Whatever you say.",
      },
      { ru: "Да. Давайте закончим.", en: "Yeah. Let's end it here." },
    ],
  },
};

export const OUTCOME_SUMMARIES: Record<ConversationMood, L[]> = {
  positive: [
    {
      ru: "Игрок уходит заряженным: отношения укрепились, задача понятна.",
      en: "He leaves fired up: the relationship is stronger and the task is clear.",
    },
    {
      ru: "Разговор сработал — игрок чувствует доверие штаба.",
      en: "The talk worked — he feels the staff's trust.",
    },
    {
      ru: "Хорошая встреча. Игрок вышел из кабинета с прямой спиной.",
      en: "A good meeting. He walked out of the office standing taller.",
    },
  ],
  neutral: [
    {
      ru: "Без драмы, но и без прорыва. Игрок ждёт действий, а не слов.",
      en: "No drama, no breakthrough. He's waiting for actions, not words.",
    },
    {
      ru: "Игрок принял позицию клуба к сведению, но вопросы остались.",
      en: "He has taken the club's position on board, but questions remain.",
    },
  ],
  negative: [
    {
      ru: "Разговор пошёл не так: игрок раздражён и закрылся.",
      en: "The meeting went wrong: he's frustrated and has shut down.",
    },
    {
      ru: "Напряжение выросло — этот разговор ещё аукнется в раздевалке.",
      en: "Tension has risen — this one may echo around the dressing room.",
    },
  ],
};

export const OUTCOME_NOTES = {
  promise: {
    ru: "Вы дали обещание — игрок будет ждать его выполнения.",
    en: "You made a promise — he will expect you to keep it.",
  },
  target: {
    ru: "Цель поставлена — игрок знает, по какой планке его будут оценивать.",
    en: "A target is set — he knows the bar he'll be measured against.",
  },
  ultimatum: {
    ru: "После ультиматума отношения будет трудно восстановить.",
    en: "After an ultimatum, the relationship will be hard to repair.",
  },
  abrupt: {
    ru: "Вы прервали встречу на полуслове.",
    en: "You cut the meeting short.",
  },
} satisfies Record<string, L>;

export { lc, uc };
