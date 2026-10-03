// Enemy movement + per-type abilities.

import { WORLD, WAVES } from '../config.js';
import {
  damageEnemy, damageHeart, damageTower, towerActive, hitPlayer, SRC_HELD,
} from './combat.js';
import { updateBoss, spawnStrike } from './bosses.js';

export function updateEnemies(g, dt) {
  const enemies = g.enemies;
  const path = g.path;
  const slowPer = g.stats.minusSlowPer;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    e.anim += dt;
    if (e.hitT > 0) e.hitT -= dt;
    if (e.minusT > 0) {
      e.minusT -= dt;
      // stacks fall off one at a time once the timer runs out
      if (e.minusT <= 0 && e.minus > 0) {
        e.minus--;
        if (e.minus > 0) e.minusT = 1;
      }
    }
    if (e.slowT > 0) {
      e.slowT -= dt;
      if (e.slowT <= 0) e.slow = 0;
    }
    if (e.stunT > 0) e.stunT -= dt;
    if (e.busyT > 0) e.busyT -= dt;
    if (e.shredT > 0) {
      e.shredT -= dt;
      if (e.shredT <= 0) e.shred = 0;
    }
    if (e.armorBreakT > 0) e.armorBreakT -= dt;
    if (e.exposedT > 0) e.exposedT -= dt;
    if (e.heldT > 0) {
      e.heldT -= dt;
      damageEnemy(g, e, e.heldDps * dt, SRC_HELD, null);
      if (!e.alive) continue;
    }

    let move = 1;
    if (e.bossId) {
      move = updateBoss(g, e, dt);
      if (!e.alive) continue;
    } else {
      move = updateAbility(g, e, dt);
      if (!e.alive) continue;
    }

    let slowMul = 1 - e.minus * slowPer - e.slow;
    if (e.bossId) slowMul = 1 - (e.minus * slowPer + e.slow) * 0.5;
    if (slowMul < 0.35) slowMul = 0.35;
    if (e.stunT > 0 || e.heldT > 0 || e.busyT > 0) slowMul = 0;
    if (e.def.bouncy) {
      const b = Math.sin(e.anim * 5);
      slowMul *= 0.55 + 0.9 * (0.5 + 0.5 * b);
      e.z = Math.abs(b) * 10;
    }
    e.speed = e.baseSpeed * slowMul * move;
    e.dist += e.speed * dt * e.dir;

    if (e.dir > 0 && e.dist >= path.length) {
      e.dist = path.length;
      reachEnd(g, e);
      if (!e.alive) continue;
    } else if (e.dir < 0 && e.dist <= 0) {
      // Clown Crab made it home with your shells
      e.alive = false;
      g.waveStats.shellsStolen += e.carry;
      g.events.emit('crab_escape', e.x, e.y, e.carry, 0, e.type, e);
      continue;
    }
    e.seg = path.sample(e.dist, e, e.seg);
  }
}

function reachEnd(g, e) {
  const def = e.def;
  if (e.bossId) {
    damageHeart(g, e.leak);
    g.waveStats.leaks++;
    e.dist = 0;
    e.seg = 0;
    e.laps++;
    e.baseSpeed *= WAVES.bossLapSpeedMul;
    e.leak = Math.round(e.leak * WAVES.bossLapLeakMul);
    g.events.emit('boss_lap', e.x, e.y, e.leak, e.laps, e.bossId, e);
    return;
  }
  if (def.steal) {
    const take = Math.min(def.steal, g.shells);
    g.shells -= take;
    e.carry = take;
    e.dir = -1;
    e.baseSpeed = def.returnSpeed * g.waveSpeedMul;
    g.events.emit('steal', e.x, e.y, take, 0, e.type, e);
    return;
  }
  damageHeart(g, e.leak);
  g.waveStats.leaks++;
  e.alive = false;
  g.events.emit('leak', e.x, e.y, e.leak, 0, e.type, e);
}

// Returns a movement multiplier.
function updateAbility(g, e, dt) {
  const def = e.def;
  // Baby Kraken / Mini Octopus: grab a tower and disable it
  if (def.grabCd) {
    e.t1 -= dt;
    if (e.t1 <= 0 && e.busyT <= 0 && e.stunT <= 0 && e.heldT <= 0) {
      const t = nearestTower(g, e.x, e.y, def.grabR, true);
      if (t) {
        t.grabT = def.grabDur;
        e.busyT = def.grabPause;
        e.t1 = def.grabCd;
        g.events.emit('grab', t.x, t.y, e.x, e.y, e.type, t);
      } else e.t1 = 0.25;
    }
    return 1;
  }
  // Puffer Pal: inflates when hurt, then explodes on nearby towers
  if (def.fuse) {
    if (e.state === 1) {
      e.t1 -= dt;
      e.r = e.baseR * (1 + 0.6 * (1 - Math.max(0, e.t1) / def.fuse));
      if (e.t1 <= 0) {
        const r2 = def.blastR * def.blastR;
        for (let i = 0; i < g.towers.length; i++) {
          const t = g.towers[i];
          const dx = t.x - e.x, dy = t.y - e.y;
          if (dx * dx + dy * dy <= r2) damageTower(g, t, def.blastDmg);
        }
        e.alive = false;
        g.events.emit('explode', e.x, e.y, def.blastR, 0, e.type, e);
        return 0;
      }
      return 0.5;
    }
    return 1;
  }
  // Electric Eel: zaps towers; sparks at the player when low on the reef
  if (def.zapCd) {
    e.t1 -= dt;
    if (e.t1 <= 0 && e.stunT <= 0) {
      const t = nearestTower(g, e.x, e.y, def.zapR, true);
      if (t) {
        t.zapT = def.zapDisable;
        damageTower(g, t, def.zapDmg);
        e.t1 = def.zapCd;
        g.events.emit('zap', e.x, e.y, t.x, t.y, e.type, t);
      } else e.t1 = 0.3;
    }
    e.t2 -= dt;
    if (e.t2 <= 0 && e.stunT <= 0) {
      const p = g.player;
      if (p.alive && e.y > def.sparkY && Math.abs(e.x - p.x) < def.sparkDx) {
        const s = spawnStrike(g, 'spark', e.x, e.y, p.x, WORLD.RAIL_Y, 0.9, 24);
        s.hitsPlayer = true;
        s.arc = 40;
        e.t2 = def.sparkCd;
        g.events.emit('spark', e.x, e.y, s.tx, s.ty, e.type, e);
      } else e.t2 = 0.5;
    }
    return 1;
  }
  // Star Minion: throws stars at towers
  if (def.throwCd) {
    e.t1 -= dt;
    if (e.t1 <= 0 && e.stunT <= 0) {
      const t = nearestTower(g, e.x, e.y, def.throwR, false);
      if (t) {
        const s = spawnStrike(g, 'star', e.x, e.y, t.x, t.y, 0.6, 14);
        s.tower = t;
        s.towerId = t.id;
        s.dmg = def.throwDmg;
        s.arc = 50;
        e.t1 = def.throwCd;
      } else e.t1 = 0.4;
    }
    return 1;
  }
  return 1;
}

function nearestTower(g, x, y, r, activeOnly) {
  let best = null, bd = r * r;
  for (let i = 0; i < g.towers.length; i++) {
    const t = g.towers[i];
    if (!t.alive || t.hp <= 0) continue;
    if (activeOnly && !towerActive(t)) continue;
    const dx = t.x - x, dy = t.y - y, d = dx * dx + dy * dy;
    if (d <= bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

export function updateStrikes(g, dt) {
  const p = g.player;
  for (let i = 0; i < g.strikes.length; i++) {
    const s = g.strikes[i];
    if (!s.alive) continue;
    s.t += dt;
    let k = s.t / s.dur;
    if (k > 1) k = 1;
    s.x = s.sx + (s.tx - s.sx) * k;
    s.y = s.sy + (s.ty - s.sy) * k;
    s.z = s.arc * 4 * k * (1 - k);
    if (k < 1) continue;
    s.alive = false;
    if (s.hitsPlayer && p.alive && Math.abs(p.x - s.tx) < s.r + p.r * 0.6) hitPlayer(g);
    if (s.tower) {
      const r2 = (s.r + 30) * (s.r + 30);
      for (let j = 0; j < g.towers.length; j++) {
        const t = g.towers[j];
        if (!t.alive) continue;
        const dx = t.x - s.tx, dy = t.y - s.ty;
        if (dx * dx + dy * dy > r2) continue;
        damageTower(g, t, s.dmg);
        if (s.blind > t.blindT) t.blindT = s.blind;
      }
    }
    g.events.emit('strike_land', s.tx, s.ty, s.r, s.hitsPlayer ? 1 : 0, s.kind);
  }
}
