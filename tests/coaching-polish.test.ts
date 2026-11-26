import test from "node:test";
import assert from "node:assert/strict";
import { validateSave } from "../src/engine/saves";
import { newGame, setPlayerOverall } from "../src/engine/database";
import { ensureManagementState } from "../src/engine/management";
import { agreeMinutes, expectedMinutes } from "../src/engine/careerDesk";
import { openConversation } from "../src/engine/conversations";
import { SPECIAL_TEAM_STYLES } from "../src/engine/tactics";
import { unitSpots } from "../src/ui/TacticsBoard";

test("Bratt answers the actual ice-time offer and reacts once to a short offer", () => {
  for (const target of [9,22]) {
    const g = ensureManagementState(newGame("NJD",349));
    const t = g.teams.find(t => t.id === g.user)!;
    const p = t.players.find(p => p.name === "Jesper Bratt")!;
    assert.equal(t.players.find(p => p.externalId === 8476945)?.ovr,88);
    const before = p.morale;
    assert(expectedMinutes(t,p) > 9 && expectedMinutes(t,p) <= 22);
    agreeMinutes(g,p.id,target);
    const after = p.morale;
    agreeMinutes(g,p.id,target);
    assert.equal(p.morale,after);
    assert.equal(after < before,target === 9);
    const dialog = openConversation(g,p.id,"ice-time","challenge");
    assert.match(dialog.turns[0].text.ru,new RegExp(target+" мин"));
    assert.match(dialog.turns[1].text.ru,new RegExp(String(target)));
    assert.equal(dialog.mood,target === 9 ? "negative" : "positive");
    assert(!dialog.turns[1].text.ru.includes("19:00"));
  }
});

test("every legal special-teams scheme draws a distinct formation of the right size", () => {
  for (const [situation, styles] of Object.entries(SPECIAL_TEAM_STYLES)) {
    const count = Number(situation[0]);
    const shapes = styles.map(style => unitSpots(style,count));
    for (const shape of shapes) {
      assert.equal(shape.length,count);
      assert.equal(new Set(shape.map(String)).size,count);
    }
    assert.equal(new Set(shapes.map(s => JSON.stringify(s))).size,styles.length,situation);
  }
});


test("a midseason legacy save receives the goalie adjustment once", () => {
  const g = newGame("NJD", 349);
  const player = g.teams.flatMap(t => t.players).find(p => p.externalId === 8476945)!;
  delete player.startingRatingOverride;
  setPlayerOverall(player, 75);
  player.potential = 76;
  player.stats.gp = 3;
  player.formAdjustment = 1;
  const reload = () => validateSave(JSON.parse(JSON.stringify(g)));
  const updated = reload();
  const get = (game: typeof g) => game.teams.flatMap(t => t.players).find(p => p.externalId === 8476945)!;
  assert.equal(get(updated).ovr, 89);
  assert.equal(get(updated).stats.gp, 3);
  assert.equal(get(validateSave(JSON.parse(JSON.stringify(updated)))).ovr, 89);
});
