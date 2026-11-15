import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame} from '../src/engine/database';
import {simulateMatch} from '../src/engine/match';
import {RNG} from '../src/engine/random';
import {injuryProbability} from '../src/engine/injuries';
import {validateSave} from '../src/engine/saves';

test('injured starter and goalie receive no ice time; backup participates',()=>{
 const g=newGame(); const [a,b]=g.teams;
 const skater=a.players.find(p=>p.id===a.lines[0][0])!;
 const goalie=a.players.find(p=>p.id===a.goalie)!;
 skater.injury=10; goalie.injury=10;
 simulateMatch(a,b,new RNG(20));
 assert.equal(skater.stats.toi,0); assert.equal(skater.stats.gp,0);
 assert.equal(goalie.stats.toi,0); assert.equal(goalie.stats.gp,0);
 // The healthy backup starts and can be pulled for an extra attacker late.
 assert(a.players.some(p=>p.pos==='G' && p.stats.toi>=55));
 validateSave(JSON.parse(JSON.stringify(g)));
});
test('injury risk remains reachable at high physicality and responds to fatigue',()=>{
 const p=newGame().teams[0].players[0];
 const low=injuryProbability(p,0,0); const high=injuryProbability(p,100,30);
 assert(high>low); p.fatigue=90; assert(injuryProbability(p,100,30)>high);
 p.injury=1; assert.equal(injuryProbability(p,100,30),0);
});
test('injury removes player from all later events and bounds TOI',()=>{
 let injuries=0;
 for(let seed=0;seed<200;seed++){
  const g=newGame('TOR',seed); const [a,b]=g.teams;
  a.tactics.physical=b.tactics.physical=100;
  // Unique names make event identity unambiguous in this regression.
  for(const p of [...a.players,...b.players])p.name=p.id;
  const r=simulateMatch(a,b,new RNG(seed+90));
  for(const [i,event] of r.events.entries())if(event.type==='injury'){
   injuries++;
   assert(!r.events.slice(i+1).some(e=>e.player===event.player));
   const p=[...a.players,...b.players].find(p=>p.name===event.player)!;
   assert(p.stats.toi<=event.time/60+1e-8);
  }
  for(const p of [...a.players,...b.players])assert(p.stats.toi<=r.duration/60+1e-8);
 }
 assert(injuries>10);
});
