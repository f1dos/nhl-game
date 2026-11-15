import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOfficialIdentitySnapshot, newGame } from "../src/engine/database";
import {
  callUpFromFarm,
  sendToFarm,
  swapLineupPlayer,
} from "../src/engine/roster";
import {
  ensureSpecialTeams,
  setSpecialTeamPlayer,
} from "../src/engine/tactics";
import { validateSave } from "../src/engine/saves";

test("2026/27 identity dataset covers 32 clubs and 794 verified roster entries", () => {
  const g = newGame("TOR", 202627);
  const organizationPlayers = g.teams.flatMap((team) => [
    ...team.players,
    ...(team.farm ?? []),
  ]);
  const players = organizationPlayers.filter(
    (player) => player.identitySource === "nhl-api",
  );
  assert.equal(players.length, 794);
  assert.equal(new Set(players.map((player) => player.externalId)).size, 794);
  assert(players.every((player) => player.identitySource === "nhl-api"));
  assert.equal(
    organizationPlayers.filter(
      (player) => player.identitySource === "hockeytech",
    ).length,
    809,
  );
  assert(players.every((player) => player.name.includes(" ")));
  assert(g.teams.every((team) => team.logoUrl?.includes(team.id)));
  assert.equal(g.dataSource?.season, "2026/27");
});

test("farm assignment and recall preserve ownership, roster legality and save integrity", () => {
  const g = newGame("TOR", 88);
  const team = g.teams.find((item) => item.id === g.user)!;
  assert((team.farm?.length ?? 0) > 0);
  const onIce = new Set([
    ...team.lines.flat(),
    ...team.defense.flat(),
    team.goalie,
  ]);
  const unit = (player: (typeof team.players)[number]) =>
    player.pos === "D" ? "D" : player.pos === "G" ? "G" : "F";
  const minimum = { F: 12, D: 6, G: 2 };
  const spare = team.players.find(
    (player) =>
      !onIce.has(player.id) &&
      team.players.filter((item) => unit(item) === unit(player)).length >
        minimum[unit(player)],
  )!;
  const activeBefore = team.players.length;
  const farmBefore = team.farm!.length;
  sendToFarm(g, spare.id);
  assert.equal(team.players.length, activeBefore - 1);
  assert.equal(team.farm!.length, farmBefore + 1);
  assert(team.farm!.some((player) => player.id === spare.id));
  callUpFromFarm(g, spare.id);
  assert.equal(team.players.length, activeBefore);
  assert.equal(team.farm!.length, farmBefore);
  assert(team.players.some((player) => player.id === spare.id));
  assert.equal(g.transactions?.length, 2);
  assert(validateSave(JSON.parse(JSON.stringify(g))));
});

test("legacy career identity migration preserves simulation data", () => {
  const g = newGame("SJS", 51);
  const player = g.teams[0].players[0];
  const preserved = {
    id: player.id,
    ovr: player.ovr,
    potential: player.potential,
    salary: player.salary,
  };
  for (const team of g.teams) {
    team.logoUrl = undefined;
    for (const item of [...team.players, ...(team.farm ?? [])]) {
      item.externalId = undefined;
      item.headshot = undefined;
      item.identitySource = "generated";
      item.name = `Generated ${item.id}`;
    }
  }
  g.dataSource = undefined;
  applyOfficialIdentitySnapshot(g);
  assert.equal(player.id, preserved.id);
  assert.equal(player.ovr, preserved.ovr);
  assert.equal(player.potential, preserved.potential);
  assert.equal(player.salary, preserved.salary);
  assert(player.externalId);
  assert(player.headshot);
  assert(g.teams.every((team) => team.logoUrl));
  assert(validateSave(JSON.parse(JSON.stringify(g))));
});

test("lineup changes swap existing players instead of duplicating one across lines", () => {
  const game = newGame("NYR", 52);
  const team = game.teams.find((club) => club.id === "NYR")!;
  const first = team.lines[0][0];
  const second = team.lines[1][1];
  swapLineupPlayer(team, "lines", 0, 0, second);
  assert.equal(team.lines[0][0], second);
  assert.equal(team.lines[1][1], first);
  const active = [...team.lines.flat(), ...team.defense.flat(), team.goalie];
  assert.equal(new Set(active).size, 19);
  assert(validateSave(game));
});

test("all manpower situations have unique configurable special-team units", () => {
  const game = newGame("NYR", 53);
  const team = game.teams.find((club) => club.id === "NYR")!;
  const units = ensureSpecialTeams(team);
  assert.equal(Object.keys(units).length, 9);
  for (const unit of Object.values(units))
    assert.equal(new Set(unit!.players).size, unit!.players.length);
  const unit = units["5v4"]!;
  assert.throws(
    () => setSpecialTeamPlayer(team, "5v4", 1, unit.players[0]),
    /уже назначен/,
  );
});
