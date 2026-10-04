// Level generator. A level is a list of things placed along the road at
// distance `at`, ending with a boss. Levels are seeded by their number, so
// retrying a level gives the same road.

import { ROAD, ENEMIES, ENEMY_POOL, LEVELS, BOSSES, BOSS_ORDER, BUDDIES, CLAM } from '../config.js';
import { RNG } from './util.js';

export function levelSeed(L) {
  return (L * 7919 + 17) >>> 0;
}

export function bossForLevel(L) {
  const n = L - 1;
  return { id: BOSS_ORDER[n % BOSS_ORDER.length], cycle: Math.floor(n / BOSS_ORDER.length) };
}

// HP multiplier for critters and clams in segment `s` of level L.
export function hpMul(L, s = 0) {
  return (LEVELS.hpBase + LEVELS.hpPerLevel * (L - 1)) * (1 + LEVELS.hpPerSegment * s);
}

export function bossHpMul(L) {
  return 1 + LEVELS.bossHpPerLevel * (L - 1);
}

// --- gate pairs -------------------------------------------------------------
// A gate is { type, value }: add (±fish), mul (×fish), rate / dmg (weapon), buddy.

function goodAdd(rng, L) {
  return { type: 'add', value: rng.int(3, 5) + Math.floor(L * 0.8) };
}
function badAdd(rng, L) {
  return { type: 'add', value: -(rng.int(3, 6) + Math.floor(L * 0.9)) };
}

function gatePair(rng, L, k, mulLeft) {
  const pick = rng.next();
  let a, b;
  if (k === 0) {
    // the first gate of a level teaches the choice without punishing it hard
    a = goodAdd(rng, L);
    b = L === 1 ? { type: 'add', value: -2 } : goodAdd(rng, L);
    if (L > 1) b.value = Math.max(1, a.value - rng.int(2, 4));
  } else if (pick < 0.3 || (pick >= 0.84 && !mulLeft.n)) {
    a = goodAdd(rng, L);
    b = badAdd(rng, L);
  } else if (pick < 0.5) {
    a = goodAdd(rng, L);
    b = goodAdd(rng, L);
    b.value += rng.int(1, 3);
  } else if (pick < 0.68) {
    a = { type: rng.chance(0.5) ? 'rate' : 'dmg', value: 1 };
    b = goodAdd(rng, L);
  } else if (pick < 0.84) {
    const types = Object.keys(BUDDIES);
    a = { type: 'buddy', value: 1, buddy: types[rng.int(0, types.length - 1)] };
    b = goodAdd(rng, L);
  } else {
    // the big one: ×2, opposite a nasty gate
    mulLeft.n--;
    a = { type: 'mul', value: 2 };
    b = badAdd(rng, L);
    b.value -= rng.int(2, 4);
  }
  return rng.chance(0.5) ? [a, b] : [b, a];
}

// --- the level ---------------------------------------------------------------

export function buildLevel(L) {
  const rng = new RNG(levelSeed(L));
  const items = [];
  const segs = Math.min(LEVELS.segmentsMax, LEVELS.segments + L - 1);
  const pool = ENEMY_POOL.filter((p) => p[1] <= L);
  let total = 0;
  for (const p of pool) total += p[2];
  const pickType = () => {
    let r = rng.next() * total;
    for (const p of pool) {
      r -= p[2];
      if (r <= 0) return p[0];
    }
    return pool[pool.length - 1][0];
  };

  let at = LEVELS.startGap;
  let gates = 0;
  const mulLeft = { n: L < 2 ? 0 : L < 6 ? LEVELS.mulGates : LEVELS.mulGates + 1 };
  for (let s = 0; s < segs; s++) {
    const hm = hpMul(L, s);
    // gates every other segment (always first), critters and clams in between
    const kind = s % 2 === 0 ? 'gates' : rng.chance(0.65) ? 'crowd' : 'clams';
    if (kind === 'gates') {
      const [left, right] = gatePair(rng, L, gates++, mulLeft);
      items.push({ kind: 'gates', at, left, right });
    } else if (kind === 'crowd') {
      const n = LEVELS.crowdBase + LEVELS.crowdPerLevel * (L - 1) + LEVELS.crowdPerSegment * s + rng.int(0, 2);
      crowd(items, rng, at, pickType(), Math.round(Math.min(LEVELS.crowdMax, n)), hm);
      if (L >= 3 && rng.chance(0.35)) clam(items, rng, at + 260, rng.pick([-90, 90]), hm, L);
    } else {
      const n = L >= 2 && rng.chance(0.5) ? 2 : 1;
      if (n === 1) clam(items, rng, at, rng.pick([-75, 0, 75]), hm, L);
      else {
        clam(items, rng, at, -80, hm, L);
        clam(items, rng, at, 80, hm, L);
      }
      if (rng.chance(0.5)) crowd(items, rng, at + 300, pickType(), 3 + Math.floor(L / 2), hm);
    }
    at += LEVELS.gap + rng.int(-60, 60);
  }
  const b = bossForLevel(L);
  const def = BOSSES[b.id];
  items.push({ kind: 'boss', at: at + 200, id: b.id, hp: Math.round(def.hp * bossHpMul(L)) });
  items.sort((p, q) => p.at - q.at);
  return { L, items, length: at + 200, boss: b.id, minionHp: hpMul(L, segs) };
}

// A block of critters: rows of up to 5 across a lane or the whole road.
function crowd(items, rng, at, type, n, hm) {
  const def = ENEMIES[type];
  const wide = n > 8 || rng.chance(0.35);
  const cols = Math.min(n, wide ? 6 : 3);
  const cx = wide ? 0 : rng.pick([-80, 0, 80]);
  const dx = wide ? 46 : 40;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols), col = i % cols;
    const inRow = Math.min(cols, n - row * cols);
    const x = cx + (col - (inRow - 1) / 2) * dx + rng.range(-5, 5);
    items.push({ kind: 'enemy', at: at + row * 42, x: clampRoad(x, def.r), type, hp: Math.round(def.hp * hm) });
  }
}

function clam(items, rng, at, x, hm, L) {
  const r = rng.next();
  let prize;
  if (r < 0.55) prize = { type: 'add', value: rng.int(4, 7) + L };
  else if (r < 0.85) prize = { type: rng.chance(0.5) ? 'rate' : 'dmg', value: 1 };
  else {
    const types = Object.keys(BUDDIES);
    prize = { type: 'buddy', value: 1, buddy: types[rng.int(0, types.length - 1)] };
  }
  items.push({ kind: 'clam', at, x: clampRoad(x, CLAM.w / 2), hp: Math.round((34 + 6 * L) * hm * rng.range(0.8, 1.3)), prize });
}

function clampRoad(x, r) {
  const m = ROAD.half - r - 4;
  return x < -m ? -m : x > m ? m : x;
}
