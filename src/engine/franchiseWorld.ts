import { clamp } from "./random";
import type {
  FanState,
  FranchiseObjective,
  FranchiseStrategy,
  Game,
  Player,
  Position,
  Result,
  RivalryState,
  Team,
  TeamNeed,
} from "./types";
import { textFor, tx, type Tx } from "./text";
import { computePotential } from "./potential";

const rivalrySeeds: [string, string, string, number][] = [
  ["MTL", "BOS", "Original Six: Montréal — Boston", 96],
  ["TOR", "MTL", "Original Six: Toronto — Montréal", 94],
  ["EDM", "CGY", "Battle of Alberta", 98],
  ["NYR", "NYI", "Battle of New York", 94],
  ["PIT", "PHI", "Battle of Pennsylvania", 93],
  ["CHI", "STL", "Central Division Classic", 90],
  ["LAK", "SJS", "California Rivalry", 88],
  ["COL", "DET", "Colorado — Detroit", 91],
  ["VAN", "SEA", "Pacific Northwest", 84],
  ["TBL", "FLA", "Battle of Florida", 89],
  ["CAR", "WSH", "Metropolitan Clash", 82],
  ["NJD", "NYR", "Hudson River Rivalry", 92],
  ["BUF", "TOR", "QEW Rivalry", 86],
  ["DAL", "NSH", "Southern Hockey Rivalry", 78],
  ["WPG", "MIN", "Central North Rivalry", 80],
  ["VGK", "EDM", "Western Power Rivalry", 86],
];

const popularity: Record<string, number> = {
  TOR: 100,
  MTL: 99,
  NYR: 96,
  BOS: 95,
  CHI: 93,
  DET: 92,
  EDM: 92,
  PIT: 90,
  VAN: 88,
  PHI: 87,
  LAK: 86,
};

export function likelyStrategy(team: Team): FranchiseStrategy {
  const rank = team.strengthRank ?? 16;
  if (rank <= 6) return "stanley-cup";
  if (rank <= 13) return "playoff-breakthrough";
  if (rank <= 23) return "wild-card-hunt";
  return "draft-lottery";
}

function createFans(team: Team, t: Tx): FanState {
  const brand =
    popularity[team.id] ?? 68 + Math.max(0, 18 - (team.strengthRank ?? 18));
  const supporters = Math.round(180_000 + brand * 23_000);
  return {
    supporters,
    engagement: clamp(45 + Math.round(brand / 2), 40, 95),
    happiness: 50,
    attendance: clamp(62 + Math.round(brand / 3), 65, 100),
    revenueMultiplier: Number((0.78 + brand / 250).toFixed(2)),
    lastChange: t("Старт сезона", "Season start"),
  };
}

function createRivalries(): RivalryState[] {
  return rivalrySeeds.map(([teamA, teamB, label, heat]) => ({
    id: `${teamA}-${teamB}`,
    teamA,
    teamB,
    label,
    heat,
    seasonWins: { [teamA]: 0, [teamB]: 0 },
    seasonLosses: { [teamA]: 0, [teamB]: 0 },
  }));
}

function unitAverage(team: Team, position: Position) {
  const players = team.players.filter((player) => player.pos === position);
  const count = position === "D" ? 6 : position === "G" ? 2 : 4;
  const core = [...players].sort((a, b) => b.ovr - a.ovr).slice(0, count);
  return (
    core.reduce((sum, player) => sum + player.ovr, 0) / Math.max(1, core.length)
  );
}

export function calculateTeamNeeds(game: Game, team: Team): TeamNeed[] {
  const positions: Position[] = ["C", "LW", "RW", "D", "G"];
  const payroll = team.players.reduce((sum, player) => sum + player.salary, 0);
  const capSpace = Math.max(0, game.rules.cap - payroll);
  return positions
    .map((position) => ({ position, rating: unitAverage(team, position) }))
    .sort((a, b) => a.rating - b.rating)
    .slice(0, 2)
    .map(({ position, rating }, index) => ({
      position,
      priority: rating < 72 ? "critical" : index === 0 ? "high" : "medium",
      reason: tx(
        game,
        `${position}: средняя сила ротации ${rating.toFixed(1)} OVR`,
        `${position}: average rotation strength ${rating.toFixed(1)} OVR`,
      ),
      budget: Number(Math.min(capSpace, rating < 74 ? 6.5 : 3.5).toFixed(2)),
    }));
}

export function ensureFranchiseWorld(game: Game) {
  game.fans ??= Object.fromEntries(
    game.teams.map((team) => [team.id, createFans(team, textFor(game))]),
  );
  game.rivalries ??= createRivalries();
  game.teamNeeds ??= Object.fromEntries(
    game.teams.map((team) => [team.id, calculateTeamNeeds(game, team)]),
  );
  for (const team of game.teams)
    for (const player of [...team.players, ...(team.farm ?? [])]) {
      if (!Number.isFinite(player.morale)) player.morale = 50;
      syncMoraleBonus(player);
    }
  return game;
}

export function syncMoraleBonus(player: Player) {
  player.moraleOvrBonus = player.morale >= 95 ? 1 : 0;
}

export function effectiveOverall(player: Player) {
  return Math.min(99, player.ovr + (player.moraleOvrBonus ?? 0));
}

function changeFans(
  fans: FanState,
  won: boolean,
  rivalry: boolean,
  t: Tx,
) {
  const scale = rivalry ? 2 : 1;
  fans.happiness = clamp(fans.happiness + (won ? scale : -scale), 0, 100);
  fans.engagement = clamp(
    fans.engagement + (won ? 1 : rivalry ? -1 : 0),
    0,
    100,
  );
  fans.supporters = Math.max(
    50_000,
    fans.supporters + (won ? 900 : -350) * scale,
  );
  fans.attendance = clamp(
    fans.attendance + (won ? 0.3 : -0.2) * scale,
    45,
    100,
  );
  fans.revenueMultiplier = Number(
    (0.75 + fans.engagement / 250 + fans.supporters / 8_000_000).toFixed(2),
  );
  fans.lastChange = won
    ? rivalry
      ? t("Победа в принципиальном матче", "Rivalry win")
      : t("Победа команды", "Team win")
    : rivalry
      ? t("Поражение в принципиальном матче", "Rivalry loss")
      : t("Поражение команды", "Team loss");
}

export function applyWorldMatchReaction(game: Game, result: Result) {
  ensureFranchiseWorld(game);
  const winner = result.goals[0] > result.goals[1] ? result.home : result.away;
  const loser = winner === result.home ? result.away : result.home;
  const rivalry = game.rivalries!.find(
    (item) =>
      [item.teamA, item.teamB].includes(result.home) &&
      [item.teamA, item.teamB].includes(result.away),
  );
  const t = textFor(game);
  changeFans(game.fans![winner], true, !!rivalry, t);
  changeFans(game.fans![loser], false, !!rivalry, t);
  for (const id of [winner, loser]) {
    const won = id === winner;
    const team = game.teams.find((club) => club.id === id)!;
    for (const player of team.players) {
      player.morale = clamp(player.morale + (won ? 1 : -1), 0, 100);
      syncMoraleBonus(player);
    }
  }
  if (!rivalry) return;
  rivalry.seasonWins[winner] = (rivalry.seasonWins[winner] ?? 0) + 1;
  rivalry.seasonLosses[loser] = (rivalry.seasonLosses[loser] ?? 0) + 1;
  if ([result.home, result.away].includes(game.user)) {
    const userWon = winner === game.user;
    if (game.managerEmployment)
      game.managerEmployment.confidence = clamp(
        game.managerEmployment.confidence + (userWon ? 1 : -1),
        0,
        100,
      );
    game.news.unshift(
      `${rivalry.label}: ${
        userWon
          ? t("победа укрепила поддержку клуба", "the win strengthened fan support")
          : t(
              "поражение немного разочаровало фанатов",
              "the loss left the fans a little disappointed",
            )
      }.`,
    );
  }
}

export function applyWeeklyMood(game: Game) {
  ensureFranchiseWorld(game);
  for (const team of game.teams) {
    const active = new Set([
      ...team.lines.flat(),
      ...team.defense.flat(),
      team.goalie,
    ]);
    const rank = [...team.players].sort((a, b) => b.ovr - a.ovr);
    for (const player of team.players) {
      const expectedStarter = rank.indexOf(player) < 12;
      const roleMismatch = expectedStarter && !active.has(player.id);
      if (roleMismatch) player.morale = clamp(player.morale - 2, 0, 100);
      if ((player.performanceForm ?? 0) < -20)
        player.morale = clamp(player.morale - 1, 0, 100);
      if ((player.performanceForm ?? 0) > 20)
        player.morale = clamp(player.morale + 1, 0, 100);
      syncMoraleBonus(player);
    }
    game.teamNeeds![team.id] = calculateTeamNeeds(game, team);
  }
}

export function rivalryBetween(game: Game, a: string, b: string) {
  ensureFranchiseWorld(game);
  return game.rivalries!.find(
    (item) =>
      [item.teamA, item.teamB].includes(a) &&
      [item.teamA, item.teamB].includes(b),
  );
}

export function addRivalryObjective(game: Game) {
  ensureFranchiseWorld(game);
  if (
    !game.franchiseObjectives ||
    game.franchiseObjectives.some((item) => item.metric === "rivalry-wins")
  )
    return;
  const rivals = game.rivalries!.filter((item) =>
    [item.teamA, item.teamB].includes(game.user),
  );
  if (!rivals.length) return;
  const objective: FranchiseObjective = {
    id: `${game.year}-rivalry`,
    season: game.year,
    tier: "supporting",
    metric: "rivalry-wins",
    title: tx(
      game,
      "Выиграть принципиальное противостояние",
      "Win the rivalry",
    ),
    detail: tx(
      game,
      `Добиться победы минимум в двух матчах: ${rivals.map((item) => item.label).join(", ")}.`,
      `Win at least two games against: ${rivals.map((item) => item.label).join(", ")}.`,
    ),
    target: 2,
    progress: 0,
    completed: false,
    evaluated: false,
  };
  game.franchiseObjectives.push(objective);
}

export function normalizeExternalRating(
  league: string,
  age: number,
  ovr: number,
  potential: number,
  identity?: { id: string; pos: Position },
) {
  const junior = ["OHL", "WHL", "USHL"].includes(league);
  const normalizedOvr = junior ? clamp(ovr, 45, 68) : clamp(ovr, 58, 79);
  const floor = age <= 20 ? normalizedOvr + 10 : normalizedOvr + 2;
  const feed = clamp(Math.max(potential, floor), normalizedOvr, 95);
  if (!identity) return { ovr: normalizedOvr, potential: feed };
  // Blend the feed's production-based figure with the game's age model.
  const model = computePotential(
    {
      id: identity.id,
      pos: identity.pos,
      age,
      ovr: normalizedOvr,
      potential: normalizedOvr,
    } as Player,
    { league },
  );
  return {
    ovr: normalizedOvr,
    potential: clamp(Math.round((feed + model) / 2), normalizedOvr, 95),
  };
}
