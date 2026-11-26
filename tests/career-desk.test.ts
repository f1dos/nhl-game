import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import {
  advanceDay,
  addDays,
  ensureManagementState,
  fixtureDate,
} from "../src/engine/management";
import {
  ensureDraft,
  scoutProspect,
  progressScouting,
} from "../src/engine/draft";
import {
  agreeMinutes,
  beginDevelopment,
  reviewCareerPlans,
  evidenceRange,
  counterOffer,
  projectedPayroll,
  deadlineGroup,
  delegateReport,
} from "../src/engine/careerDesk";
import { payroll, evaluateTrade } from "../src/engine/trades";
import { validateSave } from "../src/engine/saves";
import type { ManagementEvent, Result } from "../src/engine/types";
const setup = () => {
  const g = newGame("TOR", 349);
  ensureManagementState(g);
  return { g, t: g.teams.find((t) => t.id === g.user)! };
};
test("actual career game records minutes; ten distinct games trigger exactly one player follow-up", () => {
  const { g, t } = setup(),
    p = t.players.find((p) => p.id === t.lines[0][0])!;
  g.calendar!.date = fixtureDate(g, 0);
  agreeMinutes(g, p.id, 19);
  agreeMinutes(g, p.id, 9);
  advanceDay(g);
  const a = g.iceAgreements![0];
  assert.equal(a.games, 1);
  assert.equal(a.minutes, g.last!.iceMinutes![p.id] ?? 0);
  for (let i = 1; i < 10; i++) {
    const r = { ...g.last!, iceMinutes: { [p.id]: 21 } };
    reviewCareerPlans(g, r, true);
    reviewCareerPlans(g, r, true);
    g.calendar!.date = addDays(g.calendar!.date, 1);
  }
  assert.equal(g.iceAgreements!.length, 1);
  assert.equal(a.games, 10);
  assert.equal(a.log?.length,10);
  assert.equal(new Set(a.log?.map(entry=>entry.date)).size,10);
  assert.equal(a.log?.reduce((sum,entry)=>sum+entry.minutes,0),a.minutes);
  assert.ok(a.status === "kept" || a.status === "broken");
  assert.equal(
    g.events!.filter(
      (x) =>
        x.playerId === p.id &&
        /Наш разговор|Our ice-time agreement/.test(x.title),
    ).length,
    1,
  );
  assert.deepEqual(
    validateSave(JSON.parse(JSON.stringify(g))).iceAgreements,
    g.iceAgreements,
  );
});
test("targeted observations cost capacity, narrow one interval and survive regional scouting", () => {
  const { g } = setup(),
    draft = ensureDraft(g),
    p = draft.prospects[0];
  draft.shortlist.push(p.player.id);
  draft.assignment = p.region;
  draft.scoutingPoints = 5;
  for (let i = 1; i <= 3; i++) {
    scoutProspect(g, p.player.id, "stride");
    assert.equal(draft.reports[p.player.id].observations!.stride, i);
  }
  g.round = 4;
  progressScouting(g);
  assert.equal(draft.scoutingPoints, 2);
  assert.deepEqual(draft.reports[p.player.id].observations, { stride: 3 });
  const [lo, hi] = evidenceRange(p.player, "stride", 3)!;
  assert.ok(hi - lo <= 3);
  assert.equal(evidenceRange(p.player, "pressure", 0), undefined);
});
test("affiliate assignment develops the agreed skill once; NHL stats and expired reports remain stable", () => {
  const { g, t } = setup(),
    p = t.farm!.find((p) => p.age <= 25 && p.pos !== "G")!;
  p.injury = 0;
  p.potential = Math.max(p.potential, p.ovr + 3);
  const original = p.attributes.acceleration,
    toi = p.stats.toi;
  beginDevelopment(g, p.id, "AHL", "stride");
  const a = g.developmentPlans![0];
  const r = { home: g.user, away: "BOS", iceMinutes: {} } as Result;
  for (let i = 0; i < 12; i++) {
    reviewCareerPlans(g, r, true);
    g.calendar!.date = addDays(g.calendar!.date, 1);
  }
  g.calendar!.date = a.due;
  reviewCareerPlans(g, undefined, false);
  reviewCareerPlans(g, undefined, false);
  assert.equal(a.games, 12);
  assert.equal(a.minutes, 228);
  assert.equal(p.stats.toi, toi);
  assert.equal(p.attributes.acceleration, Math.min(99, original + 2));
  assert.ok(a.outcome);
});
test("suggested trade counter is legal and changes no ownership until confirmed", () => {
  const { g, t } = setup();
  g.rules.cap = 350;
  const other = g.teams.find((x) => x !== t)!;
  const take = other.players.find((p) => p.pos === "C")!,
    give = t.players
      .filter((p) => p.pos === "C")
      .sort((a, b) => a.ovr - b.ovr)[0];
  take.ovr = 90;
  take.potential = 93;
  give.ovr = 60;
  give.potential = 61;
  const before = t.players.map((p) => p.id);
  const c = counterOffer(g, other.id, [give.id], [take.id], {})!;
  assert.ok(c);
  assert.ok(
    evaluateTrade(
      g,
      other.id,
      c.player ? [give.id, c.player] : [give.id],
      [take.id],
      { givePicks: c.pick ? [c.pick] : [] },
    ).accepted,
  );
  assert.deepEqual(
    before,
    t.players.map((p) => p.id),
  );
});
test("cap projection combines movements, renewal and already counted injured players", () => {
  const { t } = setup(),
    incoming = t.farm![0],
    out = t.players[0],
    ext = t.players[1];
  ext.years = 1;
  ext.injury = 7;
  ext.injuryStatus = "IR";
  const base = payroll(t.players),
    r = projectedPayroll(t, incoming, out.id, ext.id, 5);
  assert.ok(
    Math.abs(r.today - (base + payroll([incoming]) - payroll([out]) - ext.salary + 5)) <
      0.00001,
  );
  assert.equal(
    r.summer,
    [...t.players.filter((p) => p !== out), incoming].reduce(
      (n, p) => n + (p === ext ? 5 : p.years > 1 ? p.salary : 0),
      0,
    ),
  );
  assert.equal(t.players.includes(incoming), false);
});
test("inbox protects decisions and preserves a record of delegated reports", () => {
  const { g } = setup(),
    date = g.calendar!.date;
  const e = {
    id: "test-report",
    category: "scouting",
    priority: "normal",
    date,
    read: false,
    resolved: false,
    title: "Report",
    body: "Report",
  } as ManagementEvent;
  g.events!.push(e);
  assert.equal(deadlineGroup(e, date), 2);
  e.responseDue = date;
  assert.equal(deadlineGroup(e, date), 0);
  delegateReport(g, e.id);
  assert.ok(!e.resolved);
  e.responseDue = addDays(date, 6);
  assert.equal(deadlineGroup(e, date), 1);
  delete e.responseDue;
  delegateReport(g, e.id);
  assert.ok(e.resolved && e.assistantReviewed && e.read);
});

test("breaking a specific line promise costs trust even when total ice time is met",()=>{
 const {g,t}=setup(),p=t.players.find(x=>x.id===t.lines[0][0])!;
 agreeMinutes(g,p.id,14,1);const baseline=p.relationship??50;
 for(let i=0;i<10;i++){
   const r={home:t.id,away:"BOS",iceMinutes:{[p.id]:19},startingUnits:{[p.id]:i<7?1:2}} as unknown as Result;
   reviewCareerPlans(g,r,true);g.calendar!.date=addDays(g.calendar!.date,1);
 }
 const a=g.iceAgreements![0];assert.equal(a.roleGames,7);assert.equal(a.status,"broken");assert.ok(p.relationship!<baseline);
});
test("match-day medical decisions take precedence and a one-year renewal expires next summer",()=>{
 const {g,t}=setup(),p=t.players[0];p.years=1;
 const e={category:"medical",action:"injuries",priority:"high",requiresResponse:true,responseDue:addDays(g.calendar!.date,2)} as ManagementEvent;
 assert.equal(deadlineGroup(e,g.calendar!.date,false),1);assert.equal(deadlineGroup(e,g.calendar!.date,true),0);
 const r=projectedPayroll(t,undefined,"",p.id,4,1),two=projectedPayroll(t,undefined,"",p.id,4,2);
 assert.equal(two.today,r.today);assert.ok(Math.abs(two.summer-r.summer-4)<1e-6);
});
test("a goalie on an affiliate plan gets a starting rotation and develops a goalie-specific skill",()=>{
  const {g,t}=setup();
  const p=t.farm!.find(p=>p.pos==="G")!;
  assert.ok(p);p.age=22;p.injury=0;
  beginDevelopment(g,p.id,"AHL","pressure");
  const a=g.developmentPlans![0];
  for(let day=0;day<3;day++){
    reviewCareerPlans(g,{home:g.user,away:"BOS"} as Result,true);
    g.calendar!.date=addDays(g.calendar!.date,1);
  }
  assert.equal(a.focus,"reboundControl");assert.equal(a.games,2);assert.equal(a.minutes,120);
});
