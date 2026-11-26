import * as THREE from "three";
import type { SkaterBody, SpatialFrame, SpatialStoppage } from "../engine/spatialMatch";
import type { CameraMode } from "./cameraModes";

/**
 * Broadcast camera work for the 3D match (presentation only):
 *  - critically damped springs for every camera, so "follow" and "close-up"
 *    never shake, whatever the puck does;
 *  - an automatic director for the broadcast mode with TV-style hard cuts
 *    (main side camera, low behind the net, over the net, bench), each shot
 *    held long enough to read;
 *  - goal replays from recorded frames, two angles picked by the kind of
 *    goal, slowed down with depth of field;
 *  - cut-scenes: arena fly-over before the opening faceoff, puck close-up
 *    on the faceoff dot, steadicam on the goal celebration.
 */

/** Unity-style SmoothDamp: critically damped, no overshoot, speed-capped. */
export class Damped {
  v = new THREE.Vector3();
  constructor(public value = new THREE.Vector3()) {}
  step(target: THREE.Vector3, smoothTime: number, dt: number, maxSpeed = 60) {
    const omega = 2 / Math.max(0.0001, smoothTime);
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = _c.subVectors(this.value, target);
    const maxChange = maxSpeed * smoothTime;
    if (change.length() > maxChange) change.setLength(maxChange);
    const to = _t.subVectors(this.value, change);
    const temp = _tmp.copy(this.v).addScaledVector(change, omega).multiplyScalar(dt);
    this.v.addScaledVector(temp, -omega).multiplyScalar(exp);
    const out = _o.copy(change).add(temp).multiplyScalar(exp).add(to);
    // Prevent overshoot.
    if (_a.subVectors(target, this.value).dot(_b.subVectors(out, target)) > 0) {
      out.copy(target);
      this.v.set(0, 0, 0);
    }
    this.value.copy(out);
    return this.value;
  }
  snap(v: THREE.Vector3) {
    this.value.copy(v);
    this.v.set(0, 0, 0);
  }
}
const _c = new THREE.Vector3(), _t = new THREE.Vector3(), _tmp = new THREE.Vector3(), _o = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export type Shot = "main" | "low-net" | "over-net" | "bench" | "faceoff" | "celebrate" | "referee" | "intro" | "replay-side" | "replay-net" | "replay-high";

interface Snapshot {
  passTarget?:string;
  bodies: SkaterBody[];
  puck: { x: number; y: number; z: number };
  carrierId?: string;
  cues: SpatialFrame["cues"];
  at: number;
  save: boolean;
}

export interface CameraOut {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  /** Depth of field on, with this focus distance. */
  dof?: number;
  /** Hard cut: no smoothing this frame. */
  cut: boolean;
  shot: Shot;
}

export class BroadcastDirector {
  private pos = new Damped();
  private look = new Damped();
  private focus = new Damped();
  private shot: Shot = "intro";
  private shotSince = 0;
  private clock = 0;
  private started = false;
  private history: Snapshot[] = [];
  private lastTick = -1;
  private seenRecordedCue=0;
  private lastSaveAt = -10;
  private replay?: { frames: Snapshot[]; angles: Shot[]; start:number;phase:SpatialStoppage["phase"]; t: number; length: number; scorer?: string };
  private replayed?: SpatialStoppage;
  private recordedStop?: SpatialStoppage;
  private introLeft = 5.5;
  private zoneTime = 0;

  /** True while a replay is on screen (the renderer shows recorded frames). */
  get replaying() {
    return !!this.replay;
  }

  get replayAngle(){ return this.replay ? Math.floor(this.replay.t/(this.replay.length/this.replay.angles.length)) : -1; }
  /** Called with every new simulation frame. */
  record(frame: SpatialFrame, now: number) {
    if (frame.tick === this.lastTick || this.replay) return;
    this.lastTick = frame.tick;
    if (frame.cues.some((c) => c.kind === "save")) this.lastSaveAt = now;
    if (frame.stoppage && this.recordedStop===frame.stoppage) return;
    if (frame.stoppage && !["goal","penalty"].includes(frame.stoppage.kind) && !frame.stoppage.review) return;
    this.recordedStop=frame.stoppage;
    this.history.push({
      bodies: frame.bodies.map((b) => ({ ...b })),
      puck: { ...frame.puck },
      carrierId: frame.carrierId,
      cues:frame.cues.filter(c=>c.seq>this.seenRecordedCue).map(c=>({...c})),
      passTarget:frame.passTarget,
      at: now,
      save: now - this.lastSaveAt < 2.2,
    });
    this.seenRecordedCue=frame.cues.at(-1)?.seq??this.seenRecordedCue;
    while (this.history.length && now - this.history[0].at > 9) this.history.shift();
  }

  /** Frame to draw: recorded during a replay, otherwise the live one. */
  frameFor(live: SpatialFrame | undefined, dt: number): SpatialFrame | undefined {
    const r = this.replay;
    if (!r || !live) return live;
    if(live.stoppage?.phase===r.phase)r.t=Math.max(0,live.stoppage.t-r.start);
    else r.t+=dt;
    const per = r.length / r.angles.length;
    const angle=Math.min(r.angles.length-1,Math.floor(r.t/per));
    const local=Math.min(1,(r.t-angle*per)/per);
    // Slow motion over the last seconds before the goal.
    const span = r.frames.length - 1;
    const f = Math.min(span, local * span);
    const i = Math.floor(f), k = f - i;
    const a = r.frames[i], b = r.frames[Math.min(span, i + 1)];
    const bodies = a.bodies.map((x) => {
      const y = b.bodies.find((q) => q.id === x.id) ?? x;
      return { ...x, x: x.x + (y.x - x.x) * k, z: x.z + (y.z - x.z) * k, vx: x.vx * 0.5, vz: x.vz * 0.5 };
    });
    return {
      ...live,
      bodies,
      puck: { x: a.puck.x + (b.puck.x - a.puck.x) * k, y:a.puck.y+(b.puck.y-a.puck.y)*k, z: a.puck.z + (b.puck.z - a.puck.z) * k },
      carrierId: a.carrierId,
      passTarget:a.passTarget,
      cues:r.frames.slice(0,i+1).flatMap(frame=>frame.cues),
      stoppage: undefined,
      tick: live.tick * 1000 + Math.floor(r.t * 30),
    };
  }

  /** Starts a replay of the goal that caused this stoppage (once per goal). */
  private maybeReplay(s: SpatialStoppage, now: number) {

    if (this.replayed===s || (s.phase==="review" && s.t<1.4)) return;
    this.replayed=s;
    const frames = s.replay?.length ? s.replay : this.history.filter((h) => now - h.at < 5.5).slice(-26);
    if (frames.length < 2) return;
    const rebound = frames.slice(-12).some((f) => f.save);
    // Rebound goals are best seen from behind the net; shots from the side
    // first, then from above the goal.
    const angles: Shot[] = s.kind==="penalty" ? ["replay-side"] : rebound ? ["replay-net", "replay-side"] : ["replay-side", "replay-high"];
    this.replay = { frames, angles, start:s.phase==="review"?1.4:0,phase:s.phase,t: 0, length: s.kind==="penalty" ? 2.6 : 4.5, scorer: s.actor };
  }

  update(dt: number, mode: CameraMode, frame: SpatialFrame | undefined, puck: THREE.Vector3, now: number, find: (id: string) => { x: number; z: number } | undefined): CameraOut {
    this.clock += dt;
    const s = frame?.stoppage;
    let cut = !this.started;
    this.started = true;
    if (s && (s.phase === "review" || (s.kind === "goal" && s.phase === "celebrate") || (s.kind==="penalty" && s.phase==="whistle")) && mode === "broadcast") this.maybeReplay(s, now);
    if (this.replay && (this.replay.t >= this.replay.length || !s || s.phase === "drop" || (s.review && (s.phase !== "review" || s.t >= 5.6)))) this.replay = undefined;
    const want = new THREE.Vector3(), lookAt = new THREE.Vector3();
    let fov = 42, dof: number | undefined, smooth = 0.45, lookSmooth = 0.3;
    const px = THREE.MathUtils.clamp(puck.x, -27, 27), pz = THREE.MathUtils.clamp(puck.z, -11, 11);
    let shot: Shot = "main";

    if (this.replay) {
      const per = this.replay.length / this.replay.angles.length;
      shot = this.replay.angles[Math.min(this.replay.angles.length - 1, Math.floor(this.replay.t / per))];
      const net = Math.sign(this.replay.frames.at(-1)!.puck.x || 1) * 26;
      if (shot === "replay-net") {
        want.set(net + Math.sign(net) * 4.2, 1.6, 0.6);
        lookAt.set(px, 0.6, pz);
        fov = 38;
      } else if (shot === "replay-high") {
        want.set(net + Math.sign(net) * 1.5, 7.5, 0.1);
        lookAt.set(net - Math.sign(net) * 6, 0, pz * 0.5);
        fov = 44;
      } else {
        want.set(px - Math.sign(net) * 3, 2.2, pz + 9);
        lookAt.set(px, 0.7, pz);
        fov = 34;
      }
      dof = want.distanceTo(lookAt);
      smooth = 0.35;
    } else if(s?.kind==="penalty" && s.phase==="whistle" && mode==="broadcast") {
      shot="referee";cut=this.lastShot!=="referee"; const ref=find("official-1");
      const x=ref?.x??0,z=ref?.z??0;want.set(x+.65,1.65,z+3.8);lookAt.set(x,1.12,z);fov=35;smooth=.20;
    } else if (s?.phase === "review" && mode === "broadcast") {
      if (s.t<1.5) {
        shot="bench";
        const coachX=(s.review==="confirmed" ? 1-s.side : s.side)===0 ? -8.5 : 8.5;
        want.set(coachX+2.6,2.5,-10.8);lookAt.set(coachX-1.2,1.7,-15.9);fov=38;
      } else {
        shot="over-net";
        const x=Math.sign(puck.x || 1)*26;
        want.set(x-1.4*Math.sign(x),7.8,.2);lookAt.set(x,0,0);fov=46;
      }
      smooth=.18;
    } else if (this.introLeft > 0 && frame && frame.tick < 5 && mode === "broadcast") {
      // Fly-over before the opening faceoff.
      this.introLeft -= dt;
      const a = (1 - this.introLeft / 5.5) * 1.6 - 0.8;
      want.set(Math.sin(a) * 30, 9 + this.introLeft, Math.cos(a) * 24);
      lookAt.set(0, 0.5, 0);
      shot = "intro";
      dof = want.length();
      smooth = 0.8;
    } else if (mode === "stands") {
      want.set(37,18.4,29);
      lookAt.set(-2,5,-2);
      fov = 56;
    } else if (mode === "overhead") {
      want.set(0, 62, 0.1);
      lookAt.set(0, 0, 0);
      shot = "main";
      smooth = 0.6;
    } else if (mode === "follow") {
      want.set(px * 0.45, 22, pz * 0.25 + 26);
      lookAt.set(px * 0.85, 0, pz * 0.6);
      smooth = 0.75;
      lookSmooth = 0.55;
    } else if (mode === "close") {
      const carrier = frame?.carrierId ? find(frame.carrierId) : undefined;
      const fx = carrier?.x ?? px, fz = carrier?.z ?? pz;
      want.set(fx * 0.92, 6.2, fz * 0.5 + 10.5);
      lookAt.set(fx, 0.9, fz);
      fov = 38;
      smooth = 0.85;
      lookSmooth = 0.6;
    } else {
      // Broadcast: automatic director.
      let next: Shot = "main";
      if (s && (s.phase === "lineup" || s.phase === "drop")) next = "faceoff";
      else if (s?.kind === "goal" && s.phase === "celebrate") next = "celebrate";
      else if (s && (s.kind === "penalty" || s.kind === "icing") && s.phase === "whistle") next = "bench";
      else if (s?.kind === "save") next = "over-net";
      else {
        const deep = Math.abs(px) > 19 && Math.abs(pz) < 9;
        this.zoneTime = deep ? this.zoneTime + dt : 0;
        next = this.zoneTime > 1.6 ? "low-net" : "main";
      }
      // Hold every shot long enough to read (stoppage shots cut at once).
      const held = this.clock - this.shotSince;
      if (next !== this.shot && (held > 2.6 || s || this.shot === "faceoff" || this.shot === "celebrate")) {
        this.shot = next;
        this.shotSince = this.clock;
        cut = next !== "main" || this.shot !== "main";
      }
      shot = this.shot;
      const side = Math.sign(px || 1);
      if (shot === "low-net") {
        want.set(side * 31.5, 2.4, -pz * 0.25);
        lookAt.set(px * 0.9, 0.5, pz * 0.8);
        fov = 46;
        smooth = 0.55;
      } else if (shot === "over-net") {
        const g = s ? Math.sign(s.dot.x || 1) * 26 : side * 26;
        want.set(g + Math.sign(g) * 1.2, 5.2, 0.01);
        lookAt.set(g - Math.sign(g) * 7, 0, 0);
        fov = 50;
      } else if (shot === "bench") {
        want.set(0, 3.2, 5);
        lookAt.set(0, 1.0, -14);
        fov = 34;
        dof = 19;
      } else if (shot === "faceoff" && s) {
        // Cut-scene: low close-up of the puck on the dot.
        want.set(s.dot.x + 2.6, 0.75, s.dot.z + 3.4);
        lookAt.set(s.dot.x, 0.55, s.dot.z);
        fov = 34;
        dof = want.distanceTo(lookAt);
        smooth = 0.5;
      } else if (shot === "celebrate" && s) {
        const scorer = find(s.actor);
        const fx = scorer?.x ?? px, fz = scorer?.z ?? pz;
        // Steadicam: chest height, gentle handheld drift.
        const drift = Math.sin(this.clock * 0.7) * 0.25;
        want.set(fx + 3.2 + drift, 1.7 + Math.sin(this.clock * 1.1) * 0.06, fz + 4.3);
        lookAt.set(fx, 1.2, fz);
        fov = 36;
        dof = want.distanceTo(lookAt);
        smooth = 0.55;
        lookSmooth = 0.35;
      } else {
        want.set(px * 0.85, 12, 27);
        lookAt.set(px * 0.95, 0, pz * 0.3);
        smooth = 0.7;
        lookSmooth = 0.45;
      }
    }
    if (shot !== this.lastShot && (shot.startsWith("replay") || this.lastShot.startsWith("replay") || shot === "intro" || this.lastShot === "intro")) cut = true;
    this.lastShot = shot;
    if (cut) {
      this.pos.snap(want);
      this.look.snap(lookAt);
    } else {
      this.pos.step(want, smooth, dt, 40);
      this.look.step(lookAt, lookSmooth, dt, 40);
    }
    if (dof !== undefined) this.focus.step(_f.set(dof, 0, 0), 0.3, dt);
    return { pos: this.pos.value, look: this.look.value, fov, dof: dof !== undefined ? this.focus.value.x : undefined, cut, shot };
  }
  private lastShot: Shot = "intro";
}
const _f = new THREE.Vector3();
