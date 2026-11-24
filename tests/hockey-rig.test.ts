import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
const window = new Window({ url: "http://localhost:5173" });
Object.defineProperty(globalThis, "document", { value: window.document, configurable: true });
const THREE = await import("three");
const { RigFactory } = await import("../src/ui/hockeyRig");
import type { RigActionKind } from "../src/ui/hockeyRig";
import type { Group, Mesh, Object3D } from "three";

const kit = { jersey: "#c8102e", trim: "#ffffff", pants: "#101820", helmet: "#101820", socks: "#c8102e" };
const ACTIONS: RigActionKind[] = ["shot", "pass", "check", "checked", "celebrate", "save", "conceded", "faceoff", "protest"];

function lowestPoint(root: Object3D) {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root).min.y;
}

test("rig pose is finite and skates stay on the ice through every motion", () => {
  const factory = new RigFactory();
  for (const goalie of [false, true]) {
    const rig = goalie ? factory.goalie(kit) : factory.skater(kit);
    rig.setIdentity({ id: goalie ? "g1" : "s1", name: "Test Player", number: 27 }, goalie ? "G" : "C");
    let x = 0;
    const input = (vx: number, vz: number, hasPuck = false) => ({ x, z: 0, vx, vz, puckX: 10, puckZ: 3, hasPuck });
    const frame = (vx: number, vz: number, steps: number, hasPuck = false) => {
      for (let i = 0; i < steps; i++) {
        x += vx / 60;
        rig.update(1 / 60, 1 / 60, input(vx, vz, hasPuck));
        const y = lowestPoint(rig.root);
        assert(Number.isFinite(y), "pose must stay finite");
        // The lowest skate blade rests on the ice (shadow decal sits 1.4 cm above it).
        assert(y > -0.03 && y < 0.06, `skate off the ice: ${y.toFixed(3)} (goalie=${goalie})`);
      }
    };
    frame(0, 0, 30);
    frame(8, 0, 120, true);
    frame(-4, 0, 60);
    frame(0, 5, 60);
    for (const kind of ACTIONS) {
      rig.trigger(kind, { x: 1, z: 2 });
      frame(2, 0, 200);
    }
    frame(0, 0, 60);
  }
  factory.dispose();
});

test("skating cycle moves the legs and one-shot actions play out and release", () => {
  const factory = new RigFactory();
  const rig = factory.skater(kit);
  rig.setIdentity({ id: "s2", name: "Runner", number: 9 }, "W");
  const run = (n: number, speed: number) => {
    const knees: number[] = [];
    for (let i = 0; i < n; i++) {
      rig.update(1 / 60, 1 / 60, { x: i * speed / 60, z: 0, vx: speed, vz: 0, puckX: 20, puckZ: 0, hasPuck: false });
      knees.push((rig as unknown as { knees: Group[] }).knees[0].rotation.x);
    }
    return Math.max(...knees) - Math.min(...knees);
  };
  const moving = run(180, 8);
  const standing = run(180, 0);
  assert(moving > 0.4, `stride should flex the knee, range ${moving}`);
  assert(standing < moving / 2, "a stationary skater must not run in place");
  rig.trigger("shot");
  const stick = (rig as unknown as { shaft: Mesh }).shaft;
  let moved = 0;
  const start = stick.position.clone();
  for (let i = 0; i < 40; i++) {
    rig.update(1 / 60, 1 / 60, { x: 0, z: 0, vx: 0, vz: 0, puckX: 20, puckZ: 0, hasPuck: true });
    moved = Math.max(moved, stick.position.distanceTo(start));
  }
  assert(moved > 0.3, "a shot should swing the stick");
  factory.dispose();
});

test("every pose state is grounded: skates, knees or pads on the ice, or seated on the bench", () => {
  const factory = new RigFactory();
  const states = ["play", "faceoff-ready", "faceoff-stance", "celebrate", "hug", "fist-bump", "dejected", "bench-stand", "bench-cheer", "bench-reach"] as const;
  const people = [
    ["skater", factory.skater(kit)],
    ["goalie", factory.goalie(kit)],
    ["referee", factory.official("referee")],
    ["coach", factory.coach("#c8102e")],
  ] as const;
  for (const [role, rig] of people) {
    rig.setIdentity({ id: `${role}-1`, name: "Pose Test", number: 4 }, role === "goalie" ? "G" : "C");
    const list = role === "coach" ? (["coach-idle", "coach-clap", "coach-point", "coach-despair"] as const)
      : role === "referee" ? (["play", "official-drop", "official-point", "official-arm"] as const)
      : role === "goalie" ? (["play", "goalie-hold", "goalie-beaten", "faceoff-ready"] as const)
      : states;
    for (const state of list)
      for (const variant of [0.1, 0.4, 0.7, 0.9]) {
        rig.setState(state, variant, 1);
        for (let i = 0; i < 40; i++) rig.update(1 / 60, 1 / 60, { x: 0, z: 0, vx: 0, vz: 0, puckX: 5, puckZ: 5, hasPuck: false });
        const y = lowestPoint(rig.root);
        assert(y > -0.04 && y < 0.07, `${role} ${state} ${variant}: lowest point ${y.toFixed(3)}`);
      }
  }
  // Seated players rest on the bench: hips at seat height, feet near the floor.
  const sitter = factory.skater(kit);
  sitter.setIdentity({ id: "sitter", name: "Bench", number: 33 }, "D");
  sitter.setState("seated");
  for (let i = 0; i < 60; i++) sitter.update(1 / 60, 1 / 60, { x: 0, z: 0, vx: 0, vz: 0, puckX: 5, puckZ: 5, hasPuck: false, face: 0 });
  const pelvis = (sitter as unknown as { pelvis: Group }).pelvis;
  sitter.root.updateMatrixWorld(true);
  const hip = pelvis.getWorldPosition(new THREE.Vector3()).y;
  assert(hip > 0.5 && hip < 0.75, `seated hip height ${hip.toFixed(2)}`);
  assert(lowestPoint(sitter.root) < 0.25, "feet reach toward the floor");
  // Goalie saves move the glove or blocker well away from the ready position.
  const keeper = factory.goalie(kit);
  keeper.setIdentity({ id: "keeper", name: "Keeper", number: 31 }, "G");
  const step = () => keeper.update(1 / 60, 1 / 60, { x: 25, z: 0, vx: 0, vz: 0, puckX: 10, puckZ: 0, hasPuck: false, face: -Math.PI / 2 });
  for (let i = 0; i < 30; i++) step();
  const hands = (keeper as unknown as { armMeshes: { hand: Object3D }[] }).armMeshes.map((a) => a.hand.position.clone());
  keeper.trigger("save", { x: -1, z: 0.9 }, 0.9);
  let moved = 0;
  for (let i = 0; i < 12; i++) {
    step();
    const now = (keeper as unknown as { armMeshes: { hand: Object3D }[] }).armMeshes.map((a) => a.hand.position);
    moved = Math.max(moved, ...now.map((p, k) => p.distanceTo(hands[k])));
  }
  assert(moved > 0.2, `a high save reaches out with a hand (${moved.toFixed(2)} m)`);
  factory.dispose();
});
test("the skater's gloves stay on the shaft through mirrored shot wind-ups", () => {
  const factory = new RigFactory();
  const grips = new Set<number>();
  for (let id=0; id<32 && grips.size<2; id++) {
    const rig = factory.skater(kit);
    rig.setIdentity({id:"grip-test-"+id, name:"Test", number:14},"C");
    const source = rig.skeletonSource();
    if (!grips.has(source.hs)) {
      grips.add(source.hs);
      for (const action of ["wrist","slap","pass"] as const) {
        rig.trigger(action);
        for (let frame=0; frame<75; frame++) {
          rig.update(1/60,1/60,{x:0,z:0,vx:0,vz:0,puckX:0,puckZ:.8,hasPuck:true,face:0});
          rig.root.updateMatrixWorld(true);
          const pose = rig.skeletonSource();
          if (pose.stickGrip < .995) continue;
          const shaft = pose.shaft!;
          const centre = shaft.getWorldPosition(new THREE.Vector3());
          const axis = new THREE.Vector3(0,1,0).applyQuaternion(shaft.getWorldQuaternion(new THREE.Quaternion()));
          for (const arm of pose.arms) {
            const offset = arm.hand.getWorldPosition(new THREE.Vector3()).sub(centre);
            const gap = offset.addScaledVector(axis,-offset.dot(axis)).length();
            assert(gap < .018, `${action} frame ${frame} grip ${source.hs} arm ${pose.arms.indexOf(arm)} gap ${gap} hand ${arm.hand.position.toArray()} shaft ${centre.toArray()} axis ${axis.toArray()}`);
          }
        }
      }
    }
    rig.dispose();
  }
  assert.equal(grips.size,2);
  factory.dispose();
});
test("skaters keep an athletic trunk angle on an open-ice sprint", () => {
  const factory = new RigFactory();
  const rig = factory.skater(kit);
  rig.setIdentity({id:"stride-posture",name:"Posture",number:12},"C");
  let maxLean=0, maxKnee=0;
  for (let frame=0;frame<180;frame++) {
    rig.update(1/60,1/60,{x:0,z:0,vx:0,vz:7,puckX:0,puckZ:12,hasPuck:false,face:0});
    const pose=rig.skeletonSource();
    maxLean=Math.max(maxLean,pose.spine.rotation.x);
    for(const knee of pose.knees) maxKnee=Math.max(maxKnee,knee.rotation.x);
  }
  assert(maxLean>.25 && maxLean<.57, `sprint spine pitch ${maxLean}`);
  assert(maxKnee>.9 && maxKnee<1.32, `sprint knee flexion ${maxKnee}`);
  rig.dispose();factory.dispose();
});
