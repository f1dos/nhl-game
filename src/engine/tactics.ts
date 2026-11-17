import type {
  Player,
  SpecialTeamsSituation,
  SpecialTeamUnit,
  Tactics,
  Team,
} from "./types";

export const SPECIAL_TEAM_LABELS: Record<SpecialTeamsSituation, string> = {
  "5v4": "Большинство 5 на 4",
  "5v3": "Двойное большинство 5 на 3",
  "4v3": "Большинство 4 на 3",
  "4v5": "Меньшинство 4 на 5",
  "3v5": "Двойное меньшинство 3 на 5",
  "3v4": "Меньшинство 3 на 4",
  "3v3": "Овертайм 3 на 3",
  "6v5": "Пустые ворота: атака 6 на 5",
  "5v6": "Защита против пустых ворот",
};

export const SPECIAL_TEAM_LABELS_EN: Record<SpecialTeamsSituation, string> = {
  "5v4": "Power play 5-on-4",
  "5v3": "Two-man advantage 5-on-3",
  "4v3": "Power play 4-on-3",
  "4v5": "Penalty kill 4-on-5",
  "3v5": "Two-man penalty kill 3-on-5",
  "3v4": "Penalty kill 3-on-4",
  "3v3": "Overtime 3-on-3",
  "6v5": "Empty net: 6-on-5 attack",
  "5v6": "Defending the empty net",
};

/** Special-teams situation label for the given UI language. */
export const specialTeamLabel = (
  situation: SpecialTeamsSituation,
  language?: string,
) =>
  !language || language === "ru"
    ? SPECIAL_TEAM_LABELS[situation]
    : SPECIAL_TEAM_LABELS_EN[situation];

export const SPECIAL_TEAM_STYLES: Record<
  SpecialTeamsSituation,
  SpecialTeamUnit["style"][]
> = {
  "5v4": ["umbrella", "overload", "net-front", "possession"],
  "5v3": ["umbrella", "overload", "net-front", "possession"],
  "4v3": ["umbrella", "overload", "net-front", "possession"],
  "4v5": ["box", "diamond", "aggressive", "protect-lead"],
  "3v5": ["wedge", "triangle", "aggressive", "protect-lead"],
  "3v4": ["triangle", "diamond", "aggressive", "protect-lead"],
  "3v3": ["possession", "aggressive", "protect-lead"],
  "6v5": ["net-front", "overload", "umbrella", "possession"],
  "5v6": ["protect-lead", "box", "diamond", "aggressive"],
};

export function ensureSpecialTeams(team: Team) {
  if (team.specialTeams && Object.keys(team.specialTeams).length === 9)
    return team.specialTeams;
  const forwards = [...team.players]
    .filter(
      (player) => player.pos !== "D" && player.pos !== "G" && !player.injury,
    )
    .sort((a, b) => b.ovr - a.ovr);
  const defenders = [...team.players]
    .filter((player) => player.pos === "D" && !player.injury)
    .sort((a, b) => b.ovr - a.ovr);
  const ids = (f: number, d: number) => [
    ...forwards.slice(0, f).map((player) => player.id),
    ...defenders.slice(0, d).map((player) => player.id),
  ];
  const defaults: Record<SpecialTeamsSituation, SpecialTeamUnit> = {
    "5v4": { players: ids(3, 2), style: "umbrella" },
    "5v3": { players: ids(3, 2), style: "overload" },
    "4v3": { players: ids(3, 1), style: "umbrella" },
    "4v5": { players: ids(2, 2), style: "box" },
    "3v5": { players: ids(1, 2), style: "wedge" },
    "3v4": { players: ids(1, 2), style: "triangle" },
    "3v3": { players: ids(2, 1), style: "possession" },
    "6v5": { players: ids(4, 2), style: "net-front" },
    "5v6": { players: ids(3, 2), style: "protect-lead" },
  };
  team.specialTeams = { ...defaults, ...(team.specialTeams ?? {}) };
  return team.specialTeams;
}

export function setSpecialTeamPlayer(
  team: Team,
  situation: SpecialTeamsSituation,
  slot: number,
  playerId: string,
) {
  const units = ensureSpecialTeams(team);
  const unit = units[situation]!;
  const occupied = unit.players.indexOf(playerId);
  if (!team.players.some((player) => player.id === playerId && !player.injury))
    throw Error("Игрок недоступен");
  if (occupied >= 0 && occupied !== slot)
    throw Error("Игрок уже назначен в эту спецбригаду");
  unit.players[slot] = playerId;
}

export function lineChemistry(players: Player[]) {
  if (!players.length) return 0;
  const average = (key: string) =>
    players.reduce((n, p) => n + p.attributes[key], 0) / players.length;
  const roles = new Set(players.map((p) => p.archetype).filter(Boolean)).size;
  const fatigue = players.reduce((n, p) => n + p.fatigue, 0) / players.length;
  return Math.round(
    Math.max(
      1,
      Math.min(
        100,
        average("teamwork") * 0.48 +
          average("decisions") * 0.34 +
          average("consistency") * 0.18 +
          Math.min(6, roles * 2) -
          fatigue * 0.15,
      ),
    ),
  );
}

export function tacticalAssessment(t: Tactics) {
  const forecheck =
    t.forecheck === "2-1-2" ? 8 : t.forecheck === "1-3-1" ? -5 : 1;
  return {
    possession: Math.round(
      Math.max(0, Math.min(100, 50 + forecheck + (t.pace - 50) * 0.18)),
    ),
    chanceVolume: Math.round(
      Math.max(
        0,
        Math.min(100, 45 + (t.shooting - 50) * 0.45 + (t.pace - 50) * 0.12),
      ),
    ),
    defensiveStability: Math.round(
      Math.max(
        0,
        Math.min(
          100,
          54 -
            (t.pace - 50) * 0.2 +
            (t.forecheck === "1-3-1" ? 12 : t.forecheck === "2-1-2" ? -7 : 2),
        ),
      ),
    ),
    penaltyRisk: Math.round(
      Math.max(
        0,
        Math.min(
          100,
          20 + t.physical * 0.55 + (t.forecheck === "2-1-2" ? 6 : 0),
        ),
      ),
    ),
  };
}
