import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { SpatialMatch } from "../src/engine/spatialMatch";
import { insideRink } from "../src/engine/rink";

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

test("opening draw can travel to support or break loose between the centres", () => {
  const game=newGame();
  let clean=false, contested=false;
  for(let seed=1;seed<=12;seed++){
    const m=new SpatialMatch(game.teams[0],game.teams[1],seed);
    const taker=m.frame.cues.find(c=>c.kind==="faceoff")!.id;
    const tied=!m.frame.carrierId;
    for(let i=0;i<10;i++){
      m.step();
      if(tied && !m.frame.carrierId && Math.hypot(m.frame.puck.x,m.frame.puck.z)>.08) contested=true;
      if(!tied && !m.frame.carrierId && m.frame.passTarget && m.frame.passTarget!==taker) clean=true;
    }
  }
  assert(clean,"a clean win must leave the centre's stick and travel to support");
  assert(contested,"a tied draw must produce a moving, recoverable loose puck");
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
      (body) => {
        const inside = insideRink(body.x, body.z, .68);
        return Math.hypot(body.x-inside.x, body.z-inside.z) < .001;
      },
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
    const before = new Set(cued.frame.bodies.map(b => b.id));
    cued.step();
    for (const cue of cued.frame.cues) {
      if (cue.seq <= last) continue;
      assert.equal(cue.seq, last + 1, "cue sequence numbers have no gaps");
      last = cue.seq;
      seen.set(cue.kind, (seen.get(cue.kind) ?? 0) + 1);
      assert(before.has(cue.id) || cued.frame.bodies.some((b) => b.id === cue.id),
        `action ${cue.kind} should belong to a skater on the ice during this tick`);
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
        assert(shown.frame.bodies.every((b) => {
          const inside = insideRink(b.x, b.z, .68);
          return Math.hypot(b.x-inside.x, b.z-inside.z) < .001;
        }));
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
    const goals = shown.result.events.filter(event => event.type === "goal");
    // A 0-0 regulation game ends on the overtime winner without another draw.
    const suddenDeathOnly = shown.result.ot && !shown.result.so && goals.length === 1;
    const expectedGoalPhases = suddenDeathOnly ? ["celebrate"] : ["celebrate", "lineup", "drop"];
    if (goals.length)
      assert.deepEqual([...(phases.get("goal") ?? [])].filter(p => p !== "review"), expectedGoalPhases);
    assert.deepEqual([...(phases.get("save") ?? new Set())].filter(p=>p!=="review").sort(), ["drop", "lineup", "whistle"]);
  }
});

test("centres hold their planted opening stance through puck release", () => {
  const game=newGame();
  const match=new SpatialMatch(game.teams[0],game.teams[1],4,false,{presentation:true,openingDraw:true});
  const feet=match.frame.bodies.filter(b=>!b.goalie && Math.hypot(b.x,b.z)<1)
    .map(({id,x,z})=>({id,x,z}));
  assert.equal(feet.length,2);
  let ticks=0;
  do {
    match.step();
    for(const foot of feet){
      const player=match.frame.bodies.find(b=>b.id===foot.id)!;
      assert(Math.hypot(player.x-foot.x,player.z-foot.z)<.001);
      assert(Math.hypot(player.vx,player.vz)<.001);
    }
    ticks++;
  } while(match.frame.stoppage && ticks<100);
  assert(!match.frame.stoppage && ticks>1);
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
      assert(Math.abs(taker.x-rival.x)>=1.6 && Math.abs(taker.x-dot.x)<.9 && taker.z===dot.z && (taker.x-dot.x)*(rival.x-dot.x)<0, "centres contest the dot from opposite sides");
      assert(Math.hypot(rival.x - dot.x, rival.z - dot.z) < 1, "opposing centre faces off on the dot");
      if (stopped.kind === "save") {
        const restartX=stopped.review==="interference" ? 7.62-1.5 : 20.5;
        assert.equal(Math.abs(dot.x), restartX, "use the restart for the actual ruling");
        const goalie = m.frame.bodies.find((b) => b.goalie && b.side === stopped.side)!;
        assert.equal(Math.sign(dot.x), Math.sign(goalie.x), "in the goalie's own end");
      }
      checked++;
    }
  }
  assert(checked >= 3);
});

test("an early attacker must tag up before touching a dump-in", () => {
  const g = newGame();
  for (const tagsUp of [true, false]) {
    const match = new SpatialMatch(g.teams[0], g.teams[1], 3, false, {presentation:true});
    const state = match as unknown as {owner:string; flight:unknown; decision:number};
    const attackers = match.frame.bodies.filter(b => !b.goalie && b.side === 0);
    for (const [i, b] of match.frame.bodies.entries()) {
      b.x = -12 + i;
      b.z = i % 2 ? 7 : -7;
      b.vx = b.vz = 0;
    }
    attackers[0].x = 11;
    attackers[0].z = 0;
    match.frame.puck.x = 7.4;
    match.frame.puck.z = 0;
    state.owner = "";
    state.decision = 20;
    state.flight = {vx:12, vz:0, shooter:attackers[1].id, side:0, shot:false, kind:"dump", remaining:1};
    match.step();
    assert.equal(match.frame.delayedOffside, 0);
    assert.equal(match.stopped, false);
    if (tagsUp) {
      attackers[0].x = 6.8;
      match.step();
      assert.equal(match.frame.delayedOffside, undefined);
    } else {
      state.flight = undefined;
      state.owner = attackers[0].id;
      match.step();
      assert.equal(match.frame.stoppage?.kind, "offside");
      assert.equal(match.frame.stoppage.dot.x, 6.12);
      assert.equal(match.result.events.at(-1)?.type, "offside");
    }
  }
});

test("a tired line stays on under pressure and changes one skater at the gate", () => {
  const g = newGame();
  const m = new SpatialMatch(g.teams[0], g.teams[1], 8);
  const state = m as unknown as {owner:string; decision:number};
  const start = m.frame.bodies.filter(b => b.side === 0 && !b.goalie);
  const original = start.map(b => b.id);
  state.owner = start[0].id;
  state.decision = 100;
  m.time = 80;
  m.frame.puck.x = start[0].x = -18;
  m.step();
  assert.deepEqual(start.map(b => b.id), original);
  m.frame.puck.x = start[0].x = 15;
  const outgoing = start[1];
  outgoing.x = -8.5; outgoing.z = -11.4;
  m.step();
  assert.equal(start[0].id, original[0]);
  assert.equal(start.filter(b => !original.includes(b.id)).length, 1);
  assert(Math.abs(outgoing.z + 11.4) < .3);
  assert.equal(new Set(m.frame.bodies.map(b => b.id)).size, m.frame.bodies.length);
});

test("fast opponents cannot tunnel past one another between samples", async () => {
  const {separateSkaters} = await import("../src/engine/rink");
  const before = [{x:-1, z:0}, {x:1, z:0}];
  const bodies = [{x:.6,z:0,vx:16,vz:2,goalie:false}, {x:-.6,z:0,vx:-16,vz:2,goalie:false}];
  separateSkaters(bodies, before);
  assert(bodies[1].x - bodies[0].x >= .839);
  assert.equal(bodies[0].vz, 2);
  assert.equal(bodies[0].vx, bodies[1].vx);
});

test("icing keeps the clearing team's tired skaters while its opponent can change", () => {
  const g = newGame();
  const m = new SpatialMatch(g.teams[0], g.teams[1], 18);
  const state = m as unknown as {owner:string; flight:unknown};
  m.time = 90;
  const before = [0,1].map(s => m.frame.bodies.filter(b => b.side === s).map(b => b.id));
  m.frame.puck.x = 25.5;
  m.frame.puck.z = 6;
  state.owner = "";
  state.flight = {side:0, shooter:before[0][0], kind:"clear", vx:18, vz:0, remaining:2, shot:false, icingSide:0};
  m.step();
  const after = [0,1].map(s => m.frame.bodies.filter(b => b.side === s).map(b => b.id));
  assert.deepEqual(after[0], before[0]);
  assert.notDeepEqual(after[1], before[1]);
  assert.equal(m.frame.dot.x, -20.5);
});

test("broadcast clock advances two seconds per second of normal-speed skating", () => {
  const g = newGame();
  const create = (clockRate: 1 | 2) => new SpatialMatch(g.teams[0], g.teams[1], 42, false, {clockRate});
  const normal = create(1), broadcast = create(2);
  for (let tick=0; tick<10; tick++) { normal.step(); broadcast.step(); }
  assert.equal(normal.time, 1);
  assert.equal(broadcast.time, 2);
  assert.equal(broadcast.frame.tick, normal.frame.tick);
  for (const [index, body] of broadcast.frame.bodies.entries()) {
    const reference = normal.frame.bodies[index];
    assert(Math.hypot(body.x-reference.x, body.z-reference.z)<.005);
  }
  assert(Math.hypot(normal.frame.puck.x-broadcast.frame.puck.x,normal.frame.puck.z-broadcast.frame.puck.z)<.005);
});

test("a puck pinned against the boards resolves within five playing seconds", () => {
  const g = newGame();
  const m = new SpatialMatch(g.teams[0], g.teams[1], 107);
  const internal = m as unknown as {owner:string;flight?:unknown};
  internal.owner=""; internal.flight=undefined;
  m.frame.puck={x:0,z:13.15,y:.018};
  const skaters = [0,1].map(side=>m.frame.bodies.find(b=>b.side===side && !b.goalie)!);
  skaters.forEach((b,i)=>Object.assign(b,{x:i ? .42 : -.42,z:12.45,vx:0,vz:0}));
  let resolved=false;
  for (let i=0;i<50;i++) {
    m.step();
    if (m.frame.carrierId || m.frame.stoppage) { resolved=true;break; }
  }
  assert(resolved);
});

test("a fresh defence pair must relieve the puck holder last during a protected regroup", () => {
  const game=newGame("TOR",812);
  const team=game.teams[0], match=new SpatialMatch(team,game.teams[1],81);
  type Body=typeof match.frame.bodies[number];
  type Point={x:number;z:number};
  const state=match as unknown as {
    direction(side:number):number;
    regroup?:{holder:string;outlet:boolean};
    rolling:(string[]|undefined)[];
    lineChangeRoutes(spots:Map<string,Point>, owner:Body):void;
  };
  const ice=match.frame.bodies.filter(b=>b.side===0 && !b.goalie);
  const holder=ice.find(b=>team.players.find(p=>p.id===b.id)?.pos==="D")!;
  const d=state.direction(0);
  holder.x=-d*27.5;holder.z=1;
  Object.assign(match.frame.puck,{x:holder.x,z:holder.z});
  const routes=new Map<string,Point>();
  match.time=105;
  state.lineChangeRoutes(routes,holder);
  assert.equal(state.regroup?.holder,holder.id);
  assert(!state.rolling[0]?.includes(holder.id));
  assert(routes.get(holder.id)!.x*d < -26);
  for(let change=0;change<4;change++){
    for(const b of ice)if(b!==holder){b.x=-8.5;b.z=-11.4;}
    match.time+=1.25;
    state.lineChangeRoutes(routes,holder);
    assert(ice.includes(holder) && holder.id===state.regroup?.holder);
  }
  match.time+=1.25;
  state.lineChangeRoutes(routes,holder);
  assert(state.regroup?.outlet);
  const relief=ice.find(b=>b!==holder)!;
  const original=holder.id;
  holder.x=-8.5;holder.z=-11.4;
  match.time+=1.25;
  state.lineChangeRoutes(routes,relief);
  assert(!ice.some(b=>b.id===original));
});

test("an immobilized crease scrum gets one helper on each side and a whistle within six seconds",()=>{
  const game=newGame("TOR",393), match=new SpatialMatch(game.teams[0],game.teams[1],16,false,{presentation:true});
  const state=match as unknown as {owner:string;decision:number;flight?:unknown;nextChallenge:number;
    skate:()=>void;netBattle?:{helpers:string[]};pendingPass?:unknown};
  const two=match.frame.bodies.filter(b=>!b.goalie);
  for(const side of [0,1]){
    const line=two.filter(b=>b.side===side);
    line.forEach((b,i)=>{b.x=24-i*.6;b.z=(side?1:-1)*(i+.45);b.vx=b.vz=0;});
  }
  const holder=two[0];state.owner=holder.id;state.flight=state.pendingPass=undefined;
  state.nextChallenge=state.decision=10000;state.skate=()=>{};
  Object.assign(match.frame.puck,{x:holder.x,z:holder.z,y:.018});
  const helpers=new Set<string>();
  for(let i=0;i<60 && !match.frame.stoppage;i++){
    match.step();
    state.netBattle?.helpers.forEach(id=>helpers.add(id));
  }
  assert.equal(helpers.size,2);
  assert.deepEqual([...helpers].map(id=>two.find(b=>b.id===id)?.side).sort(),[0,1]);
  assert(["save","trapped"].includes(match.frame.stoppage?.kind??""));
  assert(match.time<=6);
});

for(const [label,x,z] of [["side boards",18,10.4],["end corner",-24,-8.5]] as const){
  test("a stationary contested puck gets support at the "+label,()=>{
    const g=newGame("TOR",393),m=new SpatialMatch(g.teams[0],g.teams[1],16,false,{presentation:true,clockRate:2});
    const state=m as unknown as {owner:string;decision:number;flight?:unknown;nextChallenge:number;
      skate:()=>void;netBattle?:{helpers:string[]};pendingPass?:unknown};
    for(const side of [0,1]){
      m.frame.bodies.filter(b=>b.side===side && !b.goalie).forEach((b,i)=>{
        b.x=x+(side?-.4:.4);b.z=z-Math.sign(z)*i*1.4;b.vx=b.vz=0;
      });
    }
    const holder=m.frame.bodies.find(b=>!b.goalie)!;
    state.owner=holder.id;state.flight=state.pendingPass=undefined;state.skate=()=>{};
    state.nextChallenge=state.decision=10000;Object.assign(m.frame.puck,{x,z,y:.018});
    let support:string[]=[];
    for(let i=0;i<75 && !m.frame.stoppage;i++){m.step();support=state.netBattle?.helpers??support;}
    assert.deepEqual(support.map(id=>m.frame.bodies.find(b=>b.id===id)?.side).sort(),[0,1]);
    assert.equal(m.frame.stoppage?.kind,"trapped");
    assert(m.time<=14);
  });
}
