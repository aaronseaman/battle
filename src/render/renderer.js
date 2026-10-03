// Canvas2D renderer for the lane runner: a pseudo-3D reef road that narrows
// toward the horizon. Everything on the road is drawn far-to-near and scaled by
// depth. Sprite art comes from assets/art/manifest.json (see docs/ART_HANDOFF.md);
// anything not delivered falls back to placeholder clay shapes.
//
// Contract used by main.js:
//   new Renderer(canvas, game, settings, spriteBank)
//   resize() · setInsets({ top, bottom }) · setQuality(q) · onArtLoaded()
//   consume(eventQueue)    once per frame, before the queue is cleared: spawn VFX
//   render(frameDt, alpha) draw; alpha (0..1) interpolates between sim ticks
//   pxPerUnit              screen px per world unit at the school's line (for drag steering)
//
// Nothing in here mutates game state.

import { ROAD, SIM, BOSSES, BOSS_ATTACK, ENEMIES, SCHOOL } from '../config.js';
import { SCHOOL_OFFSETS, STAGE } from '../core/game.js';
import { SpriteBank } from './sprites.js';

const TAU = Math.PI * 2;
const PERSP = 560; // perspective distance: scale(z) = PERSP / (PERSP + z)
const GATE_H = 86; // gate panel height (world units)

// how big each kind of sprite is drawn (relative to its sheet at pxPerUnit 2)
const SIZE = { fish: 0.4, enemy: 0.95, boss: 1.0, buddy: 0.6, clam: 3.1, bullet: 1.1, buddyShot: 1.3, strike: 1.3 };

const C = {
  water1: '#0b4f73',
  water2: '#1689a8',
  bedDark: '#2f8f77',
  road: '#f7e2a8',
  roadDark: '#e8c98a',
  rim: '#ff8fa3',
  rimDark: '#cf5672',
  good: '45,140,255',
  bad: '255,70,80',
  ink: '#2a2440',
};

const ENEMY_COLORS = {
  jelly: '#ff8fd8', crab: '#ff5e3a', kraken: '#9b6bff', puffer: '#ffe14d', urchin: '#5b3f8c', eel: '#8fe04d',
  octoMini: '#c58cff', starMinion: '#ffc94d',
};
const BOSS_COLORS = { chef: '#c070ff', sharky: '#9fb2c8', queen: '#ff9a3c', kitty: '#ff86c8' };
const BUDDY_COLORS = { fish: '#ffb347', octopus: '#b06ee0', shark: '#8aa0b8', starfish: '#ff7a59', puffer: '#ffd84d', seahorse: '#ff9fc6', crab: '#ff5a4d' };

export const SKIN_COLORS = {
  classic: { body: '#ff8a1f', stripe: '#ffffff', fin: '#e0620a' },
  golden: { body: '#ffd23f', stripe: '#fff6c2', fin: '#e0a800' },
  neon: { body: '#2fd3ff', stripe: '#ff3d7f', fin: '#1b8fd1' },
  galaxy: { body: '#5b3cc4', stripe: '#ffd6ff', fin: '#2a1a73' },
};

export const BUDDY_ICONS = { fish: '🐠', octopus: '🐙', shark: '🦈', starfish: '⭐', puffer: '🐡', seahorse: '🌊', crab: '🦀' };

export class Renderer {
  constructor(canvas, game, settings, sprites = new SpriteBank()) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.g = game;
    this.settings = settings;
    this.sp = sprites;
    this.bg = document.createElement('canvas');
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.insets = { top: 0, bottom: 0 };
    this.quality = 1;
    this.a = 1;
    this.time = 0;
    this.at = 0;
    this.dirty = true;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.particles = [];
    this.freeParticles = [];
    this.rings = [];
    this.texts = [];
    this.corpses = [];
    this.draws = []; // reusable far-to-near draw list
    this.bossFx = { throwT: 9, summonT: 9 };
    this.labelBump = 0; // school counter pop
    this.schoolX = 0;
    this.horizon = 0;
    this.o = { flip: false, rot: 0, sx: 1, sy: 1, alpha: 1, add: 0 };
    // projection
    this.cx = 0;
    this.k = 1;
    this.hy = 0;
    this.gy = 0;
    this.pxPerUnit = 1;
  }

  setInsets(ins) {
    if (this.insets.top === ins.top && this.insets.bottom === ins.bottom) return;
    this.insets.top = ins.top;
    this.insets.bottom = ins.bottom;
    this.resize();
  }

  setQuality(q) {
    if (Math.abs(q - this.quality) < 0.01) return;
    this.quality = q;
    this.resize();
  }

  resize() {
    const c = this.canvas;
    const cssW = Math.max(1, c.clientWidth), cssH = Math.max(1, c.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1) * (this.quality < 1 ? 0.75 : 1);
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    const top = this.insets.top, bottom = cssH - this.insets.bottom;
    const h = Math.max(100, bottom - top);
    // the road's half-width at the school's line fills ~47% of the width (capped on wide screens)
    const halfPx = Math.min(cssW * 0.47, h * 0.42);
    this.cx = cssW / 2;
    this.k = halfPx / ROAD.half;
    this.hy = top - h * 0.1;
    this.gy = top + h * 0.82;
    this.pxPerUnit = this.k;
    this.dirty = true;
    this.buildBackground();
  }

  onArtLoaded() {
    this.buildBackground();
  }

  // ------------------------------------------------------------ projection

  sc(z) {
    if (z < -PERSP * 0.7) z = -PERSP * 0.7;
    return PERSP / (PERSP + z);
  }
  X(x, z) {
    return this.cx + x * this.k * this.sc(z);
  }
  Y(z) {
    return this.hy + (this.gy - this.hy) * this.sc(z);
  }
  U(z) {
    return this.k * this.sc(z);
  }

  opt(flip, sx, sy, rot, alpha, add) {
    const o = this.o;
    o.flip = flip;
    o.sx = sx;
    o.sy = sy;
    o.rot = rot;
    o.alpha = alpha;
    o.add = add;
    return o;
  }

  // ------------------------------------------------------------ background (cached)

  buildBackground() {
    const b = this.bg;
    b.width = this.canvas.width;
    b.height = this.canvas.height;
    const ctx = b.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.cssW, H = this.cssH;
    const horizon = this.Y(ROAD.view * 1.6);
    this.horizon = horizon;
    const grad = ctx.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, C.water1);
    grad.addColorStop(1, C.water2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, horizon + 2);
    // light shafts
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (const [x, w] of [[0.12, 0.08], [0.38, 0.12], [0.66, 0.07], [0.84, 0.1]]) {
      ctx.beginPath();
      ctx.moveTo(W * x, 0);
      ctx.lineTo(W * (x + w), 0);
      ctx.lineTo(W * (x + w - 0.1), horizon);
      ctx.lineTo(W * (x - 0.16), horizon);
      ctx.closePath();
      ctx.fill();
    }
    // distant reef silhouette on the horizon
    ctx.fillStyle = 'rgba(20,90,110,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= W; x += 12) ctx.lineTo(x, horizon - 8 - Math.abs(Math.sin(x * 0.031) * 14 + Math.sin(x * 0.11) * 5));
    ctx.lineTo(W, horizon);
    ctx.closePath();
    ctx.fill();
    // seabed below the horizon
    const bed = ctx.createLinearGradient(0, horizon, 0, H);
    bed.addColorStop(0, '#5cc2a5');
    bed.addColorStop(1, C.bedDark);
    ctx.fillStyle = bed;
    ctx.fillRect(0, horizon, W, H - horizon);
    // haze where the road meets the horizon
    const hz = ctx.createLinearGradient(0, horizon - 30, 0, horizon + 60);
    hz.addColorStop(0, 'rgba(127,227,224,0)');
    hz.addColorStop(0.5, 'rgba(127,227,224,0.55)');
    hz.addColorStop(1, 'rgba(127,227,224,0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, horizon - 30, W, 90);
  }

  // ------------------------------------------------------------ VFX from events

  consume(q) {
    const lowFx = this.quality < 1;
    const g = this.g;
    for (let i = 0; i < q.n; i++) {
      const e = q.items[i];
      switch (e.type) {
        case 'kill':
          if (!this.corpse('enemy.' + e.s, 'die', e.x, e.y, SIZE.enemy)) this.burst(e.x, e.y, 14, lowFx ? 4 : 9, ENEMY_COLORS[e.s] || '#fff', 120, 5);
          break;
        case 'gate':
        case 'prize': {
          const good = e.b === 1;
          const s = g.school;
          if (e.s === 'add' || e.s === 'mul') this.text(s.x, 30, `${e.a >= 0 ? '+' : '−'}${Math.abs(e.a)}`, good ? '#7dff9a' : '#ff6b6b', 2);
          else if (e.s === 'rate') this.text(s.x, 30, 'FIRE RATE UP!', '#ffe066', 1.4);
          else if (e.s === 'dmg') this.text(s.x, 30, 'POWER UP!', '#ffe066', 1.4);
          this.ring(s.x, 0, 20, 140, 0.45, good ? '#7dff9a' : '#ff6b6b');
          if (!good) this.shake(6);
          this.labelBump = 0.35;
          break;
        }
        case 'gate_bump':
          this.burst(e.x, e.y, GATE_H * 0.6, 3, '#ffffff', 80, 4);
          break;
        case 'clam_crack':
          this.corpse('fx.pop', '', e.x, e.y, 1.6);
          this.burst(e.x, e.y, 20, lowFx ? 6 : 14, '#fff1d0', 160, 6);
          break;
        case 'bite':
          this.text(e.x, 40, `−${e.a}`, '#ff5d5d', 1.5);
          this.burst(e.x, e.y, 20, lowFx ? 4 : 8, '#ff8a1f', 140, 5);
          this.shake(Math.min(12, 3 + e.a));
          this.labelBump = 0.35;
          break;
        case 'buddy_join':
        case 'buddy_up':
          this.ring(e.x, 0, 10, 70, 0.5, '#ffffff');
          this.text(e.x, 60, e.type === 'buddy_up' ? `${(e.s || '').toUpperCase()} Lv${e.a}!` : `+${(e.s || '').toUpperCase()}!`, '#ffe066', 1.3);
          this.corpse('fx.poof', '', e.x, 0, 1);
          break;
        case 'splash':
          this.ring(e.x, e.y, 10, e.a, 0.35, e.s === 'ink' ? '#2a2440' : '#bff7ff');
          break;
        case 'boss_spawn':
          this.shake(8);
          break;
        case 'boss_throw':
          this.bossFx.throwT = 0;
          break;
        case 'boss_summon':
          this.bossFx.summonT = 0;
          break;
        case 'strike_land':
          this.ring(e.x, 0, 10, e.a * 1.2, 0.4, e.s === 'swipe' ? '#ff86c8' : e.s === 'star' ? '#ffc94d' : '#2a2440');
          if (!this.corpse(e.s === 'ink' ? 'fx.ink' : 'fx.spark', '', e.x, 0, 1.2)) this.burst(e.x, 0, 10, 8, '#2a2440', 160, 5);
          if (e.b) this.shake(8);
          break;
        case 'dodge':
          this.text(e.x, 60, 'Dodged!', '#ffffff', 1.2);
          break;
        case 'boss_defeat':
          this.corpse('boss.' + e.s, 'die', e.x, e.y, SIZE.boss);
          this.corpse('fx.confetti', '', e.x, e.y, 2.2);
          this.burst(e.x, e.y, 60, lowFx ? 16 : 40, BOSS_COLORS[e.s] || '#fff', 320, 8);
          this.shake(14);
          break;
        case 'win':
          this.corpse('fx.confetti', '', g.school.x, 120, 2.6);
          break;
        case 'phase':
          if (e.s !== 'play') {
            this.texts.length = 0;
            this.rings.length = 0;
          }
          break;
      }
    }
  }

  corpse(key, anim, x, z, scale) {
    if (!this.sp.loaded || !this.sp.has(key)) return false;
    if (anim && !this.sp.has(key, anim)) return false;
    const a = anim || this.sp.pick(key, 'play');
    if (this.corpses.length > 40) this.corpses.shift();
    this.corpses.push({ key, anim: a, t: 0, dur: this.sp.duration(key, a) || 0.5, x, z, scale });
    return true;
  }

  shake(m) {
    if (!this.settings.shake) return;
    this.shakeMag = Math.max(this.shakeMag, m);
    this.shakeT = 0.3;
  }

  burst(x, z, h, n, color, speed, size) {
    const cap = this.quality < 1 ? 150 : 360;
    for (let i = 0; i < n && this.particles.length < cap; i++) {
      const p = this.freeParticles.pop() || {};
      const a = Math.random() * TAU, v = speed * (0.4 + Math.random() * 0.6);
      p.x = x;
      p.z = z;
      p.h = h;
      p.vx = Math.cos(a) * v;
      p.vz = Math.sin(a) * v;
      p.vh = 60 + Math.random() * 140;
      p.life = p.max = 0.45 + Math.random() * 0.35;
      p.color = color;
      p.size = size * (0.6 + Math.random() * 0.6);
      this.particles.push(p);
    }
  }

  ring(x, z, r0, r1, life, color) {
    if (this.rings.length > 30) return;
    this.rings.push({ x, z, r0, r1, life, max: life, color });
  }

  text(x, h, str, color, scale = 1) {
    if (this.texts.length > 24) this.texts.shift();
    this.texts.push({ x, h, str, color, life: 1.1, max: 1.1, scale });
  }

  // ------------------------------------------------------------ frame

  render(dt, alpha = 1) {
    const g = this.g, ctx = this.ctx;
    this.time += dt;
    this.a = g.phase === 'play' && !g.paused ? alpha : 1;
    this.at = this.settings.stopMotion ? Math.floor(g.clock * SIM.ANIM_FPS) / SIM.ANIM_FPS : g.clock;
    if (!g.paused) {
      this.bossFx.throwT += dt;
      this.bossFx.summonT += dt;
      if (this.labelBump > 0) this.labelBump -= dt;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    let sx = 0, sy = 0;
    if (this.shakeT > 0 && !g.paused) {
      this.shakeT -= dt;
      const m = this.shakeMag * (this.shakeT / 0.3);
      sx = (Math.random() - 0.5) * m;
      sy = (Math.random() - 0.5) * m;
      if (this.shakeT <= 0) this.shakeMag = 0;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, sx * this.dpr, sy * this.dpr);
    const fdt = g.paused ? 0 : dt;
    const d = this.scrollDist();
    this.drawRoad(d);
    this.drawDecor(d);
    this.drawShotsOnGround();
    this.drawWorld();
    this.drawCorpses(fdt);
    this.drawShotsInFlight();
    this.drawLabels();
    this.drawFx(fdt);
  }

  running() {
    const g = this.g;
    return g.phase === 'play' && g.stage === STAGE.RUN && !g.ending && !g.paused;
  }

  // distance travelled, interpolated between ticks (the title screen drifts slowly)
  scrollDist() {
    const g = this.g;
    if (g.phase === 'title') return g.clock * ROAD.speed * 0.35;
    return this.running() ? g.dist - ROAD.speed * SIM.DT * (1 - this.a) : g.dist;
  }

  drawRoad(d) {
    const ctx = this.ctx, H = ROAD.half;
    const zf = ROAD.view * 1.6, zn = -PERSP * 0.69;
    const quad = (x0, x1, z0, z1, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(this.X(x0, z0), this.Y(z0));
      ctx.lineTo(this.X(x1, z0), this.Y(z0));
      ctx.lineTo(this.X(x1, z1), this.Y(z1));
      ctx.lineTo(this.X(x0, z1), this.Y(z1));
      ctx.closePath();
      ctx.fill();
    };
    quad(-H, H, zn, zf, C.road);
    // sand ripples scrolling toward the school
    const step = 70;
    const off = d % step;
    for (let z = step - off - step; z < ROAD.view * 1.3; z += step) {
      ctx.globalAlpha = 0.5 * (1 - Math.max(0, z) / (ROAD.view * 1.3));
      quad(-H, H, z - 6, z + 6, C.roadDark);
    }
    // the middle line: where one gate ends and the other begins
    ctx.globalAlpha = 0.6;
    for (let z = 2 * step - (d % (2 * step)) - 2 * step; z < ROAD.view * 1.3; z += 2 * step) quad(-3, 3, z, z + step * 0.6, '#ffffff');
    ctx.globalAlpha = 1;
    // coral rims
    quad(-H - 16, -H, zn, zf, C.rimDark);
    quad(H, H + 16, zn, zf, C.rimDark);
    quad(-H - 10, -H, zn, zf, C.rim);
    quad(H, H + 10, zn, zf, C.rim);
  }

  // Kelp, coral and rocks along the roadside, scrolling with the road.
  drawDecor(d) {
    const ctx = this.ctx, step = 110;
    const first = Math.floor((d - PERSP * 0.6) / step);
    const last = Math.floor((d + ROAD.view * 1.3) / step);
    for (let i = last; i >= first; i--) {
      const z = i * step - d;
      for (const side of [-1, 1]) {
        const h = hash(i * 2 + (side > 0 ? 1 : 0));
        const x = side * (ROAD.half + 40 + h * 120);
        const U = this.U(z), X = this.X(x, z), Y = this.Y(z);
        if (Y < this.horizon - 4) continue;
        const kind = Math.floor(h * 97) % 3;
        if (kind === 0) {
          const tall = 4 + Math.floor(h * 5);
          for (let k = 0; k < tall; k++) {
            const sway = Math.sin(this.time * 1.6 + i + k * 0.6) * k * U * 1.2;
            blob(ctx, X + sway, Y - k * 16 * U, 8 * U, 11 * U, k % 2 ? '#2a8a52' : '#3fae6a', 0.2);
          }
        } else if (kind === 1) {
          const col = ['#ff9fb2', '#ffd36e', '#c9a6ff', '#7fd4ff'][Math.floor(h * 13) % 4];
          blob(ctx, X, Y - 10 * U, 22 * U, 16 * U, col, 0.3);
          blob(ctx, X - 14 * U, Y - 22 * U, 10 * U, 12 * U, col, 0.3);
          blob(ctx, X + 12 * U, Y - 26 * U, 9 * U, 13 * U, col, 0.3);
        } else {
          blob(ctx, X, Y - 6 * U, 18 * U, 10 * U, '#8a7f72', 0.25);
        }
      }
    }
  }

  // Red target circles where boss attacks will land (on the school's line).
  drawShotsOnGround() {
    const g = this.g, ctx = this.ctx;
    for (const sh of g.shots) {
      if (!sh.alive) continue;
      const k = sh.t / sh.dur;
      const x = this.X(sh.x, 0), y = this.Y(0), rx = sh.r * this.U(0), ry = rx * 0.32;
      ctx.fillStyle = `rgba(255,60,60,${0.15 + 0.3 * k})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,40,40,${0.6 + 0.4 * Math.sin(this.time * 18)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, y, rx * (1 - k * 0.5), ry * (1 - k * 0.5), 0, 0, TAU);
      ctx.stroke();
    }
    // Sharky's charge lane
    const b = g.boss;
    if (b && b.alive && b.type === 'sharky' && (b.state === 1 || b.state === 2)) {
      const w = BOSS_ATTACK.chargeW / 2;
      ctx.fillStyle = `rgba(255,60,60,${b.state === 2 || Math.floor(this.time * 8) % 2 ? 0.28 : 0.14})`;
      ctx.beginPath();
      ctx.moveTo(this.X(b.tx - w, 0), this.Y(0));
      ctx.lineTo(this.X(b.tx + w, 0), this.Y(0));
      ctx.lineTo(this.X(b.tx + w, b.z), this.Y(b.z));
      ctx.lineTo(this.X(b.tx - w, b.z), this.Y(b.z));
      ctx.closePath();
      ctx.fill();
    }
  }

  // Boss projectiles arcing from the boss to their target circles.
  drawShotsInFlight() {
    const g = this.g, ctx = this.ctx;
    for (const sh of g.shots) {
      if (!sh.alive || sh.kind === 'swipe') continue;
      const k = Math.min(1, sh.t / sh.dur);
      const z = sh.fromZ * (1 - k), x = sh.fromX + (sh.x - sh.fromX) * k;
      const h = 140 * 4 * k * (1 - k) + 40 * (1 - k);
      const U = this.U(z), X = this.X(x, z), Y = this.Y(z) - h * U;
      const key = sh.kind === 'star' ? 'strike.star' : 'strike.ink';
      if (this.sp.loaded && this.sp.draw(ctx, key, 'fly', sh.t, X, Y, U * SIZE.strike, this.opt(false, 1, 1, sh.kind === 'star' ? sh.t * 12 : 0, 1, 0))) continue;
      if (sh.kind === 'star') star(ctx, X, Y, 14 * U, 6 * U, sh.t * 12, '#ffc94d');
      else blob(ctx, X, Y, 14 * U, 12 * U, C.ink, 0.3);
    }
  }

  // Everything that stands on the road, sorted far to near.
  drawWorld() {
    const g = this.g, list = this.draws;
    let n = 0;
    const add = (z, kind, ref, i) => {
      let d = list[n];
      if (!d) d = list[n] = { z: 0, kind: '', ref: null, i: 0 };
      d.z = z;
      d.kind = kind;
      d.ref = ref;
      d.i = i;
      n++;
    };
    const a = this.a;
    for (const o of g.things) if (o.alive) add(o.pz + (o.z - o.pz) * a, 'thing', o, 0);
    for (const b of g.bullets) if (b.alive) add(b.pz + (b.z - b.pz) * a, 'bullet', b, 0);
    if (g.phase !== 'title') {
      const shown = Math.min(g.school.n, SCHOOL.shown);
      for (let i = 0; i < shown; i++) add(SCHOOL_OFFSETS[i].z, 'fish', null, i);
      for (let i = 0; i < g.school.buddies.length; i++) add(4, 'buddy', g.school.buddies[i], i);
    }
    // insertion sort by z, far first (the list is nearly sorted every frame)
    for (let i = 1; i < n; i++) {
      const d = list[i];
      let j = i - 1;
      while (j >= 0 && list[j].z < d.z) {
        list[j + 1] = list[j];
        j--;
      }
      list[j + 1] = d;
    }
    const sx = g.phase === 'play' ? g.school.px + (g.school.x - g.school.px) * a : g.school.x;
    this.schoolX = sx;
    for (let i = 0; i < n; i++) {
      const d = list[i];
      switch (d.kind) {
        case 'thing': this.drawThing(d.ref, d.z); break;
        case 'bullet': this.drawBullet(d.ref, d.z); break;
        case 'fish': this.drawFish(d.i, sx); break;
        case 'buddy': this.drawBuddy(d.ref, sx); break;
      }
    }
  }

  drawThing(o, z) {
    const x = o.px + (o.x - o.px) * this.a;
    switch (o.kind) {
      case 'gate': this.drawGate(o, x, z); break;
      case 'clam': this.drawClam(o, x, z); break;
      case 'enemy': this.drawEnemy(o, x, z); break;
      case 'boss': this.drawBoss(o, x, z); break;
    }
  }

  drawGate(o, x, z) {
    const ctx = this.ctx, U = this.U(z);
    const x0 = this.X(x - o.w, z), x1 = this.X(x + o.w, z), yb = this.Y(z), h = GATE_H * U;
    const e = o.gate;
    const good = e.type !== 'add' || e.value > 0;
    const rgb = good ? C.good : C.bad;
    ctx.fillStyle = `rgba(${rgb},${o.hitT > 0 ? 0.62 : 0.4})`;
    roundRect(ctx, x0, yb - h, x1 - x0, h, 6 * U);
    ctx.fill();
    ctx.lineWidth = Math.max(2, 4 * U);
    ctx.strokeStyle = `rgba(${rgb},0.95)`;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x0 + 6 * U, yb - h + 6 * U, (x1 - x0) * 0.22, h - 12 * U);
    const cx = (x0 + x1) / 2, cy = yb - h * 0.5;
    if (e.type === 'buddy') {
      const key = `tower.${e.buddy}.1`;
      if (this.sp.loaded && this.sp.has(key)) this.sp.draw(ctx, key, 'idle', this.at, cx, yb - 8 * U, U * 0.4, null);
      else bigText(ctx, BUDDY_ICONS[e.buddy] || '?', cx, cy, Math.max(10, 30 * U), '#fff');
      bigText(ctx, '+' + (e.buddy || '').toUpperCase(), cx, yb - h + 13 * U, Math.max(8, 15 * U), '#fff');
      return;
    }
    let lines;
    if (e.type === 'add') lines = [(e.value > 0 ? '+' : '−') + Math.abs(e.value)];
    else if (e.type === 'mul') lines = ['×' + e.value];
    else if (e.type === 'rate') lines = ['FIRE', 'RATE'];
    else lines = ['POWER', 'UP'];
    const size = Math.max(9, (lines.length === 1 ? 42 : 19) * U);
    lines.forEach((ln, i) => bigText(ctx, ln, cx, cy + (i - (lines.length - 1) / 2) * size * 1.05, size, '#fff'));
  }

  drawClam(o, x, z) {
    const ctx = this.ctx, U = this.U(z), X = this.X(x, z), Y = this.Y(z);
    shadow(ctx, X, Y, o.w * U, 10 * U);
    const flash = o.hitT > 0 ? 0.6 : 0;
    if (!(this.sp.loaded && this.sp.draw(ctx, 'pickup.shell', 'land', 0, X, Y + 4 * U, U * SIZE.clam, this.opt(false, 1, 1, 0, 1, flash)))) {
      blob(ctx, X, Y - 18 * U, 36 * U, 24 * U, flash ? '#ffffff' : '#ffd9c0', 0.4);
      ctx.strokeStyle = '#d98a6a';
      ctx.lineWidth = 2 * U;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(X, Y - 2 * U);
        ctx.lineTo(X + k * 14 * U, Y - 38 * U);
        ctx.stroke();
      }
    }
    // HP to crack it, and the prize inside
    const top = Y - 58 * U;
    bigText(ctx, String(Math.ceil(o.hp)), X, top, Math.max(10, 26 * U), '#ffffff');
    const p = o.gate;
    const prize = p.type === 'add' ? `+${p.value} 🐟` : p.type === 'mul' ? `×${p.value}` : p.type === 'rate' ? '🔥 RATE' : p.type === 'dmg' ? '💪 POWER' : `${BUDDY_ICONS[p.buddy] || ''} ${(p.buddy || '').toUpperCase()}`;
    bigText(ctx, prize, X, top - 24 * U, Math.max(8, 15 * U), '#ffe066');
  }

  drawEnemy(o, x, z) {
    const ctx = this.ctx, U = this.U(z), X = this.X(x, z), Y = this.Y(z);
    const def = ENEMIES[o.type];
    shadow(ctx, X, Y, def.r * U, def.r * 0.4 * U);
    const flip = this.schoolX < x;
    const flash = o.hitT > 0 ? 0.7 : 0;
    const bob = Math.abs(Math.sin(o.anim * 6)) * 4 * U;
    if (!(this.sp.loaded && this.sp.draw(ctx, 'enemy.' + o.type, 'move', o.anim, X, Y - bob, U * SIZE.enemy, this.opt(flip, 1, 1, 0, 1, flash)))) {
      blob(ctx, X, Y - def.r * U - bob, def.r * U, def.r * U, flash ? '#ffffff' : ENEMY_COLORS[o.type] || '#fff', 0.35);
      googly(ctx, X, Y - def.r * 1.2 * U - bob, def.r * 0.4 * U);
    }
    if (o.hp < o.maxHp) bar(ctx, X, Y - (def.r * 2.6 + 6) * U, 30 * U, Math.max(2, 4 * U), o.hp / o.maxHp);
  }

  drawBoss(o, x, z) {
    const ctx = this.ctx, U = this.U(z), X = this.X(x, z), Y = this.Y(z);
    const def = BOSSES[o.type];
    shadow(ctx, X, Y, def.r * 1.1 * U, def.r * 0.35 * U);
    const key = 'boss.' + o.type;
    const sp = this.sp, bf = this.bossFx;
    if (sp.loaded && sp.has(key)) {
      let anim, t = this.g.clock;
      const once = (name, since) => sp.has(key, name) && since < sp.duration(key, name);
      if (o.type === 'sharky') anim = sp.pick(key, o.state === 1 ? 'windup' : '', o.state === 2 ? 'charge' : '', o.state === 3 ? 'recover' : '', 'move');
      else if (once('throw', bf.throwT)) (anim = 'throw'), (t = bf.throwT);
      else if (once('swipe', bf.throwT)) (anim = 'swipe'), (t = bf.throwT);
      else if (once('summon', bf.summonT)) (anim = 'summon'), (t = bf.summonT);
      else anim = sp.pick(key, o.hp < o.maxHp * 0.5 ? 'move2' : '', o.type === 'queen' ? 'open' : '', 'move');
      sp.draw(ctx, key, anim, t, X, Y, U * SIZE.boss, this.opt(false, 1, 1, 0, 1, o.hitT > 0 ? 0.35 : 0));
      if (o.type === 'chef') {
        const ap = sp.attach(key, 'hat');
        if (ap) sp.draw(ctx, 'boss.chef.hat', 'idle', t, X + ap.dx * U * SIZE.boss, Y + ap.dy * U * SIZE.boss, U * SIZE.boss, null);
      }
    } else {
      blob(ctx, X, Y - def.r * U, def.r * U, def.r * 0.9 * U, o.hitT > 0 ? '#ffffff' : BOSS_COLORS[o.type], 0.35);
      googly(ctx, X, Y - def.r * 1.25 * U, def.r * 0.3 * U);
    }
  }

  drawBullet(b, z) {
    const ctx = this.ctx, U = this.U(z);
    const x = b.px + (b.x - b.px) * this.a;
    const X = this.X(x, z), Y = this.Y(z) - 22 * U;
    // a short streak so fast bubbles read as shots
    if (!b.buddy) {
      const z0 = Math.max(0, z - 60), U0 = this.U(z0);
      ctx.strokeStyle = 'rgba(220,250,255,0.55)';
      ctx.lineWidth = Math.max(1.5, 5 * U);
      ctx.beginPath();
      ctx.moveTo(this.X(x, z0), this.Y(z0) - 22 * U0);
      ctx.lineTo(X, Y);
      ctx.stroke();
    }
    const key = 'proj.' + b.kind;
    const s = b.buddy ? SIZE.buddyShot : SIZE.bullet;
    const rot = this.sp.flag(key, 'spin') ? b.t * 14 : this.sp.flag(key, 'orient') ? -Math.PI / 2 : 0;
    if (this.sp.loaded && this.sp.draw(ctx, key, 'fly', b.t, X, Y, U * s, this.opt(false, 1, 1, rot, 1, 0))) return;
    blob(ctx, X, Y, b.r * U, b.r * U, b.buddy ? '#ffd23f' : '#bdf4ff', 0.5);
  }

  drawFish(i, sx) {
    const g = this.g, ctx = this.ctx, s = g.school;
    const off = SCHOOL_OFFSETS[i];
    const z = off.z, U = this.U(z);
    const x = sx + off.x + Math.sin(this.time * 7 + i * 1.7) * 3;
    const X = this.X(x, z), Y = this.Y(z) - Math.abs(Math.sin(this.time * 5 + i)) * 3 * U;
    const hurt = s.hitT > 0;
    const skin = 'player.' + (g.meta.skin || 'classic');
    const key = this.sp.has(skin) ? skin : 'player.classic';
    if (this.sp.loaded && this.sp.has(key)) {
      shadow(ctx, X, Y, 11 * U, 3.5 * U);
      this.sp.draw(ctx, key, this.sp.pick(key, 'swim', 'idle'), this.at + i * 0.13, X, Y, U * SIZE.fish,
        this.opt(i % 5 === 3, 1, 1, 0, hurt && Math.floor(this.time * 20) % 2 ? 0.45 : 1, s.gainT > 0 ? 0.4 : 0));
      return;
    }
    const sk = SKIN_COLORS[g.meta.skin] || SKIN_COLORS.classic;
    shadow(ctx, X, Y, 12 * U, 4 * U);
    blob(ctx, X, Y - 10 * U, 13 * U, 9 * U, hurt ? '#ff5d5d' : sk.body, 0.35);
    ctx.fillStyle = sk.stripe;
    ctx.fillRect(X - 2 * U, Y - 18 * U, 4 * U, 16 * U);
    googly(ctx, X + 6 * U, Y - 12 * U, 3.5 * U);
  }

  drawBuddy(b, sx) {
    const g = this.g, ctx = this.ctx;
    const x = Math.max(-ROAD.half, Math.min(ROAD.half, sx + b.side * (g.schoolHalfW + 22)));
    const z = 4, U = this.U(z), X = this.X(x, z), Y = this.Y(z);
    shadow(ctx, X, Y, 20 * U, 7 * U);
    for (let l = b.level; l >= 1; l--) {
      const key = `tower.${b.type}.${l}`;
      if (!this.sp.loaded || !this.sp.has(key)) continue;
      const firing = this.sp.has(key, 'fire') && b.fireT < this.sp.duration(key, 'fire');
      this.sp.draw(ctx, key, firing ? 'fire' : 'idle', firing ? b.fireT : this.at, X, Y, U * SIZE.buddy * (1 + (b.level - l) * 0.1), this.opt(b.side < 0, 1, 1, 0, 1, 0));
      return;
    }
    blob(ctx, X, Y - 18 * U, 18 * U, 16 * U, BUDDY_COLORS[b.type] || '#fff', 0.35);
    googly(ctx, X, Y - 22 * U, 5 * U);
  }

  // The fish counter above the school and the boss's HP.
  drawLabels() {
    const g = this.g, ctx = this.ctx;
    if (g.phase === 'title') return;
    const s = g.school;
    const front = g.schoolFront;
    const X = this.X(this.schoolX, front), Y = this.Y(front) - 46 * this.U(front);
    const pop = 1 + Math.max(0, this.labelBump) * 0.9;
    const col = s.hitT > 0 ? '#e5484d' : s.gainT > 0 ? '#2fb85a' : '#2d6cff';
    badge(ctx, String(s.n), X, Y, 20 * pop, col);
    const b = g.boss;
    if (b && b.alive && b.z < ROAD.view) {
      const def = BOSSES[b.type];
      const z = b.pz + (b.z - b.pz) * this.a, U = this.U(z);
      const bx = this.X(b.px + (b.x - b.px) * this.a, z);
      const h = this.sp.loaded && this.sp.has('boss.' + b.type) ? this.sp.height('boss.' + b.type) * SIZE.boss : def.r * 2;
      const size = Math.max(15, 30 * U);
      const by = this.Y(z) - (h + 16) * U - size * 0.5;
      badge(ctx, String(Math.ceil(b.hp)), bx, by, size, '#e5484d');
      bar(ctx, bx, by + size * 0.85, Math.max(60, 120 * U), Math.max(4, 7 * U), b.hp / b.maxHp);
    }
  }

  drawCorpses(dt) {
    const list = this.corpses, scroll = this.running() ? ROAD.speed : 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      c.t += dt;
      c.z -= scroll * dt;
      if (c.t >= c.dur) {
        list.splice(i, 1);
        continue;
      }
      this.sp.draw(this.ctx, c.key, c.anim, c.t, this.X(c.x, c.z), this.Y(c.z), this.U(c.z) * c.scale, null);
    }
  }

  drawFx(dt) {
    const ctx = this.ctx;
    const scroll = this.running() ? ROAD.speed : 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        this.freeParticles.push(p);
        continue;
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt - scroll * dt;
      p.vh -= 500 * dt;
      p.h = Math.max(0, p.h + p.vh * dt);
      const U = this.U(p.z), r = p.size * U;
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(this.X(p.x, p.z) - r / 2, this.Y(p.z) - p.h * U - r / 2, r, r);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      r.z -= scroll * dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const k = 1 - r.life / r.max;
      const rad = (r.r0 + (r.r1 - r.r0) * k) * this.U(r.z);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(this.X(r.x, r.z), this.Y(r.z), rad, rad * 0.32, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const U0 = this.U(0);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      const k = 1 - t.life / t.max;
      ctx.globalAlpha = Math.min(1, t.life * 3);
      bigText(ctx, t.str, this.X(t.x, 0), this.Y(0) - (t.h + 70 + k * 60) * U0, 22 * t.scale, t.color);
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------ drawing helpers

function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function blob(ctx, x, y, rx, ry, color, gloss) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, TAU);
  ctx.fill();
  if (gloss > 0) {
    ctx.fillStyle = `rgba(255,255,255,${gloss})`;
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.3, y - ry * 0.35, Math.max(0.5, rx * 0.35), Math.max(0.5, ry * 0.22), -0.4, 0, TAU);
    ctx.fill();
  }
}

function shadow(ctx, x, y, rx, ry) {
  ctx.fillStyle = 'rgba(0,40,60,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, TAU);
  ctx.fill();
}

function googly(ctx, x, y, r) {
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + s * r * 1.1, y, Math.max(0.5, r), 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(x + s * r * 1.1, y + r * 0.2, Math.max(0.3, r * 0.5), 0, TAU);
    ctx.fill();
  }
}

function star(ctx, x, y, ro, ri, rot, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * TAU - Math.PI / 2, r = i % 2 ? ri : ro;
    if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

function bigText(ctx, str, x, y, size, color) {
  ctx.font = `900 ${Math.round(size)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.18);
  ctx.strokeStyle = 'rgba(30,15,50,0.85)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// A rounded number plate (the school counter, the boss's HP).
function badge(ctx, str, x, y, size, color) {
  ctx.font = `900 ${Math.round(size)}px system-ui, -apple-system, sans-serif`;
  const w = Math.max(size * 1.6, ctx.measureText(str).width + size * 0.9), h = size * 1.35;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, x - w / 2, y - h / 2 + 3, w, h, h / 2.6);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2.6);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(str, x, y + 1);
}

function bar(ctx, x, y, w, h, frac) {
  ctx.fillStyle = 'rgba(30,20,40,0.55)';
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = frac > 0.5 ? '#7ee081' : frac > 0.25 ? '#ffd23f' : '#ff5d5d';
  ctx.fillRect(x - w / 2, y, w * Math.max(0, frac), h);
}
