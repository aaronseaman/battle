// Reef Rumble: Clay Coral Defense — all tunable game data lives here.
// The simulation reads only from this file, so balance changes never touch logic.

export const VERSION = '2.0.0';

// World is a flat 2D plane (x right, y down). A 3D renderer maps (x, y) -> (x, 0, y)
// and uses an entity's `z` as height above the reef floor.
//   y ~150-400   the enemy formation (sways, creeps lower over time)
//   y 935        buddy sockets on the reef shelf, Coral Heart in the middle
//   y 1000       REEF_Y: a diver that gets this far bites the reef (Coral Heart damage)
//   y 1030       the fish's rail
export const WORLD = {
  W: 800,
  H: 1080,
  RAIL_Y: 1030,
  RAIL_MIN: 40,
  RAIL_MAX: 760,
  REEF_Y: 1000,
  CELL: 80,
};

export const SIM = {
  DT: 1 / 60,
  MAX_STEPS: 8,
  ANIM_FPS: 12, // stop-motion animation clock for renderers
};

export const MAP = {
  heart: { x: 400, y: 950, r: 46 },
  // Buddy sockets on the reef shelf, left to right (Left/Right cycles through them).
  sockets: [[80, 935], [200, 935], [320, 935], [480, 935], [600, 935], [720, 935]],
  socketR: 30,
};

// Enemies fly in and hold a swaying grid; slot 0 is the back-left corner.
export const FORMATION = {
  cols: 10,
  rows: 5,
  dx: 64,
  dy: 56,
  x: 400, // centre
  y: 150, // back row
  sway: 70,
  swayPeriod: 8,
  descend: 2.5, // px/s the whole grid creeps toward the reef
  descendMax: 140,
  bob: 3,
};

// Squadrons swoop in along curves (cubic Bezier from off-screen to their slot).
export const ENTRY = {
  start: 1.2,
  squad: 5,
  squadGap: 1.5,
  gap: 0.13,
  dur: 2.2,
};

// Diving: pop up out of the grid, then accelerate toward the reef while steering.
export const DIVE = {
  popVx: 140,
  popVy: -170,
  accel: 520,
  steer: 1.8,
  turn: 4,
  maxVx: 260,
  returnSpeed: 300, // divers that bit the reef re-enter from the top and fly home
};

export const ENEMY_SHOT = {
  speed: 340,
  r: 9,
  aim: 0.55, // fraction of the way a shot leads toward the fish
  towerDmg: 6,
  spikeDx: 260, // formation spikes only fire when the fish is roughly below
};

export const SCORE = {
  comboWindow: 1.6,
  comboStep: 0.1,
  comboMax: 4,
  diveMul: 2, // divers are worth double
  waveClear: 100, // x wave number
  perfect: 1000,
  boss: 5000, // x (endless cycle + 1)
};

export const PLAYER = {
  speed: 430,
  r: 22,
  hearts: 3,
  respawn: 3,
  respawnKO: 7,
  invuln: 2,
  meterMax: 100,
  meterRegen: 16,
  minusCost: 3,
  plusCost: 20,
  minusCd: 0.12,
  plusCd: 0.38,
  minusDmg: 10,
  minusSpeed: 1100,
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
  capsuleValue: 0.5, // free capsule buddies count as this fraction of cost for selling
  skipCapsuleFrac: 0.5,
  pickupChance: 0.25,
  shellScalePerWave: 0,
};

// Buddies (internally "towers"): reef friends in the sockets that auto-fire upward.
// Levels: 0 = base, 1 = upgraded, 2 = evolution (requires pearl unlock `evo_<type>`).
export const TOWERS = {
  fish: {
    name: 'Tropical Fish', short: 'Fish', cost: 50, hp: 40, upgrade: [45, 110], target: 'first',
    desc: 'Rapid bubbles at the closest threat.',
    levels: [
      { range: 440, interval: 0.36, dmg: 5, projSpeed: 700 },
      { range: 460, interval: 0.3, dmg: 7, projSpeed: 740 },
      { name: 'Fish School', range: 480, interval: 0.27, dmg: 8, projSpeed: 780, spread: 0.22 },
    ],
  },
  octopus: {
    name: 'Octopus', short: 'Octo', cost: 90, hp: 60, upgrade: [80, 160], target: 'first',
    desc: 'Ink blobs slow a group; tentacles hold one enemy in place.',
    levels: [
      { range: 360, interval: 1.7, dmg: 5, splash: 60, slow: 0.35, slowDur: 2, grabCd: 5, grabDur: 2, grabDps: 10 },
      { range: 380, interval: 1.5, dmg: 7, splash: 70, slow: 0.45, slowDur: 2.2, grabCd: 4.5, grabDur: 2.5, grabDps: 14 },
      { name: 'DJ Octopus', range: 400, interval: 1.4, dmg: 8, splash: 75, slow: 0.45, slowDur: 2.4, grabCd: 4, grabDur: 2.5, grabDps: 18,
        pulseCd: 4, pulseStun: 0.8, pulseDmg: 10 },
    ],
  },
  shark: {
    name: 'Shark', short: 'Shark', cost: 130, hp: 80, upgrade: [110, 200], target: 'first',
    desc: 'Lunges up through a line of enemies and swims back. Cracks armor.',
    levels: [
      { range: 400, interval: 3.0, dmg: 40, sweep: 120, chompR: 40 },
      { range: 420, interval: 2.6, dmg: 55, sweep: 140, chompR: 42 },
      { name: 'Hammerhead', range: 440, interval: 2.4, dmg: 70, sweep: 170, chompR: 46, armorBreak: 6 },
    ],
  },
  starfish: {
    name: 'Starfish', short: 'Star', cost: 80, hp: 50, upgrade: [70, 150], target: 'first',
    desc: 'Boomerang stars pierce whole rows; slowly heals neighbour buddies.',
    levels: [
      { range: 400, interval: 1.6, dmg: 5, healR: 130, heal: 1 },
      { range: 420, interval: 1.45, dmg: 7, healR: 140, heal: 1.6 },
      { name: 'Five-Point Star', range: 440, interval: 1.35, dmg: 9, healR: 150, heal: 2.4, split: 5, splitDmg: 5 },
    ],
  },
  puffer: {
    name: 'Pufferfish', short: 'Puff', cost: 70, hp: 50, upgrade: [60, 130], target: 'first',
    desc: 'Puffs up and blasts divers that swoop close, then re-inflates.',
    levels: [
      { range: 130, interval: 5, dmg: 50, blast: 115, fuse: 0.3 },
      { range: 140, interval: 4.5, dmg: 70, blast: 125, fuse: 0.25 },
      { name: 'Mega Puff', range: 150, interval: 4, dmg: 95, blast: 140, fuse: 0.2, knockback: 120 },
    ],
  },
  seahorse: {
    name: 'Seahorse', short: 'Snipe', cost: 120, hp: 40, upgrade: [100, 190], target: 'strong',
    desc: 'Sniper. Picks off the toughest enemy anywhere on screen.',
    levels: [
      { range: 1000, interval: 2.4, dmg: 45, projSpeed: 1500 },
      { range: 1000, interval: 2.1, dmg: 65, projSpeed: 1600 },
      { name: 'Sea Dragon', range: 1000, interval: 2.0, dmg: 80, projSpeed: 1600, pierceLine: true },
    ],
  },
  crab: {
    name: 'Crab', short: 'Crab', cost: 100, hp: 70, upgrade: [85, 170], target: 'first',
    desc: 'Pinches divers that swoop low, shreds armor and steals shells.',
    levels: [
      { range: 150, interval: 0.8, dmg: 10, shred: 0.08, steal: 0.3, stealAmt: 1, targets: 1 },
      { range: 160, interval: 0.7, dmg: 14, shred: 0.1, steal: 0.4, stealAmt: 1, targets: 1 },
      { name: 'King Crab', range: 175, interval: 0.65, dmg: 16, shred: 0.12, steal: 0.5, stealAmt: 2, targets: 3 },
    ],
  },
};

export const STARTER_TOWERS = ['fish', 'octopus', 'starfish'];
export const SHRED_MAX = 5;
export const SHRED_DUR = 6;

// speed: top dive speed (px/s). Dive steering: weave (px) at weaveHz, home = how fast
// the dive re-aims at the fish (per second). shotCd: drops a shot while diving.
// diveW: how keen it is to leave the formation.
export const ENEMIES = {
  jelly: { name: 'Jellybean Jellyfish', hp: 20, speed: 210, r: 16, shells: 2, leak: 4, score: 100, bouncy: true, split: 'jellyMini', splitN: 2,
    weave: 110, weaveHz: 0.35, home: 0.6, shotCd: 2.4, shot: 'drop' },
  jellyMini: { name: 'Jelly Bean', hp: 8, speed: 300, r: 10, shells: 1, leak: 2, score: 50, bouncy: true, weave: 40, weaveHz: 0.8, home: 1.2 },
  crab: { name: 'Clown Crab', hp: 28, speed: 260, r: 16, shells: 3, leak: 0, score: 150, steal: 15, returnSpeed: 190,
    weave: 60, weaveHz: 0.5, home: 0 },
  kraken: { name: 'Baby Kraken', hp: 28, speed: 240, r: 16, shells: 3, leak: 5, score: 150, grabR: 90, grabDur: 3, grabCd: 5, grabPause: 0.6,
    weave: 50, weaveHz: 0.4, home: 1, targetBuddy: true, shotCd: 2.8, shot: 'drop' },
  puffer: { name: 'Puffer Pal', hp: 36, speed: 200, r: 18, shells: 3, leak: 6, score: 150, fuse: 2.0, blastR: 100, blastDmg: 18,
    weave: 70, weaveHz: 0.3, home: 0.8 },
  urchin: { name: 'Sea Urchin', hp: 45, speed: 150, r: 18, shells: 5, leak: 8, score: 250, armor: 0.75, shell: true,
    weave: 20, weaveHz: 0.25, home: 0.5, shotCd: 3.5, shot: 'spike', formShots: true, diveW: 0.4 },
  eel: { name: 'Electric Eel', hp: 30, speed: 330, r: 15, shells: 4, leak: 6, score: 200, zapR: 130, zapCd: 3, zapDisable: 1.5, zapDmg: 6,
    sparkCd: 4, sparkY: 520, sparkDx: 220, weave: 200, weaveHz: 0.7, home: 0.4 },
  octoMini: { name: 'Mini Octopus', hp: 16, speed: 250, r: 12, shells: 1, leak: 3, score: 80, grabR: 80, grabDur: 2, grabCd: 6, grabPause: 0.5,
    weave: 50, weaveHz: 0.5, home: 1, targetBuddy: true },
  starMinion: { name: 'Star Minion', hp: 14, speed: 270, r: 11, shells: 1, leak: 3, score: 80, throwCd: 2.2, throwR: 360, throwDmg: 5,
    weave: 90, weaveHz: 0.6, home: 0.7 },
};

// [type, first wave it appears, weight, formation rank (higher = further back)]
export const ENEMY_POOL = [
  ['jelly', 1, 10, 0],
  ['crab', 2, 3, 1],
  ['kraken', 3, 6, 2],
  ['puffer', 4, 5, 1],
  ['urchin', 6, 4, 3],
  ['eel', 7, 5, 2],
];

export const WAVES = {
  total: 20,
  bossEvery: 5,
  countBase: 10,
  countPerWave: 1.6,
  hpLinear: 0.09,
  hpQuad: 0.004,
  speedPerWave: 0.015,
  speedMax: 1.35,
  shieldFrom: 8,
  shieldChance: 0.08,
  shieldChancePerWave: 0.015,
  shieldChanceMax: 0.3,
  shieldFrac: 0.5,
  bossEscortFrac: 0.5,
  endlessBossHpPerCycle: 0.6,
  // dive scheduler
  diveStart: 2.5,
  diveGap: 2.2,
  diveGapPerWave: 0.08,
  diveGapMin: 0.7,
  diveGroupMax: 3,
  maxDivers: 3,
  maxDiversPerWave: 0.35,
  maxDiversCap: 10,
  rushAt: 4, // this few left (and none still flying in): everyone dives
  rushGap: 0.6,
  enrageAt: 45, // seconds into a wave: dives come faster
  enrageGapMul: 0.6,
  shotsBase: 2, // enemy shots allowed on screen at once
  shotsPerWave: 0.35,
  shotsCap: 10,
  // bosses slam the reef every so often, harder each time (a soft timer)
  bossSlamEvery: 45,
  bossSlamWarn: 3,
  bossLapSpeedMul: 1.2,
  bossLapLeakMul: 1.4,
};

// Bosses hover above the formation and sway. speed = sway speed (px/s).
export const BOSS_HOVER = { y: 240, sway: 230, enter: 2.5 };

export const BOSSES = {
  chef: {
    name: 'Chef Octopus', hp: 1800, speed: 90, r: 46, armor: 0, leak: 20, pearls: 3, shells: 120, unlock: 'shark',
    hatR: 16, hatMul: 3, inkCd: [3.5, 2.4], inkTowerChance: 0.55, inkBlind: 3, inkDmg: 6, inkR: 50, inkRailR: 40,
    minionCd: [9, 7], minions: [2, 3],
  },
  sharky: {
    name: 'Sharky the Teething', hp: 3800, speed: 80, r: 50, armor: 0.15, leak: 25, pearls: 3, shells: 150,
    chargeCd: [6, 4.5], windup: [1.2, 0.9], chargeSpeed: 900, riseSpeed: 320, aimSpeed: 520, chargeLeak: 8, eatR: 56, starStun: 1.6,
  },
  queen: {
    name: 'Starfish Queen', hp: 6500, speed: 70, r: 54, armor: 0, leak: 30, pearls: 3, shells: 180,
    closed: [5, 3.5], open: [3, 2.5], closedMul: 0.15, openMul: 1.5, summonCd: [8, 6.5], summons: [3, 4],
  },
  kitty: {
    name: 'Kraken Kitty', hp: 7500, speed: 60, r: 64, armor: 0, leak: 35, pearls: 5, shells: 300,
    tentacleCd: [8, 6, 5], tentacleCount: [1, 1, 2], tentacleMax: [2, 3, 3], tentacleLife: 10, tentacleHp: 70, tentacleR: 26, tentacleSqueeze: 3,
    purrFrac: 0.06, purrReform: 12, exposedDur: 4, exposedMinusMul: 2.5, exposedTowerMul: 1.3,
    swipeCd: 6, swipeR: 80, swipeDelay: 1.4, minionCd: 14,
  },
};

export const BOSS_ORDER = ['chef', 'sharky', 'queen', 'kitty'];

export const FORKS = [
  { id: 'sunny', name: 'Sunny Shallows', desc: '+50 shells now, but enemies swim 15% faster.', shells: 50, speedMul: 1.15 },
  { id: 'cave', name: 'Coral Cave', desc: '+1 pearl, but enemies have +30% HP.', pearls: 1, hpMul: 1.3 },
  { id: 'kelp', name: 'Kelp Forest', desc: 'Buddies get +15% range. Extra Clown Crabs sneak in.', rangeMul: 1.15, extra: { crab: 4 } },
  { id: 'bloom', name: 'Jelly Bloom', desc: '3 buddy capsules to pick from. Extra jellies.', capsules: 3, extra: { jelly: 6 } },
  { id: 'current', name: 'Rip Current', desc: 'Bubble meter +50% regen, but enemies dive 25% more often.', meterMul: 1.5, spawnMul: 0.75 },
  { id: 'trench', name: 'Treasure Trench', desc: 'Shell rewards +50%. Extra Puffer Pals.', shellMul: 1.5, extra: { puffer: 3 }, from: 3 },
  { id: 'lagoon', name: 'Calm Lagoon', desc: 'Coral Heart heals 25. Nothing else happens.', heal: 25 },
  { id: 'grotto', name: 'Eel Grotto', desc: '+1 pearl, but extra Electric Eels.', pearls: 1, extra: { eel: 3 }, from: 5 },
  { id: 'sunken', name: 'Sunken Ship', desc: '+80 shells, but buddies start the wave at 70% HP.', shells: 80, towerHpStart: 0.7, from: 3 },
];

// Shell purchases between waves.
export const UPGRADES = {
  meterRegen: { name: 'Bubble Pump', desc: '+25% bubble meter regen.', max: 5, cost: [60, 90, 130, 180, 240] },
  meterCap: { name: 'Bigger Tank', desc: '+25 bubble meter capacity.', max: 3, cost: [70, 120, 180] },
  minusPower: { name: 'Sharper Minus', desc: '+30% Minus damage and stronger stacks.', max: 5, cost: [60, 100, 150, 210, 280] },
  plusPower: { name: 'Sweeter Plus', desc: '+40% Plus healing, +1s Plus Power.', max: 4, cost: [50, 90, 140, 200] },
  heartHp: { name: 'Coral Growth', desc: '+25 Coral Heart max HP (heals 25).', max: 5, cost: [60, 100, 150, 210, 280] },
  heartRegen: { name: 'Coral Polyps', desc: 'Coral Heart regenerates +0.4 HP/s in combat.', max: 3, cost: [80, 140, 220] },
  reefWash: { name: 'Reef Wash', desc: 'One-time use: clears every buddy debuff and enemy shot mid-wave.', max: 1, cost: [60], consumable: true },
};

// Pearl purchases between waves.
export const UNLOCKS = {
  puffer: { name: 'Pufferfish Buddy', desc: 'Unlock the Pufferfish buddy.', pearls: 2, tower: 'puffer' },
  seahorse: { name: 'Seahorse Buddy', desc: 'Unlock the Seahorse sniper.', pearls: 3, tower: 'seahorse' },
  crab: { name: 'Crab Buddy', desc: 'Unlock the Crab buddy.', pearls: 2, tower: 'crab' },
  evo_fish: { name: 'Fish School', desc: 'Fish buddies can evolve: triple shot.', pearls: 2, evo: 'fish' },
  evo_octopus: { name: 'DJ Octopus', desc: 'Octopus buddies can evolve: stun pulse.', pearls: 2, evo: 'octopus' },
  evo_shark: { name: 'Hammerhead', desc: 'Shark buddies can evolve: armor break.', pearls: 2, evo: 'shark' },
  evo_starfish: { name: 'Five-Point Star', desc: 'Starfish buddies can evolve: split stars.', pearls: 2, evo: 'starfish' },
  evo_puffer: { name: 'Mega Puff', desc: 'Pufferfish can evolve: bigger blast, knockback.', pearls: 2, evo: 'puffer' },
  evo_seahorse: { name: 'Sea Dragon', desc: 'Seahorse can evolve: piercing line shot.', pearls: 2, evo: 'seahorse' },
  evo_crab: { name: 'King Crab', desc: 'Crab can evolve: pinches 3 enemies.', pearls: 2, evo: 'crab' },
  twinMinus: { name: 'Twin Minus', desc: 'Minus fires two bubbles side by side.', pearls: 3, ability: true },
  magnet: { name: 'Shell Magnet', desc: 'Bigger pickup radius, more meter per shell.', pearls: 1, ability: true },
  extraHeart: { name: 'Extra Heart', desc: '+1 fish heart.', pearls: 2, ability: true },
  luckyCapsule: { name: 'Lucky Capsule', desc: 'Always 3 buddy capsules to pick from.', pearls: 2, ability: true },
};

export const SKINS = {
  classic: { name: 'Classic Clownfish', unlock: 'default' },
  golden: { name: 'Golden Guppy', unlock: 'Win a run' },
  neon: { name: 'Neon Tetra', unlock: 'Win a run' },
  galaxy: { name: 'Galaxy Betta', unlock: 'Reach Endless wave 30' },
};

export const HOW_TO_PLAY = [
  ['Move', 'Left / Right (A/D, ←/→, drag on screen). Your fish rides the bottom rail.'],
  ['Minus −', 'Down / S / Z / Space. Rapid bubbles straight up. Stacks slow & shred; 3 stacks makes enemies Sad.'],
  ['Plus +', 'Up / W / X. Arcs to a hurt buddy or the Coral Heart: heals, clears debuffs, +20% fire rate. Line it up under a shield to pop it.'],
  ['Waves', 'Enemies swoop into formation, then peel off and dive. Divers that reach the reef bite the Coral Heart. Dodge their shots and bodies!'],
  ['Score', 'Divers are worth double. Quick pops build a combo multiplier (up to ×4).'],
  ['Between waves', 'Pick a fork, pick a buddy capsule (drop it on a twin to level it up), then upgrade / sell / shop. Confirm = Enter / E.'],
  ['Reef Wash', 'R / Q. Bought in the shop; clears buddy debuffs and every enemy shot.'],
  ['Bosses', 'Every 5th wave. Read their tells: hats, charges, shields, tentacles. They slam the reef if the fight drags on.'],
];
