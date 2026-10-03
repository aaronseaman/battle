// Headless test suite for the simulation (no browser needed).
//   node tools/test.mjs

import { Game, PHASE, STAGE, normalizeMeta } from '../src/core/game.js';
import { SIM, ROAD, SCHOOL, GATES, BOSSES, UPGRADES, BUDDY_MAX } from '../src/config.js';
import { buildLevel } from '../src/core/level.js';
import { playCampaign } from './sim.mjs';

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
function step(g, secs) {
  for (let i = 0; i < Math.round(secs * 60); i++) {
    g.update(SIM.DT);
    g.events.clear();
  }
}
// A level in progress with an empty road (nothing else will spawn).
function emptyRoad(level = 1, fish = 10) {
  const g = new Game({ meta: { level } });
  g.startLevel();
  g.plan.items = [];
  g.school.n = fish;
  return g;
}
function enemy(g, type, x, z, hp = 10) {
  const e = g.addThing('enemy', type, x, z);
  e.w = e.depth = 16;
  e.hp = e.maxHp = hp;
  e.speed = 0;
  e.bite = 2;
  e.coins = 1;
  return e;
}
function gates(g, left, right, z = 300) {
  const l = g.addThing('gate', '', -GATES.w / 2, z);
  const r = g.addThing('gate', '', GATES.w / 2, z);
  l.w = r.w = GATES.w / 2 - 4;
  l.depth = r.depth = 8;
  l.gate = left;
  r.gate = right;
  l.partner = r;
  r.partner = l;
  return [l, r];
}

console.log('flow');

test('a new game sits on the title; starting a level puts the school on the road', () => {
  const g = new Game();
  eq(g.phase, PHASE.TITLE);
  assert(g.startLevel().ok);
  eq(g.phase, PHASE.PLAY);
  eq(g.school.n, SCHOOL.start);
  eq(g.stage, STAGE.RUN);
});

test('levels are deterministic, sorted, and end with the boss', () => {
  for (let L = 1; L <= 30; L++) {
    const a = buildLevel(L), b = buildLevel(L);
    eq(JSON.stringify(a), JSON.stringify(b), `level ${L} deterministic`);
    for (let i = 1; i < a.items.length; i++) assert(a.items[i].at >= a.items[i - 1].at, 'sorted');
    eq(a.items[a.items.length - 1].kind, 'boss', `level ${L} ends with a boss`);
    assert(a.items.every((it) => it.kind !== 'enemy' || Math.abs(it.x) <= ROAD.half), 'critters on the road');
  }
});

test('the first gate of level 1 cannot wipe out the school', () => {
  const first = buildLevel(1).items.find((it) => it.kind === 'gates');
  const worst = Math.min(first.left.value, first.right.value);
  assert(SCHOOL.start + worst > 0, `worst first gate ${worst}`);
});

console.log('steering & shooting');

test('dragging steers the school; it stays on the road', () => {
  const g = emptyRoad();
  g.input.targetX = 80;
  step(g, 0.5);
  assert(Math.abs(g.school.x - 80) < 1, `x ${g.school.x}`);
  g.input.targetX = -9999;
  step(g, 1);
  eq(g.school.x, -(ROAD.half - ROAD.edge));
  g.input.targetX = NaN;
  g.input.right = true;
  step(g, 0.5);
  assert(g.school.x > -(ROAD.half - ROAD.edge), 'arrow keys steer too');
});

test('the school shoots by itself and pops what is in front of it', () => {
  const g = emptyRoad(1, 10);
  const e = enemy(g, 'jelly', 0, 500, 30);
  step(g, 1.5);
  assert(!e.alive, 'popped');
  assert(g.coinsRun >= 1, 'coins for the pop');
});

test('critters off to the side are not hit (you have to steer at them)', () => {
  const g = emptyRoad(1, 4);
  const e = enemy(g, 'jelly', ROAD.half - 20, 600, 30);
  step(g, 0.5);
  eq(e.hp, 30, 'untouched');
});

test('a critter that reaches the school eats fish', () => {
  const g = emptyRoad(1, 10);
  g.school.fireT = 99; // hold fire
  enemy(g, 'kraken', 0, 30, 999);
  step(g, 0.3);
  eq(g.school.n, 8);
});

console.log('gates, clams, buddies');

test('steering into a gate applies that gate only', () => {
  const g = emptyRoad(1, 10);
  g.school.fireT = 99;
  gates(g, { type: 'add', value: 5 }, { type: 'mul', value: 2 }, 200);
  g.input.targetX = 75;
  step(g, 1.5);
  eq(g.school.n, 20, 'took ×2 on the right');
  gates(g, { type: 'add', value: -4 }, { type: 'add', value: 3 }, 200);
  g.input.targetX = -75;
  step(g, 1.5);
  eq(g.school.n, 16, 'took −4 on the left');
});

test('a bad gate can wipe out the school and lose the level', () => {
  const g = emptyRoad(1, 3);
  g.school.fireT = 99;
  gates(g, { type: 'add', value: -9 }, { type: 'add', value: -9 }, 100);
  step(g, 3);
  eq(g.phase, PHASE.LOST);
});

test('shooting a number gate raises it, a little at a time', () => {
  const g = emptyRoad(1, 20);
  const [l] = gates(g, { type: 'add', value: -5 }, { type: 'add', value: 2 }, 900);
  g.input.targetX = -75;
  step(g, 0.8);
  assert(l.gate.value > -5, `bumped to ${l.gate.value}`);
  assert(l.gate.value <= -5 + GATES.bumpMax + 1, 'capped');
});

test('cracking a clam pays its prize; an uncracked clam crushes fish', () => {
  const g = emptyRoad(1, 10);
  const c = g.addThing('clam', 'clam', 0, 500);
  c.w = 36;
  c.depth = 22;
  c.hp = c.maxHp = 40;
  c.gate = { type: 'add', value: 6 };
  step(g, 2);
  assert(!c.alive, 'cracked');
  eq(g.school.n, 16, 'prize');
  const d = g.addThing('clam', 'clam', 0, 40);
  d.w = 36;
  d.depth = 22;
  d.hp = d.maxHp = 400;
  d.gate = { type: 'add', value: 6 };
  g.school.fireT = 99;
  step(g, 0.3);
  assert(g.school.n < 16, 'crushed');
});

test('buddy gates recruit buddies (up to two; a repeat levels one up)', () => {
  const g = emptyRoad(1, 10);
  g.applyEffect({ type: 'buddy', buddy: 'shark' }, 0, 0, 'gate');
  g.applyEffect({ type: 'buddy', buddy: 'starfish' }, 0, 0, 'gate');
  g.applyEffect({ type: 'buddy', buddy: 'shark' }, 0, 0, 'gate');
  eq(g.school.buddies.length, 2);
  eq(g.school.buddies.find((b) => b.type === 'shark').level, 2);
  g.applyEffect({ type: 'buddy', buddy: 'crab' }, 0, 0, 'gate');
  eq(g.school.buddies.length, BUDDY_MAX);
  assert(g.school.buddies.some((b) => b.type === 'crab') && g.school.buddies.some((b) => b.type === 'shark'), 'replaced the weaker one');
  const e = enemy(g, 'urchin', 120, 500, 200);
  g.school.fireT = 99;
  step(g, 3);
  assert(e.hp < 200, 'buddies aim at things off to the side');
});

console.log('the boss');

function bossFight(id = 'chef', level = 1) {
  const g = emptyRoad(level, 30);
  const b = g.addThing('boss', id, 0, BOSSES[id].stopZ + 20);
  b.w = BOSSES[id].r;
  b.depth = BOSSES[id].r * 0.6;
  b.hp = b.maxHp = 1e6;
  b.attackT = 99;
  g.boss = b;
  step(g, 0.2);
  return { g, b };
}

test('the road stops when the boss arrives', () => {
  const { g } = bossFight();
  eq(g.stage, STAGE.BOSS);
  const d = g.dist;
  step(g, 1);
  eq(g.dist, d, 'no more scrolling');
});

test('thrown attacks hit where the school stands; stepping aside dodges', () => {
  const { g, b } = bossFight('chef');
  g.school.fireT = 99;
  b.attackT = 0;
  step(g, 0.1);
  const n = g.school.n;
  step(g, 1.2);
  assert(g.school.n < n, 'hit');
  b.attackT = 0;
  step(g, 0.1);
  const m = g.school.n;
  g.input.targetX = g.school.x > 0 ? -120 : 120;
  step(g, 1.2);
  eq(g.school.n, m, 'dodged');
});

test('Sharky charges down a lane; staying in it costs fish', () => {
  const { g, b } = bossFight('sharky');
  g.school.fireT = 99;
  b.attackT = 0;
  const n = g.school.n;
  step(g, 2.5);
  assert(g.school.n < n, 'rammed');
  eq(b.state, 0, 'back in place');
});

test('beating the boss clears the level, pays coins and unlocks the next', () => {
  const { g, b } = bossFight('queen', 3);
  const coins = g.meta.coins;
  b.hp = 1;
  step(g, 2);
  eq(g.phase, PHASE.WON);
  eq(g.meta.level, 4);
  assert(g.meta.coins > coins, 'coins');
  assert(g.result.won && g.result.bonus > 0);
});

test('a boss that reaches the school ends the level', () => {
  const { g, b } = bossFight('kitty');
  b.homeZ = b.z = g.schoolFront + b.depth - 1;
  step(g, 2);
  eq(g.phase, PHASE.LOST);
  eq(g.meta.level, 1, 'same level next time');
});

console.log('progress');

test('upgrades cost more each level and need coins', () => {
  const g = new Game();
  g.meta.coins = 0;
  assert(!g.buyUpgrade('fish').ok, 'too poor');
  g.meta.coins = 10000;
  const c0 = g.upgradeCost('fish');
  assert(g.buyUpgrade('fish').ok);
  assert(g.upgradeCost('fish') > c0, 'grows');
  g.startLevel();
  eq(g.school.n, SCHOOL.start + 1, 'bigger school');
  assert(!g.buyUpgrade('dmg').ok, 'not during a level');
  for (const id in UPGRADES) assert(g.upgradeCost(id) > 0);
});

test('saved progress is cleaned up on load (old saves, bad values)', () => {
  const m = normalizeMeta({ bestWave: 12, skins: ['classic', 'golden', 'bogus'], skin: 'bogus', level: -3, coins: 'x' });
  eq(m.level, 1);
  eq(m.coins, 0);
  eq(m.skin, 'classic');
  eq(JSON.stringify(m.skins), '["classic","golden"]');
  eq(normalizeMeta(null).level, 1);
});

test('the simulation is deterministic', () => {
  const a = playCampaign('good', 3, 6, null, 1);
  const b = playCampaign('good', 3, 6, null, 1);
  eq(JSON.stringify(a.levels), JSON.stringify(b.levels));
});

test('a good player clears the first 8 levels; doing nothing loses level 1', () => {
  const good = playCampaign('good', 8, 12, null, 3);
  assert(good.reached > 8, `good reached ${good.reached}`);
  for (const l of good.levels) assert(Number.isFinite(l.secs) && l.secs < 120, 'levels end');
  const idle = playCampaign('idle', 1, 3, null, 3);
  assert(idle.levels.every((l) => !l.won), 'idle never wins');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
