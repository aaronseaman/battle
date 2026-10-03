// Wave generation, difficulty scaling, and the dive scheduler.

import { WAVES, ENEMY_POOL, BOSS_ORDER, FORKS, FORMATION, ENTRY } from '../config.js';
import { MODE } from './entities.js';
import { startDive } from './enemies.js';

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

export function diveGap(w) {
  return Math.max(WAVES.diveGapMin, WAVES.diveGap - WAVES.diveGapPerWave * (w - 1));
}

export function maxDivers(w) {
  return Math.min(WAVES.maxDiversCap, Math.floor(WAVES.maxDivers + WAVES.maxDiversPerWave * (w - 1)));
}

export function shotCap(w) {
  return Math.min(WAVES.shotsCap, Math.floor(WAVES.shotsBase + WAVES.shotsPerWave * (w - 1)));
}

// Columns fill from the centre out, so small waves look like a tidy block.
const MID = (FORMATION.cols - 1) / 2;
const COL_ORDER = Array.from({ length: FORMATION.cols }, (_, c) => c).sort((a, b) => Math.abs(a - MID) - Math.abs(b - MID) || a - b);

// Returns a time-sorted spawn list:
//   formation members  { t, type, shield, slot, side }
//   the boss           { t, type: 'boss', boss, cycle }
export function buildWave(rng, w, mods) {
  const boss = isBossWave(w);
  const F = FORMATION, slots = F.cols * F.rows;
  let count = Math.round(WAVES.countBase + WAVES.countPerWave * w);
  if (boss) count = Math.round(count * WAVES.bossEscortFrac);

  const extras = [];
  if (mods.extra) for (const type in mods.extra) for (let k = 0; k < mods.extra[type]; k++) extras.push(type);
  count = Math.max(0, Math.min(count, slots - extras.length));

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
  const types = extras.slice();
  for (let k = 0; k < count; k++) types.push(pickType());
  // tougher enemies sit further back in the formation
  const rank = (t) => {
    const p = ENEMY_POOL.find((q) => q[0] === t);
    return p ? p[3] : 0;
  };
  rng.shuffle(types);
  types.sort((a, b) => rank(b) - rank(a));

  // rows used are centred vertically; slots go back row first, centre-out
  const rowsUsed = Math.min(F.rows, Math.ceil(types.length / F.cols));
  const row0 = (F.rows - rowsUsed) >> 1;
  const slotList = [];
  for (let r = row0; r < row0 + rowsUsed; r++) for (const c of COL_ORDER) slotList.push(r * F.cols + c);

  const shieldP = shieldChance(w);
  const spawns = [];
  const sides = rng.shuffle([0, 1, 2, 3]);
  const t0 = ENTRY.start + (boss ? 3 : 0);
  for (let i = 0; i < types.length; i++) {
    const sq = Math.floor(i / ENTRY.squad), k = i % ENTRY.squad;
    spawns.push({
      t: t0 + sq * ENTRY.squadGap + k * ENTRY.gap,
      type: types[i],
      shield: rng.chance(shieldP),
      slot: slotList[i],
      side: sides[sq % 4],
    });
  }
  if (boss) {
    const b = bossForWave(w);
    spawns.push({ t: 1, type: 'boss', boss: b.id, cycle: b.cycle, shield: false });
  }
  spawns.sort((a, b) => a.t - b.t);
  return spawns;
}

// Sends formation members down in small groups. Dives come faster late in a
// long wave, and the last few stragglers all dive at once.
export function updateDives(g, dt) {
  if (g.waveTime < WAVES.diveStart) return;
  g.diveT -= dt;
  if (g.diveT > 0) return;
  const list = g.enemies;
  let inForm = 0, busy = 0, total = 0, weight = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive || e.bossId) continue;
    total++;
    if (e.mode === MODE.FORM) {
      inForm++;
      weight += e.def.diveW || 1;
    } else if (e.mode !== MODE.ENTER) busy++;
  }
  const rush = g.spawnIdx >= g.spawns.length && total <= WAVES.rushAt;
  const late = g.waveTime > WAVES.enrageAt;
  let cap = maxDivers(g.wave) + (late ? 2 : 0);
  if (rush) cap = 99;
  if (inForm === 0 || busy >= cap) {
    g.diveT = 0.25;
    return;
  }
  // weighted pick of the leader
  let r = g.rng.next() * weight, lead = null;
  for (let i = 0; i < list.length && !lead; i++) {
    const e = list[i];
    if (!e.alive || e.bossId || e.mode !== MODE.FORM) continue;
    r -= e.def.diveW || 1;
    if (r <= 0) lead = e;
  }
  if (!lead) {
    for (let i = list.length - 1; i >= 0 && !lead; i--) if (list[i].alive && !list[i].bossId && list[i].mode === MODE.FORM) lead = list[i];
  }
  startDive(g, lead);
  // wingmen: formation neighbours follow a beat behind
  let wing = Math.min(cap - busy - 1, g.rng.int(0, WAVES.diveGroupMax - 1));
  for (let i = 0; i < list.length && wing > 0; i++) {
    const e = list[i];
    if (!e.alive || e.bossId || e.mode !== MODE.FORM) continue;
    if (Math.abs(e.x - lead.x) > 140 || Math.abs(e.y - lead.y) > 60) continue;
    startDive(g, e, lead.tx + (e.x - lead.x) * 0.5);
    e.busyT = 0.18 * (WAVES.diveGroupMax - wing);
    wing--;
  }
  let gap = diveGap(g.wave) * (g.mods.spawnMul || 1);
  if (late) gap *= WAVES.enrageGapMul;
  if (rush) gap = WAVES.rushGap;
  g.diveT = gap * g.rng.range(0.75, 1.25);
}

export function rollForks(rng, w) {
  const avail = FORKS.filter((f) => (f.from || 1) <= w);
  rng.shuffle(avail);
  return [avail[0].id, avail[1].id];
}
