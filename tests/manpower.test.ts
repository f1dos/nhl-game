import {test} from 'node:test';import assert from 'node:assert/strict';
import {skaterCounts,expireMinors,releaseMinor} from '../src/engine/manpower';
import {newGame} from '../src/engine/database';import {simulateMatch} from '../src/engine/match';import {RNG} from '../src/engine/random';
test('regulation and overtime manpower, expiry and oldest minor release',()=>{
 const penalties=[[{playerId:'a',expires:120},{playerId:'b',expires:160}],[]];
 assert.deepEqual(skaterCounts(penalties,false),[3,5]);
 assert.deepEqual(skaterCounts(penalties,true),[3,5]);
 assert.equal(releaseMinor(penalties,0)?.playerId,'a');
 assert.deepEqual(skaterCounts(penalties,true),[3,4]);
 penalties[1].push({playerId:'c',expires:150});
 assert.deepEqual(skaterCounts(penalties,false),[4,4]);
 assert.deepEqual(skaterCounts(penalties,true),[3,3]);
 expireMinors(penalties,160);assert.deepEqual(skaterCounts(penalties,true),[3,3]);
});
test('penalized players miss subsequent shifts; OT events use reduced units',()=>{
 let overtime=0,penalties=0;
 for(let seed=1;seed<=120;seed++){
 const g=newGame('TOR',seed),[a,b]=g.teams;
 const result=simulateMatch(a,b,new RNG(seed));
 const excluded=new Map<string,number>();
 for(const e of result.events){
  if(e.type==='shootout')continue;
  for(const ids of e.skaters!){
   assert.equal(new Set(ids).size,ids.length);
   assert(ids.length>=3&&ids.length<=6);
   if(ids.length===6)assert(e.time>=3480,"extra attacker is only allowed in the final two minutes");
  }
  for(const [id,until] of excluded)if(e.time<=until)assert(!e.skaters!.flat().includes(id));
  if(e.type==='penalty'){excluded.set(e.playerId!,e.time+120);penalties++;}
  if(e.type==='goal'&&e.text.includes('большинстве')){
    const other=e.team===a.id?b:a;
    const candidates=[...excluded.entries()].filter(([id,until])=>until>=e.time&&other.players.some(p=>p.id===id)).sort((x,y)=>x[1]-y[1]);
    if(candidates[0])excluded.delete(candidates[0][0]);
  }
  if(e.time>3600){overtime++;assert(Math.min(...e.skaters!.map(x=>x.length))===3);}
 }
 for(const t of [a,b])for(const p of t.players)assert(p.stats.toi<=result.duration/60+1e-8);
 }
 assert(overtime>0&&penalties>0);
});
