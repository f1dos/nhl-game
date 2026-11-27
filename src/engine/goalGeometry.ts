import { RINK, type Dot } from "./rink";

export const PUCK_RADIUS = 0.0381;
export const POST_RADIUS = 0.0254;
export const GOAL_HALF_WIDTH = 0.9144;
export const GOAL_HEIGHT = 1.2192;

// Horseshoe-shaped lower perimeter, open at the goal line.
export function goalOutline(side: number, depth = 1.12): Dot[] {
  return Array.from({length: 25}, (_, i) => {
    const angle = Math.PI * i / 24;
    return {x: side * (RINK.goalLine + depth * Math.sin(angle)), z: GOAL_HALF_WIDTH * Math.cos(angle)};
  });
}

export function closestOnPath(start: Dot, end: Dot, point: Dot) {
  const dx = end.x-start.x, dz = end.z-start.z;
  const t = Math.max(0, Math.min(1, ((point.x-start.x)*dx+(point.z-start.z)*dz)/(dx*dx+dz*dz || 1)));
  const x = start.x+t*dx, z = start.z+t*dz;
  return {x,z,t,gap:Math.hypot(x-point.x,z-point.z)};
}

const NET_CENTER = RINK.goalLine + .54;
const SKATER_NET_X = 1.14;
const SKATER_NET_Z = GOAL_HALF_WIDTH + .5;

/** The goal mouth is traversable by the puck. The frame and its interior are solid for skaters. */
export function clearSkaterNet(start: Dot, end: Dot): Dot {
  if (Math.max(Math.abs(start.x), Math.abs(end.x)) < NET_CENTER - SKATER_NET_X ||
      (Math.abs(start.z) > SKATER_NET_Z && Math.abs(end.z) > SKATER_NET_Z && start.z*end.z > 0)) return end;
  const side = Math.sign(end.x || start.x) || 1;
  const center = side * NET_CENTER;
  const ax = (start.x-center)/SKATER_NET_X, az = start.z/SKATER_NET_Z;
  const bx = (end.x-center)/SKATER_NET_X, bz = end.z/SKATER_NET_Z;
  const dx = bx-ax, dz = bz-az;
  const length2 = dx*dx + dz*dz;
  const projection = ax*dx + az*dz;
  const outside = ax*ax + az*az - 1;
  if (outside < 0) {
    const distance = Math.hypot(bx, bz);
    if (distance >= 1) return end;
    return distance > 1e-6
      ? { x: center + bx/distance*SKATER_NET_X, z: bz/distance*SKATER_NET_Z }
      : { x: center - side*SKATER_NET_X, z: 0 };
  }
  const det = projection*projection-length2*outside;
  if (!length2 || det < 0 || projection >= 0) return end;
  const t = (-projection-Math.sqrt(det))/length2;
  if (t > 1) return end;
  const nx = ax+t*dx, nz = az+t*dz;
  const radial = (dx*nx+dz*nz)*(1-t);
  return { x: center + (bx-radial*nx+.001*nx)*SKATER_NET_X, z: (bz-radial*nz+.001*nz)*SKATER_NET_Z };
}

export function skaterNetRoute(start: Dot, target: Dot): Dot {
  const safe = clearSkaterNet(start, target);
  if (safe === target) return target;
  const side = Math.sign(start.x || target.x) || 1;
  const lane = Math.sign(Math.abs(start.z) > .28 ? start.z : target.z) || 1;
  // Once abreast of the net, round the second corner. Re-targeting the
  // first corner here strands the skater at his own waypoint.
  if (Math.abs(start.z) >= SKATER_NET_Z+.35) {
    const far=Math.sign(target.x*side-NET_CENTER)||1;
    return {x:side*(NET_CENTER+far*(SKATER_NET_X+.35)),z:lane*(SKATER_NET_Z+.75)};
  }
  return {
    x: start.x*side < NET_CENTER ? side*(NET_CENTER-SKATER_NET_X-.18) : side*(NET_CENTER+SKATER_NET_X+.18),
    z: lane*(SKATER_NET_Z+.55),
  };
}

const ends = [-1,1].map(side => goalOutline(side));
// Sweep the puck disc against the two faces and rounded ends of each rail.
export function netContact(start: Dot, end: Dot) {
  const dx=end.x-start.x, dz=end.z-start.z, speed2=dx*dx+dz*dz;
  const radius=PUCK_RADIUS+POST_RADIUS;
  let first: {t:number; nx:number; nz:number} | undefined;
  if (!speed2 || Math.max(Math.abs(start.x),Math.abs(end.x))<RINK.goalLine-radius) return;
  function hit(t:number,nx:number,nz:number) {
    if(t>=0 && t<=1 && dx*nx+dz*nz<0 && (!first || t<first.t)) first={t,nx,nz};
  }
  for (const path of ends) {
    for (let i=0;i<path.length;i++) {
      const a=path[i], qx=start.x-a.x,qz=start.z-a.z;
      const dot=qx*dx+qz*dz, det=dot*dot-speed2*(qx*qx+qz*qz-radius*radius);
      if (det>=0) {
        const t=(-dot-Math.sqrt(det))/speed2;
        hit(t,(qx+t*dx)/radius,(qz+t*dz)/radius);
      }
      if (!i) continue;
      const b=path[i-1], ex=b.x-a.x,ez=b.z-a.z,len=Math.hypot(ex,ez);
      const nx=-ez/len,nz=ex/len, normalSpeed=dx*nx+dz*nz;
      if(Math.abs(normalSpeed)<1e-8) continue;
      const sign=normalSpeed>0?-1:1;
      const t=(sign*radius-qx*nx-qz*nz)/normalSpeed;
      const along=(qx+t*dx)*ex+(qz+t*dz)*ez;
      if(along>=0 && along<=len*len) hit(t,sign*nx,sign*nz);
    }
  }
  return first;
}

// Intersect the moving puck with the horizontal bar in the vertical plane.
// Ignore intersections beyond the uprights, where the mouth is open to air.
export function crossbarContact(start:Dot & {y:number},end:Dot & {y:number},side:number){
  const x=side*RINK.goalLine,dx=end.x-start.x,dy=end.y-start.y;
  const ox=start.x-x,oy=start.y-GOAL_HEIGHT;
  const radius=POST_RADIUS+.0127, a=dx*dx+dy*dy,b=dx*ox+dy*oy;
  const det=b*b-a*(ox*ox+oy*oy-radius*radius);
  if(!a || det<0)return;
  const t=(-b-Math.sqrt(det))/a;
  if(t<0 || t>1 || Math.abs(start.z+t*(end.z-start.z))>GOAL_HALF_WIDTH+PUCK_RADIUS)return;
  return {t,nx:(ox+t*dx)/radius,ny:(oy+t*dy)/radius};
}
