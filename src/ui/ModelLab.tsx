import { useEffect, useRef } from "react";
import * as THREE from "three";
import { SkinnedRigFactory, type RigLike } from "./skinnedRig";
import { loadLogo } from "./arenaScene";
import type { RigState, TeamKit } from "./hockeyRig";

/**
 * Model review studio (`?demo=models&view=front|side|goalie|faceoff|celebrate|lineup`):
 * the skinned figures under neutral studio light for close inspection and
 * screenshots. No career or simulation involved.
 */
const HOME: TeamKit = { jersey: "#0b3d91", trim: "#f4f6f8", pants: "#10161e", helmet: "#0b3d91", socks: "#0b3d91", logo: "https://assets.nhle.com/logos/nhl/svg/NYR_light.svg", abbr: "NYR" };
const AWAY: TeamKit = { jersey: "#e8edf3", trim: "#c8102e", pants: "#5a0a16", helmet: "#c8102e", socks: "#c8102e", logo: "https://assets.nhle.com/logos/nhl/svg/MTL_light.svg", abbr: "MTL" };

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
  useEffect(() => {
    const el = host.current!;
    const view = new URLSearchParams(location.search).get("view") ?? "front";
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0c1218");
    scene.add(new THREE.HemisphereLight("#dfeaf5", "#1a222b", 0.9));
    const key = new THREE.DirectionalLight("#ffffff", 2.4);
    key.position.set(3, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -5;
    key.shadow.camera.right = key.shadow.camera.top = 5;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new THREE.DirectionalLight("#9fc7ff", 1.2);
    rim.position.set(-4, 3, -5);
    scene.add(rim);
    const ice = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: "#e9f1f6", roughness: 0.25, metalness: 0.05 }));
    ice.rotation.x = -Math.PI / 2;
    ice.receiveShadow = true;
    scene.add(ice);
    const factory = new SkinnedRigFactory((kit) => loadLogo(kit.logo));
    const actors: Actor[] = [];
    const add = (rig: RigLike, id: string, name: string, num: number, pos: string, a: Omit<Actor, "rig">) => {
      rig.setIdentity({ id, name, number: num }, pos);
      rig.place(a.x, a.z, a.yaw);
      scene.add(rig.root);
      actors.push({ rig, ...a });
    };
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    const look = new THREE.Vector3(0, 1.0, 0);
    if (view === "front" || view === "side") {
      add(factory.skater(HOME), "nhl-NYR-8479323", "Adam Fox", 23, "D", { x: -0.55, z: 0, yaw: view === "side" ? Math.PI / 2 : 0.25, state: "play" });
      add(factory.skater(AWAY), "nhl-MTL-8480018", "Nick Suzuki", 14, "C", { x: 0.65, z: -0.2, yaw: view === "side" ? -Math.PI / 2 : -0.35, state: "faceoff-ready" });
      camera.position.set(0, 1.25, view === "side" ? 4.4 : 4.2);
      look.set(0, 0.95, 0);
    } else if (view === "back") {
      add(factory.skater(HOME), "nhl-NYR-8478550", "Artemi Panarin", 10, "LW", { x: -0.5, z: 0, yaw: Math.PI, state: "play" });
      add(factory.skater(AWAY), "nhl-MTL-8483515", "Lane Hutson", 48, "D", { x: 0.55, z: 0, yaw: Math.PI + 0.3, state: "play" });
      camera.position.set(0, 1.3, 4.2);
      look.set(0, 1.0, 0);
    } else if (view === "goalie") {
      add(factory.goalie(HOME), "nhl-NYR-8478048", "Igor Shesterkin", 31, "G", { x: 0, z: 0, yaw: 0, state: "goalie-hold", variant: 0.2 });
      camera.position.set(1.2, 1.1, 3.6);
      look.set(0, 0.6, 0);
    } else if (view === "faceoff") {
      add(factory.skater(HOME), "nhl-NYR-8476459", "Mika Zibanejad", 93, "C", { x: 0, z: -0.62, yaw: 0, state: "faceoff-stance" });
      add(factory.skater(AWAY), "nhl-MTL-8480018", "Nick Suzuki", 14, "C", { x: 0, z: 0.62, yaw: Math.PI, state: "faceoff-stance" });
      add(factory.official("linesman"), "official-2", "Linesman", 64, "C", { x: 1.0, z: 0, yaw: -Math.PI / 2, state: "official-drop" });
      add(factory.skater(HOME), "nhl-NYR-8482109", "Alexis Lafreniere", 13, "LW", { x: -2.2, z: -1.4, yaw: 0, state: "faceoff-ready" });
      camera.position.set(3.2, 1.6, 3.4);
      look.set(0, 0.7, 0);
    } else if (view === "celebrate") {
      add(factory.skater(HOME), "nhl-NYR-8478550", "Artemi Panarin", 10, "LW", { x: 0, z: 0, yaw: 0.3, state: "celebrate", variant: 0.1 });
      add(factory.skater(HOME), "nhl-NYR-8476459", "Mika Zibanejad", 93, "C", { x: -0.9, z: -0.5, yaw: 0.9, state: "hug" });
      add(factory.skater(HOME), "nhl-NYR-8479323", "Adam Fox", 23, "D", { x: 0.95, z: -0.6, yaw: -0.8, state: "hug" });
      add(factory.coach("#0b3d91"), "coach-nyr", "Head coach", 0, "C", { x: 2.6, z: -2.4, yaw: 0, state: "coach-clap" });
      camera.position.set(0.4, 1.4, 4.6);
      look.set(0, 1.05, -0.3);
    } else {
      // Line-up: five skaters, a goalie and two officials.
      const names = ["Vincent Trocheck", "Chris Kreider", "Adam Fox", "K'Andre Miller", "Alexis Lafreniere"];
      names.forEach((n, i) => add(factory.skater(i % 2 ? AWAY : HOME), `lineup-${i}`, n, 10 + i * 7, i === 2 || i === 3 ? "D" : "C", { x: -3 + i * 1.5, z: 0, yaw: 0, state: "faceoff-ready" }));
      add(factory.goalie(AWAY), "lineup-g", "Samuel Montembeault", 35, "G", { x: 4.6, z: -0.4, yaw: -0.4, state: "play" });
      add(factory.official("referee"), "lineup-r", "Referee", 27, "C", { x: -4.6, z: -0.4, yaw: 0.4, state: "play" });
      camera.position.set(0, 1.8, 9.5);
      look.set(0, 0.9, 0);
    }
    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);
    let frame = 0;
    let last = performance.now();
    let frames = 0, fpsT = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const a of actors) {
        if (a.state) a.rig.setState(a.state, a.variant ?? 0.2, 1);
        a.rig.update(dt, dt, { x: a.x, z: a.z, vx: 0, vz: 0, puckX: 0, puckZ: 0, hasPuck: false, face: a.yaw });
      }
      camera.lookAt(look);
      renderer.render(scene, camera);
      frames++;
      fpsT += dt;
      if (fpsT > 1) {
        (window as unknown as { __fps: number }).__fps = frames / fpsT;
        frames = 0;
        fpsT = 0;
      }
      (window as unknown as { __ready: boolean }).__ready = true;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      actors.forEach((a) => a.rig.dispose());
      factory.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return <div ref={host} style={{ position: "fixed", inset: 0, background: "#0c1218" }} />;
}
