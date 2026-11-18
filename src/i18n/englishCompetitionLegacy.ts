/**
 * English for preseason-camp and international-tournament messages stored
 * in Russian (careers switched from Russian to English). Each entry mirrors
 * one t(ru, en) pair in src/engine/preseason.ts or src/engine/tournaments.ts.
 */
type Replacement = string | ((match: string, ...groups: string[]) => string);

const nations: Record<string, string> = {
  Канада: "Canada",
  США: "USA",
  Швеция: "Sweden",
  Финляндия: "Finland",
  Россия: "Russia",
  Чехия: "Czechia",
  Швейцария: "Switzerland",
  Германия: "Germany",
  Словакия: "Slovakia",
  Латвия: "Latvia",
  Дания: "Denmark",
  Норвегия: "Norway",
};
const cities: Record<string, string> = {
  Квебек: "Quebec City",
  Саскатун: "Saskatoon",
  Гамильтон: "Hamilton",
  Галифакс: "Halifax",
  Хартфорд: "Hartford",
  "Канзас-Сити": "Kansas City",
  Портленд: "Portland",
  Милан: "Milan",
  Прага: "Prague",
  Хельсинки: "Helsinki",
  Калгари: "Calgary",
  Стокгольм: "Stockholm",
  Цюрих: "Zurich",
  Рига: "Riga",
  Братислава: "Bratislava",
  Копенгаген: "Copenhagen",
};
const events: Record<string, string> = {
  "Зимний Кубок наций": "Winter Nations Cup",
  "зимний кубок наций": "Winter Nations Cup",
  "Чемпионат мира": "World Championship",
  "чемпионат мира": "World Championship",
};
const medals: Record<string, string> = {
  золото: "gold",
  серебро: "silver",
  бронза: "bronze",
};
const nation = (value: string) => nations[value] ?? value;
const city = (value: string) => cities[value] ?? value;
const event = (value: string) => events[value] ?? value;
const EVENT = "(Зимний Кубок наций|Чемпионат мира)";
const NATION = "([А-ЯЁа-яё ]+?)";

/** "Name (Канада), Name (США)" → English nation names. */
const nationList = (list: string) =>
  list.replace(/\(([А-ЯЁа-яё ]+)\)/g, (_, n) => `(${nation(n)})`);

export const englishCompetitionLegacy: Record<string, string> = {
  "Лагерь: первая волна сокращений": "Camp: first round of cuts",
  "Все приглашённые остаются в лагере до финальных сокращений.":
    "Every invitee stays in camp until the final cuts.",
  "Финальные сокращения: состав на старт сезона":
    "Final cuts: opening-night roster set",
  "Ветераны удержали свои места. Приглашённые игроки вернулись в фарм-клуб и юниоры.":
    "The veterans kept their spots. The invitees went back to the farm and junior teams.",
  "Тренировочный лагерь открыт": "Training camp is open",
  "Трофей предсезонья: Кубок Лейкшор": "Preseason silverware: Lakeshore Cup",
  "Кубок Лейкшор": "Lakeshore Cup",
  "Чемпионат мира стартует": "The World Championship begins",
};

export const englishCompetitionLegacyPatterns: [RegExp, Replacement][] = [
  [
    /^Штаб отправил вниз: (.+)\. Борьба за места продолжается\.$/,
    "The staff sent down: $1. The battle for spots continues.",
  ],
  [
    /^Место в составе заработали: (.+)\. В AHL отправлены: (.+)\.$/,
    "Earned a roster spot: $1. Assigned to the AHL: $2.",
  ],
  [
    /^Финальные сокращения: в состав — (.+); в AHL — (.+)\.$/,
    "Final cuts: $1 make the team; $2 assigned to the AHL.",
  ],
  [/^Кубок Лейкшор: (\w+) в финале против (\w+)$/, "Lakeshore Cup: $1 reach the final against $2"],
  [/^Кубок Лейкшор: матч за 3-е место против (\w+)$/, "Lakeshore Cup: third-place game against $1"],
  [/^Кубок Лейкшор: победа (\w+)$/, "Lakeshore Cup: $1 take the trophy"],
  [/^(\w+) выиграли Кубок Лейкшор!$/, "$1 win the Lakeshore Cup!"],
  [/^Кубок Лейкшор: (\w+) (\d+):(\d+) (\w+)$/, "Lakeshore Cup: $1 $2-$3 $4"],
  [/^Группа завершена: (.+)\.$/, "Group stage over: $1."],
  [
    /^Финал: (.+?)\. Раздевалка получила заряд перед сезоном, болельщики довольны\.$/,
    "Final: $1. A boost for the dressing room before the season, and the fans are pleased.",
  ],
  [
    /^Финал: (.+?)\. (\w+) — (\d)-е место\. На таблицу NHL турнир не влияет\.$/,
    (_, score, team, place) =>
      `Final: ${score}. ${team} finish ${["", "1st", "2nd", "3rd", "4th"][Number(place)]}. The cup has no effect on the NHL standings.`,
  ],
  [
    /^(\d+) игроков борются за (\d+) последних мест \((\d+) нап\., (\d+) защ\.\)\. Кубок Лейкшор: 26–30 сентября, (.+)\.$/,
    (_, n, spots, f, d, host) =>
      `${n} players battle for the last ${spots} spots (${f} F, ${d} D). Lakeshore Cup: Sept 26–30 in ${city(host)}.`,
  ],
  [
    new RegExp(`^${EVENT}: составы сборных объявлены$`),
    (_, e) => `${event(e)}: national team rosters announced`,
  ],
  [
    /^(\d+) сборных, (зимний кубок наций|чемпионат мира) пройдёт в городе (.+?) с (\d\d)\.(\d\d)\. Фаворит по составу — (.+)\.$/,
    (_, n, e, host, day, month, fav) =>
      `${n} nations; the ${event(e)} opens in ${city(host)} on ${month}/${day}. Strongest roster on paper: ${nation(fav)}.`,
  ],
  [
    /^Вызов в сборные: (\d+) игрок\(ов\) (\w+)$/,
    (_, n, team) => `National team call-ups: ${n} ${team} player${n === "1" ? "" : "s"}`,
  ],
  [
    /^(.+)\. Риск травм и усталости ложится на клуб\.$/,
    (_, list) => `${nationList(list)}. The club carries the injury and fatigue risk.`,
  ],
  [
    /^(.+)\. Сезон для них продолжится в сборной\.$/,
    (_, list) => `${nationList(list)}. Their season continues with the national team.`,
  ],
  [/^NHL уходит на паузу: Зимний Кубок наций$/, "NHL break: the Winter Nations Cup begins"],
  [
    /^Игры NHL возобновятся через (\d+) дней\. Клубы без игроков в сборных тренируются по своему плану\.$/,
    "NHL games resume in $1 days. Clubs train on their own plan in the meantime.",
  ],
  [
    /^(\d+) сборных в городе (.+?)\. Игроки клубов, выбывших из плей-офф, получили шанс на медаль\.$/,
    (_, n, host) =>
      `${n} nations in ${city(host)}. Players from clubs out of the playoffs get a shot at a medal.`,
  ],
  [
    new RegExp(`^${EVENT}: ${NATION} — чемпион$`),
    (_, e, n) => `${event(e)}: ${nation(n)} win gold`,
  ],
  [
    new RegExp(`^Финал (.+?)\\. Серебро — ${NATION}, бронза — ${NATION}\\.(?: Лучший бомбардир: (.+?), (\\d+) очк\\.)?$`),
    (_, score, silver, bronze, scorer, pts) =>
      `Final ${score}. Silver: ${nation(silver)}, bronze: ${nation(bronze)}.${scorer ? ` Top scorer: ${scorer}, ${pts} pts.` : ""}`,
  ],
  [
    new RegExp(`^${EVENT}: золото — ${NATION} \\((.+)\\)\\.$`),
    (_, e, n, score) => `${event(e)}: gold for ${nation(n)} (${score}).`,
  ],
  [/^Медали игроков (\w+): (\d+)$/, "$1 medallists: $2"],
  [
    /^(.+)\. Медалисты вернутся в клуб с подъёмом настроения\.$/,
    (_, list) =>
      `${nationList(list).replace(/ — (золото|серебро|бронза)/g, (__, m) => ` — ${medals[m]}`)}. The medallists return to the club in high spirits.`,
  ],
  [/^(.+?) травмирован в сборной$/, "$1 injured on national-team duty"],
  [
    new RegExp(`^${NATION}, ${EVENT}\\. Предварительный срок: (\\d+) дн\\.$`),
    (_, n, e, days) => `${nation(n)}, ${event(e)}. Early estimate: ${days} days.`,
  ],
  [
    new RegExp(`^Травма на турнире «${EVENT}» за сборную\\.$`),
    (_, e) => `Injured with the national team at the ${event(e)}.`,
  ],
];
