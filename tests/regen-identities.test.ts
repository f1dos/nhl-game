import test from "node:test";
import assert from "node:assert/strict";
import { RNG } from "../src/engine/random";
import { createDraftState } from "../src/engine/draft";
import { KNOWN_NAME_NATIONS, normalizeNation, nationalName } from "../src/engine/names";
import { regenSurnames } from "../src/engine/regenSurnames";
import { NHL_ROSTERS } from "../src/data/nhl-2026-27";
import { portraitUrl } from "../src/ui/portrait";
import { PORTRAIT_COUNT } from "../src/engine/regenPortraitIndex";

test("each generated nationality has its own usable surname pool",()=>{
  const nhl = new Set(Object.values(NHL_ROSTERS).flat().map(p=>p.lastName));
  for(const code of KNOWN_NAME_NATIONS){
    assert(regenSurnames[code].length >= 16,code);
    assert(regenSurnames[code].every(s=>!nhl.has(s)),code);
    for(let i=0;i<100;i++){
      const name=nationalName(code,String(i)).split(" ").at(-1)!;
      assert(regenSurnames[code].includes(name),code);
    }
  }
  assert.equal(nationalName("CHE","42"),nationalName("SUI","42"));
});

test("five draft classes have distinct regen surnames within each class and stable offline portraits",()=>{
  const families=new Set<string>(),images=new Set<string>();
  let count=0;
  for(let year=2028;year<=2032;year++){
    const prospects=createDraftState(year,new RNG(year)).prospects.filter(p=>p.source==="generated");
    const names=new Set<string>();
    for(const {player:p} of prospects){
      const surname=p.name.split(" ").at(-1)!;
      assert(regenSurnames[normalizeNation(p.nation)].includes(surname));
      assert(!names.has(surname),surname);
      const image=portraitUrl(p)!;
      assert(image.startsWith("data:image/jpeg;base64,"));
      assert.equal(portraitUrl(JSON.parse(JSON.stringify(p))),image);
      names.add(surname); families.add(surname);images.add(image);count++;
    }
  }
  assert.equal(images.size,PORTRAIT_COUNT);
  console.log({regens:count,uniqueSurnames:families.size,portraits:images.size});
});
