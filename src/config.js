// Reef Rumble — a claymation lane runner. All tunable game data lives here.
//
// Your school of clay fish swims up a reef road on its own and shoots on its own.
// You only steer: swipe left / right. Two gates side by side ask you to pick one;
// clams and crowds of sea critters block the road; a boss waits at the end.

export const VERSION = '3.2.0';

export const SIM = {
  DT: 1 / 60,
  MAX_STEPS: 8,
  ANIM_FPS: 12, // stop-motion animation clock for renderers
};

// The road. x is across (0 = middle), z is distance ahead of the school (0 = the school).
export const ROAD = {
  half: 150, // road half-width
  edge: 18, // the school's centre stays this far inside the edges
  view: 700, // how far ahead things appear (the top of the screen)
  behind: 90, // things are removed once this far behind the school
  speed: 230, // run speed (z units / s)
};

export const SCHOOL = {
  start: 6, // fish at the start of a level (+ upgrades)
  max: 200,
  steer: 1100, // max sideways speed (x units / s)
  keySpeed: 420, // sideways speed with arrow keys
  spacing: 22, // gap between fish in the school
  shown: 48, // fish drawn at most (the number above the school is the truth)
  fireEvery: 0.22, // seconds between volleys
  bulletsMax: 7, // bullets per volley (damage is split between them)
  dps: 9, // damage per fish per second
  bulletSpeed: 1500,
  bulletR: 7,
};

export const GATES = {
  hitsPerBump: 3, // bubble hits that bump a +/− gate up by one
  bumpMax: 8, // a gate can be bumped this many times at most
  w: ROAD.half, // each gate covers half the road
};

// Treasure clams: shoot them open before they reach you.
export const CLAM = { w: 90, crush: 0.25 }; // crush: fraction of its remaining HP that becomes lost fish

// Sea critters that swim at the school. speed is extra on top of the run speed.
// bite = fish lost when it reaches the school.
export const ENEMIES = {
  jelly: { name: 'Jellybean', hp: 14, speed: 40, r: 16, bite: 1, coins: 1 },
  crab: { name: 'Clown Crab', hp: 26, speed: 60, r: 17, bite: 1, coins: 1 },
  kraken: { name: 'Baby Kraken', hp: 34, speed: 45, r: 17, bite: 2, coins: 2 },
  puffer: { name: 'Puffer Pal', hp: 48, speed: 30, r: 20, bite: 3, coins: 2 },
  urchin: { name: 'Sea Urchin', hp: 70, speed: 25, r: 20, bite: 4, coins: 3 },
  eel: { name: 'Electric Eel', hp: 30, speed: 95, r: 16, bite: 2, coins: 2 },
  octoMini: { name: 'Mini Octopus', hp: 20, speed: 55, r: 13, bite: 1, coins: 1 },
  starMinion: { name: 'Star Minion', hp: 16, speed: 70, r: 12, bite: 1, coins: 1 },
};

// [type, first level, weight]
export const ENEMY_POOL = [
  ['jelly', 1, 10],
  ['crab', 1, 6],
  ['kraken', 2, 5],
  ['eel', 3, 4],
  ['puffer', 4, 4],
  ['urchin', 5, 3],
];

// Bosses wait at the end of each level. They stop at `stopZ` and attack; if one
// reaches the school (it creeps forward at `creep`) the level is lost.
export const BOSSES = {
  chef: { name: 'Chef Octopus', hp: 1400, r: 60, stopZ: 350, creep: 9, attackEvery: 2.6, attack: 'ink', minion: 'octoMini' },
  sharky: { name: 'Sharky', hp: 1700, r: 64, stopZ: 380, creep: 10, attackEvery: 3.2, attack: 'charge' },
  queen: { name: 'Starfish Queen', hp: 2000, r: 68, stopZ: 360, creep: 9, attackEvery: 2.4, attack: 'stars', minion: 'starMinion' },
  kitty: { name: 'Kraken Kitty', hp: 2400, r: 78, stopZ: 380, creep: 8, attackEvery: 2.2, attack: 'swipe', minion: 'jelly' },
};
export const BOSS_ORDER = ['chef', 'sharky', 'queen', 'kitty'];

export const BOSS_ATTACK = {
  delay: 1.1, // telegraph time before a thrown attack lands
  r: 62, // landing radius
  bite: 3, // fish lost per hit (+ level / 3)
  chargeWindup: 1.0,
  chargeSpeed: 900,
  chargeW: 110,
};

// Level difficulty. Everything scales with the level number L.
export const LEVELS = {
  segments: 8, // + 1 per level, capped
  segmentsMax: 16,
  gap: 560, // road distance between segments (about one screen holds two)
  startGap: 520,
  // Enemy & clam HP = base × (1 + hpPerLevel·(L−1)) × (1 + hpPerSegment·s): every
  // level starts gentle (a small school) and gets tougher toward its boss.
  hpBase: 0.8, // level 1 is gentle
  hpPerLevel: 0.15,
  hpPerSegment: 0.22,
  bossHpPerLevel: 0.55,
  mulGates: 1, // ×2 gates per level (2 from level 6)
  crowdBase: 3,
  crowdPerLevel: 0.3,
  crowdPerSegment: 1.2,
  crowdMax: 34,
  clearCoins: 20,
  clearCoinsPerLevel: 6,
};

// Coins buy permanent upgrades between levels.
export const UPGRADES = {
  shots: { name: 'Multi-shot Bubbles', desc: '+1 bubble per volley. Wider coverage.', base: 25, grow: 1.6, max: 6 },
  fish: { name: 'Bigger School', desc: '+1 fish at the start of every level.', base: 30, grow: 1.35, max: 40 },
  dmg: { name: 'Sharper Bubbles', desc: '+10% bubble damage.', base: 40, grow: 1.4, max: 30 },
  rate: { name: 'Faster Bubbles', desc: '+6% fire rate.', base: 45, grow: 1.45, max: 20 },
};

// Buddies are reef friends a gate can recruit. They swim beside the school and
// fire a big shot every `every` seconds. Up to two at a time.
export const BUDDIES = {
  shark: { name: 'Shark', dmg: 60, every: 1.2, pierce: 4, shot: 'dart' },
  octopus: { name: 'Octopus', dmg: 30, every: 0.9, pierce: 1, splash: 70, shot: 'ink' },
  starfish: { name: 'Starfish', dmg: 24, every: 0.8, pierce: 99, shot: 'star' },
  seahorse: { name: 'Seahorse', dmg: 90, every: 1.6, pierce: 1, shot: 'dart' },
  puffer: { name: 'Pufferfish', dmg: 45, every: 1.4, pierce: 1, splash: 110, shot: 'bubble' },
  crab: { name: 'Crab', dmg: 20, every: 0.5, pierce: 1, shot: 'bubble' },
};
export const BUDDY_MAX = 2;

export const SKINS = {
  classic: { name: 'Classic Clownfish', unlock: 'default' },
  golden: { name: 'Golden Guppy', unlock: 'Clear level 10' },
  neon: { name: 'Neon Tetra', unlock: 'Clear level 20' },
  galaxy: { name: 'Galaxy Betta', unlock: 'Clear level 30' },
};

export const HOW_TO_PLAY = [
  ['Steer', 'Swipe or drag left / right anywhere (or ← → / A D). Your school swims and shoots by itself.'],
  ['Gates', 'Two gates, pick one: steer into the side you want. Blue is good, red is bad. Shoot a number gate to raise it.'],
  ['Clams', 'Shoot the number down to crack a clam and grab its prize. Hit an uncracked clam and you lose fish.'],
  ['Critters', 'Every critter that reaches your school eats fish. Shoot them first, or dodge.'],
  ['Boss', 'Shoot the boss down before it reaches you. Dodge its red target circles.'],
  ['Coins', 'Spend coins between levels on a bigger school, more damage and faster bubbles.'],
];
