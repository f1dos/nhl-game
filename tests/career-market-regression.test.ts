import { ageWorld } from "../src/engine/lifecycle";
import { recordPlayerPerformance } from "../src/engine/performance";
import { RNG } from "../src/engine/random";
import test from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/engine/database";
import { advance } from "../src/engine/season";
import { ensureDraft, openDraft, interviewProspect, INTERVIEW_TOPICS } from "../src/engine/draft";
import { revisePotential, scoutedPotential } from "../src/engine/potential";

test("simulated regular-season trades respect the actual fixture dates", () => {
  const g = newGame("TOR", 2201);
  while (g.phase === "regular") advance(g);
  const trades = (g.transactions ?? []).filter(t => t.date);
  assert(trades.length > 1);
  for (const t of trades) {
    assert(t.date! >= "2026-10-07" && t.date! <= "2027-03-05");
    assert(t.date! < "2026-12-19" || t.date! > "2026-12-27");
  }
});

test("a prospect can use one meeting for three questions on the draft floor", () => {
  const g = newGame("TOR", 2201);
  g.phase = "offseason";
  openDraft(g);
  const draft = ensureDraft(g), p = draft.prospects[0];
  const slots = draft.interviewsLeft!;
  for (const topic of INTERVIEW_TOPICS.slice(0,3)) interviewProspect(g,p.player.id,topic);
  assert.equal(draft.interviewsLeft, slots-1);
  assert.throws(()=>interviewProspect(g,p.player.id,INTERVIEW_TOPICS[3]));
  p.draftedBy = "TOR";
  assert.throws(()=>interviewProspect(g,p.player.id,INTERVIEW_TOPICS[4]));
});

test("young players' projections revise in the direction of sustained changes", () => {
  const p = newGame("TOR", 2201).teams[0].players[0];
  Object.assign(p,{age:22,ovr:81,potential:82});
  revisePotential(p,2027,1,2);
  assert(p.potential >= 83);
  assert(scoutedPotential(p,75).low >= 81);
  const ceiling = p.potential;
  p.ovr = 79;
  revisePotential(p,2028,-1,-2);
  assert(p.potential < ceiling && p.potential >= 79);
});

test("season review measures permanent progress from opening night", () => {
  const g = newGame("TOR", 591);
  const team = g.teams.find(t => t.id === g.user)!;
  const p = team.players.find(p => p.pos === "C")!;
  const opening = p.ovr - 2;
  p.seasonOpeningOverall = opening;
  const season = g.year++;
  g.awards = [{ year: season, key:"art-ross", team:team.id, playerId:p.id, player:p.name, pos:p.pos, line:"" }];
  recordPlayerPerformance(p, 60);
  ageWorld(g, new RNG(54));
  const report = p.developmentLog![0];
  assert.equal(report.year, season);
  assert.equal(report.ovrBefore, opening);
  assert.equal(report.delta, p.ovr - opening);
  assert(report.delta >= 2);
  assert.equal(p.seasonOpeningOverall, p.ovr);
});
