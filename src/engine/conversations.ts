import { clamp } from "./random";
import type { Game, Player } from "./types";
import { syncMoraleBonus } from "./franchiseWorld";

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

export const CONVERSATION_TOPICS: Record<
  ConversationTopic,
  { ru: string; en: string }
> = {
  role: { ru: "Роль в команде", en: "Team role" },
  form: { ru: "Текущая форма", en: "Current form" },
  contract: { ru: "Контракт", en: "Contract" },
  development: { ru: "Развитие", en: "Development" },
  "ice-time": { ru: "Игровое время", en: "Ice time" },
  morale: { ru: "Настроение", en: "Morale" },
  injury: { ru: "Травма и восстановление", en: "Injury recovery" },
  future: { ru: "Будущее в клубе", en: "Future with the club" },
};

export const CONVERSATION_TONES: Record<
  ConversationTone,
  { ru: string; en: string }
> = {
  supportive: { ru: "Поддержать", en: "Supportive" },
  calm: { ru: "Спокойно объяснить", en: "Calm" },
  direct: { ru: "Сказать прямо", en: "Direct" },
  demanding: { ru: "Потребовать результата", en: "Demanding" },
  challenge: { ru: "Бросить вызов", en: "Challenge" },
  promise: { ru: "Дать обещание", en: "Make a promise" },
};

const managerLines: Record<
  ConversationTopic,
  Record<ConversationTone, string>
> = {
  form: {
    supportive:
      "Я вижу, что сейчас шайба не идёт в ворота. Мы не потеряли в тебя веру и хотим помочь вернуть уверенность.",
    calm: "Давай спокойно разберём последние матчи и поймём, где можно упростить твою игру.",
    direct:
      "Твоя текущая форма ниже уровня, которого мы от тебя ожидаем. Нам нужна реакция.",
    demanding:
      "Команде нужен результат уже сейчас. В следующих матчах ты должен заметно прибавить.",
    challenge:
      "Докажи, что этот спад — случайность. Я жду от тебя лидерского отрезка.",
    promise:
      "Я сохраню тебе место в звене на ближайший отрезок, если ты ответишь качественной игрой.",
  },
  role: {
    supportive:
      "Твоя работа не всегда попадает в протокол, но штаб ценит вклад, который ты даёшь команде.",
    calm: "Хочу объяснить, какую роль мы видим для тебя и почему она сейчас важна.",
    direct:
      "На данный момент ты не входишь в ведущую группу. Место придётся вернуть своей игрой.",
    demanding:
      "Чтобы получить большую роль, ты должен выигрывать конкуренцию каждый день.",
    challenge:
      "У тебя есть качества для следующего шага. Покажи, что ты готов к большей ответственности.",
    promise: "Если сохранишь этот уровень, мы попробуем тебя выше по составу.",
  },
  contract: {
    supportive:
      "Мы ценим тебя как часть клуба и хотим, чтобы переговоры проходили с уважением к обеим сторонам.",
    calm: "Давай честно сверим ожидания по сроку, роли и деньгам до официального предложения.",
    direct:
      "Наш бюджет ограничен. Текущие требования выше той роли, которую мы можем гарантировать.",
    demanding:
      "Если ты хочешь долгосрочный контракт, нам нужна стабильность на льду уже сейчас.",
    challenge:
      "Сильный остаток сезона может изменить твою позицию на переговорах. Всё в твоих руках.",
    promise:
      "Если договоримся по роли, я лично добьюсь от клуба серьёзного предложения.",
  },
  development: {
    supportive:
      "Прогресс идёт не по прямой. Мы видим твою работу и продолжим вкладываться в развитие.",
    calm: "У нас есть конкретный план по навыкам и нагрузке. Давай пройдём его по пунктам.",
    direct: "Темп развития отстаёт от плана. Нужно изменить ежедневную работу.",
    demanding:
      "Одного потенциала недостаточно. Жду профессионального отношения на каждой тренировке.",
    challenge:
      "Следующий уровень уже рядом. Сделай так, чтобы штаб не мог оставить тебя вне состава.",
    promise:
      "Выполни план развития — и мы дадим тебе шанс в более сильном звене.",
  },
  "ice-time": {
    supportive:
      "Я понимаю, что ты хочешь играть больше. Сейчас главное — использовать каждую смену максимально.",
    calm: "Твоё время определяется формой, спецбригадами и балансом звеньев. Объясню решение штаба.",
    direct:
      "Сейчас другие игроки заслужили больше минут. Ситуацию можно изменить только на льду.",
    demanding:
      "Хочешь больше минут — выиграй дуэли, сократи ошибки и заставь тренера доверять тебе.",
    challenge:
      "Я дам тебе возможность против сильного соперника. Покажи, что готов к нагрузке.",
    promise: "При стабильной игре мы увеличим твоё время в ближайших матчах.",
  },
  morale: {
    supportive:
      "Ты не обязан справляться со всем один. Скажи, что мешает тебе чувствовать себя частью команды.",
    calm: "Я заметил, что ты выглядишь отстранённо. Хочу понять причины без давления.",
    direct:
      "Твоё настроение начинает влиять на раздевалку. Нам нужно решить проблему.",
    demanding:
      "Личные сложности не должны разрушать команду. Я жду профессиональной реакции.",
    challenge:
      "Стань тем, кто меняет атмосферу, а не зависит от неё. Команде это нужно.",
    promise:
      "Мы пересмотрим ситуацию вокруг тебя, если ты снова включишься в работу команды.",
  },
  injury: {
    supportive:
      "Не торопись возвращаться раньше времени. Клуб поддержит тебя на каждом этапе восстановления.",
    calm: "Медицинский штаб подготовил план. Давай сверим сроки и твоё самочувствие.",
    direct:
      "Мы не выпустим тебя без полного допуска, даже если ты считаешь себя готовым.",
    demanding:
      "Соблюдай программу восстановления полностью — никаких самовольных ускорений.",
    challenge:
      "Используй этот период, чтобы вернуться физически и психологически сильнее.",
    promise: "После допуска мы дадим тебе время спокойно вернуть игровой ритм.",
  },
  future: {
    supportive:
      "Ты важен для этой организации, и я хочу, чтобы ты понимал своё место в нашем будущем.",
    calm: "Давай открыто поговорим о том, как клуб видит следующие сезоны и твою роль.",
    direct:
      "Сейчас мы не можем гарантировать тебе место в долгосрочном ядре команды.",
    demanding:
      "Чтобы остаться частью проекта, ты должен доказать ценность до конца сезона.",
    challenge:
      "У тебя есть шанс изменить планы клуба. Покажи, что строить команду нужно и вокруг тебя.",
    promise:
      "Если сохранишь уровень и отношение, я не буду искать тебе замену на рынке.",
  },
};

const genericResponses = {
  positive: [
    "Спасибо, что сказали это лично. Я понимаю, чего вы ждёте, и готов ответить работой.",
    "Это честный разговор. Такой план мне подходит — теперь нужно подтвердить всё на льду.",
    "Я ценю доверие. Постараюсь сделать так, чтобы у штаба не осталось сомнений.",
  ],
  neutral: [
    "Я услышал вашу позицию. Мне нужно немного времени, чтобы всё обдумать.",
    "Не со всем согласен, но понимаю логику клуба. Посмотрим, как будет развиваться ситуация.",
    "Хорошо. Я приму это к сведению, хотя ожидал немного другого разговора.",
  ],
  negative: [
    "Мне не нравится, как со мной сейчас разговаривают. Это не помогает решить проблему.",
    "Я не согласен с такой оценкой. Похоже, клуб и я видим ситуацию совершенно по-разному.",
    "Это только добавляет давления. После такого разговора вопросов у меня стало больше.",
  ],
};

const topicResponseAdditions: Partial<
  Record<ConversationTopic, Record<"positive" | "neutral" | "negative", string>>
> = {
  contract: {
    positive:
      " Надеюсь, агент и клуб смогут быстро найти справедливые условия.",
    neutral: " Пусть мой агент продолжит обсуждение цифр с клубом.",
    negative: " В таком случае мы будем рассматривать и другие варианты.",
  },
  injury: {
    positive:
      " Я буду следовать плану врачей и не стану форсировать возвращение.",
    neutral: " Сначала хочу ещё раз поговорить с медицинским штабом.",
    negative:
      " Мне кажется, клуб не слышит, как я сам оцениваю своё состояние.",
  },
  "ice-time": {
    positive: " Я заработаю дополнительные минуты своей игрой.",
    neutral: " Надеюсь, решения по составу действительно будут честными.",
    negative:
      " Если роль не изменится, нам придётся вернуться к этому разговору.",
  },
};

function hash(value: string) {
  let result = 0;
  for (const char of value)
    result = Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0;
  return result;
}

export function conversationOptions(topic: ConversationTopic) {
  return (Object.keys(CONVERSATION_TONES) as ConversationTone[]).map(
    (tone) => ({ tone, line: managerLines[topic][tone] }),
  );
}

export function playerConcerns(player: Player) {
  const concerns: string[] = [];
  if (player.morale < 55) concerns.push("низкая мораль");
  if ((player.performanceForm ?? 0) < -15) concerns.push("плохая форма");
  if (player.years <= 1) concerns.push("истекающий контракт");
  if (player.injury > 0) concerns.push("восстановление после травмы");
  if (player.fatigue >= 25) concerns.push("высокая нагрузка");
  if ((player.relationship ?? 50) < 40)
    concerns.push("напряжённые отношения с руководством");
  return concerns.length ? concerns : ["серьёзных проблем нет"];
}

export function talkToPlayer(
  game: Game,
  playerId: string,
  topic: ConversationTopic,
  tone: ConversationTone,
) {
  const player = game.teams
    .flatMap((t) => [...t.players, ...(t.farm ?? []), ...(t.prospects ?? [])])
    .find((p) => p.id === playerId);
  if (!player) throw Error("Player unavailable");
  if (player.lastConversationRound === game.round)
    throw Error("С этим игроком уже говорили в текущем туре");
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
  const outcome =
    relationship + fit >= 58
      ? "positive"
      : relationship + fit >= 42
        ? "neutral"
        : "negative";
  const moraleDelta =
    outcome === "positive"
      ? tone === "supportive" || tone === "promise"
        ? 6
        : 3
      : outcome === "neutral"
        ? 0
        : -6;
  const relationshipDelta =
    outcome === "positive" ? 4 : outcome === "neutral" ? 1 : -7;
  const motivationDelta =
    outcome === "positive"
      ? tone === "challenge" || tone === "demanding"
        ? 9
        : 5
      : outcome === "neutral"
        ? 1
        : -8;
  const managerLine = managerLines[topic][tone];
  const variants = genericResponses[outcome];
  const response = `${variants[hash(`${player.id}:${game.year}:${game.round}:${topic}:${tone}`) % variants.length]}${topicResponseAdditions[topic]?.[outcome] ?? ""}`;
  player.morale = clamp(player.morale + moraleDelta, 20, 100);
  player.relationship = clamp(relationship + relationshipDelta, 0, 100);
  player.motivation = clamp(
    (player.motivation ?? 50) + motivationDelta,
    0,
    100,
  );
  syncMoraleBonus(player);
  player.lastConversationRound = game.round;
  (player.conversationHistory ??= []).unshift({
    year: game.year,
    round: game.round,
    topic,
    tone,
    managerLine,
    response,
    outcome,
    moraleDelta,
    relationshipDelta,
    motivationDelta,
  });
  player.conversationHistory = player.conversationHistory.slice(0, 30);
  game.news.unshift(`${player.name}: ${response}`);
  return {
    managerLine,
    response,
    outcome,
    moraleDelta,
    relationshipDelta,
    motivationDelta,
  };
}
