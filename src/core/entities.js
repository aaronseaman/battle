// Entity classes. Every field is initialized in reset() (called by the
// constructor), so V8 keeps a single hidden class per entity type and pooled
// objects never carry stale state between uses.
//
// Renderers may read any field; the most useful ones are documented in README.md.

// Enemy.mode — how an enemy is moving.
export const MODE = {
  ENTER: 0, // swooping in along a curve to its formation slot
  FORM: 1, // holding its slot in the swaying formation
  DIVE: 2, // peeled off and diving at the reef
  RETURN: 3, // bit the reef, came back in from the top, flying home to its slot
  FLEE: 4, // Clown Crab escaping upward with stolen shells
};

export class Enemy {
  constructor() {
    this.reset();
  }
  reset() {
    this.id = 0;
    this.alive = false;
    this.type = '';
    this.def = null;
    this.bossId = ''; // non-empty for bosses: chef | sharky | queen | kitty
    this.x = 0;
    this.y = 0;
    this.z = 0; // bounce height
    this.px = 0; // position at the previous sim tick (render interpolation)
    this.py = 0;
    this.angle = 0; // heading (radians, from the last tick's movement)
    this.vx = 0; // velocity (px/s) — steering while diving, measured otherwise
    this.vy = 0;
    this.mode = 0; // MODE in enemies.js: enter | form | dive | return | flee
    this.moveT = 0; // time in the current mode
    this.slot = -1; // formation slot (-1: free diver, e.g. split jellies and boss minions)
    this.ax = 0; // entry curve: start, control 1, control 2 (the slot is the end point)
    this.ay = 0;
    this.bx = 0;
    this.by = 0;
    this.cx = 0;
    this.cy = 0;
    this.tx = 0; // dive aim x (Sharky: charge lane)
    this.target = null; // buddy a grabber is diving at
    this.targetId = 0;
    this.shotT = 0; // enemy shot cooldown
    this.dist = 0; // boss sway phase (px travelled)
    this.dir = 1; // facing multiplier for renderers (always 1 in the arcade build)
    this.hp = 0;
    this.maxHp = 0;
    this.r = 0;
    this.baseR = 0;
    this.speed = 0; // current effective speed (for animation)
    this.baseSpeed = 0;
    this.armor = 0;
    this.cracked = false; // Sea Urchin shell broken
    this.shield = 0;
    this.maxShield = 0;
    this.minus = 0; // Minus stacks
    this.minusT = 0;
    this.sad = false;
    this.slow = 0;
    this.slowT = 0;
    this.stunT = 0;
    this.heldT = 0; // octopus tentacle grab
    this.heldDps = 0;
    this.busyT = 0; // paused while using an ability
    this.shred = 0; // crab armor shred (fraction)
    this.shredT = 0;
    this.armorBreakT = 0;
    this.carry = 0; // shells carried by a Clown Crab
    this.hitT = 0; // hit flash timer
    this.anim = 0; // per-enemy animation clock
    this.state = 0; // type-specific state (puffer inflating, boss state...)
    this.stateT = 0; // time in current state
    this.t1 = 0; // type-specific timers
    this.t2 = 0;
    this.t3 = 0;
    this.t4 = 0;
    this.phase = 0; // boss phase (0-based)
    this.exposedT = 0; // Kraken Kitty exposed window
    this.variant = 0; // endless boss cycle
    this.laps = 0; // boss reef slams so far (each one enrages it)
    this.enrageT = 0; // boss time since the last slam
    this.leak = 0;
    this.shells = 0;
  }
}

export class Tower {
  constructor() {
    this.hitIds = new Int32Array(32);
    this.reset();
  }
  reset() {
    this.id = 0;
    this.alive = false;
    this.type = '';
    this.def = null;
    this.stats = null; // def.levels[level]
    this.level = 0; // 0 base, 1 upgraded, 2 evolved
    this.socket = -1;
    this.x = 0;
    this.y = 0;
    this.hp = 0;
    this.maxHp = 0;
    this.invested = 0;
    this.cd = 0; // primary cooldown
    this.cd2 = 0; // secondary (octopus grab)
    this.cd3 = 0; // tertiary (DJ pulse)
    this.aim = -Math.PI / 2; // facing angle for rendering
    this.fireT = 9; // time since last shot (for squash animation)
    this.plusT = 0; // Plus Power buff remaining
    this.grabT = 0; // disabled by Baby Kraken
    this.zapT = 0; // shut down by Electric Eel
    this.blindT = 0; // inked by Chef Octopus
    this.stunT = 0;
    this.covered = false; // Kraken Kitty tentacle on this socket
    this.state = 0; // shark: 0 home, 1 lunge, 3 return | puffer: 0 ready, 1 inflating
    this.sx = 0; // body position (moves for shark charges)
    this.sy = 0;
    this.psx = 0; // body position at the previous tick
    this.psy = 0;
    this.tx = 0; // shark lunge end point
    this.ty = 0;
    this.hitN = 0;
    this.inflate = 0; // pufferfish 0..1
    this.kills = 0;
    this.dmgDone = 0;
  }
}

export class Projectile {
  constructor() {
    this.hitIds = new Int32Array(24);
    this.reset();
  }
  reset() {
    this.id = 0;
    this.alive = false;
    this.kind = ''; // minus | plus | bubble | ink | star | ministar | dart
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.px = 0;
    this.py = 0;
    this.pz = 0;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.sx = 0; // start
    this.sy = 0;
    this.tx = 0; // destination
    this.ty = 0;
    this.t = 0;
    this.dur = 0;
    this.arc = 0;
    this.r = 0;
    this.dmg = 0;
    this.pierce = 1;
    this.life = 0;
    this.leg = 0; // boomerang leg: 0 out, 1 back
    this.target = null;
    this.targetId = 0;
    this.targetKind = ''; // plus: tower | heart
    this.owner = null; // tower
    this.ownerId = 0;
    this.level = 0;
    this.hitN = 0;
  }
}

// Enemy attacks. Lobbed ones (ink bombs, sparks, thrown stars, paw swipes) fly to a
// marked spot and land; bullets (drop, spike) fall in a straight line and hit
// whatever they touch on the way (the fish, buddies).
export class Strike {
  constructor() {
    this.reset();
  }
  reset() {
    this.alive = false;
    this.kind = ''; // ink | spark | star | swipe | drop | spike
    this.bullet = false;
    this.vx = 0;
    this.vy = 0;
    this.sx = 0;
    this.sy = 0;
    this.tx = 0;
    this.ty = 0;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.px = 0;
    this.py = 0;
    this.pz = 0;
    this.arc = 0;
    this.t = 0;
    this.dur = 0;
    this.r = 0;
    this.dmg = 0;
    this.blind = 0;
    this.hitsPlayer = false;
    this.tower = null;
    this.towerId = 0;
  }
}

export class Pickup {
  constructor() {
    this.reset();
  }
  reset() {
    this.alive = false;
    this.x = 0;
    this.y = 0;
    this.px = 0;
    this.py = 0;
    this.vx = 0;
    this.vy = 0;
    this.value = 0;
    this.t = 0;
    this.phase = 0;
    this.landed = false;
  }
}

export class Tentacle {
  constructor() {
    this.reset();
  }
  reset() {
    this.id = 0;
    this.alive = false;
    this.socket = -1;
    this.x = 0;
    this.y = 0;
    this.r = 0;
    this.hp = 0;
    this.maxHp = 0;
    this.hitT = 0;
    this.t = 0;
  }
}
