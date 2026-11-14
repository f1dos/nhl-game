import {test} from 'node:test';import assert from 'node:assert/strict';
import {newGame} from '../src/engine/database';import {trainTeam,readiness} from '../src/engine/training';
test('recovery and intensive training have different fitness consequences',()=>{
 const a=newGame().teams[0],b=structuredClone(a);
 a.training='recovery';b.training='shooting';a.players.forEach(p=>p.fatigue=50);b.players.forEach(p=>p.fatigue=50);
 trainTeam(a);trainTeam(b);assert.equal(a.players[0].fatigue,36);assert.equal(b.players[0].fatigue,45);
});
test('training improves selected skills only after a completed cycle; injuries prevent development',()=>{
 const t=newGame().teams[0];t.training='shooting';const p=t.players[0];p.age=20;p.potential=100;p.attributes.accuracy=60;
 for(let i=0;i<7;i++)trainTeam(t);assert.equal(p.attributes.accuracy,60);
 trainTeam(t);assert.equal(p.attributes.accuracy,61);
 p.injury=20;for(let i=0;i<8;i++)trainTeam(t);assert.equal(p.attributes.accuracy,61);
 assert(readiness(t).injured.some(x=>x.id===p.id)||!t.lines.flat().includes(p.id));
});
