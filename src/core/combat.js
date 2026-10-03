// Shared combat rules: spawning, damage, healing, rewards. Every system goes
// through these so modifiers (armor, shields, Minus stacks, boss phases) are
// applied consistently.

import { ENEMIES, PLAYER, ECONOMY, WORLD, WAVES, SCORE } from '../config.js';
import { MODE } from './entities.js';
import { bossDamageMul, onBossDeath } from './bosses.js';
import { startDive } from './enemies.js';
import { clamp } from './util.js';

export const SRC_TOWER = 0;
export const SRC_MINUS = 1;
export const SRC_PLUS = 2;
export const SRC_SHARK = 3;
export const SRC_STAR = 4;
export const SRC_HELD = 5;
export const SRC_BLAST = 6;

// Creates an enemy at (x, y). The caller decides how it moves (formation entry,
// or startDive for free divers such as split jellies and boss minions).
export function spawnEnemy(g, type, x, y, shield = false) {
  const def = ENEMIES[type];
  const e = g.pools.enemy.get();
  e.reset();
  e.id = ++g.nextId;
  e.alive = true;
  e.type = type;
  e.def = def;
  e.x = e.px = x;
  e.y = e.py = y;
  e.hp = e.maxHp = def.hp * g.waveHpMul;
  e.r = e.baseR = def.r;
  e.baseSpeed = def.speed * g.waveSpeedMul;
  e.armor = def.armor || 0;
  e.leak = def.leak;
  e.shells = def.shells * g.waveShellMul;
  e.anim = g.rng.next() * 10;
  if (shield) e.shield = e.maxShield = e.maxHp * WAVES.shieldFrac;
  // stagger ability timers so groups don't act in lockstep
  if (def.grabCd) e.t1 = g.rng.range(1, 3);
  if (def.zapCd) {
    e.t1 = g.rng.range(1, 2.5);
    e.t2 = g.rng.range(1.5, 3);
  }
  if (def.throwCd) e.t1 = g.rng.range(1, 2);
  if (def.shotCd) e.shotT = def.shotCd * g.rng.range(0.4, 1.2);
  g.enemies.push(e);
  return e;
}

// A free diver (no formation slot) that starts diving right away.
export function spawnDiver(g, type, x, y, shield = false) {
  const e = spawnEnemy(g, type, x, y, shield);
  startDive(g, e, -1);
  return e;
}

export function towerActive(t) {
  return t.alive && t.hp > 0 && t.grabT <= 0 && t.zapT <= 0 && t.blindT <= 0 && t.stunT <= 0 && !t.covered;
}

export function damageEnemy(g, e, amount, src, tower = null) {
  if (!e.alive || amount <= 0) return 0;
  let mul = 1;
  if (e.bossId) mul *= bossDamageMul(g, e, src);
  if (e.sad) mul *= PLAYER.sadDmgTaken;
  // Minus stacks and crab shred lower armor; below zero they become bonus damage.
  let armor = (e.cracked ? 0 : e.armor) - e.minus * g.stats.minusArmorPer - e.shred;
  if (e.armorBreakT > 0) armor = Math.min(armor, 0) - 0.15;
  if (armor < -0.4) armor = -0.4;
  let dmg = amount * mul * (1 - armor);
  if (e.shield > 0) {
    if (dmg < e.shield) {
      e.shield -= dmg;
      e.hitT = 0.08;
      return 0;
    }
    dmg -= e.shield;
    e.shield = 0;
    g.events.emit('shield_pop', e.x, e.y, 0, 0, e.type, e);
  }
  e.hp -= dmg;
  e.hitT = 0.1;
  if (tower) tower.dmgDone += dmg;
  g.events.emit('hit', e.x, e.y, dmg, src, e.type, e);
  if (e.hp <= 0) killEnemy(g, e, tower);
  else if (e.def.fuse && e.state === 0) {
    // Puffer Pal starts inflating the first time it is hurt
    e.state = 1;
    e.t1 = e.def.fuse;
    g.events.emit('inflate', e.x, e.y, 0, 0, e.type, e);
  }
  return dmg;
}

export function applyMinus(g, e) {
  if (!e.alive || e.shield > 0) return;
  if (e.minus < PLAYER.minusStackMax) e.minus++;
  e.minusT = PLAYER.minusStackDur;
  if (e.minus >= PLAYER.sadAt) {
    if (e.def.shell && !e.cracked) crackShell(g, e);
    if (!e.sad && !e.bossId) {
      e.sad = true;
      e.r = e.baseR * PLAYER.sadScale;
      g.events.emit('sad', e.x, e.y, 0, 0, e.type, e);
    }
  }
}

export function crackShell(g, e) {
  if (e.cracked || !e.def.shell) return;
  e.cracked = true;
  g.events.emit('crack', e.x, e.y, 0, 0, e.type, e);
}

export function applySlow(e, amount, dur) {
  if (e.bossId) amount *= 0.5;
  if (amount > e.slow || e.slowT <= 0) e.slow = amount;
  if (dur > e.slowT) e.slowT = dur;
}

export function applyStun(e, dur) {
  if (e.bossId) dur *= 0.35;
  if (dur > e.stunT) e.stunT = dur;
}

export function killEnemy(g, e, tower = null) {
  if (!e.alive) return;
  e.alive = false;
  e.hp = 0;
  g.waveStats.kills++;
  g.runStats.kills++;
  if (tower) tower.kills++;
  if (e.bossId) {
    onBossDeath(g, e);
    return;
  }
  const def = e.def;
  const shells = Math.max(1, Math.round(e.shells * (e.sad ? PLAYER.sadShellMul : 1)));
  addShells(g, shells);
  const diving = e.mode === MODE.DIVE || e.mode === MODE.FLEE;
  const pts = addScore(g, def.score * (diving ? SCORE.diveMul : 1));
  g.events.emit('kill', e.x, e.y, shells, e.sad ? 1 : 0, e.type, e);
  g.events.emit('score', e.x, e.y, pts, g.combo, diving ? 'dive' : '');
  if (e.carry > 0) {
    addShells(g, e.carry);
    g.events.emit('recover', e.x, e.y, e.carry, 0, e.type, e);
    e.carry = 0;
  }
  if (e.sad || g.rng.chance(ECONOMY.pickupChance)) spawnPickup(g, e.x, e.y, e.sad ? 3 : 2);
  if (def.split) {
    for (let k = 0; k < def.splitN; k++) {
      const off = k - (def.splitN - 1) / 2;
      const m = spawnDiver(g, def.split, e.x + off * 24, e.y);
      m.vx = off * 240;
      m.vy = -80;
    }
    g.events.emit('split', e.x, e.y, def.splitN, 0, e.type, e);
  }
}

// Every pop extends the combo; quick chains multiply the score (up to SCORE.comboMax).
export function addScore(g, base) {
  g.combo++;
  g.comboT = SCORE.comboWindow;
  const mul = Math.min(SCORE.comboMax, 1 + (g.combo - 1) * SCORE.comboStep);
  const pts = Math.round((base * mul) / 10) * 10;
  g.score += pts;
  g.waveStats.score += pts;
  return pts;
}

// A diver rammed the fish: it breaks apart without paying out (stolen shells drop back).
export function crashEnemy(g, e) {
  if (!e.alive) return;
  e.alive = false;
  e.hp = 0;
  if (e.carry > 0) {
    addShells(g, e.carry);
    g.events.emit('recover', e.x, e.y, e.carry, 0, e.type, e);
    e.carry = 0;
  }
  g.events.emit('crash', e.x, e.y, 0, 0, e.type, e);
}

export function addShells(g, n) {
  g.shells += n;
  g.waveStats.shells += n;
  g.runStats.shells += n;
}

export function damageHeart(g, amount) {
  const h = g.heart;
  if (amount <= 0 || h.hp <= 0) return;
  h.hp = Math.max(0, h.hp - amount);
  h.hitT = 0.4;
  g.waveStats.heartDmg += amount;
  g.events.emit('heart_hit', h.x, h.y, amount, h.hp);
}

export function damageTower(g, t, amount, silent = false) {
  if (!t.alive || t.hp <= 0 || amount <= 0) return;
  t.hp -= amount;
  if (!silent) g.events.emit('tower_hit', t.x, t.y, amount, 0, t.type, t);
  if (t.hp <= 0) {
    t.hp = 0;
    g.events.emit('tower_broken', t.x, t.y, 0, 0, t.type, t);
  }
}

export function removeTower(g, t) {
  const so = g.sockets[t.socket];
  if (so && so.tower === t) so.tower = null;
  if (so && so.tentacle) {
    so.tentacle.alive = false;
    so.tentacle = null;
  }
  t.alive = false;
  const i = g.towers.indexOf(t);
  if (i >= 0) g.towers.splice(i, 1);
}

export function healTower(g, t, amount) {
  if (!t.alive || t.hp >= t.maxHp) return 0;
  const before = t.hp;
  t.hp = Math.min(t.maxHp, t.hp + amount);
  if (before <= 0 && t.hp > 0) g.events.emit('tower_revived', t.x, t.y, 0, 0, t.type, t);
  return t.hp - before;
}

export function clearTowerDebuffs(t) {
  t.grabT = 0;
  t.zapT = 0;
  t.blindT = 0;
  t.stunT = 0;
}

export function spawnPickup(g, x, y, value) {
  const p = g.pools.pickup.get();
  p.reset();
  p.alive = true;
  p.x = p.px = clamp(x, WORLD.RAIL_MIN, WORLD.RAIL_MAX);
  p.y = p.py = y;
  p.vy = 140 + g.rng.next() * 60;
  p.vx = 0;
  p.value = value;
  p.phase = g.rng.next() * 6.28;
  g.pickups.push(p);
  return p;
}

export function hitPlayer(g) {
  const p = g.player;
  if (!p.alive || p.invulnT > 0) return false;
  p.hearts--;
  p.alive = false;
  p.deadT = p.hearts > 0 ? PLAYER.respawn : PLAYER.respawnKO;
  const lose = Math.min(g.shells, clamp(Math.floor(g.shells * PLAYER.dropFrac), PLAYER.dropMin, PLAYER.dropMax));
  g.shells -= lose;
  const n = Math.min(6, lose);
  let left = lose;
  for (let i = 0; i < n; i++) {
    const v = i === n - 1 ? left : Math.floor(lose / n);
    left -= v;
    const pk = spawnPickup(g, p.x + (i - (n - 1) / 2) * 34, WORLD.RAIL_Y - 70, v);
    pk.vy = 160;
  }
  g.waveStats.playerHits++;
  g.events.emit('player_hit', p.x, p.y, p.hearts, lose);
  return true;
}
