import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame} from '../src/engine/database';
import {overall,rolesFor} from '../src/engine/ratings';
import {validateSave} from '../src/engine/saves';
test('goalie rating ignores shooting and responds strongly to reflexes',()=>{
 const p=newGame().teams[0].players.find(p=>p.pos==='G')!;
 const baseline=overall('G',p.attributes);
 assert.equal(overall('G',{...p.attributes,accuracy:1,shooting:1}),baseline);
 assert(overall('G',{...p.attributes,reflexes:1})<baseline-10);
});
test('generated archetypes are position-specific and legacy saves remain readable',()=>{
 const g=newGame();
 for(const t of g.teams)for(const p of t.players){
  assert(rolesFor(p.pos).includes(p.archetype!));
  assert.equal(p.ovr,overall(p.pos,p.attributes,p.archetype));
  delete p.archetype;
 }
 assert.equal(validateSave(JSON.parse(JSON.stringify(g))).teams.length,32);
});
