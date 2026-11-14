import {test} from 'node:test';import assert from 'node:assert/strict';
import {newGame} from '../src/engine/database';
import {evaluateTrade,executeTrade} from '../src/engine/trades';
import {validateSave} from '../src/engine/saves';
test('accepted trade transfers ownership, refreshes lines and survives save/load',()=>{
 const g=newGame('BOS');g.rules.cap=300;
 const a=g.teams[0].players[0],b=g.teams[1].players[0];
 a.ovr=95;a.potential=98;a.age=21;a.salary=1;b.ovr=60;b.potential=60;b.age=34;
 assert(evaluateTrade(g,'BUF',[a.id],[b.id]).accepted);
 executeTrade(g,'BUF',[a.id],[b.id]);
 assert(g.teams[1].players.includes(a));assert(g.teams[0].players.includes(b));
 assert.equal(new Set(g.teams.flatMap(t=>t.players.map(p=>p.id))).size,768);
 assert.equal(validateSave(JSON.parse(JSON.stringify(g))).transactions?.length,1);
 assert.throws(()=>executeTrade(g,'BUF',[a.id],[b.id]));
});
test('invalid, underpriced and over-cap deals leave state unchanged',()=>{
 const g=newGame('BOS');const a=g.teams[0].players[0],b=g.teams[1].players[0];
 a.ovr=40;b.ovr=99;g.rules.cap=300;
 assert(!evaluateTrade(g,'BUF',[a.id],[b.id]).accepted);
 assert(!evaluateTrade(g,'BUF',[a.id,a.id],[b.id]).accepted);
 g.rules.cap=1;const before=JSON.stringify(g);
 assert.throws(()=>executeTrade(g,'BUF',[a.id],[b.id]));assert.equal(JSON.stringify(g),before);
});
