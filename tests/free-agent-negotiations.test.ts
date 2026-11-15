import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, createPlayer } from "../src/engine/database";
import { RNG } from "../src/engine/random";
import { askingSalary } from "../src/engine/contracts";
import {
  proposeFreeAgentContract, processFreeAgentOffers, withdrawFreeAgentOffer,
  desiredFreeAgentRole, freeAgentInterest,
} from "../src/engine/freeAgency";
import { ensureManagementState, advanceDay } from "../src/engine/management";
import { validateSave } from "../src/engine/saves";

function world() {
  const g = ensureManagementState(newGame("TOR", 424242));
  g.rules.cap = 220; // Isolate agent behavior from a full NHL cap.
  const p = createPlayer(new RNG(1001), "test-free-agent-001", "C", 73);
  p.age=24;p.ovr=76;p.potential=86;p.years=0;p.salary=0;
  g.freeAgents=[p];
  return {g,p};
}
test("free-agent offers are not signed immediately and persist across save/import",()=>{
  const {g,p}=world();
  const ask=askingSalary(p,g,g.user);
  const initial=g.teams.find(t=>t.id===g.user)!.players.length;
  const offer=proposeFreeAgentContract(g,p.id,3,ask*1.2,"top-six");
  assert.equal(offer.status,"pending");
  assert.equal(g.teams.find(t=>t.id===g.user)!.players.length,initial);
  assert(g.freeAgents?.some(x=>x.id===p.id));
  assert.doesNotThrow(()=>validateSave(JSON.parse(JSON.stringify(g))));
  assert.throws(()=>proposeFreeAgentContract(g,p.id,3,ask*1.2,"top-six"),/already reviewing/);
});
test("an underwhelming offer receives a real counter, and responding can result in an NHL contract",()=>{
  const {g,p}=world();
  const ask=askingSalary(p,g,g.user);
  const first=proposeFreeAgentContract(g,p.id,1,Math.max(.8,ask*.78),"depth");
  assert.equal(g.freeAgentOffers?.length,1);
  g.calendar!.date=first.decisionDate;
  const outcomes=processFreeAgentOffers(g);
  assert.equal(outcomes.length,1);
  assert.equal(first.status,"countered");
  assert(first.counterSalary && first.counterSalary>first.salary);
  assert.equal(first.counterRole,desiredFreeAgentRole(p));
  const revised=proposeFreeAgentContract(g,p.id,4,ask*1.65,"star");
  assert.equal(first.status,"withdrawn");
  g.calendar!.date=revised.decisionDate;
  const next=processFreeAgentOffers(g);
  assert(next.includes(revised));
  assert.equal(revised.status,"accepted");
  assert(!g.freeAgents?.some(x=>x.id===p.id));
  assert(g.teams.find(t=>t.id===g.user)!.players.some(x=>x.id===p.id&&x.years===4));
  assert.doesNotThrow(()=>validateSave(JSON.parse(JSON.stringify(g))));
});
test("weak offers can be declined, withdrawal is atomic, and role preference matters",()=>{
  const {g,p}=world();
  const ask=askingSalary(p,g,g.user);
  assert(freeAgentInterest(g,p,g.teams.find(t=>t.id===g.user)!)>=0);
  assert.throws(()=>proposeFreeAgentContract(g,p.id,0,ask,"depth"),/Invalid/);
  assert.equal(g.freeAgentOffers?.length??0,0);
  const bad=proposeFreeAgentContract(g,p.id,1,Math.max(.8,ask*.5),"depth");
  g.calendar!.date=bad.decisionDate;
  processFreeAgentOffers(g);
  assert.equal(bad.status,"rejected");
  assert(g.freeAgents?.some(x=>x.id===p.id));
  const next=proposeFreeAgentContract(g,p.id,3,ask*1.1,"top-six");
  withdrawFreeAgentOffer(g,next.id);
  assert.equal(next.status,"withdrawn");
  assert.throws(()=>withdrawFreeAgentOffer(g,next.id),/cannot be withdrawn/);
});
test("agent counteroffers become actionable inbox letters on the calendar",()=>{
  const {g,p}=world();
  g.phase="offseason"; // No real fixtures: free-agent negotiations must still progress.
  const ask=askingSalary(p,g,g.user);
  const offer=proposeFreeAgentContract(g,p.id,1,Math.max(.8,ask*.8),"depth");
  for(let day=0; day<5 && offer.status==="pending";day++) advanceDay(g);
  assert.equal(offer.status,"countered");
  const event=g.events?.find(e=>e.title.includes("Free agency:") && e.playerId===p.id);
  assert(event?.requiresResponse);
  assert.equal(event.action,"contracts");
  assert.doesNotThrow(()=>validateSave(JSON.parse(JSON.stringify(g))));
});
