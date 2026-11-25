import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { SpatialMatch } from "../src/engine/spatialMatch";

for (const contact of [true, false]) {
  test(
    "A screened goal is reviewed: " +
      (contact ? "attacker drives into goalie" : "clear view of legal screen"),
    () => {
      const game = newGame();
      const m = new SpatialMatch(game.teams[0], game.teams[1], 12, false, {
        presentation: true,
      });
      const setup = m as unknown as {
        owner: string;
        flight: unknown;
        rng: { next: () => number };
      };
      const team = m.frame.bodies.filter((b) => b.side === 0 && !b.goalie);
      const goalie = m.frame.bodies.find((b) => b.side === 1 && b.goalie)!;
      for (const [i, b] of m.frame.bodies.entries())
        Object.assign(b, { x: i - 8, z: 6, vx: 0, vz: 0 });
      Object.assign(goalie, { x: 25.3, z: 0 });
      Object.assign(team[1], {
        x: contact ? 24.65 : 23.9,
        z: 0,
        vx: contact ? 4 : 0,
        vz: 0,
      });
      m.frame.puck = { x: 25.7, y: 0.1, z: 0.1 };
      setup.owner = "";
      setup.rng.next = () => 0.001;
      setup.flight = {
        vx: 12,
        vz: 0,
        remaining: 1,
        shooter: team[0].id,
        shot: true,
        side: 0,
        distance: 4,
      };
      m.step();
      assert.equal(m.frame.stoppage?.phase, "review");
      assert.equal(
        m.frame.stoppage.review,
        contact ? "interference" : "confirmed",
      );
      assert.equal(m.result.goals[0], contact ? 0 : 1);
      assert.equal(
        m.result.events.filter((e) => e.type === "goal").length,
        contact ? 0 : 1,
      );
      const stoppedAt = m.time;
      const dot = { ...m.frame.stoppage.dot };
      for (let i = 0; i < 240 && m.frame.stoppage; i++) m.step();
      assert.equal(m.frame.stoppage, undefined);
      assert.equal(m.time, stoppedAt);
      assert.deepEqual(m.frame.dot, dot);
      assert.equal(dot.x === 0, !contact);
    },
  );
}
