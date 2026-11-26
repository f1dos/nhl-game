import {clamp} from './random';
import type {Player, Position} from './types';
export const archetypes = {
 Sniper:['accuracy','shooting','offensivePosition'],
 Playmaker:['passing','puckControl','decisions'],
 'Power Forward':['strength','checking','offensivePosition'],
 'Two-Way Forward':['defensivePosition','passing','teamwork'],
 Grinder:['checking','strength','stamina'],
 'Defensive Forward':['penaltyKill','defensivePosition','faceoffs'],
 'Offensive Defenseman':['shooting','passing','offensivePosition'],
 'Defensive Defenseman':['blocking','checking','defensivePosition'],
 'Two-Way Defenseman':['defensivePosition','firstPass','skating'],
 'Puck-Moving Defenseman':['firstPass','puckControl','skating'],
 Butterfly:['reflexes','reboundControl','goaliePosition'],
 Hybrid:['reflexes','glove','composure'],
};
export type Archetype=keyof typeof archetypes;
export function rolesFor(pos:Position):Archetype[]{
 return (Object.keys(archetypes) as Archetype[]).filter((_,i)=>pos==='G'?i>=10:pos==='D'?i>=6&&i<10:i<6);
}
export function overall(pos:Position,a:Record<string,number>,role?:Archetype){
 const weights:Record<string,number>=pos==='G'
 ? {reflexes:5,goaliePosition:4,reboundControl:3,glove:3,composure:2,consistency:1}
 :pos==='D'?{defensivePosition:5,blocking:3,checking:2,firstPass:3,skating:3,decisions:2}
 :{accuracy:3,shooting:2,passing:3,puckControl:3,speed:2,offensivePosition:3,teamwork:2,...(pos==='C'?{faceoffs:2}:{})};
 if(role&&rolesFor(pos).includes(role))for(const key of archetypes[role])weights[key]=(weights[key]||0)+2;
 return Math.round(Object.entries(weights).reduce((sum,[key,w])=>sum+a[key]*w,0)/Object.values(weights).reduce((a,b)=>a+b,0));
}

export function setPlayerOverall(player: Player, target: number) {
  for (let pass = 0; pass < 6; pass++) {
    const delta =
      target - overall(player.pos, player.attributes, player.archetype);
    if (!delta) break;
    for (const key of Object.keys(player.attributes))
      player.attributes[key] = clamp(player.attributes[key] + delta, 30, 99);
  }
  player.ovr = overall(player.pos, player.attributes, player.archetype);
}

export function resolveOpeningInjury(player: Player) {
  if (!player.openingInjuryReturn || player.openingInjuryResolved) return;
  setPlayerOverall(player, player.openingInjuryReturn);
  player.formAdjustment = 0;
  player.performanceForm = 0;
  player.potential = Math.max(player.ovr, player.potentialBeforeForm ?? player.potential);
  player.potentialBeforeForm = undefined;
  player.openingInjuryResolved = true;
}
