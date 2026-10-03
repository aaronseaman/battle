// SpriteBank — loads the art manifest (assets/art/manifest.json) and draws
// animated sprite-sheet frames. Missing sprites are simply absent: the renderer
// falls back to its placeholder shapes per key, so art can land incrementally.
//
// Manifest entry (see docs/ART_HANDOFF.md for the full spec):
//   "enemy.jelly": {
//     "file": "enemies/jelly.webp",     // sheet path relative to assets/art/ (null = not delivered)
//     "frame": [96, 96],                 // frame size in px
//     "anchor": [0.5, 0.85],             // ground-contact point, fraction of the frame
//     "facing": "right",                 // which way the art looks (renderer mirrors as needed)
//     "scale": 1,                        // optional size tweak
//     "wobble": true,                    // optional procedural clay squash at 12 fps
//     "anims": { "move": { "row": 0, "frames": 6, "fps": 12, "loop": true }, ... }
//   }
// An anim may also set "file" (its own strip) and "col" (first frame column).

export class SpriteBank {
  constructor(base = 'assets/art/') {
    this.base = base;
    this.pxPerUnit = 2;
    this.version = 0;
    this.defs = Object.create(null); // key -> def (only those with a loaded image)
    this.images = new Map(); // file -> HTMLImageElement
    this.ready = false;
    this.loaded = 0;
    this.failed = [];
  }

  async load(onProgress) {
    let manifest;
    try {
      const res = await fetch(this.base + 'manifest.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      manifest = await res.json();
    } catch {
      this.ready = true;
      return this;
    }
    this.pxPerUnit = manifest.pxPerUnit || 2;
    this.version = manifest.version || 0;
    const files = new Set();
    const entries = Object.entries(manifest.sprites || {});
    for (const [, d] of entries) {
      if (!d || !d.anims) continue;
      if (d.file) files.add(d.file);
      for (const a of Object.values(d.anims)) if (a.file) files.add(a.file);
    }
    const total = files.size;
    let done = 0;
    await Promise.all([...files].map((f) => this.loadImage(f).then(() => {
      done++;
      if (onProgress) onProgress(done, total);
    })));
    for (const [key, d] of entries) {
      if (!d || !d.anims) continue;
      let ok = true;
      for (const a of Object.values(d.anims)) {
        const f = a.file || d.file;
        if (!f || !this.images.has(f)) ok = false;
      }
      if (!ok || !Object.keys(d.anims).length) continue;
      this.defs[key] = normalize(d);
      this.loaded++;
    }
    this.ready = true;
    return this;
  }

  loadImage(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const done = () => {
          this.images.set(file, img);
          resolve();
        };
        if (img.decode) img.decode().then(done, done);
        else done();
      };
      img.onerror = () => {
        this.failed.push(file);
        console.warn('[art] missing sprite sheet', file);
        resolve();
      };
      img.src = this.base + file + (this.version ? `?v=${this.version}` : '');
    });
  }

  has(key, anim) {
    const d = this.defs[key];
    return !!d && (!anim || !!d.anims[anim]);
  }

  // Picks the first of `names` the sprite defines (falls back to its first anim).
  pick(key, ...names) {
    const d = this.defs[key];
    if (!d) return '';
    for (const n of names) if (n && d.anims[n]) return n;
    return d.first;
  }

  // Length of a one-shot animation in seconds (0 if missing).
  duration(key, anim) {
    const d = this.defs[key];
    const a = d && d.anims[anim];
    return a ? a.frames / a.fps : 0;
  }

  // Draws one frame. (x, y) is the anchor in CSS px; `s` is CSS px per world unit.
  // opts: flip (mirror horizontally), rot (radians), sx/sy (squash), alpha, add (additive flash)
  draw(ctx, key, anim, t, x, y, s, opts) {
    const d = this.defs[key];
    if (!d) return false;
    const a = d.anims[anim] || d.anims[d.first];
    const img = this.images.get(a.file || d.file);
    let f = Math.floor(t * a.fps);
    f = a.loop ? ((f % a.frames) + a.frames) % a.frames : Math.min(a.frames - 1, Math.max(0, f));
    const fw = d.frame[0], fh = d.frame[1];
    const k = (s / this.pxPerUnit) * d.scale;
    let sx = k, sy = k;
    let flip = false, rot = 0, alpha = 1;
    if (opts) {
      if (opts.sx) sx *= opts.sx;
      if (opts.sy) sy *= opts.sy;
      flip = !!opts.flip;
      rot = opts.rot || 0;
      if (opts.alpha != null) alpha = opts.alpha;
    }
    if (d.facing === 'left') flip = !flip;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(flip ? -sx : sx, sy);
    if (alpha < 1) ctx.globalAlpha *= alpha;
    const ox = -d.anchor[0] * fw, oy = -d.anchor[1] * fh;
    ctx.drawImage(img, (a.col + f) * fw, a.row * fh, fw, fh, ox, oy, fw, fh);
    if (opts && opts.add) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= opts.add;
      ctx.drawImage(img, (a.col + f) * fw, a.row * fh, fw, fh, ox, oy, fw, fh);
    }
    ctx.restore();
    return true;
  }

  flag(key, name) {
    const d = this.defs[key];
    return !!(d && d[name]);
  }

  // Offset in world units from the anchor to a named attach point (e.g. where the
  // Chef's hat sits on his head). Null when the sprite doesn't define it.
  attach(key, name) {
    const d = this.defs[key];
    const p = d && d.attach && d.attach[name];
    if (!p) return null;
    const k = d.scale / this.pxPerUnit;
    return { dx: (p[0] - d.anchor[0]) * d.frame[0] * k, dy: (p[1] - d.anchor[1]) * d.frame[1] * k };
  }

  // World-unit height of a sprite above its anchor (for placing HP bars etc.).
  height(key) {
    const d = this.defs[key];
    return d ? (d.frame[1] * d.anchor[1] * d.scale) / this.pxPerUnit : 0;
  }
}

function normalize(d) {
  const anims = {};
  let first = '';
  for (const [name, a] of Object.entries(d.anims)) {
    anims[name] = {
      file: a.file || null,
      row: a.row | 0,
      col: a.col | 0,
      frames: Math.max(1, a.frames | 0),
      fps: a.fps || 12,
      loop: a.loop !== false,
    };
    if (!first) first = name;
  }
  return {
    file: d.file,
    frame: d.frame,
    anchor: d.anchor || [0.5, 0.5],
    facing: d.facing || 'right',
    scale: d.scale || 1,
    wobble: !!d.wobble,
    attach: d.attach || null, // named points in frame fractions, e.g. { "hat": [0.44, 0.24] }
    spin: !!d.spin, // projectiles: rotate continuously
    orient: !!d.orient, // projectiles: rotate to the direction of travel
    anims,
    first,
  };
}
