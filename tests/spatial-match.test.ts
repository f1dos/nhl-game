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
  // Track how far play moves the puck: with end-zone faceoffs it can come back
  // near its starting spot by step 150, so check the whole sequence.
  let furthest = 0;
  for (let i=0; i<150; i++) { m.step(); furthest = Math.max(furthest, Math.hypot(m.frame.puck.x-18,m.frame.puck.z-8)); }
  assert(furthest>2, "play must continue after the loose puck");
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

test("presentation cues describe on-ice actions without affecting the result", () => {
  const g = newGame();
  const cued = new SpatialMatch(g.teams[0], g.teams[1], 9);
  const seen = new Map<string, number>();
  let last = 0;
  while (!cued.done) {
    cued.resume();
    cued.step();
    for (const cue of cued.frame.cues) {
      if (cue.seq <= last) continue;
      assert.equal(cue.seq, last + 1, "cue sequence numbers have no gaps");
      last = cue.seq;
      seen.set(cue.kind, (seen.get(cue.kind) ?? 0) + 1);
      assert(cued.frame.bodies.some((b) => b.id === cue.id) || cue.kind === "goal" || cue.kind === "check" || cue.kind === "penalty" || cue.kind === "save" || cue.kind === "shot" || cue.kind === "pass" || cue.kind === "faceoff");
    }
    assert(cued.frame.cues.length <= 24);
  }
  for (const kind of ["faceoff", "pass", "shot"]) assert((seen.get(kind) ?? 0) > 0, `no ${kind} cues in a full game`);
  const plain = new SpatialMatch(g.teams[0], g.teams[1], 9);
  while (!plain.done) { plain.resume(); plain.step(); }
  assert.deepEqual(plain.result, cued.result);
});

test("broadcast stoppages show celebrations and faceoffs without changing the match", () => {
  const g = newGame();
  for (const seed of [3, 17, 29]) {
    const plain = new SpatialMatch(g.teams[seed % 32], g.teams[(seed + 5) % 32], seed);
    const shown = new SpatialMatch(g.teams[seed % 32], g.teams[(seed + 5) % 32], seed, false, { presentation: true });
    const phases = new Map<string, Set<string>>();
    let frozen = 0;
    while (!plain.done) { plain.resume(); plain.step(); }
    for (let i = 0; i < 200000 && !shown.done; i++) {
      shown.resume();
      const before = shown.time;
      shown.step();
      const s = shown.frame.stoppage;
      if (s) {
        if (!phases.has(s.kind)) phases.set(s.kind, new Set());
        phases.get(s.kind)!.add(s.phase);
        if (shown.time === before) frozen++;
        assert(shown.frame.bodies.every((b) => Math.abs(b.x) <= 29 && Math.abs(b.z) <= 12));
        assert.equal(shown.frame.carrierId, undefined, "nobody carries the puck while play is stopped");
      }
    }
    assert(shown.done);
    assert.deepEqual(shown.result, plain.result, `seed ${seed}: result and events are identical`);
    assert.deepEqual(
      shown.teams.map((t) => t.players.map((p) => p.stats)),
      plain.teams.map((t) => t.players.map((p) => p.stats)),
    );
    assert(frozen > 0, "the clock stands still during stoppages");
    if (shown.result.goals[0] + shown.result.goals[1] > 0)
      assert.deepEqual([...phases.get("goal")!], ["celebrate", "lineup", "drop"]);
    assert.deepEqual([...(phases.get("save") ?? new Set())].sort(), ["drop", "lineup", "whistle"]);
  }
});

test("faceoffs line both teams up on the dot, and saves restart in that zone", () => {
  const g = newGame();
  const m = new SpatialMatch(g.teams[0], g.teams[1], 4, false, { presentation: true });
  let checked = 0;
  for (let i = 0; i < 60000 && !m.done && checked < 6; i++) {
    m.resume();
    const stopped = m.frame.stoppage;
    m.step();
    if (stopped?.phase === "drop" && !m.frame.stoppage) {
      const dot = m.frame.dot;
      const faceoff = m.frame.cues.at(-1)!;
      assert.equal(faceoff.kind, "faceoff");
      const taker = m.frame.bodies.find((b) => b.id === faceoff.id)!;
      const rival = m.frame.bodies.find((b) => b.id === faceoff.target)!;
      assert.deepEqual([taker.x, taker.z], [dot.x, dot.z], "winner takes the puck on the dot");
      assert(Math.hypot(rival.x - dot.x, rival.z - dot.z) < 1, "opposing centre faces off on the dot");
      if (stopped.kind === "save") {
        assert.equal(Math.abs(dot.x), 20.5, "save restarts at an end-zone dot");
        const goalie = m.frame.bodies.find((b) => b.goalie && b.side === stopped.side)!;
        assert.equal(Math.sign(dot.x), Math.sign(goalie.x), "in the goalie's own end");
      }
      checked++;
    }
  }
  assert(checked >= 3);
});
