// Headless test suite for the simulation (no browser needed).
//   node tools/test.mjs

import { Game, PHASE } from '../src/core/game.js';
import { SIM, BOSSES, BOSS_HOVER, PLAYER, ECONOMY, WORLD, WAVES, FORMATION, SCORE, ENEMIES } from '../src/config.js';
import { RNG } from '../src/core/util.js';
import { MODE } from '../src/core/entities.js';
import { spawnEnemy, spawnDiver, damageEnemy, applyMinus, SRC_TOWER, SRC_MINUS } from '../src/core/combat.js';
import { spawnBoss } from '../src/core/bosses.js';
import { createTower } from '../src/core/towers.js';
import { spawnProjectile } from '../src/core/projectiles.js';
import { startDive, spawnFormation, slotPos, fireShot, TOP_Y } from '../src/core/enemies.js';
import { buildWave } from '../src/core/waves.js';
import { playRun } from './sim.mjs';

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✘ ${name}\n      ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'expected equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

// A game sitting in combat on wave `w` with nothing spawned and no dives
// scheduled. A far-future dummy spawn keeps the wave open unless `open` is false.
function combatGame(w = 1, seed = 3, open = true) {
  const g = new Game({ seed });
  g.newRun({ seed });
  g.chooseDraft(0);
  g.placePending(1);
  g.wave = w;
  g.startWave();
  g.spawns = open ? [{ t: 1e9, type: 'jelly', shield: false, slot: 0, side: 0 }] : [];
  g.spawnIdx = 0;
  g.diveT = 1e9;
  return g;
}
function step(g, secs) {
  for (let i = 0; i < Math.round(secs * 60); i++) {
    g.update(SIM.DT);
    g.events.clear();
  }
}
// An enemy frozen in place (a "diver" stunned forever) for aiming tests.
function parked(g, type, x, y, shield = false) {
  const e = spawnEnemy(g, type, x, y, shield);
  e.mode = MODE.DIVE;
  e.stunT = 1e9;
  return e;
}
function fire(g, key, secs = 0.02) {
  g.input[key] = true;
  g.input[key + 'Pressed'] = true;
  step(g, secs);
  g.input[key] = false;
}

console.log('phase flow & commands');

test('new run starts in draft with starter capsules', () => {
  const g = new Game();
  g.newRun({ seed: 5 });
  eq(g.phase, PHASE.DRAFT);
  eq(g.draftOptions.length, 3);
  eq(g.shells, ECONOMY.startShells);
});

test('draft -> place -> build -> combat', () => {
  const g = new Game();
  g.newRun({ seed: 5 });
  assert(g.chooseDraft(1).ok);
  eq(g.phase, PHASE.PLACE);
  assert(!g.startWave().ok, 'cannot start while placing');
  assert(g.placePending(0).ok);
  eq(g.phase, PHASE.BUILD);
  eq(g.towers.length, 1);
  assert(!g.placePending(0).ok, 'nothing left to place');
  assert(g.startWave().ok);
  eq(g.phase, PHASE.COMBAT);
});

test('buy / upgrade / sell rules', () => {
  const g = new Game();
  g.newRun({ seed: 5 });
  g.chooseDraft(0);
  g.placePending(0);
  assert(!g.buyTower('shark', 1).ok, 'shark is locked at start');
  assert(!g.buyTower('fish', 0).ok, 'socket taken');
  g.shells = 10;
  assert(!g.buyTower('fish', 1).ok, 'too poor');
  g.shells = 1000;
  assert(g.buyTower('fish', 1).ok);
  assert(g.upgradeTower(1).ok);
  const r = g.upgradeTower(1);
  assert(!r.ok && /Unlock/.test(r.reason), 'evolution needs pearls');
  g.pearls = 5;
  assert(g.buyUnlock('evo_fish').ok);
  assert(g.upgradeTower(1).ok);
  eq(g.sockets[1].tower.level, 2);
  assert(!g.upgradeTower(1).ok, 'maxed');
  const invested = g.sockets[1].tower.invested;
  const before = g.shells;
  assert(g.sellTower(1).ok);
  eq(g.shells - before, Math.floor(invested * ECONOMY.sellRefund));
  eq(g.sockets[1].tower, null);
});

test('a capsule dropped on its twin levels it up', () => {
  const g = new Game();
  g.newRun({ seed: 5 });
  const type = g.draftOptions[0];
  g.chooseDraft(0);
  g.placePending(2);
  g.phase = PHASE.DRAFT;
  g.draftOptions = [type, type];
  g.chooseDraft(0);
  assert(g.placePending(2).ok, 'merge accepted');
  eq(g.sockets[2].tower.level, 1);
  eq(g.towers.length, 1);
  // a third copy needs the evolution unlock
  g.phase = PHASE.DRAFT;
  g.draftOptions = [type];
  assert(!g.canMerge(2, type), 'evolution is locked');
  g.chooseDraft(0);
  eq(g.phase, PHASE.PLACE, 'still placeable in an empty socket');
  assert(!g.placePending(2).ok, 'cannot merge past the lock');
});

test('skipping a capsule pays shells', () => {
  const g = new Game();
  g.newRun({ seed: 5 });
  const v = g.skipCapsuleValue();
  g.chooseDraft(-1);
  eq(g.phase, PHASE.BUILD);
  eq(g.shells, ECONOMY.startShells + v);
});

test('forks apply their immediate effects', () => {
  const g = new Game();
  g.newRun({ seed: 5 });
  g.phase = PHASE.FORK;
  g.forkOptions = ['sunny', 'cave'];
  const s = g.shells, p = g.pearls;
  g.chooseFork(1);
  eq(g.pearls, p + 1);
  eq(g.shells, s);
  eq(g.fork.id, 'cave');
  eq(g.phase, PHASE.DRAFT);
});

console.log('formation & dives');

test('squadrons swoop in and settle into their formation slots', () => {
  const g = combatGame(4);
  g.spawns = buildWave(g.rng, 4, {});
  step(g, 12);
  const live = g.enemies.filter((e) => e.alive);
  assert(live.length >= 10, `${live.length} enemies`);
  const p = { x: 0, y: 0 };
  for (const e of live) {
    eq(e.mode, MODE.FORM, `${e.type} settled`);
    slotPos(g, e.slot, p);
    assert(Math.abs(e.x - p.x) < 0.01 && Math.abs(e.y - p.y) <= FORMATION.bob + 0.01, 'sits on its slot');
  }
  assert(new Set(live.map((e) => e.slot)).size === live.length, 'one enemy per slot');
});

test('the dive scheduler sends enemies down at the reef', () => {
  const g = combatGame(6);
  g.spawns = buildWave(g.rng, 6, {});
  g.diveT = WAVES.diveStart;
  let dove = 0;
  for (let i = 0; i < 60 * 14; i++) {
    g.update(SIM.DT);
    for (let k = 0; k < g.events.n; k++) if (g.events.items[k].type === 'dive') dove++;
    g.events.clear();
  }
  assert(dove >= 3, `${dove} dives`);
});

test('a diver that reaches the reef bites the Coral Heart and flies home', () => {
  const g = combatGame();
  const e = spawnFormation(g, { type: 'kraken', slot: 12, side: 0, shield: false });
  e.mode = MODE.FORM;
  step(g, 0.05);
  startDive(g, e, 700);
  g.player.x = 100;
  e.x = 700;
  e.y = WORLD.REEF_Y - 5;
  e.vy = 200;
  step(g, 0.1);
  eq(g.heart.hp, g.heart.maxHp - e.leak, 'heart bitten');
  eq(e.mode, MODE.RETURN);
  assert(e.y < 100, 'came back in at the top');
  step(g, 5);
  eq(e.mode, MODE.FORM, 'back in formation');
});

test('diving into the fish knocks it out and breaks the diver', () => {
  const g = combatGame();
  g.shells = 100;
  const p = g.player;
  const e = spawnDiver(g, 'jelly', p.x, p.y - 60);
  e.vx = 0;
  e.vy = 200;
  e.tx = p.x;
  step(g, 0.3);
  assert(!e.alive, 'diver broke');
  eq(p.hearts, PLAYER.hearts - 1, 'fish hit');
  eq(g.waveStats.kills, 0, 'no reward for a crash');
});

test('enemy shots hit the fish and buddies, and Reef Wash clears them', () => {
  const g = combatGame();
  const p = g.player;
  const e = parked(g, 'jelly', p.x, 700);
  fireShot(g, e, 'drop');
  step(g, 1.2);
  eq(p.hearts, PLAYER.hearts - 1, 'fish hit');
  // straight down onto a buddy
  const t = g.towers[0];
  const e2 = parked(g, 'urchin', t.x, 760);
  g.player.x = 700;
  const hp = t.hp;
  const s = fireShot(g, e2, 'spike');
  s.vx = 0;
  step(g, 0.8);
  assert(t.hp < hp, 'buddy took the shot');
  g.reefWash = 1;
  fireShot(g, e2, 'spike');
  assert(g.useReefWash().ok);
  eq(g.strikes.filter((x) => x.alive).length, 0, 'washed away');
});

test('Minus bubbles fly straight up and hit', () => {
  const g = combatGame();
  const e = parked(g, 'jelly', 300, 420);
  g.player.x = 300;
  fire(g, 'minus', 0.05);
  step(g, 1.2);
  assert(e.hp < e.maxHp, 'jelly took damage');
  assert(e.minus >= 1, 'has a Minus stack');
});

test('Minus stacks slow, shred armor, and make enemies Sad at 3', () => {
  const g = combatGame();
  const e = parked(g, 'jelly', 300, 400);
  applyMinus(g, e);
  applyMinus(g, e);
  assert(!e.sad);
  applyMinus(g, e);
  assert(e.sad, 'sad at 3 stacks');
  assert(e.r < e.baseR, 'sad enemies shrink');
});

test('Sea Urchin shell resists damage until cracked', () => {
  const g = combatGame(6);
  const u = parked(g, 'urchin', 300, 300);
  const hp = u.hp;
  damageEnemy(g, u, 10, SRC_TOWER);
  assert(hp - u.hp < 3, `armored hit took ${hp - u.hp}`);
  applyMinus(g, u);
  applyMinus(g, u);
  applyMinus(g, u);
  assert(u.cracked, 'cracks at 3 Minus stacks');
  const hp2 = u.hp;
  damageEnemy(g, u, 10, SRC_TOWER);
  assert(hp2 - u.hp >= 10, 'full damage once cracked');
});

test('shields absorb damage; Plus bubbles pop them', () => {
  const g = combatGame(9);
  const e = parked(g, 'jelly', 350, 450, true);
  assert(e.shield > 0);
  const hp = e.hp;
  damageEnemy(g, e, 1, SRC_TOWER);
  eq(e.hp, hp, 'shield took the hit');
  g.player.x = e.x;
  g.player.meter = 100;
  fire(g, 'plus');
  step(g, 1.5);
  eq(e.shield, 0, 'shield popped');
});

test('jellies split into two minis that dive', () => {
  const g = combatGame();
  const e = parked(g, 'jelly', 300, 300);
  damageEnemy(g, e, 999, SRC_MINUS);
  const minis = g.enemies.filter((x) => x.alive && x.type === 'jellyMini');
  eq(minis.length, 2);
  assert(minis.every((m) => m.mode === MODE.DIVE && m.slot === -1), 'free divers');
});

test('divers score double and quick pops build a combo', () => {
  const g = combatGame();
  const a = parked(g, 'jellyMini', 200, 300);
  a.mode = MODE.FORM; // pretend it sits in the formation
  damageEnemy(g, a, 999, SRC_MINUS);
  eq(g.score, ENEMIES.jellyMini.score, 'formation kill');
  const b = parked(g, 'jellyMini', 300, 300);
  damageEnemy(g, b, 999, SRC_MINUS);
  const mul = 1 + SCORE.comboStep;
  eq(g.score - ENEMIES.jellyMini.score, Math.round((ENEMIES.jellyMini.score * SCORE.diveMul * mul) / 10) * 10, 'dive x2 with combo');
  eq(g.combo, 2);
  step(g, SCORE.comboWindow + 0.1);
  eq(g.combo, 0, 'combo lapses');
});

test('Clown Crabs steal at the reef and return the shells when popped', () => {
  const g = combatGame(2);
  g.shells = 100;
  g.player.x = 700;
  const c = spawnDiver(g, 'crab', 200, WORLD.REEF_Y - 4);
  c.tx = 200;
  c.vy = 200;
  step(g, 0.1);
  eq(c.mode, MODE.FLEE, 'running off');
  eq(g.shells, 100 - c.carry);
  const carry = c.carry;
  damageEnemy(g, c, 9999, SRC_MINUS);
  assert(g.shells >= 100, `shells recovered (${g.shells}, carried ${carry})`);
});

test('a Clown Crab that escapes keeps your shells', () => {
  const g = combatGame(2);
  const c = spawnDiver(g, 'crab', 200, 300);
  c.mode = MODE.FLEE;
  c.carry = 15;
  g.shells = 85;
  step(g, 4);
  assert(!c.alive, 'escaped');
  eq(g.waveStats.shellsStolen, 15);
  eq(g.shells, 85);
});

test('Baby Kraken grabs a buddy on the way down; Plus frees it', () => {
  const g = combatGame(3);
  const t = g.towers[0];
  const k = spawnDiver(g, 'kraken', t.x, t.y - 60);
  k.t1 = 0;
  k.vy = 0;
  g.player.x = 700;
  step(g, 0.05);
  assert(t.grabT > 0, 'buddy grabbed');
  g.player.x = t.x;
  g.player.invulnT = 99;
  g.player.meter = 100;
  fire(g, 'plus');
  step(g, 1.4);
  eq(t.grabT, 0, 'Plus cleared the grab');
  assert(t.plusT > 0, 'Plus Power granted');
});

test('a hurt Puffer Pal inflates, charges, and explodes', () => {
  const g = combatGame(4);
  const t = g.towers[0];
  const e = parked(g, 'puffer', t.x, t.y - 60);
  damageEnemy(g, e, 1, SRC_TOWER);
  eq(e.state, 1, 'inflating');
  const hp = t.hp;
  step(g, ENEMIES.puffer.fuse + 0.1);
  assert(!e.alive, 'popped');
  assert(t.hp < hp, 'blast hurt the buddy');
});

test('wave clears, pays a bonus, and repairs buddies', () => {
  const g = combatGame(1, 3, false);
  g.towers[0].hp = 1;
  const s = g.shells;
  step(g, 0.1);
  eq(g.phase, PHASE.WAVE_END);
  assert(g.shells > s, 'clear bonus paid');
  eq(g.towers[0].hp, g.towers[0].maxHp);
  assert(g.waveSummary.perfect, 'no heart damage = perfect');
  assert(g.score >= SCORE.waveClear + SCORE.perfect, 'score bonus');
});

console.log('bosses');

function hoveringBoss(g, id) {
  const b = spawnBoss(g, id, 0);
  b.mode = MODE.FORM;
  b.y = b.py = BOSS_HOVER.y;
  b.x = b.px = WORLD.W / 2;
  return b;
}

test('bosses fly in, then hover and sway', () => {
  const g = combatGame(5);
  const b = spawnBoss(g, 'chef', 0);
  b.t1 = b.t2 = 99;
  eq(b.mode, MODE.ENTER);
  step(g, BOSS_HOVER.enter + 0.1);
  eq(b.mode, MODE.FORM);
  assert(Math.abs(b.y - BOSS_HOVER.y) < 20, `hovering at ${b.y}`);
  const x0 = b.x;
  step(g, 1);
  assert(Math.abs(b.x - x0) > 20, 'sways');
});

test('Chef hat shots deal triple damage', () => {
  const g = combatGame(5);
  const b = hoveringBoss(g, 'chef');
  b.t1 = b.t2 = 99;
  b.baseSpeed = 0;
  step(g, 0.5);
  const before = b.hp;
  g.player.x = b.x; // hat sways ±5 in phase 1, so centre is inside the hat
  fire(g, 'minus');
  step(g, 1);
  const dmg = before - b.hp;
  assert(dmg >= PLAYER.minusDmg * 2.5, `hat damage ${dmg}`);
});

test('Sharky charges down a lane, swallows a buddy, and spits it out when beaten', () => {
  const g = combatGame(10);
  const t = g.towers[0];
  const b = hoveringBoss(g, 'sharky');
  b.x = t.x;
  b.state = 1;
  b.stateT = 0.05;
  b.tx = t.x;
  g.player.x = t.x > 400 ? 100 : 700;
  step(g, 1.5);
  eq(g.towers.length, 0, 'eaten');
  eq(g.swallowed.length, 1);
  damageEnemy(g, b, 1e9, SRC_MINUS);
  eq(g.towers.length, 1, 'spat back out');
  eq(g.towers[0].socket, t.socket);
});

test('Starfish stars stun a charging Sharky', () => {
  const g = combatGame(10);
  const so = g.sockets.find((s) => !s.tower);
  const star = createTower(g, 'starfish', so.i, 0);
  const b = hoveringBoss(g, 'sharky');
  b.state = 2;
  b.x = 400;
  b.y = 600;
  const p = spawnProjectile(g, 'star', 400, 640, 14);
  p.tx = 400;
  p.ty = 300;
  p.speed = 430;
  p.dmg = 5;
  p.owner = star;
  p.ownerId = star.id;
  p.life = 4;
  step(g, 0.1);
  assert(b.stunT > 0, 'stunned');
  eq(b.state, 3, 'charge called off');
});

test('Queen is armored while closed and weak while open', () => {
  const g = combatGame(15);
  const q = hoveringBoss(g, 'queen');
  q.t1 = 99;
  const h0 = q.hp;
  damageEnemy(g, q, 100, SRC_TOWER);
  const closedDmg = h0 - q.hp;
  q.state = 1;
  const h1 = q.hp;
  damageEnemy(g, q, 100, SRC_TOWER);
  const openDmg = h1 - q.hp;
  assert(openDmg > closedDmg * 5, `open ${openDmg} vs closed ${closedDmg}`);
});

test('Kraken Kitty tentacles cover buddies, block Minus, and expire', () => {
  const g = combatGame(20);
  for (const s of g.sockets) if (!s.tower) createTower(g, 'fish', s.i, 0);
  const k = hoveringBoss(g, 'kitty');
  k.baseSpeed = 0;
  k.t1 = 0;
  step(g, 0.05);
  const live = g.tentacles.filter((t) => t.alive);
  eq(live.length, 1);
  const tn = live[0];
  assert(g.sockets[tn.socket].tower.covered, 'buddy covered');
  g.player.x = tn.x;
  g.player.meter = 100;
  g.player.invulnT = 99;
  g.input.minus = true;
  step(g, 3);
  g.input.minus = false;
  assert(!tn.alive, 'Minus broke the tentacle');
  assert(!g.sockets[tn.socket].tower.covered, 'buddy freed');
  k.t1 = 0;
  step(g, BOSSES.kitty.tentacleLife + 0.5);
  assert(g.tentacles.filter((t) => t.alive).length <= BOSSES.kitty.tentacleMax[0], 'capped and expiring');
});

test('bosses slam the reef when a fight drags on, angrier each time', () => {
  const g = combatGame(5);
  g.heart.hp = g.heart.maxHp = 1000;
  const b = hoveringBoss(g, 'chef');
  b.t1 = b.t2 = 99;
  const sp = b.baseSpeed, leak = b.leak;
  b.enrageT = WAVES.bossSlamEvery - 0.05;
  step(g, 0.2);
  eq(b.laps, 1);
  assert(b.baseSpeed > sp && b.leak > leak, 'enraged');
  eq(g.heart.hp, 1000 - leak);
});

console.log('waves, save/load, determinism');

test('wave lists are sorted, fit the formation, and bring the boss on boss waves', () => {
  const rng = new RNG(9);
  for (let w = 1; w <= 30; w++) {
    const list = buildWave(rng, w, w % 3 ? {} : { extra: { crab: 4 } });
    for (let i = 1; i < list.length; i++) assert(list[i].t >= list[i - 1].t, 'sorted');
    eq(list.some((s) => s.type === 'boss'), w % 5 === 0, `boss on wave ${w}`);
    const slots = list.filter((s) => s.type !== 'boss').map((s) => s.slot);
    eq(new Set(slots).size, slots.length, `unique slots on wave ${w}`);
    assert(slots.every((s) => s >= 0 && s < FORMATION.cols * FORMATION.rows), 'slots inside the grid');
  }
});

test('save/load round-trips a run exactly', () => {
  const g = new Game();
  g.newRun({ seed: 77 });
  g.chooseDraft(0);
  g.placePending(3);
  g.shells = 500;
  g.score = 12340;
  g.buyTower('octopus', 5);
  g.upgradeTower(5);
  g.buyUpgrade('minusPower');
  g.pearls = 3;
  g.buyUnlock('magnet');
  const a = g.serialize();
  const h = new Game();
  assert(h.deserialize(JSON.parse(JSON.stringify(a))).ok);
  eq(JSON.stringify(h.serialize()), JSON.stringify(a));
  eq(h.stats.magnetR, PLAYER.magnetRUpgraded);
  eq(h.score, 12340);
});

test('saves from the tower-defense version are not resumed', () => {
  const g = new Game();
  g.newRun({ seed: 77 });
  const a = g.serialize();
  a.v = '1.2.0';
  assert(!new Game().deserialize(a).ok);
});

test('simulation is deterministic for a seed', () => {
  const a = playRun(4242, 'good', 6);
  const b = playRun(4242, 'good', 6);
  eq(JSON.stringify(a.waves), JSON.stringify(b.waves));
});

test('full runs terminate without NaN or stuck waves', () => {
  for (const seed of [11, 12, 13]) {
    const r = playRun(seed, 'sloppy', 20, (rec, g) => {
      for (const e of g.enemies) assert(Number.isFinite(e.x) && Number.isFinite(e.y), 'finite enemy position');
      assert(Number.isFinite(g.shells) && Number.isFinite(g.heart.hp) && Number.isFinite(g.score), 'finite economy');
    });
    assert(r.outcome !== 'stopped' || r.wave >= 20, `seed ${seed} stopped at ${r.wave}`);
  }
});

test('endless mode continues past wave 20 with boss variants', () => {
  const g = new Game();
  g.newRun({ seed: 8, endless: true });
  g.chooseDraft(0);
  g.placePending(1);
  g.wave = 25;
  g.startWave();
  const boss = g.spawns.find((s) => s.type === 'boss');
  eq(boss.boss, 'chef');
  eq(boss.cycle, 1);
});

test('player gets hit, drops shells, respawns', () => {
  const g = combatGame();
  g.shells = 100;
  g.player.x = 300;
  const sp = g.pools.strike.get();
  sp.reset();
  Object.assign(sp, { alive: true, kind: 'spark', sx: 300, sy: 600, x: 300, y: 600, tx: 300, ty: WORLD.RAIL_Y, dur: 0.1, r: 20, hitsPlayer: true });
  g.strikes.push(sp);
  step(g, 0.2);
  eq(g.player.hearts, PLAYER.hearts - 1);
  assert(!g.player.alive);
  assert(g.shells < 100, 'dropped shells');
  step(g, PLAYER.respawn + 0.1);
  assert(g.player.alive, 'respawned');
  assert(g.player.invulnT > 0, 'brief invulnerability');
});

test('free divers loop back in from the top after biting the reef', () => {
  const g = combatGame();
  g.player.x = 700;
  const e = spawnDiver(g, 'jellyMini', 100, WORLD.REEF_Y - 3);
  e.vy = 300;
  step(g, 0.05);
  eq(e.mode, MODE.DIVE);
  assert(e.y < TOP_Y + 40, 'back at the top');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
