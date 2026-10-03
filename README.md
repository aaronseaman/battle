# Reef Rumble: Clay Coral Defense

A claymation-style tower defense shooter, built as an installable, offline-capable PWA.
You're a tiny clay fish on a left/right rail, firing **Plus** (heal/buff) and **Minus**
(damage/debuff) bubbles while sea-creature towers defend the Coral Heart. Between waves:
**pick a fork → pick a capsule → place it → shop → next wave**. A boss crashes the party
every 5th wave; beat Kraken Kitty on wave 20 to unlock Endless Reef.

This build focuses on **mechanics and performance**. Visuals are a deliberately simple
placeholder renderer (`src/render/renderer.js`) behind a documented contract, so the art
pass can replace it wholesale without touching game logic.

- Vanilla ES modules, **no build step, no dependencies**.
- Deterministic fixed-step simulation (60 Hz) that also runs headless in Node.
- About 20–80 µs of simulation per tick and 1–2 ms per frame with 70+ enemies on screen.

## Run it

```bash
npm start            # serves on http://localhost:8080 (any static server works)
npm test             # 26 headless simulation tests
npm run sim          # autopilot balance runs: node tools/sim.mjs [runs] [idle|sloppy|basic|good] [maxWave]
npm run icons        # regenerate placeholder PWA icons
```

Browser smoke test (needs Playwright + Chromium): `node tools/smoke.mjs http://localhost:8080/ <screenshot-dir>`.

The game must be served over HTTP(S) for the service worker and ES modules; opening
`index.html` from disk won't work. Deploys anywhere static (GitHub Pages, Netlify, …),
and all paths are relative so subfolders work.

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move fish | ← → / A D | stick / d-pad | hold ◀ ▶, or drag on the reef |
| Minus − | ↓ / S / Z / K / Space | A / RT | − button |
| Plus + | ↑ / W / X / J | X / LT | + button |
| Confirm / place | Enter / E / Space | A | tap |
| Back | Esc / Backspace | B | Back buttons |
| Pause | Esc / P | Start | ❚❚ |
| Reef Wash | R / Q | Y | Wash button |
| Speed 1×/2× | F | RB | 1× button |
| Debug overlay | ` / F3 | | |

In menus, Left/Right (and Up/Down) move the focus. On the build screen, ◀ ▶ walks the
coral sockets on the board, ▲ jumps to Shop / Pearls / Start Wave, and Confirm opens a socket.

## Game rules (as implemented)

**Player.** Rides the rail at the bottom. Shares one **bubble meter** (100, regenerates
13/s; shell pickups refill it faster).
- **Minus** (cost 5) flies straight up and hits the first enemy. It deals damage and adds a
  Minus stack (−10% speed and −5% armor per stack, max 5). At 3 stacks the enemy turns **Sad**:
  it shrinks, takes +15% damage and drops bonus shells. Stacks also crack Sea Urchin shells.
- **Plus** (cost 20) arcs to the nearest tower that needs help (horizontal distance
  dominates, so your rail position picks the target) or to the Coral Heart. It heals, clears
  grabs/zaps/ink, and grants **Plus Power** for 5s (+20% fire rate, +10% range). On the way
  it passes through enemies for tiny damage and **pops shields**. With a shielded enemy
  directly above you, Plus fires straight at it as a shield-popper.
- 3 hearts. A hit drops 10% of your shells as pickups and respawns you after 3s (7s when
  out of hearts). Hearts refill every wave.

**Towers** (sockets are limited to 14; build, upgrade and sell only between waves).
Lv2 is a stat upgrade; Lv3 is an evolution that needs a pearl unlock.

| Tower | Role | Evolution |
|---|---|---|
| Tropical Fish | cheap rapid homing bubbles | Fish School: triple shot |
| Octopus | ink splash slows groups, tentacle grab holds and squeezes one enemy | DJ Octopus: stun pulse |
| Shark | charges along the path, chomping everything; cracks shells | Hammerhead: armor break |
| Starfish | piercing boomerang stars, heals nearby towers, stuns charging Sharky | Five-Point: splits into 5 |
| Pufferfish* | proximity blast | Mega Puff: knockback |
| Seahorse* | long-range sniper on the toughest target | Sea Dragon: piercing line |
| Crab* | melee pinch, shreds armor, steals shells | King Crab: 3 targets |

\* unlocked with pearls. The Shark unlocks by beating the wave-5 boss.

**Enemies.** Jellybean Jellyfish (bouncy, splits in two), Clown Crab (steals shells at the
heart and runs home; pop it to get them back), Baby Kraken (grabs a tower for 3s), Puffer
Pal (inflates when hurt and explodes on towers unless finished fast), Sea Urchin (75% armor
until cracked by 3 Minus stacks or a Shark), Electric Eel (zaps towers, sparks the rail).
From wave 8 some enemies carry bubble shields.

**Bosses** (they get angrier, faster and hit harder, every time they lap the reef):
- **Wave 5, Chef Octopus.** Ink bombs blind towers or splat the rail; summons mini octopi.
  Minus on the **hat** does 3× damage.
- **Wave 10, Sharky the Teething.** Winds up and charges, swallowing the first tower he
  reaches. A Starfish hit during the wind-up or charge stuns him. Swallowed towers are spat
  back out when he's beaten.
- **Wave 15, Starfish Queen.** Armored (×0.15) while her arms are closed, vulnerable (×1.5)
  while they're open. Plus forces them open. She summons star minions.
- **Wave 20, Kraken Kitty.** Tentacles cover towers (only Minus breaks them; Plus heals the
  squeezed tower). Phase 2 adds paw swipes at the rail and a purr shield; Plus pops the
  shield, which **exposes** her (Minus ×2.5). Phase 3 adds minion waves.

**Economy.** Shells come from kills, pickups, wave-clear bonuses and bosses; they buy
towers, upgrades, gun/heart upgrades and Reef Wash. Pearls come from bosses, some forks, and
**perfect waves** (no heart damage); they buy new towers, evolutions and abilities (Twin
Minus, Shell Magnet, Extra Heart, Lucky Capsule).

**Forks** modify the next wave: Sunny Shallows (+50 shells, enemies +15% speed), Coral Cave
(+1 pearl, +30% HP), Kelp Forest, Jelly Bloom, Rip Current, Treasure Trench, Calm Lagoon,
Eel Grotto, Sunken Ship.

**Meta.** Winning unlocks Endless Reef (bosses cycle back as tougher variants) plus the Golden
and Neon fish skins; reaching Endless wave 30 unlocks Galaxy. The run autosaves on every
between-wave screen, and **Continue** resumes from the last one.

## Architecture

```
index.html            DOM shell: canvas, HUD, touch buttons, menu panel
css/style.css         all UI styling (placeholder clay look)
sw.js                 offline cache (bump CACHE when shipping changes)
manifest.webmanifest  PWA manifest
src/
  config.js           ALL balance data: towers, enemies, bosses, waves, forks, shop, unlocks
  main.js             boot + fixed-timestep loop + adaptive render quality
  input.js            keyboard / gamepad / touch / pointer -> logical actions
  audio.js            procedural WebAudio SFX + tiny music loop (event driven)
  storage.js          localStorage (meta progress, run save, settings)
  ui/ui.js            HUD + every menu (data-driven, keyboard/gamepad/touch navigable)
  render/renderer.js  PLACEHOLDER Canvas2D renderer — replace for the art pass
  core/               pure simulation (no DOM): game.js is the entry point
    game.js           phases, commands, save/load, wave flow
    combat.js         damage, armor, shields, Minus stacks, rewards
    enemies.js        movement + enemy abilities + enemy attacks ("strikes")
    bosses.js         the four bosses, tentacles
    towers.js         targeting + all tower behaviours
    projectiles.js    player bubbles + tower shots
    player.js         rail movement, meter, firing, pickups
    waves.js          wave generation + difficulty curve
    path.js grid.js events.js entities.js util.js
tools/                sim + bot (balance), tests, smoke test, icon generator
```

**Performance design.** Entities are pooled, and every field is initialized in `reset()`,
so each type keeps one hidden class and the hot loops allocate nothing. A uniform spatial
grid (rebuilt each tick) handles every range and collision query. Path sampling is
O(1) amortized thanks to per-entity segment hints. The fixed 60 Hz step can run up to 8
steps per frame, and the backlog is dropped instead of spiralling. Events go through a
preallocated ring (`EventQueue`) instead of callbacks. The renderer caches the static
diorama to an offscreen canvas, caps particles, and drops to 0.75× DPR with fewer particles
if frames run slow. Combat pauses automatically when the tab is hidden.

## Hand-off: adding the claymation graphics

Everything visual lives in **`src/render/renderer.js`**, `css/style.css` and
`src/audio.js`. The simulation never reads from them, so they can be rewritten freely
(Three.js, PixiJS, sprites, etc.).

### Renderer contract

`main.js` creates `new Renderer(canvas, game, view, settings)` and calls:

| Method | When |
|---|---|
| `resize()` | the canvas changed size (ResizeObserver) |
| `setInsets({ top, bottom })` | CSS px to keep clear for HUD / touch buttons |
| `setQuality(q)` | 1 or 0.5 (auto-lowered when frames are slow) |
| `consume(eventQueue)` | once per frame, **before** the queue is cleared, to spawn VFX |
| `render(frameDt)` | once per frame |
| `screenToWorld(px, py)` → `{x, y}` | CSS px → world (used to tap sockets / drag the fish) |

It may also expose `particles` (array, only its `.length` is read by the debug overlay)
and `quality`.

### World space

- A flat plane: `WORLD.W × WORLD.H` = 800 × 1080 units, **x right, y down** (toward the
  player). For 3D, map `(x, y) → (x, 0, y)` and use an entity's `z` as height.
- The path is `game.path` (`xs`, `ys` arrays of a dense polyline, `length`, `sample(d, out)`).
- Sockets: `game.sockets[i] = { i, x, y, tower, tentacle, coverage }`.
- Coral Heart: `game.heart = { x, y, r, hp, maxHp, hitT }`.
- Player rail: `y = WORLD.RAIL_Y`, `x ∈ [RAIL_MIN, RAIL_MAX]`.
- The placeholder fakes the tilted camera by squashing y (`TILT = 0.82`) and lifting by z.

### Stop-motion clock

`game.clock` (seconds, pauses with the game). For the 12 fps claymation feel, quantize
**animation** time (`Math.floor(clock * SIM.ANIM_FPS) / SIM.ANIM_FPS`) but keep positions
smooth so gameplay stays readable. `settings.stopMotion` toggles it.

### What to draw (all read-only)

| Collection | Useful fields |
|---|---|
| `game.enemies` (`alive`) | `type` (jelly, jellyMini, crab, kraken, puffer, urchin, eel, octoMini, starMinion, boss), `bossId` (chef, sharky, queen, kitty), `x y z angle dir r baseR speed hp maxHp shield maxShield minus sad cracked slowT stunT heldT hitT carry anim state phase exposedT laps` |
| `game.towers` | `type level stats.name x y` (socket), `sx sy` (body, moves during shark charges), `aim fireT hp maxHp plusT grabT zapT blindT covered inflate state` |
| `game.projectiles` | `kind` (minus, plus, bubble, dart, ink, star, ministar), `x y z vx vy r leg t` |
| `game.strikes` | enemy attacks in flight: `kind` (ink, spark, star, swipe), `x y z`, landing `tx ty r`, progress `t/dur`, `hitsPlayer` (draw a landing telegraph!) |
| `game.pickups` | sinking shells: `x y landed t` |
| `game.tentacles` | Kraken Kitty tentacles on sockets: `x y hp maxHp hitT` |
| `game.player` | `x y vx alive deadT invulnT hearts meter shootT plusShootT skin` |
| `game.boss` | the live boss or `null` (chef hat x: `chefHatX(e)` from `core/bosses.js`) |
| `view` | `focusSocket` (highlighted socket or −1), `previewType` (tower type whose range to preview) |

Boss state hints: Sharky `state` 1 is wind-up and 2 is charging. Queen `state` 0 is closed and 1 is
open. Kitty `shield > 0` means the purr shield is up, and `exposedT > 0` means she's exposed.
Puffer Pal `state` 1 means inflating.

### Events (for VFX / SFX)

Each event is `{ type, x, y, a, b, s, ref }` (see `core/events.js`). Emitted types:

`phase pause resume wave_start wave_end victory defeat fork capsule capsule_skip denied`
`shoot_minus shoot_plus minus_hit hit kill split sad crack shield_pop inflate explode leak heart_hit`
`plus_tower plus_heart plus_enemy plus_miss pickup player_hit player_respawn meter_empty steal recover crab_escape`
`tower_place tower_upgrade tower_sell tower_fire tower_hit tower_broken tower_revived tower_unlocked tower_inflate tower_explode tower_spat`
`shark_charge chomp ink_splash tentacle_grab pulse pinch_steal grab zap spark strike_land reef_wash buy_upgrade buy_unlock`
`boss_spawn boss_phase boss_windup boss_charge boss_stunned boss_open boss_close boss_exposed boss_swipe boss_throw boss_summon boss_lap boss_defeat eaten weak_hit purr tentacle tentacle_hit tentacle_break`

`hit.b` is the damage source (0 tower, 1 Minus, 2 Plus, 3 shark, 4 star, 5 held, 6 blast).
`ref` is only valid during the frame it was emitted.

### UI and audio

- The HUD and menus are plain DOM with stable ids and classes (`#hud-shells`, `#meter-fill`,
  `.item.focus`, `.panel.modal`, `.panel.bar`, …). Restyle them in `css/style.css`.
- `audio.js` maps the same events to synthesized voices. To use real samples, replace
  `pop / boing / marimba / pluck / strum / noise` or the per-event cases.

## Balance tooling

`tools/bot.mjs` is a four-tier autopilot (`idle` = towers only, `sloppy` ≈ an average human,
`basic` = perfect Minus aim, `good` = also uses Plus well). Current targets:

- **idle** dies at the first boss (about wave 5): the player's shooting matters.
- **sloppy** wins about 7 of 8 runs, taking real heart damage from wave 11 on, with Kraken
  Kitty as the climax.
- Normal waves last 45–100s; boss waves 1.5–5 min.

Change numbers in `src/config.js`, then re-run `npm run sim` and `npm test`.
