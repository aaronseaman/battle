// Small allocation-free helpers shared by the simulation.

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

// mulberry32 — deterministic, serializable (state is one uint32).
export class RNG {
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
}

export class Pool {
  constructor(factory, prefill = 0) {
    this.factory = factory;
    this.free = [];
    for (let i = 0; i < prefill; i++) this.free.push(factory());
  }
  get() {
    return this.free.length ? this.free.pop() : this.factory();
  }
  release(o) {
    this.free.push(o);
  }
}

// Removes dead objects in place (order not preserved is fine but we keep it stable)
// and returns them to their pool.
export function compact(arr, pool) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (o.alive) arr[j++] = o;
    else if (pool) pool.release(o);
  }
  arr.length = j;
}
