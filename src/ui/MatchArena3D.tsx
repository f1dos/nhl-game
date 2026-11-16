import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Event, Team } from "../engine/types";
import type { SpatialFrame } from "../engine/spatialMatch";
import { RigFactory, type HockeyRig, type TeamKit } from "./hockeyRig";

const shade = (hex: string, amount: number) => `#${new THREE.Color(hex).multiplyScalar(amount).getHexString()}`;
/** Home plays in its colour, away in a light kit trimmed in its own colour. */
const kitFor = (team: Team, away: boolean): TeamKit => away
  ? { jersey: "#e8edf3", trim: team.color, pants: shade(team.color, 0.55), helmet: shade(team.color, 0.7), socks: team.color }
  : { jersey: team.color, trim: "#f4f6f8", pants: "#10161e", helmet: "#10161e", socks: team.color };

/** Event-driven presentation layer. Does not invent or modify match results. */
const _focusTarget = new THREE.Vector3();

export default function MatchArena3D({ home, away, event, running, spatial, playback = 1 }: {
  home: Team; away: Team; event?: Event; running: boolean; spatial?: SpatialFrame; playback?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ event, running, spatial, playback });
  current.current = { event, running, spatial, playback };
  const [cameraMode, setCameraMode] = useState("broadcast");
  const mode = useRef(cameraMode);
  mode.current = cameraMode;
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const data0 = current.current.spatial;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setUnavailable(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    let disposed = false;
    const factory = new RigFactory();
    const labels = Array.from({length: 3}, () => {
      const label = document.createElement("div");
      Object.assign(label.style, {position:"absolute", padding:"5px 9px", borderRadius:"5px", background:"#101d2eee", color:"white", fontSize:"12px", fontWeight:"600", pointerEvents:"none", whiteSpace:"nowrap", transform:"translate(-50%, -100%)", border:"1px solid #7296ad"});
      container.appendChild(label); return label;
    });
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
    }
    for (const x of [-30.5, 30.5]) box(x, 0.6, 0, 0.35, 1.2, 26, "#fafafa");
    // Tiered arena bowl. Near-side seating is lower to preserve sight lines.
    const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.22,.45,2,5), new THREE.MeshStandardMaterial({roughness:1}), 1800);
    const dummy = new THREE.Object3D(); let crowdIndex = 0;
    for(let row=0;row<9;row++) {
      for(const side of [-1,1]) {
        const z=side*(18+row*1.1), y=side<0?row*.65:row*.25-1;
        box(0,y,z,74,.45,1.1,row%2?"#263b50":"#304a60");
        for(let seat=0;seat<70;seat++) {
          if(seat%14===0)continue;
          dummy.position.set(-35+seat,y+.6,z);dummy.updateMatrix();crowd.setMatrixAt(crowdIndex,dummy.matrix);
          crowd.setColorAt(crowdIndex++,new THREE.Color(seat%5===0?home.color:seat%3===0?"#cbd8e2":"#455f7c"));
        }
      }
      for(const side of [-1,1]) {
        box(side*(34+row*1.1),row*.6,0,1.1,.45,34,"#263b50");
        for(let seat=0;seat<30;seat++) {
          dummy.position.set(side*(34+row*1.1),row*.6+.6,-15+seat);dummy.updateMatrix();crowd.setMatrixAt(crowdIndex,dummy.matrix);
          crowd.setColorAt(crowdIndex++,new THREE.Color(seat%3?"#688097":home.color));
        }
      }
    }
    crowd.count=crowdIndex;scene.add(crowd);
    const reserves: {mesh:THREE.Object3D;id:string}[]=[];
    [home,away].forEach((team,side)=>{
      const center=side?9:-9;
      box(center,.45,-15,14,.4,2,"#354e63");
      box(center,1.1,-16,14,1.2,.15,"#668295");
      const roster=team.players.filter(p=>!p.injury);
      roster.forEach((p,index)=>{
        const reserve=factory.bench(kitFor(team,side===1));
        reserve.position.set(center-6+(index%12)*1.05,.45,-14.7-Math.floor(index/12)*.8);reserve.rotation.y=Math.PI;scene.add(reserve);reserves.push({mesh:reserve,id:p.id});
      });
      for(let i=0;i<3;i++) {const staff=new THREE.Mesh(new THREE.CapsuleGeometry(.3,.95,3,6),new THREE.MeshStandardMaterial({color:"#152333"}));staff.position.set(center-3+i*3,1.3,-16.5);scene.add(staff);}
    });
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
    // Seven rigs per side: up to six skaters (6v5 with the goalie pulled) + goalie.
    const kits = [kitFor(home, false), kitFor(away, true)];
    const actors: { rig: HockeyRig; side: number; slot: number }[] = [];
    [home, away].forEach((_team, side) => {
      for (let slot = 0; slot < 7; slot++) {
        const rig = slot === 6 ? factory.goalie(kits[side]) : factory.skater(kits[side]);
        rig.root.position.set((side ? 1 : -1) * (slot === 6 ? 25 : 8), 0, (slot % 3 - 1) * 5);
        rig.setVisible(false);
        scene.add(rig.root); actors.push({ rig, side, slot });
      }
    });
    const playerOf = (side: number, id: string) => [home, away][side].players.find(p => p.id === id);
    const byBody = new Map<string, HockeyRig>();
    let seenCue = data0?.cues.at(-1)?.seq ?? 0;
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12), new THREE.MeshStandardMaterial({ color: "#111111" }));
    puck.position.y = 0.1; scene.add(puck);
    const resize = () => {
      const width = Math.max(1, container.clientWidth), height = Math.max(320, container.clientHeight);
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    let frame = 0, previous = performance.now();
    const lookAt = new THREE.Vector3(), desired = new THREE.Vector3();
    // Cameras follow a heavily smoothed focus point, not the raw puck: simulation
    // frames arrive in coarse steps (especially at high speed) and the puck can
    // change direction instantly, which would otherwise shake the view.
    const focus = new THREE.Vector3(), lookSmooth = new THREE.Vector3(0, 0, 0);
    let cameraReady = false;
    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - previous) / 1000); previous = now;
      const data = current.current;
      // Stride cadence tracks playback speed up to a readable limit.
      const animDt = data.running ? dt * Math.min(Math.max(1, data.playback), 2.5) : 0;
      const x = data.event ? (data.event.x / 100 - 0.5) * 56 : 0;
      const z = data.event ? (data.event.y / 100 - 0.5) * 23 : 0;
      byBody.clear();
      if (data.spatial) {
        const frameData = data.spatial;
        // Ease the puck between 10 Hz simulation frames; snap on faceoff resets.
        if (Math.hypot(frameData.puck.x - puck.position.x, frameData.puck.z - puck.position.z) > 8) puck.position.set(frameData.puck.x, frameData.puck.y, frameData.puck.z);
        else {
          const kp = 1 - Math.exp(-dt * 16);
          puck.position.set(puck.position.x + (frameData.puck.x - puck.position.x) * kp, frameData.puck.y, puck.position.z + (frameData.puck.z - puck.position.z) * kp);
        }
        actors.forEach(({ rig, side, slot }) => {
          const bodies = frameData.bodies.filter(b => b.side === side);
          const body = slot === 6 ? bodies.find(b => b.goalie) : bodies.filter(b => !b.goalie)[slot];
          rig.setVisible(!!body);
          if (!body) return;
          const player = playerOf(side, body.id);
          if (player) rig.setIdentity({ id: player.id, name: player.name, number: player.number }, player.pos);
          byBody.set(body.id, rig);
          rig.update(dt, animDt, { x: body.x, z: body.z, vx: body.vx, vz: body.vz, puckX: puck.position.x, puckZ: puck.position.z, hasPuck: frameData.carrierId === body.id });
        });
        // One-shot animations raised by the simulation (each cue plays once).
        for (const cue of frameData.cues) {
          if (cue.seq <= seenCue) continue;
          seenCue = cue.seq;
          if (!data.running && cue.kind !== "faceoff") continue;
          const actor = byBody.get(cue.id), other = cue.target ? byBody.get(cue.target) : undefined;
          const at = (id?: string) => frameData.bodies.find(b => b.id === id);
          if (cue.kind === "shot" || cue.kind === "pass") actor?.trigger(cue.kind);
          else if (cue.kind === "check") { actor?.trigger("check"); other?.trigger("checked"); }
          else if (cue.kind === "goal") { actor?.trigger("celebrate"); other?.trigger("conceded"); }
          else if (cue.kind === "penalty") actor?.trigger("protest");
          else if (cue.kind === "faceoff") actor?.trigger("faceoff");
          else if (cue.kind === "save") {
            const keeper = at(cue.id), shooter = at(cue.target);
            actor?.trigger("save", keeper && shooter ? { x: shooter.x - keeper.x, z: shooter.z - keeper.z } : undefined);
          }
        }
      } else if (data.running) {
        puck.position.lerp(new THREE.Vector3(x, 0.1, z), Math.min(1, dt * 5));
        actors.forEach(({ rig, side, slot }) => {
          const ids = data.event?.skaters?.[side];
          rig.setVisible(slot === 6 ? (ids?.length ?? 5) < 6 : slot < (ids?.length ?? 5));
          const id = ids?.[slot];
          const player = id ? playerOf(side, id) : slot === 6 ? [home, away][side].players.find(p => p.id === [home, away][side].goalie) : undefined;
          if (player) rig.setIdentity({ id: player.id, name: player.name, number: player.number }, player.pos);
          const carrier = data.event?.team === [home.id, away.id][side] && id === data.event.playerId;
          const tx = slot === 6 ? (side ? 25 : -25) : carrier ? x : Math.max(-27, Math.min(27, x * 0.55 + (side ? 1 : -1) * (slot < 3 ? 5 : 12)));
          const tz = slot === 6 ? z * 0.07 : carrier ? z + 0.6 : (slot % 3 - 1) * 6 + z * 0.25;
          const here = rig.root.position;
          rig.update(dt, animDt, { x: here.x + (tx - here.x) * Math.min(1, dt * 2), z: here.z + (tz - here.z) * Math.min(1, dt * 2), vx: (tx - here.x) * 0.8, vz: (tz - here.z) * 0.8, puckX: puck.position.x, puckZ: puck.position.z, hasPuck: carrier });
        });
      }
      // Focus drifts toward the puck slowly (time-based, frame-rate independent).
      const tx = Math.max(-26, Math.min(26, puck.position.x)), tz = Math.max(-10, Math.min(10, puck.position.z));
      if (!cameraReady) focus.set(tx, 0, tz);
      else focus.lerp(_focusTarget.set(tx, 0, tz), 1 - Math.exp(-dt * 1.6));
      if (mode.current === "overhead") { desired.set(0, 65, 0.1); lookAt.set(0, 0, 0); }
      else if (mode.current === "follow") { desired.set(focus.x * 0.45, 26, 31); lookAt.set(focus.x * 0.35, 0, 0); }
      else if (mode.current === "close") { desired.set(focus.x * 0.9, 7, focus.z * 0.5 + 10.5); lookAt.set(focus.x, 0.8, focus.z); }
      else { desired.set(0, 45, 38); lookAt.set(0, 0, 0); }
      if (!cameraReady) { cameraReady = true; lookSmooth.copy(lookAt); }
      const kc = 1 - Math.exp(-dt * (mode.current === "close" ? 3 : 4));
      camera.position.lerp(desired, kc); lookSmooth.lerp(lookAt, kc); camera.lookAt(lookSmooth);
      const bodies=data.spatial?.bodies??[];
      reserves.forEach(r=>{r.mesh.visible=!bodies.some(b=>b.id===r.id);});
      const labelled=[bodies.find(b=>b.id===data.spatial?.carrierId),...bodies.filter(b=>b.goalie)];
      labels.forEach((label,index)=>{
        const body=labelled[index];if(!body){label.style.display="none";return;}
        const point=new THREE.Vector3(body.x,2.5,body.z).project(camera);
        label.style.display=point.z>1?"none":"block";
        label.style.left=`${(point.x*.5+.5)*container.clientWidth}px`;label.style.top=`${(-point.y*.5+.5)*container.clientHeight}px`;
        const p=[home,away][body.side].players.find(p=>p.id===body.id);
        label.textContent=`${index===0?"● ":"G · "}${p?.name??""}`;label.style.borderColor=index===0?"#f1c958":"#7296ad";
      });
      renderer.render(scene, camera); frame = requestAnimationFrame(animate);
    };
    camera.position.set(0, 38, 45); frame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      actors.forEach(({ rig }) => rig.dispose());
      cancelAnimationFrame(frame); observer.disconnect();
      // Rig geometry/materials are shared and owned by the factory.
      scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); } });
      factory.dispose();
      labels.forEach(label=>label.remove());renderer.dispose(); renderer.domElement.remove();
    };
  }, [home.id, away.id]);
  return <div>
    <div style={{ display: "flex", gap: 8, padding: 12 }}>
      <label>Камера <select value={cameraMode} onChange={e => setCameraMode(e.target.value)}>
        <option value="broadcast">Трансляция</option><option value="overhead">Тактическая</option><option value="follow">За шайбой</option><option value="close">Крупный план</option>
      </select></label>
      <span style={{ marginLeft: "auto", color: "#8aa7bd" }}>3D · {home.id} / {away.id}</span>
    </div>
    <div ref={host} style={{ position:"relative", overflow:"hidden", height: "clamp(320px, 45vw, 580px)", width: "100%" }} role="img" aria-label="Трёхмерная хоккейная площадка">
      {unavailable && <p>3D недоступен: включите аппаратное ускорение или выберите режим 2D.</p>}
    </div>
  </div>;
}
