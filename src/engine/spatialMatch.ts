import { lineStyle, type Forecheck, type ShiftReport, type LineStyle, type ScoutFrame } from "./coaching";
import {stickSide} from "./handedness";
import { bladeContact, bounceAtBoards, GRAVITY, ICE_DRAG, PUCK_ICE_Y, stepPuck } from "./puckPhysics";
import {crossbarContact,GOAL_HEIGHT,closestOnPath, clearSkaterNet, netContact, skaterNetRoute, PUCK_RADIUS, GOAL_HALF_WIDTH, POST_RADIUS} from "./goalGeometry";
import {
  lineWithDoubleShift,
  resolveIceTime,
  shiftLength,
  normalizeShares,
  pickNextUnit,
} from "./iceTime";
import { RNG, clamp } from "./random";
import type { Team, Player, Result, SpecialTeamsSituation } from "./types";
import { ensureSpecialTeams } from "./tactics";
import { snapshotStats, updateMatchPerformance } from "./performance";
import { rateMatch } from "./matchRatings";
import { BENCH, CENTER_DOT, PENALTY_BOX, RINK, insideRink, separateSkaters, type Dot } from "./rink";

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
    | "line-call"
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
  screened?: boolean;
  reboundDirection?: {x:number;z:number};
  saveOutcome?: "held" | "rebound";
  contact?: "stick" | "body" | "pin";
}
/**
 * A stoppage in play, shown only in presentation mode: the clock is stopped
 * while players celebrate, the whistle goes and both teams line up for the
 * faceoff. It never changes the match; see SpatialMatch `presentation`.
 */
export interface RecordedPlay {
  bodies:SkaterBody[]; puck:SpatialFrame["puck"]; carrierId?:string; passTarget?:string; cues:SpatialCue[]; at:number; save:boolean;
}
export interface CoachingFrame extends RecordedPlay {
  tick: number;
  score: number[];
  dot: Dot;
  stoppage?: Omit<SpatialStoppage,"replay">;
  penaltyBox: SpatialFrame["penaltyBox"];
}
export interface SpatialStoppage {
  replay?:RecordedPlay[];
  kind: "goal" | "save" | "penalty" | "icing" | "offside" | "trapped";
  phase: "review" | "celebrate" | "whistle" | "lineup" | "drop";
  infraction?: "holding" | "roughing";
  review?: "confirmed" | "interference";
  /** Seconds elapsed in the current phase and its length. */
  t: number;
  length: number;
  /** Side that scored, made the save (goalie's side) or took the penalty. */
  side: number;
  /** Scorer, goalie or penalised player. */
  actor: string;
  /** Faceoff dot that play restarts from. */
  dot: Dot;
  gatheringOrder?: string[];
  /** Deterministic variety for celebrations. */
  variant: number;
}
export interface SpatialFrame {
  passTarget?:string;
  carrierId?: string;
  delayedOffside?: number;
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
  openingDraw?: boolean;
  recordReplay?:boolean;
  /** Regulation clock seconds per second of skating. */
  clockRate?: 1 | 2;
}

const STOPPAGE_LENGTH = {
  celebrate: 9.4,
  whistle: { trapped: 1.7, save: 1.7, penalty: 10.8, goal: 0, icing: 1.9, offside: 1.6 },
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
  readonly shifts: ShiftReport[] = [];
  readonly clips = new Map<number, CoachingFrame[]>();
  private leadIn: CoachingFrame[] = [];
  private shift: (ShiftReport | undefined)[] = [];
  private roles: Map<string,"screen"|"pass"|"finish">[][]=[[],[]];
  roleFor(side:number,line:number,id:string){return this.roles[side]?.[line]?.get(id)}
  private styles: LineStyle[][] = [];
  private assignments: Map<string, number>[] = [];
  readonly linePlans = [new Map<number, import("./coaching").AttackPlan>(), new Map<number, import("./coaching").AttackPlan>()];
  readonly counterLines = new Map<number,number>();
  attackPlan(side:number,line:number) {
    if(line < 0) return "auto";
    return this.linePlans[side].get(line) ?? this.teams[side].tactics.benchOpening?.plan ?? "auto";
  }
  readonly pendingOrders: Map<number, Forecheck>[] = [new Map(), new Map()];
  readonly orders = [new Map<number,{order:Forecheck;at:number}>(),new Map<number,{order:Forecheck;at:number}>()];
  private lastPossession = -1;
  private actualLine = [-1,-1];
  private currentMatchup?: NonNullable<Result["matchups"]>[number];
  private owner = "";
  private flight?: {
    vx: number;
    vz: number;
    vy?: number;
    shooter: string;
    side: number;
    shot: boolean;
    remaining: number;
    /** What the puck is doing: a pass, a dump-in, a clearance or loose. */
    kind?: "pass" | "dump" | "clear" | "loose";
    fromDefensiveZone?: boolean;
    /** Intended receiver of a pass. */
    target?: string;
    /** Shot distance to the net when released (quality model). */
    distance?: number;
    /** Side that iced the puck if it crosses the far goal line untouched. */
    icingSide?: number;
    height?: number;
    screened?: boolean;
    creaseReview?: SpatialStoppage["review"];
  };
  /** A rebound is live until this time: second-chance shots are dangerous. */
  private reboundUntil = -1;
  private penalties: { id: string; side: number; until: number }[] = [];
  private decision = 0;
  private nextChallenge = 0;
  private boardContact?: { hitter: string; carrier: string; until: number };
  private lastRelease?: { id: string; until: number };
  private pickup?: { point: Dot; since: number };
  private netBattle?: Dot & {since:number};
  private creasePossession?: {owner: string; since: number};
  private looseAnchor?: Dot & { since: number };
  private pendingPass?: { passer: string; target: string; aim: Dot; speed: number; at: number };
  private nextShot = [0, 0];
  private readonly players: Map<string, Player>;
  private forwardUnit = [-1, -1];
  private defenseUnit = [-1, -1];
  private evenSeconds = new Map<string, number>();
  private shiftShares: number[][] = [[],[]];
  private shiftStart = [0, 0];
  private goalieWasPulled = [false, false];
  private rolling: (string[] | undefined)[] = [];
  private changing: (string | undefined)[] = [];
  private nextExchange = [0, 0];

  private appeared = new Set<string>();
  private touches: string[] = [];
  private baseline;
  private replayFrames?:RecordedPlay[];
  private scoutFrames: ScoutFrame[]=[];
  private scoutSeconds=-1;
  private bestScoutEvents: number[][]=[[],[]];
  private recordedCue=0;
  private readonly clockRate: 1 | 2;
  private get skatingTime() { return this.time / this.clockRate; }
  private readonly presentation: boolean;
  /** Work deferred to the end of a presentation stoppage. */
  private finishAfterWhistle = false;
  constructor(
    home: Team,
    away: Team,
    seed: number,
    readonly playoffs = false,
    options: SpatialMatchOptions = {},
  ) {
    this.clockRate = options.clockRate ?? 1;
    this.presentation = !!options.presentation;
    if(this.presentation && options.recordReplay)this.replayFrames=[];
    this.teams = structuredClone([home, away]);
    this.players = new Map(this.teams.flatMap(t => t.players.map(p => [p.id, p] as const)));
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
    this.result.matchups = [];
    this.result.startingUnits = Object.fromEntries(this.teams.flatMap(team=>
      [...team.lines,...team.defense].flatMap((ids,i)=>ids.map(id=>[id,i<team.lines.length?i+1:i-team.lines.length+1]))));
    this.teams.forEach((team, side) => {
      this.indexLines(side, team);
      this.rotate(side);
    });
    this.changeShift();
    if (options.openingDraw && this.presentation) {
      const spots=this.formation(CENTER_DOT);
      for(const b of this.frame.bodies) Object.assign(b,spots.get(b.id),{vx:0,vz:0});
      this.frame.stoppage={kind:"save",phase:"lineup",dot:{...CENTER_DOT},t:0,length:2.2,side:0,actor:"",variant:0};
    } else this.faceoff();
  }
  private indexLines(side: number, team: Team) {
    this.styles[side] = team.lines.map((_,i)=>lineStyle(team,i));
    this.roles[side]=team.lines.map(ids=>{
      const group=ids.map(id=>team.players.find(p=>p.id===id)).filter(p=>!!p);
      const roles=new Map<string,"screen"|"pass"|"finish">();
      if(group.length!==3)return roles;
      let best=-Infinity;
      for(const screen of group)for(const passer of group){
        if(screen===passer)continue;
        const finisher=group.find(p=>p!==screen&&p!==passer)!;
        const a=screen.attributes,b=passer.attributes,c=finisher.attributes;
        const fit=(a.strength+a.offensivePosition)+(b.passing+b.puckControl)+(c.accuracy+c.offensivePosition);
        if(fit>best){best=fit;roles.set(screen.id,"screen");roles.set(passer.id,"pass");roles.set(finisher.id,"finish")}
      }
      return roles;
    });
    this.assignments[side] = new Map(team.lines.flatMap((line,i)=>line.map(id=>[id,i] as const)));
  }
  style(side: number, line: number) { return this.styles[side][line] ?? "balanced"; }
  setLinePlan(side:number,line:number,plan:import("./coaching").AttackPlan){
    if(!this.teams[side]?.lines[line] || this.attackPlan(side,line)===plan)return;
    this.linePlans[side].set(line,plan);
    this.cue("line-call",this.teams[side].id);
  }
  orderLine(side: number, line: number, order: Forecheck) {
    if (this.teams[side]?.lines[line]) this.pendingOrders[side].set(line, order);
  }
  get canMatchHomeLine() {
    const stop = this.frame.stoppage;
    return stop?.phase === "lineup" && !(stop.kind === "icing" && stop.side === 0) &&
      !this.penalties.length && !this.pullGoalie.some(Boolean) && (this.time < 3600 || this.playoffs);
  }
  selectHomeLine(line: number) {
    if (!this.canMatchHomeLine || this.teams[0].lines[line]?.length!==3 || !this.teams[0].lines[line]?.every(id=>!this.player(id).injury)) return false;
    this.forwardUnit[0] = line;
    this.shiftStart[0] = this.time;
    this.changeShift(1);
    const stop=this.frame.stoppage!;
    const formation=this.formation(stop.dot);
    for (const b of this.frame.bodies) {
      const target=formation.get(b.id)!;
      stop.length=Math.max(stop.length,stop.t+Math.hypot(target.x-b.x,target.z-b.z)/6.5+1.2);
    }
    this.cue("line-call",this.teams[0].id);
    return true;
  }
  deployedLine(side: number) {
    const votes = [0,0,0,0];
    for (const b of this.frame.bodies) {
      const i = this.assignments[side].get(b.id);
      if (b.side === side && i !== undefined) votes[i]++;
    }
    const majority = Math.max(...votes);
    return majority >= 2 ? votes.indexOf(majority) : -1;
  }
  private trackShift(seconds: number) {
    const even = !this.penalties.length && !this.pullGoalie.some(Boolean) && (this.time < 3600 || this.playoffs);
    for (const side of [0,1]) {
      const line = even ? this.deployedLine(side) : -1;
      if (line !== this.actualLine[side]) {
        this.actualLine[side] = line;
        this.shift[side] = undefined;
        if (line >= 0) {
          const order = this.pendingOrders[side].get(line);
          if (order) { this.orders[side].set(line,{order,at:this.time-seconds}); this.pendingOrders[side].delete(line); this.cue("line-call",this.teams[side].id); }
          const shift: ShiftReport = { side,line,start:this.time-seconds,end:this.time,
            plan:this.attackPlan(side,line), opponentLine:this.deployedLine(1-side),
            forecheck:this.orders[side].get(line)?.order ?? this.teams[side].tactics.forecheck,
            recoveries:0,exitsAgainst:0,shots:0,against:0,xg:0,events:[] };
          this.shift[side] = shift;
          this.shifts.push(shift);
        }
      }
      if (this.shift[side]) this.shift[side]!.end = this.time;
    }
    const [home,away] = this.actualLine;
    if (home < 0 || away < 0) { this.currentMatchup=undefined; return; }
    if (this.currentMatchup?.home !== home || this.currentMatchup.away !== away) {
      let row = this.result.matchups!.find(r=>r.home===home && r.away===away);
      if (!row) { row={home,away,seconds:0,shots:[0,0],goals:[0,0]}; this.result.matchups!.push(row); }
      this.currentMatchup=row;
    }
    this.currentMatchup.seconds += seconds;
  }

  private player(id: string): Player {
    return this.players.get(id)!;
  }
  private cue(
    kind: SpatialCue["kind"],
    id: string,
    target?: string,
    extra: Pick<SpatialCue, "x" | "z" | "height" | "release" | "contact" | "screened" | "saveOutcome" | "reboundDirection"> = {},
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
  private plannedUnit(side: number) {
    const team = this.teams[side];
    const counts = this.counts();
    const n = counts[side] + Number(this.pullGoalie[side]);
    const other = counts[1 - side] + Number(this.pullGoalie[1 - side]);
    const situation = `${n}v${other}` as SpecialTeamsSituation;
    const unit = ensureSpecialTeams(team)[situation];
    // Even-strength selections stay fixed until the next safe change.
    const plan = resolveIceTime(team);
    const planned = unit?.players ?? [
      ...lineWithDoubleShift(team, this.forwardUnit[side], plan),
      ...team.defense[this.defenseUnit[side]],
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
    return ids;
  }
  private changeShift(lockedSide?: number) {
    const old = new Map(this.frame.bodies.map((b) => [b.id, b]));
    this.frame.bodies = [];
    this.teams.forEach((_team, side) => {
      if (side === lockedSide) {
        this.frame.bodies.push(...[...old.values()].filter(b => b.side === side));
        return;
      }
      this.rolling[side] = undefined;
      this.changing[side] = undefined;
      this.goalieWasPulled[side] = this.pullGoalie[side];
      const ids = this.plannedUnit(side);
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
  /** Expiry and a coach pulling the goalie change manpower immediately.
   * Retain everyone else on the ice until their own change opportunity. */
  private adjustManpower(returning: {id:string;side:number}[]) {
    const counts = this.counts();
    for (const side of [0, 1]) {
      const ice = this.frame.bodies.filter(b => b.side === side);
      const pulled = this.pullGoalie[side];
      const skaters = ice.filter(b => !b.goalie);
      const needed = counts[side] + Number(pulled);
      if (needed === skaters.length && pulled === this.goalieWasPulled[side]) continue;
      this.goalieWasPulled[side] = pulled;
      this.rolling[side] = undefined;
      const goalie = ice.find(b => b.goalie);
      const remove = new Set<string>();
      if (pulled && goalie) remove.add(goalie.id);
      while (skaters.length > needed) {
        const index = skaters[skaters.length - 1].id === this.owner ? skaters.length - 2 : skaters.length - 1;
        remove.add(skaters.splice(index, 1)[0].id);
      }
      this.frame.bodies = this.frame.bodies.filter(b => !remove.has(b.id));
      const plan = this.plannedUnit(side);
      const returningIds = returning.filter(p => p.side === side).map(p => p.id);
      const candidates = new Set([...returningIds, ...plan]);
      for (const id of candidates) {
        if (this.frame.bodies.some(b => b.id === id)) continue;
        const isGoalie = this.player(id).pos === "G";
        if (isGoalie ? pulled || goalie : skaters.length >= needed) continue;
        const fromBox = returningIds.includes(id);
        const body = {id, side, goalie:isGoalie, vx:0, vz:0,
          x: fromBox ? PENALTY_BOX.centerX[side] : BENCH.centerX[side],
          z: fromBox ? RINK.halfWidth : BENCH.frontZ};
        this.frame.bodies.push(body);
        if (!isGoalie) skaters.push(body);
      }
    }
  }
  private rotate(side: number) {
    const team = this.teams[side];
    const plan = resolveIceTime(team);
    this.shiftShares[side]=plan.forwards;
    // Live shifts vary in length and a whistle may interrupt a rolling change.
    // Credit the ice actually taken, in units of a standard shift.
    const credit = (line: string[]) => line.reduce((sum, id) =>
      sum + (this.evenSeconds.get(id) ?? 0), 0) / (Math.max(1, line.length) * shiftLength(team));
    this.forwardUnit[side] = pickNextUnit(normalizeShares(plan.forwards), team.lines.map(credit), this.forwardUnit[side]);
    this.defenseUnit[side] = pickNextUnit(normalizeShares(plan.defense), team.defense.map(credit), this.defenseUnit[side]);
    this.shiftStart[side] = this.time;
  }
  private desiredShiftLength(side: number) {
    const team=this.teams[side];
    const shares=this.shiftShares[side];
    const share=shares[this.forwardUnit[side]] ?? 25;
    return shiftLength(team)*clamp(share/25,.60,1.40);
  }
  private matchupAtDraw(dot:Dot) {
    if(this.penalties.length || this.pullGoalie.some(Boolean) || this.time>=3600 && !this.playoffs) return;
    const counter=this.counterLines.get(this.forwardUnit[1]);
    if(counter!==undefined){
      const club=this.teams[0], ids=club.lines[counter];
      if(resolveIceTime(club).forwards[counter]>0 && ids?.length===3 && ids.every(id=>!this.player(id).injury && this.player(id).fatigue<85)){
        if(this.forwardUnit[0]!==counter)this.shiftStart[0]=this.time;
        this.forwardUnit[0]=counter;
        return;
      }
    }
    const zone=dot.x*this.direction(0);
    const protecting=zone < -RINK.blueLine && this.forwardUnit[1]===0;
    const chasing=zone > RINK.blueLine && this.time>=3000 && this.result.goals[0]<this.result.goals[1];
    if(!protecting && !chasing)return;
    const club=this.teams[0], plan=resolveIceTime(club);
    let best=-Infinity, choice=this.forwardUnit[0];
    club.lines.forEach((ids,index)=>{
      if(!plan.forwards[index] || ids.length!==3)return;
      const players=ids.map(id=>this.player(id));
      if(players.some(p=>p.injury))return;
      const rating=players.reduce((n,p)=>n + (protecting
        ? (p.attributes.defensivePosition+p.attributes.checking)/2
        : (p.attributes.accuracy+p.attributes.passing)/2) - p.fatigue*.35,0)/3;
      // Rest the group that just finished a long shift.
      const score=rating - (index===this.actualLine[0] ? 8 : 0);
      if(score>best){best=score;choice=index;}
    });
    this.forwardUnit[0]=choice;
    this.shiftStart[0]=this.time;
  }
  private changeAtWhistle(kind: SpatialStoppage["kind"], offender: number, dot:Dot=CENTER_DOT) {
    const locked = kind === "icing" ? offender : undefined;
    this.teams.forEach((team, side) => {
      if (side !== locked && this.time - this.shiftStart[side] >= this.desiredShiftLength(side) * .6)
        this.rotate(side);
    });
    if(locked!==0)this.matchupAtDraw(dot);
    this.changeShift(locked);
  }
  /** Bring one replacement over the boards only after the outgoing skater
   * reaches the gate. A turnover suspends further changes until it is safe. */
  private lineChangeRoutes(spots: Map<string, Dot>, owner?: SkaterBody) {
    for (const side of [0, 1]) {
      const progress = this.frame.puck.x * this.direction(side);
      const controlled = owner?.side === side && progress > 0 &&
        !this.frame.bodies.some(b => b.side !== side && !b.goalie && Math.hypot(b.x-owner.x, b.z-owner.z) < 2.8);
      const dumped = this.flight?.side === side && this.flight.kind === "dump" && progress > RINK.blueLine;
      if ((!controlled && !dumped) || this.frame.delayedOffside === side ||
          this.flight?.target && this.flight.side !== side) {
        this.changing[side] = undefined;
        continue;
      }
      if (this.skatingTime < this.nextExchange[side]) continue;
      if (!this.rolling[side]) {
        if (this.time - this.shiftStart[side] < this.desiredShiftLength(side)) continue;
        this.rotate(side);
        this.rolling[side] = this.plannedUnit(side);
      }
      const unit = this.rolling[side]!;
      const ice = this.frame.bodies.filter(b => b.side === side);
      const waiting = unit.filter(id => this.player(id).pos !== "G" && !ice.some(b => b.id === id));
      if (!waiting.length) {
        this.rolling[side] = undefined;
        this.changing[side] = undefined;
        continue;
      }
      const gateX = BENCH.centerX[side];
      const gateZ = BENCH.frontZ;
      const distance = (b: SkaterBody) => Math.hypot(b.x - gateX, b.z - gateZ);
      const isDefender = (id: string) => this.player(id).pos === "D";
      const direction = this.direction(side);
      const lastDefender = ice.filter(b => !b.goalie && isDefender(b.id))
        .sort((a,b) => (a.x-b.x)*direction)[0];
      const eligible = ice.filter(b => !b.goalie && !unit.includes(b.id) && b !== owner &&
        b.id !== this.flight?.target && waiting.some(id => isDefender(id) === isDefender(b.id)) &&
        Math.hypot(b.x - this.frame.puck.x, b.z - this.frame.puck.z) > 5 &&
        (b !== lastDefender || progress > RINK.blueLine + 3 ||
          ice.some(mate => mate !== b && !mate.goalie && isDefender(mate.id) && mate.x*direction < 0)));
      const outgoing = eligible.find(b => b.id === this.changing[side]) ??
        eligible.sort((a,b) => distance(a) - distance(b))[0];
      if (!outgoing) continue;
      this.changing[side] = outgoing.id;
      if (distance(outgoing) > .82) {
        spots.set(outgoing.id, {x: gateX, z: gateZ});
      } else {
        spots.delete(outgoing.id);
        outgoing.id = waiting.find(id => isDefender(id) === isDefender(outgoing.id))!;
        outgoing.x = gateX + this.direction(side) * 1.15;
        outgoing.z = gateZ;
        outgoing.vx = direction * 1.4;
        outgoing.vz = 1.9;
        this.changing[side] = undefined;
        this.nextExchange[side] = this.skatingTime + .9;
        spots.set(outgoing.id, {x: outgoing.x + direction * 1.5, z: gateZ + 2});
      }
    }
  }
  private checkEntry(previousX: number, side: number, carrier: string | undefined, previousSkaters: Dot[]) {
    const d = this.direction(side);
    const before = previousX * d, after = this.frame.puck.x * d;
    // The whole puck must clear the far edge of the 30 cm painted line.
    const entry = RINK.blueLine + .15 + .038;
    if (carrier && before <= -entry && after > -entry && this.shift[1-side])
      this.shift[1-side]!.exitsAgainst++;
    if (before > entry || after <= entry) return;
    const fraction = (entry - before) / (after - before);
    // Approximate the trailing skate rather than calling offside on a torso
    // leaning across the line. Sample at the instant the puck crossed.
    const early = this.frame.bodies.some((b, i) => b.side === side && !b.goalie && b.id !== carrier &&
      (previousSkaters[i].x + (b.x - previousSkaters[i].x) * fraction) * d > RINK.blueLine + .15 + .32);
    if (early) this.frame.delayedOffside = side;
  }
  private whistleOffside(body: SkaterBody) {
    this.emit("offside", body, "Вне игры");
    this.stopPlay("offside", body.side, body.id,
      {x: this.direction(body.side) * (RINK.blueLine - 1.5), z: Math.sign(this.frame.puck.z || 1) * RINK.dotZ});
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
    if(type==="shot" || type==="goal") {
      for (const shift of this.shift) shift?.events.push(this.result.events.length);
      if (this.shift[body.side]) { this.shift[body.side]!.shots++; this.shift[body.side]!.xg += xg ?? 0; }
      if (this.shift[1-body.side]) this.shift[1-body.side]!.against++;
      if (this.currentMatchup) {
        this.currentMatchup.shots[body.side]++;
        if(type==="goal") this.currentMatchup.goals[body.side]++;
      }
      if(this.replayFrames) {
        this.clips.set(this.result.events.length,[...this.leadIn, this.reviewFrame()]);
      }
    }
    let scoutFilm:ScoutFrame[]|undefined;
    if(this.scoutFrames.length && xg && (type==="shot" || type==="goal")) {
      const best=this.bestScoutEvents[body.side];
      if(best.length<2 || (this.result.events[best[0]].xg??0)<xg) {
        if(best.length===2)delete this.result.events[best.shift()!].scoutFilm;
        scoutFilm=[...this.scoutFrames,this.scoutFrame()];
        const idx=this.result.events.length;
        if(!best.length || (this.result.events[best[0]].xg??0)>xg)best.unshift(idx);
        else best.push(idx);
      }
    }
    this.result.events.push({ ...(scoutFilm ? {scoutFilm} : {}),
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
      if (taker) spots.set(taker.id, { x: dot.x - dir * 0.53, z: dot.z });
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
    const wobble = (i: number, k: number) => Math.sin(this.skatingTime * (0.4 + 0.07 * i) + i * 1.7) * k;
    for (const s of [0, 1]) {
      const d = this.direction(s);
      const tactics = this.teams[s].tactics;
      const lane = 4.5 + (tactics.width ?? 50) * 0.045;
      const skaters = this.frame.bodies.filter((b) => b.side === s && !b.goalie);
      const isD = (b: SkaterBody) => this.player(b.id).pos === "D";
      const adv = puck.x * d; // > 0: puck in this team's attacking half
      const intercept = this.flight && !this.flight.shot
        ? { x: puck.x + this.flight.vx * .22, z: puck.z + this.flight.vz * .22 }
        : puck;
      const byDistance = [...skaters].sort((a, b) =>
        Math.hypot(a.x - intercept.x, a.z - intercept.z) -
        Math.hypot(b.x - intercept.x, b.z - intercept.z),
      );
      // Keep the attacking shape while a pass travels. Only the intended
      // receiver breaks his route to meet it.
      const receiverInFlight = this.flight?.kind === "pass" && this.flight.side === s
        ? skaters.find(b => b.id === this.flight?.target) : undefined;
      const attacking = owner?.side === s ? owner : receiverInFlight;
      if (attacking) {
        // In possession: carrier drives, others give options.
        spots.set(attacking.id, receiverInFlight ? this.retrievalSpot(attacking, intercept) : this.carrierRoute(attacking, d, lane));
        const others = skaters.filter((b) => b.id !== attacking.id);
        const forwards = others.filter((b) => !isD(b));
        const defence = others.filter(isD);
        const ozone = adv > RINK.blueLine;
        const strong = side(puck.z);
        const identity = this.style(s,this.actualLine[s]);
        const middleClosed=this.frame.bodies.some(o=>o.side!==s && !o.goalie &&
          Math.abs(o.z)<3 && (o.x-puck.x)*d>0 && (o.x-puck.x)*d<9);
        // At the wall keep a short outlet on the puck side and a second
        // forward inside the dots. Use the forwards' natural wings so they
        // keep their assignment while their routes cross.
        const wallPlay=Math.abs(puck.z)>7.3 && forwards.length>=2;
        const outlet=wallPlay ? forwards.find(b=>this.player(b.id).pos===(strong*d>0 ? "RW" : "LW")) ?? forwards[0] : undefined;
        const insideForward=outlet && forwards.find(b=>b!==outlet);
        const plan=this.attackPlan(s,this.actualLine[s]);
        const priority=plan==="high"?"pass":plan==="wide"?"finish":"screen";
        const lead=forwards.find(b=>this.roleFor(s,this.actualLine[s],b.id)===priority)??forwards[0];
        const support = forwards.filter(f => f!==lead);
        forwards.forEach((b, i) => {
          const role = plan==="auto" ? i%3 : b===lead ? 0 : 1+support.indexOf(b);
          let spot = ozone
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
          if(b===outlet){
            // Short cycling pass along the end wall, or the first outlet up ice.
            spot=ozone ? at(puck.x-d*3,strong*Math.min(10.7,Math.abs(puck.z)-1))
              : at(puck.x+d*4.8,strong*8.1);
          } else if(b===insideForward){
            spot=ozone ? at(d*22.1,-strong*2.1) : at(puck.x+d*6.3,strong*1.3);
          } else if(outlet){
            spot=ozone ? at(d*15.4,-strong*3.1) : at(puck.x+d*8,-strong*lane);
          }
          if (!ozone && !outlet && role===0) spot = middleClosed
            ? at(puck.x+d*6,-strong*(lane+1.8)) : at(puck.x+d*6,-strong*2.2);
          if (ozone && identity==="cycle" && role===0) spot=at(d*24.2,-strong*1.1);
          if (ozone && identity==="skill" && role===1) spot=at(d*19,-strong*5.2);
          if(plan==="wide") {
            spot=role===2 ? at(ozone ? d*14.8 : puck.x-d*2.8,puck.z*.35)
              : at(ozone ? d*(role===0?20:17) : puck.x+d*(role===0?6:3),(role===0?-strong:strong)*(ozone?8:9));
          }
          if(plan==="slot" && ozone) {
            spot=role===0 ? at(d*24.1,-strong*1.1) : role===1 ? at(d*19.2,strong*3.2) : at(d*15.6,-strong*3.8);
          }
          if(plan==="high" && role===0) spot=ozone ? at(d*14.2,-strong*3.6) : at(puck.x-d*3.5,puck.z*.5);
          // When the puck drops below the circle, separate the cut to the far post
          // from the higher return lane. Keep the short wall outlet available.
          if(plan==="auto" && wallPlay && adv>RINK.dotX && b===insideForward)
            spot=at(d*(RINK.goalLine-2.8),-strong*2.4);
          if (wallPlay && ozone && b === outlet && this.frame.bodies.some(o =>
            o.side !== s && !o.goalie && Math.hypot(o.x-attacking.x,o.z-attacking.z)<2.3)) {
            // Stay within one short pass of a pinned carrier, on the inside shoulder.
            spot=at(attacking.x-d*2.4, attacking.z-strong*2.2);
          }
          // Step off a marked lane to show the carrier a passing option.
          const marker = this.frame.bodies.find(o => o.side !== s && !o.goalie && Math.hypot(o.x-spot.x,o.z-spot.z)<2.6);
          spots.set(b.id, marker ? at(spot.x-d*.6, spot.z+(spot.z >= marker.z ? 2 : -2)) : spot);
        });
        defence.forEach((b, i) => {
          const z = (i % 2 ? 1 : -1) * (ozone ? 6.2 : 4.6) + wobble(i + 5, 1);
          spots.set(b.id, ozone ? at(d * 17.2, z) : at(Math.min(puck.x * d - 9, 12) * d, z));
        });
        if (!forwards.length && !defence.length) continue;
        continue;
      }
      // Without the puck: one or two pressure players, the rest in structure.
      const style = this.orders[s].get(this.actualLine[s])?.order ?? tactics.forecheck;
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
            ? owner
              ? at(owner.x + owner.vx * .19, owner.z + owner.vz * .19)
              : this.retrievalSpot(b, intercept)
            : at(puck.x - d * 2.5, puck.z * 0.6 + (puck.z >= 0 ? -2.5 : 2.5)),
        ),
      );
      // A loose puck draws a second skater in support a few metres back.
      if (!owner && byDistance[1]) spots.set(byDistance[1].id, at(puck.x - d * 4, puck.z * 0.6));
      const receiver = skaters.find(b => b.id === this.flight?.target);
      if (receiver) spots.set(receiver.id, this.retrievalSpot(receiver, intercept));
      if(!owner && this.flight?.kind==="loose" && this.skatingTime<=this.reboundUntil && byDistance[1]) {
        const second=byDistance[1];
        spots.set(second.id, dzone ? at(-d*23,puck.z*.45) : at(d*23,-side(puck.z)*2.1));
      }
      const rest = skaters.filter((b) => !spots.has(b.id));
      const forwards = rest.filter((b) => !isD(b));
      const defence = rest.filter(isD);
      const net = { x: -d * 25, z: 0 };
      if (dzone) {
        const target = tactics.markPlayer && this.frame.bodies.find(o=>o.side!==s && o.id===tactics.markPlayer);
        const assigned = target && Math.hypot(target.x-net.x,target.z)<15 ? target : undefined;
        const marker = assigned && defence.reduce<SkaterBody|undefined>((best,b)=>
          !best || Math.hypot(b.x-assigned.x,b.z-assigned.z)<Math.hypot(best.x-assigned.x,best.z-assigned.z) ? b : best,undefined);
        defence.forEach((b, i) => {
          if (assigned) {
            if(b===marker) spots.set(b.id,at(assigned.x+(net.x-assigned.x)*.24,assigned.z*.76));
            else spots.set(b.id,at(net.x+d*1.8,-side(puck.z)*1.65));
            return;
          }
          const threat = this.frame.bodies.filter(o => o.side !== s && !o.goalie && o !== owner &&
            (i % 2 ? o.z >= 0 : o.z < 0)).sort((a,b) => Math.hypot(a.x-net.x,a.z)-Math.hypot(b.x-net.x,b.z))[0];
          const mark = threat && Math.hypot(threat.x-net.x, threat.z)<11 ? threat : puck;
          const farPost = Math.abs(puck.z)>7 && mark!==puck && puck.z*mark.z<0;
          const laneFraction = farPost ? .32 : .53;
          spots.set(b.id, at(net.x+(mark.x-net.x)*laneFraction, mark.z*laneFraction+(i % 2 ? .95 : -.95)));
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
      // On a regroup the puck carrier curls at the line until teammates
      // clear the zone. A late read at speed can still result in offside.
      if (adv > RINK.blueLine - 4 && this.frame.bodies.some(b => b.side === owner.side &&
          b !== owner && !b.goalie && b.x*d > RINK.blueLine + .32)) {
        return at(d * (RINK.blueLine - 2.1), clamp(z + (z > 0 ? -3 : 3), -10, 10));
      }
      // Breakout and neutral zone: carry with speed, step around a defender.
      const dodge = blocker ? (blocker.side >= 0 ? -1 : 1) * 4.5 : 0;
      const laneZ = Math.abs(z) < 2 ? wall * lane * 0.7 : z * 0.95;
      return at(owner.x + d * 9, laneZ + dodge);
    }
    if (isD && adv < RINK.dotX - 3) {
      // Defenceman with the puck at the point: walk the line for a lane.
      return at(d * 16.5, Math.sin(this.skatingTime * 0.55 + owner.x) * 6);
    }
    if (adv > 24) return at(d * 21.5, z * .52);
    if (!blocker) return at(d * 22.4, z * .38);
    if (Math.abs(z) > 6 && blocker.ahead < 3.5)
      return at(d * 25.8, wall * 6.8);
    return at(owner.x + d * 4, z + (blocker.side >= 0 ? -4.2 : 4.2));
  }
  /** Goalie depth and angle: square to the puck, deeper when it is close. */
  private goalieSpot(b: SkaterBody, puck: { x: number; z: number }): Dot {
    const dir = this.direction(b.side);
    const netX = -dir * RINK.goalLine;
    const toPuckX = puck.x - netX;
    // Read a pass moving across the slot, then set the feet for the shot.
    const pass=this.flight?.kind==="pass" && this.flight.side!==b.side ? this.flight : undefined;
    const lead=pass && Math.abs(toPuckX)<13 ? Math.min(.16,Math.max(0,pass.remaining)) : 0;
    const toPuckZ = puck.z+(pass?.vz??0)*lead;
    const distance = Math.hypot(toPuckX, toPuckZ);
    // Puck behind the goal line: hug the post on that side.
    if (toPuckX * dir < 0.3) return { x: netX + dir * 0.72, z: clamp(puck.z, -0.85, 0.85) };
    const carrier=this.frame.bodies.find(o=>o.id===this.owner);
    const threat=carrier && carrier.side!==b.side && toPuckX*dir>0;
    // Challenge a central rush, then retreat as the carrier enters the crease.
    const centrality=1-clamp(Math.abs(toPuckZ)/8,0,1);
    const challenge=threat ? centrality*clamp((distance-2.5)/4,0,1)*clamp((18-distance)/6,0,1) : 0;
    const out = .55 + .70*clamp((distance-4)/15,0,1) + .65*challenge;
    return {
      x: netX + dir * Math.max(.72, toPuckX*dir / Math.max(1, distance) * out + .35),
      z: clamp((toPuckZ / Math.max(1, distance)) * out * 1.6, -1.1, 1.1),
    };
  }
  /** Hockey skating: momentum, limited acceleration and hard stops. */
  private skate(b: SkaterBody, tx: number, tz: number, top: number, dt: number) {
    if (!b.goalie) ({ x: tx, z: tz } = skaterNetRoute(b, { x: tx, z: tz }));
    const dx = tx - b.x,
      dz = tz - b.z,
      distance = Math.hypot(dx, dz);
    // Ease into the spot instead of overshooting it.
    const speed = distance > 0.15 ? Math.min(top, Math.sqrt(2 * 6.8 * distance), distance * 2.8) : 0;
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
    const intended = { x: b.x + b.vx * dt, z: b.z + b.vz * dt };
    const net = clearSkaterNet(b, intended);
    if (net !== intended) {
      b.vx = (net.x-b.x)/dt;
      b.vz = (net.z-b.z)/dt;
    }
    const { x: nextX, z: nextZ } = net;
    const inside = insideRink(nextX, nextZ, .68);
    b.x = inside.x;
    b.z = inside.z;
    const penetration = Math.hypot(nextX-b.x, nextZ-b.z);
    if (penetration > 0) {
      const nx = (nextX-b.x) / penetration, nz = (nextZ-b.z) / penetration;
      const intoBoards = Math.max(0, b.vx*nx + b.vz*nz);
      b.vx -= intoBoards*nx;
      b.vz -= intoBoards*nz;
    }
  }
  private blade(b: SkaterBody): Dot {
    const speed=Math.hypot(b.vx,b.vz);
    const fx=speed>.45 ? b.vx/speed : this.direction(b.side), fz=speed>.45 ? b.vz/speed : 0;
    const lateral=-stickSide(b.id)*(.63+.065*Math.sin(this.skatingTime*6+hash(b.id)*6));
    return {x:b.x+fx*.43-fz*lateral, z:b.z+fz*.43+fx*lateral};
  }
  private retrievalSpot(b: SkaterBody, puck: Dot): Dot {
    const blade = this.blade(b);
    return insideRink(puck.x - (blade.x - b.x), puck.z - (blade.z - b.z), .68);
  }

  private takePuck(b: SkaterBody, passer?: string, contact: Dot = this.frame.puck) {
    if(passer && this.flight?.side===b.side && this.flight.fromDefensiveZone &&
        contact.x*this.direction(b.side)>-RINK.blueLine && this.shift[1-b.side]) this.shift[1-b.side]!.exitsAgainst++;
    if (this.lastPossession === 1-b.side && b.x*this.direction(b.side)>RINK.blueLine && this.shift[b.side])
      this.shift[b.side]!.recoveries++;
    this.lastPossession=b.side;
    this.pickup = { point: { x: contact.x, z: contact.z }, since: this.skatingTime };
    this.pendingPass = undefined;
    this.flight = undefined;
    this.owner = b.id;
    this.decision = this.skatingTime + (passer ? .25 : .42);
    this.nextChallenge = this.skatingTime + .28;
    const previous = this.touches.at(-1);
    if (previous && !this.teams[b.side].players.some(p => p.id === previous)) this.touches = [];
    if (this.touches.at(-1) !== b.id) this.touches.push(b.id);
    Object.assign(this.frame.puck, this.pickup.point, { y: PUCK_ICE_Y });
    if (passer) this.cue("receive", b.id, passer, this.pickup.point);
  }

  private canRecover(b: SkaterBody) {
    const pin=this.boardContact;
    if (pin && this.skatingTime < pin.until && (b.id===pin.hitter || b.id===pin.carrier)) return false;
    return this.lastRelease?.id !== b.id || this.skatingTime >= this.lastRelease.until;
  }

  private releasePuck(b: SkaterBody) {
    this.owner = "";
    this.pickup = undefined;
    this.pendingPass = undefined;
    this.lastRelease = { id: b.id, until: this.skatingTime + .36 };
  }
  private faceoff(dot: Dot = CENTER_DOT) {
    this.boardContact=undefined;
    this.reboundUntil=-1;
    this.flight = undefined;
    this.pickup = undefined;
    this.pendingPass = undefined;
    this.lastRelease = undefined;
    this.nextChallenge = this.skatingTime + .55;
    this.owner = "";
    this.touches = [];
    this.frame.delayedOffside = undefined;
    this.frame.passTarget=undefined;
    this.looseAnchor = undefined;
    this.frame.dot = { ...dot };
    this.frame.puck = { x: dot.x, y: 0.12, z: dot.z };
    const spots = this.formation(dot);
    this.frame.bodies.forEach((b) => {
      const spot = spots.get(b.id)!;
      b.x = spot.x;
      b.z = spot.z;
      b.vx = b.vz = 0;
    });
    const drawRating=(side:number)=>{
      const centre=this.player(this.drawTaker(side)!.id);
      return (centre.attributes.faceoffs??70)-centre.fatigue*.10;
    };
    const odds=clamp(.5+(drawRating(0)-drawRating(1))*.007,.30,.70);
    const side = this.rng.next() < odds ? 0 : 1;
    this.lastPossession=side;
    const center = this.drawTaker(side)!;
    const opponent = this.drawTaker(1 - side);
    this.owner = center.id;
    this.frame.carrierId = center.id;
    center.x = dot.x - this.direction(side)*.53;
    center.z = dot.z;
    if (opponent) opponent.x = dot.x + this.direction(side) * .53;
    this.emit("faceoff", center, "Вбрасывание");
    this.cue("faceoff", center.id, opponent?.id, { x: dot.x, z: dot.z });
    // Sweep a clean win towards a free teammate on the defensive side
    // of the dot. The normal puck flight can still be intercepted.
    const dir=this.direction(side);
    const rivals=this.frame.bodies.filter(b=>b.side!==side && !b.goalie && b!==opponent);
    const support=this.frame.bodies.filter(b=>b.side===side && !b.goalie && b!==center &&
      (b.x-dot.x)*dir<-.7).map(b=>{
        const aim=this.blade(b);
        const space=Math.min(6,...rivals.map(r=>closestOnPath(dot,aim,r).gap));
        const length=Math.hypot(aim.x-dot.x,aim.z-dot.z);
        return {b,aim,space,value:space-length*.15,length};
      }).sort((a,b)=>b.value-a.value)[0];
    const edge=side===0 ? odds : 1-odds;
    if(support && support.space>1.25 && this.rng.next()<.38+.5*edge){
      this.decision=this.skatingTime+.16;
      this.pendingPass={passer:center.id,target:support.b.id,aim:support.aim,
        at:this.decision,speed:clamp(3.5+support.length*.45,4,7.8)};
    } else {
      // Tied sticks kick the puck sideways; the first reachable blade wins it.
      this.releasePuck(center);
      this.frame.carrierId=undefined;
      this.frame.puck={x:dot.x,y:PUCK_ICE_Y,z:dot.z};
      this.flight={vx:-dir*(.6+this.rng.next()),vz:(this.rng.next()<.5?-1:1)*(2+this.rng.next()*2),
        remaining:.8,shooter:center.id,side,shot:false,kind:"loose"};
      this.decision=this.skatingTime+.45;
    }
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
    this.indexLines(this.teams.indexOf(own),own);
    this.rolling[this.teams.indexOf(own)] = undefined;
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
    finish = false,
  ) {
    this.frame.delayedOffside = undefined;
    this.frame.passTarget=undefined;
    if (!this.presentation) {
      if (finish) return this.finish();
      this.changeAtWhistle(kind, side, dot);
      this.faceoff(dot);
      return;
    }
    this.recordPlay();
    const replay=this.replayFrames?.slice();
    if(this.replayFrames)this.replayFrames.length=0;
    this.flight = undefined;
    this.owner = "";
    this.frame.carrierId = undefined;
    this.finishAfterWhistle = finish;
    const phase = kind === "goal" ? "celebrate" : "whistle";
    this.frame.stoppage = {
      kind,
      phase, replay,
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
    separateSkaters(this.frame.bodies);
    if (s.t < s.length - 1e-6) return;
    if (s.phase === "review") {
      Object.assign(s, s.review === "confirmed"
        ? {phase:"celebrate", t:0, length:STOPPAGE_LENGTH.celebrate}
        : {phase:"whistle", t:0, length:2.2});
      return;
    }
    if (s.phase === "celebrate" || s.phase === "whistle") {
      if (this.finishAfterWhistle) {
        this.frame.stoppage = undefined;
        this.finishAfterWhistle = false;
        this.finish();
        return;
      }
      this.changeAtWhistle(s.kind, s.side,s.dot);
      this.frame.puck = { x: s.dot.x, y: 1.15, z: s.dot.z };
      const spots=this.formation(s.dot);
      let length:number=STOPPAGE_LENGTH.lineup;
      for(const b of this.frame.bodies){
        const target=spots.get(b.id);
        if(target) length=Math.max(length,Math.hypot(target.x-b.x,target.z-b.z)/6.5+1.4);
      }
      Object.assign(s,{phase:"lineup",t:0,length});
    } else if (s.phase === "lineup") {
      Object.assign(s, { phase: "drop", t: 0, length: STOPPAGE_LENGTH.drop });
    } else {
      this.frame.stoppage = undefined;
      this.finishAfterWhistle = false;
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
    const finish = this.finishAfterWhistle;
    this.frame.stoppage = undefined;
    this.finishAfterWhistle = false;
    if (finish) return this.finish();
    this.changeAtWhistle(s.kind, s.side,s.dot);
    this.faceoff(s.dot);
  }
  /** Moves bodies toward presentation targets (no randomness, no statistics). */
  private glide(b: SkaterBody, tx: number, tz: number, maxSpeed: number, dt: number) {
    if (!b.goalie) ({ x: tx, z: tz } = skaterNetRoute(b, { x: tx, z: tz }));
    const dx = tx - b.x,
      dz = tz - b.z,
      distance = Math.hypot(dx, dz);
    const speed = Math.min(maxSpeed, distance * 1.6);
    const k = Math.min(1, dt * 3.2);
    b.vx += ((distance > 0.05 ? (dx / distance) * speed : 0) - b.vx) * k;
    b.vz += ((distance > 0.05 ? (dz / distance) * speed : 0) - b.vz) * k;
    const safe = clearSkaterNet(b, { x: b.x + b.vx*dt, z: b.z+b.vz*dt });
    Object.assign(b, insideRink(safe.x, safe.z, .68));
  }
  private choreograph(s: SpatialStoppage, dt: number) {
    const bodies = this.frame.bodies;
    if (s.phase === "lineup" || s.phase === "drop") {
      const spots = this.formation(s.dot);
      bodies.forEach((b) => {
        const spot = spots.get(b.id);
        if(!spot) return;
        if(Math.hypot(b.x-spot.x,b.z-spot.z)<.055){
          b.x=spot.x;b.z=spot.z;b.vx=b.vz=0;
        } else this.glide(b,spot.x,spot.z,s.phase==="drop" ? 1.5 : 6.5,dt);
      });
      return;
    }
    if (s.kind === "goal" && s.phase !== "review") {
      const scorer = bodies.find((b) => b.id === s.actor);
      const dir = this.direction(s.side);
      const t = s.t;
      if (scorer) {
        const wall = s.variant < 1/3 ? 1 : -1;
        const benchX = BENCH.centerX[s.side];
        const lane = -dir;
        if (t < 2.2) this.glide(scorer, dir * 18.5, wall * 9.6, 7.5, dt);
        else if (t < 4.4 || wall > 0) this.glide(scorer, scorer.x, scorer.z, 1, dt);
        else
          this.glide(
            scorer,
            scorer.z > -RINK.boardsZ+1.1 ? benchX-lane*BENCH.halfLength : benchX+lane*(BENCH.halfLength+1),
            -RINK.boardsZ + .52,
            5.5,
            dt,
          );
        const mates = bodies.filter(
          (b) => b.side === s.side && !b.goalie && b.id !== scorer.id,
        );
        // Reserve an arrival lane from the approach side once per goal.
        // Players on opposite sides of the scorer then keep their lanes.
        const order=s.gatheringOrder ??= [...mates].sort((a,b)=>
          Math.atan2(a.z-scorer.z,a.x-scorer.x)-Math.atan2(b.z-scorer.z,b.x-scorer.x)).map(b=>b.id);
        mates.forEach((b) => {
          const i=Math.max(0,order.indexOf(b.id));
          const angle = ((i+.5) / Math.max(1, mates.length)) * Math.PI * 2 - Math.PI;
          if (t < 2.2) {
            const r = 2.4;
            this.glide(b, scorer.x + Math.cos(angle) * r, scorer.z + Math.sin(angle) * r, 7.5, dt);
          } else if (t < 4.4 || wall > 0) {
            const r = 0.95;
            this.glide(b, scorer.x + Math.cos(angle) * r, scorer.z + Math.sin(angle) * r, 4, dt);
          } else {
            // Follow the scorer down the bench for the fist-bump line.
            const behind = 1.5 * (i + 1);
            this.glide(b, scorer.x - lane * behind, -RINK.boardsZ + .55 + (i % 2) * .42, 5.5, dt);
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
      else if (s.kind==="penalty" && !b.goalie && Math.abs(b.x)<4.6 && Math.abs(b.z)<6){
        const lane=b.x===0 ? this.direction(b.side) : Math.sign(b.x);
        this.glide(b, lane*5.2,b.z,3.5,dt);
      }
      else if (b.goalie) this.glide(b, b.x, b.z, 0.5, dt);
      else this.glide(b, b.x + b.vx * 0.25, b.z + b.vz * 0.25, Math.hypot(b.vx, b.vz) * 0.85, dt);
    });
  }
  private reviewFrame(): CoachingFrame {
    const f=this.frame;
    const stop=f.stoppage;
    const stoppage=stop ? {...stop,replay:undefined,dot:{...stop.dot}} : undefined;
    return {tick:f.tick,score:[...this.result.goals],dot:{...f.dot},stoppage,penaltyBox:[...f.penaltyBox],bodies:f.bodies.map(b=>({...b})),puck:{...f.puck},carrierId:this.owner || undefined,
      passTarget:f.passTarget,cues:f.cues.filter(c=>c.time>this.time-.2*this.clockRate-.001),at:this.time,save:false};
  }
  private scoutFrame(): ScoutFrame {
    const point=(b:Dot)=>[Math.round(b.x*10)/10, Math.round(b.z*10)/10];
    const unit=(side:number)=>this.frame.bodies.filter(b=>b.side===side)
      .map(b=>[...point(b),this.player(b.id).number]);
    return {puck:point(this.frame.puck),home:unit(0),away:unit(1)};
  }
  private recordPlay(){
    if(!this.replayFrames)return;
    const f=this.frame,cues=f.cues.filter(c=>c.seq>this.recordedCue);
    this.replayFrames.push({bodies:f.bodies.map(b=>({...b})),puck:{...f.puck},carrierId:f.carrierId,passTarget:f.passTarget,cues,at:this.time,save:cues.some(c=>c.kind==="save")});
    this.recordedCue=f.cues.at(-1)?.seq??this.recordedCue;
    if(this.replayFrames.length>35)this.replayFrames.shift();
  }
  step() {
    if (this.done || this.intermission) return;
    this.frame.tick++;
    if (this.replayFrames && this.frame.tick%2===0) {
      this.leadIn.push(this.reviewFrame());
      if(this.leadIn.length>51)this.leadIn.shift();
    }
    if (this.frame.stoppage) {
      this.stepStoppage(0.1);
      return;
    }
    this.recordPlay();
    const dt = 0.1;
    const clockStep = dt * this.clockRate;
    this.time = Math.round((this.time + clockStep) * 10) / 10;
    this.result.duration = this.time;
    this.trackShift(clockStep);
    if(this.clockRate===2 && Math.floor(this.skatingTime)!==this.scoutSeconds) {
      this.scoutSeconds=Math.floor(this.skatingTime);
      this.scoutFrames.push(this.scoutFrame());
      if(this.scoutFrames.length>7)this.scoutFrames.shift();
    }
    const expired = this.penalties.filter((p) => p.until <= this.time);
    this.penalties = this.penalties.filter((p) => p.until > this.time);
    if (expired.length || this.pullGoalie.some((pulled, side) => pulled !== this.goalieWasPulled[side])) {
      this.adjustManpower(expired);
      this.syncPenaltyBox();
    }
    const puck = this.frame.puck;
    // A goalie can cover a puck pinned at the post, including a failed
    // possession attempt where the carrier and the net block each other.
    if(Math.abs(Math.abs(puck.x)-RINK.goalLine)<3 && Math.abs(puck.z)<3 && puck.y<.25){
      // Moving the blade from side to side at the post is not an escape.
      // Track continuous possession separately from the loose puck location.
      if (!this.owner) this.creasePossession = undefined;
      else if (this.creasePossession?.owner !== this.owner)
        this.creasePossession = {owner: this.owner, since: this.skatingTime};
      if(!this.netBattle || Math.hypot(puck.x-this.netBattle.x,puck.z-this.netBattle.z)>1)
        this.netBattle={x:puck.x,z:puck.z,since:this.skatingTime};
      if(this.skatingTime-this.netBattle.since>6 ||
        (this.creasePossession && this.skatingTime-this.creasePossession.since>45)){
        const goalie=this.frame.bodies.find(b=>b.goalie && Math.abs(b.x-puck.x)<5);
        if(goalie && this.time!==1200 && this.time!==2400 && this.time!==3600 && (this.playoffs || this.time<3900)){
          this.netBattle=undefined;
          this.cue("whistle",goalie.id);
          this.stopPlay("save",goalie.side,goalie.id,this.zoneDot(goalie.side));
          return;
        }
      }
    } else {
      this.netBattle=undefined;
      this.creasePossession=undefined;
    }
    const owner = this.frame.bodies.find((b) => b.id === this.owner);
    // Assign an actual puck retriever per side. Formation offsets previously
    // left every player outside pickup range around a stationary loose puck.
    const spots = this.positions(owner, puck);
    this.lineChangeRoutes(spots, owner);
    const evenStrength = !this.penalties.length && !this.pullGoalie[0] && !this.pullGoalie[1] && (this.time < 3600 || this.playoffs);
    const previousX = puck.x, previousZ = puck.z, previousY=puck.y;
    const previousSkaters = this.frame.bodies.map(b => ({x: b.x, z: b.z}));
    const previousBlades = this.frame.bodies.map(b => this.blade(b));
    for (const b of this.frame.bodies) {
      if (b.goalie || b === owner) continue;
      const d = this.direction(b.side), target = spots.get(b.id)!;
      if (this.frame.delayedOffside === b.side) target.x = d * Math.min(target.x * d, RINK.blueLine - 1.2);
      else if (owner?.side === b.side && puck.x * d < RINK.blueLine)
        target.x = d * Math.min(target.x * d, RINK.blueLine - .45);
    }
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
      p.stats.toi += clockStep / 60;
      const minutes=this.result.iceMinutes ??= {};
      minutes[b.id]=(minutes[b.id]??0)+clockStep/60;
      if (evenStrength && !b.goalie) this.evenSeconds.set(b.id, (this.evenSeconds.get(b.id) ?? 0) + clockStep);
      if (!b.goalie) p.fatigue = clamp(p.fatigue + clockStep * 0.005, 0, 100);
    });
    // Inspect the collision before the separation solver moves the bodies apart.
    if (this.flight?.shot && this.flight.creaseReview !== "interference") {
      const shot = this.flight;
      const goalie = this.frame.bodies.find(b => b.goalie && b.side !== shot.side);
      if (goalie && Math.abs(goalie.z) < 2 && Math.abs(goalie.x) > RINK.goalLine-3) {
        for (const attacker of this.frame.bodies) {
          if (attacker.side !== shot.side || attacker.goalie) continue;
          const dx=goalie.x-attacker.x, dz=goalie.z-attacker.z, gap=Math.hypot(dx,dz);
          if (gap>1.9) continue;
          const forced=this.frame.bodies.some(d=>d.side===goalie.side && !d.goalie &&
            Math.hypot(d.x-attacker.x,d.z-attacker.z)<.92 && (d.vx*dx+d.vz*dz)>.45);
          const intoGoalie=(attacker.vx-goalie.vx)*dx+(attacker.vz-goalie.vz)*dz;
          shot.creaseReview=gap<1.01 && intoGoalie>.35 && !forced ? "interference" : "confirmed";
          if (shot.creaseReview==="interference") break;
        }
      }
    }
    separateSkaters(this.frame.bodies, previousSkaters);
    this.frame.bodies.forEach((b, index) => {
      const safe = clearSkaterNet(previousSkaters[index], b);
      if (safe !== b) Object.assign(b, safe);
    });
    if (owner) {
      // The puck rides on the blade, a stick length ahead of the carrier.
      const blade = this.blade(owner);
      Object.assign(puck, blade, { y: PUCK_ICE_Y });
      if (this.pickup) {
        const blend = clamp((this.skatingTime-this.pickup.since)/.3, 0, 1);
        puck.x = this.pickup.point.x + (blade.x-this.pickup.point.x)*blend;
        puck.z = this.pickup.point.z + (blade.z-this.pickup.point.z)*blend;
        if (blend >= 1) this.pickup = undefined;
      }
      bounceAtBoards(puck, { vx: 0, vz: 0 });
      this.checkEntry(previousX, owner.side, owner.id, previousSkaters);
    }
    if (this.flight) {
      const f = this.flight;
      stepPuck(puck, f, dt);
      const start={x:previousX,z:previousZ};
      if (f.shot) {
        const blockers = this.frame.bodies.map((body, i) => ({
          body, ...bladeContact(start, puck, previousSkaters[i], body),
        })).filter(({ body, gap, t }) =>
          body.side !== f.side && !body.goalie && gap < .46 &&
          previousY + (puck.y - previousY) * t < .62,
        ).sort((a, b) => a.t - b.t);
        for (const { body, t } of blockers) {
          if (this.rng.next() >= .5 * ((this.player(body.id).attributes.blocking ?? 70) / 75)) continue;
          puck.x = previousX + (puck.x - previousX) * t;
          puck.z = previousZ + (puck.z - previousZ) * t;
          puck.y = previousY + (puck.y - previousY) * t;
          f.vx *= -.21;
          f.vz = f.vz * .28 + body.vz * .45 + (this.rng.next() - .5) * 4;
          f.vy = .8;
          f.shot = false;
          f.kind = "loose";
          this.cue("block", body.id, f.shooter);
          break;
        }
      }
      const bar=f.shot ? crossbarContact({...start,y:previousY},puck,this.direction(f.side)) : undefined;
      let hit=netContact(start,puck);
      if(hit && previousY+(puck.y-previousY)*hit.t>GOAL_HEIGHT+POST_RADIUS+.013)hit=undefined;
      const goalX=this.direction(f.side)*(RINK.goalLine+PUCK_RADIUS);
      const crossing=(goalX-previousX)/(puck.x-previousX);
      const goalZ=previousZ+(puck.z-previousZ)*crossing;
      const enters=f.shot && previousY+(puck.y-previousY)*crossing<GOAL_HEIGHT-POST_RADIUS-.0127 && crossing>=0 && crossing<=1 && Math.abs(goalZ)<GOAL_HALF_WIDTH-POST_RADIUS-PUCK_RADIUS;
      if(bar && (!hit || bar.t<hit.t)){
        puck.x=previousX+(puck.x-previousX)*bar.t+bar.nx*.002;
        puck.z=previousZ+(puck.z-previousZ)*bar.t;
        puck.y=previousY+(puck.y-previousY)*bar.t+bar.ny*.002;
        const vy=(puck.y-previousY)/dt;
        const normalSpeed = f.vx*bar.nx+vy*bar.ny;
        f.vx=(f.vx-2*normalSpeed*bar.nx)*.58;
        f.vy=(vy-2*normalSpeed*bar.ny)*.58;
        f.vz*=.7;f.shot=false;f.kind="loose";f.remaining=1.4;
      } else if(hit && (!enters || hit.t<crossing)) {
        puck.x=previousX+(puck.x-previousX)*hit.t+.001*hit.nx;
        puck.z=previousZ+(puck.z-previousZ)*hit.t+.001*hit.nz;
        const dot=f.vx*hit.nx+f.vz*hit.nz;
        f.vx=(f.vx-2*dot*hit.nx)*.55; f.vz=(f.vz-2*dot*hit.nz)*.55;
        f.shot=false; f.kind="loose"; f.remaining=1.5;
      } else if(enters) {
        puck.x=goalX;
        puck.z=goalZ;
        puck.y=previousY+(puck.y-previousY)*crossing;
      }
      this.checkEntry(previousX, f.side, undefined, previousSkaters);
      f.remaining -= dt;
      const shooter = this.frame.bodies.find((b) => b.id === f.shooter);
      if (f.shot && shooter && this.frame.delayedOffside === f.side && Math.abs(puck.x) >= RINK.goalLine+PUCK_RADIUS) {
        this.whistleOffside(shooter);
      } else if (f.shot && shooter && Math.abs(puck.x) >= RINK.goalLine+PUCK_RADIUS) {
        const goalie = this.frame.bodies.find(
          (b) => b.side !== f.side && b.goalie,
        );
        const onTarget = enters;
        if (onTarget) {
          this.result.shots[f.side]++;
          this.player(f.shooter).stats.sog++;
          if (goalie) this.player(goalie.id).stats.sa++;
          const distance = f.distance ?? 12;
          // Close shots and second chances beat goalies; point shots rarely do.
          const range = clamp(1.4 - distance / 20, 0.55, 1.3);
          const second = this.skatingTime <= this.reboundUntil ? 0.06 : 0;
          const screen = f.screened ? .035 : 0;
          const skaters = this.counts();
          const powerPlay = skaters[f.side] > skaters[1 - f.side];
          const quality = clamp(
            (.094 +
              (this.player(f.shooter).attributes.accuracy - 70) * 0.001 +
              (goalie
                ? Math.abs(goalie.z - puck.z) * 0.025 +
                  (75 - this.player(goalie.id).attributes.reflexes) * 0.001
                : 0.9)) *
              range +
              second +
              screen + (powerPlay && this.clockRate === 2 ? .07 : 0),
            0.02,
            0.99,
          );
          this.result.xg[f.side] += quality;
          const where = {
            x: puck.x,
            z: puck.z,
            height: f.height ?? .18,
          };
          if (this.rng.next() < quality) {
            if (f.creaseReview==="interference" && goalie) {
              this.emit("shot", shooter, "Гол отменён после видеопросмотра: помеха вратарю", quality);
              this.stopPlay("save", goalie.side, goalie.id, {x:Math.sign(puck.x)*(RINK.blueLine-1.5),z:Math.sign(puck.z || 1)*7});
              const stop=this.frame.stoppage;
              if (stop) Object.assign(stop,{phase:"review", review:"interference", length:7.5});
            } else {
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
              this.result.events.at(-1)!.assists=assists.map(id=>this.player(id).name);
              // The puck rests in the back of the net during the celebration.
              this.frame.puck = {
                x: Math.sign(puck.x) * 27.1,
                y: 0.12,
                z: clamp(puck.z, -0.75, 0.75),
              };
              const ends = this.time > 3600;
              this.stopPlay("goal", f.side, shooter.id, CENTER_DOT, ends);
              if (f.creaseReview && this.frame.stoppage)
                Object.assign(this.frame.stoppage,{phase:"review",review:"confirmed",length:7.5});
              if (ends) return;
            }
          } else {


            const control = goalie ? this.player(goalie.id).attributes.reboundControl ?? 70 : 70;
            const rebound =
              !!goalie &&
              this.rng.next() < clamp(.28 + (f.screened ? .19 : 0) + (f.height ?? .5)*.06 - (control-70)*.006,.08,.62);
            if (goalie && !rebound) this.cue("save", goalie.id, shooter.id, {...where, screened:f.screened,saveOutcome:"held"});
            this.emit("shot", shooter, (f.screened ? "Бросок через трафик" : "Бросок") +
              (rebound ? " — отскок" : " — фиксация"), quality);
            if (goalie && rebound) {
              // The puck spills back into the slot and play goes on.
              const angle = f.screened ? (this.rng.next()-.5)*1.4 :
                Math.sign(puck.z || goalie.z || 1)*(.65+this.rng.next()*.6);
              const speed = 5 + this.rng.next() * 5;
              const out = -Math.sign(goalie.x);
              this.cue("save",goalie.id,shooter.id,{...where,screened:f.screened,saveOutcome:"rebound",reboundDirection:{x:Math.cos(angle)*out,z:Math.sin(angle)}});
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
              this.reboundUntil = this.skatingTime + 2.5;
              this.touches = [];
            } else {
              // The goalie freezes the puck: restart in that end of the rink.
              if (goalie) this.frame.puck = { x: goalie.x, y: 0.12, z: goalie.z };
              const defending = 1 - f.side;
              this.stopPlay("save", defending, goalie?.id ?? shooter.id, this.zoneDot(defending));
            }
          }
        } else {
          // Missed the net: the puck rings around the end boards.
          f.shot = false;
          f.kind = "loose";
          f.remaining = 1.4;
        }
      } else if (!f.shot) {
        // Icing: cleared from behind the red line across the far goal line.
        if (
          f.icingSide !== undefined &&
          puck.x * this.direction(f.icingSide) >= RINK.goalLine
        ) {
          const offender = f.icingSide;
          this.flight = undefined;
          this.cue("whistle", f.shooter);
          this.stopPlay("icing", offender, f.shooter, this.zoneDot(offender));
        } else {
          // Reception and interception along the way.
          const near = this.frame.bodies
            .map((b, i) => ({ b, ...bladeContact(start, puck, previousBlades[i], this.blade(b)) }))
            .filter(({ b, gap, t }) => !b.goalie && this.canRecover(b) &&
              gap < (b.id === f.target ? .39 : .27) + PUCK_RADIUS &&
              previousY + (puck.y - previousY) * t < .21)
            .sort((a,z) => a.t-z.t || a.gap-z.gap);
          for (const { b, gap, t } of near) {
            const mate = b.side === f.side;
            const control = this.player(b.id).attributes.puckControl ?? 70;
            const pace = Math.hypot(f.vx-b.vx, f.vz-b.vz);
            const reception = clamp(.92 + (control - 70)*.006 - Math.max(0, pace-9)*.02 -
              gap*.29 + (b.id === f.target ? .12 : mate ? 0 : -.19), .22, .98);
            if (pace > 4 && this.rng.next() >= reception) {
              f.vx = f.vx * .46 + b.vx * .35;
              f.vz = f.vz * .46 + b.vz * .35;
              f.kind = "loose";
              f.target = undefined;
              f.icingSide = undefined;
              break;
            }
            this.takePuck(b, f.kind === "pass" ? f.shooter : undefined, {
              x: start.x+(puck.x-start.x)*t, z: start.z+(puck.z-start.z)*t,
            });
            if (!mate && f.kind === "pass") this.emit("turnover", b, "Перехват");
            break;
          }
          if (this.flight && Math.hypot(f.vx, f.vz) < .25 && puck.y <= PUCK_ICE_Y && !f.vy)
            this.flight = undefined;
        }
      }
      if (this.flight && f.shot && f.remaining <= 0) this.flight = undefined;
      if (this.flight === f) {
        if (bounceAtBoards(puck, f)) {
          f.kind = "loose";
          f.target = undefined;
        }
        if (f.kind === "pass" && f.remaining <= 0) {
          f.kind = "loose";
          f.target = undefined;
        }
      }
    }
    if (!this.owner && !this.flight && !this.frame.stoppage) {
      const nearest = this.frame.bodies
        .map((b, i) => ({ b, ...bladeContact(puck, puck, previousBlades[i], this.blade(b)) }))
        .filter(({ b, gap }) => !b.goalie && this.canRecover(b) && gap < .46)
        .sort((a,b) => a.gap-b.gap)[0];
      if (nearest) this.takePuck(nearest.b);
    }
    // The boards or the goal can keep a parked puck beyond the nominal
    // blade offset. Give nearby skaters a reach, then whistle a trapped puck.
    if (!this.owner && !this.frame.stoppage && Math.hypot(puck.x-previousX,puck.z-previousZ)<.09) {
      if (!this.looseAnchor || Math.hypot(puck.x-this.looseAnchor.x,puck.z-this.looseAnchor.z)>.35)
        this.looseAnchor = { x:puck.x, z:puck.z, since:this.skatingTime };
      const age = this.skatingTime-this.looseAnchor.since;
      if (age > 1.1 && puck.y < .2) {
        const reaching = this.frame.bodies.filter(b => !b.goalie && this.canRecover(b))
          .sort((a,b) => Math.hypot(a.x-puck.x,a.z-puck.z)-Math.hypot(b.x-puck.x,b.z-puck.z))[0];
        if (reaching && Math.hypot(reaching.x-puck.x,reaching.z-puck.z)<1.24)
          this.takePuck(reaching, undefined, puck);
        else if (reaching && age > 4) {
          const x = Math.abs(puck.x)>RINK.blueLine ? RINK.dotX : RINK.blueLine-1.5;
          this.cue("whistle", reaching.id);
          this.stopPlay("trapped", reaching.side, reaching.id, {x:Math.sign(puck.x)*x,z:Math.sign(puck.z || 1)*RINK.dotZ});
        }
      }
    } else this.looseAnchor = undefined;
    let carrier = this.frame.bodies.find((b) => b.id === this.owner);
    if (carrier && !this.frame.stoppage && carrier.side !== this.frame.delayedOffside) {
      this.challengeCarrier(carrier, previousSkaters, dt);
      carrier = this.frame.bodies.find((b) => b.id === this.owner);
    }
    if (this.frame.delayedOffside !== undefined) {
      const side = this.frame.delayedOffside, dir = this.direction(side);
      if (this.frame.puck.x * dir < RINK.blueLine - .15 - .038 || !this.frame.bodies.some(b => b.side === side && !b.goalie && b.x * dir > RINK.blueLine + .15 + .32))
        this.frame.delayedOffside = undefined;
    }
    if (carrier && carrier.side === this.frame.delayedOffside) this.whistleOffside(carrier);
    else if (carrier && this.frame.delayedOffside !== undefined && !this.frame.stoppage) {
      const forechecker = this.frame.bodies.find(b => b.side === this.frame.delayedOffside &&
        !b.goalie && Math.hypot(b.x-carrier.x, b.z-carrier.z) < 1.25);
      if (forechecker) this.whistleOffside(forechecker);
      else if (this.skatingTime >= this.decision) this.decide(carrier);
    } else if (carrier && this.skatingTime >= this.decision && !this.frame.stoppage) {
      this.decide(carrier);
    }
    this.frame.passTarget=this.flight?.kind==="pass"?this.flight.target:undefined;
    this.frame.carrierId = this.owner || undefined;
    if (this.time === 1200 || this.time === 2400) {
      this.flushStoppage();
      this.intermission = true;
      this.changeAtWhistle("save", -1);
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
  private challengeCarrier(owner: SkaterBody, previous: Dot[], dt: number) {
    const puck = this.frame.puck;
    const oldOwner = previous[this.frame.bodies.indexOf(owner)] ?? owner;
    const challenger = this.frame.bodies
      .map((b, index) => ({ b, before: previous[index] ?? b }))
      .filter(({ b }) => b.side !== owner.side && !b.goalie)
      .map(({ b, before }) => {
        const blade = this.blade(b);
        const dx = owner.x - b.x, dz = owner.z - b.z;
        const gap = Math.hypot(dx, dz);
        const closing = (Math.hypot(before.x-oldOwner.x, before.z-oldOwner.z) - gap) / dt;
        return { b, gap, closing, stickGap: Math.hypot(blade.x-puck.x, blade.z-puck.z) };
      })
      .filter(({ gap, stickGap }) => gap < 1.14 || stickGap < .48)
      .sort((a, b) => Math.min(a.gap - .65, a.stickGap) - Math.min(b.gap - .65, b.stickGap))[0];
    if (!challenger) return;
    const { b: pressure, gap, closing, stickGap } = challenger;
    const alongBoards = Math.abs(owner.z) > 10 || Math.abs(owner.x) > 27;
    if (alongBoards && gap < 1.1) {
      owner.vx *= 1 - .95 * dt;
      owner.vz *= 1 - .95 * dt;
    }
    if (this.skatingTime < this.nextChallenge) return;
    const rival = this.teams[pressure.side].tactics;
    const checking = this.player(pressure.id).attributes.checking ?? 70;
    const control = this.player(owner.id).attributes.puckControl ?? 70;
    const body = gap < 1.14 && (closing > 1.45 || alongBoards);
    if (!body && stickGap > .48) return;
    const chance = clamp(.21 + (checking - control)*.005 + (body ? closing*.085 : .15-stickGap*.2), .09, .64);
    this.nextChallenge = this.skatingTime + (body ? .7 : .5);
    if (this.rng.next() >= chance) return;
    if (
      body && this.rng.next() < 0.014 + rival.physical * 0.00035 &&
      this.penalties.filter((p) => p.side === pressure.side).length < 2
    ) {
      this.penalties.push({ id: pressure.id, side: pressure.side, until: this.time + 120 });
      this.syncPenaltyBox();
      this.player(pressure.id).stats.pim += 2;
      this.result.ppo[owner.side]++;
      this.cue("check", pressure.id, owner.id);
      const infraction=Math.hypot(pressure.vx-owner.vx,pressure.vz-owner.vz)>3.8 ? "roughing" : "holding";
      this.emit("penalty", pressure, infraction==="holding" ? "2 минуты за задержку соперника" : "2 минуты за грубость");
      this.cue("penalty", pressure.id, owner.id);
      this.stopPlay("penalty", pressure.side, pressure.id, this.zoneDot(pressure.side));
      if(this.frame.stoppage) this.frame.stoppage.infraction=infraction;
    } else if (body || stickGap > .22) {
      // Body check: the puck squirts loose and the battle goes on.
      const hardHit=body && closing>4.4 && Math.hypot(pressure.vx,pressure.vz)>3.8;
      this.cue("check", pressure.id, owner.id, { contact: hardHit ? "body" : body ? "pin" : "stick" });
      if (hardHit) this.emit("hit", pressure, alongBoards ? "Силовой приём у борта" : "Силовой приём");
      this.releasePuck(owner);
      this.flight = {
        vx: owner.vx*.5 + (pressure.vx-owner.vx)*.18 + (this.rng.next() - 0.5) * 3,
        vz: owner.vz*.5 + (pressure.vz-owner.vz)*.18 + (this.rng.next() - 0.5) * 3,
        vy: body ? .65 : 0,
        remaining: 0.9,
        shooter: owner.id,
        side: owner.side,
        shot: false,
        kind: "loose",
      };
      if (body && alongBoards) {
        this.boardContact={hitter:pressure.id,carrier:owner.id,until:this.skatingTime+.52};
        const sideWall=Math.abs(owner.z)/RINK.boardsZ > Math.abs(owner.x)/30;
        // A puck knocked out from between the skates slides along the kick plate.
        if (sideWall) {
          this.flight.vz=-Math.sign(owner.z)*.55;
          this.flight.vx=Math.sign(this.flight.vx || owner.vx || 1)*Math.max(2,Math.abs(this.flight.vx));
        } else {
          this.flight.vx=-Math.sign(owner.x)*.55;
          this.flight.vz=Math.sign(this.flight.vz || owner.vz || 1)*Math.max(2,Math.abs(this.flight.vz));
        }
        this.flight.vy=.12;
        for(const skater of [owner,pressure]) { skater.vx*=.48; skater.vz*=.48; }
      }
      this.player(owner.id).fatigue = clamp(this.player(owner.id).fatigue + 0.6, 0, 100);
    } else {
      this.takePuck(pressure);
      this.cue("check", pressure.id, owner.id, { contact: "stick" });
      this.emit("turnover", pressure, "Отбор шайбы");
    }
  }

  private decide(owner: SkaterBody) {
    if (this.pendingPass?.passer === owner.id) {
      const { at, target, aim, speed } = this.pendingPass;
      if (this.skatingTime < at) return;
      const dx = aim.x-this.frame.puck.x, dz = aim.z-this.frame.puck.z;
      const length = Math.max(.1, Math.hypot(dx, dz));
      this.flight = {
        vx: dx/length*speed, vz: dz/length*speed,
        remaining: length/speed+.65, shooter: owner.id, side: owner.side,
        shot: false, kind: "pass", target, fromDefensiveZone:this.frame.puck.x*this.direction(owner.side)<-RINK.blueLine,
      };
      this.releasePuck(owner);
      this.decision = this.skatingTime + .3;
      return;
    }
    const tactics = this.teams[owner.side].tactics;
    const decisions = this.player(owner.id).attributes.decisions ?? 70;
    const dir = this.direction(owner.side);
    const adv = owner.x * dir;
    const opponents = this.frame.bodies.filter((b) => b.side !== owner.side && !b.goalie);
    const gapTo = (b: SkaterBody) => Math.hypot(b.x - owner.x, b.z - owner.z);
    const pressure = Math.min(...opponents.map(gapTo), 12);
    this.decision = this.skatingTime + (pressure < 2 ? .51 : .82) + (100 - decisions) * .008;
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
    const rebound = this.skatingTime <= this.reboundUntil && distance < 9;
    const identity=this.style(owner.side,this.actualLine[owner.side]);
    const passing = this.player(owner.id).attributes.passing ?? 70;
    const risk = (tactics.passingRisk ?? 50) / 100;
    const origin = this.frame.puck;
    const attackZone = adv >= RINK.blueLine;
    const lanes = this.frame.bodies.filter(b => b.side === owner.side && !b.goalie && b !== owner)
      .map(mate => {
        const blade = this.blade(mate);
        const length = Math.hypot(blade.x-origin.x, blade.z-origin.z);
        const speed = clamp(7 + length*.29 + (passing-70)*.035, 8, 14.5);
        const lead = Math.min(1.15, .2+length/speed);
        const target = {
          x: clamp(blade.x + mate.vx*lead, -28.5, 28.5),
          z: clamp(blade.z + mate.vz*lead, -11.5, 11.5),
        };
        const laneGap = Math.min(5, ...opponents.map(b => {
          const { t } = closestOnPath(origin, target, b);
          return closestOnPath(origin, target, {
            x: b.x + b.vx*lead*t*.65, z: b.z + b.vz*lead*t*.65,
          }).gap;
        }));
        const arrival=length/speed;
        const space = Math.min(6, ...opponents.map(b => Math.hypot(
          b.x+b.vx*Math.min(.65,arrival)-target.x,b.z+b.vz*Math.min(.65,arrival)-target.z)));

        const progress = (target.x-owner.x)*dir;
        const slotGain = attackZone ? (Math.abs(owner.z)-Math.abs(target.z))*.4 : 0;
        const crossSlot=attackZone && owner.z*target.z<0 && Math.abs(target.z)<7;
        const preference=identity==="skill" && crossSlot ? 2.6 : identity==="cycle" && slotGain>0 ? 1.5 : 0;
        const plan=this.attackPlan(owner.side,this.actualLine[owner.side]);
        const opening=this.time < 300 ? tactics.benchOpening?.message : undefined;
        const route = plan==="wide" && Math.abs(target.z)>6 ? 2.4 : plan==="slot" && attackZone && Math.abs(target.z)<4 ? 2.8 : plan==="high" && progress<1 && space>3 ? 1.8 : 0;
        const talk = opening==="support" && length<9 ? 1.6 : opening==="safe" ? laneGap*.36 : opening==="attack" ? clamp(progress,-5,5)*.27 : 0;
        const value = route + talk + preference + laneGap*1.15 + space*.57 + progress*.33 + slotGain - length*.09;
        return { mate, target, speed, length, laneGap, value, progress };
      }).filter(({ target, length, laneGap }) => length > 1.8 && length < 24 &&
        laneGap > 1.12-risk*.62 && (attackZone || target.x*dir < RINK.blueLine-.1))
      .sort((a,b) => b.value-a.value);
    // A short return from below the hash marks can open the slot when
    // the carrier is squeezed against the glass.
    const cutback=attackZone && pressure<2.5 && Math.abs(owner.z)>7
      ? lanes.find(l=>l.progress>=-5 && l.progress< -1 && l.laneGap>1.7 &&
          l.target.x*dir>16 && Math.abs(l.target.z)<Math.abs(owner.z)-3)
      : undefined;
    const option = cutback ?? lanes.find(lane => lane.progress >= -1) ??
      (pressure < 1.65 ? lanes.find(lane => lane.progress > -7 && lane.laneGap > 2 &&
        (adv < -RINK.blueLine || (attackZone && lane.target.x*dir > RINK.blueLine+1))) : undefined);
    const goalLane = Math.min(3, ...opponents.map(b => {
      const hit = closestOnPath(origin, { x: netX, z: 0 }, b);
      return hit.t > .08 && hit.t < .96 ? hit.gap : 3;
    }));
    const angle = Math.max(0, (netX-owner.x)*dir) / Math.max(.1, distance);
    const shotRead = clamp((1-distance/28)*.58 + angle*.45 + goalLane*.12 -
      (pressure < 1.3 ? .16 : 0), .05, 1);
    // With a double-speed game clock there are half as many skating decisions
    // in a period. Take more available shooting lanes in that broadcast format.
    const compressed = this.clockRate === 2;
    const attemptRate = compressed ? (.20 + shooting * 1.05) * (own > them ? 1.35 : 1) : shooting * .68;
    const shot =
      adv > RINK.blueLine && angle > .3 &&
      (rebound ||
        (distance < (compressed ? 23 : 21) &&
          this.time >= this.nextShot[owner.side] &&
          (goalLane > (compressed ? .48 : .62) || !option || distance < 5) &&
          this.rng.next() < attemptRate * shotRead * this.clockRate));
    if (shot) {
      this.nextShot[owner.side] = rebound
        ? Math.max(this.nextShot[owner.side], this.time + 10)
        : this.time + (compressed ? 6 + this.rng.next() * 9 : 10 + this.rng.next() * 15);
      const sight = {x:netX,z:0};
      const screened=this.frame.bodies.some(b=>b!==owner && !b.goalie &&
        Math.abs(netX-b.x)<5.5 && closestOnPath(origin,sight,b).gap<.72);
      const tz = (this.rng.next() - 0.5) * 2.72;
      const dx = dir * (RINK.goalLine+PUCK_RADIUS) - this.frame.puck.x,
        dz = tz - this.frame.puck.z,
        length = Math.max(0.1, Math.hypot(dx, dz));
      const speed = rebound || distance < 6 ? 24 : distance > 15 ? 34 : 29;
      const travel = length / speed;
      const elevation = .05 + hash(owner.id + ":" + this.time) * .88;
      this.flight = {
        vx: dx / travel,
        vz: dz / travel,
        vy: elevation / travel + GRAVITY * travel * .5,
        remaining: travel + .25,
        shooter: owner.id,
        side: owner.side,
        screened, shot: true,
        height: elevation / GOAL_HEIGHT,
        distance,
      };
      this.cue("shot", owner.id, undefined, { screened, height:Math.abs(tz)<GOAL_HALF_WIDTH ? this.flight.height : undefined,z:tz,release: rebound || distance < 6 ? "snap" : distance > 15 ? "slap" : "wrist" });
      this.releasePuck(owner);
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
        vy: kind === "dump" ? 1.25 : 0,
        remaining: length / speed + (kind === "pass" ? 0.6 : 1.8),
        shooter: owner.id,
        side: owner.side,
        shot: false,
        kind,
        target,
        icingSide,
      };
      this.cue("pass", owner.id, target);
      this.releasePuck(owner);
    };
    const closedMiddle = opponents.some(b=>(b.x-owner.x)*dir>0 && (b.x-owner.x)*dir<7 && Math.abs(b.z)<4);
    if(identity==="cycle" && adv>0 && adv<RINK.blueLine && closedMiddle && pressure<4.4 && this.rng.next()<.55) {
      send(dir*28.2, Math.sign(owner.z || 1)*9.8,15.4,"dump");
      return;
    }
    if (option && option.value > (pressure < 2.15 ? 2.15 : 3.7) &&
        (pressure < 2.15 || this.rng.next() < .24 + risk*.29)) {
      const error = (this.rng.next()-.5) * clamp((105-passing)*.014, .08, .7);
      const travel = option.length / option.speed;
      const aim = { x: option.target.x, z: option.target.z+error };
      this.pendingPass = {
        passer: owner.id, target: option.mate.id, aim,
        speed: option.speed+ICE_DRAG*travel*.5, at: this.skatingTime+.2,
      };
      this.decision = this.pendingPass.at;
      this.cue("pass", owner.id, option.mate.id, aim);
      return;
    }
    // Blue line closed: chip it in deep and go get it.
    const wall = opponents.find((b) => {
      const ahead = (b.x - owner.x) * dir;
      return ahead > 0 && ahead < 5.5 && Math.abs(b.z - owner.z) < 4;
    });
    if (adv > -4 && adv < RINK.blueLine + 0.5 && wall && pressure < 4 && this.rng.next() < 0.42) {
      const corner = owner.z >= 0 ? -1 : 1;
      send(dir * 28.4, corner * 9.5, 15.4, "dump");
      return;
    }
    // Trapped in the own zone: get it out, even at the risk of icing.
    const swarm = opponents.filter((b) => gapTo(b) < 3.2).length;
    if (adv < -RINK.blueLine && swarm >= 1 && this.rng.next() < (swarm >= 2 ? 0.48 : 0.12)) {
      const shorthanded = own < them;
      const wallSide = owner.z >= 0 ? 1 : -1;
      if (shorthanded || this.rng.next() < 0.22) {
        // Desperation: fire it the length of the ice (icing unless shorthanded).
        send(dir * 29, (this.rng.next() - 0.5) * 16, 17, "clear", undefined, owner.x * dir < 0 && !shorthanded ? owner.side : undefined);
      } else {
        // Chip it off the boards and out to the neutral zone.
        send(dir * (1 + this.rng.next() * 9), wallSide * 11.5, 12.5, "clear");
      }
      return;
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

