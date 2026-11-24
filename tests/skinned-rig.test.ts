import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
const window = new Window({ url: "http://localhost:5173" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Node"])
  Object.defineProperty(globalThis, key, { value: key === "window" ? window : (window as any)[key], configurable: true });
import * as THREE from "three";
const { SkinnedRigFactory, appearanceFor, BONES } = await import("../src/ui/skinnedRig");

test("skinned models: one mesh per LOD, budgets, valid weights, every bone used", () => {
  const factory = new SkinnedRigFactory();
  for (const role of ["skater", "goalie", "referee", "linesman", "coach"] as const) {
    const look = appearanceFor(`player-${role}`, role, role === "goalie" ? "G" : "C");
    const model = factory.model(role, look);
    const tris = model.hi.index!.count / 3;
    const lowTris = model.lo.index!.count / 3;
    const cap = role === "goalie" ? 30000 : 25000;
    assert(tris <= cap, `${role}: ${tris} triangles`);
    assert(tris >= 2500, `${role}: ${tris} triangles is too coarse`);
    const mediumTris = model.mid.index!.count / 3;
    assert(mediumTris < tris && mediumTris < 13500);
    assert(lowTris <= 4100);
    assert(lowTris < tris * 0.7, `${role}: LOD1 ${lowTris} vs ${tris}`);
    const w = model.hi.getAttribute("skinWeight");
    const idx = model.hi.getAttribute("skinIndex");
    const used = new Set<number>();
    for (let i = 0; i < w.count; i++) {
      const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
      assert(Math.abs(sum - 1) < 1e-3, `${role}: weights sum ${sum}`);
      for (let k = 0; k < 4; k++) if ((w as THREE.BufferAttribute).getComponent(i, k) > 0) used.add((idx as THREE.BufferAttribute).getComponent(i, k));
      assert(Number.isFinite(model.hi.getAttribute("position").getX(i)));
    }
    if (role === "skater") assert.equal(used.size, BONES.length, `skater uses ${used.size}/${BONES.length} bones`);
    assert(BONES.length >= 25 && BONES.length <= 35);
  }
});

test("appearance is deterministic from the id and varied across players", () => {
  const a = appearanceFor("nhl-TOR-8478483", "skater", "C");
  assert.deepEqual(appearanceFor("nhl-TOR-8478483", "skater", "C"), a);
  const looks = Array.from({ length: 200 }, (_, i) => appearanceFor(`p${i}`, "skater"));
  assert(new Set(looks.map((l) => l.face)).size >= 8);
  assert(new Set(looks.map((l) => l.hair)).size >= 8);
  assert(new Set(looks.map((l) => l.skin)).size >= 5);
  assert(new Set(looks.map((l) => l.helmet)).size === 2);
});

test("a rig follows the pose solver without NaNs and keeps the solver's motion", () => {
  const factory = new SkinnedRigFactory();
  const rig = factory.skater({ jersey: "#003e7e", trim: "#ffffff", pants: "#10161e", helmet: "#10161e", socks: "#003e7e" });
  rig.setIdentity({ id: "nhl-TOR-1", name: "Test Player", number: 91 }, "C");
  for (let i = 0; i < 120; i++) {
    rig.update(1 / 60, 1 / 60, { x: i * 0.05, z: 0, vx: 3, vz: 0, puckX: 5, puckZ: 0, hasPuck: i > 60 });
    if (i === 40) rig.trigger("shot");
  }
  const bones: THREE.Bone[] = [];
  rig.root.traverse((o) => (o as THREE.Bone).isBone && bones.push(o as THREE.Bone));
  assert.equal(bones.length, BONES.length);
  for (const b of bones) for (const e of b.matrix.elements) assert(Number.isFinite(e), `${b.name} NaN`);
  const meshes: THREE.SkinnedMesh[] = [];
  rig.root.traverse((o) => (o as THREE.SkinnedMesh).isSkinnedMesh && meshes.push(o as THREE.SkinnedMesh));
  assert.equal(meshes.length, 3, "three LOD levels");
  // Feet stay on the ice: the lowest foot bone sits about a blade above it.
  const feet = bones.filter((b) => b.name.startsWith("foot")).map((b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).y);
  assert(Math.min(...feet) > 0.05 && Math.min(...feet) < 0.25, `foot height ${feet}`);
});

test("exported match characters have animated joints, embedded kit textures and valid skinning", async () => {
  const {readFile} = await import("node:fs/promises");
  for (const role of ["skater","goalie"]) {
    const bytes = await readFile(new URL(`../public/models/hockey/${role}-match.glb`,import.meta.url));
    assert.equal(bytes.toString("ascii",0,4),"glTF");
    assert.equal(bytes.readUInt32LE(8),bytes.length);
    const model=JSON.parse(bytes.toString("utf8",20,20+bytes.readUInt32LE(12)));
    assert.equal(model.skins[0].joints.length,BONES.length);
    assert(model.images.every((image: {bufferView?:number}) => image.bufferView !== undefined));
    assert(model.materials.some((material: {normalTexture?:unknown}) => material.normalTexture));
    assert(model.meshes[0].primitives.every((part: {attributes:Record<string,number>}) => part.attributes.WEIGHTS_0 !== undefined && part.attributes.JOINTS_0 !== undefined));
    const clips = model.animations.map((clip: {name:string})=>clip.name);
    for (const clip of role === "skater" ? ["Forward stride","Off-puck sprint","Snap shot","Pass","Shot block"] : ["Glove save","Butterfly"]) assert(clips.includes(clip));
  }
});

test("distant characters use one shaded draw and release per-identity GPU resources on substitutions", () => {
  const factory=new SkinnedRigFactory();
  const rig=factory.skater({jersey:"#126abc",pants:"#151515",socks:"#145699",helmet:"#102030",trim:"#eeeeee"});
  rig.setIdentity({id:"first",name:"First Skater",number:11},"C");
  const lod=rig.root.children.find(node => node instanceof THREE.LOD) as THREE.LOD;
  const far=lod.levels[2].object as THREE.SkinnedMesh;
  assert(!Array.isArray(far.material));
  assert(far.geometry.hasAttribute("pigment"));
  let materialsFreed=0, skeletonsFreed=0;
  (far.material as THREE.Material).addEventListener("dispose",()=>materialsFreed++);
  const previous=far.skeleton.dispose.bind(far.skeleton);
  far.skeleton.dispose=()=>{skeletonsFreed++;previous();};
  rig.setIdentity({id:"second",name:"Second Skater",number:12},"LW");
  assert.equal(materialsFreed,1);
  assert.equal(skeletonsFreed,1);
  rig.dispose();factory.dispose();
});

test("Alpine match surfaces share their LODs and follow the animated blade for both grips", () => {
  const factory = new SkinnedRigFactory();
  const kit = { jersey:"#1b3568", trim:"#fff", pants:"#111", helmet:"#112", socks:"#eee" };
  for (const hs of [-1,1]) {
    const detail = factory.alpineModel(2,hs);
    const broadcast = factory.alpineModel(1,hs);
    const wide = factory.alpineModel(0,hs);
    assert.equal(factory.alpineModel(0,hs),wide);
    assert(wide.index!.count < broadcast.index!.count && broadcast.index!.count < detail.index!.count);
    assert(wide.index!.count / 3 < 5000);
    const id = Array.from({length:64},(_,i)=>String(i)).find(key=>appearanceFor(key,"skater","C").hs===hs)!;
    const rig = factory.skater(kit);
    rig.setIdentity({id,name:"Sample",number:17},"C");
    const lod = rig.root.children.find(o=>o instanceof THREE.LOD) as THREE.LOD;
    const mesh = lod.levels[2].object as THREE.SkinnedMesh;
    assert.equal(mesh.geometry,wide);
    const joints = wide.getAttribute("skinIndex");
    let tip = -1;
    for (let i=0;i<joints.count;i++) {
      if(joints.getX(i)===BONES.indexOf("blade")) { tip=i;break; }
    }
    assert(tip>=0);
    let previous: THREE.Vector3 | undefined;
    let travel=0;
    for (const kind of ["pass","wrist","snap","slap","check","fall","deke","receive","draw"] as const) {
      rig.trigger(kind);
      for(let frame=0;frame<40;frame++) {
        rig.update(1/60,1/60,{x:0,z:0,vx:1,vz:3,puckX:0,puckZ:.9,hasPuck:true});
        rig.root.updateMatrixWorld(true);
        const point=mesh.getVertexPosition(tip,new THREE.Vector3());
        assert(point.toArray().every(Number.isFinite));
        assert(point.length()<4);
        if(previous)travel+=previous.distanceTo(point);
        previous=point;
      }
    }
    assert(travel>1);
    rig.dispose();
  }
  factory.dispose();
});
test("Alpine sweater follows both clavicles and all four hem pivots at each distance", () => {
  const factory = new SkinnedRigFactory();
  for (const lod of [0, 1, 2] as const) {
    const geo = factory.alpineModel(lod, 1);
    const joints = geo.getAttribute("skinIndex"), weights = geo.getAttribute("skinWeight");
    const used = new Set<string>();
    for (let i = 0; i < joints.count; i++) {
      for (let j = 0; j < 4; j++) {
        if (weights.getComponent(i,j) > .005) used.add(BONES[joints.getComponent(i,j)]);
      }
    }
    for (const name of ["clavL","clavR","jerseyF","jerseyB","jerseyL","jerseyR"])
      assert(used.has(name), `missing ${name} influence at LOD ${lod}`);
  }
  factory.dispose();
});
test("Alpine runners contact the ice through a stationary stance and full strides", () => {
  const factory = new SkinnedRigFactory();
  const rig = factory.skater({jersey:"#163456",trim:"#fff",pants:"#111",helmet:"#123",socks:"#fff"});
  rig.setIdentity({id:"blade-review",name:"Test",number:12},"C");
  const lod = rig.root.children.find(node=>node instanceof THREE.LOD) as THREE.LOD;
  const mesh = lod.levels[2].object as THREE.SkinnedMesh;
  const joints = mesh.geometry.getAttribute("skinIndex");
  const feet = Array.from({length:joints.count},(_,i)=>i).filter(i=>["footL","footR"].includes(BONES[joints.getX(i)]));
  const point = new THREE.Vector3();
  for (const speed of [0,4,7]) {
    for (let frame=0;frame<100;frame++) {
      rig.update(1/60,1/60,{x:0,z:0,vx:0,vz:speed,puckX:0,puckZ:.8,hasPuck:true,face:0});
      rig.root.updateMatrixWorld(true);
      let contact = Infinity;
      for (const i of feet) contact=Math.min(contact,mesh.localToWorld(mesh.getVertexPosition(i,point)).y);
      assert(Math.abs(contact)<.002,`speed ${speed} frame ${frame} contact ${contact}`);
    }
  }
  rig.dispose();
  factory.dispose();
});
test("the stocking inside each Alpine skate collar moves rigidly with the boot", () => {
  const factory=new SkinnedRigFactory();
  for(const lod of [0,1,2] as const) {
    const geo=factory.alpineModel(lod,1);
    const p=geo.getAttribute("position"), joints=geo.getAttribute("skinIndex"), weights=geo.getAttribute("skinWeight");
    const material=geo.getAttribute("pigment");
    for(const side of ["L","R"] as const) {
      const foot=BONES.indexOf(`foot${side}`);
      let count=0;
      for(let i=0;i<p.count;i++) {
        if(material.getX(i)!==2 || p.getY(i)>-.913 || (p.getX(i)>0)!==(side==="L"))continue;
        let influence=0;
        for(let j=0;j<4;j++) if(joints.getComponent(i,j)===foot)influence+=weights.getComponent(i,j);
        assert(influence>.999,`cuff detached at LOD ${lod}, ${side}`);
        count++;
      }
      assert(count>=3,`missing collar section at LOD ${lod}, ${side}`);
    }
  }
  factory.dispose();
});
