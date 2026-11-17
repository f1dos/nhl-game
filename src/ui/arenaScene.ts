import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Team } from "../engine/types";
import { BENCH, PENALTY_BOX } from "../engine/rink";

/**
 * The arena around the rink: rounded boards with sponsor panels (fictional
 * brands), glass and stanchions, painted ice, nets, benches and penalty boxes,
 * a two-tier bowl with a crowd, a centre-hung scoreboard with the live score,
 * rafters, banners and lighting. Static parts are merged into a handful of
 * meshes so the whole bowl costs only a few draw calls.
 */
export interface ArenaReactions {
  /** +1 / -1: goal light of that end is on; 0: off. */
  goalSide: number;
  /** The home crowd is on its feet. */
  homeScored: boolean;
  /** Live scoreboard text. */
  score?: { home: number; away: number; clock: string; period: string };
}

const HALF_X = 30.5,
  HALF_Z = 13.2,
  CORNER = 8.5;
const SPONSORS = [
  { name: "NORTHLIGHT", sub: "ENERGY", bg: "#0f2f57", fg: "#ffffff", accent: "#5fc2ff" },
  { name: "POLAR AIR", sub: "AIRLINES", bg: "#ffffff", fg: "#12305a", accent: "#e23b3b" },
  { name: "SUMMIT", sub: "BANK", bg: "#1b4d2e", fg: "#ffffff", accent: "#ffd34d" },
  { name: "ICEWAVE", sub: "MOBILE", bg: "#ff6a13", fg: "#ffffff", accent: "#1d1d1d" },
  { name: "TIMBERLINE", sub: "TRUCKS", bg: "#2a2a2a", fg: "#f5c518", accent: "#ffffff" },
  { name: "GLACIER", sub: "WATER", bg: "#e8f6ff", fg: "#0a5c8a", accent: "#00a3e0" },
];

/** Points around a rounded rectangle, offset `out` metres from the boards. */
function ringPath(out: number, step = 2.2) {
  const hx = HALF_X + out,
    hz = HALF_Z + out,
    r = CORNER + out;
  const pts: THREE.Vector2[] = [];
  const corners = [
    [hx - r, hz - r, 0],
    [-(hx - r), hz - r, Math.PI / 2],
    [-(hx - r), -(hz - r), Math.PI],
    [hx - r, -(hz - r), (3 * Math.PI) / 2],
  ];
  corners.forEach(([cx, cz, a0], i) => {
    const arcSteps = Math.max(4, Math.round((r * Math.PI) / 2 / Math.min(step, 1.6)));
    for (let k = 0; k <= arcSteps; k++) {
      const a = a0 + (k / arcSteps) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
    // Straight run to the next corner.
    const next = corners[(i + 1) % 4];
    const end = new THREE.Vector2(next[0] + Math.cos(next[2]) * r, next[1] + Math.sin(next[2]) * r);
    const start = pts[pts.length - 1].clone();
    const n = Math.max(1, Math.round(start.distanceTo(end) / step));
    for (let k = 1; k < n; k++) pts.push(start.clone().lerp(end, k / n));
  });
  return pts;
}

function roundedRectShape(hx: number, hz: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hz);
  s.lineTo(hx - r, -hz);
  s.absarc(hx - r, -hz + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hx, hz - r);
  s.absarc(hx - r, hz - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hx + r, hz);
  s.absarc(-hx + r, hz - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hx, -hz + r);
  s.absarc(-hx + r, -hz + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Keeps a rendered position inside the rounded boards (visual only). */
export function insideBoards(x: number, z: number, margin = 0.7) {
  const cx = HALF_X - CORNER,
    cz = HALF_Z - CORNER;
  if (Math.abs(x) <= cx || Math.abs(z) <= cz) return { x, z };
  const ox = Math.sign(x) * cx,
    oz = Math.sign(z) * cz;
  const dx = x - ox,
    dz = z - oz,
    d = Math.hypot(dx, dz),
    max = CORNER - margin;
  return d <= max ? { x, z } : { x: ox + (dx / d) * max, z: oz + (dz / d) * max };
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, canvas, ctx };
}

/** Painted ice: lines, circles, dots, creases, trapezoids and the centre logo. */
function iceTexture(home: Team) {
  const W = 2440,
    H = 1056;
  const sx = W / (HALF_X * 2),
    sz = H / (HALF_Z * 2);
  const X = (x: number) => (x + HALF_X) * sx,
    Z = (z: number) => (z + HALF_Z) * sz;
  return canvasTexture(W, H, (c) => {
    c.fillStyle = "#eef6f8";
    c.fillRect(0, 0, W, H);
    // Subtle skate marks.
    c.strokeStyle = "rgba(160,190,205,0.10)";
    for (let i = 0; i < 260; i++) {
      c.lineWidth = 1 + (i % 3);
      c.beginPath();
      const x = (i * 97) % W,
        y = (i * 53) % H;
      c.moveTo(x, y);
      c.bezierCurveTo(x + 60, y + 20, x + 120, y - 30, x + 200, y + 10);
      c.stroke();
    }
    const line = (x: number, color: string, width: number, dashed = false) => {
      c.fillStyle = color;
      c.fillRect(X(x) - (width * sx) / 2, 0, width * sx, H);
      if (dashed) {
        c.fillStyle = "#eef6f8";
        for (let y = 0; y < H; y += 40) c.fillRect(X(x) - 2, y + 26, 4, 10);
      }
    };
    line(0, "#c8102e", 0.3, true);
    line(-7.6, "#1f5fbf", 0.3);
    line(7.6, "#1f5fbf", 0.3);
    line(-26.9, "#c8102e", 0.06);
    line(26.9, "#c8102e", 0.06);
    const ring = (x: number, z: number, r: number, color: string, width = 0.06) => {
      c.strokeStyle = color;
      c.lineWidth = width * sx;
      c.beginPath();
      c.ellipse(X(x), Z(z), r * sx, r * sz, 0, 0, Math.PI * 2);
      c.stroke();
    };
    const dot = (x: number, z: number, r: number, color: string) => {
      c.fillStyle = color;
      c.beginPath();
      c.ellipse(X(x), Z(z), r * sx, r * sz, 0, 0, Math.PI * 2);
      c.fill();
    };
    ring(0, 0, 4.57, "#1f5fbf");
    dot(0, 0, 0.16, "#1f5fbf");
    for (const x of [-20.5, 20.5])
      for (const z of [-6.7, 6.7]) {
        ring(x, z, 4.57, "#c8102e");
        dot(x, z, 0.3, "#c8102e");
        c.fillStyle = "#c8102e";
        for (const side of [-1, 1])
          for (const dx of [-0.85, 0.85]) c.fillRect(X(x + dx) - 2, Z(z + side * 4.57) - (side > 0 ? 0 : 0.6 * sz), 4, 0.6 * sz);
      }
    for (const x of [-6.1, 6.1]) for (const z of [-6.7, 6.7]) dot(x, z, 0.3, "#c8102e");
    // Creases and trapezoids.
    for (const side of [-1, 1]) {
      c.fillStyle = "rgba(90,160,230,0.55)";
      c.beginPath();
      c.ellipse(X(side * 26.9), Z(0), 1.83 * sx, 1.83 * sz, 0, side > 0 ? Math.PI / 2 : -Math.PI / 2, side > 0 ? (Math.PI * 3) / 2 : Math.PI / 2);
      c.fill();
      c.strokeStyle = "#c8102e";
      c.lineWidth = 0.05 * sx;
      c.beginPath();
      c.moveTo(X(side * 26.9), Z(-3.3));
      c.lineTo(X(side * HALF_X), Z(-4.4));
      c.moveTo(X(side * 26.9), Z(3.3));
      c.lineTo(X(side * HALF_X), Z(4.4));
      c.stroke();
    }
    // Centre-ice logo in the home club's colours.
    const cx = X(0),
      cy = Z(0),
      r = 2.9 * sx;
    c.fillStyle = home.color;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#ffffff";
    c.lineWidth = 10;
    c.beginPath();
    c.arc(cx, cy, r - 14, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#ffffff";
    c.font = `900 ${Math.round(r * 0.75)}px system-ui, Arial, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(home.id, cx, cy + 4);
    c.font = `800 ${Math.round(r * 0.2)}px system-ui, Arial, sans-serif`;
    c.fillText(home.name.toUpperCase(), cx, cy + r * 0.62);
    // Home name in both neutral zones.
    c.fillStyle = "rgba(20,40,70,0.18)";
    c.font = `900 ${Math.round(1.6 * sx)}px system-ui, Arial, sans-serif`;
    for (const x of [-14.5, 14.5]) {
      c.save();
      c.translate(X(x), Z(0));
      c.rotate(x < 0 ? Math.PI / 2 : -Math.PI / 2);
      c.fillText(home.city.toUpperCase(), 0, 0);
      c.restore();
    }
  });
}

function sponsorTexture(s: (typeof SPONSORS)[number]) {
  return canvasTexture(512, 128, (c) => {
    c.fillStyle = s.bg;
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = s.accent;
    c.fillRect(0, 108, 512, 20);
    c.fillStyle = s.fg;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "900 64px system-ui, Arial, sans-serif";
    c.fillText(s.name, 256, 54);
    c.font = "700 20px system-ui, Arial, sans-serif";
    c.fillText(s.sub, 256, 96);
  }).tex;
}

export function buildArena(scene: THREE.Scene, home: Team, away: Team) {
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const group = new THREE.Group();
  scene.add(group);
  scene.background = new THREE.Color("#0a1019");
  scene.fog = new THREE.Fog("#0a1019", 75, 150);
  // Lighting: cool fill plus the bright overhead rig of an NHL arena.
  group.add(new THREE.HemisphereLight(0xe6f4ff, 0x1a2230, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(8, 40, 14);
  group.add(key);
  const fill = new THREE.DirectionalLight(0xbcd6ff, 0.8);
  fill.position.set(-20, 25, -20);
  group.add(fill);
  const mat = (color: string, roughness = 0.6, metalness = 0) =>
    own(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  const addMerged = (geos: THREE.BufferGeometry[], material: THREE.Material) => {
    if (!geos.length) return undefined;
    const merged = own(mergeGeometries(geos)!);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, material);
    group.add(mesh);
    return mesh;
  };
  const placed = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
    g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  };

  // --- ice
  const iceShape = roundedRectShape(HALF_X, HALF_Z, CORNER);
  const iceGeo = own(new THREE.ShapeGeometry(iceShape, 24));
  const pos = iceGeo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + HALF_X) / (HALF_X * 2);
    uv[i * 2 + 1] = (pos.getY(i) + HALF_Z) / (HALF_Z * 2);
  }
  iceGeo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const iceTex = own(iceTexture(home).tex);
  const ice = new THREE.Mesh(iceGeo, own(new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.18, metalness: 0.05 })));
  ice.rotation.x = -Math.PI / 2;
  group.add(ice);
  // Floor under everything.
  const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(220, 160)), mat("#1a222c", 0.9));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  group.add(floor);

  // --- boards, kick plate, sponsor panels, glass and stanchions
  const path = ringPath(0, 2.6);
  const boards: THREE.BufferGeometry[] = [],
    kick: THREE.BufferGeometry[] = [],
    caps: THREE.BufferGeometry[] = [],
    glass: THREE.BufferGeometry[] = [],
    posts: THREE.BufferGeometry[] = [];
  const ads: THREE.BufferGeometry[][] = SPONSORS.map(() => []);
  const benchGap = (x: number, z: number) =>
    z < 0 && BENCH.centerX.some((cx) => Math.abs(x - cx) < BENCH.halfLength - 0.3) ? "bench" : z > 0 && PENALTY_BOX.centerX.some((cx) => Math.abs(x - cx) < 1.6) ? "box" : "";
  for (let i = 0; i < path.length; i++) {
    const a = path[i],
      b = path[(i + 1) % path.length];
    const len = a.distanceTo(b);
    const mx = (a.x + b.x) / 2,
      mz = (a.y + b.y) / 2;
    const ang = -Math.atan2(b.y - a.y, b.x - a.x);
    // Outward normal of the segment.
    const nx = -(b.y - a.y) / len,
      nz = (b.x - a.x) / len;
    const sign = mx * nx + mz * nz > 0 ? 1 : -1;
    const ox = nx * sign,
      oz = nz * sign;
    boards.push(placed(new THREE.BoxGeometry(len + 0.02, 1.07, 0.16), mx + ox * 0.08, 0.535, mz + oz * 0.08, ang));
    kick.push(placed(new THREE.BoxGeometry(len + 0.02, 0.2, 0.172), mx + ox * 0.08, 0.1, mz + oz * 0.08, ang));
    caps.push(placed(new THREE.BoxGeometry(len + 0.02, 0.06, 0.26), mx + ox * 0.1, 1.08, mz + oz * 0.1, ang));
    const ad = new THREE.PlaneGeometry(len * 0.96, 0.6);
    // Face the ice: plane normal +z rotated to point inward.
    ad.rotateY(Math.atan2(-ox, -oz));
    ad.translate(mx - ox * 0.006, 0.55, mz - oz * 0.006);
    ads[i % SPONSORS.length].push(ad);
    const gap = benchGap(mx, mz);
    const behindNet = Math.abs(mx) > 22;
    const gh = gap === "bench" ? 0.0 : behindNet ? 2.4 : 1.65;
    if (gh > 0) {
      glass.push(placed(new THREE.BoxGeometry(len - 0.04, gh, 0.03), mx + ox * 0.1, 1.1 + gh / 2, mz + oz * 0.1, ang));
      posts.push(placed(new THREE.BoxGeometry(0.035, gh, 0.05), a.x + ox * 0.1, 1.1 + gh / 2, a.y + oz * 0.1));
    }
  }
  addMerged(boards, mat("#f4f6f8", 0.45));
  addMerged(kick, mat("#e0b13a", 0.5));
  addMerged(caps, mat("#c9d3da", 0.4));
  addMerged(posts, own(new THREE.MeshStandardMaterial({ color: "#d5dde3", roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.55 })));
  const glassMesh = addMerged(glass, own(new THREE.MeshStandardMaterial({ color: "#cfe9f5", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false })));
  if (glassMesh) glassMesh.renderOrder = 2;
  SPONSORS.forEach((s, i) => {
    const tex = own(sponsorTexture(s));
    addMerged(ads[i], own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 })));
  });

  // --- nets: red pipes, white mesh, base frame
  const lights: THREE.MeshStandardMaterial[] = [];
  const netMat = own(new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, wireframe: true }));
  const pipeMat = mat("#d11f2a", 0.35, 0.3);
  for (const side of [-1, 1]) {
    const gx = side * 26.9;
    const net = new THREE.Group();
    net.position.set(gx, 0, 0);
    net.rotation.y = side > 0 ? 0 : Math.PI;
    for (const z of [-0.915, 0.915]) {
      const post = new THREE.Mesh(own(new THREE.CylinderGeometry(0.04, 0.04, 1.22, 10)), pipeMat);
      post.position.set(0, 0.61, z);
      net.add(post);
    }
    const bar = new THREE.Mesh(own(new THREE.CylinderGeometry(0.04, 0.04, 1.83, 10)), pipeMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0, 1.22, 0);
    net.add(bar);
    const back = new THREE.Mesh(own(new THREE.CylinderGeometry(0.95, 0.95, 1.18, 14, 4, true, -Math.PI / 2, Math.PI)), netMat);
    back.scale.set(1.05, 1, 1);
    back.position.set(0.05, 0.6, 0);
    back.rotation.y = 0;
    net.add(back);
    const roof = new THREE.Mesh(own(new THREE.CircleGeometry(0.95, 14, -Math.PI / 2, Math.PI)), netMat);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(0.05, 1.2, 0);
    net.add(roof);
    group.add(net);
    // Goal light behind the glass.
    const housing = new THREE.Mesh(own(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 14)), mat("#1d1f24", 0.5));
    housing.position.set(side * (HALF_X + 0.5), 3.62, 0);
    group.add(housing);
    const lamp = new THREE.Mesh(own(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), mat("#5a1414", 0.4));
    lamp.position.set(side * (HALF_X + 0.5), 3.7, 0);
    lights.push(lamp.material as THREE.MeshStandardMaterial);
    group.add(lamp);
  }

  // --- benches and penalty boxes behind the boards
  const benchMats = [mat(home.color, 0.7), mat(away.color, 0.7)];
  BENCH.centerX.forEach((cx, side) => {
    const len = BENCH.halfLength * 2;
    const deck = new THREE.Mesh(own(new THREE.BoxGeometry(len + 0.6, 0.1, 3.4)), mat("#2b3138", 0.8));
    deck.position.set(cx, 0.05, BENCH.seatZ - 0.55);
    group.add(deck);
    const seat = new THREE.Mesh(own(new THREE.BoxGeometry(len, 0.08, 0.42)), mat("#d7dde2", 0.5));
    seat.position.set(cx, BENCH.seatY - 0.04, BENCH.seatZ - 0.05);
    group.add(seat);
    const riser = new THREE.Mesh(own(new THREE.BoxGeometry(len, BENCH.seatY - 0.1, 0.4)), mat("#39424b", 0.7));
    riser.position.set(cx, (BENCH.seatY - 0.1) / 2 + 0.05, BENCH.seatZ - 0.05);
    group.add(riser);
    const step = new THREE.Mesh(own(new THREE.BoxGeometry(len + 0.6, 0.25, 1.2)), mat("#2f363e", 0.8));
    step.position.set(cx, 0.125, BENCH.seatZ - 1.35);
    group.add(step);
    const wall = new THREE.Mesh(own(new THREE.BoxGeometry(len + 0.6, 1.3, 0.12)), benchMats[side]);
    wall.position.set(cx, 0.65, BENCH.seatZ - 2.05);
    group.add(wall);
  });
  PENALTY_BOX.centerX.forEach((cx) => {
    const box = new THREE.Mesh(own(new THREE.BoxGeometry(2.8, 0.1, 2.2)), mat("#2b3138", 0.8));
    box.position.set(cx, 0.05, PENALTY_BOX.seatZ + 0.35);
    group.add(box);
    const seat = new THREE.Mesh(own(new THREE.BoxGeometry(2.4, BENCH.seatY, 0.45)), mat("#3d464f", 0.7));
    seat.position.set(cx, BENCH.seatY / 2, PENALTY_BOX.seatZ + 0.1);
    group.add(seat);
    const glassBox = new THREE.Mesh(own(new THREE.BoxGeometry(2.8, 1.6, 2.2)), own(new THREE.MeshStandardMaterial({ color: "#cfe9f5", transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.05 })));
    glassBox.position.set(cx, 1.9, PENALTY_BOX.seatZ + 0.35);
    group.add(glassBox);
  });

  // --- two-tier bowl with a crowd
  const risers: THREE.BufferGeometry[] = [],
    walls: THREE.BufferGeometry[] = [];
  const seats: { x: number; y: number; z: number; ry: number }[] = [];
  const tier = (rows: number, startOut: number, startY: number, rise: number, depth: number) => {
    for (let r = 0; r < rows; r++) {
      const out = startOut + r * depth,
        y = startY + r * rise;
      const ring = ringPath(out, 2.4);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        const len = a.distanceTo(b);
        const mx = (a.x + b.x) / 2,
          mz = (a.y + b.y) / 2;
        // Leave the bench side's lowest rows clear for benches and staff.
        if (mz < 0 && Math.abs(mx) < 17 && out < 5.8) continue;
        if (mz > 0 && Math.abs(mx) < 6 && out < 4.2) continue;
        const ang = -Math.atan2(b.y - a.y, b.x - a.x);
        risers.push(placed(new THREE.BoxGeometry(len + 0.05, 0.42, depth), mx, y - 0.21, mz, ang));
        const count = Math.max(1, Math.floor(len / 0.62));
        const nx = -(b.y - a.y) / len,
          nz = (b.x - a.x) / len;
        const sign = mx * nx + mz * nz > 0 ? 1 : -1;
        for (let k = 0; k < count; k++) {
          const t = (k + 0.5) / count;
          seats.push({ x: a.x + (b.x - a.x) * t, y, z: a.y + (b.y - a.y) * t, ry: Math.atan2(-nx * sign, -nz * sign) });
        }
      }
    }
  };
  tier(12, 2.6, 0.9, 0.42, 0.88);
  // Club-level fascia between the tiers, then the steeper upper deck.
  for (const p of ringPath(2.6 + 12 * 0.88 + 0.6, 3)) void p;
  {
    const ring = ringPath(2.6 + 12 * 0.88 + 0.3, 2.6);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const len = a.distanceTo(b);
      walls.push(placed(new THREE.BoxGeometry(len + 0.05, 2.4, 0.3), (a.x + b.x) / 2, 0.9 + 12 * 0.42 + 1.2, (a.y + b.y) / 2, -Math.atan2(b.y - a.y, b.x - a.x)));
    }
  }
  tier(10, 2.6 + 12 * 0.88 + 1.2, 0.9 + 12 * 0.42 + 2.6, 0.62, 0.9);
  addMerged(risers, mat("#27323e", 0.85));
  addMerged(walls, mat(home.color, 0.6));
  const fanBody = new THREE.InstancedMesh(own(new THREE.CapsuleGeometry(0.2, 0.42, 2, 6)), mat("#ffffff", 0.95), seats.length);
  const fanHead = new THREE.InstancedMesh(own(new THREE.SphereGeometry(0.13, 8, 6)), mat("#ffffff", 0.8), seats.length);
  const skin = ["#f2cfae", "#e6b690", "#d09a72", "#a76d48", "#6b4430"].map((c) => new THREE.Color(c));
  const homeColor = new THREE.Color(home.color),
    awayColor = new THREE.Color(away.color);
  const neutral = ["#e9eef3", "#2b3a4a", "#55697e", "#1d1d1d", "#8a98a6"].map((c) => new THREE.Color(c));
  const homeFan: boolean[] = [];
  const dummy = new THREE.Object3D();
  const rand = (i: number) => {
    const x = Math.sin(i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  seats.forEach((s, i) => {
    const r = rand(i);
    const empty = rand(i + 7) < 0.04;
    dummy.position.set(s.x, empty ? -50 : s.y + 0.42, s.z);
    dummy.rotation.set(0, s.ry, 0);
    dummy.scale.setScalar(0.92 + rand(i + 3) * 0.16);
    dummy.updateMatrix();
    fanBody.setMatrixAt(i, dummy.matrix);
    dummy.position.y += 0.47;
    dummy.updateMatrix();
    fanHead.setMatrixAt(i, dummy.matrix);
    const isHome = r < 0.62;
    homeFan.push(isHome);
    fanBody.setColorAt(i, isHome ? (rand(i + 11) < 0.7 ? homeColor : neutral[0]) : r < 0.7 ? awayColor : neutral[Math.floor(rand(i + 5) * neutral.length)]);
    fanHead.setColorAt(i, skin[Math.floor(rand(i + 13) * skin.length)]);
  });
  group.add(fanBody, fanHead);
  const baseBody = Array.from({ length: seats.length }, (_, i) => {
    const m = new THREE.Matrix4();
    fanBody.getMatrixAt(i, m);
    return m;
  });
  const baseHead = Array.from({ length: seats.length }, (_, i) => {
    const m = new THREE.Matrix4();
    fanHead.getMatrixAt(i, m);
    return m;
  });

  // --- rafters, catwalk lights, banners
  const roofY = 28;
  const ceiling: THREE.Object3D[] = [];
  const truss: THREE.BufferGeometry[] = [];
  for (let x = -40; x <= 40; x += 8) truss.push(placed(new THREE.BoxGeometry(0.4, 0.6, 70), x, roofY, 0));
  for (let z = -30; z <= 30; z += 10) truss.push(placed(new THREE.BoxGeometry(84, 0.4, 0.4), 0, roofY - 0.4, z));
  const trussMesh = addMerged(truss, mat("#1c242e", 0.7, 0.4));
  if (trussMesh) ceiling.push(trussMesh);
  const lightPanels: THREE.BufferGeometry[] = [];
  for (let x = -28; x <= 28; x += 7) for (const z of [-9, 0, 9]) lightPanels.push(placed(new THREE.BoxGeometry(2.2, 0.2, 1.2), x, roofY - 1, z));
  const panelMesh = addMerged(lightPanels, own(new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff6e0", emissiveIntensity: 1.6 })));
  if (panelMesh) ceiling.push(panelMesh);
  for (let i = 0; i < 4; i++) {
    const banner = canvasTexture(256, 512, (c) => {
      c.fillStyle = i % 2 ? "#ffffff" : home.color;
      c.fillRect(0, 0, 256, 512);
      c.fillStyle = i % 2 ? home.color : "#ffffff";
      c.fillRect(14, 14, 228, 484);
      c.fillStyle = i % 2 ? "#ffffff" : home.color;
      c.fillRect(24, 24, 208, 464);
      c.fillStyle = i % 2 ? home.color : "#ffffff";
      c.textAlign = "center";
      c.font = "900 92px system-ui, Arial, sans-serif";
      c.fillText(home.id, 128, 210);
      c.font = "800 26px system-ui, Arial, sans-serif";
      c.fillText(home.city.toUpperCase(), 128, 280);
    });
    own(banner.tex);
    const b = new THREE.Mesh(own(new THREE.PlaneGeometry(2.4, 4.8)), own(new THREE.MeshStandardMaterial({ map: banner.tex, side: THREE.DoubleSide, roughness: 0.9 })));
    b.position.set(-HALF_X - 6, 20, -9 + i * 6);
    b.rotation.y = Math.PI / 2;
    group.add(b);
  }

  // --- centre-hung scoreboard with the live score
  const board = new THREE.Group();
  board.position.set(0, 17.5, 0);
  group.add(board);
  ceiling.push(board);
  const frame = new THREE.Mesh(own(new THREE.BoxGeometry(7.4, 4.2, 5.4)), mat("#0e1218", 0.4, 0.5));
  board.add(frame);
  for (const y of [-2.35, 2.35]) {
    const ring = new THREE.Mesh(own(new THREE.BoxGeometry(7.6, 0.35, 5.6)), own(new THREE.MeshStandardMaterial({ color: home.color, emissive: home.color, emissiveIntensity: 0.6 })));
    ring.position.y = y;
    board.add(ring);
  }
  const screen = canvasTexture(1024, 512, () => {});
  own(screen.tex);
  const screenMat = own(new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false }));
  const faces: [number, number, number, number][] = [
    [0, 0, 2.71, 0],
    [0, 0, -2.71, Math.PI],
    [3.71, 0, 0, Math.PI / 2],
    [-3.71, 0, 0, -Math.PI / 2],
  ];
  faces.forEach(([x, y, z, ry]) => {
    const w = Math.abs(ry) === Math.PI / 2 ? 5.2 : 7.2;
    const p = new THREE.Mesh(own(new THREE.PlaneGeometry(w, 3.9)), screenMat);
    p.position.set(x, y, z);
    p.rotation.y = ry;
    board.add(p);
  });
  let lastText = "";
  const drawScore = (s: NonNullable<ArenaReactions["score"]>, goal: boolean, clock: number) => {
    const text = `${s.home}:${s.away}:${s.clock}:${s.period}:${goal ? Math.floor(clock * 3) % 2 : "-"}`;
    if (text === lastText || !screen.ctx) return;
    lastText = text;
    const c = screen.ctx;
    c.fillStyle = "#05080d";
    c.fillRect(0, 0, 1024, 512);
    if (goal && Math.floor(clock * 3) % 2) {
      c.fillStyle = "#d11f2a";
      c.fillRect(0, 0, 1024, 512);
      c.fillStyle = "#ffffff";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = "900 210px system-ui, Arial, sans-serif";
      c.fillText("GOAL!", 512, 256);
    } else {
      const team = (t: Team, x: number, score: number) => {
        c.fillStyle = t.color;
        c.fillRect(x - 210, 70, 420, 110);
        c.fillStyle = "#ffffff";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.font = "900 84px system-ui, Arial, sans-serif";
        c.fillText(t.id, x, 128);
        c.font = "900 190px system-ui, Arial, sans-serif";
        c.fillText(String(score), x, 320);
      };
      team(away, 262, s.away);
      team(home, 762, s.home);
      c.fillStyle = "#f1c958";
      c.font = "800 64px system-ui, Arial, sans-serif";
      c.fillText(s.clock, 512, 300);
      c.fillStyle = "#9fb2c4";
      c.font = "800 42px system-ui, Arial, sans-serif";
      c.fillText(s.period, 512, 380);
    }
    screen.tex.needsUpdate = true;
  };
  drawScore({ home: 0, away: 0, clock: "20:00", period: "1ST" }, false, 0);

  let clock = 0;
  let jumping = false;
  return {
    group,
    update(dt: number, r: ArenaReactions) {
      clock += dt;
      lights.forEach((m, i) => {
        const on = r.goalSide !== 0 && (i === 0 ? -1 : 1) === r.goalSide;
        m.emissive.set(on ? "#ff2a1f" : "#000000");
        m.emissiveIntensity = on ? 1.5 + 1.5 * Math.abs(Math.sin(clock * 6)) : 0;
        m.color.set(on ? "#ff4a3a" : "#5a1414");
      });
      if (r.score) drawScore(r.score, r.goalSide !== 0, clock);
      // Home fans jump when their team scores; everyone else stays seated.
      if (r.homeScored || jumping) {
        jumping = r.homeScored;
        const m = new THREE.Matrix4();
        for (let i = 0; i < seats.length; i++) {
          const jump = r.homeScored && homeFan[i] ? Math.abs(Math.sin(clock * 7 + i * 0.37)) * 0.32 : 0;
          m.copy(baseBody[i]);
          m.elements[13] += jump;
          fanBody.setMatrixAt(i, m);
          m.copy(baseHead[i]);
          m.elements[13] += jump;
          fanHead.setMatrixAt(i, m);
        }
        fanBody.instanceMatrix.needsUpdate = true;
        fanHead.instanceMatrix.needsUpdate = true;
      }
    },
    /** Hide the rafters and scoreboard for cameras that look down from above them. */
    setCeilingVisible(visible: boolean) {
      ceiling.forEach((o) => (o.visible = visible));
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      scene.remove(group);
    },
  };
}
