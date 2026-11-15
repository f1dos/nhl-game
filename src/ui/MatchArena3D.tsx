import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Event, Team } from "../engine/types";

/** Event-driven presentation layer. Does not invent or modify match results. */
export default function MatchArena3D({ home, away, event, running }: {
  home: Team; away: Team; event?: Event; running: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ event, running });
  current.current = { event, running };
  const [cameraMode, setCameraMode] = useState("broadcast");
  const mode = useRef(cameraMode);
  mode.current = cameraMode;
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setUnavailable(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#101b2b");
    scene.add(new THREE.HemisphereLight(0xd9f4ff, 0x263449, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(0, 35, 10); scene.add(light);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
      mesh.position.set(x, y, z); scene.add(mesh); return mesh;
    };
    box(0, -0.3, 0, 61, 0.6, 26, "#dceef2");
    for (const z of [-13.2, 13.2]) {
      box(0, 0.6, z, 61, 1.2, 0.35, "#fafafa");
      box(0, 0.1, z - Math.sign(z) * 0.2, 61, 0.2, 0.1, "#eab83b");
      box(0, 2.5, z + Math.sign(z) * 3, 65, 4, 5, "#273b52");
    }
    for (const x of [-30.5, 30.5]) box(x, 0.6, 0, 0.35, 1.2, 26, "#fafafa");
    for (const [x, color] of [[0, "#d03c4a"], [-9, "#307fb8"], [9, "#307fb8"], [-26, "#d03c4a"], [26, "#d03c4a"]] as const)
      box(x, 0.02, 0, 0.18, 0.03, 26, color);
    const circle = (x: number, z: number, radius: number, color: string) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.06, radius, 64), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.045, z); scene.add(ring);
    };
    circle(0, 0, 4.5, "#307fb8");
    for (const x of [-20, 20]) for (const z of [-6.5, 6.5]) circle(x, z, 4.5, "#d03c4a");
    for (const x of [-26, 26]) {
      for (const z of [-1, 1]) box(x, 0.6, z, 0.1, 1.2, 0.1, "#db3545");
      box(x, 1.2, 0, 0.1, 0.1, 2.1, "#db3545");
      box(x + Math.sign(x) * 0.7, 0.5, 0, 0.08, 1, 2, "#a3b9c4");
    }
    const actors: { group: THREE.Group; side: number; slot: number }[] = [];
    [home, away].forEach((team, side) => {
      for (let slot = 0; slot < 7; slot++) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 4, 8), new THREE.MeshStandardMaterial({ color: side ? "#f0f4f8" : team.color }));
        body.position.y = 0.95; group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), new THREE.MeshStandardMaterial({ color: team.color }));
        head.position.y = 1.6; group.add(head);
        for (const x of [-0.17, 0.17]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.55, 0.25), new THREE.MeshStandardMaterial({ color: "#172232" }));
          leg.position.set(x, 0.3, 0); group.add(leg);
        }
        const stick = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 1.5), new THREE.MeshStandardMaterial({ color: "#262626" }));
        stick.position.set(0.4, 0.14, -0.55); group.add(stick);
        group.position.set((side ? 1 : -1) * (slot === 6 ? 25 : 8), 0, (slot % 3 - 1) * 5);
        scene.add(group); actors.push({ group, side, slot });
      }
    });
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12), new THREE.MeshStandardMaterial({ color: "#111111" }));
    puck.position.y = 0.1; scene.add(puck);
    const resize = () => {
      const width = Math.max(1, container.clientWidth), height = Math.max(320, container.clientHeight);
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    let frame = 0, previous = performance.now();
    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - previous) / 1000); previous = now;
      const data = current.current;
      const x = data.event ? (data.event.x / 100 - 0.5) * 56 : 0;
      const z = data.event ? (data.event.y / 100 - 0.5) * 23 : 0;
      if (data.running) {
        puck.position.lerp(new THREE.Vector3(x, 0.1, z), Math.min(1, dt * 5));
        actors.forEach(({ group, side, slot }) => {
          const ids = data.event?.skaters?.[side];
          group.visible = slot === 6 ? (ids?.length ?? 5) < 6 : slot < (ids?.length ?? 5);
          const carrier = data.event?.team === [home.id, away.id][side] && ids?.[slot] === data.event.playerId;
          const tx = slot === 6 ? (side ? 25 : -25) : carrier ? x : Math.max(-27, Math.min(27, x * 0.55 + (side ? 1 : -1) * (slot < 3 ? 5 : 12)));
          const tz = slot === 6 ? z * 0.07 : carrier ? z + 0.6 : (slot % 3 - 1) * 6 + z * 0.25;
          const target = new THREE.Vector3(tx, 0, tz);
          group.lookAt(target.x, 0, target.z); group.position.lerp(target, Math.min(1, dt * 2));
        });
      }
      const desired = mode.current === "overhead" ? new THREE.Vector3(0, 65, 0.1) : mode.current === "follow" ? new THREE.Vector3(puck.position.x * 0.45, 26, 31) : new THREE.Vector3(0, 38, 45);
      camera.position.lerp(desired, 0.08); camera.lookAt(mode.current === "follow" ? puck.position.x * 0.35 : 0, 0, 0);
      renderer.render(scene, camera); frame = requestAnimationFrame(animate);
    };
    camera.position.set(0, 38, 45); frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); } });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [home.id, away.id]);
  return <div>
    <div style={{ display: "flex", gap: 8, padding: 12 }}>
      <label>Камера <select value={cameraMode} onChange={e => setCameraMode(e.target.value)}>
        <option value="broadcast">Трансляция</option><option value="overhead">Тактическая</option><option value="follow">За шайбой</option>
      </select></label>
      <span style={{ marginLeft: "auto", color: "#8aa7bd" }}>3D · {home.id} / {away.id}</span>
    </div>
    <div ref={host} style={{ height: "clamp(320px, 45vw, 580px)", width: "100%" }} role="img" aria-label="Трёхмерная хоккейная площадка">
      {unavailable && <p>3D недоступен: включите аппаратное ускорение или выберите режим 2D.</p>}
    </div>
  </div>;
}
