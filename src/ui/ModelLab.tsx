import { useEffect, useRef } from "react";
import * as THREE from "three";
import { appearanceFor, SkinnedRigFactory, type RigLike } from "./skinnedRig";
import { kitFor } from "./teamKit";
import { clubs } from "../engine/database";
import { NHL_TEAM_LOGOS } from "../data/nhl-2026-27";
import "./modelLab.css";
import { loadLogo } from "./arenaScene";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { RigState, RigActionKind, TeamKit } from "./hockeyRig";

/**
 * Model review studio (`?demo=models&view=front|side|goalie|faceoff|celebrate|lineup`):
 * the skinned figures under neutral studio light for close inspection and
 * screenshots. No career or simulation involved.
 */
const HOME: TeamKit = {
  jersey: "#0b3d91",
  trim: "#f4f6f8",
  pants: "#10161e",
  helmet: "#0b3d91",
  socks: "#0b3d91",
  logo: "https://assets.nhle.com/logos/nhl/svg/NYR_light.svg",
  abbr: "NYR",
};
const AWAY: TeamKit = {
  jersey: "#e8edf3",
  trim: "#c8102e",
  pants: "#5a0a16",
  helmet: "#c8102e",
  socks: "#c8102e",
  logo: "https://assets.nhle.com/logos/nhl/svg/MTL_light.svg",
  abbr: "MTL",
};

interface Actor {
  rig: RigLike;
  x: number;
  z: number;
  yaw: number;
  state?: RigState;
  variant?: number;
  vx?: number;
  every?: number;
  action?: () => void;
}

export default function ModelLab() {
  const host = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLOutputElement>(null);
  const params = new URLSearchParams(location.search);
  const select = (
    key: string,
    label: string,
    values: Record<string, string>,
  ) => (
    <label>
      {label}{" "}
      <select
        defaultValue={
          params.get(key) ??
          (key === "lod"
            ? "auto"
            : key === "club"
              ? "NYR"
              : Object.keys(values)[0])
        }
        onChange={(e) => {
          const url = new URL(location.href);
          url.searchParams.set(key, e.target.value);
          if (key === "view") url.searchParams.delete("motion");
          location.assign(url);
        }}
      >
        {Object.entries(values).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  useEffect(() => {
    const el = host.current!;
    const options = new URLSearchParams(location.search);
    const view = options.get("view") ?? "front";
    const action = options.get("motion") ?? "pose";
    const pursuit = action === "pursuit";
    const skating = pursuit || action === "skate";
    const variantId = options.get("build") ?? "roster";
    const forcedLod = options.get("lod") ?? "auto";
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0c1218");
    scene.add(new THREE.HemisphereLight("#dfeaf5", "#1a222b", 0.9));
    const key = new THREE.DirectionalLight("#ffffff", 2.4);
    key.position.set(3, 7, 5);
    key.shadow.normalBias = 0.015;
    key.shadow.bias = -0.0003;
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -5;
    key.shadow.camera.right = key.shadow.camera.top = 5;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new THREE.DirectionalLight("#9fc7ff", 1.2);
    rim.position.set(-4, 3, -5);
    scene.add(rim);
    const fill = new THREE.DirectionalLight("#e6edff", 1.1);
    fill.position.set(-3, 2, 4);
    scene.add(fill);
    const ice = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshStandardMaterial({
        color: "#e9f1f6",
        roughness: 0.25,
        metalness: 0.05,
      }),
    );
    ice.rotation.x = -Math.PI / 2;
    ice.receiveShadow = true;
    scene.add(ice);
    const factory = new SkinnedRigFactory((kit) => loadLogo(kit.logo));
    const models =
      options.get("rig") === "classic" ? factory.primitive : factory;
    const club = clubs.find(([id]) => id === (options.get("club") ?? "NYR"))!;
    const blue = club
      ? kitFor(
          { id: club[0], color: club[4], logoUrl: NHL_TEAM_LOGOS[club[0]] },
          options.get("kit") === "away",
        )
      : HOME;
    const white = blue.abbr === "MTL" ? HOME : AWAY;
    const actors: Actor[] = [];
    const add = (
      rig: RigLike,
      id: string,
      name: string,
      num: number,
      pos: string,
      a: Omit<Actor, "rig">,
    ) => {
      if (variantId !== "roster") {
        const target =
          variantId === "lean" ? 0.13 : variantId === "heavy" ? 0.94 : 0.51;
        const role = pos === "G" ? "goalie" : "skater";
        const candidates = Array.from({ length: 48 }, (_, i) => id + "-" + i);
        id = candidates.reduce((best, next) =>
          Math.abs(appearanceFor(next, role, pos).build - target) <
          Math.abs(appearanceFor(best, role, pos).build - target)
            ? next
            : best,
        );
      }
      rig.setIdentity({ id, name, number: num }, pos);
      rig.place(a.x, a.z, a.yaw);
      if (forcedLod !== "auto")
        rig.root.traverse((node) => {
          if (node instanceof THREE.LOD) {
            node.autoUpdate = false;
            node.levels.forEach(
              (level, i) => (level.object.visible = i === Number(forcedLod)),
            );
          }
        });
      scene.add(rig.root);
      actors.push({ rig, ...a });
    };
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    const look = new THREE.Vector3(0, 1.0, 0);
    let closed = false;
    let studyReady = view !== "skater27";
    let studyError = false;
    let study: THREE.Group | undefined;
    const disposeStudy = (model: THREE.Group) => {
      const materials = new Set<THREE.Material>();
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          for (const material of [node.material].flat())
            materials.add(material);
        }
      });
      materials.forEach((material) => material.dispose());
    };
    if (view === "skater27") {
      new GLTFLoader().load(
        "models/hockey/skater-27.glb",
        ({ scene: model }) => {
          if (closed) return disposeStudy(model);
          study = model;
          model.traverse((node) => {
            if (node instanceof THREE.Mesh) node.castShadow = true;
          });
          scene.add(model);
          studyReady = true;
        },
        undefined,
        () => {
          studyError = true;
          if (!closed && meter.current)
            meter.current.textContent = "Could not load Skater 27";
        },
      );
      camera.position.set(1.7, 1.55, 3.4);
      look.set(0.13, 0.88, 0.21);
    } else if (view === "front" || view === "side") {
      add(models.skater(blue), "nhl-NYR-8479323", "Adam Fox", 23, "D", {
        x: action === "pose" ? -0.55 : 0,
        z: 0,
        yaw: view === "side" ? Math.PI / 2 : 0.25,
        state: "play",
      });
      if (action === "pose")
        add(models.skater(white), "nhl-MTL-8480018", "Nick Suzuki", 14, "C", {
          x: 0.65,
          z: -0.2,
          yaw: view === "side" ? -Math.PI / 2 : -0.35,
          state: "faceoff-ready",
        });
      camera.position.set(0, 1.25, view === "side" ? 4.4 : 4.2);
      look.set(0, 0.95, 0);
    } else if (view === "back") {
      add(models.skater(blue), "nhl-NYR-8478550", "Artemi Panarin", 10, "LW", {
        x: -0.5,
        z: 0,
        yaw: Math.PI,
        state: "play",
      });
      add(models.skater(white), "nhl-MTL-8483515", "Lane Hutson", 48, "D", {
        x: 0.55,
        z: 0,
        yaw: Math.PI + 0.3,
        state: "play",
      });
      camera.position.set(0, 1.3, 4.2);
      look.set(0, 1.0, 0);
    } else if (view === "goalie") {
      add(models.goalie(blue), "nhl-NYR-8478048", "Igor Shesterkin", 31, "G", {
        x: 0,
        z: 0,
        yaw: 0,
        state: "goalie-hold",
        variant: 0.2,
      });
      camera.position.set(1.25, 1.2, 4.7);
      look.set(0, 0.98, 0);
    } else if (view === "faceoff") {
      add(models.skater(blue), "nhl-NYR-8476459", "Mika Zibanejad", 93, "C", {
        x: 0,
        z: -0.62,
        yaw: 0,
        state: "faceoff-stance",
      });
      add(models.skater(white), "nhl-MTL-8480018", "Nick Suzuki", 14, "C", {
        x: 0,
        z: 0.62,
        yaw: Math.PI,
        state: "faceoff-stance",
      });
      add(models.official("linesman"), "official-2", "Linesman", 64, "C", {
        x: 1.0,
        z: 0,
        yaw: -Math.PI / 2,
        state: "official-drop",
      });
      add(
        models.skater(blue),
        "nhl-NYR-8482109",
        "Alexis Lafreniere",
        13,
        "LW",
        { x: -2.2, z: -1.4, yaw: 0, state: "faceoff-ready" },
      );
      camera.position.set(3.2, 1.6, 3.4);
      look.set(0, 0.7, 0);
    } else if (view === "celebrate") {
      add(models.skater(blue), "nhl-NYR-8478550", "Artemi Panarin", 10, "LW", {
        x: 0,
        z: 0,
        yaw: 0.3,
        state: "celebrate",
        variant: 0.1,
      });
      add(models.skater(blue), "nhl-NYR-8476459", "Mika Zibanejad", 93, "C", {
        x: -0.9,
        z: -0.5,
        yaw: 0.9,
        state: "hug",
      });
      add(models.skater(blue), "nhl-NYR-8479323", "Adam Fox", 23, "D", {
        x: 0.95,
        z: -0.6,
        yaw: -0.8,
        state: "hug",
      });
      add(models.coach("#0b3d91"), "coach-nyr", "Head coach", 0, "C", {
        x: 2.6,
        z: -2.4,
        yaw: 0,
        state: "coach-clap",
      });
      camera.position.set(0.4, 1.6, 5.9);
      look.set(0.2, 1.25, -0.3);
    } else {
      // Line-up: five skaters, a goalie and two officials.
      const names = [
        "Vincent Trocheck",
        "Chris Kreider",
        "Adam Fox",
        "K'Andre Miller",
        "Alexis Lafreniere",
      ];
      names.forEach((n, i) =>
        add(
          models.skater(i % 2 ? white : blue),
          `lineup-${i}`,
          n,
          10 + i * 7,
          i === 2 || i === 3 ? "D" : "C",
          { x: -3 + i * 1.5, z: 0, yaw: 0, state: "faceoff-ready" },
        ),
      );
      add(models.goalie(white), "lineup-g", "Samuel Montembeault", 35, "G", {
        x: 4.6,
        z: -0.4,
        yaw: -0.4,
        state: "play",
      });
      add(models.official("referee"), "lineup-r", "Referee", 27, "C", {
        x: -4.6,
        z: -0.4,
        yaw: 0.4,
        state: "play",
      });
      camera.position.set(0, 1.8, 11.4);
      look.set(0, 0.9, 0);
    }
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(look);
    controls.minDistance = 0.55;
    controls.maxDistance = 17;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.enableDamping = true;
    controls.update();
    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    let frame = 0,
      elapsed = 0,
      nextAction = 0.5;
    let last = performance.now();
    let frames = 0,
      fpsT = 0;
    const advance = (dt: number) => {
      elapsed += dt;
      for (const a of actors) {
        if (a.state && (action === "pose" || elapsed === dt))
          a.rig.setState(
            action === "pose" ? a.state : "play",
            a.variant ?? 0.2,
            1,
          );
        if (!skating && action !== "pose" && elapsed >= nextAction)
          a.rig.trigger(
            action as RigActionKind,
            { x: a.x + 0.5, z: a.z + 3 },
            0.65,
          );
        a.rig.update(dt, dt, {
          x: a.x,
          z: a.z,
          vx: skating
            ? view === "goalie"
              ? 2.5 * Math.sin(elapsed * 2)
              : (pursuit ? 7 : 4) * Math.sin(a.yaw)
            : 0,
          vz: skating
            ? view === "goalie"
              ? 0
              : (pursuit ? 7 : 4) * Math.cos(a.yaw)
            : 0,
          puckX: 0.5,
          puckZ: pursuit ? 10 : 2,
          hasPuck: action === "skate",
          face: a.yaw,
        });
      }
      if (elapsed >= nextAction) nextAction = elapsed + 2.5;
    };
    const still = options.has("sample");
    if (still) {
      const steps = Math.min(
        240,
        Math.max(0, Math.round(Number(options.get("sample")) * 60)),
      );
      for (let i = 0; i < steps; i++) advance(1 / 60);
    }
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      const wallDt = (now - last) / 1000;
      last = now;
      advance(still ? 0 : dt);
      controls.update();
      renderer.render(scene, camera);
      frames++;
      fpsT += wallDt;
      if (fpsT > 1) {
        (window as unknown as { __fps: number }).__fps = frames / fpsT;
        if (meter.current && studyReady && !studyError)
          meter.current.textContent =
            Math.round(frames / fpsT) +
            " FPS · " +
            renderer.info.render.triangles.toLocaleString() +
            " triangles · " +
            renderer.info.render.calls +
            " draws";
        frames = 0;
        fpsT = 0;
      }
      (window as unknown as { __ready: boolean }).__ready = studyReady;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      closed = true;
      if (study) disposeStudy(study);
      cancelAnimationFrame(frame);
      observer.disconnect();
      actors.forEach((a) => a.rig.dispose());
      factory.dispose();
      controls.dispose();
      ice.geometry.dispose();
      ice.material.dispose();
      key.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <main className="model-studio">
      <header>
        <strong>ModelLab</strong>
        <output ref={meter} aria-label="Render statistics" />
      </header>
      <div className="model-stage" ref={host} />
      <aside aria-label="Model studio">
        {select("view", "Camera", {
          front: "Front",
          side: "Profile",
          back: "Jersey",
          goalie: "Goaltender",
          faceoff: "Faceoff",
          celebrate: "Celebration",
          lineup: "Line-up",
          skater27: "Skater 27 · Blender",
        })}
        {params.get("view") !== "skater27" && (
          <>
            {select(
              "club",
              "Club",
              Object.fromEntries(
                clubs.map(([id, city, name]) => [id, city + " " + name]),
              ),
            )}
            {select("kit", "Uniform", { home: "Home", away: "Away" })}
            {select("build", "Appearance", {
              roster: "Roster",
              lean: "Lean",
              average: "Average",
              heavy: "Heavy",
            })}
            {select(
              "motion",
              "Movement",
              params.get("view") === "goalie"
                ? ({
                    pose: "Set",
                    skate: "Shuffle",
                    save: "Save",
                    conceded: "Recovery",
                  } as Record<string, string>)
                : {
                    pose: "Stance",
                    skate: "Stride",
                    pursuit: "Off-puck sprint",
                    wrist: "Wrist shot",
                    snap: "Snap shot",
                    slap: "Slap shot",
                    block: "Block",
                    pass: "Pass",
                    receive: "Receive",
                    deke: "Deke",
                    check: "Check",
                  },
            )}
            {select("rig", "Model", { skinned: "Skinned", classic: "Classic" })}
            {select("lod", "Detail", {
              auto: "Auto",
              "0": "Close",
              "1": "Broadcast",
              "2": "Distant",
            })}
          </>
        )}
      </aside>
    </main>
  );
}
