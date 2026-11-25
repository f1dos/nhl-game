import headMesh from "../assets/hm08-head.json";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { loadHeadgear, type HeadgearPart } from "./headgear";
import {
  BLADE_DROP,
  FORE,
  HIP_X,
  HockeyRig,
  PAD_H,
  PAD_Y,
  RigFactory,
  SHIN,
  SHOULDER_X,
  SHOULDER_Y,
  THIGH,
  UPPER,
  hash01,
  type RigActionKind,
  type RigIdentity,
  type RigInput,
  type RigRole,
  type RigState,
  type TeamKit,
} from "./hockeyRig";

/**
 * Skinned hockey people: every player is ONE SkinnedMesh (three LODs) on a
 * 28-bone skeleton — pelvis, three spine bones, neck, head, clavicles, arms,
 * hands, legs, feet, a stick bone and four jersey helper bones that flutter
 * with speed. Body, kit and equipment are lofted around the bones in a bind
 * pose with blended weights at the joints, so limbs bend without seams.
 *
 * The motion comes from the proven pose solver in hockeyRig.ts (states,
 * one-shot actions, two-bone arm IK, skate/pad ground contact, cross-fades):
 * the solver runs invisibly and its joints are retargeted onto the skeleton
 * every frame. If anything fails, the primitive figure stays visible.
 *
 * Appearance is deterministic from the player id (hash only): 10 face
 * shapes, 6 skin tones, 9 hairstyles, beards, two helmet models, handedness
 * and build. Jerseys are CanvasTextures with the club colours, the surname
 * and number on the back and stripes on hem and sleeves.
 */

export const BONES = [
  "pelvis", "spine1", "spine2", "spine3", "neck", "head",
  "clavL", "clavR", "upperL", "upperR", "foreL", "foreR", "handL", "handR",
  "thighL", "thighR", "shinL", "shinR", "footL", "footR",
  "stick", "blade", "jerseyF", "jerseyB", "jerseyL", "jerseyR", "toeL", "toeR",
] as const;
type BoneName = (typeof BONES)[number];
const B = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;
type W = [BoneName, number][];

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

/* ------------------------------------------------------------- bind pose */

const SPINE_Y = 0.04;
const HEAD_Y = SHOULDER_Y + 0.17;
const NECK_Y = SHOULDER_Y + 0.06;
const CLAV_X = 0.07;
const HEM_OFFSETS: Record<"jerseyF" | "jerseyB" | "jerseyL" | "jerseyR", [number, number, number]> = {
  jerseyF: [0, 0.06, 0.12],
  jerseyB: [0, 0.06, -0.12],
  jerseyL: [0.17, 0.06, 0],
  jerseyR: [-0.17, 0.06, 0],
};
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _basis = new THREE.Matrix4();

/** Orthonormal frame with Y along `dir` and Z as close to `ref` as possible. */
function frameFrom(origin: THREE.Vector3, dir: THREE.Vector3, ref: THREE.Vector3, out: THREE.Matrix4, scale?: THREE.Vector3) {
  const y = _v.copy(dir).normalize();
  const z = _v2.copy(ref).addScaledVector(y, -ref.dot(y));
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z);
  z.normalize();
  const x = _v3.crossVectors(y, z).normalize();
  _basis.makeBasis(x, y, z);
  _q.setFromRotationMatrix(_basis);
  return out.compose(origin, _q, scale ?? _s.set(1, 1, 1));
}

/** Bind (rest) matrices of every bone, in the rig root's space. */
function bindPose(goalie: boolean, hs: number): THREE.Matrix4[] {
  const m = BONES.map(() => new THREE.Matrix4());
  const t = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
  m[B.pelvis] = t(0, 0, 0);
  for (const b of ["spine1", "spine2", "spine3"] as const) m[B[b]] = t(0, SPINE_Y, 0);
  m[B.neck] = t(0, SPINE_Y + NECK_Y, 0);
  m[B.head] = t(0, SPINE_Y + HEAD_Y, 0);
  m[B.clavL] = t(CLAV_X, SPINE_Y + SHOULDER_Y - 0.02, 0);
  m[B.clavR] = t(-CLAV_X, SPINE_Y + SHOULDER_Y - 0.02, 0);
  const hipX = goalie ? HIP_X + 0.02 : HIP_X;
  for (const [side, s] of [["L", 1], ["R", -1]] as const) {
    m[B[`thigh${side}`]] = t(s * hipX, -0.05, 0);
    m[B[`shin${side}`]] = t(s * hipX, -0.05 - THIGH, 0);
    m[B[`foot${side}`]] = t(s * hipX, -0.05 - THIGH - SHIN, 0);
    m[B[`toe${side}`]] = t(s * hipX, -0.05 - THIGH - SHIN - 0.06, 0.13);
    // Arms hang a little out from the body in the bind pose.
    const shoulder = new THREE.Vector3(s * SHOULDER_X, SPINE_Y + SHOULDER_Y, 0);
    const toElbow = new THREE.Vector3(s * 0.3, -1, 0.05).normalize();
    const elbow = shoulder.clone().addScaledVector(toElbow, UPPER);
    const toHand = new THREE.Vector3(s * 0.12, -1, 0.3).normalize();
    const hand = elbow.clone().addScaledVector(toHand, FORE);
    const fwd = new THREE.Vector3(0, 0, 1);
    frameFrom(shoulder, toElbow, fwd, m[B[`upper${side}`]]);
    frameFrom(elbow, toHand, fwd, m[B[`fore${side}`]]);
    frameFrom(hand, toHand, fwd, m[B[`hand${side}`]]);
  }
  // Stick: heel of the blade at the origin, shaft up +Y, blade forward +Z.
  frameFrom(new THREE.Vector3(hs * 0.45, -1.05, 0.9), new THREE.Vector3(0, 1, -0.35), new THREE.Vector3(0, 0, 1), m[B.stick]);
  m[B.blade] = t(hs * .45, -1.05, .9);
  for (const [b, o] of Object.entries(HEM_OFFSETS)) m[B[b as BoneName]] = t(o[0], SPINE_Y + o[1], o[2]);
  return m;
}

/* ------------------------------------------------------- geometry builder */

type MatKey =
  | "jersey" | "pants" | "socks" | "skin" | "helmet" | "glove" | "boot" | "steel" | "stick" | "tape"
  | "visor" | "eyeWhite" | "iris" | "lips" | "hair" | "beard" | "trim" | "pad" | "mask" | "cage" | "shirt" | "shoe";

class Builder {
  pos: number[] = [];
  uv: number[] = [];
  faceTints = new Map<number, [number, number, number]>();
  si: number[] = [];
  sw: number[] = [];
  tris = new Map<MatKey, number[]>();
  vertex(p: THREE.Vector3, u: number, v: number, weights: W) {
    const list = weights.filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = list.reduce((s, [, w]) => s + w, 0) || 1;
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    for (let i = 0; i < 4; i++) {
      this.si.push(list[i] ? B[list[i][0]] : 0);
      this.sw.push(list[i] ? list[i][1] / total : 0);
    }
    return this.pos.length / 3 - 1;
  }
  tri(mat: MatKey, a: number, b: number, c: number) {
    let t = this.tris.get(mat);
    if (!t) this.tris.set(mat, (t = []));
    t.push(a, b, c);
  }
  /** Bakes a ready-made geometry (rigid to one bone or a weight list). */
  geometry(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, mat: MatKey, weights: W | ((p: THREE.Vector3) => W)) {
    const g = geo.index ? geo : geo;
    const pos = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    const base = this.pos.length / 3;
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const local = p.clone();
      p.applyMatrix4(matrix);
      this.vertex(p, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, typeof weights === "function" ? weights(local) : weights);
    }
    if (g.index) for (let i = 0; i < g.index.count; i += 3) this.tri(mat, base + g.index.getX(i), base + g.index.getX(i + 1), base + g.index.getX(i + 2));
    else for (let i = 0; i < pos.count; i += 3) this.tri(mat, base + i, base + i + 1, base + i + 2);
    geo.dispose();
  }
  /**
   * Loft: rings of an elliptical (super-ellipse) cross-section along a path.
   * Each ring has a frame (bind space), radii, a radial modifier, UV v and
   * weights (constant or per angle). Triangle winding is fixed automatically
   * so normals face outward.
   */
  loft(
    rings: { frame: THREE.Matrix4; rx: number; rz: number; v: number; w: W | ((theta: number) => W); r?: (theta: number) => number; lift?: (theta: number) => number }[],
    mat: MatKey,
    seg: number,
    opts: { capStart?: boolean; capEnd?: boolean; u0?: number; u1?: number; exp?: number } = {},
  ) {
    const u0 = opts.u0 ?? 0, u1 = opts.u1 ?? 1, e = opts.exp ?? 2;
    const start = this.pos.length / 3;
    const p = new THREE.Vector3();
    const centers: THREE.Vector3[] = [];
    for (const ring of rings) {
      centers.push(new THREE.Vector3().setFromMatrixPosition(ring.frame));
      for (let s = 0; s <= seg; s++) {
        const th = (s / seg) * TAU;
        const c = Math.cos(th), sn = Math.sin(th);
        // Super-ellipse: e > 2 gives squarer, broader sections (shoulders, pads).
        const k = Math.pow(Math.pow(Math.abs(c), e) + Math.pow(Math.abs(sn), e), -1 / e);
        const r = ring.r ? ring.r(th) : 1;
        p.set(c * k * ring.rx * r, ring.lift?.(th) ?? 0, sn * k * ring.rz * r).applyMatrix4(ring.frame);
        this.vertex(p, lerp(u0, u1, s / seg), ring.v, typeof ring.w === "function" ? ring.w(th) : ring.w);
      }
    }
    const row = seg + 1;
    // Decide winding from the first quad: its normal must point away from the axis.
    const P = (i: number) => new THREE.Vector3(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
    const a = P(start), b = P(start + row), c = P(start + 1);
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    const flip = n.dot(a.clone().sub(centers[0])) < 0;
    for (let r = 0; r < rings.length - 1; r++)
      for (let s = 0; s < seg; s++) {
        const i0 = start + r * row + s, i1 = i0 + row;
        if (flip) {
          this.tri(mat, i0, i0 + 1, i1);
          this.tri(mat, i1, i0 + 1, i1 + 1);
        } else {
          this.tri(mat, i0, i1, i0 + 1);
          this.tri(mat, i1, i1 + 1, i0 + 1);
        }
      }
    const cap = (ri: number, outward: number) => {
      const ring = rings[ri];
      const centre = this.vertex(centers[ri], (u0 + u1) / 2, ring.v, typeof ring.w === "function" ? ring.w(0) : ring.w);
      const along = centers[Math.min(rings.length - 1, ri + 1)].clone().sub(centers[Math.max(0, ri - 1)]);
      for (let s = 0; s < seg; s++) {
        const i0 = start + ri * row + s;
        const tn = new THREE.Vector3().crossVectors(P(i0).sub(P(centre)), P(i0 + 1).sub(P(centre)));
        const good = tn.dot(along) * outward > 0;
        if (good) this.tri(mat, centre, i0, i0 + 1);
        else this.tri(mat, centre, i0 + 1, i0);
      }
    };
    if (opts.capStart) cap(0, -1);
    if (opts.capEnd) cap(rings.length - 1, 1);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    const index: number[] = [];
    for (const [mat, tris] of this.tris) {
      g.addGroup(index.length, tris.length, MAT_ORDER.indexOf(mat));
      for (const t of tris) index.push(t);
    }
    if (this.faceTints.size) {
      const colors = new Float32Array(this.pos.length).fill(1);
      for (const [index, tint] of this.faceTints) colors.set(tint, 3 * index);
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    g.setIndex(index);
    g.computeVertexNormals();
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 3);
    return g;
  }
  get triangles() {
    let n = 0;
    for (const t of this.tris.values()) n += t.length / 3;
    return n;
  }
}
const MAT_ORDER: MatKey[] = [
  "jersey", "pants", "socks", "skin", "helmet", "glove", "boot", "steel", "stick", "tape", "visor",
  "eyeWhite", "iris", "lips", "hair", "beard", "trim", "pad", "mask", "cage", "shirt", "shoe",
];

/* ---------------------------------------------------------- appearance */

export interface Appearance {
  face: number; // 0..9
  skin: number; // 0..5
  hair: number; // 0..8
  hairColor: number;
  beard: number; // 0 none, 1 stubble, 2 full
  helmet: number; // 0 rounded, 1 angular
  hs: number; // stick side
  build: number; // 0 lean .. 1 heavy
}
export const SKIN_TONES = ["#f3d3b5", "#e8bd98", "#d5a07a", "#b17852", "#875536", "#5e3a24"];
export const HAIR_COLORS = ["#1d1510", "#3b2617", "#6a4a2c", "#a07c4f", "#c9a76a", "#111111", "#8c8c8c"];
const FACES = [
  // jaw, chin, cheek, nose length, nose width, brow, eye spacing, head length
  [1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.036, 1.0],
  [1.08, 1.05, 1.02, 0.9, 1.1, 0.004, 0.038, 0.98],
  [0.9, 1.1, 0.96, 1.15, 0.9, -0.003, 0.035, 1.05],
  [1.12, 0.92, 1.05, 1.05, 1.15, 0.006, 0.039, 1.0],
  [0.94, 0.95, 1.0, 0.85, 0.95, -0.002, 0.034, 1.03],
  [1.04, 1.12, 0.98, 1.2, 1.05, 0.002, 0.037, 1.06],
  [0.88, 0.9, 0.95, 0.95, 0.88, 0.0, 0.035, 0.97],
  [1.1, 1.0, 1.08, 1.1, 1.2, 0.005, 0.04, 1.02],
  [0.96, 1.06, 1.0, 1.0, 1.0, -0.004, 0.036, 1.08],
  [1.02, 0.97, 1.04, 0.92, 1.08, 0.003, 0.037, 0.99],
];
/** Hairstyles: front hairline, side, back length (m below centre), thickness, flare, curl. */
const HAIRSTYLES = [
  { front: 0.06, side: -0.01, back: -0.07, thick: 0.012, flare: 0, curl: 0 }, // short crop
  { front: 0.065, side: 0.0, back: -0.05, thick: 0.005, flare: 0, curl: 0 }, // buzz
  { front: 0.055, side: -0.03, back: -0.15, thick: 0.016, flare: 0.035, curl: 0 }, // hockey flow
  { front: 0.06, side: -0.02, back: -0.2, thick: 0.014, flare: 0.01, curl: 0 }, // mullet
  { front: 0.055, side: -0.02, back: -0.09, thick: 0.022, flare: 0.01, curl: 1 }, // curly
  { front: 0.07, side: -0.01, back: -0.08, thick: 0.014, flare: 0, curl: 0 }, // slicked back
  { front: 0.2, side: 0.2, back: 0.2, thick: 0, flare: 0, curl: 0 }, // bald / shaved
  { front: 0.05, side: -0.06, back: -0.24, thick: 0.018, flare: 0.02, curl: 0 }, // long
  { front: 0.058, side: -0.015, back: -0.1, thick: 0.015, flare: 0.015, curl: 0.4 }, // wavy side part
];

export function appearanceFor(id: string, role: RigRole, pos = "C"): Appearance {
  const h = (salt: number) => hash01(id, salt);
  const tone = h(11);
  const old = role === "coach" || role === "referee" || role === "linesman";
  return {
    face: Math.floor(h(41) * FACES.length),
    skin: tone < 0.42 ? 0 : tone < 0.66 ? 1 : tone < 0.82 ? 2 : tone < 0.91 ? 3 : tone < 0.97 ? 4 : 5,
    hair: Math.floor(h(43) * HAIRSTYLES.length),
    hairColor: old && h(47) < 0.45 ? 6 : Math.floor(h(17) * 6),
    beard: h(23) < 0.18 ? 2 : h(23) < 0.38 ? 1 : 0,
    helmet: h(53) < 0.5 ? 0 : 1,
    hs: role === "skater" || role === "goalie" ? (hash01(id, 3) < 0.62 ? 1 : -1) : 1,
    build: clamp(h(7) + (pos === "D" ? 0.25 : pos === "G" ? 0.15 : 0), 0, 1),
  };
}

/* --------------------------------------------------------- body builder */

interface BuildSpec {
  role: RigRole;
  look: Appearance;
  detail: 2 | 1 | 0;
  equipment?: HeadgearPart[];
}

function buildBody(spec: BuildSpec) {
  const { role, look, detail } = spec;
  const goalie = role === "goalie";
  const coach = role === "coach";
  const official = role === "referee" || role === "linesman";
  const bind = bindPose(goalie, look.hs);
  const b = new Builder();
  const seg = detail === 2 ? 42 : detail ? 25 : 10;
  const segL = detail === 2 ? 26 : detail ? 16 : 7;
  const F = (bone: BoneName, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)).premultiply(bind[B[bone]]);
  const face = FACES[look.face];
  const bulk = 0.95 + look.build * 0.1;

  // ---------------------------------------------------------------- torso
  const chest = goalie ? 1.28 : coach ? 0.9 : official ? 0.95 : 1;
  const torsoProfile: [number, number, number][] = coach
    ? [[-0.16, 0.2, 0.135], [0.0, 0.19, 0.13], [0.15, 0.2, 0.13], [0.3, 0.215, 0.14], [0.42, 0.235, 0.135], [0.5, 0.2, 0.12], [0.55, 0.12, 0.09], [0.58, 0.065, 0.06]]
    : [
        [-0.018, .231, .166], [0, .234, .168], [.045, .225, .16],
        [.09, .213, .151], [.14, .201, .144], [.18, .197, .14],
        [.22, .203, .145], [.26, .215, .153], [.30, .232, .162],
        [.36, .253, .174], [.42, .262, .178], [.465, .259, .167],
        [.495, .245, .153], [.525, .213, .132], [.552, .157, .103],
        [.578, .077, .066],
      ];
  const spineW = (y: number): W => {
    if (y < 0.16) return [["spine1", 1]];
    if (y < 0.3) return [["spine1", 1 - smooth((y - 0.16) / 0.14)], ["spine2", smooth((y - 0.16) / 0.14)]];
    if (y < 0.44) return [["spine2", 1 - smooth((y - 0.3) / 0.14)], ["spine3", smooth((y - 0.3) / 0.14)]];
    return [["spine3", 1]];
  };
  const torsoRings = torsoProfile.map(([y, rx, rz]) => {
    const hemWeight = coach ? 0 : .60 * (1 - smooth((y + .018) / .13));
    return {
      frame: F("spine1", 0, y, 0),
      rx: rx * chest * bulk,
      rz: rz * chest * (goalie ? 1.12 : 1) * bulk,
      v: 0.5 + (y + 0.02) / 0.62 * 0.5,
      lift: coach ? undefined : (th: number) => {
        const front = Math.max(0, Math.sin(th));
        return -.036 * front ** 5 * smooth((y - .49) / .085)
          - .016 * Math.sin(th) ** 2 * (1 - smooth((y + .018) / .12));
      },
      // Hem: flutter helpers by direction; shoulders: clavicles.
      w: (th: number): W => {
        const base = spineW(y);
        if (hemWeight > 0) {
          const f = Math.max(0, Math.sin(th)), bk = Math.max(0, -Math.sin(th));
          const l = Math.max(0, Math.cos(th)), r = Math.max(0, -Math.cos(th));
          return [...base.map(([n, w]) => [n, w * (1 - hemWeight)] as [BoneName, number]), ["jerseyF", f * hemWeight], ["jerseyB", bk * hemWeight], ["jerseyL", l * hemWeight], ["jerseyR", r * hemWeight]];
        }
        if (y > 0.38) {
          const side = Math.cos(th);
          const k = Math.max(0, Math.abs(side) - 0.55) * 1.6 * smooth((y - 0.38) / 0.12);
          return [...base.map(([n, w]) => [n, w * (1 - k)] as [BoneName, number]), [side > 0 ? "clavL" : "clavR", k]];
        }
        return base;
      },
      // Fabric creases: a few soft folds that run down the jersey.
      r: coach ? undefined : (th: number) => {
        const side = Math.cos(th), front = Math.sin(th);
        const waist = Math.exp(-(((y - .13) / .145) ** 2));
        const drape = .035 * Math.cos(7 * th + y * 8) * waist;
        const compression = .047 * Math.sin(y * 62 + side * 4 + front) * waist;
        const pad = Math.exp(-(((y - .40) / .09) ** 2));
        return 1 + drape + compression + pad * .085 * Math.cos(4 * th + Math.PI);
      },
    };
  });
  b.loft(torsoRings, "jersey", seg, { capEnd: false, exp: goalie ? 2.4 : 2.12 });
  // Collar / neck opening.
  b.loft(
    [
      { frame: F("spine3", 0, 0.574, 0.004), rx: 0.080, rz: 0.070, lift: (th: number) => coach ? 0 : -.036 * Math.max(0, Math.sin(th)) ** 5, v: 0.99, w: [["spine3", 1]] },
      { frame: F("spine3", 0, 0.591, 0.006), rx: 0.061, rz: 0.055, lift: (th: number) => coach ? 0 : -.028 * Math.max(0, Math.sin(th)) ** 5, v: 1, w: [["spine3", 0.6], ["neck", 0.4]] },
    ],
    coach ? "shirt" : "trim",
    segL,
  );
  // Neck.
  b.loft(
    [
      { frame: F("spine3", 0, 0.56, 0), rx: 0.056, rz: 0.054, v: 0, w: [["spine3", 1]] },
      { frame: F("neck", 0, 0.05, 0.005), rx: 0.052, rz: 0.05, v: 0.5, w: [["neck", 1]] },
      { frame: F("head", 0, -0.08, 0.0), rx: 0.05, rz: 0.055, v: 1, w: [["neck", 0.4], ["head", 0.6]] },
    ],
    "skin",
    segL,
  );
  if (coach) {
    // Shirt front, tie in the team colour and lapels.
    b.geometry(new THREE.BoxGeometry(0.1, 0.2, 0.01), F("spine3", 0, 0.47, 0.128), "shirt", [["spine3", 1]]);
    b.geometry(new THREE.BoxGeometry(0.035, 0.24, 0.012), F("spine3", 0, 0.43, 0.136, 0.05), "trim", [["spine3", 1]]);
    for (const s of [-1, 1]) b.geometry(new THREE.BoxGeometry(0.06, 0.22, 0.01), F("spine3", s * 0.07, 0.44, 0.132, 0.05, 0, s * 0.35), "jersey", [["spine3", 1]]);
  }

  // ---------------------------------------------------------- arms + hands
  const sleeve = goalie ? 1.3 : coach ? 0.8 : official ? 0.85 : 1;
  for (const [side, s] of [["L", 1], ["R", -1]] as const) {
    const up = `upper${side}` as BoneName, fore = `fore${side}` as BoneName, hand = `hand${side}` as BoneName, clav = `clav${side}` as BoneName;
    const ring = (bone: BoneName, t: number, radius: number, v: number, w: W) => ({
      frame: F(bone, 0, t, 0), rx: radius * sleeve * bulk, rz: radius * sleeve * bulk, v, w,
      r: (theta: number) => {
        const elbow = Math.exp(-(((v - .29) / .095) ** 2));
        return 1 + elbow * (.08 * Math.cos(theta * 2) + .065 * Math.sin(58 * v + theta * 2));
      },
    });
    b.loft(
      [
        ring(up, -0.075, 0.018, 0.0, [[clav, 0.45], [up, 0.55]]),
        ring(up, -0.045, 0.066, 0.02, [[clav, 0.3], [up, 0.7]]),
        ring(up, -0.005, 0.092, 0.05, [[clav, 0.2], [up, 0.8]]),
        ring(up, 0.04, 0.096, 0.08, [[up, 0.8], [clav, 0.2]]),
        ring(up, 0.15, 0.079, 0.18, [[up, 1]]),
        ring(up, UPPER - 0.04, 0.073, 0.26, [[up, 0.8], [fore, 0.2]]),
        ring(fore, 0.0, 0.081, 0.3, [[up, 0.5], [fore, 0.5]]),
        ring(fore, 0.06, 0.071, 0.34, [[fore, 0.85], [up, 0.15]]),
        ring(fore, 0.17, 0.06, 0.42, [[fore, 1]]),
        ring(fore, FORE - 0.05, 0.058, 0.48, [[fore, 0.8], [hand, 0.2]]),
      ],
      "jersey",
      segL,
      { u0: 0, u1: 1 },
    );
    if (goalie) {
      const dome = new THREE.SphereGeometry(0.1 * sleeve, detail ? 16 : 8, detail ? 10 : 5, 0, TAU, 0, Math.PI * 0.55).scale(0.95, 0.5, 1.05);
      const uv = dome.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) uv.setXY(i, s > 0 ? 0.02 : 0.48, 0.82);
      b.geometry(dome, F("spine3", s * (SHOULDER_X - 0.02), SHOULDER_Y - 0.025, 0, 0, 0, -s * 0.35), "jersey", [["spine3", 0.35], [clav, 0.35], [up, 0.3]]);
    }
    if (coach || official) {
      b.geometry(new THREE.SphereGeometry(0.045, detail ? 10 : 6, detail ? 8 : 5).scale(0.85, 1.2, 0.6), F(hand, 0, 0.02, 0), "skin", [[hand, 1]]);
      if (role === "referee")
        b.loft([ring(up, 0.06, 0.094, 0.1, [[up, 1]]), ring(up, 0.13, 0.092, 0.12, [[up, 1]])], "trim", segL);
    } else if (goalie && s === look.hs) {
      // Catching glove (on the blade side's opposite arm via mirroring below).
      b.geometry(new THREE.CylinderGeometry(0.075, 0.08, 0.13, detail ? 14 : 8), F(hand, 0, -0.06, 0), "glove", [[hand, 0.8], [fore, 0.2]]);
      const pocket = new THREE.SphereGeometry(.117, detail ? 20 : 10, detail ? 10 : 5, 0, TAU, Math.PI*.5, Math.PI*.5);
      pocket.scale(1.07, .49, 1.22);
      const mitt = F(hand,.022*s,.063,.059,Math.PI/2,0,.24*s);
      b.geometry(pocket,mitt,"glove",[[hand,1]]);
      const rim = new THREE.TorusGeometry(.122,.012,5,detail ? 28 : 12).scale(1,1.16,1).rotateX(Math.PI/2);
      b.geometry(rim,mitt,"pad",[[hand,1]]);
      for (const lane of [-.65,-.32,0,.32,.65]) {
        const reach = Math.sqrt(1-lane*lane);
        for (const cross of [-1,1]) {
          const lace = new THREE.CylinderGeometry(.0028,.0028,.218*reach,4).rotateX(Math.PI/2).rotateY(cross*.55);
          lace.translate(lane*.108,-.013,0);
          b.geometry(lace,mitt,"tape",[[hand,1]]);
        }
      }
    } else if (goalie) {
      b.geometry(new THREE.CylinderGeometry(0.075, 0.08, 0.13, detail ? 14 : 8), F(hand, 0, -0.06, 0), "glove", [[hand, 0.8], [fore, 0.2]]);
      b.geometry(new RoundedBoxGeometry(.074,.265,.194, detail ? 2 : 1,.023), F(hand, -0.05 * s, 0.05, 0.02), "pad", [[hand, 1]]);
      b.geometry(new THREE.BoxGeometry(0.065, 0.06, 0.195), F(hand, -0.05 * s, 0.15, 0.02), "trim", [[hand, 1]]);
    } else {
      if (detail) {
        for (const z of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            const roll = new THREE.CapsuleGeometry(.014, .067 - i*.006, 3, 9);
            roll.rotateZ(Math.PI/2);
            b.geometry(roll, F(hand, 0, -.024+i*.03, z*(.064-i*.005)), "glove", [[hand,1]]);
          }
        }
        b.geometry(new THREE.CapsuleGeometry(.021,.061,3,9), F(hand,.052*s,.035,.018,0,0,s*.36), "glove", [[hand,1]]);
      }
      // Hockey glove: wide cuff, padded back and rolled fingers.
      b.loft(
        [
          { frame: F(hand, 0, -0.13, 0), rx: 0.068, rz: 0.07, v: 0, w: [[fore, 0.4], [hand, 0.6]] },
          { frame: F(hand, 0, -0.05, 0), rx: 0.078, rz: 0.08, v: 0.3, w: [[hand, 1]] },
          { frame: F(hand, 0, 0.0, 0.0), rx: 0.064, rz: 0.06, v: 0.5, w: [[hand, 1]] },
          { frame: F(hand, 0, 0.07, 0.0), rx: 0.058, rz: 0.055, v: 0.8, w: [[hand, 1]] },
          { frame: F(hand, 0, 0.11, 0.0), rx: 0.04, rz: 0.04, v: 1, w: [[hand, 1]] },
        ],
        "glove",
        segL,
        { capEnd: true, exp: 2.6 },
      );
      b.loft(
        [
          { frame: F(hand, 0, -0.1, 0), rx: 0.074, rz: 0.076, v: 0, w: [[hand, 0.8], [fore, 0.2]] },
          { frame: F(hand, 0, -0.075, 0), rx: 0.074, rz: 0.076, v: 1, w: [[hand, 1]] },
        ],
        "trim",
        segL,
      );
    }
  }

  // ------------------------------------------------------------- legs
  // Pelvis girdle (hockey pants or trousers) around both legs.
  const pantsR = goalie ? 1.2 : coach ? 0.82 : 1;
  b.loft(
    [
      { frame: F("pelvis", 0, 0.1, 0), rx: 0.2 * pantsR * bulk, rz: 0.145 * pantsR, v: 1, w: [["spine1", 0.5], ["pelvis", 0.5]] },
      { frame: F("pelvis", 0, 0.0, 0), rx: 0.215 * pantsR * bulk, rz: 0.155 * pantsR, v: 0.8, w: [["pelvis", 1]] },
      { frame: F("pelvis", 0, -0.1, 0), rx: 0.22 * pantsR * bulk, rz: 0.158 * pantsR, v: 0.55, w: [["pelvis", 1]] },
    ],
    "pants",
    seg,
    { exp: 2.15 },
  );
  for (const [side, s] of [["L", 1], ["R", -1]] as const) {
    const thigh = `thigh${side}` as BoneName, shin = `shin${side}` as BoneName, foot = `foot${side}` as BoneName;
    const legRing = (bone: BoneName, t: number, rx: number, rz: number, v: number, w: W, dz = 0) => ({ frame: F(bone, 0, -t, dz), rx: rx * bulk, rz: rz * bulk, v, w });
    if (coach) {
      b.loft(
        [
          legRing(thigh, -0.08, 0.1, 0.1, 0, [["pelvis", 0.6], [thigh, 0.4]]),
          legRing(thigh, 0.1, 0.085, 0.085, 0.2, [[thigh, 1]]),
          legRing(thigh, THIGH - 0.04, 0.07, 0.07, 0.45, [[thigh, 0.7], [shin, 0.3]]),
          legRing(shin, 0.0, 0.068, 0.068, 0.5, [[thigh, 0.5], [shin, 0.5]]),
          legRing(shin, 0.2, 0.062, 0.062, 0.75, [[shin, 1]]),
          legRing(shin, SHIN - 0.03, 0.058, 0.058, 1, [[shin, 0.8], [foot, 0.2]]),
        ],
        "pants",
        segL,
      );
      b.geometry(new THREE.BoxGeometry(0.1, 0.07, 0.27, 1, 1, 2), F(foot, 0, -0.035, 0.05), "shoe", [[foot, 1]]);
      continue;
    }
    // Hockey pants: loose shorts that stop above the knee.
    b.loft(
      [
        legRing(thigh, -0.1, 0.13 * pantsR, 0.125 * pantsR, 0.5, [["pelvis", 0.7], [thigh, 0.3]], 0.008),
        legRing(thigh, 0.02, 0.132 * pantsR, 0.128 * pantsR, 0.38, [["pelvis", 0.3], [thigh, 0.7]], 0.01),
        legRing(thigh, 0.14, 0.125 * pantsR, 0.135 * pantsR, 0.22, [[thigh, 1]], 0.014),
        legRing(thigh, 0.26, 0.121 * pantsR, 0.11 * pantsR, 0.08, [[thigh, 1]], 0.008),
        legRing(thigh, 0.3, 0.118 * pantsR, 0.106 * pantsR, 0.0, [[thigh, 1]], 0.008),
      ],
      "pants",
      seg,
      { exp: 2.35, u0: s > 0 ? 0 : .5, u1: s > 0 ? .5 : 1 },
    );
    // Socks over the shin guards, blending at the knee.
    b.loft(
      [
        legRing(thigh, 0.24, 0.078, 0.078, 0.0, [[thigh, 1]]),
        legRing(thigh, THIGH - 0.06, 0.08, 0.085, 0.18, [[thigh, 0.75], [shin, 0.25]], 0.01),
        legRing(shin, 0.0, 0.083, 0.09, 0.3, [[thigh, 0.45], [shin, 0.55]], 0.02),
        legRing(shin, 0.07, 0.08, 0.088, 0.42, [[shin, 1]], 0.02),
        legRing(shin, 0.16, 0.074, 0.08, 0.6, [[shin, 1]], 0.014),
        legRing(shin, 0.3, 0.06, 0.062, 0.8, [[shin, 1]], 0.006),
        legRing(shin, SHIN - 0.03, 0.054, 0.056, 1, [[shin, 0.7], [foot, 0.3]]),
      ],
      official ? "pants" : "socks",
      segL,
    );
    if (goalie) {
      // Leg pads: tall, wide, flat-fronted, with knee stack and trim rolls.
      const padProfile = [[-.5,.090,.072,.075],[-.44,.118,.091,.055],[-.22,.124,.098,.035],[.12,.128,.093,.035],[.41,.126,.078,.041],[.5,.113,.065,.043]];
      b.loft(padProfile.map(([height,rx,rz,z]) => ({
        frame: F(shin,0,PAD_Y+height*PAD_H,z), rx,rz, v:height+.5, w:[[shin,1]] as W,
      })), "pad", detail ? 20 : 8, {capStart:true,capEnd:true,exp:5});
      for (const h of [-.22,-.12,-.02]) {
        const roll = new THREE.CapsuleGeometry(.012,.208,2,detail ? 8 : 4).rotateZ(Math.PI/2);
        b.geometry(roll,F(shin,0,PAD_Y+h,.13), "pad", [[shin,1]]);
      }
      const rail = new THREE.CapsuleGeometry(.018,.49,3,detail ? 9 : 5);
      b.geometry(rail,F(shin,s*.108,PAD_Y+.012,.109), "glove", [[shin,1]]);
    }
    // Skate: boot, tendon guard, holder and steel blade.
    if (detail) {
      // Crossed laces follow the sloping vamp on close-up models.
      for (let row = 0; row < 4; row++) {
        for (const diagonal of [-1, 1]) {
          const lace = new THREE.BoxGeometry(0.069, 0.005, 0.006)
            .rotateZ(diagonal * 0.19).rotateY(diagonal * 0.23);
          b.geometry(lace, F(foot, 0, 0.04 - row * 0.016, 0.053 + row * 0.015), "pad", [[foot, 1]]);
        }
      }
    }
    // Last-shaped boot: transverse sections run from the heel pocket to
    // the toe cap. The raised ankle runs into a low, rounded forefoot.
    const toeBone = `toe${side}` as BoneName;
    const bootSections = [
      [-.087, .031, -.005, .059], [-.063, .049, .006, .078],
      [-.022, .056, .013, .089], [.026, .058, .002, .077],
      [.070, .055, -.020, .058], [.115, .051, -.038, .042],
      [.156, .043, -.049, .030], [.178, .025, -.055, .022],
    ];
    const visibleSections = detail ? bootSections : bootSections.filter((_, i) => [0, 2, 4, 6, 7].includes(i));
    b.loft(visibleSections.map(([z, width, y, height]) => {
      const flex = smooth((z - .075) / .085) * .7;
      return {frame: F(foot, 0, y, z, Math.PI / 2), rx: width, rz: height,
        v: (z + .087) / .265, w: [[foot, 1 - flex], [toeBone, flex]] as W};
    }), "boot", detail ? 14 : 7, {capStart: true, capEnd: true, exp: 2.8});
    // Achilles guard bends with the ankle while the heel stays in the boot.
    b.geometry(new RoundedBoxGeometry(.061, .106, .021, 1, .009),
      F(foot, 0, .064, -.062, -.22), "boot", [[foot, .7], [shin, .3]]);
    for (const z of [-.045,.126])
      b.geometry(new THREE.CylinderGeometry(.024,.014,.047,detail ? 10 : 5).scale(.64,1,1.3),F(foot,0,-.087,z),"pad",[[foot,1]]);
    b.geometry(new THREE.BoxGeometry(.021,.017,.265),F(foot,0,-.105,.045),"pad",[[foot,1]]);
    const runner = new THREE.Shape();
    runner.moveTo(-.145, .026);
    runner.lineTo(.151, .026);
    runner.quadraticCurveTo(.144, .004, .111, .002);
    runner.quadraticCurveTo(0, -.002, -.101, .002);
    runner.quadraticCurveTo(-.138, .003, -.145, .026);
    const steel = new THREE.ExtrudeGeometry(runner, {depth: .004, bevelEnabled: false, curveSegments: detail ? 6 : 2});
    b.geometry(steel, F(foot, .002, -BLADE_DROP, .043, 0, -Math.PI/2), "steel", [[foot, 1]]);
  }
  // ------------------------------------------------------------ head
  buildHead(b, F, look, face, { goalie, coach, official, detail }, spec.equipment);

  // ------------------------------------------------------------ stick
  if (role === "skater" || goalie) {
    const len = goalie ? 1.45 : 1.55;
    const shaftW = goalie ? 0.032 : 0.03;
    b.geometry(new THREE.BoxGeometry(shaftW, len, 0.02, 1, detail ? 3 : 1, 1), F("stick", 0, len / 2 + 0.023, 0), "stick", [["stick", 1]]);
    b.geometry(new THREE.BoxGeometry(shaftW + 0.004, 0.13, 0.024), F("stick", 0, len - 0.02, 0), "tape", [["stick", 1]]);
    if (goalie) b.geometry(new THREE.BoxGeometry(0.075, 0.62, 0.024), F("stick", 0, 0.36, 0.0), "stick", [["stick", 1]]);
    // Curved blade: bent toward the forehand of a left or right shot.
    const bladeLen = goalie ? 0.38 : 0.3;
    // Keep the heel on its own joint. A tilted shaft must not lift the toe
    // when the player is carrying the puck with the blade flat on the ice.
    const sections = [[0,.058],[.12,.064],[.34,.067],[.56,.069],[.78,.067],[.94,.059],[1,.034]];
    const rings = sections.map(([u,height]) => ({
      frame:F("blade",look.hs*.032*u*u,height/2+.012*u*u,bladeLen*u,Math.PI/2),
      rx:.0075, rz:height*(goalie?.65:.5), v:u, w:[["blade",1]] as W,
    }));
    b.loft(rings.slice(0,3),"stick",detail ? 12 : 6,{capStart:true,exp:3.5});
    b.loft(rings.slice(2),"tape",detail ? 12 : 6,{capEnd:true,exp:3.5});
  }
  return { geometry: b.build(), triangles: b.triangles, bind };
}

function buildHead(
  b: Builder,
  F: (bone: BoneName, x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number) => THREE.Matrix4,
  look: Appearance,
  face: number[],
  o: { goalie: boolean; coach: boolean; official: boolean; detail: 0 | 1 | 2 },
  equipment?: HeadgearPart[],
) {
  const [jaw, chin, cheek, noseLen, noseW, brow, eyeX, headLen] = face;
  const H: W = [["head", 1]];
  // The CC0 HM08 head includes continuous eyelids, lips, ears and nostrils.
  const mesh = o.detail === 2 ? headMesh.near : o.detail ? headMesh.middle : headMesh.far;
  const base = b.pos.length / 3;
  const transform = F("head");
  for (let i = 0; i < mesh.points.length; i += 3) {
    const x = mesh.points[i] / 1000, y = mesh.points[i + 1] / 1000, z = mesh.points[i + 2] / 1000;
    const jawWeight = smooth((6.95 - y) / .65);
    const noseWeight = smooth((z - 1.48) / .16) * smooth((7.2 - y) / .2);
    const eyeWeight = Math.exp(-(((y - 7.28) / .25) ** 2 + ((Math.abs(x) - .31) / .26) ** 2));
    const width = lerp(cheek, jaw, jawWeight) * lerp(1, noseW, noseWeight) * lerp(1, eyeX / .036, eyeWeight);
    const point = new THREE.Vector3(x * .11 * width, (y - 7.09) * .103 * headLen,
      (z - .56) * .119 + .026 * (chin - 1) * jawWeight + .06 * (noseLen - 1) * noseWeight);
    const vertex = b.vertex(point.applyMatrix4(transform), 0, 0, H);
    const lip = smooth(1 - ((y - 6.66) / .085) ** 2 - (x / .24) ** 2) * smooth((z - 1.30) / .12);
    const stubble = (look.beard / 2) * smooth((6.58 + Math.abs(x) * .36 - y) / .16)
      * smooth((z - .4) / .45) * smooth((y - 6.10) / .12);
    b.faceTints.set(vertex, [1 - stubble * .53, 1 - lip * .52 - stubble * .47, 1 - lip * .42 - stubble * .39]);
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    b.tri("skin", base + mesh.indices[i], base + mesh.indices[i + 1], base + mesh.indices[i + 2]);
  }
  if (o.detail) {
    for (const side of [-1, 1]) {
      const x = side * .30775 * .11 * cheek * eyeX / .036;
      const y = (7.28415 - 7.09) * .103 * headLen;
      b.geometry(new THREE.SphereGeometry(.0158, 12, 8), F("head", x, y, .082), "eyeWhite", H);
      b.geometry(new THREE.SphereGeometry(.006, 12, 6).scale(1, 1, .32), F("head", x, y, .097), "iris", H);
      b.geometry(new THREE.SphereGeometry(.016, 12, 6).scale(1, .18, .30),
        F("head", x, y + .021 + brow, .107, 0, 0, -side * .12), "hair", H);
    }
  }
  // Hair: a shell whose coverage follows the style, visible below the
  // helmet rim (flow at the back, sideburns) and fully on coaches.
  const style = HAIRSTYLES[look.hair];
  if (style.thick > 0) {
    const rows = o.detail ? 12 : 6, cols = o.detail ? 20 : 10;
    const g = new THREE.BufferGeometry();
    const p: number[] = [], idx: number[] = [];
    for (let i = 0; i <= rows; i++)
      for (let j = 0; j <= cols; j++) {
        const phi = (i / rows) * Math.PI * 0.72; // from crown downwards
        const th = (j / cols) * TAU;
        const sx = Math.sin(phi) * Math.cos(th), sz = Math.sin(phi) * Math.sin(th), sy = Math.cos(phi);
        const curl = style.curl ? Math.sin(th * 9 + phi * 11) * 0.006 * style.curl : 0;
        const exposed = o.coach ? 1 : smooth((-sy-.1)/.42);
        const r = o.coach ? .108+style.thick+curl : .099 + (style.thick+curl)*exposed;
        const back = Math.max(0, -Math.sin(th));
        const flare = style.flare * back * exposed * smooth((0.4 - sy) / 0.6);
        p.push(sx * (r + flare) * cheek, sy * r * headLen + 0.006, sz * (r + flare) * 1.04 + 0.006);
      }
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const th = ((j + 0.5) / cols) * TAU;
        const phi = ((i + 0.5) / rows) * Math.PI * 0.72;
        const y = Math.cos(phi) * 0.11 * headLen;
        const front = Math.sin(th), side = Math.abs(Math.cos(th));
        // Hairline: forehead in front, ears on the sides, style length at the back.
        const limit = front > 0.35 ? style.front : front > -0.35 ? style.side : style.back;
        void side;
        if (y < limit) continue;
        const a = i * (cols + 1) + j, c = a + cols + 1;
        idx.push(a, c, a + 1, c, c + 1, a + 1);
      }
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(idx);
    b.geometry(g, F("head", 0, 0, 0), "hair", H);
  }
  if (o.coach) return;
  // Helmet (two models) or goalie mask with cage.
  if (equipment?.length) {
    for (const part of equipment) b.geometry(part.geometry.clone(), F("head"), part.material, H);
    if (!o.goalie && !o.official)
      b.geometry(new THREE.CylinderGeometry(.142,.136,.049,28,1,true,-1.16,2.32), F("head",0,.028,.005), "visor", H);
    return;
  }
  if (o.goalie) {
    const mask = new THREE.SphereGeometry(0.13, o.detail ? 20 : 11, o.detail ? 14 : 7, 0, TAU, 0, Math.PI * 0.43);
    mask.scale(0.98, 1.08, 1.12);
    b.geometry(mask, F("head", 0, 0.008, -0.004), "mask", H);
    const cageRows = o.detail ? [-0.06, -0.02, 0.02] : [-0.02];
    for (const y of cageRows) b.geometry(new THREE.TorusGeometry(0.118, 0.0045, 4, o.detail ? 14 : 8, Math.PI * 0.9).rotateX(Math.PI / 2).rotateY(Math.PI * 0.05), F("head", 0, y, 0.012), "cage", H);
    for (const x of [-0.045, -0.015, 0.015, 0.045]) b.geometry(new THREE.BoxGeometry(0.006, 0.13, 0.006), F("head", x, -0.02, 0.122 - Math.abs(x) * 0.3), "cage", H);
    return;
  }
  const shellSeg = o.detail ? 22 : 12;
  const cap = new THREE.SphereGeometry(0.128, shellSeg, o.detail ? 10 : 6, 0, TAU, 0, Math.PI * 0.47);
  const backShell = new THREE.SphereGeometry(0.128, shellSeg, o.detail ? 6 : 3, Math.PI * 1.05, Math.PI * 0.9, Math.PI * 0.47, Math.PI * 0.2);
  if (look.helmet === 1) {
    cap.scale(1.0, 0.95, 1.16);
    backShell.scale(1.0, 0.95, 1.16);
  } else {
    cap.scale(1.03, 1.0, 1.1);
    backShell.scale(1.03, 1.0, 1.1);
  }
  b.geometry(cap, F("head", 0, 0.035, -0.012), "helmet", H);
  b.geometry(backShell, F("head", 0, 0.035, -0.012), "helmet", H);
  // Ear guards and chin strap.
  for (const s of [-1, 1]) b.geometry(new THREE.BoxGeometry(0.02, 0.07, 0.06), F("head", s * 0.118, -0.01, 0.0), "helmet", H);
  b.geometry(new THREE.TorusGeometry(0.098, 0.004, 3, o.detail ? 12 : 6, Math.PI).rotateZ(Math.PI), F("head", 0, -0.035, 0.01), "pad", H);
  if (!o.official && o.detail) {
    const visor = new THREE.CylinderGeometry(0.138, 0.138, 0.052, o.detail ? 16 : 8, 1, true, -0.95, 1.9);
    b.geometry(visor, F("head", 0, 0.018, 0.0), "visor", H);
  }
}

/* -------------------------------------------------------- textures, mats */

const NAME_FONT = "800 40px 'Barlow Condensed', Arial Narrow, Arial, sans-serif";

function jerseyTexture(kit: TeamKit, name: string, number: number, role: RigRole, logo?: HTMLImageElement | null) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  if (ctx) {
    const official = role === "referee" || role === "linesman";
    // Torso (top half): u wraps the body, front at u 0.25, back at u 0.75.
    // Layout (flipY off, so canvas y = v · 512): sleeves in the top half
    // (shoulder at y 0, wrist at y ≈ 245), torso in the bottom half (hem at
    // y ≈ 264, shoulders at y 512). Body height h maps to y = torsoY(h).
    const torsoY = (h: number) => 512 * (0.5 + ((h + 0.02) / 0.62) * 0.5);
    if (official) {
      for (let i = 0; i < 32; i++) {
        ctx.fillStyle = i % 2 ? "#141414" : "#f4f4f4";
        ctx.fillRect(i * 16, 0, 16, 512);
      }
    } else {
      ctx.fillStyle = kit.jersey;
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = kit.trim;
      ctx.fillRect(0, torsoY(0.01), 512, 12); // hem stripes
      ctx.fillRect(0, torsoY(0.06), 512, 6);
      // A curved yoke runs low over the pads and rises at the sternum.
      ctx.beginPath();
      ctx.moveTo(0, 512);
      for (let x = 0; x <= 512; x += 4) {
        const side = Math.cos(x * TAU / 512);
        ctx.lineTo(x, torsoY(.572 - .098 * side * side));
      }
      ctx.lineTo(512, 512);
      ctx.fill();
      ctx.fillRect(0, 0.3 * 512, 512, 12); // sleeve stripes at the elbow
      ctx.fillRect(0, 0.35 * 512, 512, 6);
      ctx.fillRect(0, 0.46 * 512, 512, 10); // cuff
      // Raglan panels follow the shoulder cap into the underarm, front and back.
      for (const center of [128, 384]) {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(center + side * 42, torsoY(.576));
          ctx.bezierCurveTo(center + side * 60, torsoY(.50),
            center + side * 93, torsoY(.44), center + side * 104, torsoY(.34));
          ctx.strokeStyle = "rgba(0,0,0,.22)";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,.32)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // Fabric: faint vertical weave.
      for (let x = 0; x < 512; x += 4) {
        ctx.fillStyle = `rgba(0,0,0,${0.02 + 0.02 * Math.sin(x * 0.7)})`;
        ctx.fillRect(x, 0, 2, 512);
      }
    }
    // u runs around the body right-to-left as seen by a viewer, and v runs
    // up the body: everything drawn is rotated 180° to read correctly.
    const upright = (x: number, y: number, draw: () => void) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, -1);
      draw();
      ctx.restore();
    };
    if (role === "skater" || role === "goalie") {
      const ink = luminance(kit.jersey) > 0.55 ? "#101820" : "#ffffff";
      ctx.fillStyle = ink;
      ctx.strokeStyle = kit.trim;
      ctx.lineWidth = 6;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const last = name.split(" ").slice(-1)[0].toUpperCase().slice(0, 12);
      upright(384, torsoY(0.47), () => {
        ctx.font = NAME_FONT;
        ctx.fillText(last, 0, 0, 200);
      });
      upright(384, torsoY(0.29), () => {
        ctx.font = "900 104px 'Barlow Condensed', Arial, sans-serif";
        ctx.strokeText(String(number), 0, 0);
        ctx.fillText(String(number), 0, 0);
      });
      upright(128, torsoY(0.33), () => {
        if (logo) ctx.drawImage(logo, -52, -52, 104, 104);
        else {
          // No crest image (CORS): a stitched badge with the club letters.
          ctx.beginPath();
          ctx.arc(0, 0, 42, 0, TAU);
          ctx.fillStyle = kit.trim;
          ctx.fill();
          ctx.lineWidth = 5;
          ctx.strokeStyle = ink;
          ctx.stroke();
          ctx.fillStyle = kit.jersey;
          ctx.font = "900 36px 'Barlow Condensed', Arial, sans-serif";
          ctx.fillText(kit.abbr ?? "", 0, 2, 74);
          ctx.fillStyle = ink;
        }
      });
      // Shoulder numbers on the outside of both sleeves.
      ctx.fillStyle = ink;
      // Sleeves: u runs round the arm and v down it, so text needs no flip.
      for (const x of [0, 256, 512]) {
        ctx.save();
        ctx.translate(x, 0.09 * 512);
        ctx.font = "800 40px Arial, sans-serif";
        ctx.fillText(String(number), 0, 0);
        ctx.restore();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = 4;
  return tex;
}

function maskTexture(kit: TeamKit) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = kit.jersey;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = kit.trim;
    ctx.lineWidth = 14;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 40 + i * 50);
      ctx.bezierCurveTo(80, i * 50, 170, 90 + i * 40, 256, 30 + i * 50);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Paired outside-leg panels share one atlas. Each short uses half the wrap,
 * putting the stripe on the left or right hip according to the leg. */
function pantsTexture(kit: TeamKit) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = kit.pants;
    ctx.fillRect(0, 0, 256, 128);
    for (const center of [0, 192, 256]) {
      ctx.fillStyle = "rgba(255,255,255,.055)";
      ctx.fillRect(center - 13, 0, 26, 128);
      ctx.fillStyle = kit.trim;
      ctx.fillRect(center - 3, 0, 2, 128);
      ctx.fillStyle = kit.jersey;
      ctx.fillRect(center - 1, 0, 5, 128);
      ctx.fillStyle = "rgba(255,255,255,.22)";
      for (let y = 1; y < 128; y += 4) ctx.fillRect(center + 7, y, 1, 2);
    }
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function socksTexture(kit: TeamKit) {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = kit.socks;
    ctx.fillRect(0, 0, 16, 128);
    ctx.fillStyle = kit.trim;
    ctx.fillRect(0, 40, 16, 14);
    ctx.fillRect(0, 62, 16, 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const luminance = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

/* ------------------------------------------------------------- the rig */

export interface RigLike {
  handPoint?(target:THREE.Vector3):boolean;
  bladePoint?(target: THREE.Vector3): boolean;
  readonly root: THREE.Group;
  readonly currentState: RigState;
  setIdentity(id: RigIdentity, pos: string): void;
  setState(state: RigState, variant?: number, side?: number): void;
  trigger(kind: RigActionKind, toward?: { x: number; z: number }, height?: number): void;
  setVisible(v: boolean): void;
  place(x: number, z: number, yaw: number): void;
  update(dt: number, animDt: number, inp: RigInput): void;
  dispose(): void;
  /** Hard stop in progress (for snow spray) and current speed. */
  readonly motion?: { stopping: boolean; speed: number; x: number; z: number; yaw: number };
}

interface Built {
  hi: THREE.BufferGeometry;
  mid: THREE.BufferGeometry;
  lo: THREE.BufferGeometry;
  detailed?: THREE.BufferGeometry;
  broadcast?: THREE.BufferGeometry;
  bind: THREE.Matrix4[];
  dispose(): void;
}

export class SkinnedRigFactory {
  private cache = new Map<string, Built>();
  private shared = new Map<string, THREE.Material>();
  private logos = new Map<string, HTMLImageElement | null>();
  readonly primitive = new RigFactory();

  private equipment?: Awaited<ReturnType<typeof loadHeadgear>>;
  private released = false;
  private textures = new Map<string, THREE.Texture>();
  readonly ready: Promise<void>;
  constructor(private logoFor?: (kit: TeamKit) => Promise<HTMLImageElement | null>) {
    this.ready = logoFor ? loadHeadgear().then(parts => {
      if (this.released) Object.values(parts).flat().forEach(p => p.geometry.dispose());
      else this.equipment = parts;
    }).catch(error => console.warn("Using built-in hockey equipment", error)) : Promise.resolve();
  }
  knit(url: string) {
    if (!this.logoFor) return null;
    let texture = this.textures.get(url);
    if (!texture) {
      texture = new THREE.TextureLoader().load(url);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(10, 10);
      this.textures.set(url, texture);
    }
    return texture;
  }
  equipped(model: Built, role: RigRole, look: Appearance, level: 1 | 2) {
    if (!this.equipment || role === "coach") return level === 2 ? model.hi : model.mid;
    if (level === 1) return model.broadcast ??= buildBody({role, look, detail:1, equipment:this.equipment[role === "goalie" ? "broadcast_goalie" : "broadcast_skater"]}).geometry;
    return model.detailed ??= buildBody({role, look, detail:2, equipment:this.equipment[role === "goalie" ? "goalie" : "skater"]}).geometry;
  }
  mat(key: string, make: () => THREE.Material) {
    let m = this.shared.get(key);
    if (!m) this.shared.set(key, (m = make()));
    return m;
  }
  model(role: RigRole, look: Appearance): Built {
    const key = `${role}|${look.face}|${look.hair}|${look.beard}|${look.helmet}|${look.hs}|${look.build.toFixed(2)}`;
    let m = this.cache.get(key);
    if (!m) {
      const lo = buildBody({role,look,detail:0});
      let high: THREE.BufferGeometry | undefined, medium: THREE.BufferGeometry | undefined;
      m = {
        get hi() { return high ??= buildBody({role,look,detail:2}).geometry; },
        get mid() { return medium ??= buildBody({role,look,detail:1}).geometry; },
        lo: lo.geometry, bind:lo.bind,
        dispose() {lo.geometry.dispose(); high?.dispose(); medium?.dispose(); this.detailed?.dispose(); this.broadcast?.dispose();}
      };
      const pigment = new Float32Array(lo.geometry.getAttribute("position").count);
      const indices = lo.geometry.index!;
      for (const group of lo.geometry.groups) {
        for (let i=group.start;i<group.start+group.count;i++) pigment[indices.getX(i)] = group.materialIndex ?? 0;
      }
      lo.geometry.setAttribute("pigment",new THREE.BufferAttribute(pigment,1));
      this.cache.set(key,m);

    }
    return m;
  }
  logo(kit: TeamKit) {
    const key = kit.logo ?? "";
    if (!this.logos.has(key)) {
      this.logos.set(key, null);
      if (kit.logo && this.logoFor) void this.logoFor(kit).then((img) => this.logos.set(key, img));
    }
    return this.logos.get(key) ?? null;
  }
  skater(kit: TeamKit) {
    return new SkinnedRig(this, kit, "skater");
  }
  goalie(kit: TeamKit) {
    return new SkinnedRig(this, kit, "goalie");
  }
  official(kind: "referee" | "linesman") {
    return new SkinnedRig(this, { jersey: "#f4f4f4", trim: kind === "referee" ? "#ff6a13" : "#14181f", pants: "#14181f", helmet: "#14181f", socks: "#14181f" }, kind);
  }
  coach(teamColour: string, suit = "#1d2633") {
    return new SkinnedRig(this, { jersey: suit, trim: teamColour, pants: suit, helmet: suit, socks: suit }, "coach");
  }
  dispose() {
    this.cache.forEach(model => model.dispose());
    this.released = true;
    if (this.equipment) Object.values(this.equipment).flat().forEach(p => p.geometry.dispose());
    this.textures.forEach(t => t.dispose());
    this.shared.forEach(m => {
      if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose();
      m.dispose();
    });
    this.cache.clear();
    this.shared.clear();
    this.primitive.dispose();
  }
}

/** Secondary motion of a jersey flap: damped spring driven by speed. */
class Flap {
  a = 0;
  v = 0;
  step(target: number, dt: number) {
    const k = 60, d = 9;
    this.v += (k * (target - this.a) - d * this.v) * dt;
    this.a += this.v * dt;
    return this.a;
  }
}

export class SkinnedRig implements RigLike {
  readonly driver: HockeyRig;
  readonly root: THREE.Group;
  private skeleton?: THREE.Skeleton;
  private bones: THREE.Bone[] = [];
  private lod = new THREE.LOD();
  private body?: Built;
  private look?: Appearance;
  private meshes: THREE.SkinnedMesh[] = [];
  private materials: THREE.Material[] = [];
  private jerseyTex?: THREE.CanvasTexture;
  private identity = "";
  private ok = false;
  private flaps = { jerseyF: new Flap(), jerseyB: new Flap(), jerseyL: new Flap(), jerseyR: new Flap() };
  private clock = 0;
  private logoDrawn = false;
  private idInfo?: { name: string; number: number };
  constructor(
    private factory: SkinnedRigFactory,
    private kit: TeamKit,
    readonly role: RigRole,
  ) {
    const f = factory.primitive;
    this.driver =
      role === "goalie" ? f.goalie(kit)
      : role === "skater" ? f.skater(kit)
      : role === "coach" ? f.coach(kit.trim, kit.jersey)
      : f.official(role as "referee" | "linesman");
    this.root = this.driver.root;
    this.root.add(this.lod);
    this.lod.autoUpdate = true;
    for (let i = 0; i < BONES.length; i++) {
      const bone = new THREE.Bone();
      bone.name = BONES[i];
      bone.matrixAutoUpdate = false;
      this.bones.push(bone);
    }
  }
  get currentState() {
    return this.driver.currentState;
  }
  get motion() {
    const s = this.driver.skeletonSource();
    return { stopping: s.stopping, speed: s.speed, x: this.driver.x, z: this.driver.z, yaw: s.yaw };
  }
  setIdentity(id: RigIdentity, pos: string) {
    this.driver.setIdentity(id, pos);
    if (this.identity === id.id) return;
    this.identity = id.id;
    this.idInfo = { name: id.name, number: id.number };
    try {
      this.rebuild(id, pos);
      this.ok = true;
      this.driver.hidePrimitives();
    } catch (error) {
      // Keep the primitive figure if the skinned model cannot be built.
      this.ok = false;
      this.lod.visible = false;
      console.warn("Skinned rig fallback", error);
    }
  }
  private rebuild(id: RigIdentity, pos: string) {
    const look = appearanceFor(id.id, this.role, pos);
    this.look = look;
    const model = this.body = this.factory.model(this.role, look);
    // Skeleton: bones parented flat under the rig root; matrices are written
    // every frame from the pose solver.
    this.meshes.forEach((m) => this.lod.remove(m));
    this.bones.forEach((bone) => bone.parent?.remove(bone));
    const holder = new THREE.Group();
    holder.name = "skeleton";
    this.bones.forEach((bone, i) => {
      bone.matrix.copy(model.bind[i]);
      holder.add(bone);
    });
    this.root.children.filter((c) => c.name === "skeleton").forEach((c) => this.root.remove(c));
    this.root.add(holder);
    const inverses = model.bind.map((m) => m.clone().invert());
    this.skeleton?.dispose();
    this.skeleton = new THREE.Skeleton(this.bones, inverses);
    // Only the jersey material is per player; the rest are shared.
    this.materials.forEach((m) => m.dispose());
    this.jerseyTex?.dispose();
    this.logoDrawn = !!this.factory.logo(this.kit);
    this.jerseyTex = jerseyTexture(this.kit, id.name, id.number, this.role, this.factory.logo(this.kit));
    const skinMat = this.factory.mat(`skin${look.skin}`, () => new THREE.MeshStandardMaterial({ color: SKIN_TONES[look.skin], vertexColors: true, roughness: 0.62 }));
    const hairMat = this.factory.mat(`hair${look.hairColor}`, () => new THREE.MeshStandardMaterial({ color: HAIR_COLORS[look.hairColor], roughness: 0.85, side: THREE.DoubleSide }));
    const k = this.kit;
    const std = (key: string, color: string, roughness = 0.75, extra: THREE.MeshStandardMaterialParameters = {}) =>
      this.factory.mat(`${key}${color}${roughness}`, () => new THREE.MeshStandardMaterial({ color, roughness, ...extra }));
    const jersey = new THREE.MeshStandardMaterial({ map: this.jerseyTex, normalMap: this.factory.knit(new URL("../assets/jersey-knit-normal.png", import.meta.url).href), normalScale: new THREE.Vector2(.26,.26), roughnessMap: this.factory.knit(new URL("../assets/jersey-knit-roughness.png", import.meta.url).href), roughness: .95, side: THREE.DoubleSide });
    const mats: Record<MatKey, THREE.Material> = {
      jersey,
      pants: this.role === "skater" || this.role === "goalie"
        ? this.factory.mat(`pants-panels:${k.pants}:${k.jersey}:${k.trim}`, () =>
          new THREE.MeshStandardMaterial({map: pantsTexture(k), roughness: .87}))
        : std("pants", k.pants, .8),
      socks: this.factory.mat(`socks${k.socks}${k.trim}`, () => new THREE.MeshStandardMaterial({ map: socksTexture(k), roughness: 0.9 })),
      skin: skinMat,
      helmet: std("helmet", k.helmet, 0.28, { metalness: 0.05 }),
      glove: std("glove", k.pants === "#10161e" ? k.jersey : k.pants, 0.7, {side:THREE.DoubleSide}),
      boot: std("boot", "#15181d", 0.45),
      steel: std("steel", "#c9d3da", 0.2, { metalness: 0.85 }),
      stick: std("stick", "#1b1c20", 0.42),
      tape: std("tape", "#f2f2f2", 0.9),
      visor: this.factory.mat("visor", () => new THREE.MeshStandardMaterial({ color: "#d8eef8", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide })),
      eyeWhite: std("eyeW", "#f1eee8", 0.4),
      iris: std("iris", "#2b1d14", 0.3),
      lips: std("lips", "#9a5a50", 0.6),
      hair: hairMat,
      beard: this.factory.mat(`beard${look.hairColor}${look.skin}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(HAIR_COLORS[look.hairColor]).lerp(new THREE.Color(SKIN_TONES[look.skin]), 0.35), roughness: 1 })),
      trim: std("trim", k.trim, 0.75),
      pad: std("pad", "#eef1f3", 0.6),
      mask: this.factory.mat(`mask${k.jersey}${k.trim}`, () => new THREE.MeshStandardMaterial({ map: maskTexture(k), roughness: 0.3, metalness: 0.1 })),
      cage: std("cage", "#d0d6db", 0.3, { metalness: 0.8 }),
      shirt: std("shirt", "#f3f5f7", 0.7),
      shoe: std("shoe", "#0d0f12", 0.35),
    };
    // At arena distance the small equipment highlights are subpixel. Keep the
    // jersey atlas and team colours in one opaque draw for the whole player.
    const palette = MAT_ORDER.map(key => (mats[key] as THREE.MeshStandardMaterial).color.clone());
    palette[MAT_ORDER.indexOf("pants")].set(k.pants);
    palette[MAT_ORDER.indexOf("socks")].set(k.socks);
    palette[MAT_ORDER.indexOf("mask")].set(k.helmet);
    const distant = new THREE.MeshStandardMaterial({map:this.jerseyTex,roughness:.78});
    distant.onBeforeCompile = shader => {
      shader.uniforms.kitPigments = {value:palette};
      shader.vertexShader = "attribute float pigment; varying float vPigment;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvPigment = pigment;");
      shader.fragmentShader = `uniform vec3 kitPigments[${palette.length}]; varying float vPigment;\n`+shader.fragmentShader.replace("#include <map_fragment>","#include <map_fragment>\nif(vPigment > 0.5) diffuseColor.rgb = kitPigments[int(vPigment+0.5)];");
    };
    this.materials = [jersey,distant];
    const list = MAT_ORDER.map((m) => mats[m]);
    this.meshes = [model.lo, model.lo, model.lo].map((geo, i) => {
      const mesh = new THREE.SkinnedMesh(geo, i === 2 ? distant : list);
      // Bounds are in the moving player's frame and include the raised stick.
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,1,0),2.85);
      mesh.castShadow = this.role !== "coach";
      mesh.receiveShadow = true;
      mesh.bind(this.skeleton!, new THREE.Matrix4());
      return mesh;
    });
    this.lod.levels.length = 0;
    this.lod.clear();
    this.lod.addLevel(this.meshes[0], 0);
    this.lod.addLevel(this.meshes[1], 12, .12);
    this.lod.addLevel(this.meshes[2], 35, .12);
    this.lod.visible = true;
    this.meshes[0].visible = false;
    this.meshes[1].visible = false;
  }
  setState(state: RigState, variant?: number, side?: number) {
    this.driver.setState(state, variant, side);
  }
  trigger(kind: RigActionKind, toward?: { x: number; z: number }, height?: number) {
    this.driver.trigger(kind, toward, height);
  }
  setVisible(v: boolean) {
    this.driver.setVisible(v);
  }
  place(x: number, z: number, yaw: number) {
    this.driver.place(x, z, yaw);
  }
  update(dt: number, animDt: number, inp: RigInput) {
    this.driver.update(dt, animDt, inp);
    if (!this.ok || !this.root.visible) return;
    if (this.body && this.look) {
      if (this.meshes[0].visible) this.meshes[0].geometry = this.factory.equipped(this.body,this.role,this.look,2);
      else if (this.meshes[1].visible) this.meshes[1].geometry = this.factory.equipped(this.body,this.role,this.look,1);
    }
    this.clock += animDt;
    // Late logo: redraw the jersey once the crest image has loaded.
    if (!this.logoDrawn && this.factory.logo(this.kit) && this.idInfo && this.jerseyTex) {
      this.logoDrawn = true;
      const fresh = jerseyTexture(this.kit, this.idInfo.name, this.idInfo.number, this.role, this.factory.logo(this.kit));
      for (const mat of this.materials) (mat as THREE.MeshStandardMaterial).map = fresh;
      this.jerseyTex.dispose();
      this.jerseyTex = fresh;
    }
    this.retarget(animDt);
  }
  /** Copies the solver's joints onto the skeleton (all in rig-root space). */
  private retarget(animDt: number) {
    const src = this.driver.skeletonSource();
    this.root.updateMatrixWorld(true);
    const inv = _rootInv.copy(this.root.matrixWorld).invert();
    const local = (o: THREE.Object3D, out: THREE.Matrix4) => out.multiplyMatrices(inv, o.matrixWorld);
    const M = this.bones.map((b) => b.matrix);
    local(src.pelvis, M[B.pelvis]);
    local(src.spine, _spine);
    local(src.head, M[B.head]);
    _spine.decompose(_ps, _qs, _ss);
    M[B.pelvis].decompose(_pp, _qp, _sp);
    M[B.head].decompose(_ph, _qh, _sh);
    for (const [name, t] of [["spine1", 0.35], ["spine2", 0.7], ["spine3", 1]] as const)
      M[B[name]].compose(_ps, _q2.copy(_qp).slerp(_qs, t), _ss);
    // Neck between the shoulders and the head.
    _v.set(0, NECK_Y, 0).applyMatrix4(_spine);
    M[B.neck].compose(_v, _q2.copy(_qs).slerp(_qh, 0.5), _ss);
    for (const [side, s] of [["L", 1], ["R", -1]] as const) {
      _v.set(s * CLAV_X, SHOULDER_Y - 0.02, 0).applyMatrix4(_spine);
      M[B[`clav${side}`]].compose(_v, _qs, _ss);
      // Legs: hips[0] is the right leg (s = -1), hips[1] the left.
      const i = s > 0 ? 1 : 0;
      local(src.hips[i], M[B[`thigh${side}`]]);
      local(src.knees[i], M[B[`shin${side}`]]);
      local(src.ankles[i], M[B[`foot${side}`]]);
      _toe.makeTranslation(0, -0.06, 0.13);
      M[B[`toe${side}`]].multiplyMatrices(M[B[`foot${side}`]], _toe);
    }
    // Arms: the solver positions capsules between shoulder, elbow and hand.
    const fwd = _fwd.set(0, 0, 1).transformDirection(_spine);
    for (const [i,arm] of src.arms.entries()) {
      const upper = arm.upper;
      const lenU = upper.scale.y;
      _dir.set(0, 1, 0).applyQuaternion(upper.quaternion);
      const shoulder = _sh0.copy(upper.position).addScaledVector(_dir, -lenU / 2).applyMatrix4(_spine);
      const elbow = _el0.copy(upper.position).addScaledVector(_dir, lenU / 2).applyMatrix4(_spine);
      const hand = _hd0.copy(arm.hand.position).applyMatrix4(_spine);
      // The grip hand stays on its anatomical side when the elbows cross.
      const sName = (i === 0 ? -this.driver.hs : this.driver.hs) > 0 ? "L" : "R";
      const w = (_ss.x + _ss.z) / 2;
      frameFrom(shoulder, _d1.subVectors(elbow, shoulder), fwd, M[B[`upper${sName}` as BoneName]], _s.set(w, elbow.distanceTo(shoulder) / UPPER, w));
      frameFrom(elbow, _d1.subVectors(hand, elbow), fwd, M[B[`fore${sName}` as BoneName]], _s.set(w, hand.distanceTo(elbow) / FORE, w));
      frameFrom(hand, _d1.subVectors(hand, elbow), fwd, M[B[`hand${sName}` as BoneName]], _s.set(w, w, w));
    }
    // Stick: heel at the blade, shaft up toward the grip, blade forward.
    if (src.shaft) {
      _dir.set(0, 1, 0).applyQuaternion(src.shaft.quaternion).negate();
      local(src.blade,M[B.blade]);
      frameFrom(src.blade.position, _dir, _fwd.set(0, 0, 1), M[B.stick]);
    }
    // Jersey hem flutters back with speed and sways with the stride.
    const speed = src.speed;
    const dt = Math.min(0.05, animDt);
    const sway = Math.sin(this.clock * 9) * Math.min(1, speed / 6);
    const flap = {
      jerseyF: this.flaps.jerseyF.step(-0.05 - speed * 0.018 + sway * 0.04, dt),
      jerseyB: this.flaps.jerseyB.step(0.08 + speed * 0.035 + sway * 0.05, dt),
      jerseyL: this.flaps.jerseyL.step(sway * 0.08, dt),
      jerseyR: this.flaps.jerseyR.step(-sway * 0.08, dt),
    };
    const spine1 = M[B.spine1];
    spine1.decompose(_pp, _qp, _sp);
    for (const [name, o] of Object.entries(HEM_OFFSETS) as [keyof typeof HEM_OFFSETS, [number, number, number]][]) {
      _v.set(o[0], o[1], o[2]).applyMatrix4(spine1);
      const axis = name === "jerseyF" || name === "jerseyB" ? _ax.set(1, 0, 0) : _ax.set(0, 0, 1);
      const sign = name === "jerseyF" ? 1 : name === "jerseyB" ? -1 : name === "jerseyL" ? -1 : 1;
      _q2.setFromAxisAngle(axis, flap[name] * sign);
      M[B[name]].compose(_v, _q.copy(_qp).multiply(_q2), _sp);
    }
    for (const bone of this.bones) {
      bone.matrixWorld.multiplyMatrices(this.root.matrixWorld, bone.matrix);
      bone.matrixWorldNeedsUpdate = true;
    }
  }
  dispose() {
    this.driver.dispose();
    this.jerseyTex?.dispose();
    this.materials.forEach((m) => m.dispose());
    this.skeleton?.dispose();
  }
}

const _rootInv = new THREE.Matrix4();
const _spine = new THREE.Matrix4();
const _toe = new THREE.Matrix4();
const _pp = new THREE.Vector3(), _ps = new THREE.Vector3(), _ph = new THREE.Vector3();
const _qp = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qh = new THREE.Quaternion();
const _sp = new THREE.Vector3(), _ss = new THREE.Vector3(), _sh = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _dir = new THREE.Vector3(), _d1 = new THREE.Vector3(), _ax = new THREE.Vector3();
const _sh0 = new THREE.Vector3(), _el0 = new THREE.Vector3(), _hd0 = new THREE.Vector3();
void _m;
