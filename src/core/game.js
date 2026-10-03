// Game — the whole simulation of the lane runner. Pure logic: no DOM, no canvas,
// no audio, so it runs identically in the browser and headless in Node.
//
// Phases: title -> play -> won / lost -> play (next level or retry) ...
// The school swims forward and shoots by itself; the only control is steering
// (`input.targetX` from a drag, or `input.left` / `input.right`).
//
// Coordinates: x across the road (0 = middle, ±ROAD.half = edges), z = distance
// ahead of the school (things come down the road toward z = 0).

import {
  ROAD, SCHOOL, GATES, CLAM, ENEMIES, BOSSES, BOSS_ATTACK, LEVELS, UPGRADES, BUDDIES, BUDDY_MAX, SKINS, VERSION,
} from '../config.js';
import { Pool, compact, clamp } from './util.js';
import { EventQueue } from './events.js';
import { buildLevel, bossForLevel } from './level.js';

export const PHASE = { TITLE: 'title', PLAY: 'play', WON: 'won', LOST: 'lost' };
export const STAGE = { RUN: 0, BOSS: 1 };

const OK = { ok: true, reason: '' };
const fail = (reason) => ({ ok: false, reason });

// Hex-packed fish positions around the school's centre, nearest first.
export const SCHOOL_OFFSETS = (() => {
  const s = SCHOOL.spacing, pts = [];
  for (let j = -8; j <= 8; j++) {
    for (let i = -8; i <= 8; i++) {
      const x = (i + (j & 1 ? 0.5 : 0)) * s, z = j * s * 0.8;
      pts.push({ x, z, d: x * x + z * z * 1.3 + i * 0.01 });
    }
  }
  pts.sort((a, b) => a.d - b.d);
  return pts.slice(0, SCHOOL.shown).map((p) => ({ x: p.x, z: p.z }));
})();

// Anything on the road: gate halves, clams, critters, the boss.
export class Thing {
  constructor() {
    this.reset();
  }
  reset() {
    this.id = 0;
    this.alive = false;
    this.kind = ''; // gate | clam | enemy | boss
    this.type = ''; // enemy type / boss id
    this.x = 0;
    this.z = 0;
    this.px = 0; // previous tick (render interpolation)
    this.pz = 0;
    this.w = 0; // half-width (what bullets and the school collide with)
    this.depth = 0; // half-depth along z
    this.hp = 0;
    this.maxHp = 0;
    this.speed = 0;
    this.bite = 0;
    this.coins = 0;
    this.gate = null; // { type, value, buddy } for gates; the prize for clams
    this.partner = null; // the other half of a gate pair
    this.charge = 0; // bubble hits a number gate has taken toward its next +1
    this.hitT = 0;
    this.anim = 0;
    this.state = 0; // boss: 0 hold, 1 charge wind-up, 2 charging, 3 swimming back
    this.stateT = 0;
    this.attackT = 0;
    this.attacks = 0; // boss attacks so far / times a gate has been bumped
    this.homeZ = 0;
    this.tx = 0;
    this.cycle = 0;
  }
}

export class Bullet {
  constructor() {
    this.hitIds = new Int32Array(8);
    this.reset();
  }
  reset() {
    this.alive = false;
    this.kind = 'bubble'; // bubble | dart | ink | star
    this.x = 0;
    this.z = 0;
    this.px = 0;
    this.pz = 0;
    this.vx = 0;
    this.vz = 0;
    this.dmg = 0;
    this.r = 0;
    this.pierce = 1;
    this.splash = 0;
    this.t = 0;
    this.buddy = false;
    this.hitN = 0;
  }
}

// Boss attacks: thrown ones land on the school's line after `dur` (red target
// circle until then).
export class Shot {
  constructor() {
    this.reset();
  }
  reset() {
    this.alive = false;
    this.kind = ''; // ink | star | swipe
    this.x = 0;
    this.r = 0;
    this.fromX = 0;
    this.fromZ = 0;
    this.t = 0;
    this.dur = 0;
  }
}

export class Game {
  constructor(opts = {}) {
    this.events = new EventQueue(1024);
    this.pools = {
      thing: new Pool(() => new Thing(), 96),
      bullet: new Pool(() => new Bullet(), 96),
      shot: new Pool(() => new Shot(), 8),
    };
    this.things = [];
    this.bullets = [];
    this.shots = [];
    this.school = {
      x: 0, px: 0, n: 0, fireT: 0, volley: 0, dmgMul: 1, rateMul: 1,
      buddies: [], // { type, level, cd, side, fireT }
      hitT: 0, gainT: 0,
    };
    // Written by input (browser) or a bot (headless). targetX: NaN when not dragging.
    this.input = { targetX: NaN, left: false, right: false };
    this.meta = normalizeMeta(opts.meta);
    this.phase = PHASE.TITLE;
    this.paused = false;
    this.clock = 0; // always advancing (menus animate)
    this.uiVersion = 0;
    this.metaDirty = false;
    this.nextId = 0;
    this.level = this.meta.level;
    this.plan = buildLevel(this.level);
    this.resetLevelState();
  }

  // ---------------------------------------------------------------- level flow

  resetLevelState() {
    const release = (arr, pool) => {
      for (const o of arr) {
        o.alive = false;
        pool.release(o);
      }
      arr.length = 0;
    };
    release(this.things, this.pools.thing);
    release(this.bullets, this.pools.bullet);
    release(this.shots, this.pools.shot);
    const s = this.school;
    const up = this.meta.up;
    s.x = s.px = 0;
    s.n = SCHOOL.start + up.fish;
    s.fireT = 0.1;
    s.volley = 0;
    s.dmgMul = 1 + 0.1 * up.dmg;
    s.rateMul = 1 + 0.06 * up.rate;
    s.buddies.length = 0;
    s.hitT = 0;
    s.gainT = 0;
    this.input.targetX = NaN;
    this.dist = 0;
    this.t = 0;
    this.stage = STAGE.RUN;
    this.planIdx = 0;
    this.boss = null;
    this.ending = '';
    this.endT = 0;
    this.coinsRun = 0;
    this.result = null;
  }

  // Starts (or restarts) the level in meta.level.
  startLevel() {
    this.level = this.meta.level;
    this.plan = buildLevel(this.level);
    this.resetLevelState();
    this.paused = false;
    this.meta.runs++;
    this.metaDirty = true;
    this.setPhase(PHASE.PLAY);
    this.events.emit('level_start', 0, 0, this.level, 0, this.plan.boss);
    return OK;
  }

  setPhase(p) {
    this.phase = p;
    this.uiVersion++;
    this.events.emit('phase', 0, 0, 0, 0, p);
  }

  setPaused(p) {
    if (this.phase !== PHASE.PLAY) p = false;
    if (this.paused === p) return;
    this.paused = p;
    this.uiVersion++;
    this.events.emit(p ? 'pause' : 'resume');
  }

  quitToTitle() {
    this.paused = false;
    this.resetLevelState();
    this.setPhase(PHASE.TITLE);
  }

  upgradeCost(id) {
    const u = UPGRADES[id];
    const lvl = this.meta.up[id];
    if (!u || lvl >= u.max) return null;
    return Math.round(u.base * Math.pow(u.grow, lvl));
  }

  buyUpgrade(id) {
    if (this.phase === PHASE.PLAY) return fail('Not during a level');
    const cost = this.upgradeCost(id);
    if (cost == null) return fail('Maxed out');
    if (this.meta.coins < cost) {
      this.events.emit('denied', 0, 0, 0, 0, 'Not enough coins');
      return fail('Not enough coins');
    }
    this.meta.coins -= cost;
    this.meta.up[id]++;
    this.metaDirty = true;
    this.uiVersion++;
    this.events.emit('buy', 0, 0, cost, this.meta.up[id], id);
    return OK;
  }

  setSkin(id) {
    if (!this.meta.skins.includes(id)) return fail('Skin locked');
    this.meta.skin = id;
    this.metaDirty = true;
    this.uiVersion++;
    return OK;
  }

  get progress() {
    const end = this.plan.length - BOSSES[this.plan.boss].stopZ;
    return this.stage === STAGE.BOSS ? 1 : clamp(this.dist / end, 0, 1);
  }

  // ---------------------------------------------------------------- simulation

  update(dt) {
    if (this.paused) return;
    this.clock += dt;
    if (this.phase !== PHASE.PLAY) return;
    this.t += dt;
    this.snapshot();
    const s = this.school;
    if (s.hitT > 0) s.hitT -= dt;
    if (s.gainT > 0) s.gainT -= dt;
    if (!this.ending) this.steer(dt);
    const adv = this.stage === STAGE.RUN && !this.ending ? ROAD.speed * dt : 0;
    this.dist += adv;
    this.spawn();
    this.moveThings(dt, adv);
    if (!this.ending) this.fire(dt);
    this.updateBullets(dt);
    this.updateShots(dt);
    if (!this.ending) this.collide();
    compact(this.things, this.pools.thing);
    compact(this.bullets, this.pools.bullet);
    compact(this.shots, this.pools.shot);
    if (!this.ending && s.n <= 0) this.end('lost');
    if (this.ending) {
      this.endT -= dt;
      if (this.endT <= 0) this.finish();
    }
  }

  snapshot() {
    for (let i = 0; i < this.things.length; i++) {
      const o = this.things[i];
      o.px = o.x;
      o.pz = o.z;
    }
    for (let i = 0; i < this.bullets.length; i++) {
      const o = this.bullets[i];
      o.px = o.x;
      o.pz = o.z;
    }
    this.school.px = this.school.x;
  }

  // Half-width of the school (what critters and clams collide with) and how far
  // its front row reaches up the road.
  get schoolHalfW() {
    const n = Math.min(this.school.n, SCHOOL.shown);
    return 14 + SCHOOL.spacing * 0.55 * Math.sqrt(Math.max(1, n));
  }
  get schoolFront() {
    const n = Math.min(this.school.n, SCHOOL.shown);
    return 8 + SCHOOL.spacing * 0.45 * Math.sqrt(Math.max(1, n));
  }

  steer(dt) {
    const s = this.school, inp = this.input;
    const lim = ROAD.half - ROAD.edge;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir) s.x += dir * SCHOOL.keySpeed * dt;
    else if (inp.targetX === inp.targetX) {
      const d = clamp(inp.targetX, -lim, lim) - s.x;
      const step = SCHOOL.steer * dt;
      s.x += Math.abs(d) <= step ? d : Math.sign(d) * step;
    }
    s.x = clamp(s.x, -lim, lim);
  }

  spawn() {
    const items = this.plan.items;
    while (this.planIdx < items.length && items[this.planIdx].at - this.dist <= ROAD.view) {
      const it = items[this.planIdx++];
      const z = it.at - this.dist;
      if (it.kind === 'gates') {
        const l = this.addThing('gate', '', -GATES.w / 2, z);
        const r = this.addThing('gate', '', GATES.w / 2, z);
        l.w = r.w = GATES.w / 2 - 4;
        l.depth = r.depth = 8;
        l.gate = { ...it.left };
        r.gate = { ...it.right };
        l.partner = r;
        r.partner = l;
      } else if (it.kind === 'clam') {
        const c = this.addThing('clam', 'clam', it.x, z);
        c.w = CLAM.w / 2;
        c.depth = 22;
        c.hp = c.maxHp = it.hp;
        c.gate = { ...it.prize };
        c.coins = 3;
      } else if (it.kind === 'enemy') {
        const def = ENEMIES[it.type];
        const e = this.addThing('enemy', it.type, it.x, z);
        e.w = def.r;
        e.depth = def.r;
        e.hp = e.maxHp = it.hp;
        e.speed = def.speed;
        e.bite = def.bite;
        e.coins = def.coins;
        e.anim = (e.id * 0.37) % 6;
      } else if (it.kind === 'boss') {
        const def = BOSSES[it.id];
        const b = this.addThing('boss', it.id, 0, z);
        b.w = def.r;
        b.depth = def.r * 0.6;
        b.hp = b.maxHp = it.hp;
        b.cycle = bossForLevel(this.level).cycle;
        b.attackT = 1.2;
        this.boss = b;
        this.events.emit('boss_spawn', b.x, b.z, b.maxHp, 0, b.type, b);
      }
    }
  }

  addThing(kind, type, x, z) {
    const o = this.pools.thing.get();
    o.reset();
    o.id = ++this.nextId;
    o.alive = true;
    o.kind = kind;
    o.type = type;
    o.x = o.px = x;
    o.z = o.pz = z;
    this.things.push(o);
    return o;
  }

  moveThings(dt, adv) {
    const s = this.school;
    for (let i = 0; i < this.things.length; i++) {
      const o = this.things[i];
      if (!o.alive) continue;
      if (o.hitT > 0) o.hitT -= dt;
      o.anim += dt;
      if (o.kind === 'boss') {
        this.moveBoss(o, dt, adv);
        continue;
      }
      o.z -= adv;
      if (o.kind === 'enemy') {
        o.z -= o.speed * dt;
        // critters close in on the school once they're near
        if (o.z < 520 && o.z > 0 && !this.ending) {
          const d = s.x - o.x;
          o.x += clamp(d, -26 * dt, 26 * dt);
        }
      }
      if (o.z < -ROAD.behind) o.alive = false;
    }
  }

  // ---------------------------------------------------------------- shooting

  fire(dt) {
    const s = this.school;
    s.fireT -= dt * s.rateMul;
    if (s.fireT <= 0 && s.n > 0) {
      s.fireT += SCHOOL.fireEvery;
      const B = Math.min(1 + this.meta.up.shots, SCHOOL.bulletsMax);
      const per = (s.n * SCHOOL.dps * s.dmgMul * SCHOOL.fireEvery) / B;
      for (let k = 0; k < B; k++) {
        const x = s.x + (k - (B - 1) / 2) * SCHOOL.spacing * 0.8;
        this.addBullet('bubble', x, this.schoolFront + 10, 0, SCHOOL.bulletSpeed, per, SCHOOL.bulletR, 1, 0, false);
      }
      s.volley++;
      this.events.emit('shoot', s.x, 0, s.n);
    }
    for (let i = 0; i < s.buddies.length; i++) {
      const b = s.buddies[i];
      b.fireT += dt;
      b.cd -= dt;
      if (b.cd > 0) continue;
      const def = BUDDIES[b.type];
      const bx = this.buddyX(b);
      const tgt = this.nearestTarget(bx);
      if (!tgt) {
        b.cd = 0.15;
        continue;
      }
      b.cd = def.every;
      const speed = SCHOOL.bulletSpeed * 0.8;
      const time = Math.max(0.05, tgt.z / speed);
      const vx = clamp((tgt.x - bx) / time, -500, 500);
      const mul = 1 + 0.6 * (b.level - 1);
      this.addBullet(def.shot, bx, 20, vx, speed, def.dmg * mul * s.dmgMul, 12, def.pierce, def.splash || 0, true);
      b.fireT = 0;
      this.events.emit('buddy_fire', bx, 20, 0, 0, b.type);
    }
  }

  buddyX(b) {
    return clamp(this.school.x + b.side * (this.schoolHalfW + 22), -ROAD.half, ROAD.half);
  }

  // The closest thing ahead worth shooting (a buddy's aim).
  nearestTarget(x) {
    let best = null, bv = Infinity;
    for (let i = 0; i < this.things.length; i++) {
      const o = this.things[i];
      if (!o.alive || o.kind === 'gate' || o.z <= 0 || o.z > ROAD.view * 0.85) continue;
      const v = o.z + Math.abs(o.x - x) * 0.6;
      if (v < bv) {
        bv = v;
        best = o;
      }
    }
    return best;
  }

  addBullet(kind, x, z, vx, vz, dmg, r, pierce, splash, buddy) {
    const b = this.pools.bullet.get();
    b.reset();
    b.alive = true;
    b.kind = kind;
    b.x = b.px = x;
    b.z = b.pz = z;
    b.vx = vx;
    b.vz = vz;
    b.dmg = dmg;
    b.r = r;
    b.pierce = pierce;
    b.splash = splash;
    b.buddy = buddy;
    this.bullets.push(b);
    return b;
  }

  updateBullets(dt) {
    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      if (!b.alive) continue;
      b.t += dt;
      const z0 = b.z;
      b.z += b.vz * dt;
      b.x += b.vx * dt;
      if (b.z > ROAD.view + 40 || b.x < -ROAD.half - 60 || b.x > ROAD.half + 60) {
        b.alive = false;
        continue;
      }
      // the nearest thing the bullet passed through this tick
      let hit = null;
      for (let j = 0; j < this.things.length; j++) {
        const o = this.things[j];
        if (!o.alive || (hit && o.z >= hit.z)) continue;
        if (o.kind === 'gate' && (o.gate.type !== 'add' || b.buddy)) continue;
        if (o.z + o.depth < z0 || o.z - o.depth > b.z) continue;
        if (Math.abs(o.x - b.x) > o.w + b.r) continue;
        if (seen(b, o.id)) continue;
        hit = o;
      }
      if (!hit) continue;
      if (b.hitN < b.hitIds.length) b.hitIds[b.hitN++] = hit.id;
      this.damage(hit, b.dmg);
      if (b.splash) {
        const r2 = b.splash * b.splash;
        for (let j = 0; j < this.things.length; j++) {
          const o = this.things[j];
          if (!o.alive || o === hit || o.kind === 'gate') continue;
          const dx = o.x - b.x, dz = o.z - hit.z;
          if (dx * dx + dz * dz <= r2) this.damage(o, b.dmg * 0.5);
        }
        this.events.emit('splash', b.x, hit.z, b.splash, 0, b.kind);
      }
      if (--b.pierce <= 0) b.alive = false;
    }
  }

  damage(o, dmg) {
    if (!o.alive) return;
    if (o.kind === 'gate') {
      // every few bubbles nudge a number gate up by one (however big the school is)
      if (o.attacks >= GATES.bumpMax) return;
      if (++o.charge >= GATES.hitsPerBump) {
        o.charge = 0;
        o.attacks++;
        o.gate.value++;
        if (o.gate.value === 0) o.gate.value = 1; // no +0 gates
        o.hitT = 0.08;
        this.events.emit('gate_bump', o.x, o.z, o.gate.value);
      }
      return;
    }
    o.hp -= dmg;
    o.hitT = 0.08;
    this.events.emit('hit', o.x, o.z, dmg, 0, o.kind);
    if (o.hp <= 0) this.kill(o);
  }

  kill(o) {
    o.alive = false;
    o.hp = 0;
    if (o.kind === 'enemy') {
      this.coinsRun += o.coins;
      this.events.emit('kill', o.x, o.z, o.coins, 0, o.type);
    } else if (o.kind === 'clam') {
      this.coinsRun += o.coins;
      this.events.emit('clam_crack', o.x, o.z, o.coins, 0, o.gate.type);
      this.applyEffect(o.gate, o.x, o.z, 'prize');
    } else if (o.kind === 'boss') {
      this.coinsRun += 25 + 10 * this.level;
      this.events.emit('boss_defeat', o.x, o.z, 0, 0, o.type);
      this.end('won');
    }
  }

  // ---------------------------------------------------------------- effects

  applyEffect(e, x, z, source) {
    const s = this.school;
    const before = s.n;
    switch (e.type) {
      case 'add':
        this.setFish(s.n + e.value);
        break;
      case 'mul':
        this.setFish(s.n * e.value);
        break;
      case 'rate':
        s.rateMul *= 1.15;
        break;
      case 'dmg':
        s.dmgMul *= 1.2;
        break;
      case 'buddy':
        this.addBuddy(e.buddy);
        break;
    }
    const good = e.type !== 'add' || e.value > 0;
    this.events.emit(source, x, z, s.n - before, good ? 1 : 0, e.type);
  }

  setFish(n) {
    const s = this.school;
    const v = clamp(Math.round(n), 0, SCHOOL.max);
    if (v > s.n) s.gainT = 0.4;
    else if (v < s.n) s.hitT = 0.4;
    s.n = v;
  }

  loseFish(k, x, z) {
    const s = this.school;
    const lost = Math.min(s.n, Math.max(1, Math.round(k)));
    this.setFish(s.n - lost);
    this.events.emit('bite', x, z, lost, s.n);
  }

  addBuddy(type) {
    const list = this.school.buddies;
    const same = list.find((b) => b.type === type);
    if (same) {
      same.level = Math.min(3, same.level + 1);
      this.events.emit('buddy_up', this.buddyX(same), 0, same.level, 0, type);
      return;
    }
    let side = list.length === 0 ? -1 : -list[0].side;
    if (list.length >= BUDDY_MAX) {
      // replace the weaker one
      let weak = 0;
      for (let i = 1; i < list.length; i++) if (list[i].level < list[weak].level) weak = i;
      side = list[weak].side;
      list.splice(weak, 1);
    }
    const b = { type, level: 1, cd: 0.5, side, fireT: 9 };
    list.push(b);
    this.events.emit('buddy_join', this.buddyX(b), 0, 1, 0, type);
  }

  // ---------------------------------------------------------------- collisions

  collide() {
    const s = this.school;
    const hw = this.schoolHalfW, front = this.schoolFront;
    for (let i = 0; i < this.things.length; i++) {
      const o = this.things[i];
      if (!o.alive) continue;
      if (o.kind === 'gate') {
        if (o.z > 0 || o.x > 0) continue; // each pair resolves once, from its left half
        const pick = s.x < 0 ? o : o.partner;
        o.alive = false;
        o.partner.alive = false;
        this.applyEffect(pick.gate, pick.x, 0, 'gate');
        continue;
      }
      if (o.kind === 'boss') continue;
      if (o.z - o.depth > front || o.z + o.depth < -front) continue;
      if (Math.abs(o.x - s.x) > hw + o.w * 0.8) continue;
      o.alive = false;
      if (o.kind === 'enemy') this.loseFish(o.bite, o.x, o.z);
      else this.loseFish(Math.max(2, (o.hp * CLAM.crush) / 3), o.x, o.z);
    }
  }

  // ---------------------------------------------------------------- the boss

  moveBoss(b, dt, adv) {
    const def = BOSSES[b.type];
    const s = this.school;
    if (this.stage === STAGE.RUN) {
      b.z -= adv;
      if (b.z <= def.stopZ) {
        b.z = b.homeZ = def.stopZ;
        this.stage = STAGE.BOSS;
        this.events.emit('boss_stage', b.x, b.z, 0, 0, b.type, b);
      }
      return;
    }
    if (this.ending) return;
    const speedUp = Math.pow(0.88, b.cycle);
    switch (b.state) {
      case 0: {
        b.homeZ -= def.creep * dt;
        b.z = b.homeZ;
        const want = Math.sin(this.t * 0.7) * 70;
        b.x += clamp(want - b.x, -90 * dt, 90 * dt);
        b.attackT -= dt;
        if (b.attackT <= 0) {
          b.attackT = def.attackEvery * speedUp;
          this.bossAttack(b, def);
        }
        if (b.homeZ - b.depth <= this.schoolFront) {
          this.events.emit('boss_reach', b.x, b.z, 0, 0, b.type, b);
          this.loseFish(s.n, s.x, 0);
        }
        break;
      }
      case 1: // wind-up: line up over a lane
        b.stateT -= dt;
        b.x += clamp(b.tx - b.x, -520 * dt, 520 * dt);
        if (b.stateT <= 0) {
          b.state = 2;
          this.events.emit('boss_charge', b.x, b.z, 0, 0, b.type, b);
        }
        break;
      case 2: // charge down the lane
        b.z -= BOSS_ATTACK.chargeSpeed * dt;
        if (b.z - b.depth <= this.schoolFront) {
          if (Math.abs(s.x - b.x) < BOSS_ATTACK.chargeW / 2 + this.schoolHalfW * 0.5) {
            this.loseFish(this.bossBite() * 2, s.x, 0);
          } else this.events.emit('dodge', b.x, 0);
          b.state = 3;
        }
        break;
      default: // swim back
        b.z += 520 * dt;
        if (b.z >= b.homeZ) {
          b.z = b.homeZ;
          b.state = 0;
        }
    }
  }

  bossBite() {
    return BOSS_ATTACK.bite + Math.floor(this.level / 3);
  }

  bossAttack(b, def) {
    const s = this.school;
    b.attacks++;
    switch (def.attack) {
      case 'charge':
        b.state = 1;
        b.stateT = BOSS_ATTACK.chargeWindup;
        b.tx = clamp(s.x, -ROAD.half + 50, ROAD.half - 50);
        this.events.emit('boss_windup', b.x, b.z, b.tx, 0, b.type, b);
        break;
      case 'stars':
        this.throwShot(b, 'star', s.x, BOSS_ATTACK.r * 0.8);
        if (s.x - 150 > -ROAD.half) this.throwShot(b, 'star', s.x - 150, BOSS_ATTACK.r * 0.8);
        if (s.x + 150 < ROAD.half) this.throwShot(b, 'star', s.x + 150, BOSS_ATTACK.r * 0.8);
        break;
      case 'swipe':
        this.throwShot(b, 'swipe', s.x < 0 ? -ROAD.half / 2 : ROAD.half / 2, ROAD.half / 2 + 10);
        break;
      default:
        this.throwShot(b, 'ink', s.x, BOSS_ATTACK.r);
    }
    if (def.minion && b.attacks % 3 === 0) {
      const mdef = ENEMIES[def.minion];
      const n = 3 + Math.min(4, Math.floor(this.level / 3));
      for (let k = 0; k < n; k++) {
        const e = this.addThing('enemy', def.minion, clamp(b.x + (k - (n - 1) / 2) * 34, -ROAD.half + 20, ROAD.half - 20), b.z - b.depth - 30);
        e.w = e.depth = mdef.r;
        e.hp = e.maxHp = Math.round(mdef.hp * this.plan.minionHp);
        e.speed = mdef.speed;
        e.bite = mdef.bite;
        e.coins = mdef.coins;
      }
      this.events.emit('boss_summon', b.x, b.z, n, 0, b.type, b);
    }
  }

  throwShot(b, kind, x, r) {
    const sh = this.pools.shot.get();
    sh.reset();
    sh.alive = true;
    sh.kind = kind;
    sh.x = clamp(x, -ROAD.half + 20, ROAD.half - 20);
    sh.r = r;
    sh.fromX = b.x;
    sh.fromZ = b.z;
    sh.dur = BOSS_ATTACK.delay;
    this.shots.push(sh);
    this.events.emit('boss_throw', b.x, b.z, sh.x, 0, kind, b);
  }

  updateShots(dt) {
    const s = this.school;
    for (let i = 0; i < this.shots.length; i++) {
      const sh = this.shots[i];
      if (!sh.alive) continue;
      sh.t += dt;
      if (sh.t < sh.dur) continue;
      sh.alive = false;
      const hit = !this.ending && Math.abs(s.x - sh.x) < sh.r + this.schoolHalfW * 0.35;
      if (hit) this.loseFish(this.bossBite(), s.x, 0);
      this.events.emit('strike_land', sh.x, 0, sh.r, hit ? 1 : 0, sh.kind);
    }
  }

  // ---------------------------------------------------------------- endings

  end(result) {
    this.ending = result;
    this.endT = result === 'won' ? 1.4 : 1.1;
    for (const sh of this.shots) sh.alive = false;
    this.events.emit(result === 'won' ? 'win' : 'lose', this.school.x, 0, this.level);
  }

  finish() {
    const m = this.meta;
    const won = this.ending === 'won';
    let bonus = 0;
    if (won) bonus = LEVELS.clearCoins + LEVELS.clearCoinsPerLevel * this.level + this.school.n;
    const coins = this.coinsRun + bonus;
    m.coins += coins;
    this.result = { won, level: this.level, coins, kills: this.coinsRun, bonus, fish: this.school.n, newSkin: '' };
    if (won) {
      if (this.level > m.best) m.best = this.level;
      m.level = this.level + 1;
      for (const [id, need] of [['golden', 10], ['neon', 20], ['galaxy', 30]]) {
        if (this.level >= need && !m.skins.includes(id)) {
          m.skins.push(id);
          this.result.newSkin = id;
        }
      }
    }
    this.metaDirty = true;
    this.ending = '';
    this.setPhase(won ? PHASE.WON : PHASE.LOST);
  }
}

function seen(b, id) {
  for (let i = 0; i < b.hitN; i++) if (b.hitIds[i] === id) return true;
  return false;
}

export function normalizeMeta(m) {
  const base = { v: VERSION, level: 1, coins: 0, best: 0, up: { shots: 0, fish: 0, dmg: 0, rate: 0 }, skins: ['classic'], skin: 'classic', runs: 0 };
  if (!m || typeof m !== 'object') return base;
  const out = { ...base, ...m, up: { ...base.up, ...(m.up || {}) } };
  out.up.shots = Math.max(0, Math.min(UPGRADES.shots.max, out.up.shots | 0));
  out.level = Math.max(1, out.level | 0);
  out.coins = Math.max(0, out.coins | 0);
  if (!Array.isArray(out.skins)) out.skins = ['classic'];
  out.skins = out.skins.filter((s) => SKINS[s]);
  if (!out.skins.includes('classic')) out.skins.unshift('classic');
  if (!out.skins.includes(out.skin)) out.skin = 'classic';
  return out;
}
