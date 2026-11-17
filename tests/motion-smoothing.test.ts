import { test } from "node:test";
import assert from "node:assert/strict";
import { TrackSmoother } from "../src/ui/motionSmoothing";

/** Publish a position every 100 ms, sample at 60 fps, return per-frame displacement. */
function run(publish: (tick: number) => [number, number], seconds = 4) {
  const track = new TrackSmoother();
  const steps: number[] = [];
  let prev: [number, number] | undefined;
  let tick = -1;
  for (let t = 0; t < seconds * 1000; t += 1000 / 60) {
    const nextTick = Math.floor(t / 100);
    if (nextTick !== tick) {
      tick = nextTick;
      const [x, z] = publish(tick);
      track.push(tick, x, z, t);
    }
    track.sample(t);
    if (prev) steps.push(Math.hypot(track.x - prev[0], track.z - prev[1]));
    prev = [track.x, track.z];
  }
  return steps;
}

test("a skater published in 100 ms steps moves every frame at a steady speed", () => {
  const steps = run((tick) => [tick * 0.8, 0]).slice(30); // 8 m/s
  assert(Math.min(...steps) > 0, "no stalled frames");
  const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
  // Timer arrivals land on whole frames, so a frame may see a 1/6 interval shift;
  // speed must still never stall (> 40 % below) or surge (> 40 % above).
  for (const s of steps) assert(Math.abs(s - mean) < mean * 0.4, `uneven step ${s} vs ${mean}`);
  assert(Math.abs(mean * 60 - 8) < 0.2, `speed ${mean * 60} m/s`);
});

test("positions stay continuous when the target changes direction", () => {
  const steps = run((tick) => [Math.abs(((tick * 0.8) % 20) - 10), 0]);
  assert(Math.max(...steps) < 0.8 / 6 * 1.3, "no frame may jump further than the segment speed allows");
});

test("large jumps snap instead of sliding across the ice", () => {
  const track = new TrackSmoother();
  track.push(0, 0, 0, 0);
  track.push(1, 0.5, 0, 100);
  track.push(2, 30, 5, 200);
  track.sample(200);
  assert.equal(track.x, 30);
  assert.equal(track.z, 5);
});

test("repeated ticks are ignored and a paused source holds still", () => {
  const track = new TrackSmoother();
  track.push(0, 0, 0, 0);
  track.push(1, 1, 0, 100);
  track.push(1, 99, 0, 120);
  track.sample(1000);
  assert.equal(track.x, 1);
});

test("updates landing a frame early or late never freeze the track", () => {
  const track = new TrackSmoother();
  let t = 0, tick = 0, next = 0;
  const steps: number[] = [];
  let prev = 0;
  for (let frame = 0; frame < 400; frame++, t += 1000 / 60) {
    if (t >= next) { // timer jitter: alternate 5-frame and 7-frame gaps (avg 100 ms)
      track.push(tick, tick * 0.8, 0, t);
      tick++;
      next = t + (tick % 2 ? 5 : 7) * (1000 / 60) - 1;
    }
    track.sample(t);
    if (frame > 40) steps.push(track.x - prev);
    prev = track.x;
  }
  assert(Math.min(...steps) > 0.02, `frozen frame: ${Math.min(...steps)}`);
});
