/**
 * Shared rink layout in simulation metres (x along the length, z across).
 * Used by the spatial engine for faceoff dots and stoppage choreography and by
 * the 3D arena for benches, penalty boxes and markings, so both always agree.
 */
export const RINK = {
  /** Half length / half width of the playable surface the engine clamps to. */
  halfLength: 29,
  halfWidth: 12,
  /** Boards (visual) half length / half width. */
  boardsX: 30.5,
  boardsZ: 13.2,
  /** Goal line and goalie crease position. */
  goalLine: 26,
  goalieX: 25,
  /** End-zone faceoff dots and blue lines. */
  dotX: 20.5,
  dotZ: 6.7,
  blueLine: 7.62,
} as const;

/** Player benches sit behind the boards on the -z side: home left, away right. */
export const BENCH = {
  centerX: [-8.5, 8.5],
  halfLength: 6.2,
  /** Line on the ice just in front of the bench, used for fist-bump lines. */
  frontZ: -11.4,
  /** Gate where players step on and off the ice. */
  doorZ: -12.4,
  seatZ: -14.55,
  seatY: 0.48,
} as const;

/** Penalty boxes sit across the ice from the benches. */
export const PENALTY_BOX = {
  centerX: [-3.2, 3.2],
  seatZ: 14.55,
  doorZ: 12.4,
} as const;

export type Dot = { x: number; z: number };
export const CENTER_DOT: Dot = { x: 0, z: 0 };

interface ContactBody extends Dot {
  vx: number;
  vz: number;
  goalie: boolean;
}

/** Project shoulder and hip contact along its normal. Keep tangential speed
 * so a checker can ride an opponent along the boards. With a previous frame,
 * solve first contact on the swept path too, even if the skaters cross within
 * a single simulation step. */
export function separateSkaters(bodies: ContactBody[], previous?: Dot[]) {
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const width = a.goalie || b.goalie ? 1.02 : .84;
        let nx = dx, nz = dz;
        if (!pass && previous) {
          const px = previous[j].x - previous[i].x, pz = previous[j].z - previous[i].z;
          const sx = dx - px, sz = dz - pz;
          const travel = sx*sx + sz*sz, approach = -(px*sx + pz*sz);
          const clearance = px*px + pz*pz - width*width;
          if (approach > 0 && travel > .00001 && clearance >= -.0002) {
            const discriminant = approach*approach - travel*clearance;
            if (discriminant >= 0) {
              const time = Math.max(0, (approach - Math.sqrt(discriminant)) / travel);
              if (time >= 0 && time <= 1) {
                nx = px + sx*time;
                nz = pz + sz*time;
              }
            }
          }
        }
        if (nx === dx && nz === dz && dx*dx + dz*dz >= width*width) continue;
        const length = Math.hypot(nx,nz);
        nx = length ? nx/length : 1;
        nz = length ? nz/length : 0;
        const depth = width - dx*nx - dz*nz;
        if (depth < .0001) continue;
        moved = true;
        const share = a.goalie ? .15 : b.goalie ? .85 : .5;
        a.x = Math.max(-RINK.halfLength, Math.min(RINK.halfLength, a.x - nx*depth*share));
        a.z = Math.max(-RINK.halfWidth, Math.min(RINK.halfWidth, a.z - nz*depth*share));
        b.x = Math.max(-RINK.halfLength, Math.min(RINK.halfLength, b.x + nx*depth*(1-share)));
        b.z = Math.max(-RINK.halfWidth, Math.min(RINK.halfWidth, b.z + nz*depth*(1-share)));
        const closing = Math.max(0,(a.vx-b.vx)*nx + (a.vz-b.vz)*nz);
        a.vx -= nx*closing*share;
        a.vz -= nz*closing*share;
        b.vx += nx*closing*(1-share);
        b.vz += nz*closing*(1-share);
      }
    }
    if (!moved) break;
  }
}
