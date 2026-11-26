import assert from "node:assert/strict";
import { test } from "node:test";
import { newGame } from "../src/engine/database";
import { SpatialMatch } from "../src/engine/spatialMatch";
import {
  lineStyle,
  rememberOpponent,
  scoutBrief,
} from "../src/engine/coaching";
import {
  clubMatchTeams,
  nextClubFixture,
  createClubMatch,
} from "../src/engine/careerMatch";
import {
  advanceDay,
  ensureManagementState,
  fixtureDate,
} from "../src/engine/management";

test("home last change keeps the visitors on ice and respects icing and the drop", () => {
  const game = newGame();
  const m = createClubMatch(game.teams[0], game.teams[1], 39, false, true);
  const opponents = () =>
    m.frame.bodies.filter((b) => b.side === 1).map((b) => b.id);
  const away = opponents();
  assert.ok(m.selectHomeLine(1));
  assert.deepEqual(opponents(), away);
  assert.equal(m.deployedLine(0), 1);
  m.frame.stoppage!.kind = "icing";
  m.frame.stoppage!.side = 0;
  assert.equal(m.selectHomeLine(2), false);
  m.frame.stoppage!.side = 1;
  assert.ok(m.selectHomeLine(2));
  m.frame.stoppage!.phase = "drop";
  assert.equal(m.selectHomeLine(0), false);
});

test("a line receives its order on deployment and review frames preserve completed chances", () => {
  const game = newGame();
  const m = createClubMatch(game.teams[0], game.teams[1], 19, false, true);
  m.orderLine(0, 1, "2-1-2");
  assert.equal(m.orders[0].has(1), false);
  while (!m.done) {
    if (m.intermission) m.resume();
    m.step();
  }
  const applied = m.orders[0].get(1)!;
  assert.ok(applied.at > 0);
  const shifts = m.shifts.filter((s) => s.side === 0 && s.line === 1);
  assert.ok(shifts.length >= 5);
  assert.ok(
    shifts.every(
      (s) =>
        s.forecheck === "2-1-2" && s.start >= applied.at && s.end >= s.start,
    ),
  );
  assert.ok(m.result.matchups!.length > 4);
  assert.ok(
    m.result.matchups!.reduce((t, r) => t + r.seconds, 0) <= m.time + 0.1,
  );
  const chances = m.result.events.filter(
    (e) => e.type === "shot" || e.type === "goal",
  );
  assert.equal(chances.length, m.clips.size);
  const clip = [...m.clips.values()].find((f) => f.length >= 50)!;
  assert.ok(clip && clip.at(-1)!.tick - clip[0].tick >= 98);
  assert.ok(
    clip[0].bodies.length >= 8 && clip[0].bodies[0] !== m.frame.bodies[0],
  );
  const covers = chances.filter((e) => e.text.includes("фиксация")),
    rebounds = chances.filter((e) => e.text.includes("отскок"));
  assert.ok(covers.length > 0 && rebounds.length > 0);
  const firstClub = m.teams[0];
  rememberOpponent(firstClub, m.result);
  const brief = scoutBrief(firstClub)!;
  assert.equal(brief.games, 1);
  assert.ok(
    brief.examples.length > 0 &&
      brief.examples.every((e) => e.id === brief.target.id),
  );
  assert.ok(chances.some((e) => e.scoutFilm && e.scoutFilm.length >= 2));
});

test("a marked opponent is fixture-specific and the post-game report uses the same target", () => {
  const g = newGame("TOR", 71);
  ensureManagementState(g);
  g.calendar!.date = fixtureDate(g, 0);
  const fixture = nextClubFixture(g)!;
  const other = g.teams.find(
    (t) => t.id === (fixture.home === g.user ? fixture.away : fixture.home),
  )!;
  const target = scoutBrief(other)!.target;
  g.matchCoverage = {
    date: fixture.date,
    opponent: other.id,
    target: target.id,
  };
  assert.equal(
    clubMatchTeams(g, fixture).find((t) => t.id === g.user)!.tactics.markPlayer,
    target.id,
  );
  advanceDay(g);
  assert.equal(g.last!.scoutTarget!.id, target.id);
  assert.equal(g.last!.scoutTarget!.marked, true);
  assert.equal(
    g.teams.find((t) => t.id === g.user)!.tactics.markPlayer,
    undefined,
  );
});

test("open middle versus screened middle changes a support route; skills distinguish cycle and possession lines", () => {
  const g = newGame();
  const team = g.teams[0];
  for (const [i, line] of team.lines.entries())
    for (const id of line) {
      const p = team.players.find((p) => p.id === id)!;
      p.attributes.checking = p.attributes.strength = i === 0 ? 95 : 50;
      p.attributes.passing = p.attributes.puckControl = i === 0 ? 50 : 95;
    }
  assert.equal(lineStyle(team, 0), "cycle");
  assert.equal(lineStyle(team, 1), "skill");
  const m = new SpatialMatch(team, g.teams[1], 11);
  const home = m.frame.bodies.filter((b) => b.side === 0 && !b.goalie);
  const carrier = home[0];
  carrier.x = 0;
  carrier.z = 1;
  const opp = m.frame.bodies.filter((b) => b.side === 1 && !b.goalie);
  for (const b of opp) {
    b.x = 17;
    b.z = 8;
  }
  const positions = () => m["positions"](carrier, { x: 0, z: 1 });
  const open = positions();
  opp[0].x = 5;
  opp[0].z = 0;
  const closed = positions();
  assert.ok(
    home.some(
      (b) =>
        b !== carrier && Math.abs(closed.get(b.id)!.z - open.get(b.id)!.z) > 2,
    ),
  );
});

test("explicit line plans produce distinct support routes from the same puck position", () => {
  const g = newGame();
  const m = new SpatialMatch(g.teams[0],g.teams[1],51);
  const line = m.deployedLine(0);
  m["actualLine"][0] = line;
  const forwards=m.frame.bodies.filter(b=>b.side===0 && m.teams[0].lines[line].includes(b.id));
  const carrier=forwards[0];
  carrier.x=18; carrier.z=5;
  for(const b of m.frame.bodies.filter(b=>b.side===1)){b.x=-18;b.z=10}
  assert.equal(new Set(forwards.map(b=>m.roleFor(0,line,b.id))).size,3);
  const route=(plan:"wide"|"high"|"slot")=>{
    m.linePlans[0].set(line,plan);
    const spots=m["positions"](carrier,{x:18,z:5});
    return forwards.slice(1).map(b=>spots.get(b.id)!);
  };
  assert.ok(route("wide").every(p=>Math.abs(p.z)>=7));
  assert.ok(route("slot").some(p=>p.x>23 && Math.abs(p.z)<2));
  assert.ok(route("high").some(p=>p.x<15));
});

test("matching a visiting unit respects home icing and an exhausted counter",()=>{
  const g=newGame(),m=createClubMatch(g.teams[0],g.teams[1],71,false,false);
  const before=m.deployedLine(0),counter=(before+1)%4;
  for(let i=0;i<4;i++)m.counterLines.set(i,counter);
  m["changeAtWhistle"]("icing",0);
  assert.equal(m.deployedLine(0),before);
  const p=m.teams[0].players.find(p=>p.id===m.teams[0].lines[counter][0])!;
  p.fatigue=90;
  m["changeAtWhistle"]("save",1);
  assert.equal(m.deployedLine(0),before);
  p.fatigue=0;
  m["changeAtWhistle"]("save",1);
  assert.equal(m.deployedLine(0),counter);
});

test("scouting plans and the room address apply only to the selected fixture",()=>{
  const g=newGame("TOR",71);
  ensureManagementState(g);
  g.calendar!.date=fixtureDate(g,0);
  const fixture=nextClubFixture(g)!;
  const opponent=fixture.home===g.user?fixture.away:fixture.home;
  g.matchPreparation={date:fixture.date,opponent,plan:"wide",talk:{tone:"trust",message:"safe"}};
  const own=(date:string)=>clubMatchTeams(g,{...fixture,date}).find(t=>t.id===g.user)!;
  assert.deepEqual(own(fixture.date).tactics.benchOpening,{plan:"wide",message:"safe"});
  assert.equal(own("2999-01-01").tactics.benchOpening,undefined);
  assert.equal(g.teams.find(t=>t.id===g.user)!.tactics.benchOpening,undefined);
});

test("the rebound cue follows the same side as the simulated loose puck",()=>{
  const g=newGame(),m=createClubMatch(g.teams[0],g.teams[1],19,false,true);
  let rebound=false,held=false,last=0;
  while(!m.done && !(rebound&&held)){
    if(m.intermission)m.resume();
    m.step();
    for(const c of m.frame.cues.filter(c=>c.seq>last)){
      last=c.seq;
      if(c.kind!=="save")continue;
      if(c.saveOutcome==="held"){assert.equal(c.reboundDirection,undefined);held=true}
      if(c.saveOutcome==="rebound"){
        const d=c.reboundDirection!;
        assert.ok(Math.abs(Math.hypot(d.x,d.z)-1)<1e-8);
        const f=m["flight"];
        if(f?.kind==="loose"){
          assert.equal(Math.sign(f.vz),Math.sign(d.z));
          assert.equal(Math.sign(f.vx),Math.sign(d.x));
          rebound=true;
        }
      }
    }
  }
  assert.ok(held&&rebound);
});
