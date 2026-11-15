import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { Event, Team } from "../engine/types";
import type { SpatialFrame } from "../engine/spatialMatch";

/** Event-driven presentation layer. Does not invent or modify match results. */
export default function MatchArena3D({ home, away, event, running, spatial }: {
  home: Team; away: Team; event?: Event; running: boolean; spatial?: SpatialFrame;
}) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ event, running, spatial });
  current.current = { event, running, spatial };
  const [cameraMode, setCameraMode] = useState("broadcast");
  const mode = useRef(cameraMode);
  mode.current = cameraMode;
  const [unavailable, setUnavailable] = useState(false);
  const [assetStatus, setAssetStatus] = useState("Загрузка моделей…");
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setUnavailable(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    let disposed = false;
    setAssetStatus("Загрузка моделей…");
    const mixers: { mixer: THREE.AnimationMixer; group: THREE.Group; last: THREE.Vector3; goalie: boolean }[] = [];
    const assetRoots: THREE.Object3D[] = [];
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
    const reserves: {mesh:THREE.Mesh;id:string}[]=[];
    [home,away].forEach((team,side)=>{
      const center=side?9:-9;
      box(center,.45,-15,14,.4,2,"#354e63");
      box(center,1.1,-16,14,1.2,.15,"#668295");
      const roster=team.players.filter(p=>!p.injury);
      roster.forEach((p,index)=>{
        const reserve=new THREE.Mesh(new THREE.CapsuleGeometry(.26,.55,3,6),new THREE.MeshStandardMaterial({color:side?"#eeeeee":team.color}));
        reserve.position.set(center-6+(index%12)*1.05,1,-14.4-Math.floor(index/12)*.8);scene.add(reserve);reserves.push({mesh:reserve,id:p.id});
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
    const actors: { group: THREE.Group; side: number; slot: number }[] = [];
    [home, away].forEach((team, side) => {
      for (let slot = 0; slot < 7; slot++) {
        const group = new THREE.Group();
        group.position.set((side ? 1 : -1) * (slot === 6 ? 25 : 8), 0, (slot % 3 - 1) * 5);
        scene.add(group); actors.push({ group, side, slot });
      }
    });
    const loader = new GLTFLoader();
    Promise.all(["skater", "goalie"].map(name => loader.loadAsync(`/models/hockey/${name}-study.glb`))).then(assets => {
      const release = (root: THREE.Object3D) => root.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => m.dispose());
        }
      });
      if (disposed) { assets.forEach(asset => release(asset.scene)); return; }
      assets.forEach(asset => assetRoots.push(asset.scene));
      actors.forEach(({group, side, slot}) => {
        const asset = assets[slot === 6 ? 1 : 0];
        const model = clone(asset.scene);
        // Blender forward is -Y, exported glTF forward is +Z.
        model.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          object.material = materials.map(source => {
            const material = source.clone();
            if (material instanceof THREE.MeshStandardMaterial && material.name.startsWith("Jersey")) material.color.set(side ? "#e8edf3" : home.color);
            return material;
          });
          // Demonstration identities must not masquerade as career player names.
          if (["NORTH","SKATER","KEEPER","27","31"].includes(object.name)) object.visible = false;
          object.frustumCulled = false;
        });
        group.add(model);
        const mixer = new THREE.AnimationMixer(model);
        if (slot !== 6 && asset.animations[0]) mixer.clipAction(asset.animations[0]).play();
        mixers.push({mixer,group,last:group.position.clone(),goalie:slot===6});
      });
      setAssetStatus("");
    }).catch(() => { if (!disposed) setAssetStatus("Не удалось загрузить модели. Обновите страницу для повторной загрузки."); });
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
      if (data.spatial) {
        puck.position.set(data.spatial.puck.x, data.spatial.puck.y, data.spatial.puck.z);
        actors.forEach(({ group, side, slot }) => {
          const bodies = data.spatial!.bodies.filter(b => b.side === side);
          const body = slot === 6 ? bodies.find(b => b.goalie) : bodies.filter(b => !b.goalie)[slot];
          group.visible = !!body;
          if (body) { group.position.set(body.x, 0, body.z); if (Math.hypot(body.vx, body.vz) > 0.1) group.rotation.y = Math.atan2(body.vx, body.vz); }
        });
      } else if (data.running) {
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
      const desired = mode.current === "overhead" ? new THREE.Vector3(0, 65, 0.1) : mode.current === "follow" ? new THREE.Vector3(puck.position.x * 0.45, 26, 31) : new THREE.Vector3(0, 45, 38);
      camera.position.lerp(desired, 0.08); camera.lookAt(mode.current === "follow" ? puck.position.x * 0.35 : 0, 0, 0);
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
      mixers.forEach(actor => {
        const speed = actor.group.position.distanceTo(actor.last) / Math.max(dt, .001);
        actor.last.copy(actor.group.position);
        if (data.running && actor.group.visible && !actor.goalie && speed > .1) actor.mixer.update(dt * Math.min(2, speed / 3));
      });
      renderer.render(scene, camera); frame = requestAnimationFrame(animate);
    };
    camera.position.set(0, 38, 45); frame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      mixers.forEach(({mixer}) => { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); });
      assetRoots.forEach(root => root.traverse(object => { if (object instanceof THREE.Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => m.dispose()); }));
      cancelAnimationFrame(frame); observer.disconnect();
      scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); } });
      labels.forEach(label=>label.remove());renderer.dispose(); renderer.domElement.remove();
    };
  }, [home.id, away.id]);
  return <div>
    <div style={{ display: "flex", gap: 8, padding: 12 }}>
      <label>Камера <select value={cameraMode} onChange={e => setCameraMode(e.target.value)}>
        <option value="broadcast">Трансляция</option><option value="overhead">Тактическая</option><option value="follow">За шайбой</option>
      </select></label>
      <span style={{ marginLeft: "auto", color: "#8aa7bd" }}>3D · {home.id} / {away.id}</span>
    </div>
    <div ref={host} style={{ position:"relative", overflow:"hidden", height: "clamp(320px, 45vw, 580px)", width: "100%" }} role="img" aria-label="Трёхмерная хоккейная площадка">
      {unavailable && <p>3D недоступен: включите аппаратное ускорение или выберите режим 2D.</p>}
      {assetStatus && !unavailable && <p style={{position:"absolute",top:12,left:12,background:"#101b2b",padding:12}} role="status">{assetStatus}</p>}
    </div>
  </div>;
}
