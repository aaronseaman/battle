// Fixed-capacity event queue. The simulation emits gameplay events (hits, kills,
// shots, boss phases...) and the renderer / audio / UI consume them once per
// frame. Event objects are preallocated and reused, so emitting never allocates.
//
// Every event has the same shape: { type, x, y, a, b, s, ref }
//   x, y  world position (when meaningful)
//   a, b  numeric payload (damage, amount, radius, target coords...)
//   s     string payload (entity type, tower type, boss id...)
//   ref   optional object reference (tower / enemy) — valid only this frame

export class EventQueue {
  constructor(cap = 2048) {
    this.items = new Array(cap);
    for (let i = 0; i < cap; i++) this.items[i] = { type: '', x: 0, y: 0, a: 0, b: 0, s: '', ref: null };
    this.n = 0;
    this.dropped = 0;
  }

  emit(type, x = 0, y = 0, a = 0, b = 0, s = '', ref = null) {
    if (this.n >= this.items.length) {
      this.dropped++;
      return;
    }
    const e = this.items[this.n++];
    e.type = type;
    e.x = x;
    e.y = y;
    e.a = a;
    e.b = b;
    e.s = s;
    e.ref = ref;
  }

  clear() {
    for (let i = 0; i < this.n; i++) this.items[i].ref = null;
    this.n = 0;
  }
}
