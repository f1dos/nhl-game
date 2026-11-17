/**
 * Smooth presentation of positions that the simulation only publishes in coarse
 * steps (every 100 ms of real time, several simulated steps at once at high
 * playback speed).
 *
 * Each track glides, in constant-velocity segments, from where it is *drawn*
 * right now to the newest published position, over slightly more than the
 * measured interval between publications. Position is therefore always continuous (no snapping, no
 * stutter between steps) and the picture trails the simulation by one interval.
 * Large jumps (faceoff resets, line changes) snap instead of sliding across the ice.
 */
export class TrackSmoother {
  private fromX = 0;
  private fromZ = 0;
  private toX = 0;
  private toZ = 0;
  private t0 = 0;
  private gap = 100;
  private dur = 125;
  private lastTick = Number.NaN;
  private lastArrival = 0;
  private started = false;
  /** Distance (metres) above which the track teleports instead of gliding. */
  jump = 8;
  x = 0;
  z = 0;
  push(tick: number, x: number, z: number, now: number) {
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    if (!this.started) {
      this.fromX = this.toX = this.x = x;
      this.fromZ = this.toZ = this.z = z;
      this.t0 = this.lastArrival = now;
      this.started = true;
      return;
    }
    const gap = now - this.lastArrival;
    this.lastArrival = now;
    // Smoothed publication interval; ignore pauses and tab-switch gaps.
    if (gap > 20 && gap < 400) this.gap += (gap - this.gap) * 0.25;
    // Segments last a little longer than the interval: an update that lands a
    // frame late then finds the track still moving instead of waiting (a hold of
    // even one frame reads as a stutter), and an on-time one simply cuts in.
    this.dur = this.gap * 1.25;
    this.sample(now);
    if (Math.hypot(x - this.x, z - this.z) > this.jump) {
      this.fromX = this.x = x;
      this.fromZ = this.z = z;
    } else {
      this.fromX = this.x;
      this.fromZ = this.z;
    }
    this.toX = x;
    this.toZ = z;
    this.t0 = now;
  }
  sample(now: number) {
    const u = Math.max(0, Math.min(1, (now - this.t0) / this.dur));
    this.x = this.fromX + (this.toX - this.fromX) * u;
    this.z = this.fromZ + (this.toZ - this.fromZ) * u;
    return this;
  }
}
