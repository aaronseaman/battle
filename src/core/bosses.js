// Boss behaviours. Bosses are regular Enemy objects with `bossId` set; their
// per-boss state lives in the generic fields:
//   state / stateT  current behaviour + countdown
//   t1..t4          ability cooldowns
//   phase           0-based phase (changes at HP thresholds)
//
// chef   — t1 ink bombs, t2 minions. Weak point: the hat (see chefHatX).
// sharky — state 0 walk, 1 wind-up, 2 charge, 3 recover. t1 charge cooldown.
// queen  — state 0 arms closed (armored), 1 arms open (vulnerable). t1 summons.
// kitty  — t1 tentacles, t2 paw swipes, t3 minions, t4 purr-shield reform.

import { BOSSES, WORLD, WAVES } from '../config.js';
import { spawnEnemy, addShells, damageTower, towerActive, removeTower, SRC_MINUS } from './combat.js';

function speedUp(e) {
  return Math.max(0.6, 1 - 0.1 * e.variant);
}

export function spawnBoss(g, id, cycle = 0) {
  const def = BOSSES[id];
  const e = g.pools.enemy.get();
  e.reset();
  e.id = ++g.nextId;
  e.alive = true;
  e.type = 'boss';
  e.bossId = id;
  e.def = def;
  e.variant = cycle;
  e.hp = e.maxHp = def.hp * (1 + cycle * WAVES.endlessBossHpPerCycle) * (g.mods.hpMul || 1);
  e.r = e.baseR = def.r;
  e.baseSpeed = def.speed * (g.mods.speedMul || 1);
  e.armor = def.armor;
  e.leak = def.leak;
  e.shells = 0;
  e.dist = 0;
  e.anim = 0;
  switch (id) {
    case 'chef':
      e.t1 = 2.5;
      e.t2 = 5;
      break;
    case 'sharky':
      e.t1 = 4;
      break;
    case 'queen':
      e.state = 0;
      e.stateT = def.closed[0];
      e.t1 = 4;
      break;
    case 'kitty':
      e.t1 = 4;
      e.t2 = def.swipeCd;
      e.t3 = def.minionCd;
      break;
  }
  e.seg = g.path.sample(0, e, 0);
  e.px = e.x;
  e.py = e.y;
  g.enemies.push(e);
  g.boss = e;
  g.events.emit('boss_spawn', e.x, e.y, e.maxHp, cycle, id, e);
  return e;
}

export function chefHatX(e) {
  return e.x + Math.sin(e.anim * 2.2) * (e.phase ? 16 : 5);
}

// Damage multiplier applied by damageEnemy for boss-specific defenses.
export function bossDamageMul(g, e, src) {
  const def = e.def;
  switch (e.bossId) {
    case 'queen':
      return e.state === 0 ? def.closedMul : def.openMul;
    case 'kitty':
      if (e.exposedT > 0) return src === SRC_MINUS ? def.exposedMinusMul : def.exposedTowerMul;
      return 1;
    default:
      return 1;
  }
}

// Called by Plus bubbles that touch a boss (before its shield is popped).
export function onBossPlusHit(g, e, hadShield) {
  const def = e.def;
  if (e.bossId === 'queen' && e.state === 0) {
    e.state = 1;
    e.stateT = def.open[e.phase];
    g.events.emit('boss_open', e.x, e.y, 1, 0, e.bossId, e);
  } else if (e.bossId === 'kitty' && hadShield) {
    e.exposedT = def.exposedDur;
    g.events.emit('boss_exposed', e.x, e.y, def.exposedDur, 0, e.bossId, e);
  }
}

// Called when a Starfish star hits a boss.
export function onBossStarHit(g, e) {
  if (e.bossId !== 'sharky') return;
  if (e.state === 1 || e.state === 2) {
    const def = e.def;
    e.state = 0;
    e.t1 = def.chargeCd[e.phase] * speedUp(e);
    if (e.stunT < def.starStun) e.stunT = def.starStun;
    g.events.emit('boss_stunned', e.x, e.y, def.starStun, 0, e.bossId, e);
  }
}

function setPhase(g, e, phase) {
  e.phase = phase;
  g.events.emit('boss_phase', e.x, e.y, phase, 0, e.bossId, e);
}

// Returns a movement multiplier for this tick.
export function updateBoss(g, e, dt) {
  const def = e.def;
  const sp = speedUp(e);
  const frac = e.hp / e.maxHp;
  switch (e.bossId) {
    case 'chef': {
      if (e.phase === 0 && frac <= 0.5) setPhase(g, e, 1);
      e.t1 -= dt;
      if (e.t1 <= 0) {
        e.t1 = def.inkCd[e.phase] * sp;
        chefInk(g, e, def);
      }
      e.t2 -= dt;
      if (e.t2 <= 0) {
        e.t2 = def.minionCd[e.phase] * sp;
        const n = def.minions[e.phase];
        for (let k = 0; k < n; k++) spawnEnemy(g, 'octoMini', Math.max(0, e.dist - 30 - k * 20));
        g.events.emit('boss_summon', e.x, e.y, n, 0, e.bossId, e);
      }
      return 1;
    }
    case 'sharky': {
      if (e.phase === 0 && frac <= 0.5) setPhase(g, e, 1);
      if (e.stunT > 0) return 0;
      switch (e.state) {
        case 0:
          e.t1 -= dt;
          if (e.t1 <= 0) {
            e.state = 1;
            e.stateT = def.windup[e.phase] * sp;
            g.events.emit('boss_windup', e.x, e.y, e.stateT, 0, e.bossId, e);
          }
          return 1;
        case 1:
          e.stateT -= dt;
          if (e.stateT <= 0) {
            e.state = 2;
            e.stateT = def.chargeDur;
            g.events.emit('boss_charge', e.x, e.y, 0, 0, e.bossId, e);
          }
          return 0;
        case 2: {
          e.stateT -= dt;
          const reach = e.r + def.eatR;
          for (let i = 0; i < g.towers.length; i++) {
            const t = g.towers[i];
            if (!t.alive) continue;
            const dx = t.x - e.x, dy = t.y - e.y;
            if (dx * dx + dy * dy <= reach * reach) {
              g.events.emit('eaten', t.x, t.y, 0, 0, t.type, t);
              g.swallowed.push({ socket: t.socket, type: t.type, level: t.level, invested: t.invested, kills: t.kills });
              removeTower(g, t);
              g.waveStats.towersEaten++;
              e.state = 3;
              e.stateT = def.recover;
              return 0.4;
            }
          }
          if (e.stateT <= 0) {
            e.state = 3;
            e.stateT = def.recover;
          }
          return def.chargeSpeedMul;
        }
        default:
          e.stateT -= dt;
          if (e.stateT <= 0) {
            e.state = 0;
            e.t1 = def.chargeCd[e.phase] * sp;
          }
          return 0.4;
      }
    }
    case 'queen': {
      if (e.phase === 0 && frac <= 0.5) setPhase(g, e, 1);
      e.stateT -= dt;
      if (e.stateT <= 0) {
        if (e.state === 0) {
          e.state = 1;
          e.stateT = def.open[e.phase];
          g.events.emit('boss_open', e.x, e.y, 0, 0, e.bossId, e);
        } else {
          e.state = 0;
          e.stateT = def.closed[e.phase] * sp;
          g.events.emit('boss_close', e.x, e.y, 0, 0, e.bossId, e);
        }
      }
      e.t1 -= dt;
      if (e.t1 <= 0) {
        e.t1 = def.summonCd[e.phase] * sp;
        const n = def.summons[e.phase];
        for (let k = 0; k < n; k++) spawnEnemy(g, 'starMinion', Math.max(0, e.dist + (k - (n - 1) / 2) * 24));
        g.events.emit('boss_summon', e.x, e.y, n, 0, e.bossId, e);
      }
      return e.state === 0 ? 1 : 0.6;
    }
    case 'kitty': {
      if (e.phase === 0 && frac <= 0.66) {
        setPhase(g, e, 1);
        e.shield = e.maxShield = e.maxHp * def.purrFrac;
        e.state = 0;
        g.events.emit('purr', e.x, e.y, e.shield, 0, e.bossId, e);
      } else if (e.phase === 1 && frac <= 0.33) {
        setPhase(g, e, 2);
        e.t3 = 2;
      }
      e.t1 -= dt;
      if (e.t1 <= 0) {
        e.t1 = def.tentacleCd[e.phase] * sp;
        for (let k = 0; k < def.tentacleCount[e.phase]; k++) {
          if (liveTentacles(g) >= def.tentacleMax[e.phase]) break;
          spawnTentacle(g, e, def);
        }
      }
      if (e.phase >= 1) {
        e.t2 -= dt;
        if (e.t2 <= 0) {
          e.t2 = def.swipeCd * sp;
          const s = spawnStrike(g, 'swipe', e.x, e.y, g.player.x, WORLD.RAIL_Y, def.swipeDelay, def.swipeR);
          s.hitsPlayer = true;
          s.arc = 0;
          g.events.emit('boss_swipe', s.tx, s.ty, def.swipeR, def.swipeDelay, e.bossId, e);
        }
        // purr shield reforms a while after it breaks
        if (e.maxShield > 0 && e.shield <= 0) {
          if (e.state === 0) {
            e.state = 1;
            e.t4 = def.purrReform * sp;
          } else {
            e.t4 -= dt;
            if (e.t4 <= 0) {
              e.shield = e.maxShield;
              e.state = 0;
              g.events.emit('purr', e.x, e.y, e.shield, 0, e.bossId, e);
            }
          }
        }
      }
      if (e.phase >= 2) {
        e.t3 -= dt;
        if (e.t3 <= 0) {
          e.t3 = def.minionCd * sp;
          const d = Math.max(0, e.dist - 40);
          spawnEnemy(g, 'jelly', d);
          spawnEnemy(g, 'jelly', Math.max(0, d - 22));
          spawnEnemy(g, 'eel', Math.max(0, d - 44));
          g.events.emit('boss_summon', e.x, e.y, 3, 0, e.bossId, e);
        }
      }
      return 1;
    }
  }
  return 1;
}

function chefInk(g, e, def) {
  let tgt = null;
  if (g.rng.chance(def.inkTowerChance)) {
    // reservoir-sample a random active tower within reach
    let seen = 0;
    for (let i = 0; i < g.towers.length; i++) {
      const t = g.towers[i];
      if (!towerActive(t)) continue;
      const dx = t.x - e.x, dy = t.y - e.y;
      if (dx * dx + dy * dy > 380 * 380) continue;
      seen++;
      if (g.rng.next() * seen < 1) tgt = t;
    }
  }
  let s;
  if (tgt) {
    s = spawnStrike(g, 'ink', e.x, e.y, tgt.x, tgt.y, 1.2, def.inkR);
    s.tower = tgt;
    s.towerId = tgt.id;
    s.dmg = def.inkDmg;
    s.blind = def.inkBlind;
  } else {
    s = spawnStrike(g, 'ink', e.x, e.y, g.player.x, WORLD.RAIL_Y, 1.4, def.inkRailR);
    s.hitsPlayer = true;
  }
  s.arc = 170;
  g.events.emit('boss_throw', e.x, e.y, s.tx, s.ty, e.bossId, e);
}

export function spawnStrike(g, kind, sx, sy, tx, ty, dur, r) {
  const s = g.pools.strike.get();
  s.reset();
  s.alive = true;
  s.kind = kind;
  s.sx = s.x = s.px = sx;
  s.sy = s.y = s.py = sy;
  s.tx = tx;
  s.ty = ty;
  s.dur = dur;
  s.r = r;
  g.strikes.push(s);
  return s;
}

function spawnTentacle(g, boss, def) {
  let pick = null, seen = 0;
  for (let i = 0; i < g.sockets.length; i++) {
    const so = g.sockets[i];
    if (!so.tower || !so.tower.alive || so.tentacle) continue;
    seen++;
    if (g.rng.next() * seen < 1) pick = so;
  }
  if (!pick) return;
  const tn = g.pools.tentacle.get();
  tn.reset();
  tn.id = ++g.nextId;
  tn.alive = true;
  tn.socket = pick.i;
  tn.x = pick.x;
  tn.y = pick.y;
  tn.r = def.tentacleR;
  tn.hp = tn.maxHp = def.tentacleHp * (1 + 0.3 * boss.variant);
  pick.tentacle = tn;
  pick.tower.covered = true;
  g.tentacles.push(tn);
  g.events.emit('tentacle', tn.x, tn.y, tn.socket, 0, 'kitty', pick.tower);
}

function liveTentacles(g) {
  let n = 0;
  for (let i = 0; i < g.tentacles.length; i++) if (g.tentacles[i].alive) n++;
  return n;
}

export function updateTentacles(g, dt) {
  const squeeze = BOSSES.kitty.tentacleSqueeze;
  const life = BOSSES.kitty.tentacleLife;
  for (let i = 0; i < g.tentacles.length; i++) {
    const tn = g.tentacles[i];
    if (!tn.alive) continue;
    tn.t += dt;
    if (tn.hitT > 0) tn.hitT -= dt;
    const so = g.sockets[tn.socket];
    const tw = so.tower;
    if (!tw || !tw.alive || tn.t >= life) {
      breakTentacle(g, tn, tn.t >= life);
      continue;
    }
    if (tw.hp > 0) damageTower(g, tw, squeeze * dt, true);
  }
}

export function damageTentacle(g, tn, amount) {
  if (!tn.alive) return;
  tn.hp -= amount;
  tn.hitT = 0.1;
  g.events.emit('tentacle_hit', tn.x, tn.y, amount, 0, 'kitty', null);
  if (tn.hp <= 0) breakTentacle(g, tn, true);
}

export function breakTentacle(g, tn, emit) {
  tn.alive = false;
  const so = g.sockets[tn.socket];
  if (so.tentacle === tn) so.tentacle = null;
  if (so.tower) so.tower.covered = false;
  if (emit) g.events.emit('tentacle_break', tn.x, tn.y, 0, 0, 'kitty', null);
}

export function retractTentacles(g) {
  for (let i = 0; i < g.tentacles.length; i++) if (g.tentacles[i].alive) breakTentacle(g, g.tentacles[i], true);
}

export function onBossDeath(g, e) {
  const def = e.def;
  g.pearls += def.pearls;
  g.waveStats.pearls += def.pearls;
  addShells(g, def.shells);
  if (def.unlock && !g.towerTypes.includes(def.unlock)) {
    g.towerTypes.push(def.unlock);
    g.waveStats.unlockedTower = def.unlock;
    g.events.emit('tower_unlocked', e.x, e.y, 0, 0, def.unlock);
  }
  retractTentacles(g);
  if (e.bossId === 'sharky') g.restoreSwallowed();
  if (g.boss === e) g.boss = null;
  g.bossesDefeated++;
  g.waveStats.bossDefeated = e.bossId;
  g.events.emit('boss_defeat', e.x, e.y, def.pearls, def.shells, e.bossId, e);
}
