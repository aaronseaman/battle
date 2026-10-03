// Game — the whole simulation. Pure logic: no DOM, no canvas, no audio, so it
// runs identically in the browser and headless in Node (tools/sim.mjs).
//
// Loop:  fork (left/right) -> draft (pick capsule) -> place -> build (shop) -> combat -> waveEnd -> ...
// UI and bots drive it only through the command methods (chooseFork, placePending, ...),
// which return { ok, reason }.

import {
  WORLD, MAP, PLAYER, HEART, ECONOMY, TOWERS, STARTER_TOWERS, FORKS, UPGRADES, UNLOCKS, WAVES, VERSION,
} from '../config.js';
import { RNG, Pool, compact } from './util.js';
import { Path } from './path.js';
import { SpatialGrid } from './grid.js';
import { EventQueue } from './events.js';
import { Enemy, Tower, Projectile, Strike, Pickup, Tentacle } from './entities.js';
import { spawnEnemy, clearTowerDebuffs, removeTower } from './combat.js';
import { spawnBoss, updateTentacles, retractTentacles } from './bosses.js';
import { updateEnemies, updateStrikes } from './enemies.js';
import { updateTowers, createTower, towerMaxHp } from './towers.js';
import { updateProjectiles } from './projectiles.js';
import { updatePlayer, updatePickups, resetPlayer, collectPickup } from './player.js';
import { buildWave, hpMul, speedMul, isBossWave, rollForks } from './waves.js';

export const PHASE = {
  TITLE: 'title',
  FORK: 'fork',
  DRAFT: 'draft',
  PLACE: 'place',
  BUILD: 'build',
  COMBAT: 'combat',
  WAVE_END: 'waveEnd',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
};

const OK = { ok: true, reason: '' };
const fail = (reason) => ({ ok: false, reason });

const NEUTRAL_MODS = Object.freeze({ id: 'none', name: 'Open Reef' });

export class Game {
  constructor(opts = {}) {
    this.events = new EventQueue(2048);
    this.path = new Path(MAP.path, MAP.corner);
    this.grid = new SpatialGrid(WORLD.W, WORLD.H, WORLD.CELL);
    this.sockets = MAP.sockets.map(([x, y], i) => ({
      i, x, y, tower: null, tentacle: null,
      coverage: Math.round(this.path.coverage(x, y, 150)),
    }));
    this.heart = { x: MAP.heart.x, y: MAP.heart.y, r: MAP.heart.r, hp: HEART.hp, maxHp: HEART.hp, regen: 0, hitT: 0 };
    this.player = {
      x: WORLD.W / 2, y: WORLD.RAIL_Y, px: WORLD.W / 2, r: PLAYER.r, vx: 0,
      alive: true, deadT: 0, invulnT: 0, hearts: PLAYER.hearts, maxHearts: PLAYER.hearts,
      meter: PLAYER.meterMax, cdMinus: 0, cdPlus: 0, shootT: 9, plusShootT: 9, skin: 'classic',
    };
    this.pools = {
      enemy: new Pool(() => new Enemy(), 128),
      proj: new Pool(() => new Projectile(), 256),
      strike: new Pool(() => new Strike(), 16),
      pickup: new Pool(() => new Pickup(), 32),
      tentacle: new Pool(() => new Tentacle(), 8),
      tower: new Pool(() => new Tower(), 0),
    };
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.strikes = [];
    this.pickups = [];
    this.tentacles = [];

    // Written by input (browser) or a bot (headless). Read by updatePlayer.
    this.input = { left: false, right: false, plus: false, minus: false, plusPressed: false, minusPressed: false, moveX: -1 };

    this.meta = opts.meta || { endlessUnlocked: false, skins: ['classic'], skin: 'classic', bestWave: 0, bestEndless: 0, wins: 0, runs: 0 };
    this.phase = PHASE.TITLE;
    this.paused = false;
    this.clock = 0; // always advancing (animations in menus)
    this.uiVersion = 0; // bumped on any state change the UI should redraw for
    this.saveRequest = ''; // 'save' | 'clear' — consumed by the host
    this.metaDirty = false;
    this.nextId = 0;
    this.stats = {};
    this.newRun({ seed: opts.seed || 1, dryRun: true });
    this.player.skin = this.meta.skin || 'classic';
    this.phase = PHASE.TITLE;
    this.saveRequest = '';
  }

  // ---------------------------------------------------------------- run setup

  newRun({ seed = (Math.random() * 2 ** 31) | 0, endless = false, dryRun = false } = {}) {
    this.seed = seed >>> 0 || 1;
    this.rng = new RNG(this.seed);
    this.endless = endless;
    this.wave = 1;
    this.shells = ECONOMY.startShells;
    this.pearls = ECONOMY.startPearls;
    this.upgrades = {};
    for (const k in UPGRADES) this.upgrades[k] = 0;
    this.reefWash = 0;
    this.unlocked = {};
    this.towerTypes = STARTER_TOWERS.slice();
    this.forkOptions = [];
    this.fork = NEUTRAL_MODS;
    this.mods = NEUTRAL_MODS;
    this.draftOptions = STARTER_TOWERS.slice();
    this.pendingTower = '';
    this.bossesDefeated = 0;
    this.boss = null;
    this.waveSummary = null;
    this.runStats = { kills: 0, shells: 0, towersBuilt: 0, perfectWaves: 0 };
    this.clearCombat();
    for (const t of this.towers) t.alive = false;
    this.towers.length = 0;
    for (const s of this.sockets) {
      s.tower = null;
      s.tentacle = null;
    }
    this.player.x = WORLD.W / 2;
    this.recalcStats();
    this.heart.hp = this.heart.maxHp;
    resetPlayer(this);
    this.waveStats = this.freshWaveStats();
    this.waveHpMul = 1;
    this.waveSpeedMul = 1;
    this.waveShellMul = 1;
    this.isBossWave = false;
    this.speed = 1;
    this.paused = false;
    if (!dryRun) {
      this.meta.runs++;
      this.metaDirty = true;
    }
    this.setPhase(PHASE.DRAFT);
    return OK;
  }

  freshWaveStats() {
    return {
      kills: 0, shells: 0, pearls: 0, leaks: 0, heartDmg: 0, playerHits: 0, shellsStolen: 0,
      towersEaten: 0, unlockedTower: '', bossDefeated: '', perfect: false, clearBonus: 0,
    };
  }

  clearCombat() {
    const release = (arr, pool) => {
      for (const o of arr) {
        o.alive = false;
        pool.release(o);
      }
      arr.length = 0;
    };
    release(this.enemies, this.pools.enemy);
    release(this.projectiles, this.pools.proj);
    release(this.strikes, this.pools.strike);
    release(this.pickups, this.pools.pickup);
    release(this.tentacles, this.pools.tentacle);
    for (const s of this.sockets) s.tentacle = null;
    this.boss = null;
    this.swallowed = [];
    this.spawns = [];
    this.spawnIdx = 0;
    this.waveTime = 0;
  }

  recalcStats() {
    const u = this.upgrades;
    const s = this.stats;
    s.meterRegen = PLAYER.meterRegen * (1 + 0.25 * u.meterRegen);
    s.meterMax = PLAYER.meterMax + 25 * u.meterCap;
    s.minusDmg = PLAYER.minusDmg * (1 + 0.3 * u.minusPower);
    s.minusSlowPer = PLAYER.minusSlowPer + 0.01 * u.minusPower;
    s.minusArmorPer = PLAYER.minusArmorPer + 0.005 * u.minusPower;
    s.plusHealTower = PLAYER.plusHealTower * (1 + 0.4 * u.plusPower);
    s.plusHealHeart = PLAYER.plusHealHeart * (1 + 0.4 * u.plusPower);
    s.plusPowerDur = PLAYER.plusPowerDur + u.plusPower;
    s.plusDmg = PLAYER.plusDmg;
    s.magnetR = this.unlocked.magnet ? PLAYER.magnetRUpgraded : PLAYER.magnetR;
    s.pickupMeter = this.unlocked.magnet ? PLAYER.pickupMeterUpgraded : PLAYER.pickupMeter;
    this.heart.maxHp = HEART.hp + 25 * u.heartHp;
    this.heart.regen = HEART.regen + 0.4 * u.heartRegen;
    this.player.maxHearts = PLAYER.hearts + (this.unlocked.extraHeart ? 1 : 0);
  }

  setPhase(phase) {
    this.phase = phase;
    this.uiVersion++;
    if (phase === PHASE.FORK || phase === PHASE.DRAFT || phase === PHASE.PLACE || phase === PHASE.BUILD) this.saveRequest = 'save';
    if (phase === PHASE.DEFEAT || phase === PHASE.VICTORY) this.saveRequest = 'clear';
    this.events.emit('phase', 0, 0, 0, 0, phase);
  }

  get totalWaves() {
    return WAVES.total;
  }

  // ---------------------------------------------------------------- commands

  chooseFork(i) {
    if (this.phase !== PHASE.FORK) return fail('Not choosing a fork');
    const id = this.forkOptions[i];
    const f = FORKS.find((x) => x.id === id);
    if (!f) return fail('No such fork');
    this.fork = f;
    if (f.shells) this.shells += f.shells;
    if (f.pearls) this.pearls += f.pearls;
    if (f.heal) this.heart.hp = Math.min(this.heart.maxHp, this.heart.hp + f.heal);
    this.events.emit('fork', 0, 0, i, 0, f.id);
    const n = f.capsules || (this.unlocked.luckyCapsule ? 3 : 2);
    this.draftOptions = this.rollCapsules(n);
    this.setPhase(PHASE.DRAFT);
    return OK;
  }

  rollCapsules(n) {
    const types = this.towerTypes.slice();
    this.rng.shuffle(types);
    const out = types.slice(0, Math.min(n, types.length));
    while (out.length < n) out.push(this.rng.pick(this.towerTypes));
    return out;
  }

  skipCapsuleValue() {
    let min = Infinity;
    for (const t of this.draftOptions) min = Math.min(min, TOWERS[t].cost);
    return Math.round(min * ECONOMY.skipCapsuleFrac);
  }

  // i = -1 takes shells instead of a tower.
  chooseDraft(i) {
    if (this.phase !== PHASE.DRAFT) return fail('Not drafting');
    if (i === -1 || !this.hasEmptySocket()) {
      const v = this.skipCapsuleValue();
      this.shells += v;
      this.events.emit('capsule_skip', 0, 0, v);
      this.pendingTower = '';
      this.setPhase(PHASE.BUILD);
      return OK;
    }
    const type = this.draftOptions[i];
    if (!type) return fail('No such capsule');
    this.pendingTower = type;
    this.events.emit('capsule', 0, 0, i, 0, type);
    this.setPhase(PHASE.PLACE);
    return OK;
  }

  hasEmptySocket() {
    return this.sockets.some((s) => !s.tower);
  }

  placePending(socketIdx) {
    if (this.phase !== PHASE.PLACE || !this.pendingTower) return fail('Nothing to place');
    const so = this.sockets[socketIdx];
    if (!so) return fail('No such socket');
    if (so.tower) return fail('Socket is taken');
    const type = this.pendingTower;
    const t = createTower(this, type, socketIdx, Math.round(TOWERS[type].cost * ECONOMY.capsuleValue));
    this.pendingTower = '';
    this.runStats.towersBuilt++;
    this.events.emit('tower_place', t.x, t.y, 0, 0, type, t);
    this.setPhase(PHASE.BUILD);
    return OK;
  }

  buyTower(type, socketIdx) {
    if (this.phase !== PHASE.BUILD) return fail('Can only build between waves');
    if (!this.towerTypes.includes(type)) return fail('Tower locked');
    const so = this.sockets[socketIdx];
    if (!so || so.tower) return fail('Socket is taken');
    const cost = TOWERS[type].cost;
    if (this.shells < cost) return this.denied('Not enough shells');
    this.shells -= cost;
    const t = createTower(this, type, socketIdx, cost);
    this.runStats.towersBuilt++;
    this.events.emit('tower_place', t.x, t.y, cost, 0, type, t);
    this.uiVersion++;
    this.saveRequest = 'save';
    return OK;
  }

  upgradeInfo(t) {
    if (!t) return null;
    if (t.level >= 2) return { cost: 0, max: true, locked: false, name: '' };
    const locked = t.level === 1 && !this.unlocked['evo_' + t.type];
    const next = t.def.levels[t.level + 1];
    return { cost: t.def.upgrade[t.level], max: false, locked, name: next.name || `${t.def.short} Lv${t.level + 2}` };
  }

  upgradeTower(socketIdx) {
    if (this.phase !== PHASE.BUILD) return fail('Can only upgrade between waves');
    const t = this.sockets[socketIdx]?.tower;
    if (!t) return fail('No tower here');
    const info = this.upgradeInfo(t);
    if (info.max) return fail('Already maxed');
    if (info.locked) return this.denied('Unlock its evolution with pearls first');
    if (this.shells < info.cost) return this.denied('Not enough shells');
    this.shells -= info.cost;
    t.invested += info.cost;
    t.level++;
    t.stats = t.def.levels[t.level];
    t.maxHp = t.hp = towerMaxHp(t.def, t.level);
    this.events.emit('tower_upgrade', t.x, t.y, t.level, 0, t.type, t);
    this.uiVersion++;
    this.saveRequest = 'save';
    return OK;
  }

  sellValue(t) {
    return Math.floor(t.invested * ECONOMY.sellRefund);
  }

  sellTower(socketIdx) {
    if (this.phase !== PHASE.BUILD) return fail('Can only sell between waves');
    const t = this.sockets[socketIdx]?.tower;
    if (!t) return fail('No tower here');
    const v = this.sellValue(t);
    this.shells += v;
    removeTower(this, t);
    this.events.emit('tower_sell', t.x, t.y, v, 0, t.type, null);
    this.uiVersion++;
    this.saveRequest = 'save';
    return OK;
  }

  upgradeCost(id) {
    const u = UPGRADES[id];
    if (!u) return null;
    if (u.consumable) return this.reefWash >= u.max ? null : u.cost[0];
    const lvl = this.upgrades[id];
    return lvl >= u.max ? null : u.cost[lvl];
  }

  buyUpgrade(id) {
    if (this.phase !== PHASE.BUILD) return fail('Shop is open between waves');
    const u = UPGRADES[id];
    if (!u) return fail('No such upgrade');
    const cost = this.upgradeCost(id);
    if (cost == null) return fail('Maxed out');
    if (this.shells < cost) return this.denied('Not enough shells');
    this.shells -= cost;
    if (u.consumable) this.reefWash++;
    else {
      this.upgrades[id]++;
      const before = this.heart.maxHp;
      this.recalcStats();
      if (id === 'heartHp') this.heart.hp = Math.min(this.heart.maxHp, this.heart.hp + (this.heart.maxHp - before));
      if (id === 'meterCap') this.player.meter = this.stats.meterMax;
    }
    this.events.emit('buy_upgrade', 0, 0, cost, 0, id);
    this.uiVersion++;
    this.saveRequest = 'save';
    return OK;
  }

  buyUnlock(id) {
    if (this.phase !== PHASE.BUILD) return fail('Unlocks are between waves');
    const u = UNLOCKS[id];
    if (!u) return fail('No such unlock');
    if (this.unlocked[id]) return fail('Already unlocked');
    if (this.pearls < u.pearls) return this.denied('Not enough pearls');
    this.pearls -= u.pearls;
    this.unlocked[id] = true;
    if (u.tower && !this.towerTypes.includes(u.tower)) this.towerTypes.push(u.tower);
    this.recalcStats();
    if (id === 'extraHeart') this.player.hearts = this.player.maxHearts;
    this.events.emit('buy_unlock', 0, 0, u.pearls, 0, id);
    this.uiVersion++;
    this.saveRequest = 'save';
    return OK;
  }

  denied(reason) {
    this.events.emit('denied', 0, 0, 0, 0, reason);
    return fail(reason);
  }

  startWave() {
    if (this.phase !== PHASE.BUILD) return fail('Not ready');
    if (this.pendingTower) return fail('Place your capsule first');
    this.clearCombat();
    const w = this.wave;
    this.mods = this.fork;
    this.waveHpMul = hpMul(w) * (this.mods.hpMul || 1);
    this.waveSpeedMul = speedMul(w) * (this.mods.speedMul || 1);
    this.waveShellMul = (1 + ECONOMY.shellScalePerWave * (w - 1)) * (this.mods.shellMul || 1);
    this.spawns = buildWave(this.rng, w, this.mods);
    this.spawnIdx = 0;
    this.waveTime = 0;
    this.waveStats = this.freshWaveStats();
    this.isBossWave = isBossWave(w);
    resetPlayer(this);
    const hpStart = this.mods.towerHpStart || 1;
    for (const t of this.towers) {
      t.hp = t.maxHp * hpStart;
      clearTowerDebuffs(t);
      t.plusT = 0;
      t.covered = false;
      t.state = 0;
      t.inflate = 0;
      t.sx = t.psx = t.x;
      t.sy = t.psy = t.y;
      t.cd = this.rng.range(0.1, 0.6);
      t.cd2 = 1;
      t.cd3 = 2;
    }
    this.input.left = this.input.right = this.input.plus = this.input.minus = false;
    this.input.moveX = -1;
    this.setPhase(PHASE.COMBAT);
    this.events.emit('wave_start', 0, 0, w, this.isBossWave ? 1 : 0, this.mods.id);
    return OK;
  }

  useReefWash() {
    if (this.phase !== PHASE.COMBAT || this.paused) return fail('Only during a wave');
    if (this.reefWash <= 0) return this.denied('No Reef Wash — buy one in the shop');
    this.reefWash--;
    for (const t of this.towers) clearTowerDebuffs(t);
    for (const s of this.strikes) if (!s.hitsPlayer) s.alive = false; // wash away incoming ink
    this.events.emit('reef_wash', WORLD.W / 2, WORLD.H / 2);
    this.uiVersion++;
    return OK;
  }

  continueAfterWave() {
    if (this.phase === PHASE.VICTORY) {
      this.endless = true;
    } else if (this.phase !== PHASE.WAVE_END) return fail('Wave not over');
    this.wave++;
    this.forkOptions = rollForks(this.rng, this.wave);
    this.setPhase(PHASE.FORK);
    return OK;
  }

  setPaused(p) {
    if (this.phase === PHASE.TITLE) p = false;
    if (this.paused === p) return;
    this.paused = p;
    this.uiVersion++;
    this.events.emit(p ? 'pause' : 'resume');
  }

  setSkin(id) {
    if (!this.meta.skins.includes(id)) return fail('Skin locked');
    this.meta.skin = id;
    this.player.skin = id;
    this.metaDirty = true;
    this.uiVersion++;
    return OK;
  }

  // Clears the board behind the title screen. The stored save (last build/fork
  // screen) is untouched, so "Continue" still works.
  quitToTitle() {
    this.newRun({ seed: 1, dryRun: true });
    this.saveRequest = '';
    this.setPhase(PHASE.TITLE);
  }

  // ---------------------------------------------------------------- simulation

  // Advance one fixed step. Call at SIM.DT intervals.
  update(dt) {
    if (this.paused) return;
    this.clock += dt;
    if (this.heart.hitT > 0) this.heart.hitT -= dt;
    if (this.phase !== PHASE.COMBAT) return;

    this.waveTime += dt;
    this.snapshot();
    this.spawnTick();
    updatePlayer(this, dt);
    updateEnemies(this, dt);

    const grid = this.grid;
    grid.clear();
    for (let i = 0; i < this.enemies.length; i++) if (this.enemies[i].alive) grid.insert(this.enemies[i]);

    updateTowers(this, dt);
    updateProjectiles(this, dt);
    updateStrikes(this, dt);
    updateTentacles(this, dt);
    updatePickups(this, dt);

    const h = this.heart;
    if (h.regen > 0 && h.hp > 0) h.hp = Math.min(h.maxHp, h.hp + h.regen * dt);

    compact(this.enemies, this.pools.enemy);
    compact(this.projectiles, this.pools.proj);
    compact(this.strikes, this.pools.strike);
    compact(this.pickups, this.pools.pickup);
    compact(this.tentacles, this.pools.tentacle);

    if (h.hp <= 0) {
      this.onDefeat();
      return;
    }
    if (this.spawnIdx >= this.spawns.length && this.enemies.length === 0) this.onWaveCleared();
  }

  // Remember where everything was so renderers can interpolate between ticks
  // (smooth motion on 120 Hz / throttled 30 Hz displays and uneven frame pacing).
  snapshot() {
    const lists = [this.enemies, this.projectiles, this.strikes];
    for (let l = 0; l < lists.length; l++) {
      const arr = lists[l];
      for (let i = 0; i < arr.length; i++) {
        const o = arr[i];
        o.px = o.x;
        o.py = o.y;
        if (o.pz !== undefined) o.pz = o.z;
      }
    }
    for (let i = 0; i < this.pickups.length; i++) {
      const o = this.pickups[i];
      o.px = o.x;
      o.py = o.y;
    }
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      t.psx = t.sx;
      t.psy = t.sy;
    }
    this.player.px = this.player.x;
  }

  spawnTick() {
    const list = this.spawns;
    while (this.spawnIdx < list.length && list[this.spawnIdx].t <= this.waveTime) {
      const s = list[this.spawnIdx++];
      if (s.type === 'boss') spawnBoss(this, s.boss, s.cycle);
      else spawnEnemy(this, s.type, 0, s.shield);
    }
  }

  get enemiesRemaining() {
    return this.enemies.length + (this.spawns.length - this.spawnIdx);
  }

  onWaveCleared() {
    const ws = this.waveStats;
    // sweep remaining shells into the bank
    for (const p of this.pickups) if (p.alive) collectPickup(this, p);
    const bonus = Math.round((ECONOMY.waveClearBase + ECONOMY.waveClearPerWave * this.wave) * (this.mods.shellMul || 1));
    ws.clearBonus = bonus;
    this.shells += bonus;
    ws.shells += bonus;
    if (ws.heartDmg <= 0) {
      ws.perfect = true;
      this.pearls += ECONOMY.perfectPearls;
      ws.pearls += ECONOMY.perfectPearls;
      this.runStats.perfectWaves++;
    }
    retractTentacles(this);
    this.restoreSwallowed();
    this.clearCombat();
    for (const t of this.towers) {
      t.hp = t.maxHp;
      clearTowerDebuffs(t);
      t.plusT = 0;
      t.covered = false;
      t.state = 0;
      t.inflate = 0;
      t.sx = t.psx = t.x;
      t.sy = t.psy = t.y;
    }
    resetPlayer(this);
    this.waveSummary = { wave: this.wave, ...ws };
    const m = this.meta;
    if (this.endless) {
      if (this.wave > m.bestEndless) m.bestEndless = this.wave;
      if (this.wave >= 30 && !m.skins.includes('galaxy')) {
        m.skins.push('galaxy');
        this.waveSummary.newSkin = 'galaxy';
      }
    }
    if (this.wave > m.bestWave) m.bestWave = this.wave;
    this.metaDirty = true;
    this.events.emit('wave_end', 0, 0, this.wave, bonus);
    if (this.wave === WAVES.total && !this.endless) {
      m.wins++;
      m.endlessUnlocked = true;
      for (const s of ['golden', 'neon']) if (!m.skins.includes(s)) m.skins.push(s);
      this.events.emit('victory');
      this.setPhase(PHASE.VICTORY);
    } else this.setPhase(PHASE.WAVE_END);
  }

  // Sharky spits out the towers he swallowed once the fight is over.
  restoreSwallowed() {
    for (const s of this.swallowed) {
      if (this.sockets[s.socket].tower) continue;
      const t = createTower(this, s.type, s.socket, s.invested);
      t.level = s.level;
      t.stats = t.def.levels[t.level];
      t.maxHp = t.hp = towerMaxHp(t.def, t.level);
      t.kills = s.kills;
      this.events.emit('tower_spat', t.x, t.y, 0, 0, t.type, t);
    }
    this.swallowed.length = 0;
  }

  onDefeat() {
    this.heart.hp = 0;
    this.waveSummary = { wave: this.wave, ...this.waveStats };
    const m = this.meta;
    if (this.wave - 1 > m.bestWave) m.bestWave = this.wave - 1;
    this.metaDirty = true;
    this.events.emit('defeat', this.heart.x, this.heart.y, this.wave);
    this.setPhase(PHASE.DEFEAT);
  }

  // ---------------------------------------------------------------- save / load

  // Only non-combat state is saved; a resumed run restarts from the last build/fork/draft screen.
  serialize() {
    return {
      v: VERSION,
      seed: this.seed,
      rng: this.rng.s,
      endless: this.endless,
      wave: this.wave,
      phase: this.phase,
      shells: this.shells,
      pearls: this.pearls,
      upgrades: { ...this.upgrades },
      unlocked: { ...this.unlocked },
      towerTypes: this.towerTypes.slice(),
      reefWash: this.reefWash,
      heartHp: this.heart.hp,
      fork: this.fork.id,
      forkOptions: this.forkOptions.slice(),
      draftOptions: this.draftOptions.slice(),
      pendingTower: this.pendingTower,
      bossesDefeated: this.bossesDefeated,
      runStats: { ...this.runStats },
      towers: this.towers.map((t) => ({ s: t.socket, type: t.type, level: t.level, invested: t.invested, kills: t.kills })),
    };
  }

  deserialize(d) {
    if (!d || !d.towers) return fail('Bad save');
    const resumable = [PHASE.FORK, PHASE.DRAFT, PHASE.PLACE, PHASE.BUILD];
    if (!resumable.includes(d.phase)) return fail('Save not resumable');
    this.newRun({ seed: d.seed, endless: d.endless, dryRun: true });
    this.rng.s = d.rng >>> 0;
    this.wave = d.wave;
    this.shells = d.shells;
    this.pearls = d.pearls;
    Object.assign(this.upgrades, d.upgrades);
    this.unlocked = { ...d.unlocked };
    this.towerTypes = d.towerTypes.filter((t) => TOWERS[t]);
    this.reefWash = d.reefWash | 0;
    this.fork = FORKS.find((f) => f.id === d.fork) || NEUTRAL_MODS;
    this.forkOptions = d.forkOptions || [];
    this.draftOptions = d.draftOptions || [];
    this.pendingTower = d.pendingTower || '';
    this.bossesDefeated = d.bossesDefeated | 0;
    Object.assign(this.runStats, d.runStats);
    this.recalcStats();
    this.heart.hp = Math.min(this.heart.maxHp, d.heartHp);
    for (const tw of d.towers) {
      if (!TOWERS[tw.type] || !this.sockets[tw.s] || this.sockets[tw.s].tower) continue;
      const t = createTower(this, tw.type, tw.s, tw.invested);
      t.level = Math.min(2, tw.level | 0);
      t.stats = t.def.levels[t.level];
      t.maxHp = t.hp = towerMaxHp(t.def, t.level);
      t.kills = tw.kills | 0;
    }
    resetPlayer(this);
    this.setPhase(d.phase);
    return OK;
  }
}
