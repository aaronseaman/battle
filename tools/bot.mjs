// Autopilot for headless balance runs and tests. It only steers, like a player.
// skill: 'idle' (never steers) | 'sloppy' (≈ a casual player) | 'good'

import { ROAD, SCHOOL, BOSS_ATTACK } from '../src/config.js';
import { STAGE } from '../src/core/game.js';

// What the school would be worth after taking a gate (or prize).
function worth(g, e) {
  const n = g.school.n;
  switch (e.type) {
    case 'add': return n + e.value;
    case 'mul': return n * e.value;
    case 'rate': return n * 1.17 + 1;
    case 'dmg': return n * 1.2 + 1;
    case 'buddy': return n + 7;
    default: return n;
  }
}

const state = { t: 0, goal: 0, wrongGate: false, lastGate: 0, seed: 1 };
const rand = () => ((state.seed = (state.seed * 16807) % 2147483647) / 2147483647);

export function botReset(seed = 1) {
  state.t = 0;
  state.goal = 0;
  state.wrongGate = false;
  state.lastGate = 0;
  state.seed = seed;
}

export function botInput(g, skill = 'good') {
  const inp = g.input;
  inp.left = inp.right = false;
  if (skill === 'idle') {
    inp.targetX = NaN;
    return;
  }
  state.t++;
  const sloppy = skill === 'sloppy';
  // a casual player re-reads the road only every few frames
  if (sloppy && state.t % 12 !== 0) {
    inp.targetX = state.goal;
    return;
  }
  const s = g.school;
  const hw = g.schoolHalfW;
  let goal = s.x;
  let gate = null;
  for (const o of g.things) if (o.alive && o.kind === 'gate' && o.x < 0 && o.z > 0 && (!gate || o.z < gate.z)) gate = o;

  if (g.stage === STAGE.BOSS && g.boss && g.boss.alive) {
    goal = g.boss.x;
  } else if (gate && gate.z < 650) {
    const l = worth(g, gate.gate), r = worth(g, gate.partner.gate);
    let left = l >= r;
    if (sloppy && gate.id !== state.lastGate) {
      state.lastGate = gate.id;
      state.wrongGate = rand() < 0.2; // picks the worse gate one time in five
    }
    if (sloppy && state.wrongGate) left = !left;
    goal = left ? -ROAD.half / 2 : ROAD.half / 2;
  } else {
    // shoot whatever is closest, unless it's a clam we can't crack in time
    let best = null, bv = Infinity;
    for (const o of g.things) {
      if (!o.alive || o.kind === 'gate' || o.kind === 'boss' || o.z <= 0) continue;
      if (o.z < bv) {
        bv = o.z;
        best = o;
      }
    }
    if (best) {
      const dps = s.n * SCHOOL.dps * s.dmgMul * s.rateMul;
      const time = best.z / (ROAD.speed + (best.speed || 0));
      if (best.kind === 'clam' && best.hp > dps * time * 0.8 && !sloppy) {
        goal = best.x > 0 ? -ROAD.half + 40 : ROAD.half - 40; // dodge it
      } else goal = best.x;
    }
  }
  // dodge boss attacks (a casual player only half the time)
  if (!sloppy || state.t % 24 < 12) {
    for (const sh of g.shots) {
      if (!sh.alive || sh.dur - sh.t > 0.9) continue;
      const reach = sh.r + hw * 0.35 + 12;
      if (Math.abs(goal - sh.x) < reach) goal = sh.x > 0 ? sh.x - reach - 4 : sh.x + reach + 4;
    }
    const b = g.boss;
    if (b && b.alive && (b.state === 1 || b.state === 2)) {
      const reach = BOSS_ATTACK.chargeW / 2 + hw * 0.5 + 12;
      if (Math.abs(goal - b.tx) < reach) goal = b.tx > 0 ? b.tx - reach - 4 : b.tx + reach + 4;
    }
  }
  state.goal = goal;
  inp.targetX = goal;
}
