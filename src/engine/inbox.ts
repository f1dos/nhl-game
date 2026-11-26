/**
 * Generated inbox messages for the user's club — the "assistant manager"
 * layer that turns real game state into Football-Manager-style messages:
 * key injuries, unhappy players, expiring contracts, board warnings, rival
 * trade inquiries, prospects pushing for a call-up, goalie slumps, streaks,
 * cap trouble and milestones.
 *
 * Everything here is deterministic (state + FNV hashing, no Math.random) and
 * rate-limited per message type and per player through `g.inboxState`.
 * Text is written in the career language at creation time (ru / en).
 */
import { addDays, pushEvent } from "./management";
import { askingSalary } from "./contracts";
import { objectiveProgress } from "./strategy";
import { payroll, tradeValue } from "./trades";
import type {
  Game,
  InboxState,
  ManagementEvent,
  Player,
  Position,
  Team,
} from "./types";

type NewEvent = Omit<ManagementEvent, "id" | "read" | "resolved">;
interface Candidate {
  cooldowns: [string, number][];
  event: NewEvent;
}

const PRIORITY_SCORE = { critical: 4, high: 3, normal: 2, low: 1 } as const;
/** Maximum generated messages per day (important / informational). */
export const DAILY_IMPORTANT_LIMIT = 2;
export const DAILY_NORMAL_LIMIT = 2;

function hash(value: string) {
  let n = 2166136261;
  for (const char of value) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return n >>> 0;
}

/** Whether an inbox message concerns the user's club. */
function concernsUser(g: Game, event: ManagementEvent) {
  if (event.teamId) return event.teamId === g.user;
  return !["league", "trade", "game"].includes(event.category);
}

/**
 * Prioritize decisions, notable league developments and actionable updates
 * for the managed club.
 */
export function isImportantEvent(g: Game, event: ManagementEvent) {
  if (event.priority === "critical") return true;
  if (event.requiresResponse) return true;
  if (event.priority === "high")
    return concernsUser(g, event) || event.category === "league";
  return event.priority === "normal" && concernsUser(g, event) &&
    ((event.category === "medical" && event.action === "injuries") ||
      (event.category === "contract" && event.action === "contracts") ||
      (event.category === "organization" && event.action === "leadership"));
}

/** Important messages created after `existing` was captured that are still open. */
export function newImportantEvents(g: Game, existing: Set<string>) {
  return (g.events ?? []).filter(
    (event) =>
      !existing.has(event.id) && !event.resolved && isImportantEvent(g, event),
  );
}

export function unreadImportantCount(g: Game) {
  return (g.events ?? []).filter(
    (event) => !event.read && !event.resolved && isImportantEvent(g, event),
  ).length;
}

export function markEventsRead(g: Game, ids: string[]) {
  const wanted = new Set(ids);
  for (const event of g.events ?? [])
    if (wanted.has(event.id)) event.read = true;
}

function ensureInboxState(g: Game): InboxState {
  g.inboxState ??= { cooldowns: {} };
  g.inboxState.cooldowns ??= {};
  return g.inboxState;
}

function ready(state: InboxState, key: string, days: number, date: string) {
  const last = state.cooldowns[key];
  return !last || addDays(last, days) <= date;
}

const isForward = (player: Player) => !["D", "G"].includes(player.pos);
const fmtSv = (sv: number) => sv.toFixed(3).replace(/^0/, "");
const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const money = (value: number) => `$${value.toFixed(2)}M`;

function userGameCount(g: Game, team: Team) {
  const playoffGames = g.bracket
    .flat()
    .filter((series) => [series.a, series.b].includes(team.id))
    .reduce((sum, series) => sum + series.games.length, 0);
  return team.record.gp + playoffGames;
}

/** Key players: top-6 forwards, top-4 defence, the starting goalie, captain. */
function keyPlayers(team: Team) {
  const forwards = team.players
    .filter(isForward)
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 6);
  const defence = team.players
    .filter((player) => player.pos === "D")
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 4);
  return new Set([
    ...forwards.map((player) => player.id),
    ...defence.map((player) => player.id),
    team.goalie,
    ...(team.captainId ? [team.captainId] : []),
  ]);
}

function inSeason(g: Game) {
  return (
    g.phase === "playoffs" ||
    (g.phase === "regular" && g.calendar!.date >= g.calendar!.seasonStart)
  );
}

// --- generators -----------------------------------------------------------

function injuryReports(
  g: Game,
  team: Team,
  state: InboxState,
  t: Tr,
  out: Candidate[],
) {
  const injured = team.players.filter((player) => player.injury > 0);
  const previous = state.injured;
  state.injured = injured.map((player) => player.id);
  // The first check only records a baseline (pre-loaded real injuries were
  // already reported by the opening medical message).
  if (!previous) return;
  const known = new Set(previous);
  const key = keyPlayers(team);
  const date = g.calendar!.date;
  for (const player of injured) {
    if (known.has(player.id)) continue;
    const important = key.has(player.id);
    if (!important && player.injury < 5) continue;
    const back = addDays(date, Math.max(1, Math.round(player.injury)));
    const reason = player.injuryReason ?? player.injuryStatus ?? "injury";
    const reasonRu =
      { bruise: "ушиб", strain: "растяжение", fracture: "перелом" }[reason] ??
      reason;
    out.push({
      cooldowns: [[`injury:${player.id}`, 3]],
      event: {
        date,
        category: "medical",
        priority: important ? "high" : "normal",
        title: t(
          `Травма: ${player.name} выбывает`,
          `Injury: ${player.name} ruled out`,
        ),
        body: t(
          `${player.name} (${player.pos}, OVR ${player.ovr}) — ${reasonRu}. Ориентировочно ${player.injury} дн., возвращение около ${back}.${important ? " Это ключевой игрок: перестройте звенья и подумайте о замене из AHL." : ""}`,
          `${player.name} (${player.pos}, OVR ${player.ovr}) — ${reason}. Expected out about ${player.injury} days, return around ${back}.${important ? " He is a key player: rework the lines and consider an AHL call-up." : ""}`,
        ),
        action: "injuries",
        teamId: g.user,
        playerId: player.id,
        requiresResponse: important,
        responseDue: important ? addDays(date, 2) : undefined,
      },
    });
  }
}

function iceTimeComplaints(
  g: Game,
  team: Team,
  state: InboxState,
  t: Tr,
  out: Candidate[],
) {
  if (!inSeason(g) || g.calendar!.day % 7 !== 3 || team.record.gp < 8) return;
  const date = g.calendar!.date;
  const candidates: {
    player: Player;
    ovrRank: number;
    avg: number;
    benched: boolean;
  }[] = [];
  const groups: [Player[], number][] = [
    [team.players.filter(isForward), 9],
    [team.players.filter((player) => player.pos === "D"), 6],
  ];
  for (const [group, top] of groups) {
    const healthy = group.filter(
      (player) => player.injury <= 0 && player.stats.gp >= 5,
    );
    const byOvr = [...healthy].sort((a, b) => b.ovr - a.ovr);
    const byToi = [...healthy].sort(
      (a, b) => b.stats.toi / b.stats.gp - a.stats.toi / a.stats.gp,
    );
    byOvr.forEach((player, ovrRank) => {
      const toiRank = byToi.indexOf(player);
      const benched = ovrRank < top && toiRank >= ovrRank + 4;
      if (
        (benched && player.morale < 55) ||
        (ovrRank < 12 && player.morale < 30)
      )
        candidates.push({
          player,
          ovrRank,
          avg: player.stats.toi / player.stats.gp,
          benched,
        });
    });
  }
  candidates.sort((a, b) => a.player.morale - b.player.morale);
  const pick = candidates.find(({ player }) =>
    ready(state, `icetime:${player.id}`, 42, date),
  );
  if (!pick) return;
  const { player, ovrRank, avg, benched } = pick;
  out.push({
    cooldowns: [
      [`icetime:${player.id}`, 42],
      ["type:icetime", 10],
    ],
    event: {
      date,
      category: "organization",
      priority: "high",
      title: benched
        ? t(
            `${player.name} недоволен игровым временем`,
            `${player.name} unhappy with his ice time`,
          )
        : t(
            `${player.name} подавлен — нужен разговор`,
            `${player.name} is low — a talk is needed`,
          ),
      body: benched
        ? t(
            `Агент сообщает: ${player.name} (${ovrRank + 1}-й по рейтингу в своей группе) получает лишь ${avg.toFixed(1)} мин. за матч, мораль ${Math.round(player.morale)}. Он хочет большую роль — поговорите с игроком или пересмотрите звенья.`,
            `His agent reports that ${player.name} (ranked #${ovrRank + 1} in his position group) is only getting ${avg.toFixed(1)} min a night, morale ${Math.round(player.morale)}. He wants a bigger role — talk to him or rethink the lines.`,
          )
        : t(
            `Тренерский штаб обеспокоен: мораль ${player.name} упала до ${Math.round(player.morale)}. Лидер с таким настроем тянет раздевалку вниз — проведите личную встречу или дайте ему другую роль.`,
            `The coaching staff are worried: ${player.name}'s morale has dropped to ${Math.round(player.morale)}. A core player in this mood drags the dressing room down — hold a one-on-one or change his role.`,
          ),
      action: benched ? "tactics" : "roster",
      teamId: g.user,
      playerId: player.id,
      requiresResponse: true,
      responseDue: addDays(date, 7),
    },
  });
}

function contractTalks(
  g: Game,
  team: Team,
  state: InboxState,
  t: Tr,
  out: Candidate[],
) {
  const date = g.calendar!.date;
  if (g.phase !== "regular" || date < `${g.year}-11-15`) return;
  if (g.calendar!.day % 7 !== 5) return;
  const ranked = [...team.players].sort((a, b) => b.ovr - a.ovr);
  const core = new Set(ranked.slice(0, 6).map((player) => player.id));
  const player = ranked.find(
    (candidate) =>
      candidate.years <= 1 &&
      (core.has(candidate.id) || candidate.ovr >= 80) &&
      ready(state, `contract:${candidate.id}`, 60, date),
  );
  if (!player) return;
  const ask = askingSalary(player, g, g.user);
  const ufa =
    (player.contractStatus ?? (player.age >= 27 ? "UFA" : "RFA")) === "UFA";
  out.push({
    cooldowns: [
      [`contract:${player.id}`, 60],
      ["type:contract", 6],
    ],
    event: {
      date,
      category: "contract",
      priority: "high",
      title: t(
        `Агент ${player.name} просит переговоры`,
        `${player.name}'s agent requests talks`,
      ),
      body: t(
        `Контракт ${player.name} (OVR ${player.ovr}, ${money(player.salary)}) истекает после сезона${ufa ? " — игрок станет неограниченно свободным агентом" : ""}. Агент ориентирует на ${money(ask)} в год и ждёт предложения в течение двух недель.`,
        `${player.name} (OVR ${player.ovr}, ${money(player.salary)}) is out of contract after this season${ufa ? " and will be an unrestricted free agent" : ""}. His agent is looking for about ${money(ask)} per year and expects an offer within two weeks.`,
      ),
      action: "contracts",
      teamId: g.user,
      playerId: player.id,
      requiresResponse: true,
      responseDue: addDays(date, 14),
    },
  });
}

const EXPECTED_FINISH: Partial<Record<string, number>> = {
  "stanley-cup": 4,
  "playoff-breakthrough": 6,
  "wild-card-hunt": 8,
};

function boardWarning(
  g: Game,
  team: Team,
  state: InboxState,
  t: Tr,
  out: Candidate[],
) {
  if (g.phase !== "regular" || team.record.gp < 15) return;
  if (g.strategySeason !== g.year || g.calendar!.day % 7 !== 1) return;
  const expected = EXPECTED_FINISH[g.franchiseStrategy ?? ""];
  if (!expected) return;
  const position = objectiveProgress(g, "conference-finish");
  if (position < expected + 3) return;
  const date = g.calendar!.date;
  const severe =
    position >= expected + 6 || g.managerEmployment?.status === "final-warning";
  const pace = Math.round((team.record.pts / team.record.gp) * (g.schedule.length/16));
  out.push({
    cooldowns: [["type:board", 28]],
    event: {
      date,
      category: "organization",
      priority: severe ? "critical" : "high",
      title: t(
        severe
          ? "Совет директоров: последнее предупреждение"
          : "Совет директоров недоволен результатами",
        severe ? "Board: final warning" : "Board concerned about results",
      ),
      body: t(
        `Клуб ${position}-й в конференции при ожидании топ-${expected}. Темп — ${pace} очков за сезон. Совет ждёт улучшения результатов; пересмотрите состав, тактику или цели.`,
        `The club sits ${ordinal(position)} in the conference against an expectation of top ${expected}, on pace for ${pace} points. The board expects improvement — review the roster, tactics or objectives.`,
      ),
      action: "strategy",
      teamId: g.user,
      requiresResponse: severe,
      responseDue: severe ? addDays(date, 7) : undefined,
    },
  });
}

function tradeInquiry(
  g: Game,
  team: Team,
  state: InboxState,
  t: Tr,
  out: Candidate[],
) {
  const date = g.calendar!.date;
  if (g.phase !== "regular") return;
  if (
    date < addDays(g.calendar!.seasonStart, 10) ||
    date > `${g.year + 1}-03-05`
  )
    return;
  if (g.calendar!.day % 5 !== 2) return;
  const clubs = g.teams
    .filter(
      (club) =>
        club.id !== g.user &&
        ["stanley-cup", "playoff-breakthrough"].includes(
          club.aiProfile?.strategy ?? "",
        ),
    )
    .sort((a, b) => hash(`${date}:${a.id}`) - hash(`${date}:${b.id}`));
  for (const club of clubs) {
    const need = g.teamNeeds?.[club.id]?.[0]?.position as Position | undefined;
    if (!need) continue;
    const target = team.players
      .filter(
        (player) =>
          player.injury <= 0 &&
          player.ovr >= 75 &&
          (need === "G"
            ? player.pos === "G"
            : need === "D"
              ? player.pos === "D"
              : isForward(player) && player.pos !== "G") &&
          ready(state, `inquiry:${player.id}`, 45, date),
      )
      .sort((a, b) => tradeValue(b) - tradeValue(a))[0];
    if (!target) continue;
    const value = tradeValue(target);
    const counterpart = club.players
      .filter((player) => player.injury <= 0 && player.pos !== target.pos)
      .sort(
        (a, b) =>
          Math.abs(tradeValue(a) - value) - Math.abs(tradeValue(b) - value),
      )[0];
    const pick = (g.draftAssets ?? []).find(
      (asset) =>
        asset.currentTeam === club.id &&
        asset.round === 1 &&
        asset.year === g.year + 1,
    );
    const offerPick =
      !!pick && (club.aiProfile?.futureAssetWillingness ?? 50) >= 55;
    const offerRu = offerPick
      ? `пик 1-го раунда ${pick!.year}${counterpart ? ` или ${counterpart.name} (${counterpart.pos}, OVR ${counterpart.ovr})` : ""}`
      : counterpart
        ? `${counterpart.name} (${counterpart.pos}, OVR ${counterpart.ovr})`
        : "пакет из перспективных активов";
    const offerEn = offerPick
      ? `a ${pick!.year} first-round pick${counterpart ? ` or ${counterpart.name} (${counterpart.pos}, OVR ${counterpart.ovr})` : ""}`
      : counterpart
        ? `${counterpart.name} (${counterpart.pos}, OVR ${counterpart.ovr})`
        : "a package of young assets";
    out.push({
      cooldowns: [
        [`inquiry:${target.id}`, 45],
        ["type:inquiry", 20],
      ],
      event: {
        date,
        category: "trade",
        priority: "high",
        title: t(
          `${club.id} интересуется ${target.name}`,
          `${club.id} enquire about ${target.name}`,
        ),
        body: t(
          `Генеральный менеджер ${club.city} ${club.name} ищет усиление на позиции ${need} и спрашивает о ${target.name} (OVR ${target.ovr}, ${money(target.salary)}). Готовы обсуждать: ${offerRu}. Ответьте до ${addDays(date, 4)}.`,
          `The ${club.city} ${club.name} GM is shopping for a ${need} and asked about ${target.name} (OVR ${target.ovr}, ${money(target.salary)}). They would discuss ${offerEn}. Respond by ${addDays(date, 4)}.`,
        ),
        action: "trades",
        teamId: g.user,
        playerId: target.id,
        requiresResponse: true,
        responseDue: addDays(date, 4),
      },
    });
    return;
  }
}

function prospectPush(
  g: Game,
  team: Team,
  state: InboxState,
  t: Tr,
  out: Candidate[],
) {
  const date = g.calendar!.date;
  if (g.phase !== "regular" || date < addDays(g.calendar!.seasonStart, 14))
    return;
  if (g.calendar!.day % 10 !== 6) return;
  const dressed = new Set([...team.lines.flat(), ...team.defense.flat()]);
  const weakest = (forward: boolean) =>
    team.players
      .filter(
        (player) =>
          dressed.has(player.id) &&
          (forward ? isForward(player) : player.pos === "D"),
      )
      .sort((a, b) => a.ovr - b.ovr)[0];
  const candidates = (team.farm ?? [])
    .filter(
      (player) =>
        player.pos !== "G" &&
        player.age <= 23 &&
        player.injury <= 0 &&
        ready(state, `prospect:${player.id}`, 60, date),
    )
    .map((player) => ({ player, depth: weakest(isForward(player)) }))
    .filter(({ player, depth }) => depth && player.ovr >= depth.ovr + 2)
    .sort(
      (a, b) =>
        b.player.ovr - b.depth!.ovr - (a.player.ovr - a.depth!.ovr) ||
        b.player.potential - a.player.potential,
    );
  const pick = candidates[0];
  if (!pick) return;
  const { player, depth } = pick;
  const gap = player.ovr - depth!.ovr;
  out.push({
    cooldowns: [
      [`prospect:${player.id}`, 60],
      ["type:prospect", 21],
    ],
    event: {
      date,
      category: "scouting",
      priority: gap >= 4 ? "high" : "normal",
      title: t(
        `${player.name} просится в NHL`,
        `${player.name} pushing for a call-up`,
      ),
      body: t(
        `Штаб фарм-клуба: ${player.name} (${player.age} лет, ${player.pos}, OVR ${player.ovr}, потенциал ${player.potential}) доминирует и уже сильнее ${depth!.name} (OVR ${depth!.ovr}) из состава NHL. Рассмотрите вызов.`,
        `Farm staff report: ${player.name} (age ${player.age}, ${player.pos}, OVR ${player.ovr}, potential ${player.potential}) is dominating and already rates above ${depth!.name} (OVR ${depth!.ovr}) in your NHL lineup. Consider a call-up.`,
      ),
      action: "roster",
      teamId: g.user,
      playerId: player.id,
    },
  });
}

function gameDayReports(
  g: Game,
  team: Team,
  state: InboxState,
  t: Tr,
  out: Candidate[],
) {
  const games = userGameCount(g, team);
  const previous = state.userGames;
  state.userGames = games;
  if (previous === undefined || games <= previous) return;
  const date = g.calendar!.date;

  // Goalie snapshots after every user game.
  const snapshot: Record<string, [number, number]> = {};
  for (const goalie of team.players.filter((player) => player.pos === "G"))
    snapshot[goalie.id] = [goalie.stats.sa, goalie.stats.ga];
  state.goalieLog = [...(state.goalieLog ?? []), snapshot].slice(-6);
  const log = state.goalieLog;
  const starter = team.players.find((player) => player.id === team.goalie);
  if (starter && log.length === 6 && log[0][starter.id]) {
    const shots = log[5][starter.id][0] - log[0][starter.id][0];
    const goals = log[5][starter.id][1] - log[0][starter.id][1];
    const sv = shots ? 1 - goals / shots : 1;
    if (shots >= 80 && sv < 0.88) {
      const season = starter.stats.sa
        ? 1 - starter.stats.ga / starter.stats.sa
        : sv;
      const backup = team.players
        .filter(
          (player) =>
            player.pos === "G" &&
            player.id !== starter.id &&
            player.injury <= 0,
        )
        .sort((a, b) => b.ovr - a.ovr)[0];
      out.push({
        cooldowns: [
          [`slump:${starter.id}`, 25],
          ["type:slump", 14],
        ],
        event: {
          date,
          category: "game",
          priority: "high",
          title: t(
            `Спад вратаря: ${starter.name}`,
            `Goalie slump: ${starter.name}`,
          ),
          body: t(
            `За последние 5 матчей ${starter.name} отражает ${fmtSv(sv)} бросков (${goals} голов с ${shots} бросков), в сезоне — ${fmtSv(season)}.${backup ? ` Тренер вратарей предлагает дать шанс ${backup.name} (OVR ${backup.ovr}).` : ""}`,
            `Over the last five games ${starter.name} has a ${fmtSv(sv)} save percentage (${goals} goals on ${shots} shots) against ${fmtSv(season)} for the season.${backup ? ` The goalie coach suggests giving ${backup.name} (OVR ${backup.ovr}) a start.` : ""}`,
          ),
          action: "tactics",
          teamId: g.user,
          playerId: starter.id,
        },
      });
    }
  }

  // Result streaks.
  const last = team.record.form.at(-1);
  if (g.phase === "regular" && last) {
    const kind = last === "W" ? "W" : "L";
    state.streak =
      state.streak?.kind === kind
        ? { kind, n: state.streak.n + 1 }
        : { kind, n: 1 };
    const n = state.streak.n;
    if (kind === "L" && (n === 4 || n === 7))
      out.push({
        cooldowns: [[`streak:L${n}`, 10]],
        event: {
          date,
          category: "organization",
          priority: n >= 7 ? "critical" : "high",
          title: t(
            `Серия поражений: ${n} ${n === 4 ? "матча" : "матчей"} подряд без побед`,
            `Losing streak: ${n} straight games without a win`,
          ),
          body: t(
            n >= 7
              ? "Пресса требует перемен, владелец просит объяснений. Выступите перед журналистами и примите решения по составу."
              : "Журналисты спрашивают о кризисе, болельщики теряют терпение. Пресс-конференция поможет снять давление с команды.",
            n >= 7
              ? "The press is calling for changes and the owner wants answers. Face the media and make roster decisions."
              : "Reporters are asking about a crisis and the fans are losing patience. A press conference can take pressure off the players.",
          ),
          action: "press",
          teamId: g.user,
          requiresResponse: n >= 7,
          responseDue: n >= 7 ? addDays(date, 3) : undefined,
        },
      });
    if (kind === "W" && (n === 5 || n === 8))
      out.push({
        cooldowns: [[`streak:W${n}`, 10]],
        event: {
          date,
          category: "organization",
          priority: "normal",
          title: t(
            `Победная серия: ${n} подряд`,
            `Winning streak: ${n} in a row`,
          ),
          body: t(
            "Пресса восхищается формой команды, ожидания болельщиков растут.",
            "The media are raving about the team's form and fan expectations are rising.",
          ),
          action: "press",
          teamId: g.user,
        },
      });
  }

  // Milestones approaching (informational).
  for (const player of team.players) {
    const career = (key: "g" | "a" | "wins") =>
      player.history.reduce(
        (sum, season) => sum + (season.stats[key] ?? 0),
        0,
      ) + player.stats[key];
    const checks: [string, number, number[], string, string][] =
      player.pos === "G"
        ? [
            [
              "w",
              career("wins"),
              [50, 100, 200, 300, 400, 500],
              "побед",
              "wins",
            ],
          ]
        : [
            [
              "p",
              career("g") + career("a"),
              [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
              "очков",
              "points",
            ],
            ["g", career("g"), [50, 100, 200, 300, 400, 500], "голов", "goals"],
          ];
    for (const [kind, value, marks, ru, en] of checks) {
      const mark = marks.find((m) => m > value && m - value <= 2);
      if (!mark) continue;
      out.push({
        cooldowns: [[`ms:${player.id}:${kind}:${mark}`, 100000]],
        event: {
          date,
          category: "game",
          priority: "normal",
          title: t(
            `${player.name} в шаге от ${mark} ${ru}`,
            `${player.name} closing in on ${mark} ${en}`,
          ),
          body: t(
            `${player.name} осталось ${mark - value} до отметки ${mark} ${ru}. Отдел по связям с прессой готовит материалы.`,
            `${player.name} is ${mark - value} away from ${mark} ${en}. Media relations are preparing coverage.`,
          ),
          teamId: g.user,
          playerId: player.id,
        },
      });
    }
  }
}

function capCheck(
  g: Game,
  team: Team,
  state: InboxState,
  t: Tr,
  out: Candidate[],
) {
  const date = g.calendar!.date;
  const total = payroll(team.players);
  const previous = state.payroll;
  state.payroll = Number(total.toFixed(2));
  const over = total - g.rules.cap;
  if (over <= 0) return;
  const grew = previous !== undefined && total > previous + 0.01;
  const openingCheck =
    g.phase === "regular" && date === addDays(g.calendar!.seasonStart, -3);
  if (!grew && !openingCheck) return;
  out.push({
    cooldowns: [["type:cap", 14]],
    event: {
      date,
      category: "contract",
      priority: openingCheck ? "critical" : "high",
      title: t(
        `Превышен потолок зарплат на ${money(over)}`,
        `Over the salary cap by ${money(over)}`,
      ),
      body: t(
        `Платёжная ведомость ${money(total)} при потолке ${money(g.rules.cap)}. Лига потребует соответствия: отправьте контракт в AHL, обменяйте зарплату или переведите травмированного игрока в LTIR.`,
        `Payroll is ${money(total)} against a ${money(g.rules.cap)} cap. The league will demand compliance: assign a contract to the AHL, trade salary or place an injured player on LTIR.`,
      ),
      action: "finances",
      teamId: g.user,
      requiresResponse: true,
      responseDue: addDays(date, 3),
    },
  });
}

type Tr = (ru: string, en: string) => string;

/**
 * Generate the day's inbox messages for the user's club. Called once per
 * processed calendar day after games, training and AI activity.
 */
export function generateInboxEvents(g: Game) {
  if (g.phase === "offseason" || g.managerEmployment?.status === "fired")
    return;
  const team = g.teams.find((club) => club.id === g.user);
  if (!team) return;
  const state = ensureInboxState(g);
  const ru = g.language === "ru";
  const t: Tr = (a, b) => (ru ? a : b);
  const date = g.calendar!.date;
  const candidates: Candidate[] = [];
  for (const generator of [
    injuryReports,
    capCheck,
    boardWarning,
    gameDayReports,
    contractTalks,
    iceTimeComplaints,
    tradeInquiry,
    prospectPush,
  ])
    generator(g, team, state, t, candidates);
  const fresh = candidates
    .filter((candidate) =>
      candidate.cooldowns.every(([key, days]) => ready(state, key, days, date)),
    )
    .sort(
      (a, b) =>
        PRIORITY_SCORE[b.event.priority] - PRIORITY_SCORE[a.event.priority],
    );
  let important = 0;
  let normal = 0;
  for (const candidate of fresh) {
    const counts = ["high", "critical"].includes(candidate.event.priority);
    if (
      counts ? important >= DAILY_IMPORTANT_LIMIT : normal >= DAILY_NORMAL_LIMIT
    )
      continue;
    // A per-type cooldown may be shared by two candidates on the same day.
    if (
      !candidate.cooldowns.every(([key, days]) => ready(state, key, days, date))
    )
      continue;
    if (counts) important++;
    else normal++;
    for (const [key] of candidate.cooldowns) state.cooldowns[key] = date;
    pushEvent(g, candidate.event);
  }
  // Keep the cooldown table small; milestone keys are permanent.
  for (const [key, last] of Object.entries(state.cooldowns))
    if (!key.startsWith("ms:") && addDays(last, 400) < date)
      delete state.cooldowns[key];
}
