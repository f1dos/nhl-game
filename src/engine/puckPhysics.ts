import { closestOnPath, PUCK_RADIUS } from "./goalGeometry";
import { RINK, type Dot } from "./rink";

export const PUCK_ICE_Y = 0.018;
export const GRAVITY = 9.81;
export const ICE_DRAG = 0.95;

type Puck = Dot & { y: number };
type Velocity = { vx: number; vz: number; vy?: number };

export function stepPuck(puck: Puck, velocity: Velocity, dt: number) {
  const airborne = puck.y > PUCK_ICE_Y + 0.002 || (velocity.vy ?? 0) > 0;

  const speed = Math.hypot(velocity.vx, velocity.vz);
  const drag = airborne ? .04 : ICE_DRAG + .12 * speed;
  const movingTime = Math.min(dt, speed / drag);
  const endSpeed = Math.max(0, speed - drag * movingTime);
  const travel = speed ? (speed + endSpeed) / (2 * speed) * movingTime : 0;
  puck.x += velocity.vx * travel;
  puck.z += velocity.vz * travel;
  const scale = speed ? endSpeed / speed : 0;
  velocity.vx *= scale;
  velocity.vz *= scale;
  if (!airborne) {
    puck.y = PUCK_ICE_Y;
    velocity.vy = 0;
    return;
  }
  const vy = velocity.vy ?? 0;
  puck.y += vy * dt - GRAVITY * dt * dt / 2;
  velocity.vy = vy - GRAVITY * dt;
  if (puck.y < PUCK_ICE_Y) {
    puck.y = PUCK_ICE_Y;
    velocity.vy = velocity.vy < -1.5 ? -velocity.vy * 0.22 : 0;
    velocity.vx *= 0.94;
    velocity.vz *= 0.94;
  }
}

/** Bounce on the interior of the rounded rectangle, preserving tangential motion. */
export function bounceAtBoards(puck: Dot, velocity: Velocity) {
  const radius = RINK.cornerRadius;
  const cx = Math.sign(puck.x) * Math.min(Math.abs(puck.x), RINK.boardsX - radius);
  const cz = Math.sign(puck.z) * Math.min(Math.abs(puck.z), RINK.boardsZ - radius);
  const dx = puck.x - cx, dz = puck.z - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= radius - PUCK_RADIUS) return false;
  const nx = dx / distance, nz = dz / distance;
  const normalSpeed = velocity.vx * nx + velocity.vz * nz;
  const inside = radius - PUCK_RADIUS - 0.001;
  puck.x = cx + nx * inside;
  puck.z = cz + nz * inside;
  if (normalSpeed > 0) {
    velocity.vx = (velocity.vx - nx * normalSpeed) * 0.81 - nx * normalSpeed * 0.43;
    velocity.vz = (velocity.vz - nz * normalSpeed) * 0.81 - nz * normalSpeed * 0.43;
  }
  return true;
}

export function bladeContact(start: Dot, end: Dot, oldBlade: Dot, blade: Dot) {
  return closestOnPath(
    { x: start.x - oldBlade.x, z: start.z - oldBlade.z },
    { x: end.x - blade.x, z: end.z - blade.z },
    { x: 0, z: 0 },
  );
}
