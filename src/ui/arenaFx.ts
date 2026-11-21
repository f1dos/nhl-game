import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import type { Team } from "../engine/types";

/**
 * Picture quality layer of the 3D match: arena light presets, soft shadows,
 * the ice (blurred planar reflections, skate scratches that build up during
 * a period and are cleaned at intermission) and post-processing (light bloom
 * on the rig, ACES output, depth of field only for replays and cut-scenes).
 */

export type ArenaTier = "premium" | "classic" | "modest";
export interface LightPreset {
  tier: ArenaTier;
  /** Overall exposure of the building. */
  exposure: number;
  hemi: number;
  key: number;
  /** Brightness of the stands relative to the ice. */
  stands: number;
  bloom: number;
  /** Rows in the lower and upper bowl. */
  lowerRows: number;
  upperRows: number;
  suites: boolean;
}

const BIG_MARKETS = ["TOR", "MTL", "NYR", "CHI", "BOS", "PHI", "LAK", "DET", "EDM", "VAN", "TBL", "VGK"];

/** Arena size and light rig by club: bigger, brighter, darker bowls for big clubs. */
export function arenaPreset(team: Team): LightPreset {
  const rank = team.strengthRank ?? 16;
  const big = BIG_MARKETS.includes(team.id);
  const tier: ArenaTier = big || rank <= 6 ? "premium" : rank <= 22 ? "classic" : "modest";
  if (tier === "premium") return { tier, exposure: 1.08, hemi: 1.05, key: 2.9, stands: 0.55, bloom: 0.42, lowerRows: 14, upperRows: 12, suites: true };
  if (tier === "classic") return { tier, exposure: 1.04, hemi: 1.25, key: 2.5, stands: 0.7, bloom: 0.34, lowerRows: 12, upperRows: 10, suites: true };
  return { tier, exposure: 1.0, hemi: 1.45, key: 2.2, stands: 0.85, bloom: 0.26, lowerRows: 11, upperRows: 7, suites: false };
}

/** Soft shadows from the main overhead light onto the ice. */
export function enableShadows(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  let key: THREE.DirectionalLight | undefined;
  scene.traverse((o) => {
    if (!key && (o as THREE.DirectionalLight).isDirectionalLight) key = o as THREE.DirectionalLight;
  });
  if (key) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const cam = key.shadow.camera;
    cam.left = -34;
    cam.right = 34;
    cam.top = 18;
    cam.bottom = -18;
    cam.near = 5;
    cam.far = 90;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    key.target.position.set(0, 0, 0);
    cam.updateProjectionMatrix();
  }
  return key;
}

export interface IceFx {
  /** Record skates on the ice (scratch marks) for this frame. */
  skate(points: { x: number; z: number; speed: number; stopping: boolean }[], dt: number): void;
  /** Fresh sheet: called at intermission. */
  resurface(): void;
  dispose(): void;
}

const HALF_X = 30.5, HALF_Z = 13.2;

/**
 * Ice surface effects. `ice` is the painted ice mesh: it becomes slightly
 * translucent over a low-resolution planar reflector, which gives soft,
 * blurred reflections of players, boards and lights. A scratch layer on top
 * accumulates skate marks.
 */
export function buildIceFx(scene: THREE.Scene, ice: THREE.Mesh | undefined, quality: "high" | "low"): IceFx {
  const disposables: { dispose(): void }[] = [];
  let reflector: Reflector | undefined;
  if (ice && quality === "high") {
    const size = new THREE.Vector2();
    const w = Math.max(256, Math.round(window.innerWidth * 0.3));
    const h = Math.max(144, Math.round(window.innerHeight * 0.3));
    size.set(w, h);
    reflector = new Reflector(new THREE.PlaneGeometry(HALF_X * 2, HALF_Z * 2), {
      textureWidth: size.x,
      textureHeight: size.y,
      color: 0x8a96a0,
      clipBias: 0.003,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = -0.012;
    reflector.renderOrder = -1;
    scene.add(reflector);
    disposables.push(reflector.geometry, reflector.getRenderTarget());
    const mat = ice.material as THREE.MeshStandardMaterial;
    mat.transparent = true;
    mat.opacity = 0.86;
    mat.depthWrite = true;
    mat.needsUpdate = true;
    ice.receiveShadow = true;
  } else if (ice) ice.receiveShadow = true;

  // Scratch layer: a canvas the skates draw into, multiplied onto the ice.
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 896;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  disposables.push(tex);
  const layer = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_X * 2, HALF_Z * 2),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, color: "#dfe8ee" }),
  );
  layer.rotation.x = -Math.PI / 2;
  layer.position.y = 0.004;
  layer.renderOrder = 1;
  layer.receiveShadow = true;
  scene.add(layer);
  disposables.push(layer.geometry, layer.material as THREE.Material);
  const last = new Map<number, [number, number]>();
  let dirty = 0;
  const toCanvas = (x: number, z: number): [number, number] => [((x + HALF_X) / (HALF_X * 2)) * canvas.width, ((z + HALF_Z) / (HALF_Z * 2)) * canvas.height];
  return {
    skate(points, dt) {
      if (!ctx) return;
      points.forEach((p, i) => {
        const at = toCanvas(p.x, p.z);
        const prev = last.get(i);
        last.set(i, at);
        if (!prev || p.speed < 1.2) return;
        const jump = Math.hypot(at[0] - prev[0], at[1] - prev[1]);
        if (jump > 60) return;
        // Faint white grooves; hard stops leave wide, snowy marks.
        ctx.strokeStyle = p.stopping ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.07)";
        ctx.lineWidth = p.stopping ? 7 : 1.4;
        ctx.beginPath();
        ctx.moveTo(prev[0], prev[1]);
        ctx.lineTo(at[0], at[1]);
        ctx.stroke();
      });
      dirty += dt;
      // Uploading a 2K canvas is costly: refresh a few times per second.
      if (dirty > 0.25) {
        dirty = 0;
        tex.needsUpdate = true;
      }
    },
    resurface() {
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      last.clear();
      tex.needsUpdate = true;
    },
    dispose() {
      if (reflector) scene.remove(reflector);
      scene.remove(layer);
      disposables.forEach((d) => d.dispose());
    },
  };
}

export interface Post {
  render(): void;
  setSize(w: number, h: number): void;
  /** Depth of field for replays and cut-scenes; focus distance in metres. */
  setCinematic(on: boolean, focus?: number): void;
  dispose(): void;
}

/** Bloom on the light rig, ACES output, optional depth of field. */
export function buildPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, bloom: number): Post {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // High threshold: only emissive light panels, goal lights and the video
  // board glow — never the (bright, white) ice itself.
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), bloom * 0.7, 0.45, 2.2);
  composer.addPass(bloomPass);
  const bokeh = new BokehPass(scene, camera, { focus: 12, aperture: 0.0006, maxblur: 0.005 });
  bokeh.enabled = false;
  composer.addPass(bokeh);
  composer.addPass(new OutputPass());
  let focus = 12;
  return {
    render() {
      composer.render();
    },
    setSize(w, h) {
      composer.setSize(w, h);
      bloomPass.resolution.set(w / 2, h / 2);
    },
    setCinematic(on, f) {
      bokeh.enabled = on;
      if (f !== undefined) focus += (f - focus) * 0.2;
      (bokeh.uniforms as unknown as { focus: { value: number } }).focus.value = focus;
    },
    dispose() {
      composer.dispose();
      bloomPass.dispose();
      bokeh.dispose();
    },
  };
}
