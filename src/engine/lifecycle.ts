import type {Game,Player,Position} from './types';
import {RNG,clamp} from './random';
import {overall} from './ratings';
import {createPlayer} from './database';
import {emptyStats} from './types';
export function ageWorld(g:Game,r:RNG){
 g.freeAgents??=[];g.retired??=[];
 const age=(p:Player)=>{
  p.age++;
  const growth=p.age<26?Math.min(Math.max(0,p.potential-p.ovr),r.int(0,3)):p.age>31?-r.int(0,2):r.int(-1,1);
  for(const key of Object.keys(p.attributes))p.attributes[key]=clamp(p.attributes[key]+growth,30,99);
  p.ovr=overall(p.pos,p.attributes,p.archetype);
  p.stats=emptyStats();p.fatigue=0;p.injury=0;p.morale=75;
 };
 const retired=(p:Player)=>p.age>=40||(p.age>=36&&r.next()<.12+(p.age-36)*.08);
 for(const t of g.teams){
  t.players.forEach(age);
  const retiring=t.players.filter(retired);
  g.retired.push(...retiring.map(player=>({year:g.year,player})));
  t.players=t.players.filter(p=>!retiring.includes(p));
 }
 g.freeAgents.forEach(age);
 const retiring=g.freeAgents.filter(retired);
 g.retired.push(...retiring.map(player=>({year:g.year,player})));
 g.freeAgents=g.freeAgents.filter(p=>!retiring.includes(p));
 // Annual development-system entrants; draft rights are a later system.
 const positions:Position[]=['LW','C','RW','D','D','G'];
 for(let i=0;i<240;i++){
  const p=createPlayer(r,`entrant-${g.year}-${i}`,positions[i%positions.length],66);
  p.age=r.int(18,21);p.years=0;p.salary=0;
  g.freeAgents.push(p);
 }
 g.news.unshift(`${g.year}: 240 новых игроков; ${g.retired.filter(x=>x.year===g.year).length} завершили карьеру.`);
}
