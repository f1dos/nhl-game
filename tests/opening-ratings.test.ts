import { test } from "node:test";
import assert from "node:assert/strict";
import { openingRatings } from "../src/data/opening-ratings";
import { newGame } from "../src/engine/database";
import { allPlayers, stableHash } from "../src/engine/potential";
import { advance } from "../src/engine/season";
import { overall, setPlayerOverall } from "../src/engine/ratings";
import { trainTeam } from "../src/engine/training";
import { validateSave } from "../src/engine/saves";

test("opening roster adjustments reach real players and survive a save round trip", () => {
  assert.equal(Object.keys(openingRatings).length, 139);
  for (const seed of [1, 17, 260027]) {
    const game = validateSave(JSON.parse(JSON.stringify(newGame("NYR", seed))));
    const players = allPlayers(game);
    for (const [id, entry] of Object.entries(openingRatings)) {
      const matches = players.filter((p) => p.externalId === Number(id));
      assert.equal(matches.length, 1, id);
      const p = matches[0];
      if (entry.overall !== undefined)
        assert.equal(p.ovr, entry.overall, p.name);
      assert.equal(overall(p.pos, p.attributes, p.archetype), p.ovr, p.name);
      if (entry.potential) {
        assert(
          p.potential >= entry.potential[0] &&
            p.potential <= entry.potential[1],
          p.name,
        );
      }
    }
  }
});

test("Shesterkin receives the stored recovery outcome once", () => {
  for (const target of [87, 88]) {
    let seed = 1;
    while (
      (stableHash(seed + ":8478048:opening") % 20 === 0 ? 87 : 88) !== target
    )
      seed++;
    const game = validateSave(JSON.parse(JSON.stringify(newGame("NYR", seed))));
    const team = game.teams.find((t) => t.id === "NYR")!;
    const p = team.players.find((p) => p.externalId === 8478048)!;
    assert(p.injury > 0);
    while (p.injury > 0) {
      assert.equal(p.ovr, 89);
      trainTeam(team);
    }
    assert.equal(p.ovr, target);
    assert.equal(p.openingInjuryResolved, true);
    p.injury = 1;
    p.attributes = Object.fromEntries(
      Object.keys(p.attributes).map((key) => [key, 85]),
    );
    p.ovr = 85;
    trainTeam(team);
    assert.equal(p.ovr, 85);
  }
});

test("Bobrovsky ages in stages on the regular season calendar", () => {
  const outcomes = new Set<number>();
  for (const seed of [1, 2]) {
    const game = newGame("FLA", seed);
    const p = allPlayers(game).find((p) => p.externalId === 8475683)!;
    assert.equal(p.ovr, 75);
    for (const round of [31, 67]) {
      game.round = round;
      advance(game);
      assert.equal(p.ovr, round === 31 ? 74 : p.openingAgeingTarget);
    }
    outcomes.add(p.ovr);
  }
  assert.deepEqual(outcomes, new Set([73, 74]));
});

test("revision two updates an existing opening-season save exactly once", () => {
  const game = newGame("BOS", 19);
  delete game.openingRatingsRevision;
  const byId = (id: number) => allPlayers(game).find(p => p.externalId === id)!;
  const kulikov = byId(8475179);
  kulikov.ovr = 85;
  const fowler = byId(8484170);
  setPlayerOverall(fowler, 84);
  fowler.potential = 96;
  const imported = validateSave(game);
  assert.equal(imported.openingRatingsRevision, 2);
  assert.equal(kulikov.ovr, 78);
  assert.equal(fowler.ovr, 84);
  assert(fowler.potential >= 87 && fowler.potential <= 93);
  setPlayerOverall(kulikov, 79);
  const reloaded = validateSave(JSON.parse(JSON.stringify(imported)));
  assert.equal(allPlayers(reloaded).find(p => p.externalId === 8475179)?.ovr, 79);
});
