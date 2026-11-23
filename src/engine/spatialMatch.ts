import {
  lineWithDoubleShift,
  resolveIceTime,
  shiftLength,
  unitForShift,
} from "./iceTime";
import { RNG, clamp } from "./random";
import type { Team, Player, Result, SpecialTeamsSituation } from "./types";
import { ensureSpecialTeams } from "./tactics";
import { snapshotStats, updateMatchPerformance } from "./performance";
import { rateMatch } from "./matchRatings";
import { BENCH, CENTER_DOT, PENALTY_BOX, RINK, type Dot } from "./rink";

export interface SkaterBody {
  id: string;
  side: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  goalie: boolean;
}
/**
 * Presentation-only hints describing what just happened on the ice, so the
 * renderer can play matching animations. They never feed back into the
 * simulation and are produced without touching the seeded random stream.
 */
export interface SpatialCue {
  /** Monotonic sequence number; the renderer plays each cue once. */
  seq: number;
  kind:
    | "pass"
    | "receive"
    | "shot"
    | "check"
    | "save"
    | "goal"
    | "faceoff"
    | "penalty"
    | "whistle"
    | "block"
    | "hit";
  /** Body performing the action. */
  id: string;
  /** Body receiving the action (pass target, checked player, shooter for a save). */
  target?: string;
  /** Simulation time at which the cue was raised. */
  time: number;
  /** Where the puck was when a shot reached the goal line (save / goal). */
  x?: number;
  z?: number;
  release?: "slap" | "snap" | "wrist";
  /** Pseudo shot height 0 (ice) .. 1 (top shelf), for save and goal animations. */
  height?: number;
}
/**
 * A stoppage in play, shown only in presentation mode: the clock is stopped
 * while players celebrate, the whistle goes and both teams line up for the
 * faceoff. It never changes the match; see SpatialMatch `presentation`.
 */
export interface SpatialStoppage {
  kind: "goal" | "save" | "penalty" | "icing";
  phase: "celebrate" | "whistle" | "lineup" | "drop";
  /** Seconds elapsed in the current phase and its length. */
  t: number;
  length: number;
  /** Side that scored, made the save (goalie's side) or took the penalty. */
  side: number;
  /** Scorer, goalie or penalised player. */
  actor: string;
  /** Faceoff dot that play restarts from. */
  dot: Dot;
  /** Deterministic variety for celebrations. */
  variant: number;
}
export interface SpatialFrame {
  carrierId?: string;
  bodies: SkaterBody[];
  puck: { x: number; y: number; z: number };
  cues: SpatialCue[];
  /** Incremented on every simulation step; lets the renderer detect new frames. */
  tick: number;
  /** Players currently serving penalties (shown in the penalty box). */
  penaltyBox: { id: string; side: number; until: number }[];
  /** Present while play is stopped in presentation mode. */
  stoppage?: SpatialStoppage;
  /** Faceoff dot of the last faceoff. */
  dot: Dot;
}
export interface SpatialMatchOptions {
  /**
   * Broadcast presentation: after goals, whistles and penalties the clock stops
   * while players celebrate, react and line up for the faceoff. Play then
   * resumes exactly as it would without presentation, so the result, events and
   * statistics are identical; only extra non-clock steps are inserted.
   */
  presentation?: boolean;
}

const STOPPAGE_LENGTH = {
  celebrate: 6.2,
  whistle: { save: 1.7, penalty: 2.6, goal: 0, icing: 1.9 },
  lineup: 2.8,
  drop: 0.9,
} as const;

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Fixed-step, seeded simulation. Rendering never advances the simulation. */
export class SpatialMatch {
  readonly teams: Team[];
  readonly result: Result;
  readonly rng: RNG;
  frame: SpatialFrame = {
    bodies: [],
    puck: { x: 0, y: 0.12, z: 0 },
    cues: [],
    tick: 0,
    penaltyBox: [],
    dot: CENTER_DOT,
  };
  private cueSeq = 0;
  time = 0;
  done = false;
  intermission = false;
  pullGoalie = [false, false];
  private owner = "";
  private flight?: {
    vx: number;
    vz: number;
    shooter: string;
    side: number;
    shot: boolean;
    remaining: number;
    /** What the puck is doing: a pass, a dump-in, a clearance or loose. */
    kind?: "pass" | "dump" | "clear" | "loose";
    /** Intended receiver of a pass. */
    target?: string;
    /** Shot distance to the net when released (quality model). */
    distance?: number;
    /** Side that iced the puck if it crosses the far goal line untouched. */
    icingSide?: number;
  };
  /** A rebound is live until this time: second-chance shots are dangerous. */
  private reboundUntil = -1;
  private penalties: { id: string; side: number; until: number }[] = [];
  private decision = 0;
  private nextShot = [0, 0];
  private shift = -1;
  private appeared = new Set<string>();
  private touches: string[] = [];
  private baseline;
  private readonly presentation: boolean;
  /** Work deferred to the end of a presentation stoppage. */
  private resumeWith?: { changeShift: boolean; finish: boolean };
  constructor(
    home: Team,
    away: Team,
    seed: number,
    readonly playoffs = false,
    options: SpatialMatchOptions = {},
  ) {
    this.presentation = !!options.presentation;
    this.teams = structuredClone([home, away]);
    this.rng = new RNG(seed);
    this.baseline = snapshotStats(this.teams);
    this.result = {
      home: home.id,
      away: away.id,
      goals: [0, 0],
      shots: [0, 0],
      xg: [0, 0],
      pp: [0, 0],
      ppo: [0, 0],
      ot: false,
      so: false,
      duration: 0,
      events: [],
    };
    this.changeShift();
    this.faceoff();
  }
  private player(id: string): Player {
    return this.teams.flatMap((t) => t.players).find((p) => p.id === id)!;
  }
  private cue(
    kind: SpatialCue["kind"],
    id: string,
    target?: string,
    extra: Pick<SpatialCue, "x" | "z" | "height" | "release"> = {},
  ) {
    this.frame.cues.push({ seq: ++this.cueSeq, kind, id, target, time: this.time, ...extra });
    // Keep only a short window; the renderer consumes cues by sequence number.
    this.frame.cues = this.frame.cues.filter((c) => this.time - c.time <= 3).slice(-24);
  }
  private direction(side: number) {
    return (
      (side === 0 ? 1 : -1) *
      (Math.floor(Math.min(this.time, 3599) / 1200) % 2 ? -1 : 1)
    );
  }
  private counts() {
    const base = this.time >= 3600 && !this.playoffs ? 3 : 5;
    const p = [0, 1].map(
      (s) => this.penalties.filter((p) => p.side === s).length,
    );
    return base === 3
      ? [3 + Math.max(0, p[1] - p[0]), 3 + Math.max(0, p[0] - p[1])]
      : p.map((n) => Math.max(3, 5 - n));
  }
  private changeShift() {
    const counts = this.counts();
    const old = new Map(this.frame.bodies.map((b) => [b.id, b]));
    this.frame.bodies = [];
    this.teams.forEach((team, side) => {
      const n = counts[side] + Number(this.pullGoalie[side]);
      const other = counts[1 - side] + Number(this.pullGoalie[1 - side]);
      const situation = `${n}v${other}` as SpecialTeamsSituation;
      const unit = ensureSpecialTeams(team)[situation];
      // Even strength: lines and pairs rotate by the configured ice-time
      // shares, a pure function of the shift index (no RNG draws).
      const plan = resolveIceTime(team);
      const shiftIndex = Math.floor(this.time / shiftLength(team));
      const planned = unit?.players ?? [
        ...lineWithDoubleShift(team, unitForShift(plan.forwards, shiftIndex), plan),
        ...team.defense[unitForShift(plan.defense, shiftIndex)],
      ];
      const available = team.players.filter(
        (p) =>
          !p.injury &&
          p.pos !== "G" &&
          !this.penalties.some((q) => q.id === p.id),
      );
      const ids = [...new Set([...planned, ...available.map((p) => p.id)])]
        .filter((id) => available.some((p) => p.id === id))
        .slice(0, n);
      const goalie =
        team.players.find((p) => p.id === team.goalie && !p.injury) ??
        team.players.find((p) => p.pos === "G" && !p.injury);
      if (!this.pullGoalie[side] && goalie) ids.push(goalie.id);
      ids.forEach((id, slot) => {
        const isGoalie = this.player(id).pos === "G";
        // During a stoppage new skaters step on from their bench gate. These
        // positions are always replaced by the following faceoff formation.
        const fromBench = !!this.frame.stoppage && !isGoalie;
        this.frame.bodies.push(
          old.get(id) ?? {
            id,
            side,
            x: fromBench
              ? BENCH.centerX[side] + ((slot % 3) - 1) * 1.6
              : -this.direction(side) * (isGoalie ? 25 : 6 + slot),
            z: fromBench ? BENCH.doorZ + 0.6 : isGoalie ? 0 : ((slot % 3) - 1) * 5,
            vx: 0,
            vz: 0,
            goalie: isGoalie,
          },
        );
      });
    });
    if (!this.frame.bodies.some((b) => b.id === this.owner)) this.owner = "";
    this.syncPenaltyBox();
  }
  private syncPenaltyBox() {
    this.frame.penaltyBox = this.penalties.map(({ id, side, until }) => ({ id, side, until }));
  }
  private emit(
    type: Result["events"][number]["type"],
    body: SkaterBody,
    text: string,
    xg?: number,
  ) {
    this.result.events.push({
      time: Math.round(this.time),
      type,
      team: this.teams[body.side].id,
      player: this.player(body.id).name,
      playerId: body.id,
      text,
      x: (body.x / 60 + 0.5) * 100,
      y: (body.z / 26 + 0.5) * 100,
      score: [...this.result.goals],
      skaters: [0, 1].map((s) =>
        this.frame.bodies
          .filter((b) => b.side === s && !b.goalie)
          .map((b) => b.id),
      ),
      xg,
    });
  }
  /** The skater who takes the draw for a side (first centre, else first skater). */
  private drawTaker(side: number) {
    return (
      this.frame.bodies.find(
        (b) => b.side === side && this.player(b.id).pos === "C",
      ) ?? this.frame.bodies.find((b) => b.side === side && !b.goalie)
    );
  }
  /**
   * Faceoff formation around a dot: centres on the dot, wingers on the hash
   * marks, defence behind them and goalies in their creases. Deterministic.
   */
  formation(dot: Dot) {
    const spots = new Map<string, Dot>();
    for (const side of [0, 1]) {
      const dir = this.direction(side);
      const bodies = this.frame.bodies.filter((b) => b.side === side);
      const taker = this.drawTaker(side);
      const skaters = bodies.filter((b) => !b.goalie && b.id !== taker?.id);
      const forwards = skaters.filter((b) => this.player(b.id).pos !== "D");
      const defence = skaters.filter((b) => this.player(b.id).pos === "D");
      const centreIce = Math.abs(dot.x) < 1;
      const back = centreIce ? 7.5 : 5.2;
      const wings: Dot[] = [
        { x: dot.x - dir * 1.0, z: dot.z - 4.3 },
        { x: dot.x - dir * 1.0, z: dot.z + 4.3 },
      ];
      const points: Dot[] = [
        { x: dot.x - dir * back, z: dot.z * 0.55 - 2.6 },
        { x: dot.x - dir * back, z: dot.z * 0.55 + 2.6 },
      ];
      const extra: Dot = { x: dot.x - dir * 3.4, z: dot.z * 0.25 };
      // Forwards take the hash marks and defencemen the points; anyone left
      // over fills the remaining spots, then the slot in front of the net.
      const assigned = new Map<string, Dot>();
      forwards.forEach((b) => { const spot = wings.shift(); if (spot) assigned.set(b.id, spot); });
      defence.forEach((b) => { const spot = points.shift(); if (spot) assigned.set(b.id, spot); });
      skaters
        .filter((b) => !assigned.has(b.id))
        .forEach((b) => assigned.set(b.id, wings.shift() ?? points.shift() ?? extra));
      assigned.forEach((slot, id) => {
        spots.set(id, {
          x: clamp(slot.x, -RINK.goalieX + 0.5, RINK.goalieX - 0.5),
          z: clamp(slot.z, -RINK.halfWidth + 0.6, RINK.halfWidth - 0.6),
        });
      });
      if (taker) spots.set(taker.id, { x: dot.x - dir * 0.65, z: dot.z });
      for (const g of bodies.filter((b) => b.goalie))
        spots.set(g.id, { x: -dir * RINK.goalieX, z: 0 });
    }
    return spots;
  }
  /** Zone dot nearest to the puck in the end where `side` defends. */
  private zoneDot(defendingSide: number): Dot {
    const x = -this.direction(defendingSide) * RINK.dotX;
    return { x, z: this.frame.puck.z >= 0 ? RINK.dotZ : -RINK.dotZ };
  }
  /**
   * Positional play. Only the puck carrier and one or two pressure players go
   * to the puck; everybody else holds a role in the team structure: wingers on
   * lanes and the net front, defencemen at the points or between the puck and
   * their net, the centre covering the slot. Deterministic, no randomness.
   */
  private positions(owner: SkaterBody | undefined, puck: { x: number; z: number }) {
    const spots = new Map<string, Dot>();
    const at = (x: number, z: number): Dot => ({
      x: clamp(x, -RINK.goalieX - 1.5, RINK.goalieX + 1.5),
      z: clamp(z, -RINK.halfWidth + 1, RINK.halfWidth - 1),
    });
    const side = (z: number) => (z >= 0 ? 1 : -1);
    const wobble = (i: number, k: number) => Math.sin(this.time * (0.4 + 0.07 * i) + i * 1.7) * k;
    for (const s of [0, 1]) {
      const d = this.direction(s);
      const tactics = this.teams[s].tactics;
      const lane = 4.5 + (tactics.width ?? 50) * 0.045;
      const skaters = this.frame.bodies.filter((b) => b.side === s && !b.goalie);
      const isD = (b: SkaterBody) => this.player(b.id).pos === "D";
      const adv = puck.x * d; // > 0: puck in this team's attacking half
      const byDistance = [...skaters].sort(
        (a, b) => Math.hypot(a.x - puck.x, a.z - puck.z) - Math.hypot(b.x - puck.x, b.z - puck.z),
      );
      if (owner && owner.side === s) {
        // In possession: carrier drives, others give options.
        spots.set(owner.id, this.carrierRoute(owner, d, lane));
        const others = skaters.filter((b) => b.id !== owner.id);
        const forwards = others.filter((b) => !isD(b));
        const defence = others.filter(isD);
        const ozone = adv > RINK.blueLine;
        const strong = side(puck.z);
        forwards.forEach((b, i) => {
          const role = i % 3;
          const spot = ozone
            ? role === 0
              ? at(d * 23.6, -strong * 1.3) // net-front screen
              : role === 1
                ? at(d * 19.5 + wobble(i, 1.5), -strong * lane) // weak-side flank
                : at(d * 15.5, strong * 2 + wobble(i, 1.5)) // high slot
            : role === 0
              ? at(puck.x + d * 8, -strong * lane) // stretch lane
              : role === 1
                ? at(puck.x + d * 4 + wobble(i, 1.5), strong * lane) // wide support
                : at(puck.x - d * 3, puck.z * 0.4); // trailer
          spots.set(b.id, spot);
        });
        defence.forEach((b, i) => {
          const z = (i % 2 ? 1 : -1) * (ozone ? 6.2 : 4.6) + wobble(i + 5, 1);
          spots.set(b.id, ozone ? at(d * 17.2, z) : at(Math.min(puck.x * d - 9, 12) * d, z));
        });
        if (!forwards.length && !defence.length) continue;
        continue;
      }
      // Without the puck: one or two pressure players, the rest in structure.
      const style = tactics.forecheck;
      const dzone = adv < -RINK.blueLine;
      const pressers = owner
        ? dzone || style !== "2-1-2"
          ? 1
          : 2
        : 1;
      const chase = byDistance.slice(0, pressers);
      // The first presser goes all the way to the puck, even into the corners.
      chase.forEach((b, i) =>
        spots.set(
          b.id,
          i === 0
            ? { x: clamp(puck.x - d * (owner ? 0.4 : 0), -29, 29), z: clamp(puck.z, -12, 12) }
            : at(puck.x - d * 2.5, puck.z * 0.6 + (puck.z >= 0 ? -2.5 : 2.5)),
        ),
      );
      // A loose puck draws a second skater in support a few metres back.
      if (!owner && byDistance[1]) spots.set(byDistance[1].id, at(puck.x - d * 4, puck.z * 0.6));
      const rest = skaters.filter((b) => !spots.has(b.id));
      const forwards = rest.filter((b) => !isD(b));
      const defence = rest.filter(isD);
      const net = { x: -d * 25, z: 0 };
      if (dzone) {
        defence.forEach((b, i) => {
          const k = 0.34;
          spots.set(b.id, at(net.x + (puck.x - net.x) * k, puck.z * k + (i % 2 ? 1.8 : -1.8)));
        });
        forwards.forEach((b, i) => {
          const role = i % 3;
          spots.set(
            b.id,
            role === 0
              ? at(-d * 20.5, puck.z * 0.25) // centre covers the slot
              : at(-d * 16, (role === 1 ? 1 : -1) * 6.5 + wobble(i, 0.8)), // wingers on the points
          );
        });
      } else {
        const gap = style === "1-3-1" ? 13 : 11;
        defence.forEach((b, i) =>
          spots.set(b.id, at(Math.max(puck.x * d - gap, -24) * d, (i % 2 ? 1 : -1) * 4.5 + puck.z * 0.2)),
        );
        const back = style === "1-3-1" ? 7 : style === "2-1-2" ? 3.5 : 5;
        const lanes = style === "1-3-1" ? [-lane, 0, lane] : [-lane * 0.8, lane * 0.8, 0];
        forwards.forEach((b, i) =>
          spots.set(b.id, at(puck.x - d * (back + (i === 2 ? 3 : 0)), lanes[i % 3] * 0.9 + puck.z * 0.25 + wobble(i, 0.8))),
        );
      }
    }
    return spots;
  }
  /**
   * Where the puck carrier skates. Through the neutral zone he attacks a
   * lane and swings wide around a defender in his way; in the offensive zone
   * he alternates between driving the net, walking the half-wall and a low
   * cycle below the dots, so possession looks like real zone time.
   */
  private carrierRoute(owner: SkaterBody, d: number, lane: number): Dot {
    const adv = owner.x * d;
    const z = owner.z;
    const isD = this.player(owner.id).pos === "D";
    const wall = z >= 0 ? 1 : -1;
    const at = (x: number, zz: number): Dot => ({
      x: clamp(x, -28, 28),
      z: clamp(zz, -RINK.halfWidth + 1, RINK.halfWidth - 1),
    });
    const blocker = this.frame.bodies
      .filter((b) => b.side !== owner.side && !b.goalie)
      .map((b) => ({ b, ahead: (b.x - owner.x) * d, side: b.z - z }))
      .filter((o) => o.ahead > 0 && o.ahead < 7 && Math.abs(o.side) < 3.2)
      .sort((a, b) => a.ahead - b.ahead)[0];
    if (adv < RINK.blueLine) {
      // Breakout and neutral zone: carry with speed, step around a defender.
      const dodge = blocker ? (blocker.side >= 0 ? -1 : 1) * 4.5 : 0;
      const laneZ = Math.abs(z) < 2 ? wall * lane * 0.7 : z * 0.95;
      return at(owner.x + d * 9, laneZ + dodge);
    }
    if (isD && adv < RINK.dotX - 3) {
      // Defenceman with the puck at the point: walk the line for a lane.
      return at(d * 16.5, Math.sin(this.time * 0.55 + owner.x) * 6);
    }
    const phase = Math.floor((this.time + hash(owner.id) * 12) / 3.6) % 3;
    if (phase === 0 || adv > 24) return at(d * 21.5, z * 0.35); // drive the net
    if (phase === 1) return at(d * 17.5, wall * 8.2); // half-wall
    return at(d * 25.8, wall * 6.8); // low cycle below the goal line
  }
  /** Goalie depth and angle: square to the puck, deeper when it is close. */
  private goalieSpot(b: SkaterBody, puck: { x: number; z: number }): Dot {
    const dir = this.direction(b.side);
    const netX = -dir * RINK.goalLine;
    const toPuckX = puck.x - netX;
    const toPuckZ = puck.z;
    const distance = Math.hypot(toPuckX, toPuckZ);
    // Puck behind the goal line: hug the post on that side.
    if (toPuckX * dir < 0.3) return { x: netX + dir * 0.45, z: clamp(puck.z, -0.85, 0.85) };
    const out = distance > 18 ? 1.25 : distance > 8 ? 0.9 : 0.55;
    return {
      x: netX + (toPuckX / Math.max(1, distance)) * out + dir * 0.35,
      z: clamp((toPuckZ / Math.max(1, distance)) * out * 1.6, -1.1, 1.1),
    };
  }
  /** Hockey skating: momentum, limited acceleration and hard stops. */
  private skate(b: SkaterBody, tx: number, tz: number, top: number, dt: number) {
    const dx = tx - b.x,
      dz = tz - b.z,
      distance = Math.hypot(dx, dz);
    // Ease into the spot instead of overshooting it.
    const speed = distance > 0.15 ? Math.min(top, 0.9 + distance * 1.7) : 0;
    const wantX = distance > 0.15 ? (dx / distance) * speed : 0;
    const wantZ = distance > 0.15 ? (dz / distance) * speed : 0;
    const current = Math.hypot(b.vx, b.vz);
    // Turning or stopping digs the edges in harder than accelerating.
    const braking = wantX * b.vx + wantZ * b.vz < current * current * 0.6;
    const accel = (braking ? 13 : 6.5 + top * 0.25) * dt;
    let ax = wantX - b.vx,
      az = wantZ - b.vz;
    const change = Math.hypot(ax, az);
    if (change > accel) {
      ax *= accel / change;
      az *= accel / change;
    }
    b.vx += ax;
    b.vz += az;
    b.x = clamp(b.x + b.vx * dt, -29, 29);
    b.z = clamp(b.z + b.vz * dt, -12, 12);
    // Boards stop the skater instead of letting him slide along them at speed.
    if (Math.abs(b.x) >= 29) b.vx *= -0.2;
    if (Math.abs(b.z) >= 12) b.vz *= -0.2;
  }
  private faceoff(dot: Dot = CENTER_DOT) {
    this.flight = undefined;
    this.owner = "";
    this.touches = [];
    this.frame.dot = { ...dot };
    this.frame.puck = { x: dot.x, y: 0.12, z: dot.z };
    const spots = this.formation(dot);
    this.frame.bodies.forEach((b) => {
      const spot = spots.get(b.id)!;
      b.x = spot.x;
      b.z = spot.z;
      b.vx = b.vz = 0;
    });
    const side = this.rng.next() < 0.5 ? 0 : 1;
    const center = this.drawTaker(side)!;
    const opponent = this.drawTaker(1 - side);
    this.owner = center.id;
    center.x = dot.x;
    center.z = dot.z;
    this.emit("faceoff", center, "Вбрасывание");
    this.cue("faceoff", center.id, opponent?.id, { x: dot.x, z: dot.z });
    this.decision = this.time + 1;
  }
  /** Commands are applied to the next shift, and do not alter prior events. */
  setPlan(team: Team) {
    const own = this.teams.find((t) => t.id === team.id);
    if (!own) return;
    own.lines = structuredClone(team.lines);
    own.defense = structuredClone(team.defense);
    own.goalie = team.goalie;
    own.tactics = structuredClone(team.tactics);
    own.specialTeams = structuredClone(team.specialTeams);
  }
  resume() {
    this.intermission = false;
  }
  /** True while play is stopped for a presentation sequence. */
  get stopped() {
    return !!this.frame.stoppage;
  }
  /**
   * Starts a presentation stoppage, or (without presentation) restarts play
   * immediately exactly as the stoppage would after it ends.
   */
  private stopPlay(
    kind: SpatialStoppage["kind"],
    side: number,
    actor: string,
    dot: Dot,
    then: { changeShift: boolean; finish: boolean },
  ) {
    if (!this.presentation) {
      if (then.finish) return this.finish();
      if (then.changeShift) this.changeShift();
      this.faceoff(dot);
      return;
    }
    this.flight = undefined;
    this.owner = "";
    this.frame.carrierId = undefined;
    this.resumeWith = then;
    const phase = kind === "goal" ? "celebrate" : "whistle";
    this.frame.stoppage = {
      kind,
      phase,
      t: 0,
      length:
        phase === "celebrate"
          ? STOPPAGE_LENGTH.celebrate
          : STOPPAGE_LENGTH.whistle[kind],
      side,
      actor,
      dot: { ...dot },
      variant: hash(`${actor}:${this.result.events.length}`),
    };
    if (kind !== "goal") this.cue("whistle", actor);
  }
  /** One presentation step of a stoppage; the game clock does not move. */
  private stepStoppage(dt: number) {
    const s = this.frame.stoppage!;
    s.t = Math.round((s.t + dt) * 100) / 100;
    this.choreograph(s, dt);
    if (s.t < s.length - 1e-6) return;
    if (s.phase === "celebrate" || s.phase === "whistle") {
      if (this.resumeWith?.finish) {
        this.frame.stoppage = undefined;
        this.resumeWith = undefined;
        this.finish();
        return;
      }
      if (this.resumeWith?.changeShift) this.changeShift();
      this.frame.puck = { x: s.dot.x, y: 1.15, z: s.dot.z };
      Object.assign(s, { phase: "lineup", t: 0, length: STOPPAGE_LENGTH.lineup });
    } else if (s.phase === "lineup") {
      Object.assign(s, { phase: "drop", t: 0, length: STOPPAGE_LENGTH.drop });
    } else {
      this.frame.stoppage = undefined;
      this.resumeWith = undefined;
      this.faceoff(s.dot);
    }
  }
  /**
   * Ends a stoppage at once, doing exactly what its end would do. Used when a
   * period ends on the same step, so the order of restarts never differs from
   * a match played without presentation.
   */
  private flushStoppage() {
    const s = this.frame.stoppage;
    if (!s) return;
    const then = this.resumeWith;
    this.frame.stoppage = undefined;
    this.resumeWith = undefined;
    if (then?.finish) return this.finish();
    if (then?.changeShift) this.changeShift();
    this.faceoff(s.dot);
  }
  /** Moves bodies toward presentation targets (no randomness, no statistics). */
  private glide(b: SkaterBody, tx: number, tz: number, maxSpeed: number, dt: number) {
    const dx = tx - b.x,
      dz = tz - b.z,
      distance = Math.hypot(dx, dz);
    const speed = Math.min(maxSpeed, distance * 1.6);
    const k = Math.min(1, dt * 3.2);
    b.vx += ((distance > 0.05 ? (dx / distance) * speed : 0) - b.vx) * k;
    b.vz += ((distance > 0.05 ? (dz / distance) * speed : 0) - b.vz) * k;
    b.x = clamp(b.x + b.vx * dt, -RINK.halfLength, RINK.halfLength);
    b.z = clamp(b.z + b.vz * dt, -RINK.halfWidth, RINK.halfWidth);
  }
  private choreograph(s: SpatialStoppage, dt: number) {
    const bodies = this.frame.bodies;
    if (s.phase === "lineup" || s.phase === "drop") {
      const spots = this.formation(s.dot);
      bodies.forEach((b) => {
        const spot = spots.get(b.id);
        if (spot) this.glide(b, spot.x, spot.z, s.phase === "drop" ? 1.5 : 6.5, dt);
      });
      return;
    }
    if (s.kind === "goal") {
      const scorer = bodies.find((b) => b.id === s.actor);
      const dir = this.direction(s.side);
      const t = s.t;
      if (scorer) {
        const wall = scorer.z >= 0 ? 1 : -1;
        const benchX = BENCH.centerX[s.side];
        const lane = scorer.x <= benchX ? 1 : -1;
        if (t < 2.2) this.glide(scorer, dir * 18.5, wall * 9.6, 7.5, dt);
        else if (t < 3.9) this.glide(scorer, scorer.x, scorer.z, 1, dt);
        else
          this.glide(
            scorer,
            benchX + lane * (BENCH.halfLength + 1),
            BENCH.frontZ,
            5.5,
            dt,
          );
        const mates = bodies.filter(
          (b) => b.side === s.side && !b.goalie && b.id !== scorer.id,
        );
        mates.forEach((b, i) => {
          const angle = (i / Math.max(1, mates.length)) * Math.PI * 2 + 0.6;
          if (t < 2.2) {
            const r = 2.4;
            this.glide(b, scorer.x + Math.cos(angle) * r, scorer.z + Math.sin(angle) * r, 7.5, dt);
          } else if (t < 3.9) {
            const r = 0.95;
            this.glide(b, scorer.x + Math.cos(angle) * r, scorer.z + Math.sin(angle) * r, 4, dt);
          } else {
            // Follow the scorer down the bench for the fist-bump line.
            const behind = 1.5 * (i + 1);
            this.glide(b, scorer.x - lane * behind, BENCH.frontZ + (i % 2) * 0.5, 5.5, dt);
          }
        });
      }
      bodies
        .filter((b) => b.side !== s.side && !b.goalie)
        .forEach((b, i) =>
          this.glide(b, -dir * 5 + ((i % 3) - 1) * 2.4, b.z * 0.97, 2.2, dt),
        );
      bodies
        .filter((b) => b.goalie)
        .forEach((b) => this.glide(b, -this.direction(b.side) * RINK.goalieX, 0, 1.5, dt));
      return;
    }
    // Whistle: skaters coast to a stop; a penalised player heads to the box.
    bodies.forEach((b) => {
      if (s.kind === "penalty" && b.id === s.actor)
        this.glide(b, PENALTY_BOX.centerX[b.side], PENALTY_BOX.doorZ - 0.4, 5.5, dt);
      else if (b.goalie) this.glide(b, b.x, b.z, 0.5, dt);
      else this.glide(b, b.x + b.vx * 0.25, b.z + b.vz * 0.25, Math.hypot(b.vx, b.vz) * 0.85, dt);
    });
  }
  step() {
    if (this.done || this.intermission) return;
    this.frame.tick++;
    if (this.frame.stoppage) {
      this.stepStoppage(0.1);
      return;
    }
    const dt = 0.1;
    this.time = Math.round((this.time + dt) * 10) / 10;
    this.result.duration = this.time;
    const expired = this.penalties.some((p) => p.until <= this.time);
    this.penalties = this.penalties.filter((p) => p.until > this.time);
    const shift = this.teams.reduce((sum,t)=>sum+Math.floor(this.time/(t.tactics.shiftSeconds??40)),0);
    if (shift !== this.shift || expired) {
      this.shift = shift;
      this.changeShift();
    }
    const puck = this.frame.puck;
    const owner = this.frame.bodies.find((b) => b.id === this.owner);
    // Assign an actual puck retriever per side. Formation offsets previously
    // left every player outside pickup range around a stationary loose puck.
    const spots = this.positions(owner, puck);
    // Teammates keep a little space instead of skating through each other.
    const spacing = (b: SkaterBody, tx: number, tz: number): Dot => {
      for (const o of this.frame.bodies) {
        if (o === b || o.side !== b.side || o.goalie || o.id === this.owner) continue;
        const ox = tx - o.x,
          oz = tz - o.z,
          gap = Math.hypot(ox, oz);
        if (gap > 0.01 && gap < 2.2) {
          tx += (ox / gap) * (2.2 - gap) * 0.5;
          tz += (oz / gap) * (2.2 - gap) * 0.5;
        }
      }
      return { x: tx, z: tz };
    };
    this.frame.bodies.forEach((b) => {
      const p = this.player(b.id);
      if (b.goalie) {
        const spot = this.goalieSpot(b, puck);
        this.skate(b, spot.x, spot.z, 3.6 + (p.attributes.goaliePosition ?? 70) * 0.012, dt);
      } else {
        const spot = spots.get(b.id)!;
        const target = b.id === this.owner ? spot : spacing(b, spot.x, spot.z);
        const tactics = this.teams[b.side].tactics;
        const top =
          (4.6 + (p.attributes.speed ?? 70) * 0.045) *
          (1 - p.fatigue * 0.004) *
          (0.82 + tactics.pace / 260) *
          (b.id === this.owner ? 0.93 : 1);
        this.skate(b, target.x, target.z, top, dt);
      }
      if (!this.appeared.has(b.id)) {
        this.appeared.add(b.id);
        p.stats.gp++;
      }
      p.stats.toi += dt / 60;
      if (!b.goalie) p.fatigue = clamp(p.fatigue + dt * 0.005, 0, 100);
    });
    if (owner) {
      // The puck rides on the blade, a stick length ahead of the carrier.
      const speed = Math.hypot(owner.vx, owner.vz);
      const reach = speed > 0.5 ? 0.75 : 0.45;
      const fx = speed > 0.5 ? owner.vx / speed : this.direction(owner.side);
      const fz = speed > 0.5 ? owner.vz / speed : 0;
      puck.x = clamp(owner.x + fx * reach, -29, 29);
      puck.z = clamp(owner.z + fz * reach, -12, 12);
    }
    if (this.flight) {
      const f = this.flight;
      puck.x += f.vx * dt;
      puck.z += f.vz * dt;
      f.remaining -= dt;
      const shooter = this.frame.bodies.find((b) => b.id === f.shooter);
      if (f.shot && shooter && Math.abs(puck.x) >= 26) {
        const goalie = this.frame.bodies.find(
          (b) => b.side !== f.side && b.goalie,
        );
        const onTarget = Math.abs(puck.z) < 1.05;
        if (onTarget) {
          this.result.shots[f.side]++;
          this.player(f.shooter).stats.sog++;
          if (goalie) this.player(goalie.id).stats.sa++;
          const distance = f.distance ?? 12;
          // Close shots and second chances beat goalies; point shots rarely do.
          const range = clamp(1.4 - distance / 20, 0.55, 1.3);
          const second = this.time <= this.reboundUntil ? 0.06 : 0;
          const screen = this.frame.bodies.some(
            (b) =>
              b.side === f.side &&
              !b.goalie &&
              b.id !== f.shooter &&
              Math.abs(b.x - Math.sign(puck.x) * 23.6) < 1.8 &&
              Math.abs(b.z) < 1.8,
          )
            ? 0.015
            : 0;
          const quality = clamp(
            (0.08 +
              (this.player(f.shooter).attributes.accuracy - 70) * 0.001 +
              (goalie
                ? Math.abs(goalie.z - puck.z) * 0.025 +
                  (75 - this.player(goalie.id).attributes.reflexes) * 0.001
                : 0.9)) *
              range +
              second +
              screen,
            0.02,
            0.99,
          );
          this.result.xg[f.side] += quality;
          const where = {
            x: puck.x,
            z: puck.z,
            height: hash(`${f.shooter}:${this.result.shots[f.side]}:${this.time}`),
          };
          if (this.rng.next() < quality) {
            this.result.goals[f.side]++;
            this.player(f.shooter).stats.g++;
            if (goalie) this.player(goalie.id).stats.ga++;
            const assists = [...new Set(this.touches)]
              .filter((id) => id !== f.shooter)
              .slice(-2);
            assists.forEach((id) => this.player(id).stats.a++);
            const counts = this.counts();
            if (counts[f.side] > counts[1 - f.side]) {
              this.result.pp[f.side]++;
              const index = this.penalties.findIndex((p) => p.side !== f.side);
              if (index >= 0) this.penalties.splice(index, 1);
              this.syncPenaltyBox();
            }
            this.cue("goal", shooter.id, goalie?.id, where);
            this.emit(
              "goal",
              shooter,
              goalie ? "ГОЛ" : "Гол в пустые ворота",
              quality,
            );
            // The puck rests in the back of the net during the celebration.
            this.frame.puck = {
              x: Math.sign(puck.x) * 27.1,
              y: 0.12,
              z: clamp(puck.z, -0.75, 0.75),
            };
            const ends = this.time > 3600;
            this.stopPlay("goal", f.side, shooter.id, CENTER_DOT, {
              changeShift: true,
              finish: ends,
            });
            if (ends) return;
          } else {
            if (goalie) this.cue("save", goalie.id, shooter.id, where);
            this.emit("shot", shooter, "Бросок — сейв", quality);
            const control = goalie ? this.player(goalie.id).attributes.reboundControl ?? 70 : 70;
            const rebound =
              !!goalie &&
              this.rng.next() < clamp(0.3 - (control - 70) * 0.006, 0.08, 0.42);
            if (goalie && rebound) {
              // The puck spills back into the slot and play goes on.
              const angle = (this.rng.next() - 0.5) * 2.4;
              const speed = 5 + this.rng.next() * 5;
              const out = -Math.sign(goalie.x);
              this.frame.puck = { x: goalie.x + out * 0.8, y: 0.12, z: goalie.z };
              this.flight = {
                vx: Math.cos(angle) * speed * out,
                vz: Math.sin(angle) * speed,
                remaining: 1.6,
                shooter: goalie.id,
                side: goalie.side,
                shot: false,
                kind: "loose",
              };
              this.reboundUntil = this.time + 2.5;
              this.touches = [];
            } else {
              // The goalie freezes the puck: restart in that end of the rink.
              if (goalie) this.frame.puck = { x: goalie.x, y: 0.12, z: goalie.z };
              const defending = 1 - f.side;
              this.stopPlay("save", defending, goalie?.id ?? shooter.id, this.zoneDot(defending), {
                changeShift: false,
                finish: false,
              });
            }
          }
        } else {
          // Missed the net: the puck rings around the end boards.
          f.shot = false;
          f.kind = "loose";
          f.remaining = 1.4;
        }
      } else if (!f.shot) {
        // Boards: the puck caroms off them instead of stopping dead.
        if (Math.abs(puck.x) > 29) {
          puck.x = Math.sign(puck.x) * 29;
          f.vx = -f.vx * 0.4;
          f.vz = f.vz * 0.85 + Math.sign(puck.z || 1) * 2;
        }
        if (Math.abs(puck.z) > 12) {
          puck.z = Math.sign(puck.z) * 12;
          f.vz = -f.vz * 0.4;
        }
        // Ice is fast: hard rims and clearances travel the length of the rink.
        const friction = f.kind === "loose" ? 0.75 : 0.22;
        f.vx *= 1 - friction * dt;
        f.vz *= 1 - friction * dt;
        // Icing: cleared from behind the red line across the far goal line.
        if (
          f.icingSide !== undefined &&
          puck.x * this.direction(f.icingSide) >= RINK.goalLine
        ) {
          const offender = f.icingSide;
          this.flight = undefined;
          this.cue("whistle", f.shooter);
          this.stopPlay("icing", offender, f.shooter, this.zoneDot(offender), {
            changeShift: false,
            finish: false,
          });
        } else {
          // Reception and interception along the way.
          const near = this.frame.bodies
            .filter((b) => !b.goalie && b.id !== f.shooter)
            .map((b) => ({ b, gap: Math.hypot(b.x - puck.x, b.z - puck.z) }))
            .filter((o) => o.gap < 1.3)
            .sort((a, z) => a.gap - z.gap);
          for (const { b, gap } of near) {
            const mate = b.side === f.side;
            const takes = mate
              ? f.kind !== "pass" || b.id === f.target || gap < 0.8
              : gap < 1.0 &&
                this.rng.next() <
                  (f.kind === "pass" ? 0.22 : 0.6) *
                    (0.7 + (this.player(b.id).attributes.defensivePosition ?? 70) / 250);
            if (!takes) continue;
            this.flight = undefined;
            this.owner = b.id;
            if (f.kind === "pass") this.cue("receive", b.id, f.shooter);
            if (!mate) {
              this.touches = [b.id];
              if (f.kind === "pass") this.emit("turnover", b, "Перехват");
            } else this.touches.push(b.id);
            break;
          }
          if (this.flight && (f.remaining <= 0 || Math.hypot(f.vx, f.vz) < 1.1))
            this.flight = undefined;
        }
      }
      if (this.flight && f.shot && f.remaining <= 0) this.flight = undefined;
      puck.x = clamp(puck.x, -29, 29);
      puck.z = clamp(puck.z, -12, 12);
    }
    if (!this.owner && !this.flight && !this.frame.stoppage) {
      const nearest = this.frame.bodies
        .filter((b) => !b.goalie)
        .sort(
          (a, b) =>
            Math.hypot(a.x - puck.x, a.z - puck.z) -
            Math.hypot(b.x - puck.x, b.z - puck.z),
        )[0];
      if (nearest && Math.hypot(nearest.x - puck.x, nearest.z - puck.z) < 1.4) {
        this.owner = nearest.id;
        if (
          this.touches.length &&
          !this.teams[nearest.side].players.some(
            (p) => p.id === this.touches[0],
          )
        )
          this.touches = [];
        this.touches.push(nearest.id);
      }
    }
    const carrier = this.frame.bodies.find((b) => b.id === this.owner);
    if (carrier && this.time >= this.decision && !this.frame.stoppage) {
      this.decide(carrier);
    }
    this.frame.carrierId = this.owner || undefined;
    if (this.time === 1200 || this.time === 2400) {
      this.flushStoppage();
      this.intermission = true;
      this.faceoff();
    }
    if (this.time === 3600) {
      this.flushStoppage();
      if (this.result.goals[0] !== this.result.goals[1]) this.finish();
      else {
        this.result.ot = true;
        this.intermission = true;
        this.changeShift();
        this.faceoff();
      }
    }
    if (!this.playoffs && this.time >= 3900 && !this.done) {
      this.result.so = true;
      const side = this.rng.next() < 0.5 ? 0 : 1;
      this.result.goals[side]++;
      this.emit(
        "shootout",
        this.frame.bodies.find((b) => b.side === side && !b.goalie)!,
        "Победа по буллитам",
      );
      this.finish();
    }
  }
  /**
   * The puck carrier's read of the play: protect it under pressure, dump it
   * in when the blue line is closed, clear it out of trouble (watch for
   * icing), move it to the open man or shoot. Defenders can win it back with
   * a stick check or a hit, and shots can be blocked on the way.
   */
  private decide(owner: SkaterBody) {
    const tactics = this.teams[owner.side].tactics;
    const decisions = this.player(owner.id).attributes.decisions ?? 70;
    this.decision = this.time + 1.05 + (100 - decisions) * 0.01;
    const dir = this.direction(owner.side);
    const adv = owner.x * dir;
    const opponents = this.frame.bodies.filter((b) => b.side !== owner.side && !b.goalie);
    const gapTo = (b: SkaterBody) => Math.hypot(b.x - owner.x, b.z - owner.z);
    const pressure = opponents.find((b) => gapTo(b) < 1.5);
    if (pressure && this.rng.next() < 0.14) {
      const rival = this.teams[pressure.side].tactics;
      if (
        this.rng.next() < 0.03 + rival.physical * 0.0008 &&
        this.penalties.filter((p) => p.side === pressure.side).length < 2
      ) {
        this.penalties.push({ id: pressure.id, side: pressure.side, until: this.time + 120 });
        this.syncPenaltyBox();
        this.player(pressure.id).stats.pim += 2;
        this.result.ppo[owner.side]++;
        this.cue("check", pressure.id, owner.id);
        this.emit("penalty", pressure, "2 минуты за нарушение");
        this.cue("penalty", pressure.id, owner.id);
        this.stopPlay("penalty", pressure.side, pressure.id, this.zoneDot(pressure.side), {
          changeShift: true,
          finish: false,
        });
      } else if (
        this.rng.next() <
        0.3 + rival.physical * 0.003 + ((this.player(pressure.id).attributes.checking ?? 70) - 70) * 0.004
      ) {
        // Body check: the puck squirts loose and the battle goes on.
        this.cue("check", pressure.id, owner.id);
        this.emit("hit", pressure, "Силовой приём");
        this.owner = "";
        this.flight = {
          vx: (this.rng.next() - 0.5) * 7,
          vz: (this.rng.next() - 0.5) * 7,
          remaining: 0.9,
          shooter: owner.id,
          side: owner.side,
          shot: false,
          kind: "loose",
        };
        this.player(owner.id).fatigue = clamp(this.player(owner.id).fatigue + 0.6, 0, 100);
      } else {
        this.owner = pressure.id;
        this.touches = [pressure.id];
        this.cue("check", pressure.id, owner.id);
        this.emit("turnover", pressure, "Отбор шайбы");
      }
      return;
    }
    const counts = this.counts();
    const own = counts[owner.side] + Number(this.pullGoalie[owner.side]);
    const them = counts[1 - owner.side] + Number(this.pullGoalie[1 - owner.side]);
    const situation = `${own}v${them}` as SpecialTeamsSituation;
    const style = this.teams[owner.side].specialTeams?.[situation]?.style;
    const shooting =
      tactics.shooting / 100 +
      (style === "net-front" || style === "aggressive" ? 0.12 : style === "possession" ? -0.12 : 0);
    const netX = dir * RINK.goalLine;
    const distance = Math.hypot(netX - owner.x, owner.z);
    const rebound = this.time <= this.reboundUntil && distance < 9;
    const shot =
      adv > RINK.blueLine &&
      (rebound ||
        (distance < 21 &&
          this.time >= this.nextShot[owner.side] &&
          this.rng.next() < shooting * 0.45));
    if (shot) {
      this.nextShot[owner.side] = rebound
        ? Math.max(this.nextShot[owner.side], this.time + 10)
        : this.time + 19 + this.rng.next() * 26;
      const tz = (this.rng.next() - 0.5) * 3;
      const dx = dir * 27 - this.frame.puck.x,
        dz = tz - this.frame.puck.z,
        length = Math.max(0.1, Math.hypot(dx, dz));
      // Shot block: a defender in the lane gets in front of it.
      const blocker = opponents.find((b) => {
        const t = ((b.x - owner.x) * dx + (b.z - owner.z) * dz) / length;
        if (t < 1.2 || t > Math.min(9, length - 2)) return false;
        const off = Math.abs((b.x - owner.x) * dz - (b.z - owner.z) * dx) / length;
        return off < 0.75;
      });
      if (
        blocker &&
        this.rng.next() < 0.42 * ((this.player(blocker.id).attributes.blocking ?? 70) / 75)
      ) {
        this.cue("shot", owner.id, undefined, { release: rebound || distance < 6 ? "snap" : distance > 15 ? "slap" : "wrist" });
        this.cue("block", blocker.id, owner.id);
        this.owner = "";
        this.frame.puck = { x: blocker.x, y: 0.12, z: blocker.z };
        this.flight = {
          vx: -dir * (2 + this.rng.next() * 4),
          vz: (this.rng.next() - 0.5) * 8,
          remaining: 0.8,
          shooter: blocker.id,
          side: blocker.side,
          shot: false,
          kind: "loose",
        };
        return;
      }
      this.flight = {
        vx: (dx / length) * 28,
        vz: (dz / length) * 28,
        remaining: length / 28 + 0.1,
        shooter: owner.id,
        side: owner.side,
        shot: true,
        distance,
      };
      this.cue("shot", owner.id, undefined, { release: rebound || distance < 6 ? "snap" : distance > 15 ? "slap" : "wrist" });
      this.owner = "";
      return;
    }
    const send = (
      tx: number,
      tz: number,
      speed: number,
      kind: "pass" | "dump" | "clear",
      target?: string,
      icingSide?: number,
    ) => {
      const dx = tx - this.frame.puck.x,
        dz = tz - this.frame.puck.z,
        length = Math.max(0.1, Math.hypot(dx, dz));
      this.flight = {
        vx: (dx / length) * speed,
        vz: (dz / length) * speed,
        remaining: length / speed + (kind === "pass" ? 0.6 : 1.8),
        shooter: owner.id,
        side: owner.side,
        shot: false,
        kind,
        target,
        icingSide,
      };
      this.cue("pass", owner.id, target);
      this.owner = "";
    };
    // Blue line closed: chip it in deep and go get it.
    const wall = opponents.find((b) => {
      const ahead = (b.x - owner.x) * dir;
      return ahead > 0 && ahead < 5.5 && Math.abs(b.z - owner.z) < 4;
    });
    if (adv > -4 && adv < RINK.blueLine + 0.5 && wall && this.rng.next() < 0.45) {
      const corner = owner.z >= 0 ? -1 : 1;
      send(dir * 28.4, corner * 9.5, 18, "dump");
      return;
    }
    // Trapped in the own zone: get it out, even at the risk of icing.
    const swarm = opponents.filter((b) => gapTo(b) < 3.2).length;
    if (adv < -RINK.blueLine && swarm >= 1 && this.rng.next() < (swarm >= 2 ? 0.3 : 0.07)) {
      const shorthanded = own < them;
      const wallSide = owner.z >= 0 ? 1 : -1;
      if (shorthanded || this.rng.next() < 0.22) {
        // Desperation: fire it the length of the ice (icing unless shorthanded).
        send(dir * 29, (this.rng.next() - 0.5) * 16, 21, "clear", undefined, owner.x * dir < 0 && !shorthanded ? owner.side : undefined);
      } else {
        // Chip it off the boards and out to the neutral zone.
        send(dir * (1 + this.rng.next() * 9), wallSide * 11.5, 15, "clear");
      }
      return;
    }
    const mates = this.frame.bodies.filter((b) => b.side === owner.side && !b.goalie && b.id !== owner.id);
    if (mates.length && this.rng.next() < 0.15 + (tactics.passingRisk ?? 50) * 0.004) {
      // The open man: forward progress plus space from the nearest checker.
      const scored = mates.map((m) => {
        const space = Math.min(...opponents.map((o) => Math.hypot(o.x - m.x, o.z - m.z)), 12);
        const progress = (m.x - owner.x) * dir;
        return { m, value: space * 0.6 + progress * 0.25 + this.rng.next() * 2.5 };
      });
      const mate = scored.sort((a, b) => b.value - a.value)[0].m;
      const lead = Math.hypot(mate.x - owner.x, mate.z - owner.z) / 16;
      send(
        clamp(mate.x + mate.vx * lead, -28.5, 28.5),
        clamp(mate.z + mate.vz * lead, -11.5, 11.5),
        16,
        "pass",
        mate.id,
      );
    }
  }
  private finish() {
    this.done = true;
    const winner = this.result.goals[0] > this.result.goals[1] ? 0 : 1;
    const goalie = this.teams[winner].players.find(
      (p) => p.id === this.teams[winner].goalie,
    );
    if (goalie) goalie.stats.wins++;
    updateMatchPerformance(this.teams, this.baseline, this.teams[winner].id);
    rateMatch(this.teams, this.baseline, this.teams[winner].id, this.result);
  }
}

