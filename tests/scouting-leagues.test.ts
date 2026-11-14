import { test } from "node:test";
import assert from "node:assert/strict";
import { SCOUT_LEAGUE_PLAYERS, SCOUT_LEAGUE_META } from "../src/data/scouting-leagues-2026-27";
import { newGame } from "../src/engine/database";

test("official junior and European league snapshots carry real named players and team identities", () => {
  const expected = { WHL: 400, USHL: 300, SHL: 250, Liiga: 450 };
  const allIds: string[] = [];
  for (const [league, minimum] of Object.entries(expected)) {
    const players = SCOUT_LEAGUE_PLAYERS[league as keyof typeof SCOUT_LEAGUE_PLAYERS];
    assert(players.length >= minimum, league + " source unexpectedly incomplete");
    assert.equal(SCOUT_LEAGUE_META.counts[league as keyof typeof SCOUT_LEAGUE_META.counts], players.length);
    for (const p of players) {
      assert(p.id.startsWith(league.toLowerCase() + "-"));
      assert(p.name.split(" ").length >= 2 && !/^(unknown|player\s+\d+)/i.test(p.name));
      assert(p.club.trim().length > 1);
      assert(["LW","C","RW","D","G"].includes(p.pos));
      assert(Number.isFinite(p.ovr) && p.ovr >= 40 && p.ovr <= 99);
      assert(Number.isFinite(p.potential) && p.potential >= p.ovr && p.potential <= 99);
      assert(["stats","provisional","game"].includes(p.model));
      allIds.push(p.id);
    }
  }
  assert.equal(allIds.length, new Set(allIds).size, "player identity duplicated between league snapshots");
});

test("scouting ratings use actual official season production for major junior and Liiga players", () => {
  for (const league of ["WHL","USHL","Liiga"] as const) {
    const players = SCOUT_LEAGUE_PLAYERS[league];
    assert(players.filter((p) => p.model === "stats" && (p.games ?? 0) >= 3).length > 80,
      league + " has no working per-player production data");
    assert(new Set(players.map((p) => p.ovr)).size >= 8, league + " ratings look uncalibrated");
  }
});

test("AHL stays in the club roster while OHL juniors stay in the world scouting pool", () => {
  const game = newGame("TOR", 260027);
  const team = game.teams.find((t) => t.id === "TOR")!;
  assert(team.farm?.some((p) => p.league === "AHL"));
  assert(game.juniorPlayers?.length);
  assert(game.juniorPlayers!.every((p) => p.league === "OHL"));
  assert(game.juniorPlayers!.every((p) => !team.players.some((x) => x.id === p.id)));
});
