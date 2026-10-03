# Reef Rumble: Clay Coral Defense

A claymation-style **arcade wave shooter**, built as an installable, offline-capable PWA.
You're a tiny clay fish on a left/right rail at the bottom of the reef. Wave after wave,
sea creatures swoop in, line up in a swaying formation, then peel off and **dive** at the
reef, dropping shots on the way. Blast them with **Minus** bubbles, keep your reef
**buddies** (fish, octopus, shark, starfish…) and the Coral Heart going with **Plus**
bubbles, and dodge everything that falls. Between waves: **pick a fork → pick a buddy
capsule → place it → shop → next wave**. A boss arrives every 5th wave; beat Kraken Kitty
on wave 20 to unlock Endless Reef.

This build focuses on **mechanics and performance**, and it's tuned as an **iPhone 17
PWA**. Art arrives as sprite sheets listed in `assets/art/manifest.json`; the renderer
swaps each delivered sprite in and keeps placeholder clay shapes for the rest.
**Artists: start with [`docs/ART_HANDOFF.md`](docs/ART_HANDOFF.md).**

- Vanilla ES modules, **no build step, no dependencies**.
- Deterministic fixed-step simulation (60 Hz) that also runs headless in Node.
- About 10–20 µs of simulation per tick and 1–2 ms per frame with 50+ enemies on screen.

## Run it

```bash
npm start            # serves on http://localhost:8080 (any static server works)
npm test             # 37 headless simulation tests
npm run sim          # autopilot balance runs: node tools/sim.mjs [runs] [idle|sloppy|basic|good] [maxWave]
npm run icons        # regenerate PWA icons + iPhone launch screens
node tools/check-art.mjs            # validate delivered sprite sheets against the art manifest
node tools/make-arena-template.mjs  # regenerate docs/art/arena-template.{svg,png}
```

`/art-preview.html` plays every delivered sprite animation with anchor crosshairs.

Browser smoke test (needs Playwright + Chromium): `node tools/smoke.mjs http://localhost:8080/ <screenshot-dir>`.

The game must be served over HTTP(S) for the service worker and ES modules; opening
`index.html` from disk won't work. Deploys anywhere static (GitHub Pages, Netlify, …),
and all paths are relative so subfolders work.

## Play / publish

**Live:** https://aaronseaman.github.io/battle/. On iPhone, open it in Safari, tap
**Share → Add to Home Screen**, and launch it from the icon for full-screen, offline play.

- Every push to `main` runs `.github/workflows/pages.yml`. It runs the tests and the art
  check, builds `_site/` with `node tools/build-site.mjs`, and publishes it to the
  `gh-pages` branch. The build stamps the service-worker cache name with the commit, so
  installed copies update on their next launch.
- One-time repository setting: **Settings → Pages → Build and deployment → Deploy from a
  branch → `gh-pages` / (root)**.

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
coral sockets on the reef, ▲ jumps to Shop / Pearls / Start Wave, and Confirm opens a socket.

## Game rules (as implemented)

**A wave.** Squadrons of five swoop in along curves from the top corners and the sides and
settle into a swaying formation (up to 10 × 5) that slowly creeps toward the reef. After a
couple of seconds the dive scheduler starts peeling enemies off, alone or with wingmen. A
diver pops up out of the grid, then accelerates down at the reef while steering toward your
fish (or, for grabbers, a buddy), weaving and dropping shots. If it reaches the reef edge it
**bites the Coral Heart** and loops back in from the top to its slot. More divers go at
once in later waves, dives speed up 45 s into a wave, and the last few stragglers all dive
together. The wave ends when every enemy is popped (or a crab escapes with its loot).

**Player.** Rides the rail at the bottom. Shares one **bubble meter** (100, regenerates
16/s; shell pickups refill it faster).
- **Minus** (cost 3, fires every 0.12 s while held) flies straight up and hits the first
  enemy. It deals damage and adds a Minus stack (−10% speed and −5% armor per stack, max 5).
  At 3 stacks the enemy turns **Sad**: it shrinks, takes +15% damage and drops bonus shells.
  Stacks also crack Sea Urchin shells.
- **Plus** (cost 20) arcs to the nearest buddy that needs help (horizontal distance
  dominates, so your rail position picks the target) or to the Coral Heart. It heals, clears
  grabs/zaps/ink, and grants **Plus Power** for 5s (+20% fire rate, +10% range). On the way
  it passes through enemies for tiny damage and **pops shields**. With a shielded enemy
  directly above you, Plus fires straight at it as a shield-popper.
- 3 hearts. Getting hit by a shot, a lobbed attack or a diver's body (the diver breaks too)
  drops 10% of your shells as pickups and respawns you after 3s (7s when out of hearts).
  Hearts refill every wave. You lose when the **Coral Heart** reaches 0.

**Score.** Every pop scores (divers count double). Pops within 1.6 s of each other build a
combo: +0.1× per pop, up to ×4. Clearing a wave adds 100 × the wave number, a perfect wave
(no reef bites) +1000, and a boss 5000. The high score is kept on the title screen.

**Buddies** (six coral sockets on the reef shelf; build, upgrade and sell only between
waves). They auto-fire upward at whatever is lowest on the reef, divers first. Lv2 is a stat
upgrade; Lv3 is an evolution that needs a pearl unlock. Dropping a capsule onto a buddy of
the same type levels it up for free.

| Buddy | Role | Evolution |
|---|---|---|
| Tropical Fish | cheap rapid homing bubbles | Fish School: triple shot |
| Octopus | ink splash slows groups, tentacle grab holds and squeezes one enemy | DJ Octopus: stun pulse |
| Shark | lunges up through a line of enemies, chomping them; cracks shells | Hammerhead: armor break |
| Starfish | piercing boomerang stars, heals neighbour buddies, stuns charging Sharky | Five-Point: splits into 5 |
| Pufferfish* | blasts divers that swoop close | Mega Puff: knockback |
| Seahorse* | sniper on the toughest enemy anywhere | Sea Dragon: piercing line |
| Crab* | pinches low divers, shreds armor, steals shells | King Crab: 3 targets |

\* unlocked with pearls. The Shark unlocks by beating the wave-5 boss.

**Enemies.** Jellybean Jellyfish (bouncy, drops goo shots, splits into two diving minis),
Clown Crab (dives to steal shells, then flees upward; pop it to get them back), Baby Kraken
(dives at a buddy and grabs it for 3s), Puffer Pal (inflates when hurt, charges your fish
and explodes), Sea Urchin (75% armor until cracked by 3 Minus stacks or a Shark; fires spikes
from the formation), Electric Eel (fast zig-zag dives, zaps buddies, sparks the rail). From
wave 8 some enemies carry bubble shields.

**Bosses** fly in and hover above the formation, swaying. If a fight drags on, every 45 s
the boss **slams the reef** (Coral Heart damage), then comes back faster and slams harder.
- **Wave 5, Chef Octopus.** Ink bombs blind buddies or splat the rail; summons diving mini
  octopi. Minus on the **hat** does 3× damage.
- **Wave 10, Sharky the Teething.** Lines up over a lane (the red stripe) and charges straight
  down it, swallowing the first buddy in the way and ramming your fish. A Starfish star
  mid-charge stuns him. Swallowed buddies are spat back out when he's beaten.
- **Wave 15, Starfish Queen.** Armored (×0.15) while her arms are closed, vulnerable (×1.5)
  while they're open. Plus forces them open. She summons diving star minions.
- **Wave 20, Kraken Kitty.** Tentacles cover buddies and block your Minus shots (only Minus
  breaks them; Plus heals the squeezed buddy). Phase 2 adds paw swipes at the rail and a purr
  shield; Plus pops the shield, which **exposes** her (Minus ×2.5). Phase 3 adds minions.

**Economy.** Shells come from pops, pickups, wave-clear bonuses and bosses; they buy
buddies, upgrades, gun/heart upgrades and Reef Wash (clears buddy debuffs and every enemy
shot on screen). Pearls come from bosses, some forks, and **perfect waves** (no reef bites);
they buy new buddies, evolutions and abilities (Twin Minus, Shell Magnet, Extra Heart, Lucky
Capsule).

**Forks** modify the next wave: Sunny Shallows (+50 shells, enemies +15% speed), Coral Cave
(+1 pearl, +30% HP), Kelp Forest, Jelly Bloom, Rip Current (more meter, more dives),
Treasure Trench, Calm Lagoon, Eel Grotto, Sunken Ship.

**Meta.** Winning unlocks Endless Reef (bosses cycle back as tougher variants) plus the Golden
and Neon fish skins; reaching Endless wave 30 unlocks Galaxy. The run autosaves on every
between-wave screen, and **Continue** resumes from the last one. Saves from the older
tower-defense build (v1.x) aren't resumed.

## Architecture

```
index.html            DOM shell: canvas, HUD, touch buttons, menu panel
css/style.css         all UI styling (placeholder clay look)
sw.js                 offline cache (bump CACHE when shipping changes)
manifest.webmanifest  PWA manifest
src/
  config.js           ALL balance data: formation, dives, buddies, enemies, bosses, waves, forks, shop
  main.js             boot + fixed-timestep loop + adaptive render quality
  input.js            keyboard / gamepad / touch / pointer -> logical actions
  audio.js            procedural WebAudio SFX + tiny music loop (event driven)
  storage.js          localStorage (meta progress, run save, settings)
  ui/ui.js            HUD + every menu (data-driven, keyboard/gamepad/touch navigable)
  render/renderer.js  Canvas2D renderer: sprite art when delivered, placeholder shapes otherwise
  render/sprites.js   SpriteBank: loads assets/art/manifest.json, draws animated sheet frames
assets/art/           sprite sheets + manifest.json (the art contract / checklist)
docs/                 ART_HANDOFF.md, arena template, reference screenshots
art-preview.html      sprite animation gallery for artists
  core/               pure simulation (no DOM): game.js is the entry point
    game.js           phases, commands, save/load, wave flow
    combat.js         damage, armor, shields, Minus stacks, rewards, score
    enemies.js        formation, entry curves, dives, reef bites, abilities, enemy shots ("strikes")
    bosses.js         the four bosses (hover, tells, reef slams), tentacles
    towers.js         buddy targeting + all buddy behaviours
    projectiles.js    player bubbles + buddy shots
    player.js         rail movement, meter, firing, pickups
    waves.js          squadron generation, dive scheduler, difficulty curve
    grid.js events.js entities.js util.js
tools/                sim + bot (balance), tests, smoke test, icon generator
```

**iPhone 17 / iOS.**
- Launch screens for the iPhone 17 family (and older sizes); safe areas around the Dynamic
  Island and home indicator; a portrait lock screen.
- Audio unlocks on iOS gestures and uses the `ambient` audio session (respects the silent
  switch and mixes with your music). It recovers after calls or app switches.
- Haptic ticks on touch buttons (iOS 18+ switch technique, Vibration API on Android).
- Pinch and double-tap zoom are blocked. An Add-to-Home-Screen hint shows in Safari, and
  persistent storage is requested.
- The canvas stops redrawing while paused (battery).
- Rendering interpolates between 60 Hz sim ticks, so motion stays smooth at 120 Hz
  ProMotion, 30 Hz Low Power Mode, or with uneven frame pacing.

**Performance design.** Entities are pooled, and every field is initialized in `reset()`,
so each type keeps one hidden class and the hot loops allocate nothing. A uniform spatial
grid (rebuilt each tick) handles every range and collision query. Enemy shots share the
pooled strike list. The fixed 60 Hz step can run up to 8
steps per frame, and the backlog is dropped instead of spiralling. Events go through a
preallocated ring (`EventQueue`) instead of callbacks. The renderer caches the static
arena to an offscreen canvas, caps particles, and drops to 0.75× DPR with fewer particles
if frames run slow. Combat pauses automatically when the tab is hidden.

## Hand-off: adding the claymation graphics

**The supported path is sprite sheets plus the manifest; see `docs/ART_HANDOFF.md`.** No
code is needed.

Everything visual lives in `src/render/`, `css/style.css` and `src/audio.js`. The simulation
never reads from them, so a completely different renderer (Three.js, PixiJS, …) can also
replace `renderer.js` if it honours the contract below.

### Renderer contract

`main.js` creates `new Renderer(canvas, game, view, settings, spriteBank)` and calls:

| Method | When |
|---|---|
| `resize()` | the canvas changed size (ResizeObserver) |
| `setInsets({ top, bottom })` | CSS px to keep clear for HUD / touch buttons |
| `setQuality(q)` | 1 or 0.5 (auto-lowered when frames are slow) |
| `consume(eventQueue)` | once per frame, **before** the queue is cleared, to spawn VFX |
| `render(frameDt, alpha)` | once per frame (skipped while paused); `alpha` = 0..1 progress between sim ticks |
| `onArtLoaded()` | sprites finished loading |
| `screenToWorld(px, py)` → `{x, y}` | CSS px → world (used to tap sockets / drag the fish) |

It may also expose `particles` (array, only its `.length` is read by the debug overlay)
and `quality`.

### World space

- A flat plane: `WORLD.W × WORLD.H` = 800 × 1080 units, **x right, y down** (toward the
  player). For 3D, map `(x, y) → (x, 0, y)` and use an entity's `z` as height.
- The formation lives around y 150–550 (`game.formation` = `{ x, y, t, descend }`; slot
  positions via `slotPos(game, slot, out)` in `core/enemies.js`). Divers that reach
  `WORLD.REEF_Y` (1000) bite the reef. Enemies re-enter from y −90 (above the top edge).
- Sockets: `game.sockets[i] = { i, x, y, tower, tentacle }`, six on the reef shelf at y 935.
- Coral Heart: `game.heart = { x, y, r, hp, maxHp, hitT }`.
- Player rail: `y = WORLD.RAIL_Y`, `x ∈ [RAIL_MIN, RAIL_MAX]`.
- The placeholder fakes the tilted camera by squashing y (`TILT = 0.82`) and lifting by z.

### Interpolation

Moving entities carry their previous-tick position: `px, py` (projectiles and strikes also
`pz`; buddy bodies `psx, psy`; the player `px`). Draw `prev + (cur − prev) × alpha` for
smooth motion on any refresh rate.

### Stop-motion clock

`game.clock` (seconds, pauses with the game). For the 12 fps claymation feel, quantize
**animation** time (`Math.floor(clock * SIM.ANIM_FPS) / SIM.ANIM_FPS`) but keep positions
smooth so gameplay stays readable. `settings.stopMotion` toggles it.

### What to draw (all read-only)

Buddies are called towers in the code and the event names (`game.towers`, `tower_fire`, …),
a leftover from the game's tower-defense prototype.

| Collection | Useful fields |
|---|---|
| `game.enemies` (`alive`) | `type` (jelly, jellyMini, crab, kraken, puffer, urchin, eel, octoMini, starMinion, boss), `bossId` (chef, sharky, queen, kitty), `mode` (`MODE` in `core/entities.js`: 0 enter, 1 formation, 2 dive, 3 return, 4 flee), `x y z vx vy angle r baseR speed hp maxHp shield maxShield minus sad cracked slowT stunT heldT hitT carry anim state phase exposedT laps` |
| `game.towers` (buddies) | `type level stats.name x y` (socket), `sx sy` (body, moves during shark lunges), `aim fireT hp maxHp plusT grabT zapT blindT covered inflate state` |
| `game.projectiles` | `kind` (minus, plus, bubble, dart, ink, star, ministar), `x y z vx vy r leg t` |
| `game.strikes` | enemy attacks in flight. `bullet` ones (`kind` drop, spike) fly straight with `vx vy`; lobbed ones (`kind` ink, spark, star, swipe) land at `tx ty r` after `t/dur` (draw a landing telegraph when `hitsPlayer`!) |
| `game.pickups` | sinking shells: `x y landed t` |
| `game.tentacles` | Kraken Kitty tentacles on sockets: `x y hp maxHp hitT` |
| `game.player` | `x y vx alive deadT invulnT hearts meter shootT plusShootT skin` |
| `game.boss` | the live boss or `null` (chef hat x: `chefHatX(e)` from `core/bosses.js`) |
| `game.score`, `game.combo` | score and the current combo count |
| `view` | `focusSocket` (highlighted socket or −1), `previewType` (buddy type whose range to preview) |

Boss state hints: Sharky `state` 1 is wind-up (lane at `tx`), 2 is charging down it, 3 is
swimming back up. Queen `state` 0 is closed and 1 is open. Kitty `shield > 0` means the purr shield is up, and `exposedT > 0` means she's exposed.
Puffer Pal `state` 1 means inflating.

### Events (for VFX / SFX)

Each event is `{ type, x, y, a, b, s, ref }` (see `core/events.js`). Emitted types:

`phase pause resume wave_start wave_end victory defeat fork capsule capsule_skip denied`
`shoot_minus shoot_plus minus_hit hit kill score split sad crack shield_pop inflate explode dive enemy_shot crash leak heart_hit`
`plus_tower plus_heart plus_enemy plus_miss pickup player_hit player_respawn meter_empty steal recover crab_escape`
`tower_place tower_upgrade tower_sell tower_fire tower_hit tower_broken tower_revived tower_unlocked tower_inflate tower_explode tower_spat`
`shark_charge chomp ink_splash tentacle_grab pulse pinch_steal grab zap spark strike_land reef_wash buy_upgrade buy_unlock`
`boss_spawn boss_phase boss_windup boss_charge boss_stunned boss_open boss_close boss_exposed boss_swipe boss_throw boss_summon boss_slam_warn boss_lap boss_defeat eaten weak_hit purr tentacle tentacle_hit tentacle_break`

`leak` is a diver biting the reef; `boss_lap` is a boss reef slam. `score.a` is the points
for a pop and `score.b` the combo count (`score.s` is `dive` or `boss` for the bigger ones).

`hit.b` is the damage source (0 buddy, 1 Minus, 2 Plus, 3 shark, 4 star, 5 held, 6 blast).
`ref` is only valid during the frame it was emitted.

### UI and audio

- The HUD and menus are plain DOM with stable ids and classes (`#hud-shells`, `#meter-fill`,
  `.item.focus`, `.panel.modal`, `.panel.bar`, …). Restyle them in `css/style.css`.
- `audio.js` maps the same events to synthesized voices. To use real samples, replace
  `pop / boing / marimba / pluck / strum / noise` or the per-event cases.

## Balance tooling

`tools/bot.mjs` is a four-tier autopilot (`idle` = never moves or shoots, buddies only;
`sloppy` ≈ an average human: no leading, fires ~60% of the time, misses a third of its
dodges and never reads dives; `basic` = leads its shots and dodges shots and divers;
`good` = also uses Plus well). Current targets:

- **idle** loses wave 1: in a shooter the fish is the main weapon.
- **sloppy** wins about 3 runs in 4. Kraken Kitty is the climax (a 2–3 minute fight with
  reef slams), and it takes real reef damage there.
- **basic** and **good** win nearly every run; good finishes with the Coral Heart near full.
- Normal waves last 15–40s; boss waves 30s–3 min.

Change numbers in `src/config.js`, then re-run `npm run sim` and `npm test`.
