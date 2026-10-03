// Tower behaviours: targeting, firing, and the special mechanics of each type.

import { PLAYER, TOWERS, SHRED_MAX, SHRED_DUR } from '../config.js';
import {
  towerActive, damageEnemy, healTower, applySlow, applyStun, crackShell, addShells,
  SRC_TOWER, SRC_SHARK, SRC_BLAST,
} from './combat.js';
import { spawnProjectile } from './projectiles.js';

const scratch = [];
const scratch2 = [];
const tmp = { x: 0, y: 0, angle: 0 };
const best3 = [null, null, null];

const DASH_SPEED = 900;
const SWEEP_SPEED = 650;
const RETARGET = 0.1;

export function createTower(g, type, socketIdx, invested) {
  const def = TOWERS[type];
  const so = g.sockets[socketIdx];
  const t = g.pools.tower.get();
  t.reset();
  t.id = ++g.nextId;
  t.alive = true;
  t.type = type;
  t.def = def;
  t.level = 0;
  t.stats = def.levels[0];
  t.socket = socketIdx;
  t.x = t.sx = so.x;
  t.y = t.sy = so.y;
  t.maxHp = t.hp = def.hp;
  t.invested = invested;
  t.cd = 0.3;
  so.tower = t;
  g.towers.push(t);
  return t;
}

export function towerMaxHp(def, level) {
  return Math.round(def.hp * (1 + 0.25 * level));
}

export function towerRange(g, t) {
  return t.stats.range * (t.plusT > 0 ? PLAYER.plusRange : 1) * (g.mods.rangeMul || 1);
}

// Highest-priority enemy in range. mode: 'first' (closest to the heart) or 'strong'.
function findTarget(g, t, range, mode) {
  const n = g.grid.query(t.x, t.y, range, scratch);
  if (n === 0) return null;
  const len = g.path.length;
  let best = null, bv = -Infinity;
  for (let i = 0; i < n; i++) {
    const e = scratch[i];
    let v;
    if (mode === 'strong') v = e.hp + e.shield + (e.bossId ? 1e6 : 0);
    else v = e.dir > 0 ? e.dist : len + (len - e.dist); // fleeing crabs are urgent
    if (v > bv) {
      bv = v;
      best = e;
    }
  }
  return best;
}

export function updateTowers(g, dt) {
  const towers = g.towers;
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i];
    t.fireT += dt;
    if (t.plusT > 0) t.plusT -= dt;
    if (t.grabT > 0) t.grabT -= dt;
    if (t.zapT > 0) t.zapT -= dt;
    if (t.blindT > 0) t.blindT -= dt;
    if (t.stunT > 0) t.stunT -= dt;
  }

  // Starfish heal auras (works even on broken towers, slowly reviving them)
  for (let i = 0; i < towers.length; i++) {
    const s = towers[i];
    if (s.type !== 'starfish' || s.hp <= 0 || s.covered) continue;
    const r2 = s.stats.healR * s.stats.healR, h = s.stats.heal * dt;
    for (let j = 0; j < towers.length; j++) {
      const o = towers[j];
      const dx = o.x - s.x, dy = o.y - s.y;
      if (dx * dx + dy * dy <= r2) healTower(g, o, h);
    }
  }

  for (let i = 0; i < towers.length; i++) {
    const t = towers[i];
    if (!t.alive) continue;
    if (t.type === 'shark' && t.state !== 0) {
      updateSharkCharge(g, t, dt);
      continue;
    }
    if (t.type === 'puffer' && t.state === 1) {
      updatePufferFuse(g, t, dt);
      continue;
    }
    if (!towerActive(t)) continue;
    const rate = t.plusT > 0 ? PLAYER.plusFireRate : 1;
    t.cd -= dt * rate;
    t.cd2 -= dt * rate;
    t.cd3 -= dt * rate;
    const range = towerRange(g, t);
    switch (t.type) {
      case 'fish': fireFish(g, t, range); break;
      case 'octopus': fireOctopus(g, t, range); break;
      case 'shark': startShark(g, t, range); break;
      case 'starfish': fireStarfish(g, t, range); break;
      case 'puffer': armPuffer(g, t, range); break;
      case 'seahorse': fireSeahorse(g, t, range); break;
      case 'crab': fireCrab(g, t, range); break;
    }
  }
}

function aimAt(t, e) {
  t.aim = Math.atan2(e.y - t.y, e.x - t.x);
}

function fired(g, t) {
  t.fireT = 0;
  g.events.emit('tower_fire', t.x, t.y, t.aim, t.level, t.type, t);
}

function fireFish(g, t, range) {
  if (t.cd > 0) return;
  const e = findTarget(g, t, range, 'first');
  if (!e) {
    t.cd = RETARGET;
    return;
  }
  const s = t.stats;
  aimAt(t, e);
  const p = spawnProjectile(g, 'bubble', t.x, t.y, 6);
  p.speed = s.projSpeed;
  p.dmg = s.dmg;
  p.target = e;
  p.targetId = e.id;
  p.owner = t;
  p.ownerId = t.id;
  p.life = 1.2;
  p.vx = Math.cos(t.aim) * s.projSpeed;
  p.vy = Math.sin(t.aim) * s.projSpeed;
  if (s.spread) {
    for (let k = -1; k <= 1; k += 2) {
      const a = t.aim + k * s.spread;
      const q = spawnProjectile(g, 'bubble', t.x, t.y, 6);
      q.speed = s.projSpeed;
      q.dmg = s.dmg;
      q.owner = t;
      q.ownerId = t.id;
      q.vx = Math.cos(a) * s.projSpeed;
      q.vy = Math.sin(a) * s.projSpeed;
      q.life = (range * 1.2) / s.projSpeed;
    }
  }
  t.cd = s.interval;
  fired(g, t);
}

function fireOctopus(g, t, range) {
  const s = t.stats;
  if (t.cd <= 0) {
    const e = findTarget(g, t, range, 'first');
    if (e) {
      aimAt(t, e);
      // lead the target a little along its heading
      const lead = e.speed * 0.45 * e.dir;
      const p = spawnProjectile(g, 'ink', t.x, t.y, 10);
      p.tx = e.x + Math.cos(e.angle) * lead;
      p.ty = e.y + Math.sin(e.angle) * lead;
      p.dur = 0.45;
      p.arc = 60;
      p.dmg = s.dmg;
      p.owner = t;
      p.ownerId = t.id;
      p.level = t.level;
      t.cd = s.interval;
      fired(g, t);
    } else t.cd = RETARGET;
  }
  if (t.cd2 <= 0) {
    // tentacle grab: the toughest non-held enemy in range
    const n = g.grid.query(t.x, t.y, range, scratch2);
    let best = null, bv = -1;
    for (let i = 0; i < n; i++) {
      const e = scratch2[i];
      if (e.heldT > 0) continue;
      const v = e.hp + e.shield;
      if (v > bv) {
        bv = v;
        best = e;
      }
    }
    if (best) {
      if (best.bossId) applySlow(best, 0.5, s.grabDur);
      else {
        best.heldT = s.grabDur;
        best.heldDps = s.grabDps;
      }
      t.cd2 = s.grabCd;
      g.events.emit('tentacle_grab', t.x, t.y, best.x, best.y, t.type, best);
    } else t.cd2 = RETARGET * 3;
  }
  if (s.pulseCd && t.cd3 <= 0) {
    const n = g.grid.query(t.x, t.y, range, scratch2);
    if (n > 0) {
      for (let i = 0; i < n; i++) {
        const e = scratch2[i];
        applyStun(e, s.pulseStun);
        damageEnemy(g, e, s.pulseDmg, SRC_TOWER, t);
      }
      t.cd3 = s.pulseCd;
      g.events.emit('pulse', t.x, t.y, range, n, t.type, t);
    } else t.cd3 = RETARGET * 3;
  }
}

function startShark(g, t, range) {
  if (t.cd > 0) return;
  const e = findTarget(g, t, range, 'first');
  if (!e) {
    t.cd = RETARGET;
    return;
  }
  const s = t.stats;
  aimAt(t, e);
  // sweep backwards along the path, starting just ahead of the target
  t.sweepD = Math.min(g.path.length, e.dist + 25);
  t.sweepEnd = Math.max(0, t.sweepD - s.sweep);
  t.state = 1;
  t.hitN = 0;
  t.seg = 0;
  g.events.emit('shark_charge', t.x, t.y, e.x, e.y, t.type, t);
  t.fireT = 0;
}

function updateSharkCharge(g, t, dt) {
  const s = t.stats;
  if (t.state === 1) {
    t.seg = g.path.sample(t.sweepD, tmp, t.seg);
    if (moveToward(t, tmp.x, tmp.y, DASH_SPEED * dt)) t.state = 2;
    return;
  }
  if (t.state === 2) {
    t.sweepD -= SWEEP_SPEED * dt;
    t.seg = g.path.sample(t.sweepD, tmp, t.seg);
    t.aim = tmp.angle + Math.PI;
    t.sx = tmp.x;
    t.sy = tmp.y;
    const n = g.grid.query(t.sx, t.sy, s.chompR, scratch);
    for (let i = 0; i < n; i++) {
      const e = scratch[i];
      if (alreadyHit(t, e.id)) continue;
      if (t.hitN < t.hitIds.length) t.hitIds[t.hitN++] = e.id;
      crackShell(g, e);
      if (s.armorBreak) e.armorBreakT = s.armorBreak;
      damageEnemy(g, e, s.dmg, SRC_SHARK, t);
      g.events.emit('chomp', e.x, e.y, s.dmg, 0, t.type, t);
    }
    if (t.sweepD <= t.sweepEnd) t.state = 3;
    return;
  }
  // returning home
  if (moveToward(t, t.x, t.y, DASH_SPEED * dt)) {
    t.state = 0;
    t.cd = s.interval;
  }
}

function moveToward(t, x, y, step) {
  const dx = x - t.sx, dy = y - t.sy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= step) {
    t.sx = x;
    t.sy = y;
    return true;
  }
  t.sx += (dx / d) * step;
  t.sy += (dy / d) * step;
  t.aim = Math.atan2(dy, dx);
  return false;
}

function alreadyHit(t, id) {
  for (let i = 0; i < t.hitN; i++) if (t.hitIds[i] === id) return true;
  return false;
}

function fireStarfish(g, t, range) {
  if (t.cd > 0) return;
  const e = findTarget(g, t, range, 'first');
  if (!e) {
    t.cd = RETARGET;
    return;
  }
  const s = t.stats;
  aimAt(t, e);
  const p = spawnProjectile(g, 'star', t.x, t.y, 14);
  const reach = range * 0.95;
  p.tx = t.x + Math.cos(t.aim) * reach;
  p.ty = t.y + Math.sin(t.aim) * reach;
  p.speed = 430;
  p.dmg = s.dmg;
  p.owner = t;
  p.ownerId = t.id;
  p.level = t.level;
  p.pierce = 999;
  p.life = 4;
  t.cd = s.interval;
  fired(g, t);
}

function armPuffer(g, t, range) {
  if (t.cd > 0) return;
  if (g.grid.query(t.x, t.y, range, scratch) === 0) {
    t.cd = RETARGET;
    return;
  }
  t.state = 1;
  t.inflate = 0;
  g.events.emit('tower_inflate', t.x, t.y, 0, 0, t.type, t);
}

function updatePufferFuse(g, t, dt) {
  const s = t.stats;
  if (t.hp <= 0 || t.covered) {
    t.state = 0;
    t.inflate = 0;
    return;
  }
  t.inflate += dt / s.fuse;
  if (t.inflate < 1) return;
  const n = g.grid.query(t.x, t.y, s.blast, scratch);
  for (let i = 0; i < n; i++) {
    const e = scratch[i];
    damageEnemy(g, e, s.dmg, SRC_BLAST, t);
    if (s.knockback && e.alive && !e.bossId && e.dir > 0) e.dist = Math.max(0, e.dist - s.knockback);
  }
  t.state = 0;
  t.inflate = 0;
  t.cd = s.interval;
  t.fireT = 0;
  g.events.emit('tower_explode', t.x, t.y, s.blast, n, t.type, t);
}

function fireSeahorse(g, t, range) {
  if (t.cd > 0) return;
  const e = findTarget(g, t, range, 'strong');
  if (!e) {
    t.cd = RETARGET;
    return;
  }
  const s = t.stats;
  aimAt(t, e);
  const p = spawnProjectile(g, 'dart', t.x, t.y, 5);
  p.speed = s.projSpeed;
  p.dmg = s.dmg;
  p.owner = t;
  p.ownerId = t.id;
  p.vx = Math.cos(t.aim) * s.projSpeed;
  p.vy = Math.sin(t.aim) * s.projSpeed;
  if (s.pierceLine) {
    p.pierce = 99;
    p.life = (range * 1.15) / s.projSpeed;
  } else {
    p.target = e;
    p.targetId = e.id;
    p.life = 1;
  }
  t.cd = s.interval;
  fired(g, t);
}

function fireCrab(g, t, range) {
  if (t.cd > 0) return;
  const n = g.grid.query(t.x, t.y, range, scratch);
  if (n === 0) {
    t.cd = RETARGET;
    return;
  }
  const s = t.stats;
  // pick up to `targets` enemies furthest along the path
  best3[0] = best3[1] = best3[2] = null;
  const want = Math.min(3, s.targets);
  for (let i = 0; i < n; i++) {
    let e = scratch[i];
    for (let k = 0; k < want; k++) {
      if (!best3[k] || e.dist > best3[k].dist) {
        const tmpE = best3[k];
        best3[k] = e;
        e = tmpE;
        if (!e) break;
      }
    }
  }
  for (let k = 0; k < want; k++) {
    const e = best3[k];
    if (!e) break;
    if (k === 0) aimAt(t, e);
    e.shred = Math.min(SHRED_MAX * s.shred, e.shred + s.shred);
    e.shredT = SHRED_DUR;
    damageEnemy(g, e, s.dmg, SRC_TOWER, t);
    if (g.rng.chance(s.steal)) {
      addShells(g, s.stealAmt);
      g.events.emit('pinch_steal', e.x, e.y, s.stealAmt, 0, t.type, t);
    }
  }
  t.cd = s.interval;
  fired(g, t);
}
