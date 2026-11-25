import {goalOutline, GOAL_HALF_WIDTH, GOAL_HEIGHT, POST_RADIUS} from "../engine/goalGeometry";
import * as THREE from "three";
import { buildMatchNight } from "./matchArt";
import { arenaPreset } from "./arenaFx";
import type { Team } from "../engine/types";
import { RINK } from "../engine/rink";

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
    line(-RINK.goalLine, "#c8102e", 0.06);
    line(RINK.goalLine, "#c8102e", 0.06);
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
      c.ellipse(X(side * RINK.goalLine), Z(0), 1.83 * sx, 1.83 * sz, 0, side > 0 ? Math.PI / 2 : -Math.PI / 2, side > 0 ? (Math.PI * 3) / 2 : Math.PI / 2);
      c.fill();
      c.strokeStyle = "#c8102e";
      c.lineWidth = 0.05 * sx;
      c.beginPath();
      c.moveTo(X(side * RINK.goalLine), Z(-3.3));
      c.lineTo(X(side * HALF_X), Z(-4.4));
      c.moveTo(X(side * RINK.goalLine), Z(3.3));
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

export function buildArena(scene: THREE.Scene, home: Team, away: Team) {
  const preset = arenaPreset(home);
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const group = new THREE.Group();
  scene.add(group);
  scene.background = new THREE.Color("#0a1019");
  scene.fog = new THREE.Fog("#0a1019", 75, 150);
  // Lighting: cool fill plus the bright overhead rig of an NHL arena.
  group.add(new THREE.HemisphereLight(0xcdd7e2,0x171b22,.57));
  const key=new THREE.DirectionalLight(0xf6f7ff,.85);
  key.position.set(2,32,1);
  group.add(key,key.target);
  for(const x of [-19,0,19]) for(const z of [-8,8]) {
    const bank=new THREE.SpotLight(0xf4f5ff,210,48,.9,.6,1.6);
    bank.position.set(x,13,z); bank.target.position.set(x,0,z*.35);
    group.add(bank,bank.target);
  }
  const mat = (color: string, roughness = 0.6, metalness = 0) =>
    own(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
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

  const lights: THREE.MeshStandardMaterial[] = [];
  for (const side of [-1, 1]) {
    const frame = mat("#ae1725",.38,.45);
    const white = mat("#eceae3",.74);
    const lower=goalOutline(side), upper=goalOutline(side,.56);
    const vec=(p:{x:number;z:number},h:number)=>new THREE.Vector3(p.x,h,p.z);
    function tube(points:THREE.Vector3[],radius:number,material:THREE.Material) {
      const curve=new THREE.CurvePath<THREE.Vector3>();
      points.slice(1).forEach((pt,i)=>curve.add(new THREE.LineCurve3(points[i],pt)));
      group.add(new THREE.Mesh(own(new THREE.TubeGeometry(curve,Math.max(1,points.length*2),radius,10,false)),material));
    }
    const lineX=side*RINK.goalLine;
    tube([new THREE.Vector3(lineX,.026,-GOAL_HALF_WIDTH),new THREE.Vector3(lineX,GOAL_HEIGHT,-GOAL_HALF_WIDTH)],POST_RADIUS,frame);
    tube([new THREE.Vector3(lineX,.026,GOAL_HALF_WIDTH),new THREE.Vector3(lineX,GOAL_HEIGHT,GOAL_HALF_WIDTH)],POST_RADIUS,frame);
    tube([new THREE.Vector3(lineX,GOAL_HEIGHT,-GOAL_HALF_WIDTH),new THREE.Vector3(lineX,GOAL_HEIGHT,GOAL_HALF_WIDTH)],POST_RADIUS,frame);
    tube(lower.map(p=>vec(p,.045)),.045,white);
    tube(upper.map(p=>vec(p,GOAL_HEIGHT-.035)),.018,white);
    const twine:number[]=[];
    function strand(a:THREE.Vector3,b:THREE.Vector3){twine.push(...a.toArray(),...b.toArray());}
    const surface=(i:number,t:number)=>vec(lower[i],.055).lerp(vec(upper[i],GOAL_HEIGHT-.045),t);
    for(let i=1;i<lower.length;i++) {
      for(let j=0;j<18;j++){
        strand(surface(i-1,j/18),surface(i,(j+1)/18));
        strand(surface(i,j/18),surface(i-1,(j+1)/18));
      }
      const u=vec(upper[i],GOAL_HEIGHT-.045);
      strand(u,new THREE.Vector3(lineX,u.y,u.z));
      for(let j=1;j<10;j++){
        const a=vec(upper[i-1],u.y), b=u.clone();
        a.x=lineX+(a.x-lineX)*j/10;b.x=lineX+(b.x-lineX)*j/10;strand(a,b);
      }
    }
    const mesh=own(new THREE.BufferGeometry());
    mesh.setAttribute("position",new THREE.Float32BufferAttribute(twine,3));
    group.add(new THREE.LineSegments(mesh,own(new THREE.LineBasicMaterial({color:0xf5f3e9,transparent:true,opacity:.55}))));
    // Goal light behind the glass.
    const housing = new THREE.Mesh(own(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 14)), mat("#1d1f24", 0.5));
    housing.position.set(side * (HALF_X + 0.5), 3.62, 0);
    group.add(housing);
    const lamp = new THREE.Mesh(own(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), mat("#5a1414", 0.4));
    lamp.position.set(side * (HALF_X + 0.5), 3.7, 0);
    lights.push(lamp.material as THREE.MeshStandardMaterial);
    group.add(lamp);
  }

  const venue = buildMatchNight(own);
  group.add(venue.rink, venue.bowl, venue.ceiling);
  // --- rafters, catwalk lights, banners
  const ceiling: THREE.Object3D[] = [venue.ceiling];
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
      venue.react(clock, !!r.homeScored, !!r.danger, !!r.playing);
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
