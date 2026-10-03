// Enemy movement + per-type abilities.
//
// Every wave, squadrons swoop in along curves (MODE.ENTER) and settle into a
// swaying formation (MODE.FORM). The dive scheduler (waves.js) peels enemies
// off to dive at the reef (MODE.DIVE), steering toward the fish (or a buddy)
// and dropping shots. A diver that reaches REEF_Y bites the Coral Heart, then
// loops back in from the top (MODE.RETURN) to its slot. Clown Crabs steal
// shells instead and flee upward (MODE.FLEE).

import { WORLD, WAVES, FORMATION, ENTRY, DIVE, ENEMY_SHOT } from '../config.js';
import { MODE } from './entities.js';
import {
  spawnEnemy, damageEnemy, damageHeart, damageTower, towerActive, hitPlayer, crashEnemy, SRC_HELD,
} from './combat.js';
import { updateBoss, moveBoss, spawnStrike } from './bosses.js';
import { clamp } from './util.js';

const TAU = Math.PI * 2;
export const TOP_Y = -90; // divers that bit the reef come back in from here
const tmp = { x: 0, y: 0 };

export function resetFormation(g) {
  const f = g.formation;
  f.x = FORMATION.x;
  f.y = FORMATION.y;
  f.t = 0;
  f.descend = 0;
}

export function updateFormation(g, dt) {
  const F = FORMATION, f = g.formation;
  f.t += dt;
  f.x = F.x + Math.sin((f.t / F.swayPeriod) * TAU) * F.sway;
  f.descend = Math.min(F.descendMax, f.descend + F.descend * dt);
  f.y = F.y + f.descend;
}

// World position of a formation slot right now. Slot 0 is the back-left corner.
export function slotPos(g, slot, out) {
  const F = FORMATION, f = g.formation;
  const col = slot % F.cols, row = (slot / F.cols) | 0;
  out.x = f.x + (col - (F.cols - 1) / 2) * F.dx;
  out.y = f.y + row * F.dy;
  return out;
}

// Spawns one member of a squadron. side: 0/1 swoop down from the top-left/right
// and loop up into the grid; 2/3 sweep in from the left/right edge.
export function spawnFormation(g, spec) {
  const e = spawnEnemy(g, spec.type, 0, 0, spec.shield);
  const W = WORLD.W;
  const mx = spec.side & 1 ? (x) => W - x : (x) => x;
  if (spec.side < 2) {
    e.ax = mx(170);
    e.ay = TOP_Y + 20;
    e.bx = mx(170);
    e.by = 720;
    e.cx = mx(650);
    e.cy = 720;
  } else {
    e.ax = mx(-60);
    e.ay = 560;
    e.bx = mx(420);
    e.by = 640;
    e.cx = mx(560);
    e.cy = 160;
  }
  e.x = e.px = e.ax;
  e.y = e.py = e.ay;
  e.slot = spec.slot;
  e.mode = MODE.ENTER;
  e.moveT = 0;
  return e;
}

// Peel off and dive. aimX < 0: aim at the fish (or a buddy for grabbers).
export function startDive(g, e, aimX = -1) {
  const def = e.def, p = g.player;
  e.mode = MODE.DIVE;
  e.moveT = 0;
  e.vx = (e.x < WORLD.W / 2 ? -1 : 1) * DIVE.popVx;
  e.vy = DIVE.popVy;
  e.target = null;
  e.targetId = 0;
  if (def.targetBuddy) {
    // reservoir-sample an active buddy to grab
    let seen = 0;
    for (let i = 0; i < g.towers.length; i++) {
      const t = g.towers[i];
      if (!towerActive(t)) continue;
      seen++;
      if (g.rng.next() * seen < 1) e.target = t;
    }
    if (e.target) e.targetId = e.target.id;
  }
  if (aimX >= 0) e.tx = aimX;
  else if (e.target) e.tx = e.target.x;
  else if (def.steal || !p.alive) e.tx = g.rng.range(80, WORLD.W - 80);
  else e.tx = p.x;
  g.events.emit('dive', e.x, e.y, e.tx, 0, e.type, e);
}

export function updateEnemies(g, dt) {
  const enemies = g.enemies;
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

    let move;
    if (e.bossId) move = updateBoss(g, e, dt);
    else {
      move = updateAbility(g, e, dt);
      if (e.alive) updateShots(g, e, dt);
    }
    if (!e.alive) continue;

    let slowMul = 1 - e.minus * slowPer - e.slow;
    if (e.bossId) slowMul = 1 - (e.minus * slowPer + e.slow) * 0.5;
    if (slowMul < 0.35) slowMul = 0.35;
    if (e.stunT > 0 || e.heldT > 0 || e.busyT > 0) slowMul = 0;
    if (e.def.bouncy) {
      const b = Math.sin(e.anim * 5);
      slowMul *= 0.55 + 0.9 * (0.5 + 0.5 * b);
      e.z = Math.abs(b) * 10;
    }
    const m = slowMul * move;
    e.speed = e.baseSpeed * m;
    const ox = e.x, oy = e.y;
    if (e.bossId) moveBoss(g, e, dt, m);
    else {
      moveEnemy(g, e, dt, m);
      if (!e.alive) continue;
    }
    const dx = e.x - ox, dy = e.y - oy;
    if (dy < -200) continue; // looped back to the top this tick
    // divers keep their steering velocity; everyone else reports what they moved
    if (e.mode !== MODE.DIVE || e.bossId) {
      e.vx = dx / dt;
      e.vy = dy / dt;
    }
    if (dx * dx + dy * dy > 0.01) e.angle = Math.atan2(dy, dx);
  }
}

function moveEnemy(g, e, dt, m) {
  switch (e.mode) {
    case MODE.ENTER: {
      if (m <= 0) return;
      e.moveT += dt * Math.min(1, m);
      const u = (e.moveT * g.waveSpeedMul) / ENTRY.dur;
      slotPos(g, e.slot, tmp);
      if (u >= 1) {
        e.mode = MODE.FORM;
        e.moveT = 0;
        e.x = tmp.x;
        e.y = tmp.y;
        return;
      }
      // cubic Bezier: start, two controls, the (moving) slot
      const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
      e.x = a * e.ax + b * e.bx + c * e.cx + d * tmp.x;
      e.y = a * e.ay + b * e.by + c * e.cy + d * tmp.y;
      return;
    }
    case MODE.FORM:
      slotPos(g, e.slot, tmp);
      e.x = tmp.x;
      e.y = tmp.y + Math.sin(e.anim * 2.4) * FORMATION.bob;
      return;
    case MODE.DIVE:
      dive(g, e, dt, m);
      return;
    case MODE.RETURN: {
      if (m <= 0) return;
      slotPos(g, e.slot, tmp);
      const dx = tmp.x - e.x, dy = tmp.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const step = DIVE.returnSpeed * g.waveSpeedMul * Math.min(1, m) * dt;
      if (d <= step) {
        e.x = tmp.x;
        e.y = tmp.y;
        e.mode = MODE.FORM;
        e.moveT = 0;
        return;
      }
      e.x += (dx / d) * step;
      e.y += (dy / d) * step;
      return;
    }
    case MODE.FLEE: {
      if (m <= 0) return;
      e.moveT += dt * m;
      e.y -= e.def.returnSpeed * g.waveSpeedMul * m * dt;
      e.x = clamp(e.x + Math.cos(e.moveT * 3) * 80 * m * dt, 20, WORLD.W - 20);
      if (ram(g, e)) return;
      if (e.y < TOP_Y + 30) {
        // Clown Crab made it out with your shells
        e.alive = false;
        g.waveStats.shellsStolen += e.carry;
        g.events.emit('crab_escape', e.x, e.y, e.carry, 0, e.type, e);
      }
    }
  }
}

function dive(g, e, dt, m) {
  if (m <= 0) return;
  const def = e.def, p = g.player;
  e.moveT += dt * m;
  if (def.home > 0) {
    const t = e.target;
    const aim = t && t.alive && t.id === e.targetId ? t.x : p.alive ? p.x : g.heart.x;
    e.tx += (aim - e.tx) * Math.min(1, def.home * dt);
  }
  const w = def.weaveHz * TAU;
  const weave = def.weave * w * Math.cos(w * e.moveT + e.anim);
  const want = clamp((e.tx - e.x) * DIVE.steer, -DIVE.maxVx, DIVE.maxVx) + weave;
  e.vx += (want - e.vx) * Math.min(1, DIVE.turn * dt);
  e.vy = Math.min(e.baseSpeed, e.vy + DIVE.accel * dt);
  e.x += e.vx * m * dt;
  e.y += e.vy * m * dt;
  if (e.x < 16) {
    e.x = 16;
    if (e.vx < 0) e.vx *= -0.5;
  } else if (e.x > WORLD.W - 16) {
    e.x = WORLD.W - 16;
    if (e.vx > 0) e.vx *= -0.5;
  }
  if (ram(g, e)) return;
  if (e.y >= WORLD.REEF_Y) reachReef(g, e);
}

// Diving into the fish knocks it out — and breaks the diver.
function ram(g, e) {
  const p = g.player;
  if (!p.alive || p.invulnT > 0) return false;
  const dx = p.x - e.x, dy = p.y - e.y, rr = e.r + p.r * 0.8;
  if (dx * dx + dy * dy >= rr * rr) return false;
  if (!hitPlayer(g)) return false;
  crashEnemy(g, e);
  return true;
}

function reachReef(g, e) {
  const def = e.def;
  if (def.steal) {
    const take = Math.min(def.steal, g.shells);
    g.shells -= take;
    e.carry = take;
    e.mode = MODE.FLEE;
    e.moveT = 0;
    g.events.emit('steal', e.x, e.y, take, 0, e.type, e);
    return;
  }
  damageHeart(g, e.leak);
  g.waveStats.leaks++;
  g.events.emit('leak', e.x, WORLD.REEF_Y, e.leak, 0, e.type, e);
  if (def.fuse && e.state === 1) {
    pufferBlast(g, e);
    return;
  }
  // loop back in from the top
  e.y = e.py = TOP_Y;
  e.px = e.x;
  if (e.slot >= 0) {
    e.mode = MODE.RETURN;
    e.moveT = 0;
  } else {
    startDive(g, e);
    e.vy = 60;
  }
}

function pufferBlast(g, e) {
  const def = e.def;
  const r2 = def.blastR * def.blastR;
  for (let i = 0; i < g.towers.length; i++) {
    const t = g.towers[i];
    const dx = t.x - e.x, dy = t.y - e.y;
    if (dx * dx + dy * dy <= r2) damageTower(g, t, def.blastDmg);
  }
  const p = g.player;
  const pr = def.blastR * 0.6;
  if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 <= pr * pr) hitPlayer(g);
  e.alive = false;
  g.events.emit('explode', e.x, e.y, def.blastR, 0, e.type, e);
}

// Returns a movement multiplier.
function updateAbility(g, e, dt) {
  const def = e.def;
  // Baby Kraken / Mini Octopus: grab a buddy on the way down and disable it
  if (def.grabCd) {
    e.t1 -= dt;
    if (e.mode === MODE.DIVE && e.t1 <= 0 && e.busyT <= 0 && e.stunT <= 0 && e.heldT <= 0) {
      const t = nearestTower(g, e.x, e.y, def.grabR, true);
      if (t) {
        t.grabT = def.grabDur;
        e.busyT = def.grabPause;
        e.t1 = def.grabCd;
        e.target = null; // got one — now go for the fish
        g.events.emit('grab', t.x, t.y, e.x, e.y, e.type, t);
      } else e.t1 = 0.25;
    }
    return 1;
  }
  // Puffer Pal: inflates when hurt, charges the fish, and explodes
  if (def.fuse) {
    if (e.state === 1) {
      if (e.mode !== MODE.DIVE) startDive(g, e);
      e.t1 -= dt;
      e.r = e.baseR * (1 + 0.6 * (1 - Math.max(0, e.t1) / def.fuse));
      if (e.t1 <= 0) {
        pufferBlast(g, e);
        return 0;
      }
      return 1.3;
    }
    return 1;
  }
  // Electric Eel: zaps buddies; sparks at the fish when low on the reef
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
      if (p.alive && e.y > def.sparkY && e.y < WORLD.REEF_Y - 120 && Math.abs(e.x - p.x) < def.sparkDx) {
        const s = spawnStrike(g, 'spark', e.x, e.y, p.x, WORLD.RAIL_Y, 0.9, 24);
        s.hitsPlayer = true;
        s.arc = 40;
        e.t2 = def.sparkCd;
        g.events.emit('spark', e.x, e.y, s.tx, s.ty, e.type, e);
      } else e.t2 = 0.5;
    }
    return 1;
  }
  // Star Minion: throws stars at buddies
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

// Divers drop shots on the way down; Sea Urchins also fire spikes from the formation.
function updateShots(g, e, dt) {
  const def = e.def;
  if (!def.shotCd) return;
  e.shotT -= dt;
  if (e.shotT > 0) return;
  const p = g.player;
  const diving = e.mode === MODE.DIVE && e.y > 120 && e.y < WORLD.REEF_Y - 240;
  const fromForm = def.formShots && e.mode === MODE.FORM && Math.abs(p.x - e.x) < ENEMY_SHOT.spikeDx;
  if ((diving || fromForm) && p.alive && e.stunT <= 0 && e.heldT <= 0 && g.waveTime > WAVES.diveStart && liveShots(g) < g.shotCap) {
    fireShot(g, e, def.shot);
    e.shotT = def.shotCd * g.rng.range(0.8, 1.25);
  } else e.shotT = 0.3;
}

export function fireShot(g, e, kind) {
  const p = g.player;
  const sy = e.y + e.r * 0.6;
  const speed = ENEMY_SHOT.speed * (kind === 'spike' ? 1.15 : 1);
  const t = Math.max(0.4, (WORLD.RAIL_Y - sy) / speed);
  const s = spawnStrike(g, kind, e.x, sy, e.x, WORLD.H + 40, 0, ENEMY_SHOT.r);
  s.bullet = true;
  s.hitsPlayer = true;
  s.vy = speed;
  s.vx = clamp(((p.x - e.x) / t) * ENEMY_SHOT.aim, -220, 220);
  s.dmg = ENEMY_SHOT.towerDmg;
  g.events.emit('enemy_shot', e.x, sy, 0, 0, kind, e);
  return s;
}

export function liveShots(g) {
  let n = 0;
  for (let i = 0; i < g.strikes.length; i++) if (g.strikes[i].alive && g.strikes[i].bullet) n++;
  return n;
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
    if (s.bullet) {
      updateBullet(g, s, dt);
      continue;
    }
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

// Straight shots hit the first thing they touch: the fish or a buddy's body.
function updateBullet(g, s, dt) {
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  const p = g.player;
  if (p.alive && p.invulnT <= 0) {
    const dx = p.x - s.x, dy = p.y - s.y, rr = s.r + p.r * 0.75;
    if (dx * dx + dy * dy < rr * rr && hitPlayer(g)) {
      s.alive = false;
      g.events.emit('strike_land', s.x, s.y, s.r, 1, s.kind);
      return;
    }
  }
  if (s.dmg > 0 && s.y > 850) {
    for (let j = 0; j < g.towers.length; j++) {
      const t = g.towers[j];
      if (!t.alive || t.hp <= 0) continue;
      const dx = t.x - s.x, dy = t.y - 22 - s.y, rr = s.r + 22;
      if (dx * dx + dy * dy >= rr * rr) continue;
      damageTower(g, t, s.dmg);
      s.alive = false;
      g.events.emit('strike_land', s.x, s.y, s.r, 0, s.kind);
      return;
    }
  }
  if (s.y > WORLD.H + 30 || s.x < -30 || s.x > WORLD.W + 30) s.alive = false;
}
