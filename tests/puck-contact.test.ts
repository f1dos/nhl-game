import assert from "node:assert/strict";
import {test} from "node:test";
import {GOAL_HEIGHT,crossbarContact,GOAL_HALF_WIDTH, netContact, closestOnPath} from "../src/engine/goalGeometry";
import {RINK} from "../src/engine/rink";

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
