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
export function bounceAtBoards(puck: Dot, velocity: Velocity, start?: Dot, dt=0) {
  const radius = RINK.cornerRadius;
  const cx = Math.sign(puck.x) * Math.min(Math.abs(puck.x), RINK.boardsX - radius);
  const cz = Math.sign(puck.z) * Math.min(Math.abs(puck.z), RINK.boardsZ - radius);
  const dx = puck.x - cx, dz = puck.z - cz;
  const distance = Math.hypot(dx, dz);
  if (distance <= radius - PUCK_RADIUS) return false;
  let nx = dx / distance, nz = dz / distance, remainder=0;
  if(start && dt>0){
    // Locate first contact on the rounded rail, then use the remaining tick for the rebound.
    const ox=puck.x-start.x, oz=puck.z-start.z;
    let lo=0,hi=1;
    for(let i=0;i<10;i++){
      const t=(lo+hi)*.5,x=start.x+t*ox,z=start.z+t*oz;
      if(Math.hypot(Math.max(0,Math.abs(x)-RINK.boardsX+radius),
          Math.max(0,Math.abs(z)-RINK.boardsZ+radius))>=radius-PUCK_RADIUS)hi=t;else lo=t;
    }
    const x=start.x+hi*ox,z=start.z+hi*oz;
    const rx=Math.sign(x)*Math.max(0,Math.abs(x)-RINK.boardsX+radius);
    const rz=Math.sign(z)*Math.max(0,Math.abs(z)-RINK.boardsZ+radius);
    const r=Math.hypot(rx,rz);
    if(r>.001){nx=rx/r;nz=rz/r;remainder=dt*(1-hi);}
  }
  const normalSpeed = velocity.vx * nx + velocity.vz * nz;
  const inside = radius - PUCK_RADIUS - 0.001;
  puck.x = remainder && start ? start.x+(puck.x-start.x)*(1-remainder/dt)-nx*.001 : cx + nx * inside;
  puck.z = remainder && start ? start.z+(puck.z-start.z)*(1-remainder/dt)-nz*.001 : cz + nz * inside;
  if (normalSpeed > 0) {
    // A grazing rim carries along the wall; square impacts lose more energy in the kick plate.
    const incidence=normalSpeed/Math.max(.001,Math.hypot(velocity.vx,velocity.vz));
    const tangent=.819-.075*incidence;
    const rebound=.50-.09*incidence;
    velocity.vx = (velocity.vx - nx * normalSpeed) * tangent - nx * normalSpeed * rebound;
    velocity.vz = (velocity.vz - nz * normalSpeed) * tangent - nz * normalSpeed * rebound;
    puck.x+=velocity.vx*remainder; puck.z+=velocity.vz*remainder;
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
