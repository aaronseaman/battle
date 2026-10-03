# Reef Rumble

A glossy underwater **lane runner** for iPhone, built as an installable, offline-capable PWA.
Your school of clownfish swims up a reef road and shoots bubbles on its own.
**You only steer: swipe left or right.**

- **Gates** come in pairs: steer into the one you want. Blue is good (+fish, ×2, fire
  rate, power, a buddy), red is bad (−fish). Shooting a number gate raises its number.
- **Clams** show an HP number and the prize inside. Shoot them open to get the prize;
  swim into a closed one and it crushes fish.
- **Critters** (jellies, crabs, krakens, eels, puffers, urchins) swim at you. Shoot them
  first: each one that reaches the school eats fish.
- **The boss** waits at the end of every level with a big HP number. Shoot it down before
  it reaches you, and dodge its red target circles (Sharky charges down a red lane).
- Your fish count is your health; at 0 the level is lost. Coins carry over between tries
  and buy four upgrades: multi-shot volleys, a bigger starting school, more damage,
  and faster bubbles. Every new save starts with one centered shot; multi-shot upgrades
  permanently unlock up to seven shots per volley.

Levels are endless and get tougher; each one is seeded by its number, so a retry plays
the same road.

The layout and mechanics follow the genre's "pick a gate" runner ads (a squad at the
bottom of a nearly top-down road, numbered things to shoot, two choices side by side);
those are layout references only, and all art is Reef Rumble's own underwater art.

- Vanilla ES modules, **no build step, no dependencies**.
- Deterministic fixed-step simulation (60 Hz) that also runs headless in Node.
- A few µs of simulation per tick; the renderer interpolates for 120 Hz ProMotion.

## Run it

```bash
npm start            # serves on http://localhost:8080 (any static server works)
npm test             # 25 headless simulation tests
npm run sim          # autopilot campaigns: node tools/sim.mjs [runs] [good|sloppy|idle] [levels]
npm run icons        # regenerate PWA icons + iPhone launch screens
node tools/check-art.mjs   # validate delivered sprite sheets against the art manifest
```

`/art-preview.html` plays every delivered sprite animation with anchor crosshairs.

Browser smoke test (Playwright + Chromium): `node tools/smoke.mjs http://localhost:8080/ <screenshot-dir>`.
It starts a level, steers with a real drag, pauses, plays the level out, checks the saved
progress and the offline boot.

## Play / publish

**Live:** https://aaronseaman.github.io/battle/. On iPhone, open it in Safari, tap
**Share → Add to Home Screen**, and launch it from the icon for full-screen, offline play.

Every push to `main` runs `.github/workflows/pages.yml`: tests, art check, then
`node tools/build-site.mjs` builds `_site/` and publishes it to the `gh-pages` branch. The
service-worker cache name is stamped with the commit, so installed copies update on their
next launch.

## Controls

| Action | Touch | Keyboard | Gamepad |
|---|---|---|---|
| Steer | drag / swipe left-right anywhere | ← → / A D | d-pad |
| Menus | tap | arrows + Enter / Space | d-pad + A |
| Pause | ❚❚ | Esc / P | Start |

Dragging is relative: the school moves with your finger from wherever the drag starts
(a little further than the finger, so short thumb swipes cover the road).

## Code

```
index.html  css/style.css  sw.js  manifest.webmanifest
src/
  config.js           ALL tuning: road, school, gates, clams, critters, bosses, levels, upgrades, buddies
  main.js             boot, fixed-timestep loop, drag steering, adaptive render quality
  input.js            keyboard / gamepad / pointer -> actions
  audio.js            procedural WebAudio SFX + music (event driven)
  storage.js          localStorage (progress, settings)
  ui/ui.js            HUD + menus (title, level cleared / lost with upgrades, pause, settings)
  render/renderer.js  Canvas2D road, mostly top-down with mild perspective; sprites scaled by depth
  render/sprites.js   SpriteBank: loads assets/art/manifest.json, draws animated sheet frames
  core/game.js        the simulation: phases, steering, shooting, gates, clams, critters, boss
  core/level.js       seeded level generator
  core/util.js events.js
tools/                bot + sim (balance), tests, smoke test, icon and art tools
```

**Simulation.** `x` runs across the road (0 is the middle, ±150 the edges) and `z` is the
distance ahead of the school; everything comes down the road toward `z = 0`. The road
scrolls at a fixed speed until the boss stops at its distance. Things on the road
(`game.things`) are gate halves, clams, critters and the boss; `game.bullets` are the
school's and buddies' shots; `game.shots` are the boss's thrown attacks (they land on the
school's line after a telegraph). Everything is pooled and the hot loops allocate
nothing. The UI, audio and renderer read the state and an event queue (`gate`, `prize`,
`bite`, `kill`, `clam_crack`, `boss_stage`, `boss_throw`, `strike_land`, `win`, `lose`, …).

**Difficulty.** Critter and clam HP grow with the level and with the position inside it
(every level starts gentle and ramps toward its boss); crowds get bigger; the first gate
of a level never punishes hard. Bots in `tools/bot.mjs`:

- **idle** (never steers) can't clear level 1.
- **sloppy** (≈ a casual player: re-reads the road every few frames, picks the worse gate
  one time in five, dodges half the time) clears about 90% of attempts; fails show up
  from level ~18.
- **good** clears every level tried (1–25).

Change numbers in `src/config.js`, then re-run `npm run sim` and `npm test`.

**iPhone 17.** Portrait only, safe areas around the Dynamic Island and home indicator,
launch screens, the `ambient` audio session (respects the silent switch), haptic ticks on
menu buttons, no pinch / double-tap zoom, pauses when backgrounded, and the canvas stops
redrawing while paused.

## Art

Sprites come from `assets/art/manifest.json` (see [`docs/ART_HANDOFF.md`](docs/ART_HANDOFF.md));
anything missing falls back to a placeholder shape, so art can land piece by piece. The
runner reuses the existing clay art: the player clownfish for the school, `tower.*` for
buddies (and buddy gates), `enemy.*`, `boss.*` (+ the Chef's hat), `proj.*` for shots,
`strike.ink` / `strike.star` for boss throws, `pickup.shell` for clams, and `fx.*` for pops.
