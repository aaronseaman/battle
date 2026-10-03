// Wave generation and difficulty scaling.

import { WAVES, ENEMY_POOL, BOSS_ORDER, FORKS } from '../config.js';

export function hpMul(w) {
  const k = w - 1;
  return 1 + WAVES.hpLinear * k + WAVES.hpQuad * k * k;
}

export function speedMul(w) {
  return Math.min(WAVES.speedMax, 1 + WAVES.speedPerWave * (w - 1));
}

export function isBossWave(w) {
  return w % WAVES.bossEvery === 0;
}

export function bossForWave(w) {
  const n = w / WAVES.bossEvery - 1;
  return { id: BOSS_ORDER[n % BOSS_ORDER.length], cycle: Math.floor(n / BOSS_ORDER.length) };
}

export function shieldChance(w) {
  if (w < WAVES.shieldFrom) return 0;
  return Math.min(WAVES.shieldChanceMax, WAVES.shieldChance + WAVES.shieldChancePerWave * (w - WAVES.shieldFrom));
}

// Returns a time-sorted spawn list: [{ t, type, shield, boss?, cycle? }]
export function buildWave(rng, w, mods) {
  const boss = isBossWave(w);
  let count = Math.round(WAVES.countBase + WAVES.countPerWave * w);
  if (boss) count = Math.round(count * WAVES.bossEscortFrac);
  const window = Math.min(WAVES.windowMax, WAVES.windowBase + WAVES.windowPerWave * w) * (mods.spawnMul || 1);
  const pool = ENEMY_POOL.filter((p) => p[1] <= w);
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
  const shieldP = shieldChance(w);
  const spawns = [];
  const groups = Math.max(2, Math.round(count / 4));
  const gap = window / groups;
  let t = boss ? 6 : 1.5;
  let left = count;
  for (let gi = 0; gi < groups && left > 0; gi++) {
    const size = gi === groups - 1 ? left : Math.min(left, Math.max(1, Math.round(count / groups + rng.range(-1.2, 1.2))));
    const mixed = rng.chance(0.3);
    let type = pickType();
    for (let k = 0; k < size; k++) {
      if (mixed) type = pickType();
      const spacing = type === 'urchin' ? 1.1 : type === 'jelly' ? 0.8 : 0.6;
      spawns.push({ t: t + k * spacing, type, shield: rng.chance(shieldP) });
    }
    left -= size;
    t += gap * rng.range(0.8, 1.2);
  }
  if (mods.extra) {
    for (const type in mods.extra) {
      const n = mods.extra[type];
      for (let k = 0; k < n; k++) spawns.push({ t: rng.range(2, Math.max(4, window)), type, shield: false });
    }
  }
  if (boss) {
    const b = bossForWave(w);
    spawns.push({ t: 2, type: 'boss', boss: b.id, cycle: b.cycle, shield: false });
  }
  spawns.sort((a, b) => a.t - b.t);
  return spawns;
}

export function rollForks(rng, w) {
  const avail = FORKS.filter((f) => (f.from || 1) <= w);
  rng.shuffle(avail);
  return [avail[0].id, avail[1].id];
}
