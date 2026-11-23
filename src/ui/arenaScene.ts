import * as THREE from "three";
import { arenaPreset } from "./arenaFx";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Team } from "../engine/types";
import { BENCH, PENALTY_BOX, RINK } from "../engine/rink";

/**
 * The arena around the rink: rounded boards with sponsor panels (fictional
 * brands), glass and stanchions, painted ice, nets, benches and penalty boxes,
 * a two-tier bowl with a crowd, a centre-hung scoreboard with the live score,
 * rafters, banners and lighting. Static parts are merged into a handful of
 * meshes so the whole bowl costs only a few draw calls.
 */
export interface ArenaReactions {
  /** Play is live (waves only happen during play). */
  playing?: boolean;
  /** A dangerous chance: the crowd rises. */
  danger?: boolean;
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

/**
 * Loads a club emblem for canvas drawing. Resolves null if it cannot be
 * loaded or would taint the canvas (no CORS), so callers keep their fallback.
 */
const logoCache = new Map<string, Promise<HTMLImageElement | null>>();
export function loadLogo(url?: string): Promise<HTMLImageElement | null> {
  if (!url || typeof Image === "undefined") return Promise.resolve(null);
  if (!logoCache.has(url))
    logoCache.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const probe = document.createElement("canvas");
            probe.width = probe.height = 4;
            const c = probe.getContext("2d");
            c?.drawImage(img, 0, 0, 4, 4);
            c?.getImageData(0, 0, 1, 1);
            resolve(img);
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      }),
    );
  return logoCache.get(url)!;
}
/** Draws an image centred in a box, keeping its aspect ratio. */
function drawContained(c: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, w: number, h: number) {
  const iw = img.naturalWidth || img.width || 1,
    ih = img.naturalHeight || img.height || 1;
  const k = Math.min(w / iw, h / ih);
  c.drawImage(img, cx - (iw * k) / 2, cy - (ih * k) / 2, iw * k, ih * k);
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
    line(-RINK.blueLine, "#1f5fbf", 0.3);
    line(RINK.blueLine, "#1f5fbf", 0.3);
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
    for (const x of [1.5 - RINK.blueLine, RINK.blueLine - 1.5]) for (const z of [-6.7, 6.7]) dot(x, z, 0.3, "#c8102e");
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

/**
 * A regulation NHL goal: red posts and crossbar (1.83 × 1.22 m), a white base
 * frame curving 1.12 m back, white padding and fine netting on the sides, back
 * and roof. Local +x points away from the ice (behind the goal line).
 */
function buildGoals(own: <T extends { dispose(): void }>(x: T) => T) {
  const W = 0.915,
    H = 1.22;
  const base = new THREE.CatmullRomCurve3(
    [
      [0, -W],
      [0.38, -1.0],
      [0.82, -0.94],
      [1.08, -0.58],
      [1.12, 0],
      [1.08, 0.58],
      [0.82, 0.94],
      [0.38, 1.0],
      [0, W],
    ].map(([x, z]) => new THREE.Vector3(x, 0.04, z)),
  );
  const top = new THREE.CatmullRomCurve3(
    [
      [0, -W],
      [0.3, -0.86],
      [0.52, -0.55],
      [0.58, 0],
      [0.52, 0.55],
      [0.3, 0.86],
      [0, W],
    ].map(([x, z]) => new THREE.Vector3(x, H, z)),
  );
  const N = 40;
  const lower = base.getSpacedPoints(N),
    upper = top.getSpacedPoints(N);
  // Netting texture: fine white mesh with transparent holes.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const c = canvas.getContext("2d");
  if (c) {
    c.clearRect(0, 0, 64, 64);
    c.strokeStyle = "rgba(255,255,255,0.95)";
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(0, 2);
    c.lineTo(64, 2);
    c.moveTo(2, 0);
    c.lineTo(2, 64);
    c.stroke();
  }
  const tex = own(new THREE.CanvasTexture(canvas));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const netMat = own(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9, color: "#ffffff" }));
  const cell = 0.085;
  // Skirt: sides and back between the top and base outlines.
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  let run = 0;
  for (let i = 0; i <= N; i++) {
    if (i) run += lower[i].distanceTo(lower[i - 1]);
    const t = upper[i],
      b2 = lower[i];
    pos.push(t.x, t.y, t.z, b2.x, b2.y + 0.02, b2.z);
    uv.push(run / cell, H / cell, run / cell, 0);
    if (i) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const skirt = own(new THREE.BufferGeometry());
  skirt.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  skirt.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  skirt.setIndex(idx);
  skirt.computeVertexNormals();
  // Roof: from the crossbar back to the top outline.
  const rp: number[] = [],
    ru: number[] = [],
    ri: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = upper[i];
    rp.push(0, H, t.z, t.x, H, t.z);
    ru.push(t.z / cell, 0, t.z / cell, t.x / cell);
    if (i) {
      const k = i * 2;
      ri.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
  const roof = own(new THREE.BufferGeometry());
  roof.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
  roof.setAttribute("uv", new THREE.Float32BufferAttribute(ru, 2));
  roof.setIndex(ri);
  roof.computeVertexNormals();
  const red = own(new THREE.MeshStandardMaterial({ color: "#d11f2a", roughness: 0.35, metalness: 0.3 }));
  const white = own(new THREE.MeshStandardMaterial({ color: "#f4f6f8", roughness: 0.5 }));
  const pad = own(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 }));
  const post = own(new THREE.CylinderGeometry(0.03, 0.03, H, 12));
  const bar = own(new THREE.CylinderGeometry(0.03, 0.03, W * 2 + 0.06, 12));
  const baseTube = own(new THREE.TubeGeometry(base, 48, 0.022, 8, false));
  const topTube = own(new THREE.TubeGeometry(top, 40, 0.016, 8, false));
  const padTube = own(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(lower.slice(3, N - 2).map((p) => new THREE.Vector3(p.x * 0.96, 0.07, p.z * 0.96))),
      40,
      0.05,
      8,
      false,
    ),
  );
  return {
    make() {
      const g = new THREE.Group();
      for (const z of [-W, W]) {
        const m = new THREE.Mesh(post, red);
        m.position.set(0, H / 2, z);
        g.add(m);
      }
      const cross = new THREE.Mesh(bar, red);
      cross.rotation.x = Math.PI / 2;
      cross.position.set(0, H, 0);
      g.add(cross);
      g.add(new THREE.Mesh(baseTube, white), new THREE.Mesh(topTube, white), new THREE.Mesh(padTube, pad));
      g.add(new THREE.Mesh(skirt, netMat), new THREE.Mesh(roof, netMat));
      return g;
    },
  };
}

export function buildArena(scene: THREE.Scene, home: Team, away: Team) {
  const preset = arenaPreset(home);
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const group = new THREE.Group();
  scene.add(group);
  scene.background = new THREE.Color("#0a1019");
  scene.fog = new THREE.Fog("#0a1019", 75, 150);
  // Lighting: cool fill plus the bright overhead rig of an NHL arena.
  group.add(new THREE.HemisphereLight(0xe6f4ff, 0x1a2230, preset.hemi));
  const key = new THREE.DirectionalLight(0xffffff, preset.key);
  key.position.set(8, 40, 14);
  group.add(key, key.target);
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
  const icePaint = iceTexture(home);
  const iceTex = own(icePaint.tex);
  let disposed = false;
  const logo = loadLogo(home.logoUrl);
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
  const goals = buildGoals(own);
  for (const side of [-1, 1]) {
    const net = goals.make();
    net.position.set(side * 26.9, 0, 0);
    net.rotation.y = side > 0 ? 0 : Math.PI;
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
  const L = preset.lowerRows;
  tier(L, 2.6, 0.9, 0.42, 0.88);
  // Club-level fascia between the tiers, then the steeper upper deck.
  const suiteGlass: THREE.BufferGeometry[] = [];
  {
    const ring = ringPath(2.6 + L * 0.88 + 0.3, 2.6);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const len = a.distanceTo(b);
      const mx = (a.x + b.x) / 2, mz = (a.y + b.y) / 2, ang = -Math.atan2(b.y - a.y, b.x - a.x);
      walls.push(placed(new THREE.BoxGeometry(len + 0.05, preset.suites ? 0.9 : 2.4, 0.3), mx, 0.9 + L * 0.42 + (preset.suites ? 0.45 : 1.2), mz, ang));
      // Luxury suites: a lit glass band between the bowls.
      if (preset.suites) suiteGlass.push(placed(new THREE.BoxGeometry(len - 0.1, 1.5, 0.1), mx, 0.9 + L * 0.42 + 1.65, mz, ang));
    }
  }
  tier(preset.upperRows, 2.6 + L * 0.88 + 1.2, 0.9 + L * 0.42 + 2.6, 0.62, 0.9);
  addMerged(suiteGlass, own(new THREE.MeshStandardMaterial({ color: "#2a3542", emissive: "#ffd9a0", emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.3 })));
  addMerged(risers, mat("#27323e", 0.85))?.layers.set(1);
  addMerged(walls, mat(home.color, 0.6))?.layers.set(1);
  const fanBody = new THREE.InstancedMesh(own(new THREE.CapsuleGeometry(0.2, 0.42, 2, 6)), mat("#ffffff", 0.95), seats.length);
  const fanHead = new THREE.InstancedMesh(own(new THREE.SphereGeometry(0.13, 8, 6)), mat("#ffffff", 0.8), seats.length);
  const skin = ["#f2cfae", "#e6b690", "#d09a72", "#a76d48", "#6b4430"].map((c) => new THREE.Color(c));
  const homeColor = new THREE.Color(home.color),
    awayColor = new THREE.Color(away.color);
  const neutral = ["#e9eef3", "#2b3a4a", "#55697e", "#1d1d1d", "#8a98a6"].map((c) => new THREE.Color(c));
  const dim = 0.35 + preset.stands * 0.75;
  homeColor.multiplyScalar(dim);
  awayColor.multiplyScalar(dim);
  neutral.forEach((c) => c.multiplyScalar(dim));
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
  // Stands live on layer 1: drawn by the main camera only, never in the
  // ice reflection or the shadow map.
  fanBody.layers.set(1);
  fanHead.layers.set(1);
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
  if (trussMesh) {
    trussMesh.layers.set(1);
    ceiling.push(trussMesh);
  }
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
    void logo.then((img) => {
      if (!img || disposed || !banner.ctx) return;
      const c = banner.ctx;
      c.fillStyle = i % 2 ? home.color : "#ffffff";
      c.fillRect(24, 24, 208, 300);
      drawContained(c, img, 128, 175, 180, 180);
      banner.tex.needsUpdate = true;
    });
    const b = new THREE.Mesh(own(new THREE.PlaneGeometry(2.4, 4.8)), own(new THREE.MeshStandardMaterial({ map: banner.tex, side: THREE.DoubleSide, roughness: 0.9 })));
    b.position.set(-HALF_X - 6, 20, -9 + i * 6);
    b.rotation.y = Math.PI / 2;
    group.add(b);
  }

  // --- centre-hung scoreboard with the live score
  const logos = new Map<string, HTMLImageElement>();
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
        const emblem = logos.get(t.id);
        if (emblem) {
          drawContained(c, emblem, x - 130, 125, 100, 96);
          c.fillText(t.id, x + 50, 128);
        } else c.fillText(t.id, x, 128);
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
  for (const t of [home, away])
    void loadLogo(t.logoUrl).then((img) => {
      if (img && !disposed) {
        logos.set(t.id, img);
        lastText = "";
      }
    });
  // The real home emblem at centre ice, replacing the painted fallback.
  void logo.then((img) => {
    const c = icePaint.ctx;
    if (!img || disposed || !c) return;
    const W = icePaint.canvas.width,
      H = icePaint.canvas.height;
    const r = 3.0 * (W / (HALF_X * 2));
    c.fillStyle = "#eef6f8";
    c.beginPath();
    c.arc(W / 2, H / 2, r * 1.06, 0, Math.PI * 2);
    c.fill();
    drawContained(c, img, W / 2, H / 2, r * 2, r * 2);
    iceTex.needsUpdate = true;
  });

  let clock = 0;
  let jumping = false;
  return {
    group,
    ice,
    preset,
    update(dt: number, r: ArenaReactions) {
      clock += dt;
      lights.forEach((m, i) => {
        const on = r.goalSide !== 0 && (i === 0 ? -1 : 1) === r.goalSide;
        m.emissive.set(on ? "#ff2a1f" : "#000000");
        m.emissiveIntensity = on ? 1.5 + 1.5 * Math.abs(Math.sin(clock * 6)) : 0;
        m.color.set(on ? "#ff4a3a" : "#5a1414");
      });
      if (r.score) drawScore(r.score, r.goalSide !== 0, clock);
      // Home fans jump when their team scores, the building rises on a big
      // chance, and now and then a wave rolls around the bowl.
      const waveT = clock % 75;
      const wave = !!r.playing && waveT < 9;
      const rising = !!r.danger;
      if (r.homeScored || jumping || wave || rising) {
        jumping = r.homeScored || wave || rising;
        const front = (waveT / 9) * Math.PI * 2 - Math.PI;
        const m = new THREE.Matrix4();
        for (let i = 0; i < seats.length; i++) {
          const s = seats[i];
          const angle = Math.atan2(s.z, s.x);
          const inWave = wave ? Math.max(0, 1 - Math.abs(((angle - front + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 2.2) : 0;
          const jump = (r.homeScored && homeFan[i] ? Math.abs(Math.sin(clock * 7 + i * 0.37)) * 0.32 : 0) + inWave * 0.45 + (rising ? 0.14 : 0);
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
      disposed = true;
      disposables.forEach((d) => d.dispose());
      scene.remove(group);
    },
  };
}
