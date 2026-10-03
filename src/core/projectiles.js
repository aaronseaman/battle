// Projectile motion + collision for player bubbles and tower shots.

import { BOSSES } from '../config.js';
import {
  damageEnemy, applyMinus, applySlow, healTower, clearTowerDebuffs,
  SRC_TOWER, SRC_MINUS, SRC_PLUS, SRC_STAR,
} from './combat.js';
import { chefHatX, onBossPlusHit, onBossStarHit, damageTentacle } from './bosses.js';

const scratch = [];

export function spawnProjectile(g, kind, x, y, r) {
  const p = g.pools.proj.get();
  p.reset();
  p.id = ++g.nextId;
  p.alive = true;
  p.kind = kind;
  p.x = p.sx = p.px = x;
  p.y = p.sy = p.py = y;
  p.r = r;
  g.projectiles.push(p);
  return p;
}

function seen(p, id) {
  for (let i = 0; i < p.hitN; i++) if (p.hitIds[i] === id) return true;
  return false;
}

function mark(p, id) {
  if (p.hitN < p.hitIds.length) p.hitIds[p.hitN++] = id;
}

export function updateProjectiles(g, dt) {
  const list = g.projectiles;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive) continue;
    p.t += dt;
    switch (p.kind) {
      case 'minus': updateMinus(g, p, dt); break;
      case 'plus': updatePlus(g, p, dt); break;
      case 'bubble':
      case 'dart': updateShot(g, p, dt); break;
      case 'ink': updateInk(g, p); break;
      case 'star': updateStar(g, p, dt); break;
      case 'ministar': updateShot(g, p, dt); break;
    }
  }
}

function updateMinus(g, p, dt) {
  p.y += p.vy * dt;
  if (p.y < -60) {
    p.alive = false;
    return;
  }
  // Kraken Kitty tentacles block Minus bubbles (and only Minus can break them)
  for (let i = 0; i < g.tentacles.length; i++) {
    const tn = g.tentacles[i];
    if (!tn.alive) continue;
    const dx = tn.x - p.x, dy = tn.y - p.y, rr = tn.r + p.r;
    if (dx * dx + dy * dy <= rr * rr) {
      damageTentacle(g, tn, p.dmg);
      p.alive = false;
      return;
    }
  }
  const n = g.grid.query(p.x, p.y, p.r, scratch);
  if (n === 0) return;
  // the enemy lowest on screen is the one the rising bubble touches first
  let hit = scratch[0];
  for (let i = 1; i < n; i++) if (scratch[i].y > hit.y) hit = scratch[i];
  let dmg = p.dmg;
  if (hit.bossId === 'chef') {
    const def = BOSSES.chef;
    if (Math.abs(p.x - chefHatX(hit)) <= def.hatR + p.r) {
      dmg *= def.hatMul;
      g.events.emit('weak_hit', p.x, hit.y - hit.r, dmg, 0, hit.bossId, hit);
    }
  }
  damageEnemy(g, hit, dmg, SRC_MINUS, null);
  applyMinus(g, hit);
  g.events.emit('minus_hit', p.x, p.y, dmg, hit.minus, hit.type, hit);
  p.alive = false;
}

function plusHitEnemy(g, p, e) {
  mark(p, e.id);
  const had = e.shield > 0;
  if (e.bossId) onBossPlusHit(g, e, had);
  if (had) {
    e.shield = 0;
    g.events.emit('shield_pop', e.x, e.y, 1, 0, e.type, e);
  }
  damageEnemy(g, e, g.stats.plusDmg, SRC_PLUS, null);
}

function updatePlus(g, p, dt) {
  // shield-popping shots home in on their (moving) enemy
  const tg = p.target;
  if (p.targetKind === 'enemy' && tg && tg.alive && tg.id === p.targetId) {
    p.tx = tg.x;
    p.ty = tg.y;
  }
  // follow a parabolic arc to the target (towers and the heart never move)
  let k = p.t / p.dur;
  if (k > 1) k = 1;
  p.x = p.sx + (p.tx - p.sx) * k;
  p.y = p.sy + (p.ty - p.sy) * k;
  p.z = p.arc * 4 * k * (1 - k);
  // passes through enemies: tiny damage, pops shields
  const n = g.grid.query(p.x, p.y, p.r, scratch);
  for (let i = 0; i < n; i++) {
    const e = scratch[i];
    if (!seen(p, e.id)) plusHitEnemy(g, p, e);
  }
  if (k < 1) return;
  p.alive = false;
  if (p.targetKind === 'enemy') {
    if (tg && tg.alive && tg.id === p.targetId && !seen(p, tg.id)) plusHitEnemy(g, p, tg);
    g.events.emit('plus_enemy', p.x, p.y);
    return;
  }
  if (p.targetKind === 'heart') {
    const h = g.heart;
    const before = h.hp;
    h.hp = Math.min(h.maxHp, h.hp + g.stats.plusHealHeart);
    g.events.emit('plus_heart', h.x, h.y, h.hp - before, 0, 'heart', null);
    return;
  }
  if (!tg || !tg.alive || tg.id !== p.targetId) {
    g.events.emit('plus_miss', p.x, p.y);
    return;
  }
  const healed = healTower(g, tg, g.stats.plusHealTower);
  clearTowerDebuffs(tg);
  if (tg.plusT < g.stats.plusPowerDur) tg.plusT = g.stats.plusPowerDur;
  g.events.emit('plus_tower', tg.x, tg.y, healed, 0, tg.type, tg);
}

// Homing (target set) or straight (pierce) shots: fish bubbles, seahorse darts, mini-stars.
function updateShot(g, p, dt) {
  p.life -= dt;
  if (p.life <= 0) {
    p.alive = false;
    return;
  }
  const tg = p.target;
  if (tg) {
    if (tg.alive && tg.id === p.targetId) {
      const dx = tg.x - p.x, dy = tg.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= tg.r + p.r + p.speed * dt) {
        p.x = tg.x;
        p.y = tg.y;
        damageEnemy(g, tg, p.dmg, SRC_TOWER, ownerOf(p));
        p.alive = false;
        return;
      }
      p.vx = (dx / d) * p.speed;
      p.vy = (dy / d) * p.speed;
    } else p.target = null; // target died — fly on straight and hit whatever is there
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.target) return;
  const n = g.grid.query(p.x, p.y, p.r, scratch);
  for (let i = 0; i < n; i++) {
    const e = scratch[i];
    if (seen(p, e.id)) continue;
    mark(p, e.id);
    damageEnemy(g, e, p.dmg, SRC_TOWER, ownerOf(p));
    if (--p.pierce <= 0) {
      p.alive = false;
      return;
    }
  }
}

function ownerOf(p) {
  const o = p.owner;
  return o && o.alive && o.id === p.ownerId ? o : null;
}

function updateInk(g, p) {
  let k = p.t / p.dur;
  if (k > 1) k = 1;
  p.x = p.sx + (p.tx - p.sx) * k;
  p.y = p.sy + (p.ty - p.sy) * k;
  p.z = p.arc * 4 * k * (1 - k);
  if (k < 1) return;
  p.alive = false;
  const o = ownerOf(p);
  const s = o ? o.stats : null;
  const splash = s ? s.splash : 55;
  const n = g.grid.query(p.x, p.y, splash, scratch);
  for (let i = 0; i < n; i++) {
    const e = scratch[i];
    damageEnemy(g, e, p.dmg, SRC_TOWER, o);
    if (s) applySlow(e, s.slow, s.slowDur);
  }
  g.events.emit('ink_splash', p.x, p.y, splash, n, 'octopus', o);
}

function updateStar(g, p, dt) {
  p.life -= dt;
  let gx, gy, sp;
  if (p.leg === 0) {
    gx = p.tx;
    gy = p.ty;
    sp = p.speed;
  } else {
    gx = p.sx;
    gy = p.sy;
    sp = p.speed * 1.15;
  }
  const dx = gx - p.x, dy = gy - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const step = sp * dt;
  if (d <= step || p.life <= 0) {
    p.x = gx;
    p.y = gy;
    if (p.leg === 0 && p.life > 0) {
      p.leg = 1;
      p.hitN = 0;
      const o = ownerOf(p);
      if (o && o.stats.split) splitStar(g, p, o.stats);
    } else {
      p.alive = false;
      return;
    }
  } else {
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
  }
  const n = g.grid.query(p.x, p.y, p.r, scratch);
  for (let i = 0; i < n; i++) {
    const e = scratch[i];
    if (seen(p, e.id)) continue;
    mark(p, e.id);
    if (e.bossId) onBossStarHit(g, e);
    damageEnemy(g, e, p.dmg, SRC_STAR, ownerOf(p));
  }
}

function splitStar(g, p, s) {
  const n = s.split;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + p.t;
    const q = spawnProjectile(g, 'ministar', p.x, p.y, 8);
    q.speed = 380;
    q.vx = Math.cos(a) * q.speed;
    q.vy = Math.sin(a) * q.speed;
    q.dmg = s.splitDmg;
    q.pierce = 2;
    q.life = 0.35;
    q.owner = p.owner;
    q.ownerId = p.ownerId;
  }
}

export const PLUS_SPEED_MIN_DUR = 0.35;
export const PLUS_SPEED_MAX_DUR = 1.3;

export function firePlusAt(g, sx, sy, tx, ty, targetKind, target, speed, r) {
  const p = spawnProjectile(g, 'plus', sx, sy, r);
  const d = Math.hypot(tx - sx, ty - sy);
  p.tx = tx;
  p.ty = ty;
  p.dur = Math.min(PLUS_SPEED_MAX_DUR, Math.max(PLUS_SPEED_MIN_DUR, d / speed));
  p.arc = targetKind === 'enemy' ? Math.min(90, d * 0.12) : Math.min(220, d * 0.3);
  p.targetKind = targetKind;
  p.target = target;
  p.targetId = target ? target.id : 0;
  return p;
}
