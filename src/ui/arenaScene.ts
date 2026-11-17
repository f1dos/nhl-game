import * as THREE from "three";
import type { Team } from "../engine/types";
import { BENCH } from "../engine/rink";

export interface ArenaReactions {
  /** +1 / -1: goal light of that end is on; 0: off. */
  goalSide: number;
  /** The home crowd is on its feet. */
  homeScored: boolean;
}

/** Static rink, stands and benches, plus small live reactions. */
export function buildArena(scene: THREE.Scene, home: Team, _away: Team) {
  scene.background = new THREE.Color("#0d1724");
  scene.fog = new THREE.Fog("#0d1724", 70, 140);
  scene.add(new THREE.HemisphereLight(0xd9f4ff, 0x263449, 2.4));
  const light = new THREE.DirectionalLight(0xffffff, 2.6);
  light.position.set(0, 35, 10);
  scene.add(light);
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, roughness = 0.5) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness }));
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  };
  box(0, -0.3, 0, 61, 0.6, 26, "#dceef2", 0.35);
  for (const z of [-13.2, 13.2]) {
    box(0, 0.6, z, 61, 1.2, 0.35, "#fafafa");
    box(0, 0.1, z - Math.sign(z) * 0.2, 61, 0.2, 0.1, "#eab83b");
  }
  for (const x of [-30.5, 30.5]) box(x, 0.6, 0, 0.35, 1.2, 26, "#fafafa");
  for (const [x, color] of [[0, "#d03c4a"], [-9, "#307fb8"], [9, "#307fb8"], [-26, "#d03c4a"], [26, "#d03c4a"]] as const)
    box(x, 0.02, 0, 0.18, 0.03, 26, color);
  const circle = (x: number, z: number, radius: number, color: string) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.06, radius, 64), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.045, z);
    scene.add(ring);
  };
  circle(0, 0, 4.5, "#307fb8");
  for (const x of [-20.5, 20.5]) for (const z of [-6.7, 6.7]) circle(x, z, 4.5, "#d03c4a");
  const lights: THREE.MeshStandardMaterial[] = [];
  for (const x of [-26, 26]) {
    for (const z of [-0.9, 0.9]) box(x + Math.sign(x) * 0.0, 0.6, z, 0.08, 1.2, 0.08, "#db3545");
    box(x, 1.2, 0, 0.08, 0.08, 1.9, "#db3545");
    box(x + Math.sign(x) * 0.6, 0.5, 0, 0.06, 1, 1.9, "#c9d6dd");
    const lamp = box(x + Math.sign(x) * 5.5, 2.4, 0, 0.35, 0.35, 0.35, "#5a1414");
    lights.push(lamp.material as THREE.MeshStandardMaterial);
  }
  // Tiered bowl. Near-side seating is lower to preserve sight lines.
  const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.45, 2, 5), new THREE.MeshStandardMaterial({ roughness: 1 }), 1800);
  const base: THREE.Matrix4[] = [];
  const homeFan: boolean[] = [];
  const dummy = new THREE.Object3D();
  let crowdIndex = 0;
  const seat = (x: number, y: number, z: number, color: string, isHome: boolean) => {
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    crowd.setMatrixAt(crowdIndex, dummy.matrix);
    base.push(dummy.matrix.clone());
    homeFan.push(isHome);
    crowd.setColorAt(crowdIndex++, new THREE.Color(color));
  };
  for (let row = 0; row < 9; row++) {
    for (const side of [-1, 1]) {
      const z = side * (18 + row * 1.1),
        y = side < 0 ? row * 0.65 : row * 0.25 - 1;
      box(0, y, z, 74, 0.45, 1.1, row % 2 ? "#263b50" : "#304a60");
      for (let s = 0; s < 70; s++) {
        if (s % 14 === 0) continue;
        const fan = s % 5 === 0;
        seat(-35 + s, y + 0.6, z, fan ? home.color : s % 3 === 0 ? "#cbd8e2" : "#455f7c", fan || s % 2 === 0);
      }
    }
    for (const side of [-1, 1]) {
      box(side * (34 + row * 1.1), row * 0.6, 0, 1.1, 0.45, 34, "#263b50");
      for (let s = 0; s < 30; s++) seat(side * (34 + row * 1.1), row * 0.6 + 0.6, -15 + s, s % 3 ? "#688097" : home.color, s % 2 === 0);
    }
  }
  crowd.count = crowdIndex;
  scene.add(crowd);
  // Benches behind the -z boards.
  for (const cx of BENCH.centerX) {
    box(cx, BENCH.seatY - 0.2, BENCH.seatZ - 0.05, BENCH.halfLength * 2, 0.08, 0.45, "#3a5266");
    box(cx, BENCH.seatY - 0.45, BENCH.seatZ - 0.05, BENCH.halfLength * 2, 0.4, 0.4, "#24384a");
    box(cx, 0.6, BENCH.seatZ - 0.6, BENCH.halfLength * 2, 1.2, 0.12, "#2e4558");
  }
  let clock = 0;
  return {
    update(dt: number, r: ArenaReactions) {
      clock += dt;
      lights.forEach((m, i) => {
        const on = r.goalSide !== 0 && Math.sign([-26, 26][i]) === r.goalSide;
        const pulse = on ? 0.6 + 0.4 * Math.abs(Math.sin(clock * 6)) : 0;
        m.emissive.set(on ? "#ff2a1f" : "#000000");
        m.emissiveIntensity = pulse * 2.5;
        m.color.set(on ? "#ff4a3a" : "#5a1414");
      });
      // Home fans jump when their team scores.
      if (r.homeScored || crowd.userData.jumping) {
        crowd.userData.jumping = r.homeScored;
        for (let i = 0; i < crowd.count; i++) {
          const jump = r.homeScored && homeFan[i] ? Math.abs(Math.sin(clock * 7 + i * 0.37)) * 0.35 : 0;
          dummy.matrix.copy(base[i]);
          dummy.matrix.elements[13] += jump;
          crowd.setMatrixAt(i, dummy.matrix);
        }
        crowd.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {},
  };
}
