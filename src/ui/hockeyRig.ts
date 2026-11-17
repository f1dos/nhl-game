import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Procedural, jointed people for the 3D match view: skaters, goalies, referees,
 * linesmen and coaches, in the stylised "broadcast mannequin" look of
 * football-manager match engines. Everything is built from primitives.
 *
 * Animation is layered:
 *  1. Locomotion from velocity: skating stride, crossovers, backwards skating,
 *     banking into turns and hockey stops (none for coaches).
 *  2. A continuous *state* pose chosen by the director (play, faceoff stance,
 *     celebration, hug, fist-bump line, dejected, seated on the bench, cheering,
 *     coach and official gestures...). State changes cross-fade.
 *  3. One-shot *actions* on top (shots, passes, checks, saves, faceoff draws,
 *     the linesman's puck drop...), sampled from partial keyframes.
 * Hands use two-bone IK (on the stick or on free targets), and the body is
 * always grounded: the lowest skate blade, shoe, kneeling knee or goalie pad
 * touches the ice, or the player sits on the bench.
 */

export interface TeamKit {
  jersey: string;
  trim: string;
  pants: string;
  helmet: string;
  socks: string;
}
export type RigRole = "skater" | "goalie" | "referee" | "linesman" | "coach";
export type RigActionKind =
  | "shot"
  | "pass"
  | "check"
  | "checked"
  | "celebrate"
  | "save"
  | "conceded"
  | "faceoff"
  | "protest"
  | "draw"
  | "tie-up"
  | "stick-tap"
  | "drop"
  | "beaten";
export type RigState =
  | "play"
  | "faceoff-ready"
  | "faceoff-stance"
  | "celebrate"
  | "hug"
  | "fist-bump"
  | "dejected"
  | "goalie-hold"
  | "goalie-beaten"
  | "seated"
  | "bench-stand"
  | "bench-cheer"
  | "bench-reach"
  | "bench-dejected"
  | "box"
  | "official-drop"
  | "official-point"
  | "official-arm"
  | "coach-idle"
  | "coach-clap"
  | "coach-point"
  | "coach-despair";
export interface RigInput {
  x: number;
  z: number;
  vx: number;
  vz: number;
  puckX: number;
  puckZ: number;
  hasPuck: boolean;
  /** Desired body yaw (radians, 0 = +z). Overrides the automatic facing. */
  face?: number;
  /** Where the head looks (defaults to the puck). */
  lookX?: number;
  lookZ?: number;
}
export interface RigIdentity {
  id: string;
  name: string;
  number: number;
}

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (a: number) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
export function hash01(id: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
const luminance = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

/* ------------------------------------------------------------------ poses */

/**
 * A full pose. Lateral values (bx, gx, fx, tx) are mirrored: positive means the
 * stick-blade side of the player, so one pose fits left and right shots.
 * Chest-space targets are relative to the spine pivot (shoulders at y 0.47).
 */
const PARAMS = [
  "crouch", // extra knee bend on skating legs
  "lean", // spine pitch forward
  "twist", // spine yaw toward the stick side (+)
  "roll", // spine roll toward the stick side (+)
  "headPitch",
  "headYaw",
  "lift", // jump height (m)
  "offF", // body shifted forward of the root (m)
  "stance", // extra leg spread on skating legs
  "legW", // 0 = skating legs, 1 = posed legs below
  "sHip",
  "sKnee",
  "sAbd",
  "oHip",
  "oKnee",
  "oAbd",
  "kneel", // knees count as ice contacts
  "seat", // 0..1 sitting
  "seatY",
  "bx", // stick blade, root space
  "by",
  "bz",
  "gx", // top hand, chest space
  "gy",
  "gz",
  "stickW", // lower hand on the stick (1) or free (0)
  "fx", // free / lower hand target, chest space
  "fy",
  "fz",
  "tx", // top hand free target (roles without a stick)
  "ty",
  "tz",
  "bf", // goalie butterfly
  "yawOff",
] as const;
type Param = (typeof PARAMS)[number];
type Pose = Record<Param, number>;
type Partial2 = Partial<Pose>;

const BASE: Pose = {
  crouch: 0,
  lean: 0.1,
  twist: 0,
  roll: 0,
  headPitch: 0,
  headYaw: 0,
  lift: 0,
  offF: 0,
  stance: 0,
  legW: 0,
  sHip: 0,
  sKnee: 0,
  sAbd: 0,
  oHip: 0,
  oKnee: 0,
  oAbd: 0,
  kneel: 0,
  seat: 0,
  seatY: 0.48,
  bx: 0.32,
  by: 0.02,
  bz: 1.0,
  gx: -0.05,
  gy: 0.12,
  gz: 0.34,
  stickW: 1,
  fx: 0.24,
  fy: -0.02,
  fz: 0.2,
  tx: -0.24,
  ty: -0.05,
  tz: 0.08,
  bf: 0,
  yawOff: 0,
};
const pose = (over: Partial2 = {}): Pose => ({ ...BASE, ...over });
const mix = (a: Pose, b: Pose, t: number, out: Pose) => {
  for (const k of PARAMS) out[k] = lerp(a[k], b[k], t);
  return out;
};

/** Partial keyframes: a key only overrides the params it names. */
type Key = [number, Partial2];
interface ActionSpec {
  dur: number;
  keys: Key[];
}
function sampleAction(spec: ActionSpec, t: number, base: Pose, out: Pose) {
  const keys = spec.keys;
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [ta, a] = keys[i];
  const [tb, b] = keys[Math.min(i + 1, keys.length - 1)];
  const u = tb > ta ? smooth(clamp((t - ta) / (tb - ta), 0, 1)) : 1;
  for (const k of PARAMS) {
    const va = a[k] ?? base[k];
    const vb = b[k] ?? base[k];
    out[k] = lerp(va, vb, u);
  }
  return out;
}

const ACTIONS: Record<string, ActionSpec> = {
  // Wrist shot: load the blade back, sweep through, high follow-through.
  shot: {
    dur: 0.85,
    keys: [
      [0, {}],
      [0.26, { bx: 0.6, by: 0.25, bz: -0.2, gx: 0.12, gy: 0.4, gz: 0.05, twist: 0.7, crouch: 0.1 }],
      [0.38, { bx: 0.2, by: 0.02, bz: 1.15, gx: -0.02, gy: 0.05, gz: 0.42, twist: -0.35, lean: 0.35, crouch: 0.18, offF: 0.1 }],
      [0.6, { bx: -0.08, by: 0.85, bz: 1.05, gx: -0.12, gy: 0.5, gz: 0.42, twist: -0.65, lean: 0.15, offF: 0.1 }],
      [0.85, {}],
    ],
  },
  // Slap shot: big back-swing above the shoulder, then a fast strike.
  slap: {
    dur: 1.05,
    keys: [
      [0, {}],
      [0.4, { bx: 0.9, by: 1.55, bz: -0.55, gx: 0.05, gy: 0.55, gz: 0.0, twist: 0.95, crouch: 0.15, stickW: 1 }],
      [0.52, { bx: 0.25, by: 0.02, bz: 1.1, gx: -0.02, gy: 0.0, gz: 0.4, twist: -0.4, lean: 0.4, crouch: 0.25, offF: 0.12 }],
      [0.78, { bx: -0.2, by: 1.0, bz: 0.95, gx: -0.15, gy: 0.55, gz: 0.4, twist: -0.75, lean: 0.12 }],
      [1.05, {}],
    ],
  },
  pass: {
    dur: 0.7,
    keys: [
      [0, {}],
      [0.2, { bx: 0.55, by: 0.02, bz: 0.25, gx: 0.08, gy: 0.12, gz: 0.2, twist: 0.4, lean: 0.12, crouch: 0.06 }],
      [0.34, { bx: 0.06, by: 0.02, bz: 1.2, gx: -0.02, gy: 0.1, gz: 0.46, twist: -0.3, lean: 0.16, offF: 0.04 }],
      [0.52, { bx: 0.14, by: 0.14, bz: 1.28, gy: 0.14, gz: 0.44, twist: -0.12 }],
      [0.7, {}],
    ],
  },
  // Shoulder-first body check.
  check: {
    dur: 0.65,
    keys: [
      [0, {}],
      [0.18, { bx: 0.2, bz: 0.6, twist: 0.3, lean: 0.3, crouch: 0.3, stickW: 0, fx: 0.32, fy: 0.28, fz: 0.15 }],
      [0.34, { bx: 0.1, bz: 0.7, twist: -0.55, lean: 0.5, crouch: 0.32, offF: 0.45, stickW: 0, fx: 0.35, fy: 0.35, fz: 0.32, headPitch: 0.15 }],
      [0.5, { twist: -0.3, lean: 0.3, crouch: 0.2, offF: 0.3, stickW: 0.5 }],
      [0.65, {}],
    ],
  },
  // The player who gets hit: head snaps, upper body staggers, stick flails.
  checked: {
    dur: 0.9,
    keys: [
      [0, {}],
      [0.14, { bx: 0.65, by: 0.5, bz: 0.4, twist: 0.6, lean: -0.42, roll: 0.25, crouch: 0.1, stickW: 0, fx: 0.45, fy: 0.45, fz: 0.0, offF: -0.34, headPitch: -0.2 }],
      [0.45, { bx: 0.45, by: 0.2, bz: 0.7, twist: 0.3, lean: -0.15, roll: 0.1, stickW: 0.3, offF: -0.16 }],
      [0.9, {}],
    ],
  },
  protest: {
    dur: 1.6,
    keys: [
      [0, {}],
      [0.25, { stickW: 0, fx: 0.55, fy: 0.35, fz: 0.25, lean: 0, headYaw: 0.3 }],
      [0.6, { stickW: 0, fx: 0.5, fy: 0.42, fz: 0.32, headYaw: -0.2 }],
      [1.2, { stickW: 0, fx: 0.55, fy: 0.3, fz: 0.25, headYaw: 0.25 }],
      [1.6, {}],
    ],
  },
  // Faceoff winner pulls the puck back between his skates.
  draw: {
    dur: 0.6,
    keys: [
      [0, {}],
      [0.18, { bx: -0.05, by: 0.02, bz: 0.35, gx: -0.04, gy: 0.0, gz: 0.25, twist: 0.35, lean: 0.55, crouch: 0.45 }],
      [0.6, {}],
    ],
  },
  // Faceoff loser ties up the opponent's stick and body.
  "tie-up": {
    dur: 0.7,
    keys: [
      [0, {}],
      [0.2, { bx: 0.15, by: 0.15, bz: 0.95, gz: 0.45, lean: 0.4, crouch: 0.35, offF: 0.35, stickW: 0, fx: 0.15, fy: 0.25, fz: 0.48 }],
      [0.7, {}],
    ],
  },
  "stick-tap": {
    dur: 0.8,
    keys: [
      [0, {}],
      [0.15, { by: 0.25, bz: 0.95 }],
      [0.25, { by: 0.02 }],
      [0.42, { by: 0.25 }],
      [0.52, { by: 0.02 }],
      [0.8, {}],
    ],
  },
  // Linesman: hand drops the puck, then he backs away.
  drop: {
    dur: 0.6,
    keys: [
      [0, { lean: 0.55, crouch: 0.25, tx: -0.05, ty: 0.12, tz: 0.6 }],
      [0.18, { lean: 0.65, crouch: 0.3, tx: -0.05, ty: -0.05, tz: 0.58 }],
      [0.6, {}],
    ],
  },
};

/** Goalie saves, picked from where the shot arrives (mirrored: + = glove side). */
const SAVES: Record<string, ActionSpec> = {
  glove: {
    dur: 1.1,
    keys: [
      [0, {}],
      [0.14, { fx: 0.62, fy: 0.5, fz: 0.45, roll: 0.22, twist: 0.25, crouch: 0.1, headYaw: 0.4, sAbd: 0.25 }],
      [0.7, { fx: 0.48, fy: 0.42, fz: 0.4, roll: 0.12, twist: 0.15, headYaw: 0.25 }],
      [1.1, {}],
    ],
  },
  blocker: {
    dur: 1.0,
    keys: [
      [0, {}],
      [0.13, { gx: -0.62, gy: 0.38, gz: 0.38, bx: -0.9, by: 0.4, bz: 0.9, roll: -0.22, twist: -0.25, headYaw: -0.4 }],
      [1.0, {}],
    ],
  },
  pad: {
    dur: 1.0,
    keys: [
      [0, {}],
      [0.12, { legW: 1, sHip: 0.35, sKnee: 0.12, sAbd: 1.15, oHip: 0.55, oKnee: 1.2, oAbd: 0.25, roll: -0.25, crouch: 0.2, fx: 0.55, fy: 0.15, fz: 0.4, headYaw: 0.45 }],
      [0.6, { legW: 1, sHip: 0.4, sKnee: 0.3, sAbd: 0.95, oHip: 0.55, oKnee: 1.1, oAbd: 0.25, roll: -0.15 }],
      [1.0, {}],
    ],
  },
  butterfly: {
    dur: 1.1,
    keys: [
      [0, {}],
      [0.12, { bf: 1, fx: 0.48, fy: 0.12, fz: 0.48, gx: -0.36, gy: 0.05, gz: 0.4, lean: 0.12, headPitch: 0.25 }],
      [0.75, { bf: 1, fx: 0.44, fy: 0.1, fz: 0.46, lean: 0.12 }],
      [1.1, {}],
    ],
  },
  chest: {
    dur: 0.9,
    keys: [
      [0, {}],
      [0.1, { crouch: 0.15, lean: 0.25, fx: 0.15, fy: 0.25, fz: 0.32, gx: -0.12, gy: 0.22, gz: 0.32, lift: 0.04, headPitch: 0.15 }],
      [0.9, {}],
    ],
  },
};

/** Stride keyframes: phase, hip flex (+ forward), knee flex, hip abduction. */
const STRIDE = [
  [0.0, 0.3, 1.05, 0.1],
  [0.25, -0.1, 0.65, 0.38],
  [0.45, -0.55, 0.2, 0.46],
  [0.65, -0.05, 1.15, 0.15],
  [0.85, 0.4, 0.95, 0.08],
  [1.0, 0.3, 1.05, 0.1],
];
function sampleStride(t: number, out: number[]) {
  let i = 0;
  while (t > STRIDE[i + 1][0]) i++;
  const a = STRIDE[i],
    b = STRIDE[i + 1];
  const u = smooth((t - a[0]) / (b[0] - a[0]));
  for (let k = 1; k < 4; k++) out[k - 1] = lerp(a[k], b[k], u);
}
const strideOut = [0, 0, 0];

// Reusable scratch objects: avoids per-frame allocations in the animation loop.
const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _up = new THREE.Vector3(0, 1, 0),
  _q = new THREE.Quaternion(),
  _m = new THREE.Matrix4(),
  _mi = new THREE.Matrix4();

/** Place a unit-length (along Y) mesh between two points. */
function orient(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, thickness = 1) {
  _a.subVectors(to, from);
  const length = Math.max(0.001, _a.length());
  mesh.position.copy(from).addScaledVector(_a, 0.5);
  _q.setFromUnitVectors(_up, _a.divideScalar(length));
  mesh.quaternion.copy(_q);
  mesh.scale.set(thickness, length, thickness);
}

/** Analytic two-bone IK. Writes the elbow; hand is the (possibly clamped) target. */
function solveArm(
  shoulder: THREE.Vector3,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  l1: number,
  l2: number,
  elbow: THREE.Vector3,
  hand: THREE.Vector3,
) {
  _a.subVectors(target, shoulder);
  let dist = _a.length();
  dist = clamp(dist, Math.abs(l1 - l2) + 0.02, (l1 + l2) * 0.995);
  _a.normalize();
  hand.copy(shoulder).addScaledVector(_a, dist);
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  _b.copy(pole).addScaledVector(_a, -pole.dot(_a));
  if (_b.lengthSq() < 1e-6) _b.set(0, -1, 0);
  _b.normalize();
  elbow.copy(shoulder).addScaledVector(_a, along).addScaledVector(_b, h);
}

const SKIN = ["#f2cfae", "#e6b690", "#d09a72", "#a76d48", "#6b4430"];
const HAIR = ["#2a1d15", "#4a3222", "#8a6a43", "#151515", "#9a9a9a"];

type Mats = {
  jersey: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  helmet: THREE.MeshStandardMaterial;
  socks: THREE.MeshStandardMaterial;
  pad: THREE.MeshStandardMaterial;
  numberInk: string;
};

/** Owns shared geometry and materials; rigs only hold their pose. */
export class RigFactory {
  private geos = new Map<string, THREE.BufferGeometry>();
  private kits = new Map<string, Mats>();
  private disposables: { dispose(): void }[] = [];
  readonly skin = SKIN.map((c) => this.own(new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 })));
  readonly hair = HAIR.map((c) => this.own(new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })));
  readonly dark = this.own(new THREE.MeshStandardMaterial({ color: "#14181f", roughness: 0.7 }));
  readonly glove = this.own(new THREE.MeshStandardMaterial({ color: "#1b2029", roughness: 0.8 }));
  readonly steel = this.own(new THREE.MeshStandardMaterial({ color: "#b8c4cc", roughness: 0.25, metalness: 0.7 }));
  readonly wood = this.own(new THREE.MeshStandardMaterial({ color: "#1d1d20", roughness: 0.5 }));
  readonly tape = this.own(new THREE.MeshStandardMaterial({ color: "#f0f0f0", roughness: 0.9 }));
  readonly white = this.own(new THREE.MeshStandardMaterial({ color: "#f2f4f6", roughness: 0.7 }));
  readonly orange = this.own(new THREE.MeshStandardMaterial({ color: "#ff6a13", roughness: 0.6 }));
  readonly visor = this.own(
    new THREE.MeshStandardMaterial({ color: "#d8eef8", roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  readonly shadow: THREE.MeshBasicMaterial;
  readonly stripes: THREE.MeshStandardMaterial;
  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
      g.addColorStop(0, "rgba(0,0,0,0.55)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    const tex = this.own(new THREE.CanvasTexture(canvas));
    this.shadow = this.own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    // Officials' vertical black-and-white stripes.
    const stripe = document.createElement("canvas");
    stripe.width = 128;
    stripe.height = 8;
    const sc = stripe.getContext("2d");
    if (sc)
      for (let i = 0; i < 16; i++) {
        sc.fillStyle = i % 2 ? "#141414" : "#f4f4f4";
        sc.fillRect(i * 8, 0, 8, 8);
      }
    const stripeTex = this.own(new THREE.CanvasTexture(stripe));
    stripeTex.colorSpace = THREE.SRGBColorSpace;
    stripeTex.wrapS = THREE.RepeatWrapping;
    this.stripes = this.own(new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.8 }));
  }
  private own<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }
  geo(key: string, make: () => THREE.BufferGeometry) {
    let g = this.geos.get(key);
    if (!g) {
      g = make();
      this.geos.set(key, g);
      this.disposables.push(g);
    }
    return g;
  }
  /** Unit-length capsule along Y (scaled by orient()). */
  capsule(radius: number) {
    return this.geo(`cap${radius}`, () => new THREE.CapsuleGeometry(radius, 1, 3, 8));
  }
  box(w: number, h: number, d: number) {
    return this.geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  }
  sphere(r: number, ws = 14, hs = 10) {
    return this.geo(`sph${r},${ws}`, () => new THREE.SphereGeometry(r, ws, hs));
  }
  cyl(rt: number, rb: number, h: number, seg = 14) {
    return this.geo(`cyl${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  }
  /** Merged facial features, so a face costs a few draw calls at most. */
  face() {
    const tint = (g: THREE.BufferGeometry, color: string) => {
      const c = new THREE.Color(color);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      return g;
    };
    const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rz = 0) => {
      g.scale(sx, sy, sz);
      if (rz) g.rotateZ(rz);
      g.translate(x, y, z);
      return g;
    };
    const eyes = this.geo("faceEyes", () =>
      mergeGeometries(
        [-1, 1].flatMap((s) => [
          tint(at(new THREE.SphereGeometry(0.016, 10, 8), s * 0.037, 0.022, 0.097, 1.25, 0.8, 0.55), "#f4f1ea"),
          tint(at(new THREE.SphereGeometry(0.0085, 8, 6), s * 0.036, 0.021, 0.105), "#2a1a12"),
          tint(at(new THREE.SphereGeometry(0.003, 6, 4), s * 0.034, 0.024, 0.113), "#ffffff"),
        ]).concat([tint(at(new THREE.BoxGeometry(0.042, 0.007, 0.012), 0, -0.05, 0.1), "#8a3b36")]),
      )!,
    );
    const nose = (ears: boolean) =>
      this.geo(ears ? "faceNoseEars" : "faceNose", () =>
        mergeGeometries([
          at(new THREE.ConeGeometry(0.014, 0.034, 8).rotateX(Math.PI / 2.4), 0, -0.012, 0.107),
          ...(ears ? [-1, 1].map((s) => at(new THREE.SphereGeometry(0.022, 8, 6), s * 0.096, 0.002, 0.0, 0.5, 1, 0.8)) : []),
        ])!,
      );
    const brows = this.geo("faceBrows", () =>
      mergeGeometries([-1, 1].map((s) => at(new THREE.BoxGeometry(0.034, 0.008, 0.012), s * 0.037, 0.045, 0.101, 1, 1, 1, -s * 0.12)))!,
    );
    const beard = this.geo("faceBeard", () => {
      const g = new THREE.SphereGeometry(0.103, 16, 8, Math.PI / 2 - 1.15, 2.3, Math.PI * 0.58, Math.PI * 0.3);
      g.scale(0.96, 1.12, 1.02);
      g.translate(0, 0, 0.012);
      return g;
    });
    return { eyes, nose, brows, beard };
  }
  readonly features = this.own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  material(color: string, roughness = 0.75) {
    const key = `mat${color}${roughness}`;
    let found = this.materials.get(key);
    if (!found) {
      found = this.own(new THREE.MeshStandardMaterial({ color, roughness }));
      this.materials.set(key, found);
    }
    return found;
  }
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  kit(kit: TeamKit): Mats {
    const key = Object.values(kit).join("|");
    let m = this.kits.get(key);
    if (!m) {
      m = {
        jersey: this.material(kit.jersey, 0.8),
        trim: this.material(kit.trim, 0.8),
        pants: this.material(kit.pants, 0.85),
        helmet: this.material(kit.helmet, 0.35),
        socks: this.material(kit.socks, 0.9),
        pad: this.material("#e9edf0", 0.6),
        numberInk: luminance(kit.jersey) > 0.55 ? "#101820" : "#ffffff",
      };
      this.kits.set(key, m);
    }
    return m;
  }
  skater(kit: TeamKit) {
    return new HockeyRig(this, this.kit(kit), "skater");
  }
  goalie(kit: TeamKit) {
    return new HockeyRig(this, this.kit(kit), "goalie");
  }
  official(kind: "referee" | "linesman") {
    return new HockeyRig(
      this,
      {
        jersey: this.stripes,
        trim: this.dark,
        pants: this.dark,
        helmet: this.dark,
        socks: this.dark,
        pad: this.dark,
        numberInk: "#101010",
      },
      kind,
    );
  }
  /** Bench boss in a suit; the tie picks up the team colour. */
  coach(teamColour: string, suit = "#1d2633") {
    return new HockeyRig(
      this,
      {
        jersey: this.material(suit, 0.7),
        trim: this.material(teamColour, 0.6),
        pants: this.material(suit, 0.7),
        helmet: this.dark,
        socks: this.dark,
        pad: this.white,
        numberInk: "#ffffff",
      },
      "coach",
    );
  }
  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.geos.clear();
    this.kits.clear();
    this.materials.clear();
  }
}

const THIGH = 0.46,
  SHIN = 0.46,
  HIP_X = 0.11,
  SHOULDER_X = 0.235,
  SHOULDER_Y = 0.47,
  UPPER = 0.31,
  FORE = 0.3;
/** Ankle to the bottom of the skate blade / shoe sole. */
const BLADE_DROP = 0.115,
  SHOE_DROP = 0.07;
/** Goalie leg pad shell (knee space). */
const PAD_H = 0.68,
  PAD_Y = -0.2;

export class HockeyRig {
  readonly root = new THREE.Group();
  private build = new THREE.Group();
  private pelvis = new THREE.Group();
  private spine = new THREE.Group();
  private head = new THREE.Group();
  private hips: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private ankles: THREE.Group[] = [];
  private armMeshes: { upper: THREE.Mesh; fore: THREE.Mesh; hand: THREE.Object3D }[] = [];
  private shaft?: THREE.Mesh;
  private blade = new THREE.Group();
  private catcher?: THREE.Object3D;
  private numberMat?: THREE.MeshStandardMaterial;
  private numberTex?: THREE.CanvasTexture;
  private numberCanvas?: HTMLCanvasElement;
  private skinMesh: THREE.Mesh[] = [];
  private hairMesh?: THREE.Mesh;
  private brows?: THREE.Mesh;
  private beard?: THREE.Mesh;
  private identity = "";
  readonly goalie: boolean;
  readonly hasStick: boolean;
  /** +1: blade on the player's left (left shot / regular goalie), -1: right. */
  hs = 1;
  private variety = 0.5;
  // Smoothed state
  private placed = false;
  private px = 0;
  private pz = 0;
  private svx = 0;
  private svz = 0;
  private yaw = 0;
  private spPrev = 0;
  private phase = Math.random();
  private amp = 0;
  private bank = 0;
  private stopT = 0;
  private stopDir = 1;
  private clock = Math.random() * 10;
  // Pose layers
  private state: RigState = "play";
  private stateT = 0;
  private stateVariant = 0;
  private stateSide = 1;
  private prevPose = pose();
  private fade = 1;
  private timedState?: { until: number; then: RigState };
  private action: { spec: ActionSpec; t: number; urgent: boolean } | null = null;
  private current = pose();
  private target = pose();
  private actionPose = pose();
  private readonly contactDrop: number;
  constructor(
    private factory: RigFactory,
    private mats: Mats,
    readonly role: RigRole,
  ) {
    const f = factory;
    this.goalie = role === "goalie";
    this.hasStick = role === "skater" || role === "goalie";
    const coach = role === "coach";
    const official = role === "referee" || role === "linesman";
    this.contactDrop = coach ? SHOE_DROP : BLADE_DROP;
    this.root.add(this.build);
    const shadow = new THREE.Mesh(f.geo("shadowPlane", () => new THREE.PlaneGeometry(1.2, 1.2)), f.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.014;
    shadow.renderOrder = 1;
    if (!coach) this.root.add(shadow);
    this.build.add(this.pelvis);
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const g = this.goalie;
    const hipMesh = add(this.pelvis, f.cyl(0.17, 0.18, 0.24), mats.pants, 0, -0.02, 0);
    hipMesh.scale.set(g ? 1.25 : coach ? 0.9 : 1, 1, g ? 1.0 : coach ? 0.7 : 0.78);
    if (!coach && !official) {
      const pantStripe = add(this.pelvis, f.cyl(0.182, 0.186, 0.035), mats.trim, 0, -0.1, 0);
      pantStripe.scale.copy(hipMesh.scale);
    }
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * (g ? HIP_X + 0.02 : HIP_X), -0.05, 0);
      this.pelvis.add(hip);
      this.hips.push(hip);
      const thigh = add(hip, f.capsule(g ? 0.105 : coach ? 0.07 : 0.088), mats.pants);
      thigh.scale.y = THIGH - 0.02;
      thigh.position.y = -THIGH / 2;
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      hip.add(knee);
      this.knees.push(knee);
      const shin = add(knee, f.capsule(g ? 0.085 : coach ? 0.06 : 0.062), g ? mats.pad : coach ? mats.pants : mats.socks);
      shin.scale.y = SHIN - 0.04;
      shin.position.y = -SHIN / 2;
      if (role === "skater") {
        const guard = add(knee, f.box(0.13, 0.14, 0.12), mats.pants, 0, -0.02, 0.035);
        guard.rotation.x = -0.1;
        add(knee, f.cyl(0.066, 0.064, 0.05, 10), mats.trim, 0, -0.2, 0);
      } else if (g) {
        add(knee, f.box(0.23, PAD_H, 0.19), mats.pad, 0, PAD_Y, 0.02);
        add(knee, f.box(0.25, 0.06, 0.21), mats.trim, 0, PAD_Y + PAD_H / 2 - 0.09, 0.02);
        add(knee, f.box(0.25, 0.06, 0.21), mats.trim, 0, PAD_Y - PAD_H / 2 + 0.07, 0.02);
        add(hip, f.box(0.2, 0.36, 0.16), mats.pad, 0, -0.2, 0.04);
      }
      const ankle = new THREE.Group();
      ankle.position.y = -SHIN;
      knee.add(ankle);
      this.ankles.push(ankle);
      if (coach) {
        add(ankle, f.box(0.1, 0.07, 0.26), f.dark, 0, -0.035, 0.05);
      } else {
        add(ankle, f.box(0.1, 0.09, 0.27), f.dark, 0, -0.045, 0.045);
        add(ankle, f.box(0.012, 0.025, 0.26), f.dark, 0, -0.098, 0.04);
        add(ankle, f.box(0.008, 0.014, 0.3), f.steel, 0, -0.108, 0.04);
      }
    }
    // Upper body
    this.pelvis.add(this.spine);
    this.spine.position.y = 0.04;
    const chestR = g ? 0.27 : coach ? 0.19 : official ? 0.2 : 0.215;
    const waistR = g ? 0.24 : coach ? 0.165 : 0.17;
    const depth = g ? 0.78 : coach ? 0.66 : 0.64;
    const torso = add(this.spine, f.cyl(chestR, waistR, 0.5, 16), mats.jersey, 0, 0.25, 0);
    torso.scale.z = depth;
    if (!coach) {
      const hem = add(this.spine, f.cyl(waistR + 0.004, waistR + 0.004, 0.07, 16), official ? mats.jersey : mats.trim, 0, 0.05, 0);
      hem.scale.z = depth;
      if (!official) {
        const stripe = add(this.spine, f.cyl(chestR - 0.01, chestR - 0.012, 0.05, 16), mats.trim, 0, 0.31, 0);
        stripe.scale.z = depth;
        const yoke = add(this.spine, f.cyl(chestR * 0.86, chestR + 0.005, 0.06, 16), mats.trim, 0, SHOULDER_Y - 0.03, 0);
        yoke.scale.z = depth;
      }
    } else {
      // Shirt, tie and lapels.
      add(this.spine, f.box(0.1, 0.22, 0.02), f.white, 0, 0.36, chestR * depth - 0.004);
      add(this.spine, f.box(0.035, 0.24, 0.02), mats.trim, 0, 0.33, chestR * depth + 0.004);
      add(this.spine, f.box(0.05, 0.03, 0.022), mats.trim, 0, 0.45, chestR * depth + 0.004);
    }
    const shoulders = add(this.spine, f.capsule(g ? 0.12 : coach ? 0.075 : 0.092), mats.jersey, 0, SHOULDER_Y - 0.02, 0);
    shoulders.rotation.z = Math.PI / 2;
    shoulders.scale.y = g ? 0.5 : coach ? 0.4 : 0.46;
    const neck = add(this.spine, f.cyl(0.05, 0.058, 0.1, 10), f.skin[2], 0, SHOULDER_Y + 0.08, 0);
    this.skinMesh.push(neck);
    if (role === "skater" || role === "goalie" || official) {
      this.numberCanvas = document.createElement("canvas");
      this.numberCanvas.width = this.numberCanvas.height = 256;
      this.numberTex = new THREE.CanvasTexture(this.numberCanvas);
      this.numberTex.colorSpace = THREE.SRGBColorSpace;
      this.numberTex.anisotropy = 4;
      this.numberMat = new THREE.MeshStandardMaterial({ map: this.numberTex, transparent: true, roughness: 1 });
      const plate = add(this.spine, f.geo("numberPlane", () => new THREE.PlaneGeometry(0.34, 0.34)), this.numberMat, 0, 0.3, -(chestR * depth + 0.006));
      plate.rotation.y = Math.PI;
    }
    // Head
    this.spine.add(this.head);
    this.head.position.y = SHOULDER_Y + 0.17;
    const face = add(this.head, f.sphere(0.1), f.skin[2], 0, 0, 0.01);
    face.scale.set(0.95, 1.12, 1);
    this.skinMesh.push(face);
    const faceParts = f.face();
    add(this.head, faceParts.eyes, f.features);
    const nose = add(this.head, faceParts.nose(!coach), f.skin[2]);
    this.skinMesh.push(nose);
    this.brows = add(this.head, faceParts.brows, f.hair[0]);
    this.beard = add(this.head, faceParts.beard, f.hair[0]);
    this.beard.visible = false;
    if (coach) {
      const hair = add(this.head, f.geo("hairCap", () => new THREE.SphereGeometry(0.106, 16, 10, 0, TAU, 0, Math.PI * 0.5)), f.hair[0], 0, 0.02, -0.006);
      hair.scale.set(1, 1.02, 1.05);
      this.hairMesh = hair;
      for (const s of [-1, 1]) add(this.head, f.sphere(0.022, 6, 5), f.skin[2], s * 0.098, 0.0, 0.0);
    } else {
      // Goalies wear a full mask; skaters and officials an open helmet whose
      // rim sits on the brow so the face stays visible under the visor.
      const helmet = add(
        this.head,
        g
          ? f.geo("helmetCap", () => new THREE.SphereGeometry(0.128, 18, 12, 0, TAU, 0, Math.PI * 0.62))
          : f.geo("helmetOpen", () => {
              const cap = new THREE.SphereGeometry(0.128, 20, 10, 0, TAU, 0, Math.PI * 0.47);
              // Lower shell over the ears and back of the head only.
              const back = new THREE.SphereGeometry(0.128, 20, 6, Math.PI * 1.05, Math.PI * 0.9, Math.PI * 0.47, Math.PI * 0.2);
              return mergeGeometries([cap, back])!;
            }),
        mats.helmet,
        0,
        g ? 0.012 : 0.04,
        -0.012,
      );
      helmet.scale.set(1.02, 1.0, 1.12);
      if (g) {
        for (const [y, r] of [[-0.02, 0.118], [0.03, 0.124], [-0.065, 0.1]] as const) {
          const ring = add(this.head, f.geo(`cage${r}`, () => new THREE.TorusGeometry(r, 0.006, 5, 18)), f.steel, 0, y, 0.015);
          ring.rotation.x = Math.PI / 2;
          ring.scale.set(1, 1.05, 1);
        }
        for (const x of [-0.04, 0, 0.04]) add(this.head, f.box(0.008, 0.16, 0.008), f.steel, x, -0.025, 0.125);
      } else if (role === "skater") {
        add(this.head, f.box(0.16, 0.05, 0.012), f.visor, 0, 0.022, 0.124).rotation.x = 0.12;
      }
    }
    // Arms (positioned in spine space every frame by IK)
    for (const side of [0, 1]) {
      const upper = add(this.spine, f.capsule(g ? 0.07 : coach ? 0.05 : 0.058), mats.jersey);
      const fore = add(this.spine, f.capsule(g ? 0.064 : coach ? 0.045 : 0.052), mats.jersey);
      const hand = new THREE.Mesh(f.sphere(coach || official ? 0.042 : 0.058, 10, 8), coach || official ? f.skin[2] : f.glove);
      if (coach || official) this.skinMesh.push(hand);
      this.spine.add(hand);
      this.armMeshes.push({ upper, fore, hand });
      if (role === "skater") {
        // Elbow stripe on the sleeve.
        const band = new THREE.Mesh(f.cyl(0.06, 0.06, 0.05, 10), mats.trim);
        fore.add(band);
        band.position.y = 0.3;
      }
      if (role === "referee") {
        const band = new THREE.Mesh(f.cyl(0.064, 0.064, 0.07, 10), f.orange);
        upper.add(band);
        band.position.y = 0.05;
        band.scale.set(1, 1, 1);
        void side;
      }
    }
    if (g) {
      const catcher = new THREE.Mesh(f.box(0.21, 0.27, 0.07), mats.trim);
      this.spine.add(catcher);
      this.catcher = catcher;
      this.armMeshes[1].hand.visible = false;
      const blocker = new THREE.Mesh(f.box(0.17, 0.24, 0.06), mats.pad);
      this.armMeshes[0].hand.add(blocker);
    }
    if (this.hasStick) {
      this.shaft = new THREE.Mesh(f.geo(g ? "shaftG" : "shaft", () => new THREE.BoxGeometry(g ? 0.045 : 0.028, 1, 0.02)), f.wood);
      this.root.add(this.shaft);
      this.root.add(this.blade);
      const bl = new THREE.Mesh(f.box(0.02, g ? 0.22 : 0.085, 0.3), f.wood);
      bl.position.set(0, g ? 0.11 : 0.042, 0.14);
      this.blade.add(bl);
      const tape = new THREE.Mesh(f.box(0.024, g ? 0.1 : 0.05, 0.2), f.tape);
      tape.position.set(0, g ? 0.06 : 0.03, 0.18);
      this.blade.add(tape);
    }
    if (coach) this.state = "coach-idle";
  }
  /** Assign who this actor represents: number, name, height, handedness, skin. */
  setIdentity(id: RigIdentity, pos: string) {
    if (this.identity === id.id) return;
    this.identity = id.id;
    this.variety = hash01(id.id, 13);
    this.hs = this.hasStick ? (hash01(id.id, 3) < 0.62 ? 1 : -1) : 1;
    const tall = pos === "D" ? 1.03 : pos === "G" ? 1.02 : pos === "C" ? 1.0 : 0.99;
    const h = tall * (0.955 + hash01(id.id, 5) * 0.09);
    const w = 0.95 + hash01(id.id, 7) * 0.12 + (pos === "D" ? 0.05 : 0);
    // Slightly exaggerated size keeps figures readable at broadcast distance.
    const scale = this.role === "coach" ? 1.04 : 1.1;
    this.build.scale.set(w * scale, h * scale, w * scale);
    const tone = hash01(id.id, 11);
    const skin = this.factory.skin[tone < 0.5 ? 0 : tone < 0.75 ? 1 : tone < 0.9 ? 2 : tone < 0.97 ? 3 : 4];
    this.skinMesh.forEach((m) => (m.material = skin));
    const hair = this.factory.hair[Math.floor(hash01(id.id, 17) * HAIR.length)];
    if (this.hairMesh) this.hairMesh.material = hair;
    if (this.brows) this.brows.material = hair;
    if (this.beard) {
      this.beard.material = hair;
      // Some players and staff wear a beard (playoff beards are a tradition).
      this.beard.visible = hash01(id.id, 23) < (this.role === "skater" || this.role === "goalie" ? 0.32 : 0.2);
    }
    const ctx = this.numberCanvas?.getContext("2d");
    if (ctx && this.numberTex) {
      ctx.clearRect(0, 0, 256, 256);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (this.role === "referee" || this.role === "linesman") {
        ctx.fillStyle = "#f4f4f4";
        ctx.fillRect(70, 92, 116, 130);
      }
      ctx.fillStyle = this.mats.numberInk;
      ctx.font = "800 46px system-ui, Arial, sans-serif";
      if (this.hasStick) {
        const last = id.name.split(" ").slice(-1)[0].toUpperCase().slice(0, 12);
        ctx.fillText(last, 128, 44);
      }
      ctx.font = "900 170px system-ui, Arial, sans-serif";
      ctx.fillText(String(id.number), 128, 158);
      this.numberTex.needsUpdate = true;
    }
  }
  /** Continuous pose chosen by the director; changes cross-fade. */
  setState(state: RigState, variant = this.stateVariant, side = this.stateSide) {
    this.timedState = undefined;
    this.enter(state, variant, side);
  }
  private enter(state: RigState, variant: number, side: number) {
    if (state === this.state && variant === this.stateVariant && side === this.stateSide) return;
    this.prevPose = { ...this.current };
    this.fade = 0;
    this.state = state;
    this.stateT = 0;
    this.stateVariant = variant;
    this.stateSide = side;
  }
  get currentState() {
    return this.state;
  }
  /**
   * One-shot action. `toward` gives the shot direction for saves (world
   * offset from the goalie to the puck) and `height` 0..1 how high it is.
   */
  trigger(kind: RigActionKind, toward?: { x: number; z: number }, height = 0.5) {
    if (kind === "celebrate" || kind === "conceded") {
      const state: RigState =
        kind === "celebrate" ? "celebrate" : this.goalie ? "goalie-beaten" : "dejected";
      this.enter(state, this.variety, 1);
      this.timedState = { until: 2.4, then: "play" };
      return;
    }
    let spec: ActionSpec | undefined;
    if (kind === "save" || kind === "beaten") {
      spec = this.saveFor(toward, height);
      if (kind === "beaten") spec = { dur: spec.dur * 1.25, keys: spec.keys };
    } else if (kind === "shot") spec = this.variety > 0.7 ? ACTIONS.slap : ACTIONS.shot;
    else if (kind === "faceoff") spec = ACTIONS.draw;
    else spec = ACTIONS[kind];
    if (!spec) return;
    const urgent = kind === "checked" || kind === "save" || kind === "beaten" || kind === "drop";
    if (this.action && !urgent && this.action.t < this.action.spec.dur * 0.8) return;
    this.action = { spec, t: 0, urgent };
  }
  /** Picks the save from where the puck arrives relative to the goalie. */
  private saveFor(toward?: { x: number; z: number }, height = 0.5) {
    if (!toward) return SAVES.butterfly;
    const fx = Math.sin(this.yaw),
      fz = Math.cos(this.yaw);
    // + = goalie's left; mirrored so + = glove side.
    const left = toward.x * fz - toward.z * fx;
    const lateral = (left / Math.max(0.4, Math.hypot(toward.x, toward.z))) * this.hs;
    if (height < 0.35) return Math.abs(lateral) > 0.25 ? SAVES.pad : SAVES.butterfly;
    if (Math.abs(lateral) < 0.12) return SAVES.chest;
    return lateral > 0 ? SAVES.glove : SAVES.blocker;
  }
  setVisible(v: boolean) {
    this.root.visible = v;
  }
  get visible() {
    return this.root.visible;
  }
  /** Teleport (used when a figure is placed rather than skating there). */
  place(x: number, z: number, yaw: number) {
    this.px = x;
    this.pz = z;
    this.svx = this.svz = 0;
    this.yaw = yaw;
    this.placed = true;
  }
  get x() {
    return this.px;
  }
  get z() {
    return this.pz;
  }
  /* ---------------------------------------------------------------- states */
  private statePose(state: RigState, t: number, out: Pose) {
    const v = this.stateVariant;
    const c = this.clock;
    Object.assign(out, BASE);
    const g = this.goalie;
    switch (state) {
      case "play":
        if (g) Object.assign(out, { crouch: 0.42, lean: 0.22, gx: -0.3, gy: 0.05, gz: 0.38, bx: -0.05, by: 0.02, bz: 0.95, stickW: 0, fx: 0.42, fy: 0.02, fz: 0.42 });
        else if (!this.hasStick) Object.assign(out, { crouch: 0.15, lean: 0.25, stickW: 0 });
        break;
      case "faceoff-ready":
        Object.assign(out, g
          ? { crouch: 0.5, lean: 0.25, gx: -0.3, gy: 0.05, gz: 0.38, bx: -0.05, bz: 0.95, stickW: 0, fx: 0.42, fy: 0.05, fz: 0.42 }
          : { crouch: 0.28, lean: 0.35, bx: 0.25, bz: 0.95, stance: 0.12, headPitch: 0.1 });
        break;
      case "faceoff-stance":
        Object.assign(out, { crouch: 0.62, lean: 0.78, stance: 0.28, bx: 0.08, by: 0.02, bz: 0.82, gx: 0.0, gy: -0.02, gz: 0.32, headPitch: 0.25 });
        break;
      case "celebrate": {
        if (v < 0.3) {
          // Arms up, stick raised high, little hops.
          Object.assign(out, { lean: -0.15, bx: 0.1, by: 2.25, bz: 0.35, gx: -0.12, gy: 0.82, gz: 0.18, stickW: 0, fx: 0.28, fy: 0.85, fz: 0.18, headPitch: -0.3, lift: Math.abs(Math.sin(t * 8.5)) * 0.1 });
        } else if (v < 0.55) {
          // Fist pump, roaring at the crowd.
          const pump = (Math.sin(t * 9) + 1) / 2;
          Object.assign(out, { crouch: 0.3, lean: 0.38, bx: 0.45, by: 0.02, bz: -0.35, gx: -0.1, gy: 0.0, gz: 0.1, stickW: 0, fx: 0.3, fy: 0.15 + pump * 0.45, fz: 0.32, headPitch: -0.35, twist: 0.35 });
        } else if (v < 0.8) {
          // Knee slide with a fist pump.
          const pump = (Math.sin(t * 8) + 1) / 2;
          Object.assign(out, { legW: 1, sHip: 0.05, sKnee: 1.75, sAbd: 0.05, oHip: 1.35, oKnee: 1.45, oAbd: 0.2, kneel: 1, lean: -0.05, bx: 0.5, by: 0.4, bz: -0.2, gx: -0.15, gy: 0.2, gz: 0.1, stickW: 0, fx: 0.3, fy: 0.3 + pump * 0.45, fz: 0.25, headPitch: -0.35 });
        } else {
          // Points to the crowd, stick trailing.
          Object.assign(out, { lean: 0.05, twist: 0.6, roll: -0.1, bx: 0.35, by: 0.02, bz: -0.45, gx: -0.15, gy: -0.02, gz: 0.08, stickW: 0, fx: 0.55, fy: 0.62, fz: 0.4, headPitch: -0.2, headYaw: 0.4 });
        }
        break;
      }
      case "hug":
        Object.assign(out, { lean: 0.35, crouch: 0.1, bx: 0.55, by: 0.05, bz: -0.25, gx: 0.1, gy: 0.3, gz: 0.45, stickW: 0, fx: -0.12, fy: 0.36, fz: 0.5, headPitch: 0.15, headYaw: 0.2 * Math.sin(c * 2) });
        break;
      case "fist-bump": {
        // Reach toward the bench (stateSide: +1 = player's left, -1 = right).
        const glove = this.stateSide * this.hs;
        Object.assign(out, { lean: 0.22, crouch: 0.12, roll: glove * 0.12, twist: glove * 0.3, bx: 0.3, by: 0.02, bz: -0.2, gx: -0.12, gy: 0.0, gz: 0.1, stickW: 0, fx: glove > 0 ? 0.62 : 0.15, fy: 0.22, fz: glove > 0 ? 0.25 : 0.55, headYaw: glove * 0.6 });
        break;
      }
      case "dejected":
        Object.assign(out, { lean: 0.6, crouch: 0.12, bx: 0.18, by: 0.02, bz: 0.62, gx: 0.04, gy: -0.12, gz: 0.4, headPitch: 0.55 });
        break;
      case "goalie-hold":
        Object.assign(out, v > 0.5
          ? { crouch: 0.2, lean: 0.05, fx: 0.4, fy: 0.55, fz: 0.25, gx: -0.3, gy: 0.05, gz: 0.38, bx: -0.05, bz: 0.95, stickW: 0, headPitch: -0.05 }
          : { bf: 1, lean: 0.35, fx: 0.08, fy: -0.1, fz: 0.52, gx: -0.3, gy: 0.0, gz: 0.4, bx: -0.05, bz: 0.95, stickW: 0, headPitch: 0.4 });
        break;
      case "goalie-beaten":
        Object.assign(out, { crouch: 0.15, lean: 0.35, gx: -0.25, gy: -0.05, gz: 0.3, bx: -0.1, bz: 0.8, stickW: 0, fx: 0.3, fy: -0.05, fz: 0.25, headPitch: 0.45, headYaw: 1.1 * (v > 0.5 ? 1 : -1) });
        break;
      case "seated":
      case "box":
        Object.assign(out, {
          legW: 1, sHip: 1.45, sKnee: 1.5, sAbd: 0.12, oHip: 1.45, oKnee: 1.5, oAbd: 0.12, seat: 1,
          lean: state === "box" ? 0.35 : 0.18 + 0.04 * Math.sin(c * 0.6 + v * 9),
          bx: 0.08, by: 0.02, bz: 0.55, gx: 0.02, gy: 0.06, gz: 0.32, stickW: 0, fx: 0.16, fy: -0.15, fz: 0.36,
          headPitch: state === "box" ? 0.35 : -0.05,
        });
        break;
      case "bench-stand":
        Object.assign(out, { legW: 1, sHip: 0.12, sKnee: 0.2, sAbd: 0.08, oHip: 0.12, oKnee: 0.2, oAbd: 0.08, lean: 0.3, bx: -0.3, by: 0.02, bz: 0.15, gx: -0.2, gy: 0.05, gz: 0.25, stickW: 0, fx: 0.2, fy: 0.05, fz: 0.45 });
        break;
      case "bench-cheer": {
        const bang = Math.abs(Math.sin(c * 7 + v * 5));
        Object.assign(out, { legW: 1, sHip: 0.05, sKnee: 0.1, sAbd: 0.1, oHip: 0.05, oKnee: 0.1, oAbd: 0.1, lean: -0.05, lift: bang * 0.05, bx: 0.3, by: 1.2 + bang * 0.6, bz: 0.55, gx: -0.1, gy: 0.4 + bang * 0.25, gz: 0.25, stickW: 0, fx: 0.28, fy: 0.55 + bang * 0.3, fz: 0.2, headPitch: -0.25 });
        break;
      }
      case "bench-reach":
        Object.assign(out, { legW: 1, sHip: 0.15, sKnee: 0.2, sAbd: 0.08, oHip: 0.15, oKnee: 0.2, oAbd: 0.08, lean: 0.45, bx: -0.3, by: 0.02, bz: 0.1, gx: -0.2, gy: 0.0, gz: 0.2, stickW: 0, fx: 0.12, fy: 0.15, fz: 0.62 });
        break;
      case "bench-dejected":
        Object.assign(out, { legW: 1, sHip: 1.45, sKnee: 1.5, sAbd: 0.12, oHip: 1.45, oKnee: 1.5, oAbd: 0.12, seat: 1, lean: 0.55, bx: 0.08, bz: 0.55, gx: 0.02, gy: -0.05, gz: 0.38, stickW: 0, fx: 0.1, fy: -0.15, fz: 0.4, headPitch: 0.6 });
        break;
      case "official-drop":
        Object.assign(out, { crouch: 0.2, lean: 0.5, tx: -0.05, ty: 0.12, tz: 0.6, fx: 0.25, fy: -0.05, fz: 0.1, headPitch: 0.2 });
        break;
      case "official-point":
        Object.assign(out, { crouch: 0.05, lean: 0.05, tx: -0.12, ty: 0.42, tz: 0.62, fx: 0.24, fy: -0.06, fz: 0.05 });
        break;
      case "official-arm":
        Object.assign(out, { crouch: 0.05, lean: 0.0, tx: -0.2, ty: 0.92, tz: 0.12, fx: 0.24, fy: -0.06, fz: 0.05 });
        break;
      case "coach-idle": {
        // Arms crossed or hands on hips, shifting weight now and then.
        const shift = Math.sin(c * 0.4 + v * 7) * 0.04;
        if (v < 0.5) Object.assign(out, { legW: 1, sHip: 0.02, oHip: 0.02, sKnee: 0.05, oKnee: 0.05, sAbd: 0.06, oAbd: 0.06, lean: 0.04, roll: shift, tx: 0.13, ty: 0.27, tz: 0.2, fx: -0.13, fy: 0.25, fz: 0.17 });
        else Object.assign(out, { legW: 1, sHip: 0.02, oHip: 0.02, sKnee: 0.05, oKnee: 0.05, sAbd: 0.08, oAbd: 0.08, lean: 0.02, roll: shift, tx: -0.27, ty: -0.04, tz: 0.02, fx: 0.27, fy: -0.04, fz: 0.02 });
        break;
      }
      case "coach-clap": {
        const clap = Math.sin(c * 14) * 0.07;
        Object.assign(out, { legW: 1, sHip: 0.02, oHip: 0.02, sKnee: 0.05, oKnee: 0.05, sAbd: 0.06, oAbd: 0.06, lean: 0.0, tx: -0.03 - clap, ty: 0.3, tz: 0.34, fx: 0.03 + clap, fy: 0.3, fz: 0.34, headPitch: -0.1 });
        break;
      }
      case "coach-point":
        Object.assign(out, { legW: 1, sHip: 0.02, oHip: 0.02, sKnee: 0.05, oKnee: 0.05, sAbd: 0.06, oAbd: 0.06, lean: 0.12, tx: -0.22, ty: 0.42, tz: 0.58, fx: 0.27, fy: -0.04, fz: 0.02 });
        break;
      case "coach-despair":
        Object.assign(out, { legW: 1, sHip: 0.02, oHip: 0.02, sKnee: 0.05, oKnee: 0.05, sAbd: 0.06, oAbd: 0.06, lean: -0.05, tx: -0.1, ty: 0.63, tz: 0.06, fx: 0.1, fy: 0.63, fz: 0.06, headPitch: -0.15 });
        break;
    }
    if (this.role === "coach" || this.role === "referee" || this.role === "linesman") out.stickW = 0;
    return out;
  }
  /* ---------------------------------------------------------------- update */
  update(dt: number, animDt: number, inp: RigInput) {
    this.clock += animDt;
    this.stateT += animDt;
    if (this.timedState && this.stateT >= this.timedState.until) {
      const then = this.timedState.then;
      this.timedState = undefined;
      this.enter(then, this.stateVariant, this.stateSide);
    }
    // --- smoothed placement and velocity (real time)
    if (!this.placed || Math.hypot(inp.x - this.px, inp.z - this.pz) > 7) {
      this.px = inp.x;
      this.pz = inp.z;
      this.svx = inp.vx;
      this.svz = inp.vz;
      if (!this.placed) this.yaw = inp.face ?? Math.atan2(inp.puckX - inp.x, inp.puckZ - inp.z);
      this.placed = true;
    } else {
      const k = 1 - Math.exp(-dt * 10);
      this.px += (inp.x - this.px) * k;
      this.pz += (inp.z - this.pz) * k;
      const kv = 1 - Math.exp(-dt * 6);
      this.svx += (inp.vx - this.svx) * kv;
      this.svz += (inp.vz - this.svz) * kv;
    }
    const sp = Math.hypot(this.svx, this.svz);
    // --- facing
    const lookX = inp.lookX ?? inp.puckX,
      lookZ = inp.lookZ ?? inp.puckZ;
    const toLook = Math.atan2(lookX - this.px, lookZ - this.pz);
    const lookDist = Math.hypot(lookX - this.px, lookZ - this.pz);
    const heading = sp > 0.4 ? Math.atan2(this.svx, this.svz) : this.yaw;
    let want: number;
    if (inp.face !== undefined) want = inp.face;
    else if (this.goalie) {
      const outward = this.px > 0 ? -Math.PI / 2 : Math.PI / 2;
      want = outward + clamp(wrap(toLook - outward), -1.15, 1.15);
    } else if (inp.hasPuck) want = sp > 1 ? heading : this.yaw;
    else if (sp < 1.2) want = toLook;
    else if (lookDist < 15 && Math.abs(wrap(heading - toLook)) > 1.75) want = toLook;
    else want = heading;
    if (this.stopT > 0) want = this.yaw;
    const before = this.yaw;
    const diff = wrap(want - this.yaw);
    this.yaw = wrap(this.yaw + clamp(diff, -7 * dt, 7 * dt) * (this.goalie ? 0.8 : 1));
    const yawRate = dt > 0 ? wrap(this.yaw - before) / dt : 0;
    const fx = Math.sin(this.yaw),
      fz = Math.cos(this.yaw);
    const vf = this.svx * fx + this.svz * fz;
    const vl = this.svx * fz - this.svz * fx;
    // --- hockey stop: sharp deceleration from speed
    const decel = dt > 0 ? (this.spPrev - sp) / dt : 0;
    const skating = this.role !== "coach";
    if (skating && !this.goalie && this.stopT <= 0 && this.spPrev > 3.5 && decel > 5.5) {
      this.stopT = 0.55;
      this.stopDir = yawRate > 0 ? 1 : -1;
    }
    this.spPrev = sp;
    if (this.stopT > 0) this.stopT = Math.max(0, this.stopT - animDt);
    const stop = this.stopT > 0 ? Math.sin((this.stopT / 0.55) * Math.PI) : 0;
    // --- skating cycle
    const wantAmp = skating ? smooth(clamp((sp - 0.35) / 6, 0, 1)) : 0;
    // Input velocity is authoritative for the stride: a parked player never
    // keeps striding while the smoothed velocity decays.
    if (Math.hypot(inp.vx, inp.vz) < 0.08) this.amp = 0;
    else this.amp += (wantAmp - this.amp) * (1 - Math.exp(-dt * 7));
    const cadence = 0.28 + Math.min(sp, 12) * 0.12;
    const dir = this.goalie ? Math.sign(vl || vf || 1) : vf >= -0.4 ? 1 : -1;
    this.phase = (this.phase + animDt * cadence * dir + 8) % 1;
    this.bank += (clamp(-yawRate * sp * 0.028, -0.42, 0.42) - this.bank) * (1 - Math.exp(-dt * 6));
    // --- pose: state (cross-faded) + one-shot action
    const P = this.current;
    this.statePose(this.state, this.stateT, this.target);
    this.fade = Math.min(1, this.fade + animDt / 0.32);
    mix(this.prevPose, this.target, smooth(this.fade), P);
    if (this.action) {
      const a = this.action;
      a.t += animDt;
      if (a.t >= a.spec.dur) this.action = null;
      else {
        sampleAction(a.spec, a.t, P, this.actionPose);
        Object.assign(P, this.actionPose);
      }
    }
    // Puck handling: gentle side-to-side sweep while carrying.
    if (inp.hasPuck && !this.action && this.state === "play" && this.role === "skater") {
      P.bx += Math.sin(this.clock * 5.2) * 0.1;
      P.bz += 0.06 * Math.sin(this.clock * 10.4);
    }
    const posed = P.legW > 0.5 || P.seat > 0.5;
    const amp = (this.goalie ? this.amp * 0.55 : this.amp) * (1 - P.legW) * (1 - P.seat);
    const idleSway = Math.sin(this.clock * 1.7 + this.phase * 6) * 0.025 * (1 - this.amp);
    const gk = this.goalie;
    const crouch = (gk ? 0 : 0.12 + (1 - this.amp) * 0.06) * (1 - P.legW) + P.crouch + stop * 0.3;
    // --- legs: skating legs blended with posed legs
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1; // physical side: -1 right, +1 left
      sampleStride((this.phase + (i ? 0.5 : 0)) % 1, strideOut);
      let h = lerp(0.25, strideOut[0], amp),
        k = lerp(0.6, strideOut[1], amp),
        a = lerp(0.12, strideOut[2], amp);
      if (!skating) {
        h = 0.02;
        k = 0.05;
        a = 0.06;
      }
      h += crouch * 0.55;
      k += crouch * 1.05;
      a += clamp(s * vl * 0.04, -0.25, 0.25) + (gk ? 0.1 : 0) + P.stance;
      h = lerp(h, 0.45, stop);
      k = lerp(k, 1.1, stop);
      a = lerp(a, 0.32, stop);
      h = lerp(h, 0.5, P.bf);
      k = lerp(k, 0.9, P.bf);
      a = lerp(a, 1.28, P.bf);
      if (P.legW > 0) {
        // Posed legs are named by the mirrored side (s = stick/glove side).
        const stickSide = s === this.hs;
        h = lerp(h, stickSide ? P.sHip : P.oHip, P.legW);
        k = lerp(k, stickSide ? P.sKnee : P.oKnee, P.legW);
        a = lerp(a, stickSide ? P.sAbd : P.oAbd, P.legW);
      }
      this.hips[i].rotation.set(-h, s * a * 0.7, s * a);
      this.knees[i].rotation.set(k, 0, 0);
      this.ankles[i].rotation.set(posed ? h - k : h - k, -s * a * 0.2, -s * a * 0.85 * (1 - P.seat));
    }
    // --- torso and head
    const lean = (gk ? 0.22 : 0) + this.amp * 0.3 * (1 - P.legW) + crouch * 0.45 + P.lean - stop * 0.15 - P.bf * 0.1;
    const twist = P.twist * this.hs + Math.sin(this.phase * TAU) * 0.14 * amp * (dir || 1);
    this.spine.rotation.set(lean, twist, this.bank * (1 - P.seat) + idleSway + P.roll * this.hs);
    this.pelvis.rotation.y = -twist * 0.25;
    const look = clamp(wrap(toLook - this.yaw - P.yawOff), -1.1, 1.1) * 0.55;
    this.head.rotation.set(-lean * 0.7 + P.headPitch, look - twist * 0.6 + P.headYaw * this.hs, -this.bank * 0.4);
    // --- root placement
    const stopYaw = stop * this.stopDir * 1.2;
    this.root.rotation.y = this.yaw + stopYaw + P.yawOff;
    this.root.position.set(this.px + fx * P.offF, this.root.position.y, this.pz + fz * P.offF);
    // --- ground contact (or the bench seat)
    this.pelvis.position.y = 0;
    this.root.updateMatrixWorld(true);
    let low = Infinity;
    const rootY = this.root.position.y;
    for (const ankle of this.ankles)
      for (const bz of [-0.1, 0.19]) {
        ankle.localToWorld(_a.set(0, -this.contactDrop, bz));
        low = Math.min(low, _a.y - rootY);
      }
    if (P.kneel > 0.5)
      for (const knee of this.knees) {
        knee.localToWorld(_a.set(0, -0.02, 0.07));
        low = Math.min(low, _a.y - rootY + 0.02);
      }
    if (gk)
      for (const knee of this.knees)
        for (const px of [-0.115, 0.115])
          for (const pz of [-0.075, 0.115]) {
            knee.localToWorld(_a.set(px, PAD_Y - PAD_H / 2, pz));
            low = Math.min(low, _a.y - rootY);
          }
    const sy = this.build.scale.y || 1;
    const grounded = -low / sy + P.lift / sy;
    const seated = (P.seatY + 0.13) / sy + 0.05;
    this.pelvis.position.y = lerp(grounded, seated, clamp(P.seat, 0, 1));
    // --- arms (IK) and the stick
    const hs = this.hs;
    this.build.updateMatrix();
    this.pelvis.updateMatrix();
    this.spine.updateMatrix();
    _m.multiplyMatrices(this.build.matrix, this.pelvis.matrix).multiply(this.spine.matrix);
    _mi.copy(_m).invert();
    // Top hand on the opposite side to the blade (right hand on top for a left shot).
    const shoulderTop = new THREE.Vector3(-hs * SHOULDER_X, SHOULDER_Y, 0);
    const shoulderLow = new THREE.Vector3(hs * SHOULDER_X, SHOULDER_Y, 0);
    const reachMax = (UPPER + FORE) * 0.97;
    const clampReach = (target: THREE.Vector3, shoulder: THREE.Vector3) => {
      _c.subVectors(target, shoulder);
      if (_c.length() > reachMax) target.copy(shoulder).addScaledVector(_c.normalize(), reachMax);
      return target;
    };
    let topTarget: THREE.Vector3;
    let lowTarget: THREE.Vector3;
    const free = new THREE.Vector3(P.fx * hs, P.fy, P.fz);
    if (this.hasStick && this.shaft) {
      const grip = clampReach(new THREE.Vector3(P.gx * hs, P.gy, P.gz), shoulderTop);
      const gripRoot = grip.clone().applyMatrix4(_m);
      const bladeRoot = new THREE.Vector3(P.bx * hs, P.by, P.bz);
      const stick = bladeRoot.clone().sub(gripRoot);
      stick.setLength(clamp(stick.length(), gk ? 0.95 : 1.05, gk ? 1.35 : 1.5));
      bladeRoot.copy(gripRoot).add(stick);
      if (bladeRoot.y < 0.01) bladeRoot.y = 0.01;
      const stickDir = bladeRoot.clone().sub(gripRoot).normalize();
      orient(this.shaft, gripRoot.clone().addScaledVector(stickDir, -0.12), bladeRoot, 1);
      this.blade.position.copy(bladeRoot);
      this.blade.rotation.set(0, hs * 0.12, 0);
      topTarget = grip;
      // Lower hand slides down the shaft only as far as the arm reaches.
      const onStick = new THREE.Vector3();
      for (let u = 0.5; u >= 0.2; u -= 0.05) {
        onStick.copy(gripRoot).addScaledVector(stickDir, u).applyMatrix4(_mi);
        if (onStick.distanceTo(shoulderLow) <= reachMax) break;
      }
      lowTarget = gk ? free : onStick.lerp(free, 1 - clamp(P.stickW, 0, 1));
    } else {
      // No stick: top hand = right hand, low hand = left hand, both free.
      const swing = Math.sin(this.phase * TAU) * 0.22 * this.amp;
      topTarget = new THREE.Vector3(P.tx * hs, P.ty, P.tz + swing * (this.state === "play" ? 1 : 0));
      lowTarget = new THREE.Vector3(free.x, free.y, free.z - swing * (this.state === "play" ? 1 : 0));
    }
    const elbow = new THREE.Vector3(),
      hand = new THREE.Vector3(),
      pole = new THREE.Vector3();
    const arm = (idx: number, shoulder: THREE.Vector3, target: THREE.Vector3, side: number) => {
      solveArm(shoulder, clampReach(target, shoulder), pole.set(side * 0.7, -0.6, -0.5), UPPER, FORE, elbow, hand);
      const m = this.armMeshes[idx];
      orient(m.upper, shoulder, elbow);
      orient(m.fore, elbow, hand);
      m.hand.position.copy(hand);
    };
    arm(0, shoulderTop, topTarget, -hs);
    arm(1, shoulderLow, lowTarget, hs);
    if (this.catcher) {
      this.catcher.position.copy(this.armMeshes[1].hand.position).add(_b.set(0, 0.03, 0.06));
      this.catcher.rotation.set(0.2 - Math.max(0, P.fy) * 0.8, 0, -hs * 0.15);
    }
  }
  dispose() {
    this.numberTex?.dispose();
    this.numberMat?.dispose();
  }
}
