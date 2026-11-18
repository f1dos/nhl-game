/**
 * English for inbox messages that older saves stored in Russian (the inbox
 * generator in src/engine/inbox.ts is bilingual at the source today). Each
 * entry mirrors one t(ru, en) pair there.
 */
type Replacement = string | ((match: string, ...groups: string[]) => string);

const ordinal = (value: string) => {
  const n = Number(value);
  return `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
};
const injuryReasons: Record<string, string> = {
  ушиб: "bruise",
  растяжение: "strain",
  перелом: "fracture",
};
const milestoneKinds: Record<string, string> = {
  побед: "wins",
  очков: "points",
  голов: "goals",
};

export const englishInboxLegacy: Record<string, string> = {
  "Совет директоров: последнее предупреждение": "Board: final warning",
  "Совет директоров недоволен результатами": "Board concerned about results",
  "Пресса восхищается формой команды, ожидания болельщиков растут.":
    "The media are raving about the team's form and fan expectations are rising.",
  "Пресса требует перемен, владелец просит объяснений. Выступите перед журналистами и примите решения по составу.":
    "The press is calling for changes and the owner wants answers. Face the media and make roster decisions.",
  "Журналисты спрашивают о кризисе, болельщики теряют терпение. Пресс-конференция поможет снять давление с команды.":
    "Reporters are asking about a crisis and the fans are losing patience. A press conference can take pressure off the players.",
};

export const englishInboxLegacyPatterns: [RegExp, Replacement][] = [
  [/^Травма: (.+?) выбывает$/, "Injury: $1 ruled out"],
  [
    /^(.+?) \((\w+), OVR (\d+)\) — (.+?)\. Ориентировочно (\d+) дн\., возвращение около ([\d-]+)\.( Это ключевой игрок: перестройте звенья и подумайте о замене из AHL\.)?$/,
    (_, name, pos, ovr, reason, days, back, key) =>
      `${name} (${pos}, OVR ${ovr}) — ${injuryReasons[reason] ?? reason}. Expected out about ${days} days, return around ${back}.${key ? " He is a key player: rework the lines and consider an AHL call-up." : ""}`,
  ],
  [/^(.+?) недоволен игровым временем$/, "$1 unhappy with his ice time"],
  [/^(.+?) подавлен — нужен разговор$/, "$1 is low — a talk is needed"],
  [
    /^Агент сообщает: (.+?) \((\d+)-й по рейтингу в своей группе\) получает лишь ([\d.]+) мин\. за матч, мораль (\d+)\. Он хочет большую роль — поговорите с игроком или пересмотрите звенья\.$/,
    "His agent reports that $1 (ranked #$2 in his position group) is only getting $3 min a night, morale $4. He wants a bigger role — talk to him or rethink the lines.",
  ],
  [
    /^Тренерский штаб обеспокоен: мораль (.+?) упала до (\d+)\. Лидер с таким настроем тянет раздевалку вниз — проведите личную встречу или дайте ему другую роль\.$/,
    "The coaching staff are worried: $1's morale has dropped to $2. A core player in this mood drags the dressing room down — hold a one-on-one or change his role.",
  ],
  [/^Агент (.+?) просит переговоры$/, "$1's agent requests talks"],
  [
    /^Контракт (.+?) \(OVR (\d+), (.+?)\) истекает после сезона( — игрок станет неограниченно свободным агентом)?\. Агент ориентирует на (.+?) в год и ждёт предложения в течение двух недель\.$/,
    (_, name, ovr, salary, ufa, ask) =>
      `${name} (OVR ${ovr}, ${salary}) is out of contract after this season${ufa ? " and will be an unrestricted free agent" : ""}. His agent is looking for about ${ask} per year and expects an offer within two weeks.`,
  ],
  [
    /^Клуб (\d+)-й в конференции при ожидании топ-(\d+)\. Темп — (\d+) очков за сезон\. Совет ждёт улучшения результатов; пересмотрите состав, тактику или цели\.$/,
    (_, position, expected, pace) =>
      `The club sits ${ordinal(position)} in the conference against an expectation of top ${expected}, on pace for ${pace} points. The board expects improvement — review the roster, tactics or objectives.`,
  ],
  [/^(\S+) интересуется (.+?)$/, "$1 enquire about $2"],
  [
    /^Генеральный менеджер (.+?) ищет усиление на позиции (\w+) и спрашивает о (.+?) \(OVR (\d+), (.+?)\)\. Готовы обсуждать: (.+?)\. Ответьте до ([\d-]+)\.$/,
    (_, club, need, target, ovr, salary, offer, due) =>
      `The ${club} GM is shopping for a ${need} and asked about ${target} (OVR ${ovr}, ${salary}). They would discuss ${offer
        .replace(/^пик 1-го раунда (\d{4})/, "a $1 first-round pick")
        .replace(/ или /, " or ")
        .replace(
          "пакет из перспективных активов",
          "a package of prospects",
        )}. Respond by ${due}.`,
  ],
  [/^(.+?) просится в NHL$/, "$1 pushing for a call-up"],
  [
    /^Штаб фарм-клуба: (.+?) \((\d+) лет, (\w+), OVR (\d+), потенциал (\d+)\) доминирует и уже сильнее (.+?) \(OVR (\d+)\) из состава NHL\. Рассмотрите вызов\.$/,
    "Farm staff report: $1 (age $2, $3, OVR $4, potential $5) is dominating and already rates above $6 (OVR $7) in your NHL lineup. Consider a call-up.",
  ],
  [/^Спад вратаря: (.+?)$/, "Goalie slump: $1"],
  [
    /^За последние 5 матчей (.+?) отражает ([.\d]+) бросков \((\d+) голов с (\d+) бросков\), в сезоне — ([.\d]+)\.(?: Тренер вратарей предлагает дать шанс (.+?) \(OVR (\d+)\)\.)?$/,
    (_, starter, sv, goals, shots, season, backup, backupOvr) =>
      `Over the last five games ${starter} has a ${sv} save percentage (${goals} goals on ${shots} shots) against ${season} for the season.${backup ? ` The goalie coach suggests giving ${backup} (OVR ${backupOvr}) a start.` : ""}`,
  ],
  [
    /^Серия поражений: (\d+) матч(?:а|ей) подряд без побед$/,
    "Losing streak: $1 straight games without a win",
  ],
  [/^Победная серия: (\d+) подряд$/, "Winning streak: $1 in a row"],
  [
    /^(.+?) в шаге от (\d+) (побед|очков|голов)$/,
    (_, name, mark, kind) =>
      `${name} closing in on ${mark} ${milestoneKinds[kind]}`,
  ],
  [
    /^(.+?) осталось (\d+) до отметки (\d+) (побед|очков|голов)\. Отдел по связям с прессой готовит материалы\.$/,
    (_, name, left, mark, kind) =>
      `${name} is ${left} away from ${mark} ${milestoneKinds[kind]}. Media relations are preparing coverage.`,
  ],
  [/^Превышен потолок зарплат на (.+?)$/, "Over the salary cap by $1"],
  [
    /^Платёжная ведомость (.+?) при потолке (.+?)\. Лига потребует соответствия: отправьте контракт в AHL, обменяйте зарплату или переведите травмированного игрока в LTIR\.$/,
    "Payroll is $1 against a $2 cap. The league will demand compliance: assign a contract to the AHL, trade salary or place an injured player on LTIR.",
  ],
  // Player requests (src/engine/playerRequests.ts). Bodies carry a
  // bilingual copy on the event (event.i18n); titles also reach the news feed.
  [/^(.+?) просит больше игрового времени$/, "$1 asks for more ice time"],
  [/^(.+?) просит обмен$/, "$1 requests a trade"],
  [/^(.+?) хочет перейти в контендера$/, "$1 wants a move to a contender"],
  [/^(.+?) просит обмен из-за конкуренции$/, "$1 requests a trade over his role"],
  [/^(.+?) публично требует обмена$/, "$1 goes public with a trade demand"],
  [/^(.+?) хочет обсудить продление$/, "$1 wants to talk about an extension"],
  [/^(.+?) просит не отправлять его в AHL$/, "$1 asks to stay in the NHL"],
  [/^(.+?) хочет вернуться в NHL$/, "$1 wants back in the NHL"],
  [/^(.+?) недоволен понижением$/, "$1 unhappy about his demotion"],
  [/^(.+?) устал сидеть на трибуне$/, "$1 tired of being scratched"],
  [/^(.+?) просит разгрузить его$/, "$1 asks for a lighter load"],
  [/^(.+?) просит наставника$/, "$1 asks for a mentor"],
  [/^(.+?) просит игровую практику$/, "$1 asks for regular games"],
  [/^(.+?) недоволен, что его место занял (.+?)$/, "$1 upset that $2 took his spot"],
  [/^(.+?) просит больше стартов$/, "$1 wants more starts"],
  [/^(.+?) благодарит за доверие$/, "$1 thanks you for the promotion"],
  [/^(.+?): обещание выполнено$/, "$1: promise kept"],
  [/^(.+?): обещание нарушено$/, "$1: promise broken"],
  [/^(.+?) отзывает запрос на обмен$/, "$1 withdraws his trade request"],
];
