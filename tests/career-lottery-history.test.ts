import test from "node:test";
import assert from "node:assert/strict";
import {newGame} from "../src/engine/database";
import {prepareLottery,openDraft} from "../src/engine/draft";
import {validateSave} from "../src/engine/saves";
import {playerTrades} from "../src/engine/playerTrades";
import {recordContract} from "../src/engine/contractLedger";
import {portraitUrl} from "../src/ui/portrait";

test("lottery persists undisclosed draws and transfers pick rights only once",()=>{
  const g=newGame("TOR",2409);
  g.phase="offseason";
  const draw=prepareLottery(g)!;
  assert.equal(draw.revealed,0);
  assert.equal(g.draft!.picks.length,0);
  assert.equal(new Set(draw.order).size,32);
  for(const id of draw.winners)assert(draw.seeds.indexOf(id)-draw.order.indexOf(id)<=10);
  draw.revealed=1;
  const loaded=validateSave(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(prepareLottery(loaded),draw);
  openDraft(loaded);
  assert.deepEqual(loaded.draft!.picks.slice(0,32).map(p=>p.originalTeam),draw.order);
});

test("a player's deals use identity and recover exact assets in older saves",()=>{
  const g=newGame("TOR",193),p=g.teams[0].players[0];
  g.transactions=[
    {year:g.year,round:1,message:"TOR → BUF: "+p.name+", 2028 R2 (TOR); BUF → TOR: Smith"},
    {year:g.year,round:2,message:"BOS получает "+p.name+"son; NYR получает Smith"},
    {year:g.year,round:3,message:"Other clubs",kind:"trade",playerIds:[p.id]},
  ];
  assert.equal(playerTrades(g,p).length,2);
  recordContract(g,"TOR",p,"extend");
  assert.equal(g.contractHistory!.at(-1)!.playerId,p.id);
  const regen={...p,id:"regen-2032-12",externalId:undefined,headshot:undefined,identitySource:"generated" as const};
  assert.match(portraitUrl(regen)!,/^data:image\/jpeg;base64,/);
  assert.equal(portraitUrl(regen),portraitUrl({...regen,age:regen.age+1}));
});
