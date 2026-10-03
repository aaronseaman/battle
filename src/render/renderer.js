// Canvas2D renderer for the lane runner: a reef road seen from above and behind,
// mostly top-down with mild perspective (the road narrows a little toward the top
// and things up the road stay big enough to read, like the genre's reference
// layouts). Everything on the road is drawn far-to-near and scaled by depth. Sprite art comes from assets/art/manifest.json (see docs/ART_HANDOFF.md);
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
const PERSP = 1850; // perspective distance: scale(z) = PERSP / (PERSP + z) — large = nearly top-down
const GATE_H = 110; // gate panel height (world units)

// how big each kind of sprite is drawn (relative to its sheet at pxPerUnit 2)
const SIZE = { fish: 0.5, enemy: 1.25, boss: 1.25, buddy: 0.7, clam: 4.0, bullet: 1.2, buddyShot: 1.4, strike: 1.5 };

const C = {
  bedDark: '#147fce',
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
    // The environment is painted once per resize; live objects retain projection,
    // depth sorting, animation and hit feedback rather than becoming a screenshot.
    this.scene = new Image();
    this.scene.onload = () => { this.buildBackground(); this.dirty = true; };
    this.scene.src = 'assets/art/gloss/reef-lane.webp';
    this.gloss = new Image();
    this.gloss.onload = () => { this.dirty = true; };
    this.gloss.src = 'assets/art/gloss/atlas.webp';
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
    this.victoryFx = null;
    this.impactT = 0;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
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
    // the road is ~80% of the width at the school's line (capped on wide screens)
    const halfPx = Math.min(cssW * 0.4, h * 0.36);
    this.cx = cssW / 2;
    this.k = halfPx / ROAD.half;
    // the school's line sits low; the top of the play area shows the road ~0.9 view ahead,
    // so new things slide in from just above the top edge
    this.gy = top + h * 0.8;
    const sTop = this.sc(ROAD.view * 0.97), yTop = top + h * 0.01;
    this.hy = this.gy - (this.gy - yTop) / (1 - sTop);
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
    this.horizon = -1e9; // the camera looks down at the reef: no horizon on screen
    // seabed, a little deeper (darker) toward the top
    const bed = ctx.createLinearGradient(0, 0, 0, H);
    bed.addColorStop(0, '#087cce');
    bed.addColorStop(0.5, '#28d5ef');
    bed.addColorStop(1, C.bedDark);
    ctx.fillStyle = bed;
    ctx.fillRect(0, 0, W, H);
    if (this.scene.complete && this.scene.naturalWidth) {
      // Match the authored lane's rails to the actual gameplay projection at every
      // height, including short phones and wide desktop screens.
      const iw = this.scene.naturalWidth, ih = this.scene.naturalHeight;
      for (let y = 0; y < H; y += 2) {
        const t = y / H;
        const sourceHalf = iw * (0.22 + 0.23 * t);
        const scale = (y - this.hy) / (this.gy - this.hy);
        const destHalf = ROAD.half * this.k * scale;
        const ratio = destHalf / sourceHalf;
        const width = Math.max(W, iw * ratio);
        ctx.drawImage(this.scene, 0, t * ih, iw, Math.min(ih - t * ih, 2 * ih / H + 1),
          this.cx - width / 2, y, width, 3);
      }
      return;
    }
    // dappled light from the surface
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(rnd() * W, rnd() * H, 20 + rnd() * 60, 8 + rnd() * 20, rnd() * 3, 0, TAU);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------ VFX from events

  consume(q) {
    const lowFx = this.quality < 1;
    const g = this.g;
    for (let i = 0; i < q.n; i++) {
      const e = q.items[i];
      switch (e.type) {
        case 'hit':
          if (this.impactT <= 0) {
            this.burst(e.x, e.y, e.s === 'boss' ? 70 : 22, lowFx ? 2 : 4, '#b7f4ff', 100, 4);
            this.impactT = .055;
          }
          break;
        case 'kill':
          if (!this.corpse('enemy.' + e.s, 'die', e.x, e.y, SIZE.enemy)) this.burst(e.x, e.y, 14, lowFx ? 4 : 9, ENEMY_COLORS[e.s] || '#fff', 120, 5);
          break;
        case 'gate':
        case 'prize': {
          const good = e.b === 1;
          const s = g.school;
          if (e.s === 'add' || e.s === 'mul') this.text(s.x, 30, `${e.a >= 0 ? '+' : '−'}${Math.abs(e.a)}`, good ? '#7eeaff' : '#ff6b6b', 2);
          else if (e.s === 'rate') this.text(s.x, 30, 'FIRE RATE UP!', '#ffe066', 1.4);
          else if (e.s === 'dmg') this.text(s.x, 30, 'POWER UP!', '#ffe066', 1.4);
          this.ring(s.x, 0, 20, 140, 0.45, good ? '#7eeaff' : '#ff6b6b');
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
          this.ring(e.x, e.y, 15, 130, .75, '#d1eaff');
          this.shake(6);
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
          this.victoryFx = { key: 'boss.' + e.s, x: e.x, z: e.y, t: 0, coins: [] };
          for (let k = 0; k < (lowFx ? 8 : 16); k++) this.victoryFx.coins.push({ angle: k * 2.399, delay: k * .045 });
          this.ring(e.x, e.y, 12, 170, .85, '#a7efff');
          this.ring(e.x, e.y, 25, 140, .65, '#ffe274');
          for (const color of ['#51d9ff','#ff84dc','#ffe071']) this.burst(e.x,e.y,70,lowFx ? 6 : 12,color,240,7);
          this.shake(8);
          break;
        case 'win':
          this.labelBump = .35;
          break;
        case 'phase':
          if (e.s === 'play' || e.s === 'title') this.victoryFx = null;
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
      p.spin = Math.random() * TAU;
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
    this.drawVictory(fdt);
    this.impactT = Math.max(0, this.impactT - fdt);
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
    if (this.scene.complete && this.scene.naturalWidth) {
      this.drawCaustics(d);
      return;
    }
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

  // Low-opacity moving light patterns communicate forward motion without
  // obscuring the authored sand and the readable center of the lane.
  drawCaustics(d) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,225,0.16)';
    const step = 95;
    for (let z = -120 - d % step; z < ROAD.view; z += step) {
      const y = this.Y(z), half = ROAD.half * this.U(z);
      ctx.beginPath();
      ctx.moveTo(this.cx - half, y);
      ctx.bezierCurveTo(this.cx - half * .5, y - 8, this.cx + half * .4, y + 9, this.cx + half, y - 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  glossCell(index, x, y, w, h = w) {
    if (!this.gloss.complete || !this.gloss.naturalWidth) return false;
    const fw = this.gloss.naturalWidth / 4, fh = this.gloss.naturalHeight / 3;
    this.ctx.drawImage(this.gloss, (index % 4) * fw, Math.floor(index / 4) * fh, fw, fh, x, y, w, h);
    return true;
  }

  // A few live 3D props move with the level, outside collision space.
  drawDecor(d) {
    const ctx = this.ctx, step = 340;
    const first = Math.floor((d - 170) / step), last = Math.floor((d + ROAD.view) / step);
    for (let i = last; i >= first; i--) {
      const z = i * step - d;
      if (z < -180) continue;
      for (const side of [-1, 1]) {
        const n = hash(i * 2 + (side > 0 ? 1 : 0));
        const U = this.U(z), x = side * (ROAD.half + 32 + n * 30);
        const X = this.X(x, z), Y = this.Y(z), size = (46 + n * 16) * U;
        if (Y < this.insets.top + 42 || Y > this.cssH + size) continue;
        if (!this.glossCell(6 + Math.floor(n * 4), X - size / 2, Y - size * .8, size)) {
          blob(ctx, X, Y - 10 * U, 20 * U, 15 * U, ['#f361db', '#9c60ef', '#ffe05c', '#6195e5'][Math.floor(n * 4)], .5);
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
    const w = x1 - x0;
    shadow(ctx, (x0 + x1) / 2 + 5 * U, yb + 4 * U, w * .52, 9 * U);
    // Authored glossy frames are stretched to the same collision-panel bounds.
    if (!this.glossCell(good ? 10 : 11, x0 - 12 * U, yb - h - 12 * U, w + 24 * U, h + 24 * U)) {
      const fill = ctx.createLinearGradient(0, yb - h, 0, yb);
      fill.addColorStop(0, `rgba(${rgb},0.65)`);
      fill.addColorStop(.5, `rgba(${rgb},0.22)`);
      fill.addColorStop(1, `rgba(${rgb},0.6)`);
      ctx.fillStyle = fill;
      roundRect(ctx, x0, yb - h, w, h, 12 * U);
      ctx.fill();
      ctx.lineWidth = Math.max(3, 7 * U);
      ctx.strokeStyle = good ? '#17caff' : '#ff5e91';
      ctx.stroke();
      ctx.lineWidth = Math.max(1, 2 * U);
      ctx.strokeStyle = '#e3fbff';
      ctx.stroke();
    }
    if (o.hitT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      roundRect(ctx, x0 + 8 * U, yb - h + 8 * U, w - 16 * U, h - 16 * U, 8 * U);
      ctx.fill();
    }
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
      const idle = Math.sin(this.time * 3.8);
      const attack = Math.max(0, 1 - bf.throwT / .55);
      const summon = Math.max(0, 1 - bf.summonT / .65);
      const windup = o.type === 'sharky' && o.state === 1;
      const charge = o.type === 'sharky' && o.state === 2;
      const motion = this.reducedMotion ? 0 : 1;
      const stretch = (idle * .025 + attack * .1 - (windup ? .08 : 0) + (charge ? .12 : 0)) * motion;
      const tilt = (idle * .025 + attack * .1 + summon * .07 + (o.hitT > 0 ? Math.sin(this.time * 90) * .04 : 0)) * motion;
      const lift = (Math.abs(idle) * 5 + summon * 8 - (windup ? 4 : 0)) * U * motion;
      sp.draw(ctx, key, anim, t, X, Y - lift, U * SIZE.boss,
        this.opt(false, 1 + stretch, 1 - stretch * .7, tilt, 1, o.hitT > 0 ? 0.25 : 0));
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
    if (!b.buddy) {
      const r = Math.max(2.5, 6 * U);
      const glaze = ctx.createRadialGradient(X - r * .35, Y - r * .4, r * .05, X, Y, r);
      glaze.addColorStop(0, '#ffffff');
      glaze.addColorStop(.24, '#b9f7ff');
      glaze.addColorStop(.6, '#27c7f5');
      glaze.addColorStop(.86, '#1582d7');
      glaze.addColorStop(1, '#a7f3ff');
      ctx.fillStyle = glaze;
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, TAU);
      ctx.fill();
      return;
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
        this.opt(i % 5 === 3, 1 + Math.sin(this.time * 7 + i) * .025, 1 - Math.sin(this.time * 7 + i) * .025, Math.sin(this.time * 5 + i) * .035, hurt && Math.floor(this.time * 20) % 2 ? 0.45 : 1, s.gainT > 0 ? 0.4 : 0));
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
    const col = s.hitT > 0 ? '#f84c82' : s.gainT > 0 ? '#15caff' : '#167dff';
    badge(ctx, String(s.n), X, Y, 20 * pop, col);
    bigText(ctx, `${1 + g.meta.up.shots} ${g.meta.up.shots ? 'shots' : 'shot'}`, X, Y + 26, 11, '#e6fcff');
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

  drawVictory(dt) {
    const v = this.victoryFx;
    if (!v) return;
    v.t += dt;
    if (v.t > 2.8) { this.victoryFx = null; return; }
    const ctx = this.ctx, U = this.U(v.z), X = this.X(v.x,v.z), Y = this.Y(v.z);
    if (v.t < 1.25) {
      const k = Math.min(1,v.t / 1.25), scale = 1 - k * .7;
      const up = this.reducedMotion ? 0 : k * k * 130 * U;
      const poseT = v.t < .35 ? 0 : this.sp.duration(v.key,'die') * .75;
      this.sp.draw(ctx,v.key,'die',poseT,X,Y-up,U*SIZE.boss*scale,
        this.opt(false,1,1,this.reducedMotion ? 0 : Math.sin(k*8)*.1,1-k*k,0));
    }
    const targetX = this.cssW - 70, targetY = this.insets.top - 28;
    for (const coin of v.coins) {
      const t = (v.t - coin.delay) / 1.3;
      if (t < 0 || t > 1) continue;
      const k = t*t*(3-2*t), spread = Math.sin(t*Math.PI) * 100 * U;
      const x = X + (targetX-X)*k + Math.cos(coin.angle)*spread;
      const y = Y - 55*U + (targetY-Y+55*U)*k + Math.sin(coin.angle)*spread;
      const size = 24*(.7+Math.sin(t*Math.PI)*.3);
      ctx.globalAlpha = Math.min(1,(1-t)*6);
      this.glossCell(5,x-size/2,y-size/2,size);
    }
    ctx.globalAlpha = 1;
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
      const px = this.X(p.x,p.z), py = this.Y(p.z)-p.h*U;
      if (p.color === '#b7f4ff') {
        ctx.beginPath();ctx.arc(px,py,Math.max(.5,r*.6),0,TAU);ctx.fill();
      } else star(ctx,px,py,Math.max(.5,r),Math.max(.25,r*.4),p.spin+p.life*4,p.color);
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
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(Math.max(.5, rx), Math.max(.5, ry));
  const falloff = ctx.createRadialGradient(0, 0, .1, 0, 0, 1);
  falloff.addColorStop(0, 'rgba(30,56,96,0.24)');
  falloff.addColorStop(.6, 'rgba(30,56,96,0.12)');
  falloff.addColorStop(1, 'rgba(30,56,96,0)');
  ctx.fillStyle = falloff;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
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
  ctx.font = `900 ${Math.round(size)}px Fredoka, ui-rounded, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.18);
  ctx.strokeStyle = '#163391';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// A rounded number plate (the school counter, the boss's HP).
function badge(ctx, str, x, y, size, color) {
  ctx.font = `900 ${Math.round(size)}px Fredoka, ui-rounded, system-ui, -apple-system, sans-serif`;
  const w = Math.max(size * 1.6, ctx.measureText(str).width + size * 0.9), h = size * 1.35;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, x - w / 2, y - h / 2 + 3, w, h, h / 2.6);
  ctx.fill();
  const glaze = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  glaze.addColorStop(0, '#80e9ff');
  glaze.addColorStop(.25, color);
  glaze.addColorStop(1, '#264fe0');
  ctx.fillStyle = glaze;
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
  ctx.fillStyle = frac > 0.5 ? '#27caff' : frac > 0.25 ? '#ffd23f' : '#ff5d5d';
  ctx.fillRect(x - w / 2, y, w * Math.max(0, frac), h);
}
