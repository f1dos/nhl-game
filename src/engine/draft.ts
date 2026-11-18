import { tx } from "./text";
import { createPlayer } from "./database";
import { RNG, clamp } from "./random";
import { assignPotential, estimatePotential, rankDraftClass } from "./potential";
import type {
  DraftProspect,
  DraftState,
  Game,
  Player,
  Position,
  ScoutingRegion,
  Team,
} from "./types";

export const SCOUTING_REGIONS: ScoutingRegion[] = [
  "North America",
  "Nordic",
  "Central Europe",
  "Russia",
];

const rankedTeams = (teams: Team[]) =>
  [...teams].sort(
    (a, b) =>
      b.record.pts - a.record.pts ||
      b.record.rw - a.record.rw ||
      b.record.w - a.record.w ||
      b.record.gf - b.record.ga - (a.record.gf - a.record.ga) ||
      a.id.localeCompare(b.id),
  );

const regionFor = (nation: string): ScoutingRegion =>
  nation === "CAN" || nation === "USA"
    ? "North America"
    : nation === "SWE" || nation === "FIN"
      ? "Nordic"
      : nation === "RUS"
        ? "Russia"
        : "Central Europe";

const hash = (text: string) =>
  [...text].reduce((n, char) => (n * 31 + char.charCodeAt(0)) >>> 0, 17);

function estimate(
  actual: number,
  id: string,
  confidence: number,
  salt: number,
) {
  const spread = Math.max(1, Math.round((100 - confidence) / 8));
  const error = (hash(`${id}-${salt}`) % (spread * 2 + 1)) - spread;
  return clamp(actual + error, 40, 99);
}

function reportFor(p: Player, confidence: number, round = 0) {
  return {
    confidence,
    estimatedOvr: estimate(p.ovr, p.id, confidence, 1),
    estimatedPotential: estimatePotential(p.potential, p.id, confidence),
    lastUpdatedRound: round,
  };
}

export function createDraftState(
  year: number,
  r: RNG,
  count = 224,
): DraftState {
  const positions: Position[] = ["LW", "C", "RW", "D", "D", "G"];
  const prospects: DraftProspect[] = Array.from({ length: count }, (_, i) => {
    // Draft-eligible teenagers: a few near NHL-ready, most years away.
    const level = i < 12 ? 66 : i < 64 ? 61 : i < 160 ? 57 : 53;
    const player = createPlayer(
      r,
      `draft-${year}-${i}-${r.int(1000, 9999)}`,
      positions[i % positions.length],
      level,
    );
    player.age = r.int(17, 18);
    player.salary = 0;
    player.years = 0;
    player.number = 0;
    assignPotential(player, { league: "draft" });
    return { player, region: regionFor(player.nation), trueRank: 0 };
  });
  rankDraftClass(prospects);
  return {
    year,
    status: "scouting",
    prospects,
    reports: Object.fromEntries(
      prospects.map(({ player }) => [player.id, reportFor(player, 18)]),
    ),
    picks: [],
    currentPick: 0,
    scoutingPoints: 8,
    assignment: "North America",
    shortlist: [],
  };
}

export function ensureDraft(g: Game) {
  if (!g.draft)
    g.draft = createDraftState(g.year + 1, new RNG(g.seed ^ g.year));
  for (const team of g.teams) team.prospects ??= [];
  return g.draft;
}

export function setScoutingRegion(g: Game, region: ScoutingRegion) {
  const draft = ensureDraft(g);
  if (!SCOUTING_REGIONS.includes(region))
    throw Error("Unknown scouting region");
  draft.assignment = region;
  g.news.unshift(tx(g, `Скаутское задание: ${region}.`, `Scouting assignment: ${region}.`));
}

export function toggleShortlist(g: Game, prospectId: string) {
  const draft = ensureDraft(g);
  if (!draft.prospects.some((p) => p.player.id === prospectId))
    throw Error("Prospect unavailable");
  draft.shortlist = draft.shortlist.includes(prospectId)
    ? draft.shortlist.filter((id) => id !== prospectId)
    : [...draft.shortlist, prospectId];
}

export function scoutProspect(g: Game, prospectId: string) {
  const draft = ensureDraft(g);
  if (draft.status !== "scouting") throw Error("Scouting period is closed");
  if (draft.scoutingPoints < 1) throw Error("No scouting capacity available");
  const prospect = draft.prospects.find((p) => p.player.id === prospectId);
  if (!prospect) throw Error("Prospect unavailable");
  const current = draft.reports[prospectId];
  const regionalBonus = prospect.region === draft.assignment ? 14 : 7;
  const confidence = clamp(current.confidence + regionalBonus, 0, 100);
  const next = reportFor(prospect.player, confidence, g.round);
  next.estimatedOvr = Math.round(
    (current.estimatedOvr + prospect.player.ovr) / 2,
  );
  next.estimatedPotential = Math.round(
    (current.estimatedPotential + prospect.player.potential) / 2,
  );
  draft.reports[prospectId] = next;
  draft.scoutingPoints--;
}

export function progressScouting(g: Game) {
  const draft = ensureDraft(g);
  if (draft.status !== "scouting") return;
  if (g.round % 8 === 0)
    draft.scoutingPoints = Math.min(12, draft.scoutingPoints + 2);
  const target = draft.prospects
    .filter(
      (p) =>
        p.region === draft.assignment &&
        !p.draftedBy &&
        draft.reports[p.player.id].confidence < 80,
    )
    .sort(
      (a, b) =>
        draft.reports[b.player.id].estimatedPotential -
        draft.reports[a.player.id].estimatedPotential,
    )[0];
  if (target && g.round % 4 === 0) {
    const current = draft.reports[target.player.id];
    draft.reports[target.player.id] = reportFor(
      target.player,
      clamp(current.confidence + 4, 0, 100),
      g.round,
    );
  }
}

function weightedLottery(pool: Team[], r: RNG) {
  const weighted = pool.flatMap((team, i) =>
    Array.from({ length: Math.max(1, pool.length - i) }, () => team),
  );
  return r.pick(weighted);
}

export function openDraft(g: Game, r = new RNG(g.seed)) {
  const draft = ensureDraft(g);
  if (draft.status !== "scouting") return;
  const reverse = rankedTeams(g.teams).reverse();
  const lotteryPool = reverse.slice(0, 16);
  const lottery: Team[] = [];
  while (lottery.length < 3) {
    const winner = weightedLottery(
      lotteryPool.filter((team) => !lottery.includes(team)),
      r,
    );
    lottery.push(winner);
  }
  const firstRound = [
    ...lottery,
    ...reverse.filter((t) => !lottery.includes(t)),
  ];
  draft.picks = Array.from({ length: 7 }, (_, round) =>
    (round === 0 ? firstRound : reverse).map((team, index) => ({
      year: draft.year,
      round: round + 1,
      overall: round * 32 + index + 1,
      team: team.id,
      originalTeam: team.id,
    })),
  ).flat();
  draft.currentPick = 0;
  draft.status = "draft";
  g.news.unshift(
    tx(
      g,
      `Драфт ${draft.year} открыт. Лотерея: ${lottery.map((t) => t.id).join(", ")}.`,
      `The ${draft.year} draft is open. Lottery: ${lottery.map((t) => t.id).join(", ")}.`,
    ),
  );
  advanceDraftToUser(g);
}

function needsScore(team: Team, player: Player) {
  const count = team.players.filter((p) => p.pos === player.pos).length;
  const prospectCount = (team.prospects ?? []).filter(
    (p) => p.pos === player.pos,
  ).length;
  return Math.max(0, 8 - count - prospectCount) * 2;
}

function aiChoice(g: Game, team: Team) {
  const draft = ensureDraft(g);
  return draft.prospects
    .filter((p) => !p.draftedBy)
    .sort(
      (a, b) =>
        b.player.potential * 0.65 +
          b.player.ovr * 0.25 +
          needsScore(team, b.player) -
          (a.player.potential * 0.65 +
            a.player.ovr * 0.25 +
            needsScore(team, a.player)) || a.trueRank - b.trueRank,
    )[0];
}

function assignPick(g: Game, prospectId: string) {
  const draft = ensureDraft(g);
  const pick = draft.picks[draft.currentPick];
  if (!pick) throw Error("Draft is complete");
  const prospect = draft.prospects.find(
    (p) => p.player.id === prospectId && !p.draftedBy,
  );
  if (!prospect) throw Error("Prospect unavailable");
  prospect.draftedBy = pick.team;
  prospect.draftedOverall = pick.overall;
  pick.prospectId = prospectId;
  const team = g.teams.find((t) => t.id === pick.team)!;
  team.prospects ??= [];
  const drafted = structuredClone(prospect.player);
  drafted.draftOverall = pick.overall;
  team.prospects.push(drafted);
  draft.currentPick++;
  if (draft.currentPick >= draft.picks.length) {
    draft.status = "complete";
    g.news.unshift(tx(g, `Драфт ${draft.year} завершён.`, `The ${draft.year} draft is complete.`));
  }
}

export function advanceDraftToUser(g: Game) {
  const draft = ensureDraft(g);
  if (draft.status !== "draft") return;
  while (
    draft.currentPick < draft.picks.length &&
    draft.picks[draft.currentPick].team !== g.user
  ) {
    const team = g.teams.find(
      (t) => t.id === draft.picks[draft.currentPick].team,
    )!;
    assignPick(g, aiChoice(g, team).player.id);
  }
}

export function makeUserDraftPick(g: Game, prospectId: string) {
  const draft = ensureDraft(g);
  if (draft.status !== "draft") throw Error("Draft is not active");
  const pick = draft.picks[draft.currentPick];
  if (!pick || pick.team !== g.user)
    throw Error("Your club is not on the clock");
  assignPick(g, prospectId);
  advanceDraftToUser(g);
}

export function autoCompleteDraft(g: Game) {
  const draft = ensureDraft(g);
  if (draft.status === "scouting") openDraft(g);
  while (draft.status === "draft") {
    const pick = draft.picks[draft.currentPick];
    const team = g.teams.find((t) => t.id === pick.team)!;
    const shortlisted = draft.shortlist
      .map((id) => draft.prospects.find((p) => p.player.id === id))
      .find((p) => p && !p.draftedBy);
    assignPick(
      g,
      (pick.team === g.user && shortlisted ? shortlisted : aiChoice(g, team))
        .player.id,
    );
  }
}

export function prepareNextDraft(g: Game, r: RNG) {
  if (g.draft?.status === "complete") {
    g.draftHistory ??= [];
    g.draftHistory.push({
      year: g.draft.year,
      picks: g.draft.picks.map((pick) => {
        const prospect = g.draft!.prospects.find(
          (item) => item.player.id === pick.prospectId,
        )!;
        return {
          ...pick,
          player: prospect.player.name,
          pos: prospect.player.pos,
        };
      }),
    });
  }
  g.draft = createDraftState(g.year + 1, r);
}
