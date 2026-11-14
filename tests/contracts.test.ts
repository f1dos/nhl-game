import {test} from 'node:test';import assert from 'node:assert/strict';
import {newGame} from '../src/engine/database';import {nextSeason,advance} from '../src/engine/season';
import {signContract,askingSalary,salaryTotal} from '../src/engine/contracts';
import {validateSave} from '../src/engine/saves';
test('contract expiration populates market; rejected offers are atomic; accepted signing transfers ownership',()=>{
 const g=newGame();g.phase='offseason';nextSeason(g);
 assert(g.freeAgents!.length>0);const p=g.freeAgents![0];
 const before=JSON.stringify(g);assert.throws(()=>signContract(g,g.user,p.id,0,1));assert.equal(JSON.stringify(g),before);
 assert.throws(()=>signContract(g,g.user,p.id,2,.1));assert.equal(JSON.stringify(g),before);
 signContract(g,g.user,p.id,2,askingSalary(p));
 assert(!g.freeAgents!.some(x=>x.id===p.id));assert(g.teams.find(t=>t.id===g.user)!.players.some(x=>x.id===p.id&&x.years===2));
 assert(validateSave(JSON.parse(JSON.stringify(g))));
});
test('failed rollover preserves complete original state',()=>{
 const g=newGame();g.phase='offseason';g.rules.cap=1;const before=JSON.stringify(g);
 assert.throws(()=>nextSeason(g));assert.equal(JSON.stringify(g),before);
});
test('30 annual lifecycles replace generations, maintain legal rosters and survive save/load',()=>{
 const g=newGame('TOR',33);const initial=new Set(g.teams.flatMap(t=>t.players.map(p=>p.id)));
 for(let year=0;year<30;year++){
  g.phase='offseason';nextSeason(g);
  for(const t of g.teams){assert(t.players.length>=20);assert(salaryTotal(t)<=g.rules.cap);assert(t.players.every(p=>p.age<40&&p.years>=1));}
  validateSave(JSON.parse(JSON.stringify(g)));
  advance(g);
 }
 assert(g.teams.flatMap(t=>t.players).every(p=>!initial.has(p.id)));
 assert(g.retired!.length>0);
});
