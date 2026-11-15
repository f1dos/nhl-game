import { RNG, clamp } from "./random";
import type { Team, Player, Result, SpecialTeamsSituation } from "./types";
import { ensureSpecialTeams } from "./tactics";
import { snapshotStats, updateMatchPerformance } from "./performance";

export interface SkaterBody {
  id: string;
  side: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  goalie: boolean;
}
export interface SpatialFrame {
  carrierId?: string;
  bodies: SkaterBody[];
  puck: { x: number; y: number; z: number };
}
/** Fixed-step, seeded simulation. Rendering never advances the simulation. */
export class SpatialMatch {
  readonly teams: Team[];
  readonly result: Result;
  readonly rng: RNG;
  frame: SpatialFrame = { bodies: [], puck: { x: 0, y: 0.12, z: 0 } };
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
  };
  private penalties: { id: string; side: number; until: number }[] = [];
  private decision = 0;
  private nextShot = [0, 0];
  private shift = -1;
  private appeared = new Set<string>();
  private touches: string[] = [];
  private baseline;
  constructor(
    home: Team,
    away: Team,
    seed: number,
    readonly playoffs = false,
  ) {
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
      const planned = unit?.players ?? [
        ...team.lines[Math.floor(this.time / 40) % 4],
        ...team.defense[Math.floor(this.time / 40) % 3],
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
        this.frame.bodies.push(
          old.get(id) ?? {
            id,
            side,
            x: -this.direction(side) * (isGoalie ? 25 : 6 + slot),
            z: isGoalie ? 0 : ((slot % 3) - 1) * 5,
            vx: 0,
            vz: 0,
            goalie: isGoalie,
          },
        );
      });
    });
    if (!this.frame.bodies.some((b) => b.id === this.owner)) this.owner = "";
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
  private faceoff() {
    this.flight = undefined;
    this.owner = "";
    this.touches = [];
    this.frame.puck = { x: 0, y: 0.12, z: 0 };
    this.frame.bodies.forEach((b, i) => {
      b.x = -this.direction(b.side) * (b.goalie ? 25 : 2 + (i % 5) * 2);
      b.z = b.goalie ? 0 : ((i % 3) - 1) * 4;
      b.vx = b.vz = 0;
    });
    const side = this.rng.next() < 0.5 ? 0 : 1;
    const center =
      this.frame.bodies.find(
        (b) => b.side === side && this.player(b.id).pos === "C",
      ) ?? this.frame.bodies.find((b) => b.side === side && !b.goalie)!;
    this.owner = center.id;
    center.x = 0;
    center.z = 0;
    this.emit("faceoff", center, "Вбрасывание");
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
  step() {
    if (this.done || this.intermission) return;
    const dt = 0.1;
    this.time = Math.round((this.time + dt) * 10) / 10;
    this.result.duration = this.time;
    const expired = this.penalties.some((p) => p.until <= this.time);
    this.penalties = this.penalties.filter((p) => p.until > this.time);
    const shift = Math.floor(this.time / 40);
    if (shift !== this.shift || expired) {
      this.shift = shift;
      this.changeShift();
    }
    const puck = this.frame.puck;
    const owner = this.frame.bodies.find((b) => b.id === this.owner);
    // Assign an actual puck retriever per side. Formation offsets previously
    // left every player outside pickup range around a stationary loose puck.
    const retrievers = [0, 1].map(side => this.frame.bodies
      .filter(b => b.side === side && !b.goalie && b.id !== owner?.id)
      .sort((a, b) => Math.hypot(a.x-puck.x,a.z-puck.z)-Math.hypot(b.x-puck.x,b.z-puck.z))[0]?.id);
    this.frame.bodies.forEach((b, slot) => {
      const p = this.player(b.id),
        dir = this.direction(b.side);
      let tx: number, tz: number;
      if (b.goalie) {
        tx = -dir * 25;
        tz = clamp(puck.z * 0.12, -0.9, 0.9);
      } else if (owner?.id === b.id) {
        tx = dir * 23;
        tz = puck.z * 0.8;
      } else if (!owner || owner.side !== b.side) {
        const pressure =
          this.teams[b.side].tactics.forecheck === "2-1-2"
            ? 1
            : this.teams[b.side].tactics.forecheck === "1-3-1"
              ? 5
              : 3;
        const retrieving = retrievers[b.side] === b.id;
        tx = puck.x + (retrieving ? 0 : -dir * pressure);
        tz = puck.z + (retrieving ? 0 : ((slot % 3) - 1) * 3);
      } else {
        tx = clamp(puck.x + dir * (p.pos === "D" ? -9 : 5), -25, 25);
        // Cycle in support and open passing lanes rather than parking in slots.
        tx += Math.sin(this.time * 0.45 + slot) * 1.8;
        tz = ((slot % 3) - 1) * 6 + Math.cos(this.time * 0.35 + slot) * 1.5;
      }
      const dx = tx - b.x,
        dz = tz - b.z,
        distance = Math.hypot(dx, dz);
      const speed = b.goalie
        ? 3
        : (4 + (p.attributes.speed ?? 70) * 0.04) *
          (1 - p.fatigue * 0.004) *
          (0.8 + this.teams[b.side].tactics.pace / 250);
      const acceleration = Math.min(1, dt * 3);
      b.vx +=
        ((distance > 0.2 ? (dx / distance) * speed : 0) - b.vx) * acceleration;
      b.vz +=
        ((distance > 0.2 ? (dz / distance) * speed : 0) - b.vz) * acceleration;
      b.x = clamp(b.x + b.vx * dt, -29, 29);
      b.z = clamp(b.z + b.vz * dt, -12, 12);
      if (!this.appeared.has(b.id)) {
        this.appeared.add(b.id);
        p.stats.gp++;
      }
      p.stats.toi += dt / 60;
      if (!b.goalie) p.fatigue = clamp(p.fatigue + dt * 0.005, 0, 100);
    });
    if (owner) {
      puck.x = owner.x;
      puck.z = owner.z;
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
          const quality = clamp(
            0.08 +
              (this.player(f.shooter).attributes.accuracy - 70) * 0.001 +
              (goalie
                ? Math.abs(goalie.z - puck.z) * 0.025 +
                  (75 - this.player(goalie.id).attributes.reflexes) * 0.001
                : 0.9),
            0.02,
            0.99,
          );
          this.result.xg[f.side] += quality;
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
            }
            this.emit(
              "goal",
              shooter,
              goalie ? "ГОЛ" : "Гол в пустые ворота",
              quality,
            );
            if (this.time > 3600) {
              this.finish();
              return;
            }
            this.changeShift();
            this.faceoff();
          } else {
            this.emit("shot", shooter, "Бросок — сейв", quality);
            this.faceoff();
          }
        } else {
          this.flight = undefined;
          puck.x = clamp(puck.x, -29, 29);
        }
      } else if (
        f.remaining <= 0 ||
        Math.abs(puck.x) > 29 ||
        Math.abs(puck.z) > 12
      ) {
        this.flight = undefined;
        puck.x = clamp(puck.x, -29, 29);
        puck.z = clamp(puck.z, -12, 12);
      }
    }
    if (!this.owner && !this.flight) {
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
    if (owner && this.time >= this.decision) {
      this.decision = this.time + 1.5;
      const pressure = this.frame.bodies.find(
        (b) =>
          b.side !== owner.side &&
          !b.goalie &&
          Math.hypot(b.x - owner.x, b.z - owner.z) < 1.5,
      );
      if (pressure && this.rng.next() < 0.25) {
        if (
          this.rng.next() <
            0.02 + this.teams[pressure.side].tactics.physical * 0.0008 &&
          this.penalties.filter((p) => p.side === pressure.side).length < 2
        ) {
          this.penalties.push({
            id: pressure.id,
            side: pressure.side,
            until: this.time + 120,
          });
          this.player(pressure.id).stats.pim += 2;
          this.result.ppo[owner.side]++;
          this.emit("penalty", pressure, "2 минуты за нарушение");
          this.changeShift();
          this.faceoff();
        } else {
          this.owner = pressure.id;
          this.touches = [pressure.id];
          this.emit("turnover", pressure, "Отбор шайбы");
        }
      } else {
        const dir = this.direction(owner.side),
          distance = Math.abs(dir * 26 - owner.x);
        const counts = this.counts();
        const situation =
          `${counts[owner.side] + Number(this.pullGoalie[owner.side])}v${counts[1 - owner.side] + Number(this.pullGoalie[1 - owner.side])}` as SpecialTeamsSituation;
        const style = this.teams[owner.side].specialTeams?.[situation]?.style;
        const shooting =
          this.teams[owner.side].tactics.shooting / 100 +
          (style === "net-front" || style === "aggressive"
            ? 0.12
            : style === "possession"
              ? -0.12
              : 0);
        const shot = distance < 20 && this.time >= this.nextShot[owner.side] && this.rng.next() < shooting * 0.45;
        if (shot) this.nextShot[owner.side] = this.time + 30 + this.rng.next() * 35;
        const mates = this.frame.bodies.filter(
          (b) => b.side === owner.side && !b.goalie && b.id !== owner.id,
        );
        if (shot || (mates.length && this.rng.next() < 0.45)) {
          const mate = shot ? undefined : this.rng.pick(mates);
          const tx = mate?.x ?? dir * 27,
            tz = mate?.z ?? (this.rng.next() - 0.5) * 3;
          const dx = tx - puck.x,
            dz = tz - puck.z,
            length = Math.max(0.1, Math.hypot(dx, dz));
          const speed = shot ? 28 : 16;
          this.flight = {
            vx: (dx / length) * speed,
            vz: (dz / length) * speed,
            remaining: length / speed + 0.1,
            shooter: owner.id,
            side: owner.side,
            shot,
          };
          this.owner = "";
        }
      }
    }
    this.frame.carrierId = this.owner || undefined;
    if (this.time === 1200 || this.time === 2400) {
      this.intermission = true;
      this.faceoff();
    }
    if (this.time === 3600) {
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
  private finish() {
    this.done = true;
    const winner = this.result.goals[0] > this.result.goals[1] ? 0 : 1;
    const goalie = this.teams[winner].players.find(
      (p) => p.id === this.teams[winner].goalie,
    );
    if (goalie) goalie.stats.wins++;
    updateMatchPerformance(this.teams, this.baseline, this.teams[winner].id);
  }
}
