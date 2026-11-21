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
    const cap = role === "goalie" ? 10000 : 8000;
    assert(tris <= cap, `${role}: ${tris} triangles`);
    assert(tris >= 2500, `${role}: ${tris} triangles is too coarse`);
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
  assert.equal(meshes.length, 2, "two LOD levels");
  // Feet stay on the ice: the lowest foot bone sits about a blade above it.
  const feet = bones.filter((b) => b.name.startsWith("foot")).map((b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).y);
  assert(Math.min(...feet) > 0.05 && Math.min(...feet) < 0.25, `foot height ${feet}`);
});
