export class RNG {
  constructor(public seed: number) {}
  next() {
    this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  int(a: number, b: number) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  pick<T>(xs: T[]): T {
    return xs[this.int(0, xs.length - 1)];
  }
}
export const clamp = (n: number, a = 1, b = 100) => Math.min(b, Math.max(a, n));
