// Reef Rumble: Clay Coral Defense — all tunable game data lives here.
// The simulation reads only from this file, so balance changes never touch logic.

export const VERSION = '1.1.0';

// World is a flat 2D plane (x right, y down). A 3D renderer maps (x, y) -> (x, 0, y)
// and uses an entity's `z` as height above the reef floor.
export const WORLD = {
  W: 800,
  H: 1080,
  RAIL_Y: 1030,
  RAIL_MIN: 40,
  RAIL_MAX: 760,
  CELL: 80,
};

export const SIM = {
  DT: 1 / 60,
  MAX_STEPS: 8,
  ANIM_FPS: 12, // stop-motion animation clock for renderers
};

export const MAP = {
  path: [
    [120, -50], [120, 120], [680, 120], [680, 300], [120, 300],
    [120, 480], [680, 480], [680, 660], [400, 660], [400, 895],
  ],
  corner: 50,
  heart: { x: 400, y: 920, r: 46 },
  // Reading order (top-left to bottom-right) — Left/Right cycles through them in this order.
  sockets: [
    [260, 210], [400, 210], [540, 210], [760, 210],
    [40, 390], [260, 390], [400, 390], [540, 390],
    [260, 570], [400, 570], [540, 570], [760, 570],
    [300, 780], [500, 780],
  ],
  socketR: 30,
};

export const PLAYER = {
  speed: 430,
  r: 22,
  hearts: 3,
  respawn: 3,
  respawnKO: 7,
  invuln: 2,
  meterMax: 100,
  meterRegen: 13,
  minusCost: 5,
  plusCost: 20,
  minusCd: 0.16,
  plusCd: 0.38,
  minusDmg: 9,
  minusSpeed: 950,
  minusR: 9,
  twinOffset: 13,
  twinDmgMul: 0.65,
  plusSpeed: 700,
  plusR: 12,
  plusHealTower: 20,
  plusHealHeart: 6,
  plusPowerDur: 5,
  plusDmg: 2,
  plusFireRate: 1.2,
  plusRange: 1.1,
  minusStackMax: 5,
  minusStackDur: 5,
  minusSlowPer: 0.1,
  minusArmorPer: 0.05,
  sadAt: 3,
  sadShellMul: 1.5,
  sadScale: 0.78,
  sadDmgTaken: 1.15,
  magnetR: 60,
  magnetRUpgraded: 150,
  pickupMeter: 8,
  pickupMeterUpgraded: 14,
  dropFrac: 0.1,
  dropMin: 5,
  dropMax: 40,
};

export const HEART = { hp: 100, regen: 0 };

export const ECONOMY = {
  startShells: 100,
  startPearls: 0,
  waveClearBase: 15,
  waveClearPerWave: 3,
  perfectPearls: 1,
  sellRefund: 0.6,
  capsuleValue: 0.5, // free capsule towers count as this fraction of cost for selling
  skipCapsuleFrac: 0.5,
  pickupChance: 0.25,
  shellScalePerWave: 0,
};

// Tower levels: 0 = base, 1 = upgraded, 2 = evolution (requires pearl unlock `evo_<type>`).
export const TOWERS = {
  fish: {
    name: 'Tropical Fish', short: 'Fish', cost: 50, hp: 40, upgrade: [45, 110], target: 'first',
    desc: 'Cheap rapid-fire bubbles.',
    levels: [
      { range: 150, interval: 0.32, dmg: 5, projSpeed: 620 },
      { range: 160, interval: 0.26, dmg: 7, projSpeed: 660 },
      { name: 'Fish School', range: 170, interval: 0.24, dmg: 8, projSpeed: 700, spread: 0.32 },
    ],
  },
  octopus: {
    name: 'Octopus', short: 'Octo', cost: 90, hp: 60, upgrade: [80, 160], target: 'first',
    desc: 'Ink blobs slow groups; tentacles grab one enemy.',
    levels: [
      { range: 140, interval: 1.6, dmg: 5, splash: 55, slow: 0.35, slowDur: 2, grabCd: 5, grabDur: 2, grabDps: 10 },
      { range: 150, interval: 1.4, dmg: 7, splash: 65, slow: 0.45, slowDur: 2.2, grabCd: 4.5, grabDur: 2.5, grabDps: 14 },
      { name: 'DJ Octopus', range: 160, interval: 1.3, dmg: 8, splash: 70, slow: 0.45, slowDur: 2.4, grabCd: 4, grabDur: 2.5, grabDps: 18,
        pulseCd: 4, pulseStun: 0.8, pulseDmg: 10 },
    ],
  },
  shark: {
    name: 'Shark', short: 'Shark', cost: 130, hp: 80, upgrade: [110, 200], target: 'first',
    desc: 'Slow but brutal charge that chomps along the path. Cracks armor.',
    levels: [
      { range: 170, interval: 3.0, dmg: 45, sweep: 120, chompR: 42 },
      { range: 180, interval: 2.6, dmg: 62, sweep: 135, chompR: 44 },
      { name: 'Hammerhead', range: 190, interval: 2.4, dmg: 75, sweep: 160, chompR: 48, armorBreak: 6 },
    ],
  },
  starfish: {
    name: 'Starfish', short: 'Star', cost: 80, hp: 50, upgrade: [70, 150], target: 'first',
    desc: 'Boomerang stars pierce crowds; slowly heals nearby towers.',
    levels: [
      { range: 150, interval: 1.5, dmg: 6, healR: 120, heal: 1 },
      { range: 160, interval: 1.35, dmg: 8, healR: 130, heal: 1.6 },
      { name: 'Five-Point Star', range: 170, interval: 1.25, dmg: 10, healR: 140, heal: 2.4, split: 5, splitDmg: 5 },
    ],
  },
  puffer: {
    name: 'Pufferfish', short: 'Puff', cost: 70, hp: 50, upgrade: [60, 130], target: 'first',
    desc: 'Explodes when enemies get close, then re-inflates.',
    levels: [
      { range: 70, interval: 6, dmg: 60, blast: 90, fuse: 0.35 },
      { range: 75, interval: 5, dmg: 85, blast: 100, fuse: 0.3 },
      { name: 'Mega Puff', range: 85, interval: 4.5, dmg: 110, blast: 115, fuse: 0.25, knockback: 45 },
    ],
  },
  seahorse: {
    name: 'Seahorse', short: 'Snipe', cost: 120, hp: 40, upgrade: [100, 190], target: 'strong',
    desc: 'Long-range sniper. Targets the toughest enemy.',
    levels: [
      { range: 320, interval: 2.0, dmg: 55, projSpeed: 1400 },
      { range: 340, interval: 1.8, dmg: 80, projSpeed: 1500 },
      { name: 'Sea Dragon', range: 360, interval: 1.7, dmg: 90, projSpeed: 1500, pierceLine: true },
    ],
  },
  crab: {
    name: 'Crab', short: 'Crab', cost: 100, hp: 70, upgrade: [85, 170], target: 'first',
    desc: 'Pinches nearby enemies, shreds armor and steals shells.',
    levels: [
      { range: 95, interval: 0.8, dmg: 10, shred: 0.08, steal: 0.3, stealAmt: 1, targets: 1 },
      { range: 100, interval: 0.7, dmg: 14, shred: 0.1, steal: 0.4, stealAmt: 1, targets: 1 },
      { name: 'King Crab', range: 110, interval: 0.65, dmg: 16, shred: 0.12, steal: 0.5, stealAmt: 2, targets: 3 },
    ],
  },
};

export const STARTER_TOWERS = ['fish', 'octopus', 'starfish'];
export const SHRED_MAX = 5;
export const SHRED_DUR = 6;

export const ENEMIES = {
  jelly: { name: 'Jellybean Jellyfish', hp: 30, speed: 75, r: 16, shells: 2, leak: 4, bouncy: true, split: 'jellyMini', splitN: 2 },
  jellyMini: { name: 'Jelly Bean', hp: 12, speed: 100, r: 10, shells: 1, leak: 2, bouncy: true },
  crab: { name: 'Clown Crab', hp: 40, speed: 105, r: 16, shells: 3, leak: 0, steal: 15, returnSpeed: 115 },
  kraken: { name: 'Baby Kraken', hp: 45, speed: 90, r: 16, shells: 3, leak: 5, grabR: 100, grabDur: 3, grabCd: 6, grabPause: 0.8 },
  puffer: { name: 'Puffer Pal', hp: 55, speed: 78, r: 18, shells: 3, leak: 6, fuse: 2.4, blastR: 95, blastDmg: 18 },
  urchin: { name: 'Sea Urchin', hp: 70, speed: 56, r: 18, shells: 5, leak: 8, armor: 0.75, shell: true },
  eel: { name: 'Electric Eel', hp: 55, speed: 118, r: 15, shells: 4, leak: 6, zapR: 130, zapCd: 4, zapDisable: 1.5, zapDmg: 6,
    sparkCd: 5, sparkY: 560, sparkDx: 220 },
  octoMini: { name: 'Mini Octopus', hp: 30, speed: 100, r: 12, shells: 1, leak: 3, grabR: 90, grabDur: 2, grabCd: 7, grabPause: 0.6 },
  starMinion: { name: 'Star Minion', hp: 25, speed: 130, r: 11, shells: 1, leak: 3, throwCd: 3, throwR: 220, throwDmg: 5 },
};

// [type, first wave it appears, weight]
export const ENEMY_POOL = [
  ['jelly', 1, 10],
  ['crab', 2, 3],
  ['kraken', 3, 6],
  ['puffer', 4, 5],
  ['urchin', 6, 5],
  ['eel', 7, 5],
];

export const WAVES = {
  total: 20,
  bossEvery: 5,
  countBase: 8,
  countPerWave: 2.8,
  windowBase: 48,
  windowPerWave: 0.9,
  windowMax: 66,
  hpLinear: 0.34,
  hpQuad: 0.016,
  speedPerWave: 0.012,
  speedMax: 1.3,
  shieldFrom: 8,
  shieldChance: 0.1,
  shieldChancePerWave: 0.02,
  shieldChanceMax: 0.35,
  shieldFrac: 0.5,
  bossEscortFrac: 0.45,
  endlessBossHpPerCycle: 0.6,
  bossLapSpeedMul: 1.3, // bosses that loop the reef come back angrier
  bossLapLeakMul: 1.5,
};

export const BOSSES = {
  chef: {
    name: 'Chef Octopus', hp: 2200, speed: 30, r: 46, armor: 0, leak: 40, pearls: 3, shells: 120, unlock: 'shark',
    hatR: 16, hatMul: 3, inkCd: [3.5, 2.4], inkTowerChance: 0.55, inkBlind: 3, inkDmg: 6, inkR: 50, inkRailR: 40,
    minionCd: [9, 7], minions: [2, 3],
  },
  sharky: {
    name: 'Sharky the Teething', hp: 5200, speed: 30, r: 50, armor: 0.15, leak: 50, pearls: 3, shells: 150,
    chargeCd: [7, 5], windup: [1.2, 0.9], chargeDur: 2.2, chargeSpeedMul: 5, eatR: 56, recover: 0.8, starStun: 1.6,
  },
  queen: {
    name: 'Starfish Queen', hp: 9000, speed: 26, r: 54, armor: 0, leak: 60, pearls: 3, shells: 180,
    closed: [5, 3.5], open: [3, 2.5], closedMul: 0.15, openMul: 1.5, summonCd: [8, 6.5], summons: [3, 4],
  },
  kitty: {
    name: 'Kraken Kitty', hp: 15000, speed: 22, r: 64, armor: 0, leak: 80, pearls: 5, shells: 300,
    tentacleCd: [8, 6, 5], tentacleCount: [1, 1, 2], tentacleMax: [2, 3, 3], tentacleLife: 10, tentacleHp: 70, tentacleR: 26, tentacleSqueeze: 3,
    purrFrac: 0.06, purrReform: 9, exposedDur: 4, exposedMinusMul: 2.5, exposedTowerMul: 1.3,
    swipeCd: 6, swipeR: 80, swipeDelay: 1.4, minionCd: 10,
  },
};

export const BOSS_ORDER = ['chef', 'sharky', 'queen', 'kitty'];

export const FORKS = [
  { id: 'sunny', name: 'Sunny Shallows', desc: '+50 shells now, but enemies move 15% faster.', shells: 50, speedMul: 1.15 },
  { id: 'cave', name: 'Coral Cave', desc: '+1 pearl, but enemies have +30% HP.', pearls: 1, hpMul: 1.3 },
  { id: 'kelp', name: 'Kelp Forest', desc: 'Towers get +15% range. Extra Clown Crabs sneak in.', rangeMul: 1.15, extra: { crab: 4 } },
  { id: 'bloom', name: 'Jelly Bloom', desc: '3 tower capsules to pick from. Extra jellies.', capsules: 3, extra: { jelly: 6 } },
  { id: 'current', name: 'Rip Current', desc: 'Bubble meter +50% regen, but enemies spawn 25% faster.', meterMul: 1.5, spawnMul: 0.75 },
  { id: 'trench', name: 'Treasure Trench', desc: 'Shell rewards +50%. Extra Puffer Pals.', shellMul: 1.5, extra: { puffer: 3 }, from: 3 },
  { id: 'lagoon', name: 'Calm Lagoon', desc: 'Coral Heart heals 25. Nothing else happens.', heal: 25 },
  { id: 'grotto', name: 'Eel Grotto', desc: '+1 pearl, but extra Electric Eels.', pearls: 1, extra: { eel: 3 }, from: 5 },
  { id: 'sunken', name: 'Sunken Ship', desc: '+80 shells, but towers start the wave at 70% HP.', shells: 80, towerHpStart: 0.7, from: 3 },
];

// Shell purchases between waves.
export const UPGRADES = {
  meterRegen: { name: 'Bubble Pump', desc: '+25% bubble meter regen.', max: 5, cost: [60, 90, 130, 180, 240] },
  meterCap: { name: 'Bigger Tank', desc: '+25 bubble meter capacity.', max: 3, cost: [70, 120, 180] },
  minusPower: { name: 'Sharper Minus', desc: '+30% Minus damage and stronger stacks.', max: 5, cost: [60, 100, 150, 210, 280] },
  plusPower: { name: 'Sweeter Plus', desc: '+40% Plus healing, +1s Plus Power.', max: 4, cost: [50, 90, 140, 200] },
  heartHp: { name: 'Coral Growth', desc: '+25 Coral Heart max HP (heals 25).', max: 5, cost: [60, 100, 150, 210, 280] },
  heartRegen: { name: 'Coral Polyps', desc: 'Coral Heart regenerates +0.4 HP/s in combat.', max: 3, cost: [80, 140, 220] },
  reefWash: { name: 'Reef Wash', desc: 'One-time use: clears every tower debuff mid-wave.', max: 1, cost: [60], consumable: true },
};

// Pearl purchases between waves.
export const UNLOCKS = {
  puffer: { name: 'Pufferfish Tower', desc: 'Unlock the Pufferfish tower.', pearls: 2, tower: 'puffer' },
  seahorse: { name: 'Seahorse Tower', desc: 'Unlock the Seahorse sniper.', pearls: 3, tower: 'seahorse' },
  crab: { name: 'Crab Tower', desc: 'Unlock the Crab tower.', pearls: 2, tower: 'crab' },
  evo_fish: { name: 'Fish School', desc: 'Fish towers can evolve: triple shot.', pearls: 2, evo: 'fish' },
  evo_octopus: { name: 'DJ Octopus', desc: 'Octopus towers can evolve: stun pulse.', pearls: 2, evo: 'octopus' },
  evo_shark: { name: 'Hammerhead', desc: 'Shark towers can evolve: armor break.', pearls: 2, evo: 'shark' },
  evo_starfish: { name: 'Five-Point Star', desc: 'Starfish towers can evolve: split stars.', pearls: 2, evo: 'starfish' },
  evo_puffer: { name: 'Mega Puff', desc: 'Pufferfish can evolve: bigger blast, knockback.', pearls: 2, evo: 'puffer' },
  evo_seahorse: { name: 'Sea Dragon', desc: 'Seahorse can evolve: piercing line shot.', pearls: 2, evo: 'seahorse' },
  evo_crab: { name: 'King Crab', desc: 'Crab can evolve: pinches 3 enemies.', pearls: 2, evo: 'crab' },
  twinMinus: { name: 'Twin Minus', desc: 'Minus fires two bubbles side by side.', pearls: 3, ability: true },
  magnet: { name: 'Shell Magnet', desc: 'Bigger pickup radius, more meter per shell.', pearls: 1, ability: true },
  extraHeart: { name: 'Extra Heart', desc: '+1 fish heart.', pearls: 2, ability: true },
  luckyCapsule: { name: 'Lucky Capsule', desc: 'Always 3 tower capsules to pick from.', pearls: 2, ability: true },
};

export const SKINS = {
  classic: { name: 'Classic Clownfish', unlock: 'default' },
  golden: { name: 'Golden Guppy', unlock: 'Win a run' },
  neon: { name: 'Neon Tetra', unlock: 'Win a run' },
  galaxy: { name: 'Galaxy Betta', unlock: 'Reach Endless wave 30' },
};

export const HOW_TO_PLAY = [
  ['Move', 'Left / Right (A/D, ←/→, drag on screen). Your fish rides the bottom rail.'],
  ['Minus −', 'Down / S / Z / Space. Sharp bubble straight up. Stacks slow & shred; 3 stacks makes enemies Sad.'],
  ['Plus +', 'Up / W / X. Arcs to the nearest damaged tower or the Coral Heart: heals, clears debuffs, +20% fire rate.'],
  ['Meter', 'Both bubbles share the meter. Plus costs more. Grab sinking shells to refill faster.'],
  ['Between waves', 'Pick a fork, pick a capsule, place it, then upgrade / sell / shop. Confirm = Enter / E.'],
  ['Reef Wash', 'R / Q. Bought in the shop; instantly clears all tower debuffs.'],
  ['Bosses', 'Every 5th wave. Read their tells: hats, charges, shields, tentacles.'],
];
