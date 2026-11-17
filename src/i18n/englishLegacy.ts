/**
 * English for Russian text that older saves stored before the engine wrote
 * messages in the career language (see src/engine/text.ts), plus engine
 * strings that are rendered without access to the career (thrown errors,
 * static labels). The first block mirrors the engine's tx(…)/t(…) pairs.
 */
import { SPECIAL_TEAM_LABELS, SPECIAL_TEAM_LABELS_EN } from "../engine/tactics";
import type { SpecialTeamsSituation } from "../engine/types";
import { AWARDS } from "../engine/awards";

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const awardPatterns: [RegExp, string][] = Object.values(AWARDS).flatMap(
  (award) => [
    [
      new RegExp(
        `^${escape(award.aboutRu)} сезона (\\d{4}/\\d{2}): (.+?)\\. Признание поднимает настроение раздевалки\\.$`,
      ),
      `${award.aboutEn} of the $1 season: $2. The recognition lifts the mood in the room.`,
    ],
    [
      new RegExp(
        `^${escape(award.ru)}: (.+?) — ${escape(award.aboutRu.toLowerCase())}\\.$`,
      ),
      `${award.en}: $1 — ${award.aboutEn.toLowerCase()}.`,
    ],
  ],
);

export const englishLegacy: Record<string, string> = {
  ...Object.fromEntries(
    (Object.keys(SPECIAL_TEAM_LABELS) as SpecialTeamsSituation[]).map((key) => [
      SPECIAL_TEAM_LABELS[key],
      SPECIAL_TEAM_LABELS_EN[key],
    ]),
  ),
  // Errors thrown by engine helpers that do not know the career language.
  "Игрок недоступен": "Player unavailable",
  "Игрок уже назначен в эту спецбригаду":
    "The player is already assigned to this unit",
  "Неподдерживаемое или повреждённое сохранение":
    "Unsupported or corrupted save",
  "Неполные данные лиги": "Incomplete league data",
  "Неверные данные клуба": "Invalid club data",
  "Неверные данные игрока": "Invalid player data",
  "Неверные звенья": "Invalid lines",
  "Неверный календарь": "Invalid calendar",
  // UI hint and fan-mood notes written by press/match screens.
  "Перетащите игрока на позицию или нажмите на фамилию. Занятые игроки меняются местами.":
    "Drag a player onto a position or click a name. Occupied spots swap players.",
  "GM пропустил предматчевые медиа-обязательства":
    "The GM skipped the pre-game media obligations",
  "Пресс-конференция GM": "GM press conference",
  "Предматчевая пресса": "Pre-game media",
  "Создана новая карьера. Составы NHL/AHL/OHL, реальные контракты и текущий лазарет 2026/27 синхронизированы с публичными источниками.":
    "New career created. NHL/AHL/OHL rosters, real contracts and the current 2026/27 injury list are synced from public sources.",
  "Карьера обновлена: личности, эмблемы и статистическая модель рейтингов синхронизированы со снимком NHL 2026/27; контракты и результаты сохранены.":
    "Career updated: identities, logos and the statistical rating model are synced with the NHL 2026/27 snapshot; contracts and results are kept.",
  "Старт сезона": "Season start",
  "Победа в принципиальном матче": "Rivalry win",
  "Победа команды": "Team win",
  "Поражение в принципиальном матче": "Rivalry loss",
  "Поражение команды": "Team loss",
  "победа укрепила поддержку клуба": "the win strengthened fan support",
  "поражение немного разочаровало фанатов":
    "the loss left the fans a little disappointed",
  "Выиграть принципиальное противостояние": "Win the rivalry",
  "Нужно 4 очка международного скаутинга":
    "You need 4 international scouting points",
  "Права NHL принадлежат другой организации — прямые переговоры запрещены":
    "Another organization holds his NHL rights — direct negotiations are not allowed",
  "Сначала доведите международный скаутинг минимум до 40%":
    "Raise international scouting to at least 40% first",
  "Сначала установите контакт с агентом": "Contact the agent first",
  "Некорректный AAV": "Invalid AAV",
  "Первый контракт иностранного новичка ограничен 1–3 годами":
    "A foreign rookie's first contract is limited to 1–3 years",
  "Подписной бонус должен быть от 0 до одного AAV":
    "The signing bonus must be between 0 and one AAV",
  "Предложение превышает потолок зарплат": "The offer exceeds the salary cap",
  "Контракт принят после проверки трансферных документов.":
    "Contract accepted after the transfer documents were checked.",
  "Игрок выбрал другой вариант: предложение не компенсировало роль, риск адаптации и конкуренцию.":
    "The player chose another option: the offer did not make up for the role, adaptation risk and competition.",
  "Утвердите стратегию франшизы": "Approve the franchise strategy",
  "Владелец ждёт выбранное направление развития клуба на сезон.":
    "The owner is waiting for the club's chosen direction for the season.",
  "Назначьте капитана и двух ассистентов": "Name a captain and two alternates",
  "Тренерский штаб подготовил рейтинг лидеров. Решение повлияет на атмосферу и обсуждение целей сезона.":
    "The coaching staff has ranked the leaders. The decision will shape the room and the discussion of season goals.",
  "Проверьте состав и варианты замены из AHL.":
    "Review the lineup and AHL replacement options.",
  "Финансовый отдел подготовил список соглашений, истекающих после сезона.":
    "The finance department has listed the contracts expiring after the season.",
  "До продолжения сезона совет директоров требует выбрать уровень спортивных амбиций и принять задачи.":
    "Before the season continues, the board requires you to set the level of ambition and accept the objectives.",
  "Праздничный мораторий на сделки": "Holiday trade freeze",
  "Торговая активность лиги временно приостановлена.":
    "League trading activity is temporarily suspended.",
  "Trade Deadline — финальный день": "Trade Deadline — final day",
  "Последняя возможность усилить состав или обменять активы перед плей-офф.":
    "Last chance to strengthen the roster or move assets before the playoffs.",
  "Финиш регулярного чемпионата": "Regular season finish",
  "Клубы подводят итоги и готовятся к плей-офф.":
    "Clubs take stock and prepare for the playoffs.",
  "Руководство скорректировало конкурентное окно после анализа результатов, возраста и активов.":
    "Management adjusted its competitive window after reviewing results, age and assets.",
  "Оба клуба сохранили допустимую зарплатную ведомость.":
    "Both clubs remain cap compliant.",
  "Результат не влияет на таблицу. Используйте матч для проверки сочетаний и тактики.":
    "The result does not count in the standings. Use the game to test combinations and tactics.",
  "Результаты, статистика, форма и состояние игроков обновлены.":
    "Results, statistics, form and player condition have been updated.",
  "Рекомендации, оценка активов и приоритеты развития теперь учитывают выбранный курс.":
    "Recommendations, asset valuations and development priorities now follow the chosen direction.",
  "Защитите будущие активы": "Protect future assets",
  "Курс на перестройку повышает приоритет молодых игроков и пиков первых трёх раундов.":
    "The rebuild raises the priority of young players and picks from the first three rounds.",
  "Конкурентное окно открыто": "The competitive window is open",
  "Ищите усиление верхних звеньев, сохраняя достаточно места под потолком к дедлайну.":
    "Look to upgrade the top lines while keeping enough cap space for the deadline.",
  "Недостаточная глубина в центре": "Not enough depth at center",
  "Опасно мало места под потолком": "Dangerously low cap space",
  "сильный сезон": "strong season",
  "слабый сезон": "weak season",
  "стабильный сезон": "steady season",
  "без серьёзного влияния травм": "no significant injury impact",
  "Игрок имеет только контракт AHL — сначала подпишите NHL/ELC соглашение":
    "The player only has an AHL contract — sign an NHL/ELC deal first",
  "Регулярный сезон завершён. Начинается плей-офф.":
    "The regular season is over. The playoffs begin.",
  "Стратегия на этот сезон уже утверждена":
    "The strategy for this season has already been approved",
  "Капитан уже использовал единственную возможность пересмотра":
    "The captain has already used the one chance to revisit the strategy",
  "Выберите другой клуб": "Select another club",
  "Некорректные активы": "Invalid assets",
  "Права на драфт-пик изменились": "Draft-pick ownership changed",
  "Игрок больше не принадлежит клубу": "Player ownership changed",
  "Недостаточно игроков по позициям": "Invalid roster balance",
  "Превышен потолок зарплат": "Salary cap exceeded",
  "Клуб согласен": "Club accepts",
  "Клуб требует больше ценности": "Club wants more value",
};

export const englishLegacyPatterns: [RegExp, string][] = [
  ...awardPatterns,
  [/^Недостаточно здоровых игроков: (.+?)$/, "Not enough healthy players: $1"],
  [/^(.+?) меняет курс: (.+?)$/, "$1 changes direction: $2"],
  [/^Стратегия клуба утверждена: (.+?)$/, "Club strategy approved: $1"],
  [
    /^Оценка генерального менеджера (.+?): (.+?), доверие (.+?)%\.$/,
    "$1 general manager review: $2, confidence $3%.",
  ],
  [
    /^(.+?): победа укрепила поддержку клуба\.$/,
    "$1: the win strengthened fan support.",
  ],
  [
    /^(.+?): поражение немного разочаровало фанатов\.$/,
    "$1: the loss left the fans a little disappointed.",
  ],
  [/^(.+?) получает (.+? Trophy)$/, "$1 wins the $2"],
  [
    /^Раздевалка отреагировала на спорное назначение капитана (.+?)\.$/,
    "The room reacted to the controversial choice of $1 as captain.",
  ],
  [
    /^Спорное назначение: (.+?) стал капитаном, лидеры (.+?) требуют объяснений\.$/,
    "Controversial pick: $1 is captain and the $2 leaders want an explanation.",
  ],
  [/^(.+?) назначен капитаном (.+?)\.$/, "$1 named captain of the $2."],
  [
    /^Обновлены рейтинги (.+?) игроков\. McDavid — 97 OVR; Carolina — 92 OVR \/ #1\.$/,
    "Ratings updated for $1 players. McDavid — 97 OVR; Carolina — 92 OVR / #1.",
  ],
  [
    /^Проверенные контракты PuckPedia применены: (.+?) игроков; остальные контракты помечены как игровые\.$/,
    "Verified PuckPedia contracts applied: $1 players; the remaining contracts are marked as game-generated.",
  ],
  [
    /^Лазарет PuckPedia обновлён: (.+?) игроков NHL с реальными ожидаемыми датами возвращения\.$/,
    "PuckPedia injury list updated: $1 NHL players with real expected return dates.",
  ],
  [
    /^Подключены официальные составы AHL и OHL 2026\/27: (.+?) новых игроков фарма и (.+?) юниоров\.$/,
    "Official 2026/27 AHL and OHL rosters connected: $1 new farm players and $2 juniors.",
  ],
  [/^Скаутское задание: (.+?)\.$/, "Scouting assignment: $1."],
  [
    /^Драфт (.+?) открыт\. Лотерея: (.+?)\.$/,
    "The $1 draft is open. Lottery: $2.",
  ],
  [/^Драфт (.+?) завершён\.$/, "The $1 draft is complete."],
  [
    /^(.+?): средняя сила ротации (.+?) OVR$/,
    "$1: average rotation strength $2 OVR",
  ],
  [
    /^Добиться победы минимум в двух матчах: (.+?)\.$/,
    "Win at least two games against: $1.",
  ],
  [
    /^Международный отчёт обновлён: (.+?), уверенность (.+?)%\.$/,
    "International report updated: $1, confidence $2%.",
  ],
  [
    /^(.+?) получил разрешение агента на переговоры с (.+?)\.$/,
    "$1 received the agent's permission to negotiate with $2.",
  ],
  [
    /^Агент изучает предложение\. Решение после тура (.+?)\.$/,
    "The agent is reviewing the offer. Decision after round $1.",
  ],
  [
    /^(.+?) направил официальное предложение (.+?)\.$/,
    "$1 sent an official offer to $2.",
  ],
  [
    /^(.+?): международный контракт подписан — (.+?), (.+?) г\. \/ \$(.+?)M AAV\.$/,
    "$1: international contract signed — $2, $3 yr / $$$4M AAV.",
  ],
  [
    /^Контрпредложение агента: минимум \$(.+?)M, роль (.+?), бонус и план адаптации\.$/,
    "Agent's counteroffer: at least $$$1M, a $2 role, a bonus and an adaptation plan.",
  ],
  [
    /^(.+?): агент вернулся с контрпредложением\.$/,
    "$1: the agent came back with a counteroffer.",
  ],
  [/^(.+?) отклонил предложение (.+?)\.$/, "$1 rejected the $2 offer."],
  [
    /^(.+?): 240 новых игроков; (.+?) завершили карьеру\.$/,
    "$1: 240 new players; $2 retired.",
  ],
  [/^Медицинский отчёт: недоступны (.+?)$/, "Medical report: $1 unavailable"],
  [/^(.+?) контрактов требуют планирования$/, "$1 contracts require planning"],
  [/^(.+?) продлил контракт с (.+?)$/, "$1 extended $2"],
  [
    /^(.+?) года, \$(.+?)M за сезон\. Решение принято с учётом роли и потолка зарплат\.$/,
    "$1 years, $$$2M per season. The decision reflects role and cap considerations.",
  ],
  [
    /^(.+?) получает (.+?); (.+?) получает (.+?)$/,
    "$1 acquire $2; $3 acquire $4",
  ],
  [/^Сделка между (.+?) и (.+?)$/, "Trade between $1 and $2"],
  [/^Предсезонный матч: (.+?) @ (.+?)$/, "Preseason game: $1 @ $2"],
  [/^Игровой день (.+?) завершён$/, "Game day $1 completed"],
  [
    /^Доступны (.+?) здоровых центров; для четырёх звеньев нужен ещё один вариант\.$/,
    "$1 healthy centers are available; another option is needed for four lines.",
  ],
  [/^Риск потери ключевых игроков: (.+?)$/, "Risk of losing key players: $1"],
  [
    /^Свободно \$(.+?)M\. Любое усиление потребует расчистить ведомость\.$/,
    "$$$1M available. Any addition will require clearing payroll.",
  ],
  [/^травмы (.+?)$/, "injuries $1"],
  [/^(.+?) — обладатель Кубка Стэнли (.+?)\.$/, "$1 win the $2 Stanley Cup."],
  [
    /^Начинается сезон (.+?)\/(.+?)\. Истёкшие контракты завершены; минимальные составы укомплектованы автоматически\.$/,
    "The $1/$2 season begins. Expired contracts have ended; minimum rosters were filled automatically.",
  ],
  [
    /^Совет директоров уволил генерального менеджера (.+?): доверие (.+?)%\.$/,
    "The board fired the $1 general manager: confidence $2%.",
  ],
  [
    /^Из-за принципиального соперничества (.+?) клуб требует серьёзную переплату$/,
    "Because of the $1 rivalry, the club demands a significant premium",
  ],
];
