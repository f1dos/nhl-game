export interface MinorPenalty {playerId:string;expires:number}
export function skaterCounts(penalties:MinorPenalty[][], overtime:boolean):number[]{
 const a=penalties[0].length,b=penalties[1].length;
 return overtime?[3+Math.max(0,b-a),3+Math.max(0,a-b)]:[5-a,5-b];
}
export function expireMinors(penalties:MinorPenalty[][],time:number){
 for(let i=0;i<2;i++)penalties[i]=penalties[i].filter(p=>p.expires>time);
}
export function releaseMinor(penalties:MinorPenalty[][],side:number){
 const sorted=penalties[side].sort((a,b)=>a.expires-b.expires);
 return sorted.shift();
}
