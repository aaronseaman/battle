// The player's clay fish: rail movement, the shared bubble meter, Plus/Minus fire,
// and shell pickups.

import { PLAYER, WORLD } from '../config.js';
import { spawnProjectile, firePlusAt } from './projectiles.js';
import { clamp } from './util.js';
import { addShells } from './combat.js';

export function resetPlayer(g) {
  const p = g.player;
  p.alive = true;
  p.deadT = 0;
  p.invulnT = 0;
  p.hearts = p.maxHearts;
  p.meter = g.stats.meterMax;
  p.cdMinus = 0;
  p.cdPlus = 0;
  p.vx = 0;
  p.shootT = 9;
  p.plusShootT = 9;
}

export function updatePlayer(g, dt) {
  const p = g.player;
  const inp = g.input;
  const st = g.stats;

  if (!p.alive) {
    p.deadT -= dt;
    if (p.deadT <= 0) {
      p.alive = true;
      if (p.hearts <= 0) p.hearts = 1;
      p.invulnT = PLAYER.invuln;
      g.events.emit('player_respawn', p.x, p.y, p.hearts);
    }
  } else if (p.invulnT > 0) p.invulnT -= dt;

  // movement: digital left/right wins; otherwise steer toward a touch/mouse x
  let dir = 0;
  if (inp.left) dir -= 1;
  if (inp.right) dir += 1;
  if (dir === 0 && inp.moveX >= 0) {
    const d = inp.moveX - p.x;
    if (Math.abs(d) > 3) dir = clamp(d / 40, -1, 1);
  }
  p.vx = p.alive ? dir * PLAYER.speed : 0;
  p.x = clamp(p.x + p.vx * dt, WORLD.RAIL_MIN, WORLD.RAIL_MAX);

  p.meter = Math.min(st.meterMax, p.meter + st.meterRegen * (g.mods.meterMul || 1) * dt);
  p.cdMinus -= dt;
  p.cdPlus -= dt;
  p.shootT += dt;
  p.plusShootT += dt;

  if (!p.alive) return;

  if (inp.minus && p.cdMinus <= 0) {
    if (p.meter >= PLAYER.minusCost) fireMinus(g);
    else if (inp.minusPressed) g.events.emit('meter_empty', p.x, p.y, 1);
  }
  if (inp.plus && p.cdPlus <= 0) {
    if (p.meter >= PLAYER.plusCost) firePlus(g);
    else if (inp.plusPressed) g.events.emit('meter_empty', p.x, p.y, 2);
  }
  inp.minusPressed = false;
  inp.plusPressed = false;
}

function fireMinus(g) {
  const p = g.player;
  const st = g.stats;
  p.meter -= PLAYER.minusCost;
  p.cdMinus = PLAYER.minusCd;
  p.shootT = 0;
  const y = WORLD.RAIL_Y - p.r;
  if (g.unlocked.twinMinus) {
    for (let k = -1; k <= 1; k += 2) {
      const b = spawnProjectile(g, 'minus', p.x + k * PLAYER.twinOffset, y, PLAYER.minusR);
      b.vy = -PLAYER.minusSpeed;
      b.dmg = st.minusDmg * PLAYER.twinDmgMul;
    }
  } else {
    const b = spawnProjectile(g, 'minus', p.x, y, PLAYER.minusR);
    b.vy = -PLAYER.minusSpeed;
    b.dmg = st.minusDmg;
  }
  g.events.emit('shoot_minus', p.x, y);
}

// A shielded enemy (or armored boss) directly above the fish takes priority:
// Plus becomes a shield-popper when you line it up.
export function shieldTargetAbove(g) {
  const p = g.player;
  let best = null;
  for (let i = 0; i < g.enemies.length; i++) {
    const e = g.enemies[i];
    if (!e.alive || e.y > p.y) continue;
    const shielded = e.shield > 0 || (e.bossId === 'queen' && e.state === 0);
    if (!shielded || Math.abs(e.x - p.x) > e.r * 0.8 + 14) continue;
    if (!best || e.y > best.y) best = e;
  }
  return best;
}

// Otherwise Plus picks the nearest thing that needs help, weighting horizontal
// distance heavily so the fish's position on the rail decides the target.
export function pickPlusTarget(g) {
  const p = g.player;
  let best = null, bd = Infinity;
  for (let i = 0; i < g.towers.length; i++) {
    const t = g.towers[i];
    if (!t.alive) continue;
    const needs = t.hp < t.maxHp || t.grabT > 0 || t.zapT > 0 || t.blindT > 0 || t.stunT > 0;
    if (!needs) continue;
    const d = plusDist(p, t.x, t.y);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  const h = g.heart;
  if (h.hp < h.maxHp && plusDist(p, h.x, h.y) < bd) return h;
  if (best) return best;
  // nobody hurt: buff the nearest un-buffed tower (or any tower)
  let any = null, ad = Infinity;
  for (let i = 0; i < g.towers.length; i++) {
    const t = g.towers[i];
    if (!t.alive) continue;
    const d = plusDist(p, t.x, t.y) + (t.plusT > 0 ? 1e6 : 0);
    if (d < ad) {
      ad = d;
      any = t;
    }
  }
  return any || h;
}

function plusDist(p, x, y) {
  const dx = x - p.x, dy = (y - p.y) * 0.35;
  return dx * dx + dy * dy;
}

function firePlus(g) {
  const p = g.player;
  p.meter -= PLAYER.plusCost;
  p.cdPlus = PLAYER.plusCd;
  p.plusShootT = 0;
  const y = WORLD.RAIL_Y - p.r;
  const foe = shieldTargetAbove(g);
  if (foe) {
    firePlusAt(g, p.x, y, foe.x, foe.y, 'enemy', foe, PLAYER.plusSpeed * 1.3, PLAYER.plusR);
    g.events.emit('shoot_plus', p.x, y, foe.x, foe.y);
    return;
  }
  const target = pickPlusTarget(g);
  if (target === g.heart) firePlusAt(g, p.x, y, target.x, target.y, 'heart', null, PLAYER.plusSpeed, PLAYER.plusR);
  else firePlusAt(g, p.x, y, target.x, target.y, 'tower', target, PLAYER.plusSpeed, PLAYER.plusR);
  g.events.emit('shoot_plus', p.x, y, target.x, target.y);
}

export function updatePickups(g, dt) {
  const p = g.player;
  const st = g.stats;
  const floor = WORLD.RAIL_Y - 6;
  for (let i = 0; i < g.pickups.length; i++) {
    const s = g.pickups[i];
    if (!s.alive) continue;
    s.phase += dt;
    if (p.alive) {
      const dx = p.x - s.x, dy = p.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < (p.r + 14) * (p.r + 14)) {
        collectPickup(g, s);
        continue;
      }
      if (d2 < st.magnetR * st.magnetR) {
        const d = Math.sqrt(d2);
        s.x += (dx / d) * 420 * dt;
        s.y += (dy / d) * 420 * dt;
        continue;
      }
    }
    if (!s.landed) {
      s.y += s.vy * dt;
      s.x += Math.sin(s.phase * 3) * 18 * dt;
      if (s.y >= floor) {
        s.y = floor;
        s.landed = true;
      }
    } else {
      s.t += dt;
      if (s.t > 7) s.alive = false;
    }
  }
}

export function collectPickup(g, s) {
  s.alive = false;
  addShells(g, s.value);
  const p = g.player;
  p.meter = Math.min(g.stats.meterMax, p.meter + g.stats.pickupMeter);
  g.events.emit('pickup', s.x, s.y, s.value);
}
