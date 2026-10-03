// Headless test suite for the simulation (no browser needed).
//   node tools/test.mjs

import { Game, PHASE } from '../src/core/game.js';
import { SIM, BOSSES, PLAYER, ECONOMY, WORLD } from '../src/config.js';
import { RNG } from '../src/core/util.js';
import { spawnEnemy, damageEnemy, applyMinus, SRC_TOWER, SRC_MINUS } from '../src/core/combat.js';
import { spawnBoss } from '../src/core/bosses.js';
import { createTower } from '../src/core/towers.js';
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

// A game sitting in combat on wave `w` with nothing spawned yet. A far-future
// dummy spawn keeps the wave open unless `open` is false.
function combatGame(w = 1, seed = 3, open = true) {
  const g = new Game({ seed });
  g.newRun({ seed });
  g.chooseDraft(0);
  g.placePending(1);
  g.wave = w;
  g.startWave();
  g.spawns = open ? [{ t: 1e9, type: 'jelly', shield: false }] : [];
  g.spawnIdx = 0;
  return g;
}
function step(g, secs) {
  for (let i = 0; i < Math.round(secs * 60); i++) {
    g.update(SIM.DT);
    g.events.clear();
  }
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

console.log('combat rules');

test('Minus stacks slow, shred armor, and make enemies Sad at 3', () => {
  const g = combatGame();
  const e = spawnEnemy(g, 'jelly', 100);
  applyMinus(g, e);
  applyMinus(g, e);
  assert(!e.sad);
  applyMinus(g, e);
  assert(e.sad, 'sad at 3 stacks');
  assert(e.r < e.baseR, 'sad enemies shrink');
});

test('Sea Urchin shell resists damage until cracked', () => {
  const g = combatGame(6);
  const u = spawnEnemy(g, 'urchin', 100);
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
  const e = spawnEnemy(g, 'jelly', 400, true);
  assert(e.shield > 0);
  const hp = e.hp;
  damageEnemy(g, e, 1, SRC_TOWER);
  eq(e.hp, hp, 'shield took the hit');
  // line the fish up under the enemy and fire Plus
  g.player.x = e.x;
  g.player.meter = 100;
  e.baseSpeed = 0;
  g.input.plus = true;
  g.input.plusPressed = true;
  step(g, 0.02);
  g.input.plus = false;
  step(g, 1.5);
  eq(e.shield, 0, 'shield popped');
});

test('Minus bubbles fly straight up and hit', () => {
  const g = combatGame();
  const e = spawnEnemy(g, 'jelly', 700); // on the second horizontal run
  e.baseSpeed = 0;
  g.player.x = e.x;
  g.input.minus = true;
  step(g, 0.05);
  g.input.minus = false;
  step(g, 1.2);
  assert(e.hp < e.maxHp, 'jelly took damage');
  assert(e.minus >= 1, 'has a Minus stack');
});

test('jellies split into two minis', () => {
  const g = combatGame();
  const e = spawnEnemy(g, 'jelly', 300);
  damageEnemy(g, e, 999, SRC_MINUS);
  const minis = g.enemies.filter((x) => x.alive && x.type === 'jellyMini');
  eq(minis.length, 2);
});

test('leaks hurt the Coral Heart; zero HP is defeat', () => {
  const g = combatGame();
  const e = spawnEnemy(g, 'jelly', g.path.length - 1);
  step(g, 0.2);
  assert(!e.alive);
  eq(g.heart.hp, g.heart.maxHp - e.leak);
  g.heart.hp = 1;
  spawnEnemy(g, 'urchin', g.path.length - 1);
  step(g, 0.5);
  eq(g.phase, PHASE.DEFEAT);
  eq(g.saveRequest, 'clear');
});

test('Clown Crabs steal shells and return them when popped', () => {
  const g = combatGame(2);
  g.shells = 100;
  const c = spawnEnemy(g, 'crab', g.path.length - 1);
  step(g, 0.1);
  eq(c.dir, -1, 'running home');
  eq(g.shells, 100 - c.carry);
  const carry = c.carry;
  damageEnemy(g, c, 9999, SRC_MINUS);
  assert(g.shells >= 100 - carry + carry, 'shells recovered');
});

test('Baby Kraken grabs and disables a tower; Plus frees it', () => {
  const g = combatGame(3);
  const t = g.towers[0];
  // spawn the kraken right next to the tower's socket
  const d = g.path.closest(t.x, t.y).dist;
  const k = spawnEnemy(g, 'kraken', d);
  k.t1 = 0;
  step(g, 0.05);
  assert(t.grabT > 0, 'tower grabbed');
  g.player.x = t.x;
  g.player.meter = 100;
  g.input.plus = true;
  step(g, 0.02);
  g.input.plus = false;
  step(g, 1.4);
  eq(t.grabT, 0, 'Plus cleared the grab');
  assert(t.plusT > 0, 'Plus Power granted');
});

test('wave clears, pays a bonus, and repairs towers', () => {
  const g = combatGame(1, 3, false);
  g.towers[0].hp = 1;
  const s = g.shells;
  step(g, 0.1);
  eq(g.phase, PHASE.WAVE_END);
  assert(g.shells > s, 'clear bonus paid');
  eq(g.towers[0].hp, g.towers[0].maxHp);
  assert(g.waveSummary.perfect, 'no heart damage = perfect');
});

console.log('bosses');

test('Chef hat shots deal triple damage', () => {
  const g = combatGame(5);
  const b = spawnBoss(g, 'chef', 0);
  b.dist = 700;
  b.baseSpeed = 0;
  b.t1 = b.t2 = 99;
  step(g, 0.02);
  const before = b.hp;
  g.player.x = b.x; // hat sways ±5 in phase 1, so center is inside the hat
  g.input.minus = true;
  step(g, 0.02);
  g.input.minus = false;
  step(g, 1);
  const dmg = before - b.hp;
  assert(dmg >= PLAYER.minusDmg * 2.5, `hat damage ${dmg}`);
});

test('Sharky swallows a tower mid-charge and spits it out when beaten', () => {
  const g = combatGame(10);
  const t = g.towers[0];
  const b = spawnBoss(g, 'sharky', 0);
  b.dist = g.path.closest(t.x, t.y).dist - 60;
  b.state = 2;
  b.stateT = 2;
  step(g, 0.1);
  eq(g.towers.length, 0, 'eaten');
  eq(g.swallowed.length, 1);
  damageEnemy(g, b, 1e9, SRC_MINUS);
  eq(g.towers.length, 1, 'spat back out');
  eq(g.towers[0].socket, t.socket);
});

test('Starfish stars stun a winding-up Sharky', () => {
  const g = combatGame(10);
  const b = spawnBoss(g, 'sharky', 0);
  b.state = 1;
  b.stateT = 1;
  g.pearls = 0;
  // fake a star hit through the real projectile path
  const so = g.sockets.find((s) => !s.tower);
  createTower(g, 'starfish', so.i, 0);
  b.dist = g.path.closest(so.x, so.y).dist;
  b.baseSpeed = 0;
  step(g, 2);
  assert(b.stunT > 0 || b.state === 0, `sharky state ${b.state}`);
});

test('Queen is armored while closed and weak while open', () => {
  const g = combatGame(15);
  const q = spawnBoss(g, 'queen', 0);
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

test('Kraken Kitty tentacles cover towers, block Minus, and expire', () => {
  const g = combatGame(20);
  for (const s of g.sockets) if (!s.tower) createTower(g, 'fish', s.i, 0);
  const k = spawnBoss(g, 'kitty', 0);
  k.baseSpeed = 0;
  k.t1 = 0;
  step(g, 0.05);
  const live = g.tentacles.filter((t) => t.alive);
  eq(live.length, 1);
  const tn = live[0];
  assert(g.sockets[tn.socket].tower.covered, 'tower covered');
  g.player.x = tn.x;
  g.player.meter = 100;
  g.input.minus = true;
  step(g, 3);
  g.input.minus = false;
  assert(!tn.alive, 'Minus broke the tentacle');
  assert(!g.sockets[tn.socket].tower.covered, 'tower freed');
  k.t1 = 0;
  step(g, BOSSES.kitty.tentacleLife + 0.5);
  assert(g.tentacles.filter((t) => t.alive).length <= BOSSES.kitty.tentacleMax[0], 'capped and expiring');
});

test('bosses that lap the reef come back faster and hit harder', () => {
  const g = combatGame(5);
  g.heart.hp = g.heart.maxHp = 1000;
  const b = spawnBoss(g, 'chef', 0);
  b.t1 = b.t2 = 99;
  const sp = b.baseSpeed, leak = b.leak;
  b.dist = g.path.length - 1;
  step(g, 0.2);
  eq(b.laps, 1);
  assert(b.baseSpeed > sp && b.leak > leak, 'enraged');
  eq(g.heart.hp, 1000 - leak);
});

console.log('waves, save/load, determinism');

test('wave lists are sorted and include the boss on boss waves', () => {
  const rng = new RNG(9);
  for (let w = 1; w <= 30; w++) {
    const list = buildWave(rng, w, {});
    for (let i = 1; i < list.length; i++) assert(list[i].t >= list[i - 1].t, 'sorted');
    eq(list.some((s) => s.type === 'boss'), w % 5 === 0, `boss on wave ${w}`);
  }
});

test('save/load round-trips a run exactly', () => {
  const g = new Game();
  g.newRun({ seed: 77 });
  g.chooseDraft(0);
  g.placePending(3);
  g.shells = 500;
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
      assert(Number.isFinite(g.shells) && Number.isFinite(g.heart.hp), 'finite economy');
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
  const s = g.strikes;
  // drop a spark right on the fish
  g.events.clear();
  const sp = g.pools.strike.get();
  sp.reset();
  Object.assign(sp, { alive: true, kind: 'spark', sx: 300, sy: 600, x: 300, y: 600, tx: 300, ty: WORLD.RAIL_Y, dur: 0.1, r: 20, hitsPlayer: true });
  s.push(sp);
  step(g, 0.2);
  eq(g.player.hearts, PLAYER.hearts - 1);
  assert(!g.player.alive);
  assert(g.shells < 100, 'dropped shells');
  step(g, PLAYER.respawn + 0.1);
  assert(g.player.alive, 'respawned');
  assert(g.player.invulnT > 0, 'brief invulnerability');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
