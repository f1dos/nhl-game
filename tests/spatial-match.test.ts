import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { SpatialMatch } from "../src/engine/spatialMatch";

test("spatial scoring stays in hockey-scale ranges across thirty seeded games", () => {
  const g=newGame();let goals=0,shots=0;
  for(let seed=0;seed<30;seed++) {
    const m=new SpatialMatch(g.teams[seed%32],g.teams[(seed+1)%32],seed);
    while(!m.done){m.resume();m.step();}
    const total=m.result.goals.reduce((a,b)=>a+b,0);
    assert(total<20,`runaway score in seed ${seed}: ${total}`);
    goals+=total;shots+=m.result.shots.reduce((a,b)=>a+b,0);
  }
  assert(goals/30>=3&&goals/30<=9,`goals/game ${goals/30}`);
  assert(shots/30>=35&&shots/30<=85,`shots/game ${shots/30}`);
  console.log("SPATIAL BALANCE",{games:30,goals:goals/30,shots:shots/30});
});

test("loose puck is recovered instead of players parking outside pickup radius", () => {
  const g = newGame();
  const m = new SpatialMatch(g.teams[0], g.teams[1], 5);
  const state = m as unknown as { owner: string; flight: unknown };
  state.owner = ""; state.flight = undefined;
  m.frame.puck.x = 18; m.frame.puck.z = 8;
  for (let i=0; i<150; i++) m.step();
  assert(Math.hypot(m.frame.puck.x-18,m.frame.puck.z-8)>2, "play must continue after the loose puck");
});

test("spatial simulation is incremental, deterministic and stays inside the rink", () => {
  const g = newGame();
  const a = new SpatialMatch(g.teams[0], g.teams[1], 42);
  const b = new SpatialMatch(g.teams[0], g.teams[1], 42);
  assert.equal(a.time, 0);
  assert.equal(
    a.result.shots.reduce((x, y) => x + y),
    0,
  );
  for (let i = 0; i < 2500; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.time, 250);
  assert.deepEqual(a.frame, b.frame);
  assert.deepEqual(a.result, b.result);
  assert(
    a.frame.bodies.every(
      (body) => Math.abs(body.x) <= 29 && Math.abs(body.z) <= 12,
    ),
  );
  assert.equal(
    new Set(a.frame.bodies.map((body) => body.id)).size,
    a.frame.bodies.length,
  );
});

test("a live command changes future simulation without changing played events", () => {
  const g = newGame();
  const a = new SpatialMatch(g.teams[0], g.teams[1], 12);
  const b = new SpatialMatch(g.teams[0], g.teams[1], 12);
  for (let i = 0; i < 500; i++) {
    a.step();
    b.step();
  }
  const before = structuredClone(a.result.events);
  a.teams[0].tactics.pace = 20;
  b.teams[0].tactics.pace = 90;
  for (let i = 0; i < 500; i++) {
    a.step();
    b.step();
  }
  assert.deepEqual(a.result.events.slice(0, before.length), before);
  assert.notDeepEqual(a.frame, b.frame);
});

test("full spatial game finishes, pauses at intervals and records goalie shots correctly", () => {
  const g = newGame();
  const match = new SpatialMatch(g.teams[0], g.teams[1], 71);
  let pauses = 0;
  for (let i = 0; i < 40000 && !match.done; i++) {
    if (match.intermission) {
      const time = match.time;
      match.step();
      assert.equal(match.time, time);
      pauses++;
      match.resume();
    }
    match.step();
  }
  assert(match.done);
  assert(pauses >= 2);
  assert.notEqual(match.result.goals[0], match.result.goals[1]);
  const snapshot = structuredClone(match.result);
  match.step();
  assert.deepEqual(match.result, snapshot);
  match.teams.forEach((team, side) =>
    assert.equal(
      team.players.reduce((n, p) => n + p.stats.sog, 0),
      match.result.shots[side],
    ),
  );
});
