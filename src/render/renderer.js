// Placeholder Canvas2D renderer.
//
// This file is deliberately self-contained so it can be replaced wholesale by a
// final art pass (Three.js clay diorama, sprite sheets, etc.). The contract a
// replacement must honour is documented in README.md ("Renderer contract"):
//   new Renderer(canvas, game, view, settings)
//   resize()                 — canvas size / DPR changed
//   consume(eventQueue)      — once per frame, before clear(): spawn VFX
//   render(frameDt)          — draw the current game state
//   screenToWorld(px, py)    — CSS-pixel -> world coords (for tapping sockets)
//   setInsets({top,bottom})  — HUD / touch-control space to keep clear
//   quality                  — 0.5..1, lowered automatically when frames are slow
//
// Nothing in here mutates game state.

import { WORLD, MAP, SIM, TOWERS } from '../config.js';
import { chefHatX } from '../core/bosses.js';
import { towerRange } from '../core/towers.js';

const TILT = 0.82; // y squash for the tilted-tabletop look
const TOP_MARGIN = 70; // world units above y=0 kept visible (spawn cave)
const TAU = Math.PI * 2;

const C = {
  bgDeep: '#0d5d73',
  waterTop: '#46dbd3',
  waterBot: '#1aa9c4',
  sand: '#f7e2a8',
  pathEdge: '#e2b971',
  path: '#ffeec2',
  socket: '#ff8fa3',
  socketRim: '#cf5672',
  socketHi: '#ffe066',
  rail: '#f0c987',
  railEdge: '#b98b4e',
  heart: '#ff6f91',
  heartRim: '#c43d64',
  ink: '#2a2440',
  outline: 'rgba(40,20,50,0.55)',
  white: '#ffffff',
  plus: '#ffd23f',
  minus: '#9b5cff',
  shield: 'rgba(120,230,255,0.55)',
  hpBack: 'rgba(30,20,40,0.55)',
  hpGood: '#7ee081',
  hpMid: '#ffd23f',
  hpBad: '#ff5d5d',
};

const TOWER_COLORS = {
  fish: '#ffb347', octopus: '#b06ee0', shark: '#8aa0b8', starfish: '#ff7a59',
  puffer: '#ffd84d', seahorse: '#ff9fc6', crab: '#ff5a4d',
};

const ENEMY_COLORS = {
  jelly: '#ff8fd8', jellyMini: '#ffb3e6', crab: '#ff5e3a', kraken: '#9b6bff', puffer: '#ffe14d',
  urchin: '#5b3f8c', eel: '#8fe04d', octoMini: '#c58cff', starMinion: '#ffc94d',
};

const BOSS_COLORS = { chef: '#c070ff', sharky: '#9fb2c8', queen: '#ff9a3c', kitty: '#ff86c8' };

export const SKIN_COLORS = {
  classic: { body: '#ff8a1f', stripe: '#ffffff', fin: '#e0620a' },
  golden: { body: '#ffd23f', stripe: '#fff6c2', fin: '#e0a800' },
  neon: { body: '#2fd3ff', stripe: '#ff3d7f', fin: '#1b8fd1' },
  galaxy: { body: '#5b3cc4', stripe: '#ffd6ff', fin: '#2a1a73' },
};

export class Renderer {
  constructor(canvas, game, view, settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.g = game;
    this.view = view;
    this.settings = settings;
    this.bg = document.createElement('canvas');
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.s = 1;
    this.ox = 0;
    this.oy = 0;
    this.insets = { top: 0, bottom: 0, left: 0, right: 0 };
    this.quality = 1;
    this.time = 0;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.particles = [];
    this.freeParticles = [];
    this.rings = [];
    this.lines = [];
    this.decals = [];
    this.texts = [];
    this.lastPhase = '';
  }

  setInsets(ins) {
    const i = this.insets;
    if (i.top === ins.top && i.bottom === ins.bottom && i.left === (ins.left || 0) && i.right === (ins.right || 0)) return;
    i.top = ins.top;
    i.bottom = ins.bottom;
    i.left = ins.left || 0;
    i.right = ins.right || 0;
    this.resize();
  }

  setQuality(q) {
    if (Math.abs(q - this.quality) < 0.01) return;
    this.quality = q;
    this.resize();
  }

  resize() {
    const c = this.canvas;
    const cssW = Math.max(1, c.clientWidth);
    const cssH = Math.max(1, c.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1) * (this.quality < 1 ? 0.75 : 1);
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    const ins = this.insets;
    const aw = cssW - ins.left - ins.right;
    const ah = cssH - ins.top - ins.bottom;
    const worldH = (WORLD.H + TOP_MARGIN) * TILT;
    this.s = Math.max(0.1, Math.min(aw / WORLD.W, ah / worldH));
    this.ox = ins.left + (aw - WORLD.W * this.s) / 2;
    this.oy = ins.top + (ah - worldH * this.s) / 2 + TOP_MARGIN * TILT * this.s;
    this.buildBackground();
  }

  px(x) {
    return this.ox + x * this.s;
  }
  py(y, z = 0) {
    return this.oy + (y * TILT - z) * this.s;
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.ox) / this.s, y: (sy - this.oy) / this.s / TILT };
  }

  // ------------------------------------------------------------ background

  buildBackground() {
    const b = this.bg;
    b.width = this.canvas.width;
    b.height = this.canvas.height;
    const ctx = b.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const s = this.s, W = WORLD.W;
    ctx.fillStyle = C.bgDeep;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // the diorama box
    const x0 = this.px(0), x1 = this.px(W);
    const y0 = this.py(-TOP_MARGIN), y1 = this.py(WORLD.H);
    const grad = ctx.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, C.waterTop);
    grad.addColorStop(1, C.waterBot);
    ctx.fillStyle = grad;
    roundRect(ctx, x0 - 10 * s, y0 - 10 * s, x1 - x0 + 20 * s, y1 - y0 + 20 * s, 28 * s);
    ctx.fill();
    ctx.lineWidth = 6 * s;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.stroke();

    // sandy floor at the bottom
    ctx.fillStyle = C.sand;
    ctx.beginPath();
    ctx.moveTo(x0, this.py(WORLD.RAIL_Y - 50));
    for (let x = 0; x <= W; x += 40) ctx.lineTo(this.px(x), this.py(WORLD.RAIL_Y - 50 + Math.sin(x * 0.05) * 8));
    ctx.lineTo(x1, y1);
    ctx.lineTo(x0, y1);
    ctx.closePath();
    ctx.fill();

    // deterministic clay pebbles and coral blobs (avoiding the path)
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const path = this.g.path;
    for (let i = 0; i < 46; i++) {
      const x = 20 + rnd() * (W - 40), y = -20 + rnd() * (WORLD.RAIL_Y - 120);
      if (path.closest(x, y).gap < 60) continue;
      let near = false;
      for (const so of MAP.sockets) if (Math.hypot(so[0] - x, so[1] - y) < 55) near = true;
      if (near) continue;
      const r = 6 + rnd() * 14;
      const col = ['#ff9fb2', '#ffd36e', '#9be7a0', '#7fd4ff', '#c9a6ff'][i % 5];
      blob(ctx, this.px(x), this.py(y), r * s, r * s * TILT, col, 0.25);
    }

    // the path, as a thick sandy ribbon
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const tracePath = () => {
      ctx.beginPath();
      ctx.moveTo(this.px(path.xs[0]), this.py(path.ys[0]));
      for (let i = 1; i < path.n; i++) ctx.lineTo(this.px(path.xs[i]), this.py(path.ys[i]));
    };
    tracePath();
    ctx.strokeStyle = C.pathEdge;
    ctx.lineWidth = 70 * s;
    ctx.stroke();
    tracePath();
    ctx.strokeStyle = C.path;
    ctx.lineWidth = 56 * s;
    ctx.stroke();
    tracePath();
    ctx.setLineDash([6 * s, 18 * s]);
    ctx.strokeStyle = 'rgba(226,185,113,0.6)';
    ctx.lineWidth = 4 * s;
    ctx.stroke();
    ctx.setLineDash([]);

    // spawn cave
    blob(ctx, this.px(path.xs[0]), this.py(-38), 52 * s, 34 * s, '#3b2f57', 0);
    blob(ctx, this.px(path.xs[0]), this.py(-30), 38 * s, 24 * s, '#160f26', 0);

    // sockets (coral cups)
    for (const so of MAP.sockets) {
      const x = this.px(so[0]), y = this.py(so[1]);
      blob(ctx, x, y + 4 * s, MAP.socketR * s * 1.05, MAP.socketR * s * TILT * 1.05, C.socketRim, 0);
      blob(ctx, x, y, MAP.socketR * s, MAP.socketR * s * TILT, C.socket, 0.3);
      blob(ctx, x, y + 2 * s, MAP.socketR * 0.6 * s, MAP.socketR * 0.6 * s * TILT, C.socketRim, 0);
    }

    // player rail
    const ry = this.py(WORLD.RAIL_Y + 22);
    ctx.fillStyle = C.railEdge;
    roundRect(ctx, this.px(WORLD.RAIL_MIN - 30), ry - 4 * s, this.px(WORLD.RAIL_MAX + 30) - this.px(WORLD.RAIL_MIN - 30), 16 * s, 8 * s);
    ctx.fill();
    ctx.fillStyle = C.rail;
    roundRect(ctx, this.px(WORLD.RAIL_MIN - 30), ry - 8 * s, this.px(WORLD.RAIL_MAX + 30) - this.px(WORLD.RAIL_MIN - 30), 14 * s, 7 * s);
    ctx.fill();

    // soft vignette (cheap stand-in for tilt-shift falloff)
    const vg = ctx.createRadialGradient(this.cssW / 2, this.cssH / 2, Math.min(this.cssW, this.cssH) * 0.35, this.cssW / 2, this.cssH / 2, Math.max(this.cssW, this.cssH) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,20,40,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  // ------------------------------------------------------------ VFX from events

  consume(q) {
    const g = this.g;
    const lowFx = this.quality < 1;
    for (let i = 0; i < q.n; i++) {
      const e = q.items[i];
      switch (e.type) {
        case 'hit':
          if (e.b === 1 && !lowFx) this.burst(e.x, e.y, 3, C.minus, 90, 3);
          break;
        case 'minus_hit':
          this.ring(e.x, e.y, 6, 22, 0.25, C.minus);
          break;
        case 'kill':
          this.burst(e.x, e.y, lowFx ? 4 : 9, ENEMY_COLORS[e.s] || '#fff', 160, 5);
          this.text(e.x, e.y - 20, `+${e.a}`, '#fff3b0');
          break;
        case 'split':
          this.ring(e.x, e.y, 8, 30, 0.3, ENEMY_COLORS.jelly);
          break;
        case 'explode':
        case 'tower_explode':
          this.ring(e.x, e.y, 10, e.a, 0.4, e.type === 'explode' ? '#ff7043' : TOWER_COLORS.puffer);
          this.burst(e.x, e.y, lowFx ? 6 : 14, '#ffd84d', 240, 6);
          this.shake(e.type === 'explode' ? 6 : 3);
          break;
        case 'heart_hit':
          this.burst(e.x, e.y - 10, 10, C.heart, 200, 6);
          this.text(e.x, e.y - 60, `-${Math.round(e.a)}`, '#ff5d5d');
          this.shake(Math.min(14, 4 + e.a * 0.3));
          break;
        case 'shield_pop':
          this.ring(e.x, e.y, 12, 40, 0.35, '#8ff0ff');
          this.burst(e.x, e.y, 6, '#bff7ff', 150, 4);
          break;
        case 'sad':
          this.text(e.x, e.y - 24, 'sad…', '#9fd3ff');
          break;
        case 'crack':
          this.burst(e.x, e.y, 8, '#3a2a5c', 180, 4);
          this.text(e.x, e.y - 24, 'CRACK!', '#ffffff');
          break;
        case 'plus_tower':
        case 'plus_heart':
          this.burst(e.x, e.y, 8, C.plus, 120, 4);
          this.ring(e.x, e.y, 10, 44, 0.4, C.plus);
          if (e.a >= 1) this.text(e.x, e.y - 30, `+${Math.round(e.a)}`, '#c6ff8a');
          break;
        case 'zap':
          this.line(e.x, e.y, e.a, e.b, 0.2, '#fff36b');
          break;
        case 'grab':
          this.line(e.a, e.b, e.x, e.y, 0.5, '#9b6bff');
          this.text(e.x, e.y - 30, 'grabbed!', '#e2c6ff');
          break;
        case 'tentacle_grab':
          this.line(e.x, e.y, e.a, e.b, 0.4, TOWER_COLORS.octopus);
          break;
        case 'chomp':
          this.burst(e.x, e.y, lowFx ? 2 : 5, '#ffffff', 140, 4);
          break;
        case 'ink_splash':
          this.decal(e.x, e.y, e.a * 0.8, 1.2);
          break;
        case 'pulse':
          this.ring(e.x, e.y, 20, e.a, 0.45, '#ff6bd5');
          break;
        case 'pinch_steal':
          this.text(e.x, e.y - 18, `+${e.a}`, '#fff3b0');
          break;
        case 'steal':
          this.text(e.x, e.y - 24, `-${e.a} shells!`, '#ff9a9a');
          break;
        case 'recover':
          this.text(e.x, e.y - 30, `+${e.a} back!`, '#fff3b0');
          break;
        case 'crab_escape':
          if (e.a > 0) this.text(e.x, e.y + 10, `lost ${e.a}`, '#ff9a9a');
          break;
        case 'pickup':
          this.burst(e.x, e.y, 4, '#fff3b0', 90, 3);
          break;
        case 'player_hit':
          this.burst(e.x, e.y, 12, '#ff8a1f', 220, 6);
          if (e.b > 0) this.text(e.x, e.y - 50, `-${e.b} shells`, '#ff9a9a');
          this.shake(8);
          break;
        case 'player_respawn':
          this.ring(e.x, e.y, 10, 50, 0.4, '#ffffff');
          break;
        case 'tower_place':
        case 'tower_upgrade':
        case 'tower_spat':
          this.ring(e.x, e.y, 10, 60, 0.5, '#ffffff');
          this.burst(e.x, e.y, 10, TOWER_COLORS[e.s] || '#fff', 180, 5);
          if (e.type === 'tower_spat') this.text(e.x, e.y - 30, 'ptoo!', '#ffffff');
          break;
        case 'tower_sell':
          this.burst(e.x, e.y, 8, '#fff3b0', 160, 4);
          this.text(e.x, e.y - 20, `+${e.a}`, '#fff3b0');
          break;
        case 'tower_broken':
          this.burst(e.x, e.y, 8, '#777', 160, 5);
          this.text(e.x, e.y - 30, 'broken!', '#ffb0b0');
          break;
        case 'tower_revived':
          this.text(e.x, e.y - 30, 'back!', '#c6ff8a');
          break;
        case 'eaten':
          this.burst(e.x, e.y, 16, TOWER_COLORS[e.s] || '#fff', 260, 6);
          this.text(e.x, e.y - 30, 'CHOMP!', '#ffffff');
          this.shake(10);
          break;
        case 'weak_hit':
          this.burst(e.x, e.y, 6, '#ffffff', 160, 4);
          this.text(e.x, e.y - 10, 'HAT!', '#fff36b');
          break;
        case 'boss_spawn':
          this.shake(10);
          break;
        case 'boss_phase':
          this.text(e.x, e.y - 80, 'PHASE UP!', '#ffffff', 1.6);
          this.shake(8);
          break;
        case 'boss_windup':
          this.text(e.x, e.y - 70, 'Grrr…', '#ffffff');
          break;
        case 'boss_stunned':
          this.text(e.x, e.y - 70, 'Stunned!', '#fff36b');
          break;
        case 'boss_open':
          this.text(e.x, e.y - 80, 'Arms open!', '#fff36b');
          break;
        case 'purr':
          this.text(e.x, e.y - 90, 'Purr shield!', '#8ff0ff');
          break;
        case 'boss_exposed':
          this.text(e.x, e.y - 90, 'EXPOSED!', '#fff36b', 1.4);
          this.ring(e.x, e.y, 30, 120, 0.5, C.plus);
          break;
        case 'boss_lap':
          this.text(g.heart.x, g.heart.y - 90, 'It came back angrier!', '#ff9a9a', 1.6);
          break;
        case 'boss_defeat':
          this.burst(e.x, e.y, 40, BOSS_COLORS[e.s] || '#fff', 320, 8);
          this.ring(e.x, e.y, 30, 200, 0.8, '#ffffff');
          this.shake(14);
          break;
        case 'tentacle_break':
          this.burst(e.x, e.y, 10, BOSS_COLORS.kitty, 200, 5);
          break;
        case 'reef_wash':
          this.ring(WORLD.W / 2, WORLD.RAIL_Y, 40, 1100, 0.9, '#bff7ff');
          break;
        case 'strike_land':
          if (e.s === 'ink') this.decal(e.x, e.y, e.a, 2);
          else if (e.s === 'swipe') this.ring(e.x, e.y, 20, e.a, 0.35, BOSS_COLORS.kitty);
          else this.burst(e.x, e.y, 5, e.s === 'spark' ? '#fff36b' : '#ffc94d', 150, 4);
          break;
      }
    }
  }

  shake(m) {
    if (!this.settings.shake) return;
    this.shakeMag = Math.max(this.shakeMag, m);
    this.shakeT = 0.3;
  }

  burst(x, y, n, color, speed, size) {
    const cap = this.quality < 1 ? 150 : 400;
    for (let i = 0; i < n && this.particles.length < cap; i++) {
      const p = this.freeParticles.pop() || {};
      const a = Math.random() * TAU, v = speed * (0.4 + Math.random() * 0.6);
      p.x = x;
      p.y = y;
      p.z = 6;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.vz = 80 + Math.random() * 160;
      p.life = p.max = 0.45 + Math.random() * 0.4;
      p.color = color;
      p.size = size * (0.6 + Math.random() * 0.6);
      this.particles.push(p);
    }
  }

  ring(x, y, r0, r1, life, color) {
    if (this.rings.length > 40) return;
    this.rings.push({ x, y, r0, r1, life, max: life, color });
  }

  line(x1, y1, x2, y2, life, color) {
    if (this.lines.length > 40) return;
    this.lines.push({ x1, y1, x2, y2, life, max: life, color });
  }

  decal(x, y, r, life) {
    if (this.decals.length > 30) this.decals.shift();
    this.decals.push({ x, y, r, life, max: life });
  }

  text(x, y, str, color, scale = 1) {
    if (this.texts.length > 40) this.texts.shift();
    this.texts.push({ x, y, str, color, life: 1, max: 1, scale });
  }

  // ------------------------------------------------------------ frame

  render(dt) {
    const g = this.g, ctx = this.ctx;
    this.time += dt;
    // stop-motion: wobble animations step at 12 fps, positions stay smooth
    const at = this.settings.stopMotion ? Math.floor(g.clock * SIM.ANIM_FPS) / SIM.ANIM_FPS : g.clock;
    this.at = at;

    if (g.phase !== this.lastPhase) {
      this.lastPhase = g.phase;
      if (g.phase !== 'combat') {
        this.decals.length = 0;
        this.lines.length = 0;
        if (g.phase !== 'waveEnd' && g.phase !== 'victory' && g.phase !== 'defeat') this.texts.length = 0;
      }
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

    this.drawDecals(dt);
    this.drawSocketsOverlay();
    this.drawStrikeTelegraphs();
    this.drawPickups();
    this.drawEnemies();
    this.drawTowers();
    this.drawTentacles();
    this.drawHeart();
    this.drawProjectiles();
    this.drawStrikes();
    this.drawPlayer();
    this.drawFx(g.paused ? 0 : dt);
  }

  drawDecals(dt) {
    const ctx = this.ctx;
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.decals.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.min(0.5, d.life / d.max);
      blob(ctx, this.px(d.x), this.py(d.y), d.r * this.s, d.r * this.s * TILT, C.ink, 0);
    }
    ctx.globalAlpha = 1;
  }

  // range rings + selection highlights during placement / build
  drawSocketsOverlay() {
    const g = this.g, v = this.view, ctx = this.ctx, s = this.s;
    const building = g.phase === 'place' || g.phase === 'build';
    if (building) {
      for (const so of g.sockets) {
        if (so.tower) continue;
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
        if (g.phase === 'place') {
          ctx.globalAlpha = 0.25 + 0.25 * pulse;
          ring2(ctx, this.px(so.x), this.py(so.y), MAP.socketR * s * 1.25, MAP.socketR * s * 1.25 * TILT, C.white, 3 * s);
          ctx.globalAlpha = 1;
        }
      }
    }
    const sel = v.focusSocket;
    if (sel >= 0 && (building || v.showFocusInCombat)) {
      const so = g.sockets[sel];
      if (so) {
        let range = 0;
        if (so.tower) range = towerRange(g, so.tower);
        else if (v.previewType) range = TOWERS[v.previewType].levels[0].range * (g.fork.rangeMul || 1);
        if (range > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath();
          ctx.ellipse(this.px(so.x), this.py(so.y), range * s, range * s * TILT, 0, 0, TAU);
          ctx.fill();
          ring2(ctx, this.px(so.x), this.py(so.y), range * s, range * s * TILT, 'rgba(255,255,255,0.7)', 2 * s);
        }
        const bob = Math.sin(this.time * 6) * 4;
        ring2(ctx, this.px(so.x), this.py(so.y), MAP.socketR * s * 1.35, MAP.socketR * s * 1.35 * TILT, C.socketHi, 4 * s);
        // pointer arrow
        ctx.fillStyle = C.socketHi;
        const ax = this.px(so.x), ay = this.py(so.y, 70 + bob);
        ctx.beginPath();
        ctx.moveTo(ax - 10 * s, ay - 12 * s);
        ctx.lineTo(ax + 10 * s, ay - 12 * s);
        ctx.lineTo(ax, ay + 4 * s);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Plus Power rings in combat
    if (g.phase === 'combat') {
      for (const t of g.towers) {
        if (t.plusT <= 0) continue;
        ctx.globalAlpha = 0.35 + 0.2 * Math.sin(this.time * 10);
        const r = towerRange(g, t);
        ring2(ctx, this.px(t.x), this.py(t.y), r * s, r * s * TILT, C.plus, 2 * s);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawStrikeTelegraphs() {
    const g = this.g, ctx = this.ctx, s = this.s;
    for (const st of g.strikes) {
      if (!st.alive) continue;
      const k = st.t / st.dur;
      const col = st.kind === 'swipe' ? 'rgba(255,90,140,' : st.hitsPlayer ? 'rgba(255,60,60,' : 'rgba(40,30,70,';
      ctx.fillStyle = col + (0.15 + 0.3 * k) + ')';
      ctx.beginPath();
      ctx.ellipse(this.px(st.tx), this.py(st.ty), st.r * s, st.r * s * TILT, 0, 0, TAU);
      ctx.fill();
      ring2(ctx, this.px(st.tx), this.py(st.ty), st.r * s * (1 - k * 0.6), st.r * s * TILT * (1 - k * 0.6), col + '0.9)', 2 * s);
    }
  }

  drawPickups() {
    const g = this.g, ctx = this.ctx, s = this.s;
    for (const p of g.pickups) {
      if (!p.alive) continue;
      const fade = p.landed && p.t > 5 ? (Math.floor(p.t * 8) % 2 ? 0.3 : 1) : 1;
      ctx.globalAlpha = fade;
      const x = this.px(p.x), y = this.py(p.y, 4 + Math.sin(p.phase * 4) * 2);
      shellShape(ctx, x, y, 9 * s, '#fff1d0', '#e8a96a');
    }
    ctx.globalAlpha = 1;
  }

  drawEnemies() {
    const g = this.g, ctx = this.ctx, s = this.s, at = this.at;
    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (!e.alive) continue;
      const x = this.px(e.x), y = this.py(e.y, e.z);
      const r = e.r * s;
      // ground shadow
      ctx.fillStyle = 'rgba(0,40,60,0.22)';
      ctx.beginPath();
      ctx.ellipse(x, this.py(e.y) + r * 0.5, r * 0.9, r * 0.4, 0, 0, TAU);
      ctx.fill();

      if (e.bossId) {
        this.drawBoss(e, x, y, r);
        continue;
      }
      const wob = Math.sin(at * 9 + e.anim) * 0.08;
      let col = ENEMY_COLORS[e.type] || '#fff';
      if (e.sad) col = mix(col, '#7fa8ff', 0.45);
      if (e.hitT > 0) col = '#ffffff';
      const rx = r * (1 + wob), ry = r * TILT * (1 - wob) * 1.1;
      switch (e.type) {
        case 'urchin':
          if (!e.cracked) spikes(ctx, x, y, r * 1.45, 10, at * 0.5, '#3a2a5c', s);
          break;
        case 'puffer':
          if (e.state === 1) spikes(ctx, x, y, r * 1.3, 12, 0, '#e0a800', s);
          break;
        case 'eel': {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(e.angle + (e.dir < 0 ? Math.PI : 0));
          ctx.scale(1, TILT);
          blob(ctx, -r * 0.9, Math.sin(at * 12) * r * 0.3, r * 0.9, r * 0.5, mix(col, '#000', 0.15), 0);
          ctx.restore();
          break;
        }
        case 'kraken':
        case 'octoMini':
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * TAU + Math.sin(at * 6 + k) * 0.3 + Math.PI / 4;
            blob(ctx, x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.7 + r * 0.3, r * 0.35, r * 0.28, mix(col, '#000', 0.15), 0);
          }
          break;
        case 'crab':
          blob(ctx, x - r * 1.05, y - r * 0.2, r * 0.45, r * 0.38, mix(col, '#000', 0.1), 0);
          blob(ctx, x + r * 1.05, y - r * 0.2, r * 0.45, r * 0.38, mix(col, '#000', 0.1), 0);
          break;
      }
      if (e.type === 'starMinion') star(ctx, x, y, r * 1.3, r * 0.6, at * 3, col);
      else blob(ctx, x, y, rx, ry, col, 0.35);
      if (e.type === 'jelly' || e.type === 'jellyMini') {
        ctx.strokeStyle = mix(col, '#000', 0.2);
        ctx.lineWidth = 2 * s;
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(x + k * r * 0.5, y + ry * 0.6);
          ctx.quadraticCurveTo(x + k * r * 0.5 + Math.sin(at * 8 + k) * 4 * s, y + ry * 1.2, x + k * r * 0.5, y + ry * 1.7);
          ctx.stroke();
        }
      }
      if (e.type === 'urchin' && e.cracked) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.5, y - r * 0.4);
        ctx.lineTo(x, y);
        ctx.lineTo(x + r * 0.3, y - r * 0.6);
        ctx.stroke();
      }
      googly(ctx, x, y - ry * 0.25, r * 0.36, e.angle, at + e.anim, e.sad);
      if (e.carry > 0) shellShape(ctx, x, y - r * 1.3, 7 * s, '#fff1d0', '#e8a96a');
      this.drawEnemyStatus(e, x, y, r);
    }
  }

  drawEnemyStatus(e, x, y, r) {
    const ctx = this.ctx, s = this.s;
    if (e.shield > 0) {
      ctx.fillStyle = 'rgba(140,235,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.45, r * 1.45 * TILT, 0, 0, TAU);
      ctx.fill();
      ring2(ctx, x, y, r * 1.45, r * 1.45 * TILT, C.shield, 2.5 * s);
    }
    if (e.minus > 0) {
      ctx.fillStyle = C.minus;
      for (let k = 0; k < e.minus; k++) {
        ctx.beginPath();
        ctx.arc(x - (e.minus - 1) * 4 * s + k * 8 * s, y + r * 1.15, 3 * s, 0, TAU);
        ctx.fill();
      }
    }
    if (e.stunT > 0) {
      ctx.fillStyle = '#fff36b';
      for (let k = 0; k < 3; k++) {
        const a = this.time * 6 + (k / 3) * TAU;
        star(ctx, x + Math.cos(a) * r, y - r * 1.2 + Math.sin(a) * r * 0.3, 5 * s, 2.2 * s, 0, '#fff36b');
      }
    }
    if (e.heldT > 0) ring2(ctx, x, y, r * 1.1, r * 0.8, TOWER_COLORS.octopus, 4 * s);
    if (e.slowT > 0 && e.slow > 0) {
      ctx.fillStyle = 'rgba(40,30,70,0.6)';
      ctx.beginPath();
      ctx.arc(x + r * 0.6, y + r * 0.6, 3 * s, 0, TAU);
      ctx.arc(x - r * 0.5, y + r * 0.7, 2.5 * s, 0, TAU);
      ctx.fill();
    }
    if (e.hp < e.maxHp) bar(ctx, x, y - r * 1.25 - 6 * s, r * 2, 4 * s, e.hp / e.maxHp);
  }

  drawBoss(e, x, y, r) {
    const ctx = this.ctx, s = this.s, at = this.at;
    let col = BOSS_COLORS[e.bossId];
    if (e.hitT > 0) col = mix(col, '#ffffff', 0.6);
    const wob = Math.sin(at * 5) * 0.05;
    switch (e.bossId) {
      case 'chef': {
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + Math.sin(at * 4 + k) * 0.25;
          blob(ctx, x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.6 + r * 0.35, r * 0.3, r * 0.22, mix(col, '#000', 0.2), 0);
        }
        blob(ctx, x, y, r * (1 + wob), r * TILT * (1 - wob) * 1.05, col, 0.35);
        googly(ctx, x, y, r * 0.3, Math.PI / 2, at, false);
        // the hat — Minus bubbles hitting it deal triple damage
        const hx = this.px(chefHatX(e));
        const hy = y - r * 0.95;
        blob(ctx, hx, hy + r * 0.1, r * 0.42, r * 0.16, '#f2f2f2', 0);
        blob(ctx, hx, hy - r * 0.25, r * 0.38, r * 0.32, '#ffffff', 0.4);
        if (Math.floor(this.time * 3) % 2) ring2(ctx, hx, hy - r * 0.15, r * 0.5, r * 0.42, '#fff36b', 2 * s);
        break;
      }
      case 'sharky': {
        const charging = e.state === 2, winding = e.state === 1;
        const stretch = charging ? 1.25 : winding ? 0.9 : 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(e.angle);
        ctx.scale(stretch, TILT / stretch);
        blob(ctx, -r * 1.1, 0, r * 0.45, r * 0.35, mix(col, '#000', 0.2), 0);
        blob(ctx, 0, 0, r * 1.05, r * 0.8, winding && Math.floor(this.time * 10) % 2 ? '#ff8a8a' : col, 0.3);
        blob(ctx, 0, -r * 0.7, r * 0.3, r * 0.25, mix(col, '#000', 0.2), 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(r * 0.55, -r * 0.3, r * 0.35, r * 0.6);
        ctx.strokeStyle = '#9aa';
        ctx.lineWidth = 2 * s;
        ctx.strokeRect(r * 0.55, -r * 0.3, r * 0.35, r * 0.6);
        ctx.restore();
        googly(ctx, x, y - r * 0.2, r * 0.28, e.angle, at, false);
        break;
      }
      case 'queen': {
        const open = e.state === 1;
        const inner = open ? r * 0.45 : r * 0.7;
        const outer = open ? r * 1.35 : r * 1.0;
        star(ctx, x, y, outer, inner, at * (open ? 0.5 : 2), col);
        blob(ctx, x, y, inner * 0.8, inner * 0.7, mix(col, '#fff', 0.2), 0.3);
        if (!open) ring2(ctx, x, y, r * 1.2, r * 1.2 * TILT, C.shield, 4 * s);
        // crown
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(x - r * 0.35, y - inner * 0.6);
        ctx.lineTo(x - r * 0.35, y - inner * 0.6 - r * 0.35);
        ctx.lineTo(x - r * 0.12, y - inner * 0.6 - r * 0.18);
        ctx.lineTo(x, y - inner * 0.6 - r * 0.42);
        ctx.lineTo(x + r * 0.12, y - inner * 0.6 - r * 0.18);
        ctx.lineTo(x + r * 0.35, y - inner * 0.6 - r * 0.35);
        ctx.lineTo(x + r * 0.35, y - inner * 0.6);
        ctx.closePath();
        ctx.fill();
        googly(ctx, x, y, r * 0.22, Math.PI / 2, at, false);
        break;
      }
      case 'kitty': {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + Math.sin(at * 3 + k) * 0.3;
          blob(ctx, x + Math.cos(a) * r * 1.0, y + Math.sin(a) * r * 0.65 + r * 0.3, r * 0.28, r * 0.2, mix(col, '#000', 0.2), 0);
        }
        // ears
        ctx.fillStyle = mix(col, '#000', 0.1);
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x + sgn * r * 0.75, y - r * 0.35);
          ctx.lineTo(x + sgn * r * 0.55, y - r * 1.1);
          ctx.lineTo(x + sgn * r * 0.2, y - r * 0.6);
          ctx.closePath();
          ctx.fill();
        }
        blob(ctx, x, y, r * (1 + wob), r * TILT * (1 - wob), col, 0.35);
        googly(ctx, x, y - r * 0.15, r * 0.25, Math.PI / 2, at, false);
        if (e.shield > 0) {
          ctx.fillStyle = 'rgba(140,235,255,0.2)';
          ctx.beginPath();
          ctx.ellipse(x, y, r * 1.4, r * 1.4 * TILT, 0, 0, TAU);
          ctx.fill();
          ring2(ctx, x, y, r * 1.4, r * 1.4 * TILT, C.shield, 4 * s);
        }
        if (e.exposedT > 0) ring2(ctx, x, y, r * 1.2, r * 1.2 * TILT, C.plus, 5 * s);
        break;
      }
    }
    if (e.stunT > 0) {
      for (let k = 0; k < 4; k++) {
        const a = this.time * 5 + (k / 4) * TAU;
        star(ctx, x + Math.cos(a) * r, y - r * 1.2 + Math.sin(a) * r * 0.3, 7 * s, 3 * s, 0, '#fff36b');
      }
    }
    if (e.minus > 0) {
      ctx.fillStyle = C.minus;
      for (let k = 0; k < e.minus; k++) {
        ctx.beginPath();
        ctx.arc(x - (e.minus - 1) * 5 * s + k * 10 * s, y + r * 1.05, 4 * s, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawTowers() {
    const g = this.g, ctx = this.ctx, s = this.s, at = this.at;
    for (const t of g.towers) {
      if (!t.alive) continue;
      const broken = t.hp <= 0;
      let col = TOWER_COLORS[t.type];
      if (broken) col = '#8b8b8b';
      const homeX = this.px(t.x), homeY = this.py(t.y);
      const away = t.sx !== t.x || t.sy !== t.y;
      const x = this.px(t.sx), y = this.py(t.sy, 14);
      // squash on fire
      const sq = t.fireT < 0.12 ? 1 - (0.12 - t.fireT) * 1.6 : 1;
      const breathe = 1 + Math.sin(at * 4 + t.id) * 0.03;
      const r = 22 * s * (1 + t.level * 0.08) * breathe;
      if (away) {
        ctx.globalAlpha = 0.35;
        blob(ctx, homeX, homeY, 16 * s, 12 * s, col, 0);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(0,40,60,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, this.py(t.sy) + 6 * s, r, r * 0.45, 0, 0, TAU);
      ctx.fill();
      const infl = t.type === 'puffer' ? 1 + t.inflate * 0.6 : 1;
      if (t.type === 'starfish' || (t.type === 'puffer' && t.inflate > 0)) {
        if (t.type === 'starfish') star(ctx, x, y, r * 1.25, r * 0.6, at * 0.8, col);
        else spikes(ctx, x, y, r * infl * 1.25, 12, 0, mix(col, '#000', 0.2), s);
      }
      if (t.type !== 'starfish') blob(ctx, x, y, r * infl * (2 - sq), r * infl * sq * TILT * 1.1, col, 0.35);
      if (t.type === 'shark') {
        ctx.fillStyle = mix(col, '#000', 0.25);
        ctx.beginPath();
        ctx.moveTo(x - r * 0.3, y - r * 0.5);
        ctx.lineTo(x, y - r * 1.25);
        ctx.lineTo(x + r * 0.3, y - r * 0.5);
        ctx.fill();
      }
      if (t.type === 'octopus') {
        for (let k = 0; k < 5; k++) {
          const a = Math.PI * (0.15 + 0.175 * k);
          blob(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, r * 0.25, r * 0.18, mix(col, '#000', 0.2), 0);
        }
      }
      if (t.type === 'crab') {
        blob(ctx, x - r * 1.0, y - r * 0.4, r * 0.4, r * 0.32, mix(col, '#000', 0.12), 0);
        blob(ctx, x + r * 1.0, y - r * 0.4, r * 0.4, r * 0.32, mix(col, '#000', 0.12), 0);
      }
      if (!broken) googly(ctx, x, y - r * 0.2, r * 0.33, t.aim, at + t.id, false);
      else {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.4, y - r * 0.4);
        ctx.lineTo(x + r * 0.4, y + r * 0.2);
        ctx.moveTo(x + r * 0.4, y - r * 0.4);
        ctx.lineTo(x - r * 0.4, y + r * 0.2);
        ctx.stroke();
      }
      // level pips
      ctx.fillStyle = t.level === 2 ? '#ffd23f' : '#ffffff';
      for (let k = 0; k <= t.level; k++) {
        ctx.beginPath();
        ctx.arc(homeX - t.level * 5 * s + k * 10 * s, homeY + 26 * s, 3.5 * s, 0, TAU);
        ctx.fill();
      }
      // status
      if (t.grabT > 0) ring2(ctx, x, y, r * 1.15, r * 0.9, ENEMY_COLORS.kraken, 5 * s);
      if (t.zapT > 0 && Math.floor(this.time * 20) % 2) ring2(ctx, x, y, r * 1.2, r * 1.0, '#fff36b', 3 * s);
      if (t.blindT > 0) blob(ctx, x, y - r * 0.2, r * 0.8, r * 0.45, C.ink, 0);
      if (t.plusT > 0) ring2(ctx, x, y, r * 1.3, r * 1.1, C.plus, 2 * s);
      if (t.hp < t.maxHp) bar(ctx, homeX, homeY - 38 * s, 40 * s, 5 * s, t.hp / t.maxHp);
    }
  }

  drawTentacles() {
    const g = this.g, ctx = this.ctx, s = this.s, at = this.at;
    for (const tn of g.tentacles) {
      if (!tn.alive) continue;
      const x = this.px(tn.x), y = this.py(tn.y, 10);
      const col = tn.hitT > 0 ? '#ffffff' : BOSS_COLORS.kitty;
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      ctx.lineWidth = 12 * s;
      ctx.beginPath();
      ctx.moveTo(x - 30 * s, y + 18 * s);
      ctx.bezierCurveTo(x - 10 * s, y - 40 * s + Math.sin(at * 6) * 6 * s, x + 30 * s, y - 20 * s, x + 18 * s, y + 10 * s);
      ctx.stroke();
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = mix(BOSS_COLORS.kitty, '#000', 0.3);
      ctx.stroke();
      bar(ctx, x, y - 44 * s, 40 * s, 5 * s, tn.hp / tn.maxHp, C.minus);
    }
  }

  drawHeart() {
    const g = this.g, h = g.heart, ctx = this.ctx, s = this.s;
    const pulse = 1 + Math.sin(this.at * 3) * 0.04 + (h.hitT > 0 ? h.hitT * 0.3 : 0);
    const x = this.px(h.x), y = this.py(h.y, 10);
    const r = h.r * s * pulse;
    blob(ctx, x, this.py(h.y) + 10 * s, r * 1.1, r * 0.45, 'rgba(0,40,60,0.25)', 0);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + 0.3;
      blob(ctx, x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.35, C.heartRim, 0);
    }
    blob(ctx, x, y, r, r * TILT, h.hitT > 0 ? '#ffffff' : C.heart, 0.4);
    googly(ctx, x, y - r * 0.15, r * 0.3, Math.PI / 2, this.at, h.hp < h.maxHp * 0.35);
  }

  drawProjectiles() {
    const g = this.g, ctx = this.ctx, s = this.s, at = this.at;
    for (const p of g.projectiles) {
      if (!p.alive) continue;
      const x = this.px(p.x), y = this.py(p.y, p.z);
      switch (p.kind) {
        case 'minus':
          blob(ctx, x, y, p.r * s * 1.1, p.r * s * 1.1, C.minus, 0.45);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x - 5 * s, y - 1.5 * s, 10 * s, 3 * s);
          break;
        case 'plus':
          ctx.fillStyle = 'rgba(0,40,60,0.2)';
          ctx.beginPath();
          ctx.ellipse(x, this.py(p.y), p.r * s, p.r * s * 0.4, 0, 0, TAU);
          ctx.fill();
          blob(ctx, x, y, p.r * s * 1.1, p.r * s * 1.1, C.plus, 0.45);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x - 6 * s, y - 1.8 * s, 12 * s, 3.6 * s);
          ctx.fillRect(x - 1.8 * s, y - 6 * s, 3.6 * s, 12 * s);
          break;
        case 'bubble':
          blob(ctx, x, y - 10 * s, 6 * s, 6 * s, '#bdf4ff', 0.5);
          break;
        case 'dart':
          ctx.strokeStyle = '#ff9fc6';
          ctx.lineWidth = 4 * s;
          ctx.beginPath();
          ctx.moveTo(x, y - 10 * s);
          ctx.lineTo(x - p.vx * 0.02 * s, y - 10 * s - p.vy * 0.02 * s * TILT);
          ctx.stroke();
          break;
        case 'ink':
          blob(ctx, x, y, 9 * s, 8 * s, C.ink, 0.2);
          break;
        case 'star':
          star(ctx, x, y - 10 * s, 14 * s, 6 * s, at * 14, TOWER_COLORS.starfish);
          break;
        case 'ministar':
          star(ctx, x, y - 10 * s, 8 * s, 3.5 * s, at * 14, '#ffb199');
          break;
      }
    }
  }

  drawStrikes() {
    const g = this.g, ctx = this.ctx, s = this.s, at = this.at;
    for (const st of g.strikes) {
      if (!st.alive || st.kind === 'swipe') continue;
      const x = this.px(st.x), y = this.py(st.y, st.z + 10);
      if (st.kind === 'ink') blob(ctx, x, y, 12 * s, 11 * s, C.ink, 0.25);
      else if (st.kind === 'spark') star(ctx, x, y, 10 * s, 4 * s, at * 20, '#fff36b');
      else star(ctx, x, y, 9 * s, 4 * s, at * 14, '#ffc94d');
    }
  }

  drawPlayer() {
    const g = this.g, p = g.player, ctx = this.ctx, s = this.s, at = this.at;
    const inRun = g.phase !== 'title';
    if (!inRun) return;
    const x = this.px(p.x), y = this.py(p.y, 18);
    if (!p.alive) {
      // respawn bubble countdown
      ctx.globalAlpha = 0.6;
      ring2(ctx, x, y, 26 * s, 26 * s, '#ffffff', 3 * s);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(18 * s)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.ceil(p.deadT)), x, y);
      return;
    }
    if (p.invulnT > 0 && Math.floor(this.time * 12) % 2) return;
    const skin = SKIN_COLORS[p.skin] || SKIN_COLORS.classic;
    const facing = p.vx < -1 ? -1 : 1;
    const shootSq = p.shootT < 0.08 || p.plusShootT < 0.1 ? 0.85 : 1;
    const wig = Math.sin(at * 10) * 0.12;
    ctx.fillStyle = 'rgba(0,40,60,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, this.py(p.y) + 8 * s, 26 * s, 9 * s, 0, 0, TAU);
    ctx.fill();
    // tail
    ctx.fillStyle = skin.fin;
    ctx.beginPath();
    ctx.moveTo(x - facing * 20 * s, y);
    ctx.lineTo(x - facing * 40 * s, y - (12 + wig * 20) * s);
    ctx.lineTo(x - facing * 40 * s, y + (12 - wig * 20) * s);
    ctx.closePath();
    ctx.fill();
    blob(ctx, x, y, 26 * s * (2 - shootSq), 18 * s * shootSq, skin.body, 0.35);
    ctx.fillStyle = skin.stripe;
    ctx.fillRect(x - 3 * s, y - 16 * s * shootSq, 7 * s, 32 * s * shootSq);
    ctx.fillRect(x - facing * 13 * s - 2.5 * s, y - 13 * s * shootSq, 5 * s, 26 * s * shootSq);
    googly(ctx, x + facing * 12 * s, y - 5 * s, 6 * s, -Math.PI / 2, at, false);
    // bubble gun nozzle
    blob(ctx, x, y - 20 * s * shootSq, 6 * s, 5 * s, '#ffffff', 0.4);
  }

  drawFx(dt) {
    const ctx = this.ctx, s = this.s;
    // particles
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
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.vz -= 600 * dt;
      p.z = Math.max(0, p.z + p.vz * dt);
      ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      ctx.fillStyle = p.color;
      const r = p.size * s;
      ctx.fillRect(this.px(p.x) - r / 2, this.py(p.y, p.z) - r / 2, r, r);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const k = 1 - r.life / r.max;
      const rad = (r.r0 + (r.r1 - r.r0) * k) * s;
      ctx.globalAlpha = 1 - k;
      ring2(ctx, this.px(r.x), this.py(r.y), rad, rad * TILT, r.color, 4 * s);
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.life -= dt;
      if (l.life <= 0) {
        this.lines.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = l.life / l.max;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 4 * s;
      ctx.beginPath();
      const x1 = this.px(l.x1), y1 = this.py(l.y1, 12), x2 = this.px(l.x2), y2 = this.py(l.y2, 12);
      ctx.moveTo(x1, y1);
      const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * 16 * s, my = (y1 + y2) / 2 + (Math.random() - 0.5) * 16 * s;
      ctx.lineTo(mx, my);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (this.texts.length) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4 * s;
      ctx.strokeStyle = 'rgba(40,20,60,0.8)';
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt;
        if (t.life <= 0) {
          this.texts.splice(i, 1);
          continue;
        }
        const k = 1 - t.life / t.max;
        ctx.globalAlpha = Math.min(1, t.life * 3);
        ctx.font = `900 ${Math.round(16 * s * t.scale)}px system-ui, sans-serif`;
        const x = this.px(t.x), y = this.py(t.y, 30 + k * 40);
        ctx.strokeText(t.str, x, y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, x, y);
      }
      ctx.globalAlpha = 1;
    }
  }
}

// ------------------------------------------------------------ drawing helpers

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Glossy plasticine blob: body + soft highlight.
function blob(ctx, x, y, rx, ry, color, gloss) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  ctx.fill();
  if (gloss > 0) {
    ctx.fillStyle = `rgba(255,255,255,${gloss})`;
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.35, y - ry * 0.4, rx * 0.3, ry * 0.22, -0.5, 0, TAU);
    ctx.fill();
  }
}

function ring2(ctx, x, y, rx, ry, color, w) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  ctx.stroke();
}

function googly(ctx, x, y, r, look, t, sad) {
  const off = r * 0.9;
  const lx = Math.cos(look) * r * 0.35, ly = Math.sin(look) * r * 0.25 + Math.sin(t * 7) * r * 0.08;
  for (const sgn of [-1, 1]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + sgn * off, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1b1030';
    ctx.beginPath();
    ctx.arc(x + sgn * off + lx, y + ly + (sad ? r * 0.3 : 0), r * 0.5, 0, TAU);
    ctx.fill();
  }
  if (sad) {
    ctx.fillStyle = '#7fc8ff';
    ctx.beginPath();
    ctx.arc(x + off, y + r * 1.4, r * 0.3, 0, TAU);
    ctx.fill();
  }
}

function star(ctx, x, y, ro, ri, rot, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * TAU - Math.PI / 2;
    const r = i % 2 ? ri : ro;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * TILT;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function spikes(ctx, x, y, r, n, rot, color, s) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6 * TILT);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * TILT);
  }
  ctx.stroke();
}

function shellShape(ctx, x, y, r, fill, rim) {
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.6);
  ctx.arc(x, y, r, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.45);
  ctx.arc(x, y, r * 0.78, Math.PI * 1.1, Math.PI * 1.9);
  ctx.closePath();
  ctx.fill();
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = C.hpBack;
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = color || (frac > 0.6 ? C.hpGood : frac > 0.3 ? C.hpMid : C.hpBad);
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), h);
}

const mixCache = new Map();
function mix(a, b, t) {
  if (a.charCodeAt(0) !== 35) return a; // already mixed (rgb()) — keep as is
  const key = a + b + t;
  let v = mixCache.get(key);
  if (v) return v;
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  v = `rgb(${r},${g},${bl})`;
  mixCache.set(key, v);
  return v;
}
