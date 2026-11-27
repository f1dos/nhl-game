import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Event, Team } from "../engine/types";
import type { SkaterBody, SpatialFrame, SpatialStoppage } from "../engine/spatialMatch";
import { BENCH, PENALTY_BOX, RINK, separateSkaters } from "../engine/rink";
import { clearSkaterNet, skaterNetRoute } from "../engine/goalGeometry";
import { RigFactory, type RigState } from "./hockeyRig";
import { type RigLike } from "./skinnedRig";
import { TrackSmoother } from "./motionSmoothing";
import { buildArena, insideBoards } from "./arenaScene";
import { MatchNightFactory } from "./matchNightRig";
import { CAMERA_MODES, type CameraMode } from "./cameraModes";
import { gameAudio } from "./audio";
import { buildIceFx, buildPost, enableShadows, tickShadows } from "./arenaFx";
import { BroadcastDirector } from "./broadcastDirector";
import Select from "./Select";
export { CAMERA_MODES, type CameraMode };

export { kitFor } from "./teamKit";
import { kitFor } from "./teamKit";

/** Skinned FM-style models by default; `?rig=classic` keeps the primitive figures. */
function makeFactory() {
  const classic = typeof location !== "undefined" && new URLSearchParams(location.search).get("rig") === "classic";
  if (classic) return new RigFactory();
  try {
    return new MatchNightFactory();
  } catch {
    return new RigFactory();
  }
}

const refereeAudio={
  ru:{holding:new URL("../assets/match-night/ru-holding.wav",import.meta.url).href,roughing:new URL("../assets/match-night/ru-roughing.wav",import.meta.url).href},
  en:{holding:new URL("../assets/match-night/en-holding.wav",import.meta.url).href,roughing:new URL("../assets/match-night/en-roughing.wav",import.meta.url).href}
};
const _focusTarget = new THREE.Vector3();
const _v = new THREE.Vector3();

/** Players dressed for the game: four lines, three pairs and the goalies. */
function dressed(team: Team) {
  const ids = [...team.lines.flat(), ...team.defense.flat()];
  const goalies = team.players.filter((p) => p.pos === "G" && !p.injury).slice(0, 2).map((p) => p.id);
  const list = [...new Set([...ids, ...goalies])]
    .map((id) => team.players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p && !p.injury);
  return list.sort((a, b) => Number(a.pos === "G") - Number(b.pos === "G") || Number(a.pos === "D") - Number(b.pos === "D"));
}

/** A referee or linesman who skates after play and runs faceoffs. */
interface Official {
  rig: RigLike;
  role: "referee" | "linesman";
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/**
 * Event-driven presentation layer for the live match: it renders what the
 * simulation reports and never invents or changes a result.
 */
export default function MatchArena3D({ home, away, event, running, spatial, playback = 1, camera: cameraProp, onCamera, reviewMode=false, height, language = "ru", scoreboard }: {
  home: Team; away: Team; event?: Event; running: boolean; spatial?: SpatialFrame; playback?: number;
  /** Controlled camera; when omitted the arena shows its own camera menu. */
  reviewMode?:boolean;
  camera?: CameraMode; onCamera?: (mode: CameraMode) => void;
  /** CSS height of the view; defaults to a responsive panel height. */
  height?: string; language?: "ru" | "en";
  /** Live score for the centre-hung scoreboard. */
  scoreboard?: { home: number; away: number; clock: string; period: string };
}) {
  const host = useRef<HTMLDivElement>(null);
  const scoreRef = useRef(scoreboard);
  scoreRef.current = scoreboard;
  const current = useRef({ event, running, spatial, playback, reviewMode });
  current.current = { event, running, spatial, playback, reviewMode };
  const [ownCamera, setOwnCamera] = useState<CameraMode>("broadcast");
  const cameraMode = cameraProp ?? ownCamera;
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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.matrixWorldAutoUpdate=false;
    const factory = makeFactory();
    const arena = buildArena(scene, home, away);
    renderer.toneMappingExposure = arena.preset.exposure;
    const quality = new URLSearchParams(location.search).get("quality") === "low" ? "low" : "high";
    if (quality === "high") enableShadows(renderer, scene);
    const iceFx = buildIceFx(scene, arena.ice, quality);
    let lastPeriod = "";
    let frameNo = 0;
    const directRender = quality === "low";
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 260);
    camera.layers.enable(1);
    const kits = [kitFor(home, false), kitFor(away, true)];
    const teams = [home, away];
    const rosters = teams.map(team => new Map(team.players.map(player => [player.id, player])));
    const playerOf = (side: number, id: string) => rosters[side].get(id);

    // --- on-ice actors: up to six skaters (6v5 with the goalie pulled) + goalie
    const actors: { rig: RigLike; side: number; slot: number }[] = [];
    teams.forEach((_team, side) => {
      for (let slot = 0; slot < 7; slot++) {
        const rig = slot === 6 ? factory.goalie(kits[side]) : factory.skater(kits[side]);
        rig.setVisible(false);
        scene.add(rig.root); actors.push({ rig, side, slot });
      }
    });
    // --- benches: every dressed player has a seat and a full figure. Players
    // skate between the ice, their bench gate and the penalty box.
    type Spot = { x: number; z: number };
    interface Member { rig: RigLike; id: string; side: number; seatX: number; mode: "seat" | "moving" | "box"; x: number; z: number; vx: number; vz: number; path: Spot[]; vault?: boolean; boxSeat?: Spot }
    const bench: Member[] = [];
    const memberOf = new Map<string, Member>();
    teams.forEach((team, side) => {
      const list = dressed(team);
      const span = BENCH.halfLength * 2 - 0.8;
      list.forEach((p, i) => {
        const rig = p.pos === "G" ? factory.goalie(kits[side]) : factory.skater(kits[side]);
        rig.setIdentity(p, p.pos);
        const seatX = BENCH.centerX[side] - span / 2 + (span * i) / Math.max(1, list.length - 1);
        rig.place(seatX, BENCH.seatZ, 0);
        rig.setState("seated", (i * 0.37) % 1);
        scene.add(rig.root);
        const m: Member = { rig, id: p.id, side, seatX, mode: "seat", x: seatX, z: BENCH.seatZ, vx: 0, vz: 0, path: [] };
        bench.push(m);
        memberOf.set(p.id, m);
      });
    });
    const benchDoor = (m: Member): Spot => ({ x: BENCH.centerX[m.side], z: BENCH.doorZ });
    const boxDoor = (side: number): Spot => ({ x: PENALTY_BOX.centerX[side], z: PENALTY_BOX.doorZ });
    // --- coaches: head coach and assistant behind each bench, on the step
    const coaches = teams.flatMap((team, side) => ["Head coach","Forwards coach","Defence coach","Athletic trainer","Equipment manager"].map((role,k) => {
      const rig:RigLike = factory.coach(team.color, ["#202a38","#353b48","#27364a","#364e5a","#2e3239"][k]);
      rig.setIdentity({ id: `${team.id}-coach-${k}`, name: role, number: 0 }, "C");
      const x = BENCH.centerX[side] + [0,-2.2,2.3,-4.8,4.9][k];
      rig.root.position.y = 0.25;
      rig.place(x, BENCH.seatZ - 1.35, 0);
      scene.add(rig.root);
      return { rig, side, head: k === 0, assistant:k===1 || k===2, x };
    }));
    const prevOnIce = new Set<string>();
    let icePrimed = false;
    const lastIce = new Map<string, Spot>();
    const entering = new Map<string, { dx: number; dz: number; t: number; vaultX?: number }>();
    // --- officials: two referees (orange armbands) and two linesmen
    const officials: Official[] = (["referee", "referee", "linesman", "linesman"] as const).map((role, i) => {
      const rig = factory.official(role);
      rig.setIdentity({ id: `official-${i}`, name: role, number: [12, 27, 64, 91][i] }, "C");
      const o: Official = { rig, role, x: [-14, 14, -9, 9][i], z: [10, -10, 11, -11][i], vx: 0, vz: 0 };
      rig.place(o.x, o.z, 0);
      scene.add(rig.root);
      return o;
    });
    const figures: RigLike[] = [...actors, ...bench, ...officials, ...coaches].map(({rig}) => rig);
    let boundsFrame = -1;
    scene.onBeforeRender = () => {
      // World matrices are now current. The reflection camera and shadow pass
      // reuse these camera-independent bounds for the same animation frame.
      if (boundsFrame === frameNo) return;
      for (const rig of figures) rig.updateRenderBounds?.();
      boundsFrame = frameNo;
    };
    const [refA, refB, lineA, lineB] = officials;
    // Keep the three observing officials in their own lanes throughout the
    // draw. Only the administering linesman occupies the circle.
    const drawStation = (o:Official,d:Spot):Spot => {
      const end=d.x<0 ? -1 : 1;
      if(o===lineA) return {x:d.x,z:d.z-.78};
      if(o===lineB) return {x:d.x-end*7,z:10.9};
      if(o===refA) return {x:THREE.MathUtils.clamp(d.x+end*12,-26,26),z:-10.4};
      return {x:THREE.MathUtils.clamp(d.x-end*13,-26,26),z:10.5};
    };
    if(data0?.stoppage?.phase==="lineup"){
      const dot=data0.stoppage.dot;
      for(const o of officials){
        Object.assign(o,drawStation(o,dot));
        o.rig.place(o.x,o.z,Math.atan2(dot.x-o.x,dot.z-o.z));
      }
    }
    let retreat:Spot|undefined;

    const byBody = new Map<string, RigLike>();
    let replayCue=0,previousAngle=-1;
    let filmCue=0, filmTick=0;
    let seenCue = data0?.cues.at(-1)?.seq ?? 0;
    const microphone=new Audio();
    let penaltyRoute:{stop:SpatialStoppage;x:number;z:number;wingX:number;wingZ:number}|undefined;
    let calledPenalty:SpatialStoppage|undefined;
    const dropFrom=new THREE.Vector3();
    let dropReleased = false;
    const bladePosition=new THREE.Vector3(),lastBlade=new THREE.Vector3(),releaseError=new THREE.Vector3();
    let bladeOwner:string|undefined,releaseAge=1;
    let lastSave: "glove" | "other" = "other";
    const puck = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0,-.0127),new THREE.Vector2(.0366,-.0127),new THREE.Vector2(.0381,-.0112),
      new THREE.Vector2(.0381,.0112),new THREE.Vector2(.0366,.0127),new THREE.Vector2(0,.0127),
    ],32), new THREE.MeshStandardMaterial({ color: "#151518", roughness: .83 }));
    puck.position.y = 0.04; scene.add(puck);
    let puckY = 0.04;
    const post = buildPost(renderer, scene, camera, arena.preset.bloom);
    const resize = () => {
      const width = Math.max(1, container.clientWidth), h = Math.max(240, container.clientHeight);
      renderer.setSize(width, h); post.setSize(width, h); camera.aspect = width / h; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    let frame = 0, previous = performance.now();
    let wasRunning: boolean | undefined;
    const benchUp = [0, 0];
    const running = (d: { running: boolean }) => d.running;
    const spray = new SnowSpray(scene);
    let lastStop = "";
    const leaveArena = gameAudio.enterArena();
    const director = new BroadcastDirector();
    const replayBadge = document.createElement("div");
    replayBadge.textContent = language === "en" ? "REPLAY" : "ПОВТОР";
    Object.assign(replayBadge.style, { position: "absolute", top: "86px", right: "24px", padding: "6px 14px", background: "#c8102e", color: "white", font: "800 14px Inter, Arial, sans-serif", letterSpacing: "0.14em", borderRadius: "3px", display: "none", pointerEvents: "none", boxShadow: "0 6px 18px #0008" });
    container.appendChild(replayBadge);
    const lookAt = new THREE.Vector3(), desired = new THREE.Vector3();
    // Cameras follow a smoothed focus point, never the raw puck, so the view
    // stays steady while the simulation publishes coarse steps.
    const focus = new THREE.Vector3(), lookSmooth = new THREE.Vector3(0, 0, 0);
    let zoom = 0;
    let cameraReady = false;
    const tracks = new Map<string, TrackSmoother>(), puckTrack = new TrackSmoother();
    let lastTick = -1;
    const label = document.createElement("div");
    Object.assign(label.style, { position: "absolute", padding: "4px 9px", borderRadius: "4px", background: "#0b1624e6", color: "white", fontSize: "12px", fontWeight: "700", pointerEvents: "none", whiteSpace: "nowrap", transform: "translate(-50%, -100%)", borderLeft: "3px solid #f1c958", display: "none" });
    container.appendChild(label);

    /** Attack direction of a side, read from where its goalie stands. */
    const attack = (frameData: SpatialFrame, side: number) => {
      const g = frameData.bodies.find(b => b.side === side && b.goalie);
      if (g) return g.x > 0 ? -1 : 1;
      const other = frameData.bodies.find(b => b.side !== side && b.goalie);
      return other ? (other.x > 0 ? 1 : -1) : side ? -1 : 1;
    };
    /** Bench lies on the -z side: +1 if it is on the skater's left. */
    const benchSide = (vx: number, vz: number) => (Math.atan2(vx, vz) > 0 ? 1 : -1);
    const drawTaker=(frameData:SpatialFrame,side:number)=>
      frameData.bodies.find(b=>b.side===side && playerOf(side,b.id)?.pos==="C") ??
      frameData.bodies.find(b=>b.side===side && !b.goalie);

    const skaterState = (body: SkaterBody, s: SpatialStoppage | undefined, frameData: SpatialFrame): { state: RigState; variant?: number; side?: number; face?: number } => {
      if (!s) {
        if (body.goalie) {
          const forward=attack(frameData,body.side);
          const angle=Math.atan2(frameData.puck.z-body.z,Math.max(1.4,forward*(frameData.puck.x-body.x)));
          return {state:"play",face:forward*(Math.PI/2-THREE.MathUtils.clamp(angle,-1.15,1.15))};
        }
        // A defender giving ground inside the rush stays square to the carrier.
        const carrier = frameData.bodies.find(p => p.id === frameData.carrierId);
        if (carrier && carrier.side !== body.side && !body.goalie) {
          const dx = carrier.x - body.x, dz = carrier.z - body.z;
          if (dx * attack(frameData, body.side) > 0 && Math.hypot(dx, dz) < 7 &&
              body.vx * dx + body.vz * dz < 0)
            return { state: "play", face: Math.atan2(dx, dz) };
        }
        return { state: "play" };
      }
      if (s.phase === "lineup" || s.phase === "drop") {
        const taker = drawTaker(frameData, body.side);
        const dirX = attack(frameData, body.side);
        if (taker?.id===body.id && Math.hypot(body.x-s.dot.x,body.z-s.dot.z)<2.1)
          return { state: "faceoff-stance", face: Math.atan2(s.dot.x - body.x, s.dot.z - body.z) };
        return { state: "faceoff-ready", face: Math.atan2(s.dot.x-body.x+dirX*1.5,s.dot.z-body.z) };
      }
      if (s.phase === "review") return {state:"faceoff-ready"};
      if (s.kind === "goal") {
        if (body.side === s.side) {
          if (body.goalie) return { state: "play" };
          const scorer=frameData.bodies.find(b=>b.id===s.actor);
          if(s.variant>=1/3 && s.t>=4.4) {
            const atRail=body.z < -RINK.boardsZ+1 && Math.abs(body.x-BENCH.centerX[s.side])<BENCH.halfLength;
            return atRail ? {state:"fist-bump",side:benchSide(body.vx,body.vz)} : {state:"play"};
          }
          const partner = scorer===body ? frameData.bodies.find(b=>b.side===body.side && b!==body && !b.goalie && Math.hypot(b.x-body.x,b.z-body.z)<1.4) : scorer;
          if (s.t >= 2.2 && partner && Math.hypot(body.x-partner.x,body.z-partner.z)<1.55)
            return { state:"hug", face:Math.atan2(partner.x-body.x,partner.z-body.z) };
          return body.id === s.actor ? { state: "celebrate", variant: s.variant } : { state: "play" };
        }
        return body.goalie ? { state: "goalie-beaten", variant: s.variant } : { state: "dejected" };
      }
      if (s.kind === "save" && body.id === s.actor) return { state: "goalie-hold", variant: lastSave === "glove" ? 1 : 0 };
      return { state: "play" };
    };

    let traffic:readonly SkaterBody[]=[];
    const moveOfficial = (o: Official, tx: number, tz: number, dt: number, maxSpeed = 8.5) => {
      const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz);
      const speed = Math.min(maxSpeed, d * 1.4);
      const k = Math.min(1, dt * 3);
      o.vx += ((d > 0.05 ? (dx / d) * speed : 0) - o.vx) * k;
      o.vz += ((d > 0.05 ? (dz / d) * speed : 0) - o.vz) * k;
      for(const b of traffic){
        const rx=o.x-b.x,rz=o.z-b.z;
        const vx=o.vx-b.vx,vz=o.vz-b.vz;
        const ahead=THREE.MathUtils.clamp(-(rx*vx+rz*vz)/(vx*vx+vz*vz+.001),0,.38);
        const sx=rx+vx*ahead,sz=rz+vz*ahead,gap=Math.hypot(sx,sz);
        if(gap>=1.12 || rx*vx+rz*vz>=0)continue;
        const len=Math.hypot(rx,rz)||1;
        const nx=gap>.2 ? sx/gap : rx/len,nz=gap>.2 ? sz/gap : rz/len;
        const yieldSpeed=(1.12-gap)*Math.min(1,dt*12)*6;
        o.vx+=nx*yieldSpeed;o.vz+=nz*yieldSpeed;
      }
      o.x = Math.max(-29.5, Math.min(29.5, o.x + o.vx * dt));
      o.z = Math.max(-12.4, Math.min(12.4, o.z + o.vz * dt));
    };

    const animate = (now: number) => {
      const wallDt = Math.max(0,(now - previous)/1000);
      const dt = Math.min(.05, wallDt); previous = now;
      const data = current.current;
      // Stride cadence tracks playback speed up to a readable limit.
      const animDt = data.running ? dt * Math.min(Math.max(1, data.playback), 2.5) : 0;
      // Stoppage choreography always plays at a natural speed.
      const showDt = data.running ? dt * Math.min(Math.max(1, data.playback), 1.6) : 0;
      byBody.clear();
      const liveFrame = data.spatial;
      if (liveFrame && !data.reviewMode) director.record(liveFrame, now / 1000);
      // During a goal replay the figures show recorded frames.
      const frameData = data.reviewMode ? liveFrame : director.frameFor(liveFrame, data.running ? Math.min(wallDt,.4) : 0);
      const stoppage = frameData?.stoppage;
      if (stoppage?.phase === "lineup") dropReleased = false;
      const liveStop = liveFrame?.stoppage;
      const review = liveStop?.review;
      const showReview = review && liveStop?.phase !== "lineup" && liveStop?.phase !== "drop";
      replayBadge.classList.remove("referee-announcement");
      replayBadge.textContent = showReview
        ? liveStop?.phase === "review" && liveStop.t < 5.6
          ? (language==="en" ? "VIDEO REVIEW" : "ВИДЕОПРОСМОТР")
          : review==="confirmed" ? (language==="en" ? "GOOD GOAL" : "ГОЛ ЗАСЧИТАН") : (language==="en" ? "NO GOAL · INTERFERENCE" : "ГОЛ ОТМЕНЁН · ПОМЕХА ВРАТАРЮ")
        : (language==="en" ? "REPLAY" : "ПОВТОР");
      replayBadge.style.display = director.replaying || showReview ? "block" : "none";
      if (data.running !== wasRunning) { wasRunning = data.running; gameAudio.setRunning(data.running); }
      const stopKey = stoppage ? `${stoppage.kind}:${stoppage.phase}:${stoppage.actor}` : "";
      if (stopKey !== lastStop) {
        lastStop = stopKey;
        if (data.running && stoppage?.phase === "lineup") gameAudio.react("lineup");
      }
      if (frameData) {
        const stamp = now;
        if (frameData.tick !== lastTick) {
          lastTick = frameData.tick;
          puckTrack.push(frameData.tick, frameData.puck.x, frameData.puck.z, stamp);
          frameData.bodies.forEach(b => {
            let track = tracks.get(b.id);
            if (!track) { track = new TrackSmoother(); tracks.set(b.id, track); }
            track.push(frameData.tick, b.x, b.z, stamp);
          });
        }
        puckTrack.sample(stamp);
        // --- skaters on the ice
        const skaters: SkaterBody[][] = [[], []];
        const goalies: (SkaterBody | undefined)[] = [];
        for (const body of frameData.bodies) {
          if (body.goalie) goalies[body.side] = body;
          else skaters[body.side].push(body);
        }
        actors.forEach(({ rig, side, slot }) => {
          const body = slot === 6 ? goalies[side] : skaters[side][slot];
          rig.setVisible(!!body);
          if (!body) return;
          const player = playerOf(side, body.id);
          const swapped = rig.root.userData.playerId !== body.id;
          if (swapped && player) {
            rig.setIdentity(player, player.pos);
            rig.root.userData.playerId = body.id;
          }
          byBody.set(body.id, rig);
          const look = skaterState(body, stoppage, frameData);
          rig.setState(look.state, look.variant ?? 0, look.side ?? 1);
          const track = tracks.get(body.id)?.sample(stamp);
          let x = track?.x ?? body.x, z = track?.z ?? body.z;
          // A player stepping on mid-play comes over the boards from his gate
          // (or the penalty box) and skates into his logical position.
          if (!data.reviewMode && icePrimed && !prevOnIce.has(body.id) && !body.goalie) {
            const m = memberOf.get(body.id);
            const from = m ? (m.mode === "box" ? boxDoor(m.side) : benchDoor(m)) : undefined;
            if (from && (stoppage || Math.abs(body.z - BENCH.frontZ) > 2)) entering.set(body.id, { dx: from.x - x, dz: from.z - z, t: 0 });
            else if (Math.abs(body.z-BENCH.frontZ) < 2)
              entering.set(body.id, { dx: 0, dz: 0, t: 0, vaultX: BENCH.centerX[side]-2.05 });
          }
          const enter = data.reviewMode ? undefined : entering.get(body.id);
          if (enter) {
            enter.t += (data.running ? dt : 0) * Math.min(Math.max(1, data.playback), 2.5);
            const k = 1 - smoothstep(enter.t / 1.3);
            if (enter.vaultX !== undefined) {
              const landing = smoothstep(Math.max(0,(enter.t-.78)/.52));
              x = THREE.MathUtils.lerp(enter.vaultX,x,landing);
              const cross = smoothstep(Math.min(1,enter.t/.78));
              z = THREE.MathUtils.lerp(THREE.MathUtils.lerp(-RINK.boardsZ-.82,BENCH.doorZ,cross),z,landing);
            } else { x += enter.dx * k; z += enter.dz * k; }
            if (enter.t >= 1.3) entering.delete(body.id);
          }
          const inside = enter?.vaultX !== undefined ? {x,z} : insideBoards(x, z);
          const safe = clearSkaterNet(swapped ? inside : lastIce.get(body.id) ?? inside, inside);
          if (swapped) rig.place(safe.x, safe.z, look.face ?? Math.atan2(body.vx, body.vz || .01));
          lastIce.set(body.id, safe);
          const carrying = frameData.carrierId === body.id;
          let pressure: number | undefined, pressureBearing: number | undefined;
          if(carrying || Math.hypot(frameData.puck.x-body.x,frameData.puck.z-body.z)<3){
            for(const rival of skaters[1-side]){
              const dx=rival.x-body.x, dz=rival.z-body.z, gap=Math.hypot(dx,dz);
              if(pressure===undefined || gap<pressure){pressure=gap; pressureBearing=Math.atan2(dx,dz);}
            }
          }
          rig.update(dt, stoppage ? showDt : animDt, { x: safe.x, z: safe.z, vx: body.vx, vz: body.vz, puckX: stoppage?.dot.x ?? frameData.puck.x, puckZ: stoppage?.dot.z ?? frameData.puck.z, hasPuck: carrying, vault: enter?.vaultX !== undefined ? Math.min(1,enter.t/.78) : undefined, face: enter?.vaultX !== undefined && enter.t<.78 ? 0 : look.face, pressure, pressureBearing, nearBoards: carrying && (Math.abs(body.z) > 10.3 || Math.abs(body.x) > 26.5) });
          const mo = rig.motion;
          if (mo?.stopping && running(data)) spray.emit(inside.x, inside.z, mo.yaw, dt);
        });
        // --- one-shot animations raised by the simulation (each cue plays once)
        if(director.replayAngle!==previousAngle){replayCue=0;previousAngle=director.replayAngle;}
        if(data.reviewMode && (frameData.tick>filmTick || frameData.tick===-1 && filmTick!==-1))filmCue=0;
        filmTick=data.reviewMode?frameData.tick:0;
        for (const cue of frameData.cues) {
          if(data.reviewMode){if(cue.seq<=filmCue)continue;filmCue=cue.seq;}
          else if(director.replaying){if(cue.seq<=replayCue)continue;replayCue=cue.seq;}
          else {if(cue.seq<=seenCue)continue;seenCue=cue.seq;}
          if(cue.kind==="line-call"){
            const coach=coaches.find(c=>c.head && teams[c.side].id===cue.id);
            coach?.rig.signalLine?.();
            continue;
          }
          if (!data.running && cue.kind !== "faceoff") continue;
          const actor = byBody.get(cue.id), other = cue.target ? byBody.get(cue.target) : undefined;
          const at = (id?: string) => frameData.bodies.find(b => b.id === id);
          const actorSide = at(cue.id)?.side;
          // The building cheers for the home side (side 0).
          const homeActs = cue.kind === "save" ? actorSide === 0 : actorSide !== 1;
          if (data.running && !director.replaying && !data.reviewMode) {
            const shooter = cue.kind === "shot" ? at(cue.id) : undefined;
            const danger = shooter ? Math.max(0, 1 - Math.hypot(Math.abs(shooter.x) - 26, shooter.z) / 18) : 0;
            if (shooter && danger > 0.45) { benchUp[shooter.side] = now+2600; benchUp[1-shooter.side]=now+1550; }
            gameAudio.react(cue.kind, { home: cue.kind === "goal" ? at(cue.id)?.side !== 1 : homeActs, danger });
          }
          if(cue.kind==="windup"){
            const body=at(cue.id);
            if(body)actor?.trigger("wrist",{x:(cue.x??body.x)-body.x,z:(cue.z??0)-body.z});
          }else if (cue.kind === "shot") {
            const shooterBody = at(cue.id);
            const keeperBody = frameData.bodies.find(b=>b.goalie && b.side!==actorSide);
            if(cue.release==="wrist" && actor?.releaseWrist)actor.releaseWrist();
            else if(cue.release!=="wrist" || !frameData.cues.some(c=>c.kind==="windup" && c.id===cue.id))actor?.trigger(cue.release ?? "shot", shooterBody && keeperBody ? {x:keeperBody.x-shooterBody.x,z:(cue.z ?? 0)-shooterBody.z} : undefined);
            if(!cue.screened && cue.height!==undefined && cue.z!==undefined){
              const keeper=frameData.bodies.find(b=>b.goalie && b.side!==actorSide);
              if(keeper)byBody.get(keeper.id)?.trigger("save",{x:0,z:cue.z-keeper.z},cue.height);
            }
          }
          else if (cue.kind === "pass" || cue.kind === "receive") {
            const body = at(cue.id);
            const toward = body && cue.x !== undefined && cue.z !== undefined
              ? { x: cue.x-body.x, z: cue.z-body.z } : undefined;
            actor?.trigger(cue.kind, toward);
          }
          else if (cue.kind === "check") {
            if (cue.contact === "stick") actor?.trigger("poke");
            else {
              const hitter=at(cue.id), opponent=at(cue.target);
              const toward=hitter && opponent ? {x:opponent.x-hitter.x,z:opponent.z-hitter.z} : undefined;
              actor?.trigger("check",toward,cue.contact==="pin" ? .48 : 1);
              other?.trigger("checked",toward && {x:-toward.x,z:-toward.z},cue.contact==="pin" ? .48 : 1);
            }
          }
          else if(cue.kind==="tip")actor?.trigger("poke");
          else if (cue.kind === "block") actor?.trigger("block");
          else if (cue.kind === "goal") {
            const keeper = at(cue.target);
            other?.trigger("beaten", keeper && cue.x !== undefined ? { x: cue.x - keeper.x, z: (cue.z ?? 0) - keeper.z } : undefined, cue.height);
            if (!frameData.stoppage) actor?.trigger("celebrate");
          } else if (cue.kind === "penalty") actor?.trigger("protest");
          else if (cue.kind === "faceoff") {
            const dot=frameData.dot;
            actor?.trigger("draw",dot);
            other?.trigger("tie-up",dot);
            if(!dropReleased)lineA.rig.trigger("drop");
          } else if (cue.kind === "save") {
            const keeper = at(cue.id);
            const toward = keeper && cue.x !== undefined ? { x: cue.x - keeper.x, z: (cue.z ?? 0) - keeper.z } : undefined;
            // A clean sightline allows anticipation at release. A screen delays
            // the move until contact; avoid restarting the same save twice.
            if(cue.screened || !frameData.cues.some(c=>c.kind==="shot" && c.id===cue.target && cue.time-c.time<2))
              actor?.trigger("save", toward, cue.height);
            actor?.finishSave?.(cue.reboundDirection,cue.height);
            lastSave = cue.saveOutcome!=="rebound" && (cue.height ?? 0) >= 0.35 && toward && Math.abs(toward.z) > 0.15 ? "glove" : "other";
          }
        }
        // --- puck: in the linesman's hand before a drop, then falls to the ice
        let px = puckTrack.x, pz = puckTrack.z, py = Math.max(.018,frameData.puck.y);
        if (stoppage && (stoppage.phase === "lineup" || stoppage.phase === "drop")) {
          // The linesman carries the puck to the dot and holds it for the drop.
          const atDot = Math.hypot(lineA.x - stoppage.dot.x, lineA.z - stoppage.dot.z + .78) < 2.5;
          if (atDot) {
            const t=stoppage.phase==="drop"?Math.max(0,stoppage.t-(stoppage.length-.45)):0;
            if(!dropReleased){
              if(!lineA.rig.handPoint?.(dropFrom))dropFrom.set(lineA.x+.12,.99,lineA.z+.45);
            }
            const f=Math.min(1,t/.45);
            px=THREE.MathUtils.lerp(dropFrom.x,stoppage.dot.x,f);
            pz=THREE.MathUtils.lerp(dropFrom.z,stoppage.dot.z,f);
            py=Math.max(.018,dropFrom.y*(1-f*f));
            if(t>0 && !dropReleased){lineA.rig.trigger("drop");dropReleased=true;}
          }
          else { px = stoppage.dot.x; pz = stoppage.dot.z; py = 0.04; }
        }
        puckY += (py - puckY) * (1 - Math.exp(-dt * (py < puckY ? 14 : 6)));
        const pIn = insideBoards(px, pz, 0.0381);
        puck.position.set(pIn.x, stoppage?.phase==="drop"?py:puckY, pIn.z);
      } else if (data.running && data.event) {
        // Event replay (no spatial frames): a simple read of the event position.
        const x = (data.event.x / 100 - 0.5) * 56, z = (data.event.y / 100 - 0.5) * 23;
        puck.position.lerp(_v.set(x, 0.04, z), Math.min(1, dt * 5));
        actors.forEach(({ rig, side, slot }) => {
          const ids = data.event?.skaters?.[side];
          rig.setVisible(slot === 6 ? (ids?.length ?? 5) < 6 : slot < (ids?.length ?? 5));
          const id = ids?.[slot];
          const player = id ? playerOf(side, id) : slot === 6 ? teams[side].players.find(p => p.id === teams[side].goalie) : undefined;
          if (player) rig.setIdentity(player, player.pos);
          const carrier = data.event?.team === teams[side].id && id === data.event.playerId;
          const tx = slot === 6 ? (side ? 25 : -25) : carrier ? x : Math.max(-27, Math.min(27, x * 0.55 + (side ? 1 : -1) * (slot < 3 ? 5 : 12)));
          const tz = slot === 6 ? z * 0.07 : carrier ? z + 0.6 : (slot % 3 - 1) * 6 + z * 0.25;
          const here = rig.root.position;
          rig.update(dt, animDt, { x: here.x + (tx - here.x) * Math.min(1, dt * 2), z: here.z + (tz - here.z) * Math.min(1, dt * 2), vx: (tx - here.x) * 0.8, vz: (tz - here.z) * 0.8, puckX: puck.position.x, puckZ: puck.position.z, hasPuck: carrier });
        });
      }

      spray.update(dt);
      // --- benches: seated, standing and cheering, reaching out for the line;
      // players going off skate to their gate (or the box) and sit down.
      const onIce = new Set(frameData?.bodies.map(b => b.id) ?? []);
      const boxed = new Map<string, number>();
      frameData?.penaltyBox.forEach((p, i) => boxed.set(p.id, i));
      const scorer = stoppage?.kind === "goal" && stoppage.phase === "celebrate" ? frameData?.bodies.find(b => b.id === stoppage.actor) : undefined;
      const moveDt = data.running ? dt * Math.min(Math.max(1, data.playback), 2.5) : 0;
      const gateOpen = [false,false];
      bench.forEach((m) => {
        const { rig, id, side, seatX } = m;
        if (onIce.has(id)) { rig.setVisible(false); return; }
        rig.setVisible(true);
        const inBox = boxed.has(id);
        const boxSeat = { x: PENALTY_BOX.centerX[side] + ((boxed.get(id) ?? 0) % 2 ? 0.7 : -0.7), z: PENALTY_BOX.seatZ };
        const seat = { x: seatX, z: BENCH.seatZ };
        if (icePrimed && prevOnIce.has(id)) {
          // Just came off the ice.
          const last = lastIce.get(id) ?? seat;
          // The simulation already admitted the replacement. Only play the outgoing
          // crossing at the rail; a bench double must never skate through live play.
          const from = inBox && stoppage ? last : {x:BENCH.centerX[side], z:-RINK.boardsZ-.03};
          m.x = from.x; m.z = from.z;
          // Use the rail when it shortens the route to the player's seat.
          m.vault = !inBox && seatX > BENCH.centerX[side]+.8;
          const gate = benchDoor(m);
          if (m.vault) gate.x += 2.05;
          if(!inBox){gate.z=-RINK.boardsZ-.22; from.x=gate.x;m.x=from.x;}
          m.path = inBox ? [boxDoor(side), boxSeat] : [gate,{x:gate.x,z:-RINK.boardsZ-.95},seat];
          rig.place(from.x,from.z,Math.atan2(gate.x-from.x,gate.z-from.z));
          m.mode = "moving";
          tracks.delete(id);
        } else if (m.mode === "box" && !inBox) {
          // A returning penalty killer has an on-ice actor when selected.
          // For a non-deployed player resume the bench representation directly.
          m.path=[]; m.x=seat.x; m.z=seat.z; m.vx=m.vz=0; m.mode="seat";
          rig.place(m.x,m.z,0);
        } else if (m.mode === "seat" && inBox) {
          // Already serving when the view opened: sit him straight in the box.
          m.x = boxSeat.x; m.z = boxSeat.z; m.path = [];
          m.mode = "box";
          rig.place(m.x, m.z, Math.PI);
        }
        if (m.mode==="moving" && (data.reviewMode || (!stoppage && (inBox || m.z > -RINK.boardsZ)))) {
          m.x=inBox?boxSeat.x:seat.x; m.z=inBox?boxSeat.z:seat.z;
          m.mode=inBox?"box":"seat"; m.path=[];m.vx=m.vz=0;rig.place(m.x,m.z,0);
        }
        if (m.mode === "moving") {
          const destination = m.path[0];
          const target = skaterNetRoute(m, destination);
          const dx = target.x - m.x, dz = target.z - m.z, d = Math.hypot(dx, dz);
          const crossing = !inBox && Math.abs(m.z+RINK.boardsZ)<1.4;
          if (!inBox && !m.vault && Math.abs(m.z+RINK.boardsZ)<2.6 && Math.abs(m.x-BENCH.centerX[side])<1.5) gateOpen[side]=true;
          const speed = Math.min(crossing ? (m.vault ? 1.45 : 2.1) : 7, d * 3 + 1.5);
          m.vx = d > 0.01 ? (dx / d) * speed : 0; m.vz = d > 0.01 ? (dz / d) * speed : 0;
          const step = Math.min(d, speed * moveDt);
          if (d > 0.01) { m.x += (dx / d) * step; m.z += (dz / d) * step; }
          if (d < 0.08 && target === destination) {
            m.path.shift();
            if (!m.path.length) { m.mode = inBox ? "box" : "seat"; m.vx = m.vz = 0; }
          }
        }
        let state: RigState = m.mode === "box" ? "box" : "seated";
        if (m.mode === "moving") state = "play";
        else if (m.mode === "seat" && !stoppage && now < benchUp[side]) {
          const reaction=Math.abs(Math.sin(seatX*4.7));
          if(reaction>.22 && now < benchUp[side]-reaction*680) state="bench-stand";
        }
        else if (m.mode === "seat" && stoppage?.kind === "goal" && stoppage.phase === "celebrate") {
          if (side === stoppage.side) {
            const atRail=stoppage.variant>=1/3 && stoppage.t>=4.4;
            const near = atRail && scorer && scorer.z < -RINK.boardsZ+1.15 && Math.abs(scorer.x-seatX)<1.35;
            const delay=.16+Math.abs(Math.sin(seatX*7.1))*.78;
            state = near ? "bench-reach" : stoppage.t < delay ? "seated" : stoppage.t < 3.9+delay ? "bench-cheer" : "bench-stand";
          } else state = "bench-dejected";
        }
        if(m.mode==="seat"){
          const meetLine=scorer && stoppage?.side===side && stoppage.variant>=1/3 && stoppage.t>=3.4;
          m.z=THREE.MathUtils.damp(m.z,meetLine ? -RINK.boardsZ-.45 : BENCH.seatZ,2.8,moveDt);
          if(!meetLine && state==="seated" && Math.abs(m.z-BENCH.seatZ)>.2) state="bench-stand";
        }
        rig.setState(state, rig.currentState === state ? undefined : (seatX * 0.37 + 5) % 1);
        const face = m.mode === "seat" ? 0 : m.mode === "box" ? Math.PI : undefined;
        rig.update(dt, data.running ? dt : 0, { x: m.x, z: m.z, vx: m.vx, vz: m.vz, puckX: puck.position.x, puckZ: puck.position.z, hasPuck: false, face,
          vault: m.mode === "moving" && m.vault && !inBox ? THREE.MathUtils.clamp((BENCH.doorZ-m.z)/1.75,0,1) : undefined });
      });
      arena.doors.forEach((door,i)=>{
        const angle=gateOpen[i] ? 1.48 : 0;
        door.rotation.y=THREE.MathUtils.damp(door.rotation.y,angle,gateOpen[i]?14:5,moveDt);
      });
      prevOnIce.clear(); onIce.forEach(id => prevOnIce.add(id));
      if (frameData) icePrimed = true;

      // --- coaches react to the game
      coaches.forEach((c) => {
        let state: RigState = "coach-idle";
        let variant = c.head ? 0.2 : 0.8;
        const own = stoppage?.side === c.side;
        if (liveStop?.phase === "review" && c.head) state="coach-review";
        else if (stoppage?.kind === "goal" && stoppage.phase === "celebrate") state = own ? (c.head ? "coach-clap" : "coach-point") : c.head ? "coach-despair" : "coach-idle";
        else if (stoppage?.kind === "penalty" && stoppage.phase === "whistle" && own && c.head) state = "coach-point";
        else if (!stoppage && c.head && Math.floor((now / 1000 + c.side * 5) / 9) % 3 === 0) { variant = 0.8; }
        else if (!stoppage && c.assistant && bench.some(m=>m.side===c.side && m.mode==="moving")) state = "coach-point";
        c.rig.setState(state, variant);
        // Every so often the assistant and the head coach turn to talk.
        const talk = (c.head || c.assistant) && state==="coach-idle" && !!stoppage && stoppage.phase==="lineup";
        const partner = coaches.find(o => o.side === c.side && o !== c);
        c.rig.update(dt, data.running ? dt : dt * 0.5, { x: c.x, z: BENCH.seatZ - 1.35, vx: 0, vz: 0, puckX: puck.position.x, puckZ: puck.position.z, hasPuck: false, face: 0, lookX: talk && partner ? partner.x : undefined, lookZ: talk && partner ? BENCH.seatZ - 1.35 : undefined });
      });

      // --- officials: follow play, run faceoffs, signal goals and penalties
      const px = puck.position.x, pz = puck.position.z;
      const zone = px >= 0 ? 1 : -1;
      traffic=frameData?.bodies??[];
      const odt = data.running ? dt * Math.min(Math.max(1, data.playback), 2) : 0;
      if (stoppage && (stoppage.phase === "lineup" || stoppage.phase === "drop")) {
        const d = stoppage.dot;
        for(const o of officials){
          const station=drawStation(o,d);
          moveOfficial(o,station.x,station.z,odt,o===lineA ? 12 : 8.5);
        }
        retreat={x:d.x,z:d.z-3.2};
      } else {
        // Back away from the dot on the drop side before tracking the blue line.
        if(retreat && lineA.z<=retreat.z+.18) retreat=undefined;
        moveOfficial(lineA,retreat?.x ?? zone*10,retreat?.z ?? -11.2,odt,retreat ? 3.8 : 8.5);
        moveOfficial(lineB,-zone*1.5,11.2,odt);
        moveOfficial(refA,zone*24.2,-9.8,odt);
        if(liveStop?.kind==="penalty" && liveStop.phase==="whistle"){
          if(penaltyRoute?.stop!==liveStop)penaltyRoute={stop:liveStop,x:refB.x,z:refB.z,wingX:lineA.x,wingZ:lineA.z};
          const u=Math.min(1,liveStop.t/3.2),travel=1-smoothstep(u),v=-6*u*(1-u)/3.2;
          refB.x=penaltyRoute.x*travel;refB.z=penaltyRoute.z*travel;
          refB.vx=penaltyRoute.x*v;refB.vz=penaltyRoute.z*v;
          lineA.x=THREE.MathUtils.lerp(zone*9,penaltyRoute.wingX,travel);
          lineA.z=THREE.MathUtils.lerp(10.3,penaltyRoute.wingZ,travel);
          lineA.vx=(penaltyRoute.wingX-zone*9)*v;lineA.vz=(penaltyRoute.wingZ-10.3)*v;
        }
        else moveOfficial(refB, zone * 4, 10.4, odt);
      }
      if(odt>0)for(const o of officials){
        for(const b of traffic){
          const pos=lastIce.has(b.id) && byBody.has(b.id) ? byBody.get(b.id)!.root.position : b;
          const dx=o.x-pos.x,dz=o.z-pos.z,gap=Math.hypot(dx,dz);
          if(gap>=.89)continue;
          const nx=gap>.001 ? dx/gap : 0,nz=gap>.001 ? dz/gap : -1;
          o.x=THREE.MathUtils.clamp(o.x+nx*(.89-gap),-29.5,29.5);
          o.z=THREE.MathUtils.clamp(o.z+nz*(.89-gap),-12.4,12.4);
          const inward=Math.min(0,o.vx*nx+o.vz*nz);
          o.vx-=nx*inward;o.vz-=nz*inward;
        }
      }
      const goalNet = stoppage?.kind === "goal" ? (frameData?.puck.x ?? 0) : 0;
      officials.forEach(o => {
        let state: RigState = "play";
        let face: number | undefined = o===lineA && retreat && !stoppage ? 0 : undefined;
        if(o===refB && liveStop?.kind==="penalty" && liveStop.phase==="whistle" && !director.replaying && liveStop.t>=3 && Math.hypot(o.x,o.z)<1.3){
          face=0;state=liveStop.infraction==="holding"?"official-holding":"official-roughing";
          const team=teams[liveStop.side],player=playerOf(liveStop.side,liveStop.actor);
          const holding=liveStop.infraction==="holding";
          const announcement=language==="en" ? team.id+", number "+player?.number+", two minutes for "+(holding?"holding":"roughing") : team.id+", номер "+player?.number+", две минуты за "+(holding?"задержку соперника":"грубость");
          replayBadge.classList.add("referee-announcement");
          replayBadge.textContent=announcement;replayBadge.style.display="block";
          if(data.running && calledPenalty!==liveStop){
            calledPenalty=liveStop;
            if(gameAudio.prefs.sound){
              microphone.src=refereeAudio[language][holding?"holding":"roughing"];
              microphone.volume=gameAudio.prefs.volume;
              void microphone.play().catch(()=>{});

            }
          }
        } else if (o===refA && liveStop?.phase==="review" && liveStop.t>=5.6) state=liveStop.review==="confirmed" ? "official-point" : "official-washout";
        else if (o === lineA && stoppage && (stoppage.phase === "lineup" || stoppage.phase === "drop") && Math.hypot(o.x - stoppage.dot.x, o.z - stoppage.dot.z + .78) < 1.2) {
          state = "official-drop"; face = 0;
        } else if (o === refA && stoppage?.kind === "goal" && stoppage.phase === "celebrate" && stoppage.t < 2.6) {
          state = "official-point"; face = Math.atan2(goalNet - o.x, -o.z);
        } else if ((o === refB && stoppage?.kind === "penalty" && stoppage.phase === "whistle") || (o === lineB && (frameData?.delayedOffside !== undefined || ((stoppage?.kind === "icing" || stoppage?.kind === "offside") && stoppage.phase === "whistle")))) {
          state = "official-arm";
        }
        o.rig.setState(state);
        o.rig.update(dt, odt, { x: o.x, z: o.z, vx: o.vx, vz: o.vz, puckX: px, puckZ: pz, hasPuck: false, face });
      });

      // Camera interpolation, bench entries and official paths are visual
      // tracks. Keep the interpolated bodies apart between simulation ticks.
      const visibleSkaters = [
        ...actors.filter(a => a.rig.root.visible && a.rig.root.position.z > -RINK.boardsZ+.68).map(a => ({rig: a.rig, goalie: a.slot === 6})),

        ...bench.filter(m => m.mode === "moving" && m.rig.root.visible && Math.abs(m.z) < RINK.halfWidth)
          .map(m => ({rig: m.rig, goalie: false})),
      ].map(({rig, goalie}) => ({rig, goalie, x: rig.root.position.x, z: rig.root.position.z, vx: 0, vz: 0}));
      const beforeSeparation = visibleSkaters.map(({ x, z }) => ({ x, z }));
      separateSkaters(visibleSkaters);
      for (const [index, body] of visibleSkaters.entries()) {
        const safe = clearSkaterNet(beforeSeparation[index], body);
        body.rig.root.position.x = safe.x;
        body.rig.root.position.z = safe.z;
      }
      // Officials yield to players. Never displace a planted centre to make
      // room for the official, or feed that displacement back into the draw.
      for(const o of officials){
        const p=o.rig.root.position;
        for(const body of visibleSkaters){
          const dx=p.x-body.x,dz=p.z-body.z;
          const gap=Math.hypot(dx,dz),clearance=body.goalie ? 1.05 : .91;
          if(gap>=clearance) continue;
          const k=clearance/Math.max(.001,gap)-1;
          p.x+=dx*k; p.z+=gap>.001 ? dz*k : -clearance;
          o.x=p.x; o.z=p.z;
        }
      }
      const carrierRig = frameData?.carrierId && !stoppage ? byBody.get(frameData.carrierId) : undefined;
      if (carrierRig?.bladePoint?.(bladePosition)) {
        carrierRig.alignBlade?.(puck.position);
        carrierRig.bladePoint(bladePosition);
        const contact = insideBoards(bladePosition.x, bladePosition.z, .0381);
        puck.position.set(contact.x, .018, contact.z);
        lastBlade.copy(puck.position);bladeOwner=frameData?.carrierId;
      } else if(frameData && !stoppage){
        if(bladeOwner){bladeOwner=undefined;releaseError.copy(lastBlade).sub(puck.position);releaseError.y=0;releaseAge=0;}
        releaseAge+=animDt;
        puck.position.addScaledVector(releaseError,1-smoothstep(releaseAge/.25));
      } else {bladeOwner=undefined;releaseAge=1;}
      // --- arena reactions (goal lights, crowd)
      // Ice: skate marks build up, the sheet is resurfaced between periods.
      if (frameData && data.running) iceFx.skate(actors.filter(a => a.rig.root.visible).map(a => { const m = a.rig.motion; return { x: m?.x ?? 0, z: m?.z ?? 0, speed: m?.speed ?? 0, stopping: !!m?.stopping }; }), dt);
      const period = scoreRef.current?.period ?? "";
      if (period !== lastPeriod) { if (lastPeriod) iceFx.resurface(); lastPeriod = period; }
      arena.update(dt, { playing: data.running && !liveStop, danger: now < Math.max(benchUp[0],benchUp[1]), goalSide: liveStop?.kind === "goal" && liveStop.phase === "celebrate" ? Math.sign(liveFrame?.puck.x ?? 0) : 0, homeScored: liveStop?.kind === "goal" && liveStop.side === 0 && liveStop.phase === "celebrate", score: scoreRef.current });

      // --- cameras: damped springs, automatic broadcast director, replays and cut-scenes
      const m = mode.current;
      const shotOut = director.update(dt, m, liveFrame, puck.position, now / 1000, (id) => {
        if(id==="official-1")return refB.rig.root.position;
        const t2 = tracks.get(id);
        if (t2) return { x: t2.x, z: t2.z };
        const b2 = liveFrame?.bodies.find(b => b.id === id);
        return b2 ? { x: b2.x, z: b2.z } : undefined;
      });
      arena.setCeilingVisible(m !== "overhead");
      camera.position.copy(shotOut.pos);
      if (Math.abs(camera.fov - shotOut.fov) > 0.01) { camera.fov = shotOut.cut ? shotOut.fov : camera.fov + (shotOut.fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
      camera.up.set(0,1,0);
      camera.lookAt(shotOut.look);
      if(shotOut.shot==="referee"){
        const center=refB.rig.root.position;
        camera.position.set(center.x+.4,1.7,center.z+3.2);
        camera.lookAt(center.x,1.18,center.z);
      }
      if(data.reviewMode) {
        // Keep both goals and the weak side in frame at any viewport aspect.
        camera.up.set(0,0,-1);
        const halfHeight=Math.max(RINK.halfWidth+2.2,(RINK.halfLength+1.8)/camera.aspect);
        camera.position.set(0,halfHeight/Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),0);
        camera.lookAt(0,0,0);
      }
      post.setCinematic(!data.reviewMode && shotOut.dof !== undefined, shotOut.dof);
      void focus; void lookAt; void desired; void lookSmooth; void zoom; void cameraReady; void _focusTarget;
      // --- label over the puck carrier (or the scorer)
      const labelled = scorer ?? frameData?.bodies.find(b => b.id === frameData.carrierId);
      if (!labelled) label.style.display = "none";
      else {
        const t2 = tracks.get(labelled.id);
        const point = _v.set(t2?.x ?? labelled.x, 2.6, t2?.z ?? labelled.z).project(camera);
        label.style.display = point.z > 1 ? "none" : "block";
        label.style.left = `${(point.x * 0.5 + 0.5) * container.clientWidth}px`;
        label.style.top = `${(-point.y * 0.5 + 0.5) * container.clientHeight}px`;
        const p = playerOf(labelled.side, labelled.id);
        label.textContent = `${scorer ? "🚨 " : ""}${p ? `#${p.number} ${p.name}` : ""}`;
        label.style.borderLeftColor = teams[labelled.side].color;
      }
      frameNo++;
      // All cameras render the same pose, including the ice reflection and depth pass.
      scene.updateMatrixWorld();
      tickShadows(renderer, frameNo);
      if (directRender) renderer.render(scene,camera);
      else post.render();
      (window as unknown as { __arena3d?: object }).__arena3d = {reflections: quality === "high", directRender, shot:shotOut.shot, characters:byBody.size,
        benchSkatersInPlay:!stoppage ? bench.filter(m=>m.rig.root.visible && Math.abs(m.rig.root.position.z)<RINK.boardsZ-.05).length : 0,
        dressedOnIce:actors.filter(a=>a.rig.root.visible).length, geometries:renderer.info.memory.geometries, textures:renderer.info.memory.textures};
      frame = requestAnimationFrame(animate);
    };
    camera.position.set(0, 16, 34); frame = requestAnimationFrame(animate);
    return () => {
      microphone.pause();
      leaveArena(); gameAudio.setRunning(false); spray.dispose(); iceFx.dispose(); post.dispose();
      cancelAnimationFrame(frame); observer.disconnect();
      figures.forEach(rig => rig.dispose());
      arena.dispose();
      scene.traverse(object => { if (object instanceof THREE.Mesh && !object.userData.shared) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); } });
      factory.dispose();
      label.remove(); replayBadge.remove(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [home.id, away.id]);
  const ru = language === "ru";
  return <div className="match-arena">
    {!cameraProp && <div style={{ display: "flex", gap: 8, padding: 12 }}>
      <label>{ru ? "Камера" : "Camera"} <Select value={cameraMode} onChange={e => { const v = e.target.value as CameraMode; setOwnCamera(v); onCamera?.(v); }}>
        {CAMERA_MODES.map(c => <option key={c.value} value={c.value}>{ru ? c.ru : c.en}</option>)}
      </Select></label>
      <span style={{ marginLeft: "auto", color: "#8aa7bd" }}>3D · {home.id} / {away.id}</span>
    </div>}
    <div ref={host} style={{ position: "relative", overflow: "hidden", height: height ?? "clamp(320px, 45vw, 580px)", width: "100%" }} role="img" aria-label={ru ? "Трёхмерная хоккейная площадка" : "3D hockey rink"}>
      {unavailable && <p>{ru ? "3D недоступен: включите аппаратное ускорение или выберите режим 2D." : "3D is unavailable: enable hardware acceleration or use the 2D view."}</p>}
    </div>
  </div>;
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function smoothstep(t: number) { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); }
void RINK;

/** Snow spray from hard stops: pooled points thrown sideways off the blades. */
class SnowSpray {
  private n = 360;
  private pos = new Float32Array(this.n * 3);
  private vel = new Float32Array(this.n * 3);
  private life = new Float32Array(this.n);
  private next = 0;
  private points: THREE.Points;
  constructor(private scene: THREE.Scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: "#f4fbff", size: 0.07, transparent: true, opacity: 0.85, depthWrite: false }));
    this.points.frustumCulled = false;
    this.pos.fill(-100);
    scene.add(this.points);
  }
  emit(x: number, z: number, yaw: number, dt: number) {
    const count = Math.ceil(dt * 160);
    const sx = Math.cos(yaw), sz = -Math.sin(yaw);
    for (let k = 0; k < count; k++) {
      const i = this.next = (this.next + 1) % this.n;
      const side = (i % 2 ? 1 : -1) * (0.6 + ((i * 37) % 10) / 25);
      this.pos.set([x + sx * 0.15 * side, 0.05, z + sz * 0.15 * side], i * 3);
      this.vel.set([sx * side * 2.2 + (((i * 13) % 7) - 3) * 0.15, 1.1 + ((i * 7) % 5) * 0.2, sz * side * 2.2 + (((i * 11) % 7) - 3) * 0.15], i * 3);
      this.life[i] = 0.55;
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9.8 * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; }
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -100;
    }
    (this.points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
