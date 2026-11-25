import assert from "node:assert/strict";
import {test} from "node:test";
import {GOAL_HEIGHT,crossbarContact,GOAL_HALF_WIDTH, netContact, closestOnPath, clearSkaterNet, skaterNetRoute} from "../src/engine/goalGeometry";
import {RINK} from "../src/engine/rink";
import { bladeContact, bounceAtBoards, PUCK_ICE_Y, stepPuck } from "../src/engine/puckPhysics";

for(const side of [-1,1]){
  const x=RINK.goalLine*side;
  test("post, mouth and rear mesh share one outline, end "+side,()=>{
    const post=netContact({x:x-side*3,z:GOAL_HALF_WIDTH},{x:x+side*.4,z:GOAL_HALF_WIDTH});
    assert(post && post.nx*side<-.9);
    assert.equal(netContact({x:x-side*3,z:0},{x:x+side*.1,z:0}),undefined);
    const back=netContact({x:x+side*2,z:.1},{x:x+side*.1,z:.1});
    assert(back && back.nx*side>.8);
    const sideWall=netContact({x:x+side*.5,z:2},{x:x+side*.5,z:0});
    assert(sideWall && sideWall.nz>.8);
  });
}
test("a fast puck crosses the receiving blade between ticks",()=>{
  const c=closestOnPath({x:0,z:.2},{x:2.2,z:.2},{x:1.1,z:.25});
  assert.equal(c.t,.5);assert(c.gap<.06);
});

test("high shots strike the crossbar, while a shot above the frame clears it",()=>{
  const start={x:25,y:GOAL_HEIGHT,z:.2},end={x:27,y:GOAL_HEIGHT,z:.2};
  assert(crossbarContact(start,end,1));
  assert.equal(crossbarContact({...start,y:1.5},{...end,y:1.5},1),undefined);
});

test("a rising puck falls and loses energy on a skip across the ice", () => {
  const puck = { x: 0, y: PUCK_ICE_Y, z: 0 };
  const velocity = { vx: 12, vz: 1, vy: 3 };
  for (let i = 0; i < 20; i++) stepPuck(puck, velocity, .01);
  assert(puck.y > .35 && velocity.vy > 0);
  for (let i = 0; i < 55; i++) stepPuck(puck, velocity, .01);
  assert(puck.y >= PUCK_ICE_Y && puck.y < .09);
  assert(velocity.vx < 11.5);
});

test("rounded corners redirect the puck along the boards", () => {
  const puck = { x: RINK.boardsX - 1, z: RINK.boardsZ - 1 };
  const velocity = { vx: 10, vz: 2 };
  assert(bounceAtBoards(puck, velocity));
  assert(velocity.vz < 0);
  assert(Math.hypot(velocity.vx, velocity.vz) < Math.hypot(10, 2));
  assert.equal(bounceAtBoards(puck, velocity), false);
});

test("reception sweeps both the puck and the moving blade", () => {
  const contact = bladeContact({ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 1, z: -1 }, { x: 1, z: 1 });
  assert.equal(contact.t, .5);
  assert.equal(contact.gap, 0);
});

test("skaters go around both nets while a puck can cross the goal mouth", () => {
  for (const side of [-1, 1]) {
    const front = { x: side*(RINK.goalLine-2), z: 0 };
    const behind = { x: side*(RINK.goalLine+3), z: 0 };
    assert(Math.abs(clearSkaterNet(front, behind).x) < RINK.goalLine);
    assert(Math.abs(clearSkaterNet(behind, front).x) > RINK.goalLine+1);
    assert(Math.abs(skaterNetRoute(front, behind).z) > GOAL_HALF_WIDTH+.5);
    assert.equal(netContact(front, { x: side*(RINK.goalLine+.12), z: 0 }), undefined);
  }
});

test("free ice travel slows every second and stops without a last-tick jump", () => {
  const puck = {x:0, z:0, y:PUCK_ICE_Y};
  const velocity = {vx:8, vz:0};
  const distances: number[] = [];
  for (let second=0; second<8; second++) {
    const from=puck.x;
    for (let tick=0; tick<10; tick++) stepPuck(puck,velocity,.1);
    distances.push(puck.x-from);
  }
  assert(distances[0]<8 && distances[0]>6);
  assert(distances[1]<distances[0]-1);
  assert(distances.every((d,i)=>!i || d<=distances[i-1]));
  assert.equal(distances.at(-1),0);
});

test("a straight board absorbs both normal and glancing impacts", () => {
  for (const [vx,vz] of [[8,0],[1,8]]) {
    const puck={x:RINK.boardsX,z:0}, velocity={vx,vz};
    assert(bounceAtBoards(puck,velocity));
    assert(velocity.vx<0);
    assert(Math.hypot(velocity.vx,velocity.vz)<.82*Math.hypot(vx,vz));
  }
});
