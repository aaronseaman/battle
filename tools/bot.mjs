// A simple autopilot used for headless balance runs and tests.
// skill: 'idle' (never moves or shoots — buddies only) | 'sloppy' | 'basic' | 'good'

import { PHASE } from '../src/core/game.js';
import { TOWERS, UNLOCKS, PLAYER, WORLD } from '../src/config.js';
import { MODE } from '../src/core/entities.js';
import { danger } from '../src/core/towers.js';
import { chefHatX } from '../src/core/bosses.js';

// Merge onto a twin if possible (free level-up), else the empty socket nearest the middle.
function bestSocket(g, type) {
  for (const s of g.sockets) if (g.canMerge(s.i, type)) return s.i;
  let best = -1, bv = Infinity;
  for (const s of g.sockets) {
    if (s.tower) continue;
    const v = Math.abs(s.x - WORLD.W / 2);
    if (v < bv) {
      bv = v;
      best = s.i;
    }
  }
  return best;
}

const DRAFT_PREF = ['shark', 'starfish', 'fish', 'seahorse', 'octopus', 'crab', 'puffer'];
const UNLOCK_PREF = ['twinMinus', 'evo_starfish', 'evo_shark', 'evo_fish', 'seahorse', 'magnet', 'evo_octopus', 'evo_seahorse', 'extraHeart', 'crab', 'evo_crab', 'puffer', 'luckyCapsule', 'evo_puffer'];

// Make one non-combat decision. Returns false when the run is over.
export function botDecide(g, rng, skill = 'good') {
  switch (g.phase) {
    case PHASE.FORK:
      g.chooseFork(rng.int(0, 1));
      return true;
    case PHASE.DRAFT: {
      let pick = 0, pv = Infinity;
      g.draftOptions.forEach((t, i) => {
        const v = DRAFT_PREF.indexOf(t) + rng.next() * 3 - (g.towers.some((x) => x.type === t && g.canMerge(x.socket, t)) ? 2 : 0);
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
  const gunFirst = skill !== 'idle';
  for (let guard = 0; guard < 40; guard++) {
    // players lean on their own gun first; buddies soak up the rest
    if (gunFirst) {
      const order = ['minusPower', 'meterRegen', 'heartHp', 'plusPower', 'heartRegen', 'meterCap'];
      let bought = false;
      for (const id of order) {
        const c = g.upgradeCost(id);
        if (c != null && g.shells >= c + 40 && g.upgrades[id] <= g.wave / 3) {
          g.buyUpgrade(id);
          bought = true;
          break;
        }
      }
      if (bought) continue;
    }
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
    if (empty && g.shells >= TOWERS[buildType].cost && (g.towers.length < 4 || !cheapest || cc > TOWERS[buildType].cost)) {
      g.buyTower(buildType, bestSocket(g, buildType));
      continue;
    }
    if (cheapest && g.shells >= cc) {
      g.upgradeTower(cheapest.socket);
      continue;
    }
    if (skill !== 'idle' && g.reefWash === 0 && g.wave >= 8 && g.shells >= 120) {
      g.buyUpgrade('reefWash');
      continue;
    }
    break;
  }
}

// x-ranges on the rail that something is about to hit, as [lo, hi, secondsLeft].
function threats(g, horizon, withDivers) {
  const p = g.player, out = [];
  for (const s of g.strikes) {
    if (!s.alive || !s.hitsPlayer) continue;
    if (s.bullet) {
      if (s.vy <= 0 || s.y > p.y + 10) continue;
      const t = (p.y - s.y) / s.vy;
      if (t > horizon) continue;
      const x = s.x + s.vx * t, w = s.r + p.r + 8;
      out.push([x - w, x + w, t]);
    } else {
      const t = s.dur - s.t;
      if (t > horizon) continue;
      const w = s.r + p.r * 0.6 + 8;
      out.push([s.tx - w, s.tx + w, t]);
    }
  }
  if (!withDivers) return out;
  for (const e of g.enemies) {
    if (!e.alive) continue;
    if (e.bossId === 'sharky' && (e.state === 1 || e.state === 2)) {
      const w = e.r * 0.7 + p.r + 12;
      out.push([e.tx - w, e.tx + w, e.state === 1 ? e.stateT + 0.5 : 0.3]);
      continue;
    }
    if (e.bossId || e.mode !== MODE.DIVE || e.vy <= 0 || e.y > p.y) continue;
    const t = (p.y - e.y) / Math.max(60, e.vy);
    if (t > horizon) continue;
    const x = e.x + e.vx * t, w = e.r + p.r * 0.8 + 14;
    out.push([x - w, x + w, t]);
  }
  return out;
}

function inZone(zones, x) {
  for (const z of zones) if (x > z[0] && x < z[1]) return true;
  return false;
}

// Nearest x to `goal` that no threat covers.
function safeX(zones, goal) {
  if (!inZone(zones, goal)) return goal;
  for (let d = 12; d < 800; d += 12) {
    for (const x of [goal - d, goal + d]) {
      if (x < WORLD.RAIL_MIN || x > WORLD.RAIL_MAX) continue;
      if (!inZone(zones, x)) return x;
    }
  }
  return goal;
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

  // low divers first; otherwise a vulnerable boss; otherwise whatever is most dangerous
  let target = null, tv = -Infinity;
  const b = g.boss && g.boss.alive && g.boss.mode !== MODE.ENTER ? g.boss : null;
  const bossOpen = b && (b.exposedT > 0 || (b.bossId === 'queen' && b.state === 1));
  for (const e of g.enemies) {
    if (!e.alive || e.y > p.y - 30) continue;
    let v = danger(e);
    if (e.bossId) v = bossOpen ? 1300 : 800;
    else if (e.mode === MODE.DIVE && e.y < 450) v -= 300;
    if (v > tv) {
      tv = v;
      target = e;
    }
  }
  let goal = p.x;
  if (target) {
    // lead by the bubble's travel time
    const travel = Math.max(0, p.y - target.y) / PLAYER.minusSpeed;
    goal = (target.bossId === 'chef' ? chefHatX(target) : target.x) + target.vx * travel;
  } else {
    for (const s of g.pickups) if (s.alive && s.landed && Math.abs(s.x - p.x) < 160) goal = s.x;
  }
  goal = Math.max(WORLD.RAIL_MIN, Math.min(WORLD.RAIL_MAX, goal));
  const zones = threats(g, 0.7, true);
  const dodge = safeX(zones, goal);
  inp.moveX = dodge;

  const aligned = !!target && Math.abs(goal - p.x) < Math.max(14, target.r);
  inp.minus = aligned && p.meter >= PLAYER.minusCost;
  if (skill === 'good') {
    const needHelp = g.towers.some((t) => t.grabT > 0 || t.zapT > 0 || t.blindT > 0 || t.hp < t.maxHp * 0.5) || g.heart.hp < g.heart.maxHp * 0.8;
    const shieldAbove = target && (target.shield > 0 || (b === target && b.bossId === 'queen' && b.state === 0)) && aligned;
    if ((needHelp && p.meter > 60) || (shieldAbove && p.meter > PLAYER.plusCost)) {
      inp.plus = true;
      inp.minus = false;
    }
  }
}

// Approximates an average human: no target leading, slow re-targeting, fires
// ~60% of the time, reacts late to shots and never reads dives, only heals the
// heart when it is in trouble.
function sloppyInput(g, inp, p) {
  const st = sloppyState;
  st.t++;
  if (st.t % 30 === 0 || st.goal < 0) {
    let target = null, tv = -Infinity;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const v = danger(e);
      if (v > tv) {
        tv = v;
        target = e;
      }
    }
    st.goal = target ? target.x + Math.sin(st.t * 0.37) * 30 : p.x;
  }
  const zones = threats(g, 0.4, false);
  const goal = (st.t >> 4) % 3 === 0 ? st.goal : safeX(zones, st.goal); // misses a third of dodges
  inp.moveX = Math.max(WORLD.RAIL_MIN, Math.min(WORLD.RAIL_MAX, goal));
  inp.minus = (st.t % 100) < 60 && p.meter >= PLAYER.minusCost && g.enemies.length > 0;
  if (g.heart.hp < g.heart.maxHp * 0.5 && p.meter > 50) {
    inp.plus = true;
    inp.minus = false;
  }
}
