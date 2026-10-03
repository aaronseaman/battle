// A simple autopilot used for headless balance runs and tests.
// skill: 'idle' (never shoots/moves — towers only) | 'basic' | 'good'

import { PHASE } from '../src/core/game.js';
import { TOWERS, UNLOCKS, PLAYER, WORLD } from '../src/config.js';

const coverCache = new Map();
function coverage(g, socket, type) {
  const key = socket.i + ':' + type;
  if (!coverCache.has(key)) coverCache.set(key, g.path.coverage(socket.x, socket.y, TOWERS[type].levels[0].range));
  return coverCache.get(key);
}

function bestSocket(g, type) {
  let best = -1, bv = -1;
  for (const s of g.sockets) {
    if (s.tower) continue;
    const v = coverage(g, s, type);
    if (v > bv) {
      bv = v;
      best = s.i;
    }
  }
  return best;
}

const DRAFT_PREF = ['shark', 'starfish', 'octopus', 'seahorse', 'fish', 'crab', 'puffer'];
const UNLOCK_PREF = ['twinMinus', 'evo_starfish', 'evo_shark', 'evo_octopus', 'seahorse', 'evo_fish', 'magnet', 'evo_seahorse', 'crab', 'evo_crab', 'puffer', 'extraHeart', 'luckyCapsule', 'evo_puffer'];

// Make one non-combat decision. Returns false when the run is over.
export function botDecide(g, rng, skill = 'good') {
  switch (g.phase) {
    case PHASE.FORK:
      g.chooseFork(rng.int(0, 1));
      return true;
    case PHASE.DRAFT: {
      let pick = 0, pv = Infinity;
      g.draftOptions.forEach((t, i) => {
        const v = DRAFT_PREF.indexOf(t) + rng.next() * 3;
        if (v < pv) {
          pv = v;
          pick = i;
        }
      });
      g.chooseDraft(pick);
      return true;
    }
    case PHASE.PLACE:
      g.placePending(bestSocket(g, g.pendingTower));
      return true;
    case PHASE.BUILD:
      build(g, skill);
      g.startWave();
      return true;
    case PHASE.WAVE_END:
      g.continueAfterWave();
      return true;
    default:
      return false;
  }
}

function build(g, skill) {
  if (skill !== 'idle') {
    for (const id of UNLOCK_PREF) {
      const u = UNLOCKS[id];
      if (g.unlocked[id] || g.pearls < u.pearls) continue;
      if (u.evo && !g.towers.some((t) => t.type === u.evo)) continue;
      g.buyUnlock(id);
    }
  }
  for (let guard = 0; guard < 40; guard++) {
    // upgrade the cheapest upgradable tower, else build, else gun upgrades
    let cheapest = null, cc = Infinity;
    for (const t of g.towers) {
      const info = g.upgradeInfo(t);
      if (info.max || info.locked) continue;
      if (info.cost < cc) {
        cc = info.cost;
        cheapest = t;
      }
    }
    const empty = g.sockets.some((s) => !s.tower);
    const buildType = g.towerTypes.includes('shark') && g.wave > 6 ? 'shark' : g.towerTypes.includes('starfish') ? 'starfish' : 'fish';
    if (empty && g.shells >= TOWERS[buildType].cost && (g.towers.length < 6 || !cheapest || cc > TOWERS[buildType].cost)) {
      g.buyTower(buildType, bestSocket(g, buildType));
      continue;
    }
    if (cheapest && g.shells >= cc) {
      g.upgradeTower(cheapest.socket);
      continue;
    }
    if (skill !== 'idle') {
      const order = ['minusPower', 'heartHp', 'meterRegen', 'plusPower', 'heartRegen', 'meterCap'];
      let bought = false;
      for (const id of order) {
        const c = g.upgradeCost(id);
        if (c != null && g.shells >= c + 60) {
          g.buyUpgrade(id);
          bought = true;
          break;
        }
      }
      if (bought) continue;
      if (g.reefWash === 0 && g.wave >= 8 && g.shells >= 120) {
        g.buyUpgrade('reefWash');
        continue;
      }
    }
    break;
  }
}

// Combat controls, called every tick before g.update().
const sloppyState = { t: 0, goal: -1 };

export function botInput(g, skill = 'good') {
  const inp = g.input;
  inp.left = inp.right = inp.plus = inp.minus = false;
  inp.moveX = -1;
  if (skill === 'idle') return;
  const p = g.player;
  if (skill === 'sloppy') return sloppyInput(g, inp, p);

  // pick the enemy closest to the heart (or the boss hat) to stand under
  let target = null, tv = -1;
  for (const e of g.enemies) {
    if (!e.alive) continue;
    const v = e.dir > 0 ? e.dist : g.path.length * 2 - e.dist;
    const prio = e.bossId ? v + 400 : v;
    if (prio > tv) {
      tv = prio;
      target = e;
    }
  }
  let goal = p.x;
  if (target) {
    // lead horizontally moving targets by the bubble's travel time
    const travel = (p.y - target.y) / PLAYER.minusSpeed;
    goal = target.x + Math.cos(target.angle) * target.speed * travel * target.dir;
  }
  // dodge incoming strikes aimed at the rail
  for (const s of g.strikes) {
    if (!s.alive || !s.hitsPlayer) continue;
    if (s.dur - s.t < 0.6 && Math.abs(s.tx - goal) < s.r + p.r + 10) {
      goal = s.tx < WORLD.W / 2 ? s.tx + s.r + p.r + 40 : s.tx - s.r - p.r - 40;
    }
  }
  // grab nearby landed shells
  for (const s of g.pickups) {
    if (s.alive && s.landed && Math.abs(s.x - p.x) < 120 && !target) goal = s.x;
  }
  inp.moveX = Math.max(WORLD.RAIL_MIN, Math.min(WORLD.RAIL_MAX, goal));

  const aligned = target && Math.abs(goal - p.x) < 24;
  inp.minus = !!(aligned && p.meter >= PLAYER.minusCost);
  if (skill === 'good') {
    const needHelp = g.towers.some((t) => t.grabT > 0 || t.zapT > 0 || t.blindT > 0 || t.hp < t.maxHp * 0.6) || g.heart.hp < g.heart.maxHp * 0.8;
    const b = g.boss;
    const shieldAbove = target && (target.shield > 0 || (b === target && b.bossId === 'queen' && b.state === 0)) && aligned;
    if ((needHelp && p.meter > 45) || (shieldAbove && p.meter > PLAYER.plusCost)) {
      inp.plus = true;
      inp.minus = false;
    }
  }
}

// Approximates an average human: no target leading, slow re-targeting,
// fires ~60% of the time, only heals the heart when it is in trouble.
function sloppyInput(g, inp, p) {
  const st = sloppyState;
  st.t++;
  if (st.t % 30 === 0 || st.goal < 0) {
    let target = null, tv = -1;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const v = e.dir > 0 ? e.dist : g.path.length * 2 - e.dist;
      if (v > tv) {
        tv = v;
        target = e;
      }
    }
    st.goal = target ? target.x + (Math.sin(st.t * 0.37) * 30) : p.x;
  }
  inp.moveX = Math.max(WORLD.RAIL_MIN, Math.min(WORLD.RAIL_MAX, st.goal));
  inp.minus = (st.t % 100) < 60 && p.meter >= PLAYER.minusCost && g.enemies.length > 0;
  if (g.heart.hp < g.heart.maxHp * 0.5 && p.meter > 50) {
    inp.plus = true;
    inp.minus = false;
  }
}
