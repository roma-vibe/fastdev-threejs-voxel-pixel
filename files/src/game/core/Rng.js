/** Deterministic PRNG (mulberry32) with helpers. */
export class Rng {
  constructor(seed = 1) {
    this.s = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0 || 1;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + this.next() * (b - a);
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted(entries) {
    const total = entries.reduce((s, e) => s + e[1], 0);
    let r = this.next() * total;
    for (const [v, w] of entries) if ((r -= w) <= 0) return v;
    return entries[entries.length - 1][0];
  }
  fork(salt) {
    return new Rng((this.s ^ hashString(String(salt))) >>> 0);
  }
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stateless integer hash -> [0,1). */
export function hash3(x, y, z, seed = 0) {
  let h =
    (seed ^
      Math.imul(x | 0, 374761393) ^
      Math.imul(y | 0, 668265263) ^
      Math.imul(z | 0, 2147483647)) >>>
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
