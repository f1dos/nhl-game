import * as THREE from "three";

/**
 * Procedural, jointed hockey player figures for the 3D match view.
 *
 * Style goal: the stylised, slightly chunky "broadcast mannequin" look used by
 * football-manager style match engines — readable silhouettes, big helmets and
 * shoulders, solid team colours, numbers on the back — rather than photo-real
 * characters. Everything is built from primitives in code (no external art).
 *
 * Motion is generated from the skater's velocity and from short action cues:
 *  - skating stride with hip abduction, knee drive and counter-rotating torso,
 *  - forward/back/crossover skating relative to where the player is facing,
 *  - forward lean with speed, banking into turns, hockey stops,
 *  - stick handling, passes and wrist/slap shots with a real wind-up,
 *  - body checks (and the stagger of the checked player), celebrations,
 *  - goalie stance, lateral tracking and butterfly saves.
 * Hands are placed on the stick with two-bone IK and the lowest skate is always
 * kept on the ice, so players never float or sink while crouching or striding.
 */

export interface TeamKit {
  jersey: string;
  trim: string;
  pants: string;
  helmet: string;
  socks: string;
}
export type RigActionKind =
  | "shot"
  | "pass"
  | "check"
  | "checked"
  | "celebrate"
  | "save"
  | "conceded"
  | "faceoff"
  | "protest";
export interface RigInput {
  x: number;
  z: number;
  vx: number;
  vz: number;
  puckX: number;
  puckZ: number;
  hasPuck: boolean;
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
function hash01(id: string, salt = 0) {
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

/** Piece-wise cosine-eased keyframe sampling for arrays of numbers. */
function sampleKeys(keys: number[][], t: number, out: number[]) {
  const n = keys.length;
  if (t <= keys[0][0]) {
    for (let i = 1; i < keys[0].length; i++) out[i - 1] = keys[0][i];
    return;
  }
  if (t >= keys[n - 1][0]) {
    for (let i = 1; i < keys[n - 1].length; i++) out[i - 1] = keys[n - 1][i];
    return;
  }
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const a = keys[i],
    b = keys[i + 1];
  const u = smooth((t - a[0]) / (b[0] - a[0]));
  for (let k = 1; k < a.length; k++) out[k - 1] = lerp(a[k], b[k], u);
}

/**
 * One pose sample. bx/by/bz: stick heel in the skater's ground frame.
 * gx/gy/gz: top-hand grip in chest space. Lateral values are written for a
 * left-handed shot and mirrored for right-handed players.
 */
const K = (
  t: number,
  bx: number,
  by: number,
  bz: number,
  gx: number,
  gy: number,
  gz: number,
  twist: number,
  lean: number,
  crouch: number,
  armsUp: number,
  lift: number,
  offF: number,
  headPitch: number,
) => [t, bx, by, bz, gx, gy, gz, twist, lean, crouch, armsUp, lift, offF, headPitch];
const N = (t: number) => K(t, 0.3, 0.02, 1.0, 0.14, 0.14, 0.36, 0, 0, 0, 0, 0, 0, 0);
const NEUTRAL = N(0).slice(1);

const ACTIONS: Record<Exclude<RigActionKind, "save">, { dur: number; keys: number[][] }> = {
  // Wind-up, fast strike through the puck, high follow-through.
  shot: {
    dur: 0.85,
    keys: [
      N(0),
      K(0.26, 0.55, 0.85, -0.25, 0.3, 0.5, 0.0, 0.75, 0.05, 0.05, 0, 0, 0, 0.05),
      K(0.38, 0.22, 0.02, 1.12, 0.12, 0.06, 0.42, -0.35, 0.3, 0.14, 0, 0, 0.12, 0.12),
      K(0.6, -0.05, 0.72, 1.05, -0.04, 0.5, 0.42, -0.65, 0.12, 0, 0, 0, 0.12, 0),
      N(0.85),
    ],
  },
  pass: {
    dur: 0.7,
    keys: [
      N(0),
      K(0.2, 0.5, 0.02, 0.2, 0.25, 0.12, 0.2, 0.35, 0.1, 0.06, 0, 0, 0, 0.05),
      K(0.34, 0.06, 0.02, 1.2, 0.14, 0.1, 0.46, -0.3, 0.14, 0.08, 0, 0, 0.04, 0.05),
      K(0.52, 0.14, 0.12, 1.28, 0.14, 0.14, 0.44, -0.12, 0.06, 0, 0, 0, 0.04, 0),
      N(0.7),
    ],
  },
  // Shoulder-first body check by the defender.
  check: {
    dur: 0.65,
    keys: [
      N(0),
      K(0.18, 0.2, 0.02, 0.6, 0.1, 0.1, 0.3, 0.3, 0.25, 0.3, 0.2, 0, 0, 0.1),
      K(0.34, 0.1, 0.02, 0.7, 0.05, 0.02, 0.28, -0.5, 0.46, 0.34, 0.3, 0, 0.45, 0.2),
      K(0.5, 0.1, 0.02, 0.8, 0.06, 0.04, 0.3, -0.3, 0.3, 0.2, 0.1, 0, 0.3, 0.1),
      N(0.65),
    ],
  },
  // The player who gets hit: head snaps, upper body stagger, stick flails.
  checked: {
    dur: 0.85,
    keys: [
      N(0),
      K(0.14, 0.6, 0.45, 0.45, 0.3, 0.3, 0.2, 0.55, -0.42, 0.12, 0.5, 0, -0.34, -0.15),
      K(0.45, 0.45, 0.2, 0.7, 0.2, 0.2, 0.3, 0.3, -0.22, 0.14, 0.3, 0, -0.16, 0),
      N(0.85),
    ],
  },
  celebrate: {
    dur: 2.6,
    keys: [
      N(0),
      K(0.25, 0.1, 1.7, 0.7, 0.0, 0.9, 0.2, 0, -0.12, 0, 1, 1, 0, -0.25),
      K(2.2, 0.1, 1.7, 0.7, 0.0, 0.9, 0.2, 0, -0.12, 0, 1, 1, 0, -0.25),
      N(2.6),
    ],
  },
  conceded: {
    dur: 1.8,
    keys: [
      N(0),
      K(0.3, 0.3, 0.02, 1.0, 0.16, 0.1, 0.4, 0, 0.35, 0.2, 0, 0, 0, 0.6),
      K(1.5, 0.3, 0.02, 1.0, 0.16, 0.1, 0.4, 0, 0.35, 0.2, 0, 0, 0, 0.6),
      N(1.8),
    ],
  },
  faceoff: {
    dur: 1.8,
    keys: [
      N(0),
      K(0.3, 0.42, 0.02, 0.8, 0.2, 0.0, 0.34, 0.15, 0.62, 0.55, 0, 0, 0, 0.3),
      K(1.5, 0.42, 0.02, 0.8, 0.2, 0.0, 0.34, 0.15, 0.62, 0.55, 0, 0, 0, 0.3),
      N(1.8),
    ],
  },
  protest: {
    dur: 1.5,
    keys: [
      N(0),
      K(0.2, 0.3, 0.02, 0.9, 0.16, 0.5, 0.34, 0, 0.0, 0, 0.7, 0, 0, 0),
      K(1.2, 0.3, 0.02, 0.9, 0.16, 0.5, 0.34, 0, 0.0, 0, 0.7, 0, 0, 0),
      N(1.5),
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
const strideOut = [0, 0, 0];

// Reusable scratch objects: avoids per-frame allocations in the animation loop.
const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _d = new THREE.Vector3(),
  _e = new THREE.Vector3(),
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

/** Analytic two-bone IK. Returns elbow; hand is the (possibly clamped) target. */
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
  const max = (l1 + l2) * 0.995,
    min = Math.abs(l1 - l2) + 0.02;
  dist = clamp(dist, min, max);
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

type Mats = {
  jersey: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  helmet: THREE.MeshStandardMaterial;
  socks: THREE.MeshStandardMaterial;
  pad: THREE.MeshStandardMaterial;
  mask: THREE.MeshStandardMaterial;
  numberInk: string;
};

/** Owns the shared geometry/materials; individual rigs only hold poses. */
export class RigFactory {
  private geos = new Map<string, THREE.BufferGeometry>();
  private kits = new Map<string, Mats>();
  private disposables: { dispose(): void }[] = [];
  readonly skin = SKIN.map((c) => this.own(new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 })));
  readonly dark = this.own(new THREE.MeshStandardMaterial({ color: "#14181f", roughness: 0.7 }));
  readonly glove = this.own(new THREE.MeshStandardMaterial({ color: "#1b2029", roughness: 0.8 }));
  readonly steel = this.own(new THREE.MeshStandardMaterial({ color: "#b8c4cc", roughness: 0.25, metalness: 0.7 }));
  readonly wood = this.own(new THREE.MeshStandardMaterial({ color: "#1d1d20", roughness: 0.5 }));
  readonly tape = this.own(new THREE.MeshStandardMaterial({ color: "#f0f0f0", roughness: 0.9 }));
  readonly visor = this.own(
    new THREE.MeshStandardMaterial({ color: "#a9d7ee", roughness: 0.1, transparent: true, opacity: 0.35 }),
  );
  readonly shadow: THREE.MeshBasicMaterial;
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
  kit(kit: TeamKit): Mats {
    const key = Object.values(kit).join("|");
    let m = this.kits.get(key);
    if (!m) {
      const std = (color: string, roughness = 0.7) =>
        this.own(new THREE.MeshStandardMaterial({ color, roughness }));
      m = {
        jersey: std(kit.jersey, 0.8),
        trim: std(kit.trim, 0.8),
        pants: std(kit.pants, 0.85),
        helmet: std(kit.helmet, 0.35),
        socks: std(kit.socks, 0.9),
        pad: std("#e9edf0", 0.6),
        mask: std(kit.helmet, 0.4),
        numberInk: luminance(kit.jersey) > 0.55 ? "#101820" : "#ffffff",
      };
      this.kits.set(key, m);
    }
    return m;
  }
  skater(kit: TeamKit) {
    return new HockeyRig(this, this.kit(kit), false);
  }
  goalie(kit: TeamKit) {
    return new HockeyRig(this, this.kit(kit), true);
  }
  /** Cheap seated figure for the bench: no skeleton, a handful of meshes. */
  bench(kit: TeamKit) {
    const mats = this.kit(kit);
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    add(this.box(0.4, 0.5, 0.26), mats.jersey, 0, 0.55, 0);
    add(this.box(0.46, 0.14, 0.3), mats.pants, 0, 0.26, 0.04);
    for (const s of [-1, 1]) {
      const thigh = add(this.box(0.15, 0.14, 0.42), mats.pants, s * 0.11, 0.3, 0.2);
      thigh.rotation.x = -0.1;
      add(this.box(0.12, 0.42, 0.13), mats.socks, s * 0.11, 0.1, 0.4);
    }
    add(this.sphere(0.1), this.skin[2], 0, 0.93, 0.02);
    const cap = add(this.sphere(0.125), mats.helmet, 0, 0.96, 0.0);
    cap.scale.set(1, 0.85, 1.05);
    return g;
  }
  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.geos.clear();
    this.kits.clear();
  }
}

const BLADE_DROP = 0.115;
// Goalie leg pad shell (knee space): reaches the boot but never below the blade.
const PAD_H = 0.68,
  PAD_Y = -0.2;
const THIGH = 0.46,
  SHIN = 0.46,
  FOOT = 0.11,
  HIP_X = 0.11,
  SHOULDER_X = 0.235,
  SHOULDER_Y = 0.47,
  UPPER = 0.31,
  FORE = 0.3;

export class HockeyRig {
  readonly root = new THREE.Group();
  private pelvis = new THREE.Group();
  private spine = new THREE.Group();
  private head = new THREE.Group();
  private hips: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private ankles: THREE.Group[] = [];
  private armMeshes: { upper: THREE.Mesh; fore: THREE.Mesh; hand: THREE.Object3D }[] = [];
  private shaft: THREE.Mesh;
  private blade = new THREE.Group();
  private catcher?: THREE.Object3D;
  private numberMat: THREE.MeshStandardMaterial;
  private numberTex: THREE.CanvasTexture;
  private numberCanvas = document.createElement("canvas");
  private skinMesh: THREE.Mesh[] = [];
  private build = new THREE.Group();
  private identity = "";
  hs = 1; // +1: shoots left (blade on the player's left side), -1: right
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
  private action: { kind: RigActionKind; t: number; dur: number; sx: number; sz: number } | null = null;
  private bf = 0;
  private reach = 0;
  private reachUp = 0;
  private v = new Array<number>(13).fill(0);
  private readonly ground: number;
  constructor(
    private factory: RigFactory,
    private mats: Mats,
    readonly goalie: boolean,
  ) {
    const f = factory;
    this.ground = THIGH + SHIN + FOOT;
    this.root.add(this.build);
    // Blob shadow
    const shadow = new THREE.Mesh(f.geo("shadowPlane", () => new THREE.PlaneGeometry(1.2, 1.2)), f.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.014;
    shadow.renderOrder = 1;
    this.root.add(shadow);
    this.build.add(this.pelvis);
    const add = (
      parent: THREE.Object3D,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const g = goalie;
    // Hips / shorts
    const hipMesh = add(this.pelvis, f.geo("hips", () => new THREE.CylinderGeometry(0.17, 0.18, 0.24, 14)), mats.pants, 0, -0.02, 0);
    hipMesh.scale.set(g ? 1.25 : 1, 1, g ? 1.0 : 0.78);
    // Legs
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * (g ? HIP_X + 0.02 : HIP_X), -0.05, 0);
      this.pelvis.add(hip);
      this.hips.push(hip);
      const thigh = add(hip, f.capsule(g ? 0.105 : 0.088), mats.pants);
      thigh.scale.y = THIGH - 0.02;
      thigh.position.y = -THIGH / 2;
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      hip.add(knee);
      this.knees.push(knee);
      const shin = add(knee, f.capsule(g ? 0.085 : 0.062), g ? mats.pad : mats.socks);
      shin.scale.y = SHIN - 0.04;
      shin.position.y = -SHIN / 2;
      if (!g) {
        const guard = add(knee, f.box(0.13, 0.14, 0.12), mats.pants, 0, -0.02, 0.035);
        guard.rotation.x = -0.1;
      } else {
        // Leg pad: broad rectangular shell with knee roll.
        add(knee, f.box(0.23, PAD_H, 0.19), mats.pad, 0, PAD_Y, 0.02);
        add(knee, f.box(0.25, 0.06, 0.21), mats.trim, 0, PAD_Y + PAD_H / 2 - 0.09, 0.02);
        add(knee, f.box(0.25, 0.06, 0.21), mats.trim, 0, PAD_Y - PAD_H / 2 + 0.07, 0.02);
        add(hip, f.box(0.2, 0.36, 0.16), mats.pad, 0, -0.2, 0.04);
      }
      const ankle = new THREE.Group();
      ankle.position.y = -SHIN;
      knee.add(ankle);
      this.ankles.push(ankle);
      add(ankle, f.box(0.1, 0.09, 0.27), f.dark, 0, -0.045, 0.045);
      add(ankle, f.box(0.012, 0.025, 0.26), f.dark, 0, -0.098, 0.04);
      add(ankle, f.box(0.008, 0.014, 0.3), f.steel, 0, -0.108, 0.04);
    }
    // Upper body
    this.pelvis.add(this.spine);
    this.spine.position.y = 0.04;
    const torso = add(
      this.spine,
      f.geo(g ? "torsoG" : "torso", () => new THREE.CylinderGeometry(g ? 0.27 : 0.215, g ? 0.24 : 0.17, 0.5, 16)),
      mats.jersey,
      0,
      0.25,
      0,
    );
    torso.scale.z = g ? 0.78 : 0.64;
    const hem = add(this.spine, f.geo(g ? "hemG" : "hem", () => new THREE.CylinderGeometry(g ? 0.243 : 0.174, g ? 0.243 : 0.174, 0.07, 16)), mats.trim, 0, 0.05, 0);
    hem.scale.z = g ? 0.78 : 0.64;
    const stripe = add(this.spine, f.geo(g ? "stripeG" : "stripe", () => new THREE.CylinderGeometry(g ? 0.262 : 0.206, g ? 0.262 : 0.206, 0.05, 16)), mats.trim, 0, 0.31, 0);
    stripe.scale.z = g ? 0.78 : 0.64;
    const shoulders = add(this.spine, f.capsule(g ? 0.12 : 0.092), mats.jersey, 0, SHOULDER_Y - 0.02, 0);
    shoulders.rotation.z = Math.PI / 2;
    shoulders.scale.y = g ? 0.5 : 0.46;
    const neck = add(this.spine, f.geo("neck", () => new THREE.CylinderGeometry(0.05, 0.058, 0.1, 10)), f.skin[2], 0, SHOULDER_Y + 0.08, 0);
    this.skinMesh.push(neck);
    // Back number + name plate
    this.numberCanvas.width = this.numberCanvas.height = 256;
    this.numberTex = new THREE.CanvasTexture(this.numberCanvas);
    this.numberTex.colorSpace = THREE.SRGBColorSpace;
    this.numberTex.anisotropy = 4;
    this.numberMat = new THREE.MeshStandardMaterial({ map: this.numberTex, transparent: true, roughness: 1 });
    const plate = add(this.spine, f.geo("numberPlane", () => new THREE.PlaneGeometry(0.34, 0.34)), this.numberMat, 0, 0.3, g ? -0.212 : -0.142);
    plate.rotation.y = Math.PI;
    // Head
    this.spine.add(this.head);
    this.head.position.y = SHOULDER_Y + 0.17;
    const face = add(this.head, f.sphere(0.1), f.skin[2], 0, 0, 0.01);
    face.scale.set(0.95, 1.12, 1);
    this.skinMesh.push(face);
    for (const s of [-1, 1]) add(this.head, f.sphere(0.014, 6, 5), f.dark, s * 0.04, 0.025, 0.093);
    const helmet = add(
      this.head,
      f.geo("helmetCap", () => new THREE.SphereGeometry(0.128, 18, 12, 0, TAU, 0, Math.PI * 0.62)),
      g ? mats.mask : mats.helmet,
      0,
      0.012,
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
    } else {
      add(this.head, f.box(0.17, 0.07, 0.025), f.visor, 0, -0.005, 0.112).rotation.x = 0.15;
    }
    // Arms (positioned in spine space every frame by IK)
    for (const _ of [0, 1]) {
      const upper = add(this.spine, f.capsule(g ? 0.07 : 0.058), mats.jersey);
      const fore = add(this.spine, f.capsule(g ? 0.064 : 0.052), mats.jersey);
      const hand = new THREE.Mesh(f.sphere(0.058, 10, 8), f.glove);
      this.spine.add(hand);
      this.armMeshes.push({ upper, fore, hand });
    }
    if (g) {
      // Catching glove (non-stick hand) and blocker replace plain gloves.
      const catcher = new THREE.Mesh(f.box(0.21, 0.27, 0.07), mats.trim);
      this.spine.add(catcher);
      this.catcher = catcher;
      this.armMeshes[1].hand.visible = false;
      const blocker = new THREE.Mesh(f.box(0.17, 0.24, 0.06), mats.pad);
      this.armMeshes[0].hand.add(blocker);
      blocker.position.set(0, 0, 0.0);
    }
    // Stick
    const shaftGeo = f.geo(g ? "shaftG" : "shaft", () => new THREE.BoxGeometry(g ? 0.045 : 0.028, 1, 0.02));
    this.shaft = new THREE.Mesh(shaftGeo, f.wood);
    this.root.add(this.shaft);
    this.root.add(this.blade);
    const bl = new THREE.Mesh(f.box(0.02, g ? 0.22 : 0.085, g ? 0.3 : 0.3), f.wood);
    bl.position.set(0, g ? 0.11 : 0.042, 0.14);
    this.blade.add(bl);
    const tape = new THREE.Mesh(f.box(0.024, g ? 0.1 : 0.05, 0.2), f.tape);
    tape.position.set(0, g ? 0.06 : 0.03, 0.18);
    this.blade.add(tape);
    this.root.scale.setScalar(1);
  }
  /** Assign who this actor represents: number, name, height, handedness, skin. */
  setIdentity(id: RigIdentity, pos: string) {
    if (this.identity === id.id) return;
    this.identity = id.id;
    this.hs = hash01(id.id, 3) < 0.62 ? 1 : -1;
    const tall = pos === "D" ? 1.03 : pos === "G" ? 1.02 : pos === "C" ? 1.0 : 0.99;
    const h = tall * (0.955 + hash01(id.id, 5) * 0.09);
    const w = 0.95 + hash01(id.id, 7) * 0.12 + (pos === "D" ? 0.05 : 0);
    // Slightly exaggerated size keeps figures readable at broadcast distance.
    this.build.scale.set(w * 1.1, h * 1.1, w * 1.1);
    const tone = hash01(id.id, 11);
    const skin = this.factory.skin[tone < 0.5 ? 0 : tone < 0.75 ? 1 : tone < 0.9 ? 2 : tone < 0.97 ? 3 : 4];
    this.skinMesh.forEach((m) => (m.material = skin));
    const ctx = this.numberCanvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = this.mats.numberInk;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "800 46px system-ui, Arial, sans-serif";
      const last = id.name.split(" ").slice(-1)[0].toUpperCase().slice(0, 12);
      ctx.fillText(last, 128, 44);
      ctx.font = "900 170px system-ui, Arial, sans-serif";
      ctx.fillText(String(id.number), 128, 158);
      this.numberTex.needsUpdate = true;
    }
  }
  trigger(kind: RigActionKind, toward?: { x: number; z: number }) {
    const spec = kind === "save" ? { dur: 1.0 } : ACTIONS[kind];
    // Reactions to being hit or scoring take priority over routine motions.
    const urgent = kind === "checked" || kind === "celebrate" || kind === "conceded" || kind === "save";
    if (this.action && !urgent && this.action.t < this.action.dur * 0.8) return;
    this.action = { kind, t: 0, dur: spec.dur, sx: toward?.x ?? 0, sz: toward?.z ?? 0 };
  }
  update(dt: number, animDt: number, inp: RigInput) {
    this.clock += animDt;
    // --- smoothed placement and velocity (real time)
    if (!this.placed || Math.hypot(inp.x - this.px, inp.z - this.pz) > 7) {
      this.px = inp.x;
      this.pz = inp.z;
      this.svx = inp.vx;
      this.svz = inp.vz;
      if (!this.placed) this.yaw = Math.atan2(inp.puckX - inp.x, inp.puckZ - inp.z);
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
    const toPuck = Math.atan2(inp.puckX - this.px, inp.puckZ - this.pz);
    const puckDist = Math.hypot(inp.puckX - this.px, inp.puckZ - this.pz);
    const heading = sp > 0.4 ? Math.atan2(this.svx, this.svz) : this.yaw;
    let want: number;
    if (this.goalie) {
      const outward = this.px > 0 ? -Math.PI / 2 : Math.PI / 2;
      want = outward + clamp(wrap(toPuck - outward), -1.15, 1.15);
    } else if (inp.hasPuck) want = sp > 1 ? heading : this.yaw;
    else if (sp < 1.2) want = toPuck;
    else if (puckDist < 15 && Math.abs(wrap(heading - toPuck)) > 1.75) want = toPuck;
    else want = heading;
    if (this.stopT > 0) want = this.yaw;
    const before = this.yaw;
    const diff = wrap(want - this.yaw);
    this.yaw = wrap(this.yaw + clamp(diff, -7 * dt, 7 * dt) * (this.goalie ? 0.8 : 1));
    const yawRate = dt > 0 ? wrap(this.yaw - before) / dt : 0;
    // --- local velocity
    const fx = Math.sin(this.yaw),
      fz = Math.cos(this.yaw);
    const vf = this.svx * fx + this.svz * fz;
    const vl = this.svx * fz - this.svz * fx;
    // --- hockey stop: sharp deceleration from speed
    const decel = dt > 0 ? (this.spPrev - sp) / dt : 0;
    if (!this.goalie && this.stopT <= 0 && this.spPrev > 3.5 && decel > 5.5) {
      this.stopT = 0.55;
      this.stopDir = yawRate > 0 ? 1 : -1;
    }
    this.spPrev = sp;
    if (this.stopT > 0) this.stopT = Math.max(0, this.stopT - animDt);
    const stop = this.stopT > 0 ? Math.sin((this.stopT / 0.55) * Math.PI) : 0;
    // --- skating cycle
    const wantAmp = smooth(clamp((sp - 0.35) / 6, 0, 1));
    this.amp += (wantAmp - this.amp) * (1 - Math.exp(-dt * 7));
    const cadence = 0.28 + Math.min(sp, 12) * 0.12;
    const dir = this.goalie ? Math.sign(vl || vf || 1) : vf >= -0.4 ? 1 : -1;
    this.phase = (this.phase + animDt * cadence * dir + 8) % 1;
    const amp = this.goalie ? this.amp * 0.55 : this.amp;
    this.bank += (clamp(-yawRate * sp * 0.028, -0.42, 0.42) - this.bank) * (1 - Math.exp(-dt * 6));
    // --- action pose
    const v = this.v;
    for (let i = 0; i < 13; i++) v[i] = NEUTRAL[i];
    let hop = 0;
    let saveBf = 0;
    let free = 0;
    if (this.action) {
      const a = this.action;
      a.t += animDt;
      if (a.t >= a.dur) this.action = null;
      else if (a.kind === "save") {
        const u = a.t / a.dur;
        saveBf = u < 0.12 ? smooth(u / 0.12) : u < 0.6 ? 1 : 1 - smooth((u - 0.6) / 0.4);
        const left = (a.sx * fz - a.sz * fx) / Math.max(0.5, Math.hypot(a.sx, a.sz));
        this.reach += (clamp(left * 1.6, -1, 1) - this.reach) * (1 - Math.exp(-dt * 18));
        this.reachUp = saveBf;
      } else {
        sampleKeys(ACTIONS[a.kind].keys, a.t, v);
        if (a.kind === "celebrate") hop = Math.abs(Math.sin(a.t * 9)) * 0.13 * v[10];
        free = v[9];
      }
    }
    if (!this.action || this.action.kind !== "save") {
      this.reach *= Math.exp(-dt * 6);
      this.reachUp *= Math.exp(-dt * 6);
    }
    this.bf += (saveBf - this.bf) * (1 - Math.exp(-dt * 20));
    // Puck handling: gentle side-to-side sweep while carrying.
    if (inp.hasPuck && !this.action && !this.goalie) {
      v[0] += Math.sin(this.clock * 5.2) * 0.1;
      v[2] += 0.06 * Math.sin(this.clock * 10.4);
    }
    const idleSway = Math.sin(this.clock * 1.7 + this.phase * 6) * 0.025 * (1 - this.amp);
    // --- stance modifiers
    const gk = this.goalie;
    const baseCrouch = gk ? 0.42 : 0.12 + (1 - this.amp) * 0.06;
    const crouch = baseCrouch + v[8] + stop * 0.3;
    // --- legs
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      sampleKeys(STRIDE, (this.phase + (i ? 0.5 : 0)) % 1, strideOut);
      let h = lerp(0.25, strideOut[0], amp),
        k = lerp(0.6, strideOut[1], amp),
        a = lerp(0.12, strideOut[2], amp);
      h += crouch * 0.55;
      k += crouch * 1.05;
      a += clamp(s * vl * 0.04, -0.25, 0.25) + (gk ? 0.1 : 0);
      // Hockey stop: both skates carve outwards, knees deeply bent.
      h = lerp(h, 0.45, stop);
      k = lerp(k, 1.1, stop);
      a = lerp(a, 0.32, stop);
      // Goalie butterfly: pads splay out along the ice.
      h = lerp(h, 0.5, this.bf);
      k = lerp(k, 0.9, this.bf);
      a = lerp(a, 1.28, this.bf);
      this.hips[i].rotation.set(-h, s * a * 0.7, s * a);
      this.knees[i].rotation.set(k, 0, 0);
      this.ankles[i].rotation.set(h - k, -s * a * 0.2, -s * a * 0.85);
    }
    // --- torso
    const lean =
      (gk ? 0.22 : 0.1) + this.amp * 0.3 + crouch * 0.45 + v[7] - stop * 0.15 - this.bf * 0.1;
    const twist = v[6] * this.hs + Math.sin(this.phase * TAU) * 0.14 * amp * (dir || 1);
    this.spine.rotation.set(lean, twist, this.bank + idleSway);
    this.pelvis.rotation.y = -twist * 0.25;
    // Head keeps looking up-ice and tracks the puck.
    const look = clamp(wrap(toPuck - this.yaw), -1.1, 1.1) * 0.55 + (this.action?.kind === "protest" ? Math.sin(this.clock * 12) * 0.35 : 0);
    this.head.rotation.set(-lean * 0.7 + v[12], look - twist * 0.6, -this.bank * 0.4);
    // --- root placement
    const stopYaw = stop * this.stopDir * 1.2;
    this.root.rotation.y = this.yaw + stopYaw;
    const off = v[11];
    this.root.position.set(this.px + fx * off, 0, this.pz + fz * off);
    // --- ground contact: drop the pelvis until the lowest blade corner touches the ice.
    this.pelvis.position.y = 0;
    this.root.updateMatrixWorld(true);
    let low = Infinity;
    for (const ankle of this.ankles)
      for (const bz of [-0.1, 0.19]) {
        ankle.localToWorld(_a.set(0, -BLADE_DROP, bz));
        low = Math.min(low, _a.y);
      }
    // Goalies kneel on their pads in the butterfly: the shell corners count too.
    if (this.goalie)
      for (const knee of this.knees)
        for (const px of [-0.115, 0.115])
          for (const pz of [-0.075, 0.115]) {
            knee.localToWorld(_a.set(px, PAD_Y - PAD_H / 2, pz));
            low = Math.min(low, _a.y);
          }
    this.pelvis.position.y = -low / this.build.scale.y + hop;
    // --- stick and arms (IK)
    const hs = this.hs;
    this.pelvis.updateMatrix();
    this.spine.updateMatrix();
    _m.multiplyMatrices(this.pelvis.matrix, this.spine.matrix);
    _mi.copy(_m).invert();
    const topSign = hs;
    const shoulderTop = _c.set(topSign * SHOULDER_X, SHOULDER_Y, 0).clone();
    const shoulderLow = _d.set(-topSign * SHOULDER_X, SHOULDER_Y, 0).clone();
    const grip = new THREE.Vector3(v[3] * hs, v[4], v[5]);
    if (gk) grip.set(hs * (0.3 + this.reach * 0.1), 0.05 + this.reachUp * 0.15, 0.4);
    // Keep the top hand within reach of its shoulder.
    const reachMax = (UPPER + FORE) * 0.96;
    _e.subVectors(grip, shoulderTop);
    if (_e.length() > reachMax) grip.copy(shoulderTop).addScaledVector(_e.normalize(), reachMax);
    const gripRoot = grip.clone().applyMatrix4(_m);
    const bladeRoot = new THREE.Vector3(v[0] * hs, v[1], v[2]);
    if (gk) bladeRoot.set(hs * 0.3 + this.reach * hs * 0.15, 0.02, 1.15 - this.bf * 0.15);
    const stick = bladeRoot.clone().sub(gripRoot);
    const len = clamp(stick.length(), 1.05, 1.5);
    stick.setLength(len);
    bladeRoot.copy(gripRoot).add(stick);
    if (bladeRoot.y < 0.01) bladeRoot.y = 0.01;
    const stickDir = bladeRoot.clone().sub(gripRoot).normalize();
    const butt = gripRoot.clone().addScaledVector(stickDir, -0.12);
    orient(this.shaft, butt, bladeRoot, 1);
    this.blade.position.copy(bladeRoot);
    this.blade.rotation.set(0, hs * 0.12 * (1 - free), 0);
    // Lower hand: slide down the shaft only as far as the arm can reach.
    const lowTarget = new THREE.Vector3();
    let u = gk ? 0 : 0.5;
    for (; u > 0.2; u -= 0.05) {
      lowTarget.copy(gripRoot).addScaledVector(stickDir, u).applyMatrix4(_mi);
      if (lowTarget.distanceTo(shoulderLow) <= reachMax) break;
    }
    lowTarget.copy(gripRoot).addScaledVector(stickDir, u).applyMatrix4(_mi);
    if (gk) {
      // Catching glove held out to the side/front, reaching on saves.
      lowTarget.set(
        -hs * (0.42 - this.reach * hs * 0.18) + this.reach * 0.2,
        0.02 + this.reachUp * 0.3,
        0.42 + this.reachUp * 0.12,
      );
    } else if (free > 0) {
      // Free arm raised (celebration) or held out (protest).
      const raised = new THREE.Vector3(-hs * 0.3, 0.9, 0.22);
      lowTarget.lerp(raised, clamp(free, 0, 1));
    }
    const elbow = new THREE.Vector3(),
      hand = new THREE.Vector3(),
      pole = new THREE.Vector3();
    const arm = (idx: number, shoulder: THREE.Vector3, target: THREE.Vector3, side: number) => {
      solveArm(shoulder, target, pole.set(side * 0.7, -0.6, -0.5), UPPER, FORE, elbow, hand);
      const m = this.armMeshes[idx];
      orient(m.upper, shoulder, elbow);
      orient(m.fore, elbow, hand);
      m.hand.position.copy(hand);
    };
    arm(0, shoulderTop, grip, topSign);
    arm(1, shoulderLow, lowTarget, -topSign);
    if (this.catcher) {
      this.catcher.position.copy(this.armMeshes[1].hand.position).add(_b.set(0, 0.03, 0.06));
      this.catcher.rotation.set(0.2 - this.reachUp * 0.5, 0, -hs * (0.1 + this.reach * 0.2));
    }
  }
  setVisible(v: boolean) {
    this.root.visible = v;
  }
  dispose() {
    this.numberTex.dispose();
    this.numberMat.dispose();
  }
}
