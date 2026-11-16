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
