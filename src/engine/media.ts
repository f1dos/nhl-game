import { AWARDS } from "./awards";
import type { Game, Result } from "./types";

type Copy = [string, string];
export type Beat = "market" | "analysis" | "interview" | "league";
export interface MediaStory {
  id: string;
  date: string;
  season: number;
  beat: Beat;
  clubs: string[];
  subject: string;
  headline: Copy;
  body: Copy;
  question?: Copy;
  quote?: Copy;
}
type Item = Omit<MediaStory, "id" | "date" | "season">;
const pair = (ru: string, en: string): Copy => [ru, en];
function hash(s: string) {
  let n = 2166136261;
  for (const ch of s) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return n >>> 0;
}
function edition(g: Game, date: string, games: Result[]): MediaStory[] {
  const history = g.mediaArchive ?? [];
  const recent = new Set(
    history
      .filter(
        (x) =>
          x.season === g.year &&
          x.date < date &&
          Date.parse(date) - Date.parse(x.date) <= 14 * 86400000,
      )
      .map((x) => x.subject),
  );
  const fingerprint = (x: Item) =>
    [x.subject, x.body[1], x.quote?.[1]].join("|");
  const printed = new Set(
    history.filter((x) => x.season === g.year).map(fingerprint),
  );
  const pool: Item[] = [];
  const headlines: Item[] = [];
  for (const event of g.events ?? []) {
    if (event.date !== date || !event.publicNewsClubs) continue;
    const prior =
      event.playerId &&
      history.find(
        (x) =>
          x.season === g.year && x.subject === "contract/" + event.playerId,
      );
    const note = prior
      ? pair(
          " О будущем игрока редакция писала " + prior.date + ".",
          " We covered the player's contract outlook on " + prior.date + ".",
        )
      : pair("", "");
    headlines.push({
      subject: "official/" + event.id,
      clubs: event.publicNewsClubs,
      beat: "league",
      headline: pair(
        event.i18n?.title.ru ?? event.title,
        event.i18n?.title.en ?? event.title,
      ),
      body: pair(
        (event.i18n?.body.ru ?? event.body) + note[0],
        (event.i18n?.body.en ?? event.body) + note[1],
      ),
    });
  }
  for (const a of g.awards ?? []) {
    const subject = "award/" + a.key;
    if (
      a.year !== g.year ||
      history.some((x) => x.season === g.year && x.subject === subject)
    )
      continue;
    headlines.push({
      subject,
      clubs: [a.team],
      beat: "league",
      headline: pair(
        a.player + " получает " + AWARDS[a.key].ru,
        a.player + " wins the " + AWARDS[a.key].en,
      ),
      body: pair(
        AWARDS[a.key].aboutRu + " · " + a.team + " · " + a.line,
        AWARDS[a.key].aboutEn + " · " + a.team + " · " + a.line,
      ),
    });
  }
  const add = (story: Item) => {
    if (!recent.has(story.subject) && !printed.has(fingerprint(story)))
      pool.push(story);
  };
  for (const r of games) {
    const w = r.goals[0] > r.goals[1] ? 0 : 1,
      l = 1 - w;
    const win = w === 0 ? r.home : r.away,
      lose = l === 0 ? r.home : r.away;
    const score = r.goals[w] + "–" + r.goals[l],
      clubs = [win, lose];
    const goals = r.events.filter((e) => e.type === "goal" && e.team === win);
    const scorer = goals.at(-1)?.player;
    for (const team of clubs) {
      const counts = new Map<string, number>();
      for (const e of r.events)
        if (e.type === "goal" && e.team === team && e.player)
          counts.set(e.player, (counts.get(e.player) ?? 0) + 1);
      for (const [name, count] of counts)
        if (count >= 3)
          headlines.push({
            clubs,
            beat: "league",
            subject: "hat/" + team + "/" + name + "/" + date,
            headline: pair("Хет-трик: " + name, name + " scores a hat trick"),
            body: pair(
              `В матче ${r.home} — ${r.away} (${r.goals.join("–")}) на счету игрока ${team} шайб: ${count}.`,
              `${name} scored ${count} for ${team} in ${r.home}–${r.away}, a ${r.goals.join("–")} finish.`,
            ),
          });
    }
    const stem = win + "/" + lose + "/" + date;
    if (
      r.xg.length === 2 &&
      r.xg[w] > 0 &&
      r.xg[l] > 0 &&
      Math.abs(r.xg[w] - r.xg[l]) >= 0.1
    ) {
      const againstFlow = r.xg[w] < r.xg[l];
      add({
        clubs,
        beat: "analysis",
        subject: "chances/" + win,
        headline: pair(
          againstFlow
            ? "Почему счёт обманчив для " + win
            : "За счётом " + score + " — качество моментов",
          "Behind the " + score + " scoreline",
        ),
        body: pair(
          `Ожидаемые голы: ${win} — ${r.xg[w].toFixed(2)}, ${lose} — ${r.xg[l].toFixed(2)}. ${againstFlow ? "Я бы пересмотрел смены в своей зоне: результат в пользу победителя, но более опасные броски создал соперник." : "Если соперник будет готовиться только по нарезке голов, он пропустит главное: победитель создал более опасные моменты по игре."}`,
          `Expected goals: ${win} ${r.xg[w].toFixed(2)}, ${lose} ${r.xg[l].toFixed(2)}. ${againstFlow ? "I would revisit the defensive shifts: the winners got the result, but their opponents generated the better chances." : "A coach who watches only the goals will miss the pattern: the winners also generated the more dangerous chances."}`,
        ),
      });
    }
    const saves = r.shots[l] - r.goals[l];
    if (r.goals[l] === 0 || r.shots[l] > r.shots[w])
      add({
        beat: "analysis",
        clubs,
        subject: "goalie/" + win,
        headline: pair(
          win + " удержал ворота под давлением",
          win + " holds the line",
        ),
        body: pair(
          `У ${lose} было ${r.shots[l]} бросков в створ, у ${win} — ${r.shots[w]}. При счёте ${score} важна работа последнего рубежа: ${saves} бросков соперника остались без гола.`,
          `${lose} put ${r.shots[l]} shots on net to ${win}'s ${r.shots[w]}. In a ${score} finish, ${saves} opposing shots stayed out.`,
        ),
      });
    if (r.ppo[w] > 0)
      add({
        beat: "analysis",
        clubs,
        subject: "special/" + win,
        headline: pair(
          "Спецбригады " + win + " под лупой",
          win + " on the man advantage",
        ),
        body: pair(
          `В матче с ${lose} у ${win} было ${r.ppo[w]} попыток большинства. Реализовано: ${r.pp[w]}. ${r.pp[w] ? "Удаления соперника дали атаке дополнительный источник голов." : "Итоговую победу пришлось добывать другими способами."}`,
          `Against ${lose}, ${win} converted ${r.pp[w]} of ${r.ppo[w]} power plays. ${r.pp[w] ? "Penalties gave the attack another route to goal." : "The win had to come from elsewhere."}`,
        ),
      });
    const close = r.ot || r.so || r.goals[w] - r.goals[l] === 1;
    const question = close
      ? pair(
          "Что меняется в смене, когда следующий гол может решить матч?",
          "How does a shift change when the next goal could decide it?",
        )
      : pair(
          "Что заберёте из этого матча в следующую игру?",
          "What carries over into your next game?",
        );
    add({
      beat: "interview",
      clubs,
      subject: "room/" + win,
      headline: pair(
        scorer
          ? scorer + " — о победе над " + lose
          : "В раздевалке " + win + " после финальной сирены",
        scorer
          ? scorer + " on beating " + lose
          : "Inside the " + win + " room after the horn",
      ),
      body: pair(
        `Разговор после матча ${win} — ${lose} (${score}).`,
        `Postgame conversation after ${win} beat ${lose} ${score}.`,
      ),
      question,
      quote: close
        ? hash(stem) % 2
          ? pair(
              "На лавке все считают смены. Хочется остаться ещё на десять секунд, но свежая тройка в такой момент полезнее.",
              "Everyone on the bench is counting shifts. You want ten more seconds, but a fresh line helps more.",
            )
          : pair(
              "Когда счёт такой плотный, сначала смотришь, кто страхует. Потом уже решаешь, лезть под ворота или оставить шайбу партнёру.",
              "In a tight one you look for your cover first. Then you decide whether to drive the net or leave the puck for a teammate.",
            )
        : r.pp[w]
          ? pair(
              "Вернёмся к сменам большинства. Важно понять, где у нас появлялось время на бросок.",
              "We'll revisit the power-play shifts. We want to see where the time to shoot came from.",
            )
          : pair(
              "Хочу посмотреть смены после наших голов. Именно там легче всего потерять концентрацию.",
              "I want to see the shifts after our goals. That's when it's easiest to switch off.",
            ),
    });
  }
  for (const t of g.teams) {
    const clubs = [t.id],
      need = g.teamNeeds?.[t.id]?.[0];
    const expiring = t.players
      .filter((p) => p.years === 1)
      .sort((a, b) => b.ovr - a.ovr)[0];
    if (expiring)
      add({
        beat: "market",
        clubs,
        subject: "contract/" + expiring.id,
        headline: pair(
          "Каким будет следующий контракт " + expiring.name + "?",
          "What comes next for " + expiring.name + "?",
        ),
        body: pair(
          `У игрока ${t.id} последний год договора с окладом $${expiring.salary.toFixed(2)} млн. Для клуба вопрос в цене следующего контракта: продление по нынешней ставке и выход на рынок дают разные возможности. О договорённости пока говорить рано.`,
          `The ${t.id} player is in the final year at $${expiring.salary.toFixed(2)}M. Matching that salary and exploring the market leave the club with different options. An agreement is still speculation.`,
        ),
      });
    if (need)
      add({
        beat: "market",
        clubs,
        subject: "depth/" + t.id + "/" + need.position,
        headline: pair(
          t.id + " и рынок: где искать усиление?",
          t.id + " and the market: where is the fit?",
        ),
        body: pair(
          `Позиция ${need.position} стоит первой в списке потребностей клуба. Бюджет под эту задачу — $${need.budget.toFixed(2)} млн. Отсюда и разговоры об усилении; конкретный партнёр по сделке пока не известен.`,
          `${need.position} tops the club's needs with a $${need.budget.toFixed(2)}M budget. That makes it a position to watch, although no trade partner has been identified.`,
        ),
      });
    const injured = t.players
      .filter((p) => p.injury > 0)
      .sort((a, b) => b.ovr - a.ovr)[0];
    if (injured)
      add({
        beat: "league",
        clubs,
        subject: "injury/" + injured.id,
        headline: pair(
          injured.name + " вне состава. Кем его заменит " + t.id + "?",
          t.id + " tests its depth at " + injured.pos,
        ),
        body: pair(
          `${injured.name} остаётся в списке травмированных. На позиции ${injured.pos} в основной обойме здоровых игроков: ${t.players.filter((p) => p.pos === injured.pos && !p.injury).length}. Вот из кого штабу предстоит собирать заявку.`,
          `${injured.name} remains injured. The senior roster has ${t.players.filter((p) => p.pos === injured.pos && !p.injury).length} healthy players at ${injured.pos} for the staff to choose from.`,
        ),
      });
    const young = t.players
      .filter((p) => p.age <= 23 && !p.injury)
      .sort(
        (a, b) =>
          b.stats.g + b.stats.a - a.stats.g - a.stats.a || b.ovr - a.ovr,
      )[0];
    if (young && !games.length)
      add({
        beat: "interview",
        clubs,
        subject: "practice/" + young.id,
        headline: pair(
          young.name + " — о месте в составе",
          young.name + " on earning a shift",
        ),
        body: pair(
          "У борта после тренировки " + t.id + ".",
          "Rinkside at " + t.id + " practice.",
        ),
        question: young.stats.gp
          ? pair(
              "Смотрите на личные очки после игр?",
              "Do you check your points after games?",
            )
          : pair(
              "Что хотите показать до первой игры?",
              "What do you want to show before your first game?",
            ),
        quote: young.stats.gp
          ? pair(
              "Смотрю, в какие моменты тренер выпускает меня на лёд. Если доверяет концовку, для меня это весомее одной передачи.",
              "I look at when the coach sends me out. Being trusted late matters more to me than one assist.",
            )
          : young.pos === "D"
            ? pair(
                "Хочу, чтобы партнёр знал: под давлением я всё равно откроюсь под первый пас.",
                "I want my partner to know I'll still be an outlet when the pressure comes.",
              )
            : pair(
                "Когда у тебя короткая смена, хочется успеть всё. Учусь вовремя отдать шайбу и снова открыться.",
                "With a short shift you want to do everything. I'm learning to move the puck and get open again.",
              ),
      });
    if (t.record.gp >= 8 && g.phase === "regular")
      add({
        beat: "analysis",
        clubs,
        subject: "table/" + t.id,
        headline: pair(
          "Темп " + t.id + " в гонке за очками",
          t.id + " and the points race",
        ),
        body: pair(
          `После ${t.record.gp} игр у клуба ${t.record.pts} очк. и разница шайб ${t.record.gf}–${t.record.ga}. Из возможных очков взято ${Math.round((50 * t.record.pts) / t.record.gp)}%. Именно этот темп удобнее сравнивать у команд с разным числом матчей.`,
          `${t.record.pts} points from ${t.record.gp} games with goals at ${t.record.gf}–${t.record.ga}. The club has taken ${Math.round((50 * t.record.pts) / t.record.gp)}% of available points, a fairer comparison when teams have games in hand.`,
        ),
      });
    if (young)
      add({
        beat: "analysis",
        clubs,
        subject: "youth/" + young.id,
        headline: pair(
          "Под наблюдением: " + young.name,
          "One to watch: " + young.name,
        ),
        body: pair(
          `${t.id}, ${young.pos}, ${young.age} лет. ${young.stats.gp ? "В " + young.stats.gp + " матчах — " + young.stats.g + " голов и " + young.stats.a + " передач. Следующий ориентир — стабильное место в ротации." : "До первых матчей главный вопрос — сколько смен молодой игрок получит рядом с основой."}`,
          `${t.id}, ${young.pos}, age ${young.age}. ${young.stats.gp ? `${young.stats.g} goals and ${young.stats.a} assists in ${young.stats.gp} games. Watch whether the workload follows.` : "Before the first games, watch how many shifts the youngster gets with the senior group."}`,
        ),
      });
  }
  const series = g.bracket.flat().filter(
    (s) =>
      s.winner &&
      games.some(
        (r) => [s.a, s.b].includes(r.home) && [s.a, s.b].includes(r.away),
      ) &&
      s.games.length &&
      games.some((r) => {
        const last = s.games.at(-1)!;
        return (
          r.home === last.home &&
          r.away === last.away &&
          r.goals.join() === last.goals.join()
        );
      }),
  );
  const clinchers = series
    .filter(
      (s) =>
        !history.some(
          (x) =>
            x.season === g.year && x.subject === "series/" + s.a + "/" + s.b,
        ),
    )
    .map((s): Item => {
      const champ = g.history.some(
        (h) => h.year === g.year && h.champion === s.winner,
      );
      return {
        beat: "league",
        clubs: [s.a, s.b],
        subject: "series/" + s.a + "/" + s.b,
        headline: pair(
          s.winner + (champ ? " завоёвывает Кубок Стэнли" : " закрывает серию"),
          s.winner +
            (champ ? " lifts the Stanley Cup" : " closes out the series"),
        ),
        body: pair(
          `Серия ${s.a} — ${s.b} завершилась со счётом ${s.wins.join("–")}. Потребовалось матчей: ${s.games.length}.`,
          `${s.a} and ${s.b} finished ${s.wins.join("–")} after ${s.games.length} games.`,
        ),
      };
    });
  const ordered = pool.sort(
    (a, b) => hash(g.seed + date + a.subject) - hash(g.seed + date + b.subject),
  );
  const pick: Item[] = [];
  for (const beat of ["interview", "analysis", "market", "league"] as const) {
    const candidates = ordered.filter((x) => x.beat === beat);
    // A game-night analysis gets precedence over an evergreen roster profile.
    const topical =
      beat === "analysis" ? candidates.filter((x) => x.clubs.length > 1) : [];
    const options = topical.length ? topical : candidates;
    const next =
      options.find((x) => !pick.some((y) => y.clubs[0] === x.clubs[0])) ??
      options[0];
    if (next) pick.push(next);
  }
  if (
    !history.some((x) => x.season === g.year) &&
    !pick.some((x) => x.clubs.includes(g.user))
  ) {
    const local = ordered.find((x) => x.clubs.includes(g.user));
    if (local) pick.push(local);
  }
  return [...pick, ...headlines, ...clinchers].map((x) => ({
    ...x,
    season: g.year,
    date,
    id: date + "/" + x.subject,
  }));
}
export function publishMedia(g: Game, date: string, games: Result[]) {
  const archive = (g.mediaArchive ??= []);
  if (archive.some((s) => s.date === date && s.season === g.year)) return;
  archive.push(...edition(g, date, games));
  g.mediaArchive = archive.filter((s) => s.season >= g.year - 1);
}
export function mediaFeed(g: Game): MediaStory[] {
  const archive = g.mediaArchive ?? [];
  const press = (g.pressHistory ?? []).map((p): MediaStory => ({
    id: "press/" + p.date + "/" + (p.questionId ?? p.type),
    season:
      Number(p.date.slice(0, 4)) - (Number(p.date.slice(5, 7)) < 9 ? 1 : 0),
    date: p.date,
    clubs: [g.user],
    subject: "press/" + g.user,
    beat: "interview",
    headline: pair(
      g.user + " · Пресс-конференция",
      g.user + " · Press conference",
    ),
    body: pair(
      p.outlet?.ru ?? "Пресс-служба клуба",
      p.outlet?.en ?? "Club media",
    ),
    question: p.question ? pair(p.question.ru, p.question.en) : undefined,
    quote: pair(
      p.headlineI18n?.ru ?? p.headline,
      p.headlineI18n?.en ?? p.headline,
    ),
  }));
  const date = g.calendar?.date ?? g.year + "-09-15";
  const issues = archive.some((s) => s.season === g.year)
    ? archive
    : [...archive, ...edition(g, date, [])];
  return [...press, ...issues.slice().reverse()].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
}
